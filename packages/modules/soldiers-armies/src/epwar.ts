import type { Action, ActionDef, Ctx, EdgeId, HexId, Piece } from '@colonizers/engine';
import {
  captureLair,
  cargoOf,
  cargoRoom,
  CARGO_SIZE,
  epData,
  LAIR_CREWS,
  lairsBeside,
  ownShip,
  SETTLERS,
  settlersOut,
} from '@colonizers/module-explorers-pirates';
import { UNIT_STRENGTH, UNITS } from './constants.ts';
import { armyAboard } from './ep.ts';
import { checkDestroyed } from './fate.ts';
import { setTurnFlag, soldiersData, unitsFrom, type Units } from './rules.ts';

/**
 * Soldiers & Armies with Explorers & Pirates, at sea:
 *
 * - **Pirate lairs** fall to units instead of crews. A ship with an army
 *   aboard beside a lair puts the army ashore there. Once the units on a lair
 *   are worth 3 (infantry 1, cavalry 2, artillery 3) it is captured: everyone
 *   with units there takes 2 gold and a mission step, and the hero (a d6 plus
 *   their unit points) a step more, for which one of their units there steps
 *   down. The units then go back aboard the ships that brought them, if those
 *   still have room, or back to the box.
 * - **Sea battles**: a ship with an army aboard can attack a rival ship
 *   carrying something on a neighbouring edge. An army aboard fights as on
 *   land; a settler, fish or spice defends with a d10 and is taken after two
 *   losses. What fits goes onto the winner's ship (a rival settler goes home
 *   and one of yours takes its place); the rest is lost.
 */

export const CARGO_DIE = 10;
export const CARGO_HITS = 2;

function action<T>(def: ActionDef<Action & T>): ActionDef {
  return def as unknown as ActionDef;
}

const onlyActive = (ctx: Ctx, a: Action) => (a.player === ctx.active ? null : 'Not your turn');

const points = (u: Units) => UNITS.reduce((s, k) => s + u[k] * UNIT_STRENGTH[k], 0);
const count = (u: Units) => UNITS.reduce((s, k) => s + u[k], 0);
const best = (u: Units) => (u.artillery ? 12 : u.cavalry ? 10 : u.infantry ? 6 : 0);

/** One step down: the best unit a level, or an infantry off. */
function stepDown(u: Units): Units {
  if (u.artillery) return { ...u, artillery: u.artillery - 1, cavalry: u.cavalry + 1 };
  if (u.cavalry) return { ...u, cavalry: u.cavalry - 1, infantry: u.infantry + 1 };
  return { ...u, infantry: Math.max(0, u.infantry - 1) };
}

function takeArmyOff(ship: Piece): Units {
  const u = unitsFrom(armyAboard(ship));
  delete ship.props.army;
  const cargo = [...cargoOf(ship)];
  cargo.splice(cargo.indexOf('army'), 1);
  ship.props.cargo = cargo;
  return u;
}

function putArmyOn(ship: Piece, u: Units, rest: Record<string, unknown> = {}): void {
  ship.props.army = { ...rest, ...u };
  ship.props.cargo = [...cargoOf(ship), 'army'];
}

// ---- Pirate lairs ----

const landUnits = action<{ ship: string; hex: HexId }>({
  phases: ['main', 'campaign'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    const ship = ownShip(ctx, a.player, a.ship);
    if (typeof ship === 'string') return ship;
    if (!armyAboard(ship)) return 'The ship carries no army';
    return lairsBeside(ctx, ship).includes(a.hex) ? null : 'The ship must be beside a pirate lair';
  },
  apply(ctx, a) {
    const ship = ctx.state.pieces[a.ship] as Piece;
    const u = takeArmyOff(ship);
    const d = soldiersData(ctx);
    const here = ((d.lairUnits ??= {})[a.hex] ??= {});
    const mine = here[String(a.player)];
    const units = mine ? sum(mine.units, u) : u;
    here[String(a.player)] = { units, ship: ship.id };
    // The lair's tally counts unit points, as it counts crews.
    const lair = epData(ctx).lairs[a.hex] as Record<number, number>;
    lair[a.player] = points(units);
    ctx.emit({ type: 'unitsLanded', player: a.player, hex: a.hex, points: points(u) });
    const total = Object.values(lair).reduce((s, n) => s + n, 0);
    if (total >= LAIR_CREWS) capture(ctx, a.hex, a.player);
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return ctx
      .piecesOf(player, 'ship')
      .filter((s) => !!armyAboard(s))
      .flatMap((s) =>
        lairsBeside(ctx, s).map((hex) => ({ type: 'landUnits', player, ship: s.id, hex })),
      );
  },
});

