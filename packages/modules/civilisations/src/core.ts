import type { Action, ActionDef, CornerId, Ctx, HexId, Piece } from '@colonizers/engine';
import {
  ckData,
  claimMetropolis,
  levels,
  MAX_LEVEL,
  METROPOLIS_LEVEL,
  progressOverLimit,
  winsMetropolis,
  type Track,
} from '@colonizers/module-cities-knights';
import { CIV_BY_ID, type Civ, type CivClass } from './civs.ts';

/** Civilisations' shared state and helpers. */

export const MODULE_ID = 'civilisations';

/** Where a free settlement may go. */
export type SettleWhere =
  /** Anywhere a settlement could be built, by your roads or ships. */
  | 'any'
  /** Anywhere it may stand, no road needed (America's third starting settlement). */
  | 'free'
  /** By your roads, with land all round (Mongolia). */
  | 'inland'
  /** By your roads or ships, on the coast (Indonesia). */
  | 'coastal'
  /** On an island where you have no building yet, no road needed (Australia). */
  | 'island';

/** Something a civilisation's ability owes a player, to take when they like. */
export type Gift =
  /** A free road (or ship, with Seafarers), or only one of the two. */
  | { kind: 'route'; only?: 'road' | 'ship' }
  /** A free active knight: strong for a Warlord, basic for Japan's Defender. */
  | { kind: 'knight'; level?: 1 | 2 }
  /**
   * A card from a hex beside a building: a new settlement's resource or a new
   * city's commodity (Republic), or a resource from another hex beside a city
   * (Maasai, `skip` being the hex that paid).
   */
  | { kind: 'harvest'; corner: CornerId; city: boolean; skip?: HexId }
  /** A free city improvement level (Egypt). */
  | { kind: 'improve' }
  /** A free settlement (Mongolia, France, Australia, Indonesia). */
  | { kind: 'settlement'; where: SettleWhere }
  /** A progress card from a deck of your choice, or of these decks (Maori, Khmer, India). */
  | { kind: 'progress'; decks?: Track[] }
  /** A free Greed, Wealth & Power building beside one of your cities (Khmer, Rome, Maya). */
  | { kind: 'building'; options: ('citadel' | 'diocese')[] }
  /** Destroy a road, ship or inactive basic knight of this player (Babylon). */
  | { kind: 'revenge'; target: number }
  /** Move a harbor anywhere on the coast, or swap two (Gran Colombia). */
  | { kind: 'harbor' }
  /** A 2:1 harbor for a resource of your choice (China). */
  | { kind: 'silk' }
  /** Two resources and two commodities from a hex beside the starting city (Aztec). */
  | { kind: 'capital'; corner: CornerId }
  /** Upgrade a settlement to a city for free (Aztec). */
  | { kind: 'city' }
  /** Destroy a rival's road, ship or basic knight beside the robber's hex, and place your own (Poland). */
  | { kind: 'hussar'; hex: HexId }
  /** Turn a rival's city back into a settlement (Nordic, when the barbarians win). */
  | { kind: 'raze' }
  /** A commodity of your choice (Cuba). */
  | { kind: 'commodity' };

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
  /** Any resource or commodity of their choice owed to players (Maori). */
  anyPicks?: Record<number, number>;
  /** China: the resource each player trades 2:1. */
  silk?: Record<number, string>;
  /** Maasai: the resource each player trades 1:1 for other resources. */
  lake?: Record<number, string>;
  /** Greece: the round each player last threw the dice again. */
  democracy?: Record<number, number>;
  /** Mongolia: the turn a 3 or 11 let them move the robber. */
  khagan?: number;
  /** Russia: the turn they last had the chance to place the robber. */
  muscovy?: number;
  /** Khmer: the highest even score reached from 10 up. */
  evens?: Record<number, number>;
  /** Prussia: welfare tokens. */
  welfare?: Record<number, number>;
  /** America: has built a city since the start. */
  firstCity?: Record<number, boolean>;
  /** Papua: the corners of their starting buildings. */
  papua?: string[];
  /** Austria: the cards drawn for the Habsburg Marriage, until three are kept. */
  habsburg?: { seat: number; drawn: { card: string; deck: Track }[] };
  /** Nordic: points from barbarian wins. */
  raids?: Record<number, number>;
  /** Nordic's Thor's Hammer or the Ottoman Bombard is being worked out. */
  forced?: 'barbarians' | null;
  /** Cuba: has built a settlement by the sea. */
  cubaCoast?: Record<number, boolean>;
  /** Poland: sharing the leader's production and progress cards until this turn number. */
  union?: { seat: number; leader: number; until: number };
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

/** Twice-a-game abilities: how many times used. */
export const usedCount = (ctx: Ctx, seat: number, key: string): number =>
  (civView(ctx).used?.[`${seat}:${key}:count`] as number | undefined) ?? 0;

export function markUse(ctx: Ctx, seat: number, key: string): void {
  civData(ctx).used[`${seat}:${key}:count`] = usedCount(ctx, seat, key) + 1;
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

/** Puts back progress cards over the limit before going on. */
export function progressCheck(ctx: Ctx): void {
  if (ctx.state.phase.id === 'progressDiscard' || ctx.state.phase.id === 'gameOver') return;
  const owed = progressOverLimit(ctx);
  if (Object.keys(owed).length)
    ctx.setPhase({ id: 'progressDiscard', owed, returnTo: ctx.state.phase });
}

/** The phase's owed seats. */
export const owes = (ctx: Ctx, seat: number): boolean =>
  ((ctx.state.phase.owed as Record<number, number> | undefined)?.[seat] ?? 0) > 0;

export const isSeaHex = (ctx: Ctx, h: HexId): boolean => {
  const x = ctx.state.hexes[h];
  return !!x && ctx.registry.hexTypes[x.type]?.terrain === 'sea';
};

export const isLandHex = (ctx: Ctx, h: HexId): boolean => {
  const x = ctx.state.hexes[h];
  return !!x && ctx.registry.hexTypes[x.type]?.terrain === 'land';
};

/** A corner with land on all three sides. */
export function isInlandCorner(ctx: Ctx, corner: CornerId): boolean {
  const hexes = ctx.geometry.cornerHexes.get(corner) ?? [];
  return hexes.length === 3 && hexes.every((h) => isLandHex(ctx, h));
}

/** A corner touching both land and sea. */
export function isCoastalCorner(ctx: Ctx, corner: CornerId): boolean {
  const hexes = ctx.geometry.cornerHexes.get(corner) ?? [];
  return hexes.some((h) => isLandHex(ctx, h)) && hexes.some((h) => isSeaHex(ctx, h));
}

/** Does this corner or edge touch a hex of one of these types? */
export function touchesTerrain(ctx: Ctx, hexes: readonly HexId[], types: readonly string[]) {
  return hexes.some((h) => types.includes(ctx.state.hexes[h]?.type ?? ''));
}
