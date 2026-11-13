import type { Action, ActionDef, CornerId, Ctx, Piece } from '@colonizers/engine';
import {
  ckData,
  claimMetropolis,
  levels,
  MAX_LEVEL,
  METROPOLIS_LEVEL,
  winsMetropolis,
  type Track,
} from '@colonizers/module-cities-knights';
import { CIV_BY_ID, type Civ, type CivClass } from './civs.ts';

/** Civilisations' shared state and helpers. */

export const MODULE_ID = 'civilisations';

/** Something a civilisation's ability owes a player, to take when they like. */
export type Gift =
  /** A free road (or ship, with Seafarers). */
  | { kind: 'route' }
  /** A free active strong knight (Warlord). */
  | { kind: 'knight' }
  /** A card from a hex beside a new settlement or city (Republic). */
  | { kind: 'harvest'; corner: CornerId; city: boolean }
  /** A free city improvement level (Egypt). */
  | { kind: 'improve' };

export interface CivData extends Record<string, unknown> {
  /** The tiles each player was dealt, until they pick. */
  dealt: Record<number, string[]>;
  /** Each player's civilisation, once picked. */
  civ: Record<number, string>;
  /** Everyone has picked and the civilisations are shown. */
  revealed: boolean;
  /** The starting placements are over and start gifts handed out. */
  started: boolean;
  /** Players who have reached 10 points at least once. */
  unlocked: Record<number, boolean>;
  /** Once-a-game abilities used, by "seat:ability". */
  used: Record<string, number>;
  gifts: Record<number, Gift[]>;
  /** Resources of their choice owed to players. */
  picks: Record<number, number>;
  /** Cards a player may swap for any card, from this roll's production. */
  swaps: Record<number, string[]>;
  /** A 7 has been rolled (Morocco). */
  firstSeven?: boolean;
  /** Korea: the round each track's last card came in, by "seat:track". */
  korea?: Record<string, number>;
}

export function civData(ctx: Ctx): CivData {
  const d = ctx.data<CivData>(MODULE_ID);
  d.dealt ??= {};
  d.civ ??= {};
  d.revealed ??= false;
  d.started ??= false;
  d.unlocked ??= {};
  d.used ??= {};
  d.gifts ??= {};
  d.picks ??= {};
  d.swaps ??= {};
  return d;
}

/** Read-only view (no data created). */
export function civView(ctx: Ctx): Partial<CivData> {
  return (ctx.state.data[MODULE_ID] as CivData | undefined) ?? {};
}

/** A player's civilisation, once everyone has picked. */
export function civOf(ctx: Ctx, seat: number): Civ | null {
  const d = civView(ctx);
  if (!d.revealed) return null;
  const id = d.civ?.[seat];
  return id ? (CIV_BY_ID[id] ?? null) : null;
}

export function classOf(ctx: Ctx, seat: number): CivClass | null {
  return civOf(ctx, seat)?.cls ?? null;
}

/** Has this player this civilisation's start ability? */
export function plays(ctx: Ctx, seat: number, id: string): boolean {
  return civOf(ctx, seat)?.id === id;
}

/** Has this player this civilisation's 10-point ability? */
export function playsLater(ctx: Ctx, seat: number, id: string): boolean {
  return plays(ctx, seat, id) && civView(ctx).unlocked?.[seat] === true;
}

/** The seat playing this civilisation, if anyone. */
export function seatOf(ctx: Ctx, id: string): number | null {
  const d = civView(ctx);
  if (!d.revealed) return null;
  for (const [seat, c] of Object.entries(d.civ ?? {})) if (c === id) return Number(seat);
  return null;
}

export const giftsOf = (ctx: Ctx, seat: number): Gift[] => civView(ctx).gifts?.[seat] ?? [];

export function addGift(ctx: Ctx, seat: number, gift: Gift): void {
  (civData(ctx).gifts[seat] ??= []).push(gift);
}

export function takeGift(ctx: Ctx, seat: number, i: number): void {
  civData(ctx).gifts[seat]?.splice(i, 1);
}

export function addPicks(ctx: Ctx, seat: number, n: number, why: string): void {
  if (n <= 0) return;
  const d = civData(ctx);
  d.picks[seat] = (d.picks[seat] ?? 0) + n;
  ctx.emit({ type: 'civPicks', player: seat, count: n, why });
}

export const picksOf = (ctx: Ctx, seat: number): number => civView(ctx).picks?.[seat] ?? 0;

export function usedOnce(ctx: Ctx, seat: number, key: string): boolean {
  return civView(ctx).used?.[`${seat}:${key}`] !== undefined;
}

export function markOnce(ctx: Ctx, seat: number, key: string): void {
  civData(ctx).used[`${seat}:${key}`] = ctx.state.turn.number;
}

/** Raises a track a level for free, claiming the metropolis if it is now won. */
export function raiseTrack(ctx: Ctx, seat: number, track: Track): boolean {
  const lv = levels(ctx, seat);
  if (lv[track] >= MAX_LEVEL) return false;
  lv[track] += 1;
  ctx.emit({ type: 'improved', player: seat, track, level: lv[track], free: true });
  if (winsMetropolis(ctx, seat, track, lv[track]))
    claimMetropolis(ctx, seat, track, ctx.state.phase);
  return true;
}

/** Drops a track a level; below level 4 its metropolis is lost. */
export function lowerTrack(ctx: Ctx, seat: number, track: Track): boolean {
  const lv = levels(ctx, seat);
  if (lv[track] <= 0) return false;
  lv[track] -= 1;
  ctx.emit({ type: 'trackLowered', player: seat, track, level: lv[track] });
  const d = ckData(ctx);
  const m = d.metropolis[track];
  if (m && m.seat === seat && lv[track] < METROPOLIS_LEVEL) {
    const city = ctx.buildingAt(m.corner) as Piece | undefined;
    if (city) delete city.props.metropolis;
    delete d.metropolis[track];
    ctx.emit({ type: 'metropolisLost', player: seat, track });
  }
  return true;
}

export type A<T> = Action & T;
export function action<T>(def: ActionDef<A<T>>): ActionDef {
  return def as unknown as ActionDef;
}

export const onlyActive = (ctx: Ctx, a: Action): string | null =>
  a.player === ctx.active ? null : 'Not your turn';

export const notOver = (ctx: Ctx): string | null =>
  ctx.state.phase.id === 'gameOver' ? 'The game is over' : null;