const sum = (x: Units, y: Units): Units => ({
  infantry: x.infantry + y.infantry,
  cavalry: x.cavalry + y.cavalry,
  artillery: x.artillery + y.artillery,
});

function capture(ctx: Ctx, hex: HexId, lander: number): void {
  const hero = captureLair(ctx, hex, lander);
  const d = soldiersData(ctx);
  const here = d.lairUnits?.[hex] ?? {};
  delete d.lairUnits?.[hex];
  for (const [seat, { units, ship }] of Object.entries(here)) {
    const left = Number(seat) === hero ? stepDown(units) : units;
    if (Number(seat) === hero) ctx.emit({ type: 'heroPaid', player: hero, hex });
    if (!count(left)) continue;
    const s = ctx.state.pieces[ship];
    const room = s && s.type === 'ship' && !armyAboard(s) && cargoRoom(s) >= (CARGO_SIZE.army ?? 1);
    if (room) putArmyOn(s, left);
    else ctx.emit({ type: 'unitsHome', player: Number(seat), hex });
  }
}

// ---- Sea battles ----

export interface SeaBattlePhase {
  id: 'seaBattle';
  ship: string;
  target: string;
  defender: number;
  /** Losses the target's cargo has taken. */
  hits: number;
}

const seaBattle = (ctx: Ctx) => ctx.state.phase as unknown as SeaBattlePhase;

const edgeOf = (p: Piece | undefined): EdgeId | null => (p?.at.kind === 'edge' ? p.at.id : null);

/** Rival ships carrying something on an edge next to this ship's. */
export function seaTargets(ctx: Ctx, ship: Piece): Piece[] {
  const e = edgeOf(ship);
  if (!e || !armyAboard(ship)) return [];
  const near = new Set<EdgeId>();
  for (const c of ctx.geometry.edgeCorners.get(e) ?? [])
    for (const n of ctx.geometry.cornerEdges.get(c) ?? []) if (n !== e) near.add(n);
  return Object.values(ctx.state.pieces).filter((p) => {
    const pe = edgeOf(p);
    return (
      p.type === 'ship' &&
      p.owner !== null &&
      p.owner !== ship.owner &&
      !!pe &&
      near.has(pe) &&
      cargoOf(p).length > 0
    );
  });
}

const attackShip = action<{ ship: string; target: string }>({
  phases: ['campaign'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    const ship = ownShip(ctx, a.player, a.ship);
    if (typeof ship === 'string') return ship;
    return seaTargets(ctx, ship).some((t) => t.id === a.target)
      ? null
      : 'Attack a rival ship with cargo next to your ship with an army aboard';
  },
  apply(ctx, a) {
    setTurnFlag(ctx, 'fought');
    const target = ctx.state.pieces[a.target] as Piece;
    const defender = target.owner as number;
    ctx.emit({ type: 'shipAttacked', player: a.player, defender });
    ctx.setPhase({ id: 'seaBattle', ship: a.ship, target: a.target, defender, hits: 0 });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return ctx
      .piecesOf(player, 'ship')
      .flatMap((s) =>
        seaTargets(ctx, s).map((t) => ({ type: 'attackShip', player, ship: s.id, target: t.id })),
      );
  },
});

