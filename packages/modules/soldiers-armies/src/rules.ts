import type { CornerId, Ctx, EdgeId, HexId, Piece } from '@colonizers/engine';
import { robber } from '@colonizers/module-base';
import {
  ARMY,
  CITY_DIE,
  FREE_STEPS,
  MODULE_ID,
  SETTLEMENT_DIE,
  UNIT_DIE,
  UNITS,
  type Unit,
} from './constants.ts';

/**
 * Soldiers & Armies' board rules: what an army holds, where it can march,
 * what it can attack, and the dice on both sides.
 */

export interface SoldiersData extends Record<string, unknown> {
  /** The turn the flags below belong to. */
  turn?: number;
  /** The active player bought something this turn (no free development card then). */
  bought?: boolean;
  /** The active player has fought this turn, so their armies can no longer march. */
  fought?: boolean;
  /** The active player has attacked the robber this turn. */
  robberFought?: boolean;
}

export function soldiersData(ctx: Ctx): SoldiersData {
  return ctx.data<SoldiersData>(MODULE_ID);
}

type Flag = 'bought' | 'fought' | 'robberFought';

/** This turn's flag, read without changing the state. */
export function turnFlag(ctx: Ctx, flag: Flag): boolean {
  const d = soldiersData(ctx);
  return d.turn === ctx.state.turn.number && !!d[flag];
}

export function setTurnFlag(ctx: Ctx, flag: Flag): void {
  const d = soldiersData(ctx);
  if (d.turn !== ctx.state.turn.number) {
    d.turn = ctx.state.turn.number;
    d.bought = false;
    d.fought = false;
    d.robberFought = false;
  }
  d[flag] = true;
}

// ---- Armies ----

export type Units = Record<Unit, number>;

export function unitsOf(army: Piece): Units {
  const n = (u: Unit) => (typeof army.props[u] === 'number' ? (army.props[u] as number) : 0);
  return { infantry: n('infantry'), cavalry: n('cavalry'), artillery: n('artillery') };
}

export const unitCount = (army: Piece) => UNITS.reduce((sum, u) => sum + unitsOf(army)[u], 0);

/** Units of one kind a player has on the board, across all their armies. */
export function unitsInPlay(ctx: Ctx, seat: number, unit: Unit): number {
  return ctx.piecesOf(seat, ARMY).reduce((sum, a) => sum + unitsOf(a)[unit], 0);
}

export function armyAt(ctx: Ctx, corner: CornerId): Piece | undefined {
  return ctx.piecesAt({ kind: 'corner', id: corner }).find((p) => p.type === ARMY);
}

export const cornerOf = (p: Piece): CornerId | null => (p.at.kind === 'corner' ? p.at.id : null);

/** An army of someone other than `seat` stands on the corner. */
export function enemyArmyAt(ctx: Ctx, corner: CornerId, seat: number): boolean {
  const a = armyAt(ctx, corner);
  return !!a && a.owner !== seat;
}

/** The die an army rolls: its best unit's. */
export function armyDie(army: Piece): number {
  const u = unitsOf(army);
  if (u.artillery > 0) return UNIT_DIE.artillery;
  if (u.cavalry > 0) return UNIT_DIE.cavalry;
  return UNIT_DIE.infantry;
}

/** A lost round: the best unit steps down a rank, or an infantry leaves. Returns false when the army is gone. */
export function loseUnit(ctx: Ctx, army: Piece): boolean {
  const u = unitsOf(army);
  if (u.artillery > 0) {
    army.props.artillery = u.artillery - 1;
    army.props.cavalry = u.cavalry + 1;
  } else if (u.cavalry > 0) {
    army.props.cavalry = u.cavalry - 1;
    army.props.infantry = u.infantry + 1;
  } else army.props.infantry = Math.max(0, u.infantry - 1);
  if (unitCount(army) > 0) return true;
  ctx.remove(army);
  return false;
}

// ---- Buildings ----

export const wallsOf = (b: Piece) => (typeof b.props.walls === 'number' ? b.props.walls : 0);

/** The die a building defends with, before its walls. */
export function buildingDie(b: Piece): number {
  return b.type === 'settlement' ? SETTLEMENT_DIE : CITY_DIE;
}

// ---- Marching ----

/** Armies march along land edges, and across the sea on anyone's ships. */
export function passable(ctx: Ctx, edge: EdgeId): boolean {
  if (ctx.isLandEdge(edge)) return true;
  return ctx.piecesAt({ kind: 'edge', id: edge }).some((p) => p.type === 'ship');
}

/** The corners next to this one that an army can step to. */
export function stepsFrom(ctx: Ctx, corner: CornerId): CornerId[] {
  const out: CornerId[] = [];
  for (const e of ctx.geometry.cornerEdges.get(corner) ?? []) {
    if (!passable(ctx, e)) continue;
    const next = (ctx.geometry.edgeCorners.get(e) ?? []).find((c) => c !== corner);
    if (next) out.push(next);
  }
  return out;
}

