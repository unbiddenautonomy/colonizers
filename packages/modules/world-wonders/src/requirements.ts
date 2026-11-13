import type { CornerId, Ctx, EdgeId, HexId, Piece } from '@colonizers/engine';
import { WONDERS, type Requirement, type WonderId } from './wonders.ts';

/**
 * Where a player may start a wonder. Each requirement names the pieces that
 * meet it; the wonder stands on a hex beside those pieces, picked by its
 * builder (for a terrain requirement, a hex of that terrain).
 */

const KNIGHT3 = 'knight3';
const SETTLEMENT_LIKE = ['settlement', 'city'];

function buildings(ctx: Ctx, seat: number, citiesOnly = false): Piece[] {
  return ctx
    .piecesOf(seat)
    .filter(
      (p) =>
        p.at.kind === 'corner' &&
        (citiesOnly ? p.type === 'city' : SETTLEMENT_LIKE.includes(p.type)),
    );
}

const cornerOf = (p: Piece) => (p.at as { id: CornerId }).id;

function landHex(ctx: Ctx, hex: HexId): boolean {
  const h = ctx.state.hexes[hex];
  return !!h && !h.hidden && ctx.registry.hexTypes[h.type]?.terrain === 'land';
}

/** Does this hex count as `terrain`: a hex type (desert, gold) or what it produces? */
export function isTerrain(ctx: Ctx, hex: HexId, terrain: string): boolean {
  const h = ctx.state.hexes[hex];
  if (!h || h.hidden) return false;
  return h.type === terrain || ctx.registry.hexTypes[h.type]?.produces === terrain;
}

/** Land hexes touching any of these corners. */
function landAround(ctx: Ctx, corners: Iterable<CornerId>): HexId[] {
  const out = new Set<HexId>();
  for (const c of corners)
    for (const h of ctx.geometry.cornerHexes.get(c) ?? []) if (landHex(ctx, h)) out.add(h);
  return [...out].sort();
}

/** Corners on a harbor. */
function harborCorners(ctx: Ctx): Set<CornerId> {
  const out = new Set<CornerId>();
  for (const h of ctx.state.harbors)
    for (const c of ctx.geometry.edgeCorners.get(h.edge) ?? []) out.add(c);
  return out;
}

/**
 * The longest closed loop in a player's roads or ships, if any is at least
 * `min` long. A player has at most a few dozen route pieces, so a plain search
 * is quick enough.
 */
export function closedLoop(ctx: Ctx, seat: number, route: string, min: number): EdgeId[] | null {
  const edges = ctx
    .piecesOf(seat)
    .filter((p) => p.at.kind === 'edge' && ctx.registry.pieceTypes[p.type]?.route === route)
    .map((p) => (p.at as { id: EdgeId }).id);
  if (edges.length < min) return null;
  const adj = new Map<CornerId, { to: CornerId; edge: EdgeId }[]>();
  for (const e of edges) {
    const [a, b] = ctx.geometry.edgeCorners.get(e) ?? [];
    if (!a || !b) continue;
    (adj.get(a) ?? adj.set(a, []).get(a)!).push({ to: b, edge: e });
    (adj.get(b) ?? adj.set(b, []).get(b)!).push({ to: a, edge: e });
  }
  const corners = [...adj.keys()].sort();
  const rank = new Map(corners.map((c, i) => [c, i]));
  let best: EdgeId[] | null = null;
  let steps = 0;
  const path: EdgeId[] = [];
  const seen = new Set<CornerId>();
  const walk = (start: CornerId, at: CornerId) => {
    if (++steps > 200_000) return;
    for (const { to, edge } of adj.get(at) ?? []) {
      if (path.includes(edge)) continue;
      if (to === start && path.length + 1 >= 3) {
        if (path.length + 1 >= min && (!best || path.length + 1 > best.length))
          best = [...path, edge];
        continue;
      }
      // Each loop is found from its lowest corner only.
      if (seen.has(to) || rank.get(to)! < rank.get(start)!) continue;
      seen.add(to);
      path.push(edge);
      walk(start, to);
      path.pop();
      seen.delete(to);
    }
  };
  for (const start of corners) {
    seen.add(start);
    walk(start, start);
    seen.delete(start);
  }
  return best;
}

