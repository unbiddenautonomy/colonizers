import type { Action, ActionDef, Ctx, EdgeId, HexId, Piece } from '@colonizers/engine';
import { RESOURCES } from '@colonizers/module-base';
import {
  action,
  BOOST_MOVES,
  canAfford,
  cargoOf,
  cargoRoom,
  CARGO_SIZE,
  epData,
  GOLD,
  harborBeside,
  hasPirate,
  hidden,
  onlyActive,
  ownShip,
  pirateShip,
  SHIP_MOVES,
  toSail,
  type Mission,
} from './rules.ts';

/**
 * Pirate Lairs: crews sail out to the gold fields and storm the lairs on
 * them, and the pirate ship roams the sea on a 7.
 *
 * Our version:
 * - A crew costs 1 ore and 1 wool and goes on your harbor or a ship beside
 *   it, like a settler (two fit in a hold). You can have 6 out at a time.
 * - A ship beside a lair's gold field lands its crews there. The third crew
 *   on a lair captures it: everyone with crews there takes 2 gold and moves
 *   1 step on the lair mission track; a die roll plus their crews names a
 *   hero, who moves 1 step more. All the crews go back to the supply.
 * - Each mission step is worth 1 point. A captured gold field pays 2 gold
 *   to each building beside it when its number is rolled.
 * - On a 7, the roller moves the pirate ship to a sea hex away from the
 *   home island and robs a player with a ship beside it (1 gold if they
 *   have no resources). Sailing onto an edge beside the pirate costs 1 gold.
 *   A ship beside the pirate that has not moved this turn can chase it off
 *   the board on a roll of 6.
 */

export const LAIR_CREWS = 3;
export const CREWS = 6;
export const CAPTURE_GOLD = 2;
export const CAPTURED_FIELD_GOLD = 2;
export const CHASE_ROLL = 6;

export function missionSteps(ctx: Ctx, seat: number, mission?: Mission): number {
  const m = epData(ctx).missions[seat] ?? {};
  if (mission) return m[mission] ?? 0;
  return Object.values(m).reduce((s, n) => s + (n ?? 0), 0);
}

function step(ctx: Ctx, seat: number, mission: Mission, n: number): void {
  const m = (epData(ctx).missions[seat] ??= {});
  m[mission] = (m[mission] ?? 0) + n;
}

/** Crews this player has on ships, docks and lairs. */
export function crewsOut(ctx: Ctx, seat: number): number {
  let n = 0;
  for (const p of ctx.piecesOf(seat))
    if (p.type === 'ship' || p.type === 'harbor')
      n += cargoOf(p).filter((c) => c === 'crew').length;
  for (const crews of Object.values(epData(ctx).lairs)) n += crews[seat] ?? 0;
  return n;
}

/** An uncaptured lair on a gold field everyone can see. */
export function openLair(ctx: Ctx, hex: HexId): boolean {
  return !!epData(ctx).lairs[hex] && !hidden(ctx, hex);
}

/** Lairs on either side of a ship's edge. */
export function lairsBeside(ctx: Ctx, ship: Piece): HexId[] {
  if (ship.at.kind !== 'edge') return [];
  return (ctx.geometry.edgeHexes.get(ship.at.id) ?? []).filter((h) => openLair(ctx, h));
}

export function lairCrews(ctx: Ctx, hex: HexId): number {
  return Object.values(epData(ctx).lairs[hex] ?? {}).reduce((s, n) => s + n, 0);
}

const buildCrew = action<{ at: string }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a) ?? canAfford(ctx, a.player, 'crew');
    if (err) return err;
    if (crewsOut(ctx, a.player) >= CREWS) return 'No crews left';
    const p = ctx.state.pieces[a.at];
    if (!p || p.owner !== a.player) return 'Put the crew on your harbor or ship';
    if (p.type === 'ship') {
      if (p.at.kind !== 'edge' || !harborBeside(ctx, a.player, p.at.id))
        return 'The ship must be beside one of your harbor settlements';
    } else if (p.type !== 'harbor') return 'Put the crew on your harbor or ship';
    if (cargoRoom(p) < CARGO_SIZE.crew!) return 'There is no room for a crew there';
    return null;
  },
  apply(ctx, a) {
    ctx.pay(a.player, ctx.cost('crew', a.player));
    const p = ctx.state.pieces[a.at]!;
    p.props.cargo = [...cargoOf(p), 'crew'];
    ctx.emit({ type: 'built', player: a.player, piece: 'crew', at: a.at });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || !ctx.has(player, ctx.cost('crew', player))) return [];
    return ctx
      .piecesOf(player)
      .filter((p) => p.type === 'harbor' || p.type === 'ship')
      .map((p) => ({ type: 'buildCrew', player, at: p.id }));
  },
});

