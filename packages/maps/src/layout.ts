import { hexCorners, hexEdges, hexToPixel, type CornerId, type EdgeId } from '@colonizers/engine';
import { PIPS, RESOURCE_OF } from './components.ts';
import type { Coord } from './shapes.ts';

/**
 * Fast index-based view of a board's land hexes, used by the generator and
 * the fairness report.
 */
export interface ShapeInfo {
  coords: Coord[];
  /** Land neighbours of each hex, by index. */
  neighbours: number[][];
  /** Every land corner: the land hexes it touches, by index. */
  corners: { id: CornerId; hexes: number[] }[];
  /** For each corner (by index into `corners`), neighbouring corners. */
  cornerNeighbours: number[][];
  /** Sector (0–5) of each hex by angle around the centre, for regional balance. */
  sectors: number[];
  /** Coastal edges (land on one side only), clockwise, with the land hex index. */
  coast: { edge: EdgeId; hex: number; angle: number }[];
}

const cache = new Map<string, ShapeInfo>();

export function shapeInfo(coords: Coord[]): ShapeInfo {
  const key = coords.map((c) => `${c.q},${c.r}`).join('|');
  const hit = cache.get(key);
  if (hit) return hit;

  const index = new Map(coords.map((c, i) => [`${c.q},${c.r}`, i]));
  const dirs = [
    [1, -1],
    [1, 0],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [0, -1],
  ] as const;
  const neighbours = coords.map((c) =>
    dirs.flatMap(([dq, dr]) => {
      const i = index.get(`${c.q + dq},${c.r + dr}`);
      return i === undefined ? [] : [i];
    }),
  );

  const cornerMap = new Map<CornerId, number[]>();
  coords.forEach((c, i) => {
    for (const id of hexCorners(c.q, c.r)) {
      const list = cornerMap.get(id);
      if (list) list.push(i);
      else cornerMap.set(id, [i]);
    }
  });
  const corners = [...cornerMap.entries()].map(([id, hexes]) => ({ id, hexes }));
  const cornerIndex = new Map(corners.map((c, i) => [c.id, i]));
  const cornerNeighbours: number[][] = corners.map(() => []);
  const edgeSeen = new Set<EdgeId>();
  const coast: ShapeInfo['coast'] = [];
  coords.forEach((c, i) => {
    const cs = hexCorners(c.q, c.r);
    hexEdges(c.q, c.r).forEach((e, k) => {
      const a = cornerIndex.get(cs[k] as CornerId) as number;
      const b = cornerIndex.get(cs[(k + 1) % 6] as CornerId) as number;
      if (!edgeSeen.has(e)) {
        edgeSeen.add(e);
        cornerNeighbours[a]?.push(b);
        cornerNeighbours[b]?.push(a);
      }
      const [dq, dr] = dirs[k] as readonly [number, number];
      if (!index.has(`${c.q + dq},${c.r + dr}`)) {
        const p = hexToPixel(c.q, c.r);
        const n = hexToPixel(c.q + dq, c.r + dr);
        coast.push({ edge: e, hex: i, angle: Math.atan2((p.y + n.y) / 2, (p.x + n.x) / 2) });
      }
    });
  });
  coast.sort((x, y) => x.angle - y.angle);

  const centre = coords.reduce(
    (acc, c) => {
      const p = hexToPixel(c.q, c.r);
      return { x: acc.x + p.x / coords.length, y: acc.y + p.y / coords.length };
    },
    { x: 0, y: 0 },
  );
  const sectors = coords.map((c) => {
    const p = hexToPixel(c.q, c.r);
    const a = Math.atan2(p.y - centre.y, p.x - centre.x) + Math.PI;
    return Math.min(5, Math.floor((a / (2 * Math.PI)) * 6));
  });

  const info: ShapeInfo = { coords, neighbours, corners, cornerNeighbours, sectors, coast };
  if (cache.size > 32) cache.clear();
  cache.set(key, info);
  return info;
}

/** Terrain and number per land hex, in the same order as `ShapeInfo.coords`. */
export interface Layout {
  terrain: string[];
  tokens: (number | null)[];
}

export function pips(token: number | null | undefined): number {
  return token ? (PIPS[token] ?? 0) : 0;
}

export const isRed = (t: number | null) => t === 6 || t === 8;

export function cornerValue(info: ShapeInfo, layout: Layout, corner: number): number {
  let v = 0;
  for (const h of info.corners[corner]?.hexes ?? []) v += pips(layout.tokens[h]);
  return v;
}

/**
 * The best 2N starting corners, picked greedily in value order while obeying
 * the distance rule, like players drafting their starting spots.
 */
export function bestStartingSpots(info: ShapeInfo, layout: Layout, count: number): number[] {
  const order = info.corners
    .map((_, i) => i)
    .sort((a, b) => cornerValue(info, layout, b) - cornerValue(info, layout, a));
  const taken = new Set<number>();
  const blocked = new Set<number>();
  const values: number[] = [];
  for (const c of order) {
    if (values.length >= count) break;
    if (blocked.has(c)) continue;
    taken.add(c);
    blocked.add(c);
    for (const n of info.cornerNeighbours[c] ?? []) blocked.add(n);
    values.push(cornerValue(info, layout, c));
  }
  return values;
}

export function pipsPerResource(layout: Layout): Record<string, number> {
  const out: Record<string, number> = { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 };
  layout.terrain.forEach((t, i) => {
    const r = RESOURCE_OF[t];
    if (r) out[r] = (out[r] ?? 0) + pips(layout.tokens[i]);
  });
  return out;
}

/** Each resource's fair share of the board's pips, in proportion to its hex count. */
export function fairShares(layout: Layout): Record<string, number> {
  const total = layout.tokens.reduce<number>((s, t) => s + pips(t), 0);
  const counts: Record<string, number> = {};
  let producing = 0;
  for (const t of layout.terrain) {
    const r = RESOURCE_OF[t];
    if (r) {
      counts[r] = (counts[r] ?? 0) + 1;
      producing++;
    }
  }
  return Object.fromEntries(Object.entries(counts).map(([r, n]) => [r, (total * n) / producing]));
}
