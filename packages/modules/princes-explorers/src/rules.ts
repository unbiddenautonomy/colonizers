import type { Ctx, EdgeId, HexId, HexState, Piece } from '@colonizers/engine';
import { robber } from '@colonizers/module-base';
import { CUT_ROAD, MODULE_ID, PRINCE, PRINCE_COUNT, ROBBER_RANGE } from './constants.ts';

/**
 * Princes & Explorers' board rules: where the princes and the robber may go,
 * what a building is worth next to them, and which numbers explorers swap.
 */

export interface PrincesData extends Record<string, unknown> {
  /** Set once the robber has come onto the board. */
  robberIn?: boolean;
}

export function princesData(ctx: Ctx): PrincesData {
  return ctx.data<PrincesData>(MODULE_ID);
}

// ---- The board ----

export const princes = (ctx: Ctx): Piece[] => ctx.piecesOfType(PRINCE);

export function princeHexes(ctx: Ctx): Set<HexId> {
  const out = new Set<HexId>();
  for (const p of princes(ctx)) if (p.at.kind === 'hex') out.add(p.at.id);
  return out;
}

export function robberHex(ctx: Ctx): HexId | null {
  const r = robber(ctx);
  return r?.at.kind === 'hex' ? r.at.id : null;
}

const landHex = (ctx: Ctx, h: HexId) => ctx.isLand(h);

/** The edge two neighbouring hexes share. */
export function edgeBetween(ctx: Ctx, a: HexId, b: HexId): EdgeId | undefined {
  const theirs = new Set(ctx.geometry.hexEdges.get(b) ?? []);
  return (ctx.geometry.hexEdges.get(a) ?? []).find((e) => theirs.has(e));
}

/** No road of another player lies between the two hexes. */
export function openBetween(ctx: Ctx, a: HexId, b: HexId, seat: number): boolean {
  const e = edgeBetween(ctx, a, b);
  if (!e) return false;
  return !ctx
    .piecesAt({ kind: 'edge', id: e })
    .some((p) => p.type === 'road' && p.owner !== null && p.owner !== seat);
}

/** Land hexes next to this one that a piece moved by `seat` can step onto. */
function steps(ctx: Ctx, from: HexId, seat: number, blocked: Set<HexId>): HexId[] {
  return (ctx.geometry.hexNeighbours.get(from) ?? []).filter(
    (h) => landHex(ctx, h) && !blocked.has(h) && openBetween(ctx, from, h, seat),
  );
}

// ---- The princes ----

/** Where the princes start: a desert, the 2, the 12, and a 3 or 11, as far as the map has them. */
export function startingHexes(ctx: Ctx): HexId[] {
  const hexes = Object.values(ctx.state.hexes).filter((h) => landHex(ctx, h.id));
  const pick = (list: HexState[]): HexId | null => {
    const free = list.filter((h) => !taken.has(h.id));
    if (!free.length) return null;
    return (free[ctx.rng.int(0, free.length - 1)] as HexState).id;
  };
  const taken = new Set<HexId>();
  const groups: HexState[][] = [
    hexes.filter((h) => h.token === undefined && !ctx.registry.hexTypes[h.type]?.produces),
    hexes.filter((h) => h.token === 2),
    hexes.filter((h) => h.token === 12),
    hexes.filter((h) => h.token === 3 || h.token === 11),
  ];
  // Short of one of those, the least likely numbers fill in.
  const spare = [2, 12, 3, 11, 4, 10, 5, 9].map((n) => hexes.filter((h) => h.token === n));
  for (const g of groups) {
    const h = pick(g) ?? spare.reduce<HexId | null>((got, s) => got ?? pick(s), null);
    if (h) taken.add(h);
  }
  return [...taken].slice(0, PRINCE_COUNT);
}

/** Each prince's legal one-field moves for the player who built. */
export function princeMoves(ctx: Ctx, seat: number): { prince: string; hex: HexId }[] {
  const out: { prince: string; hex: HexId }[] = [];
  const r = robberHex(ctx);
  const blocked = new Set(princeHexes(ctx));
  if (r) blocked.add(r);
  for (const p of princes(ctx)) {
    if (p.at.kind !== 'hex') continue;
    for (const hex of steps(ctx, p.at.id, seat, blocked)) out.push({ prince: p.id, hex });
  }
  return out;
}