function capture(ctx: Ctx, hex: HexId, lander: number): void {
  const d = epData(ctx);
  const crews = d.lairs[hex] ?? {};
  const seats = Object.keys(crews)
    .map(Number)
    .filter((s) => (crews[s] ?? 0) > 0);
  // Everyone who took part: gold and a step on the mission track.
  for (const s of seats) {
    if (ctx.bankHas({ [GOLD]: CAPTURE_GOLD })) ctx.grant(s, { [GOLD]: CAPTURE_GOLD });
    step(ctx, s, 'lairs', 1);
  }
  // The hero: a die roll plus their crews; the lander wins ties.
  const rolls: Record<number, number> = {};
  for (const s of seats) rolls[s] = ctx.rng.int(1, 6) + (crews[s] ?? 0);
  const best = Math.max(...Object.values(rolls));
  const tied = seats.filter((s) => rolls[s] === best);
  const hero = tied.includes(lander) ? lander : tied[0]!;
  step(ctx, hero, 'lairs', 1);
  delete d.lairs[hex];
  d.captured.push(hex);
  ctx.emit({ type: 'lairCaptured', hex, players: seats, hero, rolls, gold: CAPTURE_GOLD });
}

const landCrew = action<{ ship: string; hex: HexId }>({
  phases: ['main', 'sail'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    const ship = ownShip(ctx, a.player, a.ship);
    if (typeof ship === 'string') return ship;
    if (!cargoOf(ship).includes('crew')) return 'The ship has no crew aboard';
    if (!lairsBeside(ctx, ship).includes(a.hex)) return 'The ship must be beside a pirate lair';
    return null;
  },
  apply(ctx, a) {
    const ship = ctx.state.pieces[a.ship]!;
    const cargo = cargoOf(ship);
    const crews = cargo.filter((c) => c === 'crew').length;
    // Only as many as the lair still needs go ashore.
    const landed = Math.min(crews, LAIR_CREWS - lairCrews(ctx, a.hex));
    let left = landed;
    ship.props.cargo = cargo.filter((c) => c !== 'crew' || left-- <= 0);
    const lair = epData(ctx).lairs[a.hex]!;
    lair[a.player] = (lair[a.player] ?? 0) + landed;
    ctx.emit({ type: 'crewLanded', player: a.player, hex: a.hex, crews: landed });
    if (lairCrews(ctx, a.hex) >= LAIR_CREWS) capture(ctx, a.hex, a.player);
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    const out: Action[] = [];
    for (const ship of ctx.piecesOf(player, 'ship'))
      if (cargoOf(ship).includes('crew'))
        for (const hex of lairsBeside(ctx, ship))
          out.push({ type: 'landCrew', player, ship: ship.id, hex });
    return out;
  },
});

// ---- The pirate ship ----

/** Sea hexes the pirate can go to: open sea, away from the home island. */
export function pirateHexes(ctx: Ctx): HexId[] {
  const home = new Set(ctx.setting<HexId[] | null>('setupHexes') ?? []);
  const at = pirateShip(ctx)?.at;
  return (Object.keys(ctx.state.hexes) as HexId[]).filter((h) => {
    if (!ctx.isSea(h) || (at?.kind === 'hex' && at.id === h)) return false;
    return !(ctx.geometry.hexNeighbours.get(h) ?? []).some((n) => home.has(n));
  });
}

/** Players with a ship beside a hex, other than the thief. */
export function shipsBesideHex(ctx: Ctx, hex: HexId, thief: number): number[] {
  const seats = new Set<number>();
  for (const e of ctx.geometry.hexEdges.get(hex) ?? [])
    for (const p of ctx.piecesAt({ kind: 'edge', id: e }))
      if (p.type === 'ship' && p.owner !== null && p.owner !== thief) seats.add(p.owner);
  return [...seats].sort((a, b) => a - b);
}

