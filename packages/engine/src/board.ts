import {
  cornerHexes,
  edgeCorners,
  edgeHexes,
  hexCorners,
  hexEdges,
  parseHexId,
  type CornerId,
  type EdgeId,
  type HexId,
} from './hex.ts';

/**
 * The fixed shape of a board: which hexes exist and how corners, edges and
 * hexes connect. What is on each hex (terrain, number, hidden or not) lives in
 * the game state, because modules can change it during a game.
 */
export interface Geometry {
  readonly hexes: readonly HexId[];
  readonly corners: readonly CornerId[];
  readonly edges: readonly EdgeId[];
  /** Board hexes touching a corner (1 to 3). */
  readonly cornerHexes: ReadonlyMap<CornerId, readonly HexId[]>;
  /** Corners joined to a corner by an edge. */
  readonly cornerNeighbours: ReadonlyMap<CornerId, readonly CornerId[]>;
  /** Edges meeting at a corner. */
  readonly cornerEdges: ReadonlyMap<CornerId, readonly EdgeId[]>;
  readonly edgeCorners: ReadonlyMap<EdgeId, readonly [CornerId, CornerId]>;
  /** Board hexes on either side of an edge (1 or 2). */
  readonly edgeHexes: ReadonlyMap<EdgeId, readonly HexId[]>;
  readonly hexCorners: ReadonlyMap<HexId, readonly CornerId[]>;
  readonly hexEdges: ReadonlyMap<HexId, readonly EdgeId[]>;
  /** Board hexes next to a hex. */
  readonly hexNeighbours: ReadonlyMap<HexId, readonly HexId[]>;
}

const cache = new Map<string, Geometry>();

/** Builds (and caches) the geometry for a set of hexes. */
export function buildGeometry(hexIds: readonly HexId[]): Geometry {
  const sorted = [...new Set(hexIds)].sort();
  const key = sorted.join('|');
  const hit = cache.get(key);
  if (hit) return hit;

  const onBoard = new Set<HexId>(sorted);
  const corners = new Set<CornerId>();
  const edges = new Set<EdgeId>();
  const hc = new Map<HexId, CornerId[]>();
  const he = new Map<HexId, EdgeId[]>();
  for (const id of sorted) {
    const { q, r } = parseHexId(id);
    const cs = hexCorners(q, r);
    const es = hexEdges(q, r);
    hc.set(id, cs);
    he.set(id, es);
    cs.forEach((c) => corners.add(c));
    es.forEach((e) => edges.add(e));
  }

  const ch = new Map<CornerId, HexId[]>();
  for (const c of corners)
    ch.set(
      c,
      cornerHexes(c).filter((h) => onBoard.has(h)),
    );

  const ec = new Map<EdgeId, [CornerId, CornerId]>();
  const eh = new Map<EdgeId, HexId[]>();
  const cn = new Map<CornerId, CornerId[]>();
  const ce = new Map<CornerId, EdgeId[]>();
  for (const e of edges) {
    const [a, b] = edgeCorners(e);
    ec.set(e, [a, b]);
    eh.set(
      e,
      edgeHexes(e).filter((h) => onBoard.has(h)),
    );
    for (const [x, y] of [
      [a, b],
      [b, a],
    ] as const) {
      if (!cn.has(x)) cn.set(x, []);
      if (!ce.has(x)) ce.set(x, []);
      cn.get(x)?.push(y);
      ce.get(x)?.push(e);
    }
  }

  const hn = new Map<HexId, HexId[]>();
  for (const id of sorted) {
    const neighbours = new Set<HexId>();
    for (const e of he.get(id) ?? []) {
      for (const h of eh.get(e) ?? []) if (h !== id) neighbours.add(h);
    }
    hn.set(id, [...neighbours]);
  }

  const geometry: Geometry = {
    hexes: sorted,
    corners: [...corners].sort(),
    edges: [...edges].sort(),
    cornerHexes: ch,
    cornerNeighbours: cn,
    cornerEdges: ce,
    edgeCorners: ec,
    edgeHexes: eh,
    hexCorners: hc,
    hexEdges: he,
    hexNeighbours: hn,
  };
  if (cache.size > 64) cache.clear();
  cache.set(key, geometry);
  return geometry;
}

/** Groups hexes into connected regions, for example islands of land. */
export function connectedRegions(geometry: Geometry, include: (hex: HexId) => boolean): HexId[][] {
  const seen = new Set<HexId>();
  const regions: HexId[][] = [];
  for (const start of geometry.hexes) {
    if (seen.has(start) || !include(start)) continue;
    const region: HexId[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const h = stack.pop() as HexId;
      region.push(h);
      for (const n of geometry.hexNeighbours.get(h) ?? []) {
        if (!seen.has(n) && include(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    regions.push(region.sort());
  }
  return regions;
}