/** An army can stop here: no other army, and no building but its owner's. */
export function canStop(ctx: Ctx, corner: CornerId, seat: number): boolean {
  if (armyAt(ctx, corner)) return false;
  const b = ctx.buildingAt(corner);
  return !b || b.owner === seat;
}

/** Free corners left for this army this turn. */
export function freeSteps(ctx: Ctx, army: Piece): number {
  const used =
    army.props.marchedTurn === ctx.state.turn.number ? (army.props.marched as number) : 0;
  return Math.max(0, FREE_STEPS - (used ?? 0));
}

/**
 * Where an army can march and how many corners it takes, up to `max`. It
 * passes through buildings and its owner's armies, but not a rival's army.
 */
export function marchTargets(ctx: Ctx, army: Piece, max: number): Map<CornerId, number> {
  const out = new Map<CornerId, number>();
  const start = cornerOf(army);
  if (!start || army.owner === null) return out;
  const seat = army.owner;
  const dist = new Map<CornerId, number>([[start, 0]]);
  const queue: CornerId[] = [start];
  while (queue.length) {
    const c = queue.shift() as CornerId;
    const d = dist.get(c) as number;
    if (d >= max) continue;
    for (const n of stepsFrom(ctx, c)) {
      if (dist.has(n) || enemyArmyAt(ctx, n, seat)) continue;
      dist.set(n, d + 1);
      if (canStop(ctx, n, seat)) out.set(n, d + 1);
      queue.push(n);
    }
  }
  return out;
}

/** Corners an army can fall back to after it breaks off a fight. */
export function retreatCorners(ctx: Ctx, army: Piece): CornerId[] {
  const at = cornerOf(army);
  if (!at || army.owner === null) return [];
  const seat = army.owner;
  return stepsFrom(ctx, at).filter((c) => canStop(ctx, c, seat));
}

// ---- Fights ----

export type Target = { kind: 'army'; corner: CornerId } | { kind: 'building'; corner: CornerId };

/**
 * What an army can attack from where it stands: a rival army on a neighbouring
 * corner, or a rival building there that no army guards.
 */
export function attackTargets(ctx: Ctx, army: Piece): Target[] {
  const at = cornerOf(army);
  if (!at || army.owner === null) return [];
  const out: Target[] = [];
  for (const c of ctx.geometry.cornerNeighbours.get(at) ?? []) {
    const guard = armyAt(ctx, c);
    if (guard) {
      if (guard.owner !== army.owner) out.push({ kind: 'army', corner: c });
      continue;
    }
    const b = ctx.buildingAt(c);
    if (b && b.owner !== null && b.owner !== army.owner) out.push({ kind: 'building', corner: c });
  }
  return out;
}

export function robberHex(ctx: Ctx): HexId | null {
  const r = robber(ctx);
  return r?.at.kind === 'hex' ? r.at.id : null;
}

/** The army stands at a corner of the robber's field. */
export function nextToRobber(ctx: Ctx, army: Piece): boolean {
  const r = robberHex(ctx);
  const at = cornerOf(army);
  return !!r && !!at && (ctx.geometry.cornerHexes.get(at) ?? []).includes(r);
}

/**
 * A captured settlement takes the loser's roads and ships with it: those
 * joined to it that no longer reach one of the loser's buildings.
 */
export function cutOffRoutes(ctx: Ctx, corner: CornerId, loser: number): Piece[] {
  const route = (e: EdgeId) =>
    ctx
      .piecesAt({ kind: 'edge', id: e })
      .find((p) => p.owner === loser && !!ctx.registry.pieceTypes[p.type]?.route);
  const out: Piece[] = [];
  const done = new Set<EdgeId>();
  for (const first of ctx.geometry.cornerEdges.get(corner) ?? []) {
    if (done.has(first) || !route(first)) continue;
    // The run of routes reached from this edge, without passing the captured corner.
    const group: Piece[] = [];
    let reaches = false;
    const queue: EdgeId[] = [first];
    done.add(first);
    while (queue.length) {
      const e = queue.shift() as EdgeId;
      group.push(route(e) as Piece);
      for (const c of ctx.geometry.edgeCorners.get(e) ?? []) {
        if (c === corner) continue;
        const b = ctx.buildingAt(c);
        if (b?.owner === loser) reaches = true;
        if (b && b.owner !== loser) continue;
        for (const n of ctx.geometry.cornerEdges.get(c) ?? []) {
          if (done.has(n) || !route(n)) continue;
          done.add(n);
          queue.push(n);
        }
      }
    }
    if (!reaches) out.push(...group);
  }
  return out;
}

export const isBuilding = (ctx: Ctx, p: Piece) => !!ctx.registry.pieceTypes[p.type]?.building;