/** The beaten cargo comes aboard where it fits; a rival settler goes home for one of yours. */
function takeCargo(ctx: Ctx, winner: number, ship: Piece, target: Piece): void {
  const taken: string[] = [];
  for (const c of cargoOf(target).filter((x) => x !== 'army')) {
    const fits = cargoRoom(ship) >= (CARGO_SIZE[c] ?? 1);
    const ok = fits && (c !== 'settler' || settlersOut(ctx, winner) < SETTLERS);
    if (ok) {
      ship.props.cargo = [...cargoOf(ship), c];
      taken.push(c);
    }
  }
  target.props.cargo = cargoOf(target).filter((x) => x === 'army');
  ctx.emit({ type: 'cargoTaken', player: winner, from: target.owner, taken });
}

const seaBattleRoll = action<object>({
  phases: ['seaBattle'],
  check: (ctx, a) => onlyActive(ctx, a),
  apply(ctx, a) {
    const ph = seaBattle(ctx);
    const ship = ctx.state.pieces[ph.ship];
    const target = ctx.state.pieces[ph.target];
    if (!ship || !target || !armyAboard(ship) || !cargoOf(target).length) {
      ctx.setPhase({ id: 'campaign' });
      return;
    }
    const mine = unitsFrom(armyAboard(ship));
    const theirs = armyAboard(target) ? unitsFrom(armyAboard(target)) : null;
    const dice = [best(mine), theirs ? best(theirs) : CARGO_DIE] as const;
    const rolls = [ctx.rng.int(1, dice[0]), ctx.rng.int(1, dice[1])] as const;
    const won = rolls[0] > rolls[1];
    ctx.emit({
      type: 'seaBattleRound',
      player: a.player,
      defender: ph.defender,
      target: theirs ? 'army' : 'cargo',
      dice,
      rolls,
      won,
    });
    let over = false;
    if (!won) {
      const left = stepDown(mine);
      const rest = armyAboard(ship) ?? {};
      takeArmyOff(ship);
      if (count(left)) putArmyOn(ship, left, rest);
      else {
        over = true;
        ctx.emit({ type: 'armyDestroyed', player: a.player, by: ph.defender });
      }
    } else if (theirs) {
      const left = stepDown(theirs);
      const rest = armyAboard(target) ?? {};
      takeArmyOff(target);
      if (count(left)) putArmyOn(target, left, rest);
      else ctx.emit({ type: 'armyDestroyed', player: ph.defender, by: a.player });
      // With the army gone, any other cargo fights on.
      over = !cargoOf(target).length;
    } else if (ph.hits + 1 >= CARGO_HITS) {
      takeCargo(ctx, a.player, ship, target);
      over = true;
    } else ph.hits += 1;
    checkDestroyed(ctx, ph.defender, a.player);
    checkDestroyed(ctx, a.player, ph.defender);
    if (ctx.state.phase.id !== 'seaBattle') return;
    if (over) ctx.setPhase({ id: 'campaign' });
    else ctx.setPhase({ ...ph });
  },
  enumerate: (ctx, player) => (player === ctx.active ? [{ type: 'seaBattleRoll', player }] : []),
});

const seaBattleBreak = action<object>({
  phases: ['seaBattle'],
  check: (ctx, a) => onlyActive(ctx, a),
  apply(ctx, a) {
    ctx.emit({ type: 'seaBattleBroken', player: a.player });
    ctx.setPhase({ id: 'campaign' });
  },
  enumerate: (ctx, player) => (player === ctx.active ? [{ type: 'seaBattleBreak', player }] : []),
});

export const epWarActions: Record<string, ActionDef> = {
  landUnits,
  attackShip,
  seaBattleRoll,
  seaBattleBreak,
};

const unitsInstead = (prev: ActionDef): ActionDef => ({
  ...prev,
  check: () => 'Soldiers & Armies storms the lairs with units instead of crews',
  enumerate: () => [],
});

/** Crews give way to units. */
export const epWarWraps: Record<string, (prev: ActionDef) => ActionDef> = {
  buildCrew: unitsInstead,
  landCrew: unitsInstead,
};
