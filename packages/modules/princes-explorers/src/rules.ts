import type { CornerId, Ctx, EdgeId, HexId, HexState, Piece } from '@colonizers/engine';
import { canPlaceSettlement, legalRoadEdges, robber } from '@colonizers/module-base';
import {
  CITADEL_MAX,
  CUT_ROAD,
  MODULE_ID,
  PRINCE,
  PRINCE_COUNT,
  ROBBER_RANGE,
} from './constants.ts';

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

export const withSea = (ctx: Ctx) => ctx.state.modules.includes('seafarers');

/** A field with no number that makes nothing: the desert. */
export function isDesert(ctx: Ctx, h: HexId): boolean {
  const hex = ctx.state.hexes[h];
  return (
    !!hex &&
    landHex(ctx, h) &&
    hex.token === undefined &&
    !ctx.registry.hexTypes[hex.type]?.produces
  );
}

type Links = Map<HexId, Set<HexId>>;

/**
 * Seafarers: fields on two islands joined by one of the player's closed ship
 * lines (ships from one of their buildings to another). A prince or the
 * robber crosses the sea along it in one step.
 */
export function shipLinks(ctx: Ctx, seat: number): Links {
  const links: Links = new Map();
  if (!withSea(ctx)) return links;
  const ships = new Set<EdgeId>();
  for (const p of ctx.piecesOf(seat, 'ship')) if (p.at.kind === 'edge') ships.add(p.at.id);
  if (!ships.size) return links;
  const mine = (c: CornerId) => ctx.buildingAt(c)?.owner === seat;
  const land = (c: CornerId) =>
    (ctx.geometry.cornerHexes.get(c) ?? []).filter((h) => landHex(ctx, h));
  for (const p of ctx.piecesOf(seat)) {
    if (p.at.kind !== 'corner' || !ctx.registry.pieceTypes[p.type]?.building) continue;
    const start = p.at.id;
    const seen = new Set<CornerId>([start]);
    const queue = [start];
    while (queue.length) {
      const c = queue.shift() as CornerId;
      for (const e of ctx.geometry.cornerEdges.get(c) ?? []) {
        if (!ships.has(e)) continue;
        const next = (ctx.geometry.edgeCorners.get(e) ?? []).find((x) => x !== c);
        if (!next || seen.has(next)) continue;
        seen.add(next);
        // A line ends at a building; one that reaches another of theirs is closed.
        if (mine(next)) {
          for (const a of land(start))
            for (const b of land(next)) {
              if (a === b) continue;
              if (!links.has(a)) links.set(a, new Set());
              links.get(a)?.add(b);
              if (!links.has(b)) links.set(b, new Set());
              links.get(b)?.add(a);
            }
        } else queue.push(next);
      }
    }
  }
  return links;
}

/** Fields a piece moved by `seat` can step onto: a neighbour, or across a ship line. */
function steps(
  ctx: Ctx,
  from: HexId,
  seat: number,
  blocked: Set<HexId>,
  links: Links = new Map(),
): HexId[] {
  const out = new Set(
    (ctx.geometry.hexNeighbours.get(from) ?? []).filter(
      (h) => landHex(ctx, h) && !blocked.has(h) && openBetween(ctx, from, h, seat),
    ),
  );
  for (const h of links.get(from) ?? []) if (landHex(ctx, h) && !blocked.has(h)) out.add(h);
  return [...out];
}

// ---- The princes ----

/** Where the princes start: a desert, the 2, the 12, and a 3 or 11, as far as the map has them. */
export function startingHexes(ctx: Ctx): HexId[] {
  // With Seafarers: on the home island, and well apart from each other.
  const sea = withSea(ctx);
  const home = sea ? ctx.setting<HexId[] | null>('setupHexes') : null;
  const hexes = Object.values(ctx.state.hexes).filter(
    (h) => landHex(ctx, h.id) && (!home?.length || home.includes(h.id)),
  );
  const apart = (h: HexState) =>
    Math.min(
      Infinity,
      ...[...taken].map((t) => {
        const o = ctx.state.hexes[t] as HexState;
        return (Math.abs(h.q - o.q) + Math.abs(h.r - o.r) + Math.abs(h.q + h.r - o.q - o.r)) / 2;
      }),
    );
  const pick = (list: HexState[]): HexId | null => {
    let free = list.filter((h) => !taken.has(h.id));
    if (!free.length) return null;
    if (sea && taken.size) {
      const best = Math.max(...free.map(apart));
      free = free.filter((h) => apart(h) === best);
    }
    return (free[ctx.rng.int(0, free.length - 1)] as HexState).id;
  };
  const taken = new Set<HexId>();
  const groups: HexState[][] = [
    hexes.filter((h) => isDesert(ctx, h.id)),
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
  const links = shipLinks(ctx, seat);
  const blocked = new Set(princeHexes(ctx));
  if (r) blocked.add(r);
  for (const p of princes(ctx)) {
    if (p.at.kind !== 'hex') continue;
    for (const hex of steps(ctx, p.at.id, seat, blocked, links)) out.push({ prince: p.id, hex });
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
  // With Seafarers it comes in on a field someone has settled.
  const settled = (h: HexId) =>
    !withSea(ctx) || (ctx.geometry.hexCorners.get(h) ?? []).some((c) => !!ctx.buildingAt(c));
  if (!start)
    return (Object.keys(ctx.state.hexes) as HexId[]).filter(
      (h) => landHex(ctx, h) && !pr.has(h) && settled(h),
    );
  const links = shipLinks(ctx, seat);
  const reached = new Set<HexId>();
  let frontier = new Set<HexId>([start]);
  for (let i = 0; i < range; i++) {
    const next = new Set<HexId>();
    for (const h of frontier)
      for (const n of steps(ctx, h, seat, pr, links)) {
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
    else v += princesAtCorner(ctx, p.at.id, pr) + (isCitadel(p) ? 1 : 0);
  }
  return v;
}

// ---- The citadel: a way out of a dead end ----

export const isCitadel = (p: Piece): boolean => p.type === 'city' && p.props.citadel === true;

/** The player's citadels standing now. */
export const citadelsOf = (ctx: Ctx, seat: number): Piece[] =>
  ctx.piecesOf(seat, 'city').filter(isCitadel);

/**
 * Nothing left that the player can build on the board: no city to make (no city left, or no
 * settlement to make one of), no settlement to place, and no road to place (none left, or nowhere
 * for one). That is the dead end the citadel is for.
 */
export function nothingLeftToBuild(ctx: Ctx, seat: number): boolean {
  if (ctx.supplyLeft(seat, 'city') > 0 && ctx.piecesOf(seat, 'settlement').length > 0) return false;
  if (ctx.supplyLeft(seat, 'road') > 0 && legalRoadEdges(ctx, seat).length > 0) return false;
  if (ctx.supplyLeft(seat, 'settlement') <= 0) return true;
  return !ctx.geometry.corners.some((c) => canPlaceSettlement(ctx, seat, c, true) === null);
}

/** Cities the player may turn into a citadel now (cost aside). */
export function citadelSpots(ctx: Ctx, seat: number): CornerId[] {
  if (citadelsOf(ctx, seat).length >= CITADEL_MAX || !nothingLeftToBuild(ctx, seat)) return [];
  return ctx
    .piecesOf(seat, 'city')
    .filter((p) => !isCitadel(p) && p.at.kind === 'corner')
    .map((p) => (p.at as { id: CornerId }).id);
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