/** The pirate takes a random resource, or 1 gold from someone with none. */
export function pirateSteal(ctx: Ctx, thief: number, victim: number): void {
  const hand = ctx.player(victim).hand;
  const cards = RESOURCES.flatMap((r) => Array<string>(hand[r] ?? 0).fill(r));
  const card = cards.length
    ? cards[ctx.rng.int(0, cards.length - 1)]!
    : (hand[GOLD] ?? 0) > 0
      ? GOLD
      : null;
  if (!card) return;
  ctx.transfer(victim, thief, { [card]: 1 });
  ctx.emit({
    type: 'stole',
    thief,
    victim,
    card,
    visibleTo: [thief, victim],
    redacted: { thief, victim },
  });
}

const movePirate = action<{ hex: HexId }>({
  phases: ['moveRobber'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    if (!pirateHexes(ctx).includes(a.hex))
      return 'The pirate ship goes to open sea away from the home island';
    return null;
  },
  apply(ctx, a) {
    const returnTo = (ctx.state.phase.returnTo as string | undefined) ?? 'main';
    const p = pirateShip(ctx);
    if (p) ctx.move(p, { kind: 'hex', id: a.hex });
    else ctx.place('pirate', null, { kind: 'hex', id: a.hex });
    ctx.emit({ type: 'pirateMoved', player: a.player, hex: a.hex });
    const victims = shipsBesideHex(ctx, a.hex, a.player);
    if (victims.length > 1) {
      ctx.setPhase({ id: 'steal', hex: a.hex, candidates: victims, returnTo });
      return;
    }
    if (victims.length === 1) pirateSteal(ctx, a.player, victims[0]!);
    ctx.setPhase({ id: returnTo });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return pirateHexes(ctx).map((hex) => ({ type: 'movePirate', player, hex }));
  },
});

const chasePirate = action<{ ship: string }>({
  phases: ['main', 'sail'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    const ship = ownShip(ctx, a.player, a.ship);
    if (typeof ship === 'string') return ship;
    const at = pirateShip(ctx)?.at;
    if (at?.kind !== 'hex' || ship.at.kind !== 'edge') return 'The pirate ship is not on the board';
    if (!(ctx.geometry.hexEdges.get(at.id) ?? []).includes(ship.at.id))
      return 'Only a ship beside the pirate can chase it';
    if (Number(ship.props.used ?? 0) > 0)
      return 'A ship that has moved this turn can not chase the pirate';
    return null;
  },
  apply(ctx, a) {
    const ship = ctx.state.pieces[a.ship]!;
    toSail(ctx);
    ship.props.used = SHIP_MOVES + BOOST_MOVES;
    const roll = ctx.rng.int(1, 6);
    const chased = roll >= CHASE_ROLL;
    if (chased) ctx.remove(pirateShip(ctx)!);
    ctx.emit({ type: 'pirateChased', player: a.player, roll, chased });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || !pirateShip(ctx)) return [];
    return ctx.piecesOf(player, 'ship').map((s) => ({ type: 'chasePirate', player, ship: s.id }));
  },
});

export const lairActions: Record<string, ActionDef> = {
  buildCrew,
  landCrew,
  movePirate,
  chasePirate,
};

export const lairWraps: Record<string, (prev: ActionDef) => ActionDef> = {
  // With the pirate in the game, a 7 moves the pirate instead of a robber.
  moveRobber: (prev) => ({
    ...prev,
    check: (ctx, a) => (hasPirate(ctx) ? 'Move the pirate ship' : prev.check(ctx, a)),
    enumerate: (ctx, player) => (hasPirate(ctx) ? [] : (prev.enumerate?.(ctx, player) ?? [])),
  }),
  steal: (prev) => ({
    ...prev,
    apply(ctx, a) {
      if (!hasPirate(ctx)) return prev.apply(ctx, a);
      const returnTo = (ctx.state.phase.returnTo as string | undefined) ?? 'main';
      pirateSteal(ctx, a.player, a.from as number);
      ctx.setPhase({ id: returnTo });
    },
  }),
};

/** Edges a ship can land crews from: beside an open lair. */
export function lairEdges(ctx: Ctx): Set<EdgeId> {
  const out = new Set<EdgeId>();
  for (const hex of Object.keys(epData(ctx).lairs) as HexId[])
    if (openLair(ctx, hex)) for (const e of ctx.geometry.hexEdges.get(hex) ?? []) out.add(e);
  return out;
}