/** Hexes the wonder could stand on for this player now, or none if the requirement isn't met. */
export function wonderSites(ctx: Ctx, seat: number, id: WonderId): HexId[] {
  return sitesFor(ctx, seat, WONDERS[id].requirement);
}

/** Hexes a wonder with this requirement could stand on for this player now. */
export function sitesFor(ctx: Ctx, seat: number, r: Requirement): HexId[] {
  switch (r.kind) {
    case 'terrain': {
      const near = buildings(ctx, seat, r.citiesOnly).filter((b) =>
        (ctx.geometry.cornerHexes.get(cornerOf(b)) ?? []).some((h) => isTerrain(ctx, h, r.terrain)),
      );
      if (near.length < r.count) return [];
      const hexes = new Set<HexId>();
      for (const b of near)
        for (const h of ctx.geometry.cornerHexes.get(cornerOf(b)) ?? [])
          if (isTerrain(ctx, h, r.terrain)) hexes.add(h);
      return [...hexes].sort();
    }
    case 'numbers': {
      const has = (h: HexId) => r.numbers.includes(ctx.state.hexes[h]?.token ?? -1);
      const near = buildings(ctx, seat).filter((b) =>
        (ctx.geometry.cornerHexes.get(cornerOf(b)) ?? []).some(has),
      );
      if (near.length < r.count) return [];
      const hexes = new Set<HexId>();
      for (const b of near)
        for (const h of ctx.geometry.cornerHexes.get(cornerOf(b)) ?? []) if (has(h)) hexes.add(h);
      return [...hexes].sort();
    }
    case 'harbors': {
      const ports = harborCorners(ctx);
      const on = buildings(ctx, seat, true).filter((b) => ports.has(cornerOf(b)));
      return on.length >= r.count ? landAround(ctx, on.map(cornerOf)) : [];
    }
    case 'loop': {
      const loop = closedLoop(ctx, seat, r.route, r.length);
      if (!loop) return [];
      const hexes = new Set<HexId>();
      for (const e of loop) for (const h of ctx.geometry.edgeHexes.get(e) ?? []) hexes.add(h);
      return [...hexes].filter((h) => ctx.state.hexes[h] && !ctx.state.hexes[h]!.hidden).sort();
    }
    case 'mightyKnights': {
      const knights = ctx
        .piecesOf(seat)
        .filter((p) => p.type === KNIGHT3 && p.at.kind === 'corner');
      return knights.length >= r.count ? landAround(ctx, knights.map(cornerOf)) : [];
    }
    case 'ring': {
      const out: HexId[] = [];
      for (const hex of ctx.geometry.hexes) {
        if (!landHex(ctx, hex)) continue;
        const mine = (ctx.geometry.hexCorners.get(hex) ?? [])
          .map((c) => ctx.buildingAt(c))
          .filter((b): b is Piece => !!b && b.owner === seat && SETTLEMENT_LIKE.includes(b.type));
        if (mine.length >= 3 && mine.some((b) => b.type === 'city')) out.push(hex);
      }
      return out.sort();
    }
    case 'bay': {
      const out = new Set<HexId>();
      for (const hex of ctx.geometry.hexes) {
        const h = ctx.state.hexes[hex];
        if (!h || h.hidden || ctx.registry.hexTypes[h.type]?.terrain !== 'sea') continue;
        const mine = (ctx.geometry.hexCorners.get(hex) ?? [])
          .map((c) => ctx.buildingAt(c))
          .filter((b): b is Piece => !!b && b.owner === seat && SETTLEMENT_LIKE.includes(b.type));
        const cities = mine.filter((b) => b.type === 'city').length;
        if (cities < 1 || mine.length < 2) continue;
        for (const x of landAround(ctx, mine.map(cornerOf))) out.add(x);
      }
      return [...out].sort();
    }
  }
}
