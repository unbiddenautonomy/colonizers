import type { Action, ActionDef, CornerId, Ctx, Phase, Piece } from '@colonizers/engine';
import { ARMY, MAX_WALLS, UNIT_LIMIT, UNITS, type Unit } from './constants.ts';
import { armyAt, cornerOf, unitCount, unitsInPlay, unitsOf, wallsOf } from './rules.ts';

/**
 * The Cities & Knights progress cards that speak of knights, read for units:
 *
 * - Warlord: muster a free infantry at one of your buildings.
 * - Smith: step one of your units up a level (infantry to cavalry, cavalry to
 *   artillery), or muster a free infantry.
 * - Intrigue: take a rival's infantry off a corner one of your roads or ships
 *   touches.
 * - Deserter: a rival gives up a unit of their choice, and you muster one of
 *   the same level (or the best below it you have left).
 * - Engineer: a free Soldiers & Armies wall.
 *
 * The cards keep their Cities & Knights steps; only the moves inside them change.
 */

function action<T>(def: ActionDef<Action & T>): ActionDef {
  return def as unknown as ActionDef;
}

const MAIN: Phase = { id: 'main' };
const UNIT_CARDS = ['warlord', 'smith', 'intrigue', 'deserter', 'engineer'];
const STEP_UP: Partial<Record<Unit, Unit>> = { infantry: 'cavalry', cavalry: 'artillery' };

interface Step extends Phase {
  returnTo: Phase;
}

const step = (ctx: Ctx) => ctx.state.phase as unknown as Step;
const back = (ctx: Ctx) => ctx.setPhase(step(ctx).returnTo ?? MAIN);
const onlyActive = (ctx: Ctx, a: Action) => (a.player === ctx.active ? null : 'Not your turn');
const isUnit = (u: unknown): u is Unit => (UNITS as readonly unknown[]).includes(u);

const holds = (ctx: Ctx, seat: number, card: string) =>
  Object.entries(ctx.player(seat).held).some(
    ([deck, cards]) => deck !== 'dev' && cards.some((c) => c.card === card),
  );

const left = (ctx: Ctx, seat: number, unit: Unit) =>
  unitsInPlay(ctx, seat, unit) < UNIT_LIMIT[unit];

/** Your buildings where a unit can muster (no rival army on them). */
export function musterCorners(ctx: Ctx, seat: number): CornerId[] {
  return ctx
    .piecesOf(seat)
    .filter((p) => ctx.registry.pieceTypes[p.type]?.building && p.at.kind === 'corner')
    .map((p) => cornerOf(p) as CornerId)
    .filter((c) => {
      const there = armyAt(ctx, c);
      return !there || there.owner === seat;
    });
}

function muster(ctx: Ctx, seat: number, unit: Unit, corner: CornerId): void {
  const there = armyAt(ctx, corner);
  if (there) there.props[unit] = unitsOf(there)[unit] + 1;
  else ctx.place(ARMY, seat, { kind: 'corner', id: corner }, { [unit]: 1 });
  ctx.emit({ type: 'unitBought', player: seat, unit, at: corner, free: true });
}

/** The unit steps a player's armies can take: one level up, with the higher level not used up. */
export function stepUps(ctx: Ctx, seat: number): { army: string; unit: Unit }[] {
  return ctx
    .piecesOf(seat, ARMY)
    .flatMap((army) =>
      (['infantry', 'cavalry'] as const)
        .filter((u) => unitsOf(army)[u] > 0 && left(ctx, seat, STEP_UP[u] as Unit))
        .map((unit) => ({ army: army.id, unit })),
    );
}

/** Rival armies with infantry on a corner one of the player's roads or ships touches. */
export function intrigueArmies(ctx: Ctx, seat: number): Piece[] {
  return Object.values(ctx.state.pieces).filter((p) => {
    if (p.type !== ARMY || p.owner === seat || p.owner === null) return false;
    const c = cornerOf(p);
    if (!c || unitsOf(p).infantry <= 0) return false;
    return (ctx.geometry.cornerEdges.get(c) ?? []).some((e) =>
      ctx
        .piecesAt({ kind: 'edge', id: e })
        .some((r) => r.owner === seat && !!ctx.registry.pieceTypes[r.type]?.route),
    );
  });
}