/** How many prince fields a corner touches. */
export function princesAtCorner(ctx: Ctx, corner: string, at = princeHexes(ctx)): number {
  return (ctx.geometry.cornerHexes.get(corner as never) ?? []).filter((h) => at.has(h)).length;
}

export function robberAtCorner(ctx: Ctx, corner: string, r = robberHex(ctx)): boolean {
  return !!r && (ctx.geometry.cornerHexes.get(corner as never) ?? []).includes(r);
}

// ---- The robber ----

/**
 * Where the robber can go: one to three fields, turning as it likes but not
 * across another player's road or a prince, and not back where it began.
 * Before it is on the board, it may go on any land field but a prince's.
 */
export function robberTargets(ctx: Ctx, seat: number, range = ROBBER_RANGE): HexId[] {
  const pr = princeHexes(ctx);
  const start = robberHex(ctx);
  if (!start)
    return (Object.keys(ctx.state.hexes) as HexId[]).filter((h) => landHex(ctx, h) && !pr.has(h));
  const reached = new Set<HexId>();
  let frontier = new Set<HexId>([start]);
  for (let i = 0; i < range; i++) {
    const next = new Set<HexId>();
    for (const h of frontier)
      for (const n of steps(ctx, h, seat, pr)) {
        reached.add(n);
        next.add(n);
      }
    frontier = next;
  }
  reached.delete(start);
  return [...reached];
}

/** Anyone else with a card can be robbed, wherever the robber stands. */
export function robberVictims(ctx: Ctx, thief: number): number[] {
  return ctx.state.players
    .map((p) => p.seat)
    .filter((s) => s !== thief && ctx.handSize(s, false) > 0);
}

// ---- The explorers ----

/**
 * Pairs of neighbouring numbers the player may swap: they own a building at
 * one of the two fields, neither has a prince or the robber, and no other
 * player's road lies between them.
 */
export function swapPairs(ctx: Ctx, seat: number): [HexId, HexId][] {
  const pr = princeHexes(ctx);
  const r = robberHex(ctx);
  const ok = (h: HexId) => ctx.state.hexes[h]?.token !== undefined && !pr.has(h) && h !== r;
  const mine = (h: HexId) =>
    (ctx.geometry.hexCorners.get(h) ?? []).some((c) => ctx.buildingAt(c)?.owner === seat);
  const out: [HexId, HexId][] = [];
  for (const a of Object.keys(ctx.state.hexes) as HexId[]) {
    if (!ok(a) || !landHex(ctx, a)) continue;
    for (const b of ctx.geometry.hexNeighbours.get(a) ?? []) {
      if (b <= a || !ok(b) || !landHex(ctx, b)) continue;
      if ((mine(a) || mine(b)) && openBetween(ctx, a, b, seat)) out.push([a, b]);
    }
  }
  return out;
}

export function swapNumbers(ctx: Ctx, a: HexId, b: HexId): void {
  const ha = ctx.state.hexes[a];
  const hb = ctx.state.hexes[b];
  if (!ha || !hb) return;
  const [ta, tb] = [ha.token, hb.token];
  if (ta === undefined || tb === undefined) return;
  ha.token = tb;
  hb.token = ta;
  ctx.hook('hexChanged', ha);
  ctx.hook('hexChanged', hb);
}

// ---- Points and roads ----

/** A building next to the robber scores nothing; one next to princes scores one more for each. */
export function princesVp(ctx: Ctx, seat: number, value: number): number {
  const pr = princeHexes(ctx);
  const r = robberHex(ctx);
  let v = value;
  for (const p of ctx.piecesOf(seat)) {
    if (p.at.kind !== 'corner') continue;
    const def = ctx.registry.pieceTypes[p.type];
    if (!def?.building) continue;
    if (robberAtCorner(ctx, p.at.id, r)) v -= def.vp ?? 0;
    else v += princesAtCorner(ctx, p.at.id, pr);
  }
  return v;
}

/** A road at a prince counts double (triple between two); one at the robber doesn't count. */
export function princesRouteWeight(ctx: Ctx, piece: Piece, value: number): number {
  if (piece.at.kind !== 'edge') return value;
  const hexes = ctx.geometry.edgeHexes.get(piece.at.id) ?? [];
  const r = robberHex(ctx);
  if (r && hexes.includes(r)) return CUT_ROAD;
  const pr = princeHexes(ctx);
  return value * (1 + hexes.filter((h) => pr.has(h)).length);
}
