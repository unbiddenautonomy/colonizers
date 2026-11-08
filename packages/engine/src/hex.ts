/**
 * Hex board geometry for pointy-top hexes in axial coordinates (q, r).
 *
 * Every corner and edge gets one stable id, no matter which of its hexes you
 * reach it from, so replays and saved games always line up.
 *
 * - Each hex owns two corners: N and S. Its other four corners belong to
 *   neighbours (for example its NE corner is the S corner of the NE neighbour).
 * - Each hex owns three edges: NE, E and SE. Its other three edges belong to
 *   neighbours (its W edge is the E edge of the W neighbour).
 *
 * Ids are strings like "h:0,-1", "c:0,-1,N" and "e:0,-1,E".
 */

export type HexId = `h:${number},${number}`;
export type CornerId = `c:${number},${number},${'N' | 'S'}`;
export type EdgeId = `e:${number},${number},${'NE' | 'E' | 'SE'}`;

export interface Axial {
  q: number;
  r: number;
}

/** Neighbour directions, clockwise from north-east. */
export const DIRECTIONS = ['NE', 'E', 'SE', 'SW', 'W', 'NW'] as const;
export type Direction = (typeof DIRECTIONS)[number];

const OFFSETS: Record<Direction, Axial> = {
  NE: { q: 1, r: -1 },
  E: { q: 1, r: 0 },
  SE: { q: 0, r: 1 },
  SW: { q: -1, r: 1 },
  W: { q: -1, r: 0 },
  NW: { q: 0, r: -1 },
};

/** Corner positions on a hex, clockwise from the top. */
export const CORNER_POSITIONS = ['N', 'NE', 'SE', 'S', 'SW', 'NW'] as const;
export type CornerPosition = (typeof CORNER_POSITIONS)[number];

export function hexId(q: number, r: number): HexId {
  return `h:${q},${r}`;
}

export function parseHexId(id: HexId): Axial {
  const [q, r] = id.slice(2).split(',').map(Number) as [number, number];
  return { q, r };
}

export function neighbour(q: number, r: number, dir: Direction): Axial {
  const o = OFFSETS[dir];
  return { q: q + o.q, r: r + o.r };
}

export function hexNeighbours(id: HexId): HexId[] {
  const { q, r } = parseHexId(id);
  return DIRECTIONS.map((d) => {
    const n = neighbour(q, r, d);
    return hexId(n.q, n.r);
  });
}

export function hexDistance(a: Axial, b: Axial): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

/** The six corners of a hex, clockwise from N. */
export function hexCorners(q: number, r: number): CornerId[] {
  return [
    `c:${q},${r},N`,
    `c:${q + 1},${r - 1},S`, // NE corner
    `c:${q},${r + 1},N`, // SE corner
    `c:${q},${r},S`,
    `c:${q - 1},${r + 1},N`, // SW corner
    `c:${q},${r - 1},S`, // NW corner
  ];
}

/** The six edges of a hex, clockwise from the NE edge (N–NE corners). */
export function hexEdges(q: number, r: number): EdgeId[] {
  return [
    `e:${q},${r},NE`,
    `e:${q},${r},E`,
    `e:${q},${r},SE`,
    `e:${q - 1},${r + 1},NE`, // SW edge
    `e:${q - 1},${r},E`, // W edge
    `e:${q},${r - 1},SE`, // NW edge
  ];
}

export function parseCornerId(id: CornerId): Axial & { pos: 'N' | 'S' } {
  const [q, r, pos] = id.slice(2).split(',') as [string, string, 'N' | 'S'];
  return { q: Number(q), r: Number(r), pos };
}

export function parseEdgeId(id: EdgeId): Axial & { side: 'NE' | 'E' | 'SE' } {
  const [q, r, side] = id.slice(2).split(',') as [string, string, 'NE' | 'E' | 'SE'];
  return { q: Number(q), r: Number(r), side };
}

/** The three hexes touching a corner (some may be off the board). */
export function cornerHexes(id: CornerId): HexId[] {
  const { q, r, pos } = parseCornerId(id);
  return pos === 'N'
    ? [hexId(q, r), hexId(q, r - 1), hexId(q + 1, r - 1)]
    : [hexId(q, r), hexId(q - 1, r + 1), hexId(q, r + 1)];
}

/** The two corners at the ends of an edge. */
export function edgeCorners(id: EdgeId): [CornerId, CornerId] {
  const { q, r, side } = parseEdgeId(id);
  const c = hexCorners(q, r);
  if (side === 'NE') return [c[0] as CornerId, c[1] as CornerId];
  if (side === 'E') return [c[1] as CornerId, c[2] as CornerId];
  return [c[2] as CornerId, c[3] as CornerId];
}

/** The two hexes on either side of an edge (some may be off the board). */
export function edgeHexes(id: EdgeId): [HexId, HexId] {
  const { q, r, side } = parseEdgeId(id);
  const n = neighbour(q, r, side);
  return [hexId(q, r), hexId(n.q, n.r)];
}

/** Pixel centre of a hex for a pointy-top layout with the given size (centre to corner). */
export function hexToPixel(q: number, r: number, size = 1): { x: number; y: number } {
  return { x: size * Math.sqrt(3) * (q + r / 2), y: size * 1.5 * r };
}

export function cornerToPixel(id: CornerId, size = 1): { x: number; y: number } {
  const { q, r, pos } = parseCornerId(id);
  const c = hexToPixel(q, r, size);
  return { x: c.x, y: pos === 'N' ? c.y - size : c.y + size };
}