/** Your cities that can take another wall. */
function wallCorners(ctx: Ctx, seat: number): CornerId[] {
  return ctx
    .piecesOf(seat)
    .filter(
      (p) =>
        p.at.kind === 'corner' &&
        ctx.registry.pieceTypes[p.type]?.building &&
        p.type !== 'settlement' &&
        wallsOf(p) < MAX_WALLS,
    )
    .map((p) => cornerOf(p) as CornerId);
}

/** The level a deserter joins at: the same, or the best below it still in the box. */
function deserterUnit(ctx: Ctx, seat: number, unit: Unit): Unit | null {
  for (let i = UNITS.indexOf(unit); i >= 0; i--) {
    const u = UNITS[i] as Unit;
    if (left(ctx, seat, u)) return u;
  }
  return null;
}

function unitCardBlock(ctx: Ctx, a: Action & { card: string; target?: unknown }): string | null {
  const err = onlyActive(ctx, a);
  if (err) return err;
  if (!holds(ctx, a.player, a.card)) return 'You do not hold that card';
  if (ctx.state.phase.id !== 'main') return 'Progress cards are played after rolling';
  const seat = a.player;
  const freeInfantry = left(ctx, seat, 'infantry') && musterCorners(ctx, seat).length > 0;
  switch (a.card) {
    case 'warlord':
      return freeInfantry ? null : 'There is no infantry left, or nowhere to muster it';
    case 'smith':
      return freeInfantry || stepUps(ctx, seat).length ? null : 'You have no unit to step up';
    case 'intrigue':
      return intrigueArmies(ctx, seat).length ? null : 'No rival infantry stands on your roads';
    case 'deserter': {
      const t = a.target;
      if (!Number.isInteger(t) || t === seat || !ctx.state.players[t as number])
        return 'Pick another player';
      return ctx.piecesOf(t as number, ARMY).length ? null : 'That player has no units';
    }
    case 'engineer':
      return wallCorners(ctx, seat).length ? null : 'You have no city that can take a wall';
    default:
      return null;
  }
}

const playUnitCards = (prev: ActionDef): ActionDef => ({
  ...prev,
  check: (ctx, a) =>
    UNIT_CARDS.includes(a.card as string)
      ? unitCardBlock(ctx, a as Action & { card: string })
      : prev.check(ctx, a),
  apply(ctx, a) {
    prev.apply(ctx, a);
    // Warlord readies knights in Cities & Knights; here it musters an infantry.
    if (a.card === 'warlord') ctx.setPhase({ id: 'freeUnit', unit: 'infantry', returnTo: MAIN });
  },
});

const placeFreeUnit = action<{ corner: CornerId }>({
  phases: ['freeUnit', 'smith', 'placeDeserterUnit'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    const unit = (ctx.state.phase.unit as Unit | undefined) ?? 'infantry';
    if (!left(ctx, a.player, unit)) return `No ${unit} left`;
    return musterCorners(ctx, a.player).includes(a.corner)
      ? null
      : 'Units muster at one of your settlements or cities';
  },
  apply(ctx, a) {
    muster(ctx, a.player, (ctx.state.phase.unit as Unit | undefined) ?? 'infantry', a.corner);
    back(ctx);
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    const unit = (ctx.state.phase.unit as Unit | undefined) ?? 'infantry';
    if (!left(ctx, player, unit)) return [];
    return musterCorners(ctx, player).map((corner) => ({ type: 'placeFreeUnit', player, corner }));
  },
});

/** Smith: one unit a level up. */
const stepUpUnit = action<{ army: string; unit: Unit }>({
  phases: ['smith'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    return stepUps(ctx, a.player).some((s) => s.army === a.army && s.unit === a.unit)
      ? null
      : 'That unit can not step up';
  },
  apply(ctx, a) {
    const army = ctx.state.pieces[a.army] as Piece;
    const u = unitsOf(army);
    const to = STEP_UP[a.unit] as Unit;
    army.props[a.unit] = u[a.unit] - 1;
    army.props[to] = u[to] + 1;
    ctx.emit({ type: 'unitSteppedUp', player: a.player, unit: a.unit, to, at: cornerOf(army) });
    back(ctx);
  },
  enumerate: (ctx, player) =>
    player === ctx.active
      ? stepUps(ctx, player).map((s) => ({ type: 'stepUpUnit', player, ...s }))
      : [],
});

const intrigueUnit = action<{ army: string }>({
  phases: ['intrigue'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    return intrigueArmies(ctx, a.player).some((p) => p.id === a.army)
      ? null
      : 'Pick a rival army with infantry on one of your roads';
  },
  apply(ctx, a) {
    const army = ctx.state.pieces[a.army] as Piece;
    const at = cornerOf(army);
    army.props.infantry = unitsOf(army).infantry - 1;
    if (unitCount(army) === 0) ctx.remove(army);
    ctx.emit({ type: 'unitIntrigue', player: a.player, victim: army.owner, at });
    back(ctx);
  },
  enumerate: (ctx, player) =>
    player === ctx.active
      ? intrigueArmies(ctx, player).map((p) => ({ type: 'intrigueUnit', player, army: p.id }))
      : [],
});

interface DesertPhase extends Step {
  owed: Record<number, number>;
  by: number;
}

const owesUnit = (ctx: Ctx, seat: number) =>
  ctx.state.phase.id === 'desertKnight' &&
  !!(ctx.state.phase as unknown as DesertPhase).owed?.[seat];

/** Deserter: the rival picks the unit that leaves them. */
const desertUnit = action<{ army: string; unit: Unit }>({
  phases: ['desertKnight'],
  check(ctx, a) {
    if (!owesUnit(ctx, a.player)) return 'You do not give up a unit';
    const army = typeof a.army === 'string' ? ctx.state.pieces[a.army] : undefined;
    if (!army || army.type !== ARMY || army.owner !== a.player) return 'Pick one of your armies';
    if (!isUnit(a.unit) || unitsOf(army)[a.unit] <= 0) return 'That army has no such unit';
    return null;
  },
  apply(ctx, a) {
    const ph = ctx.state.phase as unknown as DesertPhase;
    const army = ctx.state.pieces[a.army] as Piece;
    const at = cornerOf(army);
    army.props[a.unit] = unitsOf(army)[a.unit] - 1;
    if (unitCount(army) === 0) ctx.remove(army);
    ctx.emit({ type: 'unitDeserted', player: a.player, to: ph.by, unit: a.unit, at });
    const unit = deserterUnit(ctx, ph.by, a.unit);
    if (unit && musterCorners(ctx, ph.by).length)
      ctx.setPhase({ id: 'placeDeserterUnit', unit, returnTo: ph.returnTo });
    else ctx.setPhase(ph.returnTo);
  },
  enumerate(ctx, player) {
    if (!owesUnit(ctx, player)) return [];
    return ctx.piecesOf(player, ARMY).flatMap((army) =>
      UNITS.filter((u) => unitsOf(army)[u] > 0).map((unit) => ({
        type: 'desertUnit',
        player,
        army: army.id,
        unit,
      })),
    );
  },
});

/** Engineer: a free wall, on our walls. */
const freeCityWall = (prev: ActionDef): ActionDef => ({
  ...prev,
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    return wallCorners(ctx, a.player).includes(a.corner as CornerId)
      ? null
      : `Walls go around one of your cities, at most ${MAX_WALLS} to a city`;
  },
  apply(ctx, a) {
    const b = ctx.buildingAt(a.corner as CornerId) as Piece;
    b.props.walls = wallsOf(b) + 1;
    ctx.emit({ type: 'wallBuilt', player: a.player, at: a.corner, free: true });
    back(ctx);
  },
  enumerate: (ctx, player) =>
    player === ctx.active
      ? wallCorners(ctx, player).map((corner) => ({ type: 'placeFreeWall', player, corner }))
      : [],
});

const noKnights = (prev: ActionDef): ActionDef => ({
  ...prev,
  check: () => 'Soldiers & Armies has units instead of knights',
  enumerate: () => [],
});

export const progressUnitActions: Record<string, ActionDef> = {
  placeFreeUnit,
  stepUpUnit,
  intrigueUnit,
  desertUnit,
};

export const progressUnitWraps: Record<string, (prev: ActionDef) => ActionDef> = {
  playProgress: playUnitCards,
  placeFreeWall: freeCityWall,
  smithPromote: noKnights,
  intrigueKnight: noKnights,
  desertKnight: noKnights,
  placeDeserterKnight: noKnights,
};
