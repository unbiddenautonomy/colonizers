import { hexDistance } from '@colonizers/engine';

export interface Coord {
  q: number;
  r: number;
}

/** A hexagon of land with the given radius (radius 2 = 19 hexes, radius 3 = 37). */
export function hexagon(radius: number): Coord[] {
  const out: Coord[] = [];
  for (let r = -radius; r <= radius; r++) {
    for (let q = -radius; q <= radius; q++) {
      if (hexDistance({ q: 0, r: 0 }, { q, r }) <= radius) out.push({ q, r });
    }
  }
  return out;
}

/**
 * Rows of the given lengths, centred, top to bottom. The 5–6 board is
 * rows of 3, 4, 5, 6, 5, 4, 3 (30 hexes).
 */
export function rows(lengths: number[]): Coord[] {
  const mid = (lengths.length - 1) / 2;
  const out: Coord[] = [];
  lengths.forEach((len, i) => {
    const r = i - mid;
    // Centre each row on x = -0.5 (in hex widths) so the board is symmetric.
    const start = Math.round(-0.5 - r / 2 - (len - 1) / 2);
    for (let k = 0; k < len; k++) out.push({ q: start + k, r });
  });
  return out;
}

export const SHAPES = {
  standard: () => hexagon(2),
  fiveSix: () => rows([3, 4, 5, 6, 5, 4, 3]),
  sevenEight: () => hexagon(3),
} satisfies Record<string, () => Coord[]>;

export type ShapeName = keyof typeof SHAPES;

export function shapeFor(players: number): ShapeName {
  if (players >= 7) return 'sevenEight';
  if (players >= 5) return 'fiveSix';
  return 'standard';
}

/** The ring of sea hexes around a set of land hexes. */
export function seaFrame(land: Coord[]): Coord[] {
  const key = (c: Coord) => `${c.q},${c.r}`;
  const landSet = new Set(land.map(key));
  const sea = new Map<string, Coord>();
  const dirs = [
    [1, -1],
    [1, 0],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [0, -1],
  ];
  for (const c of land) {
    for (const [dq, dr] of dirs) {
      const n = { q: c.q + (dq as number), r: c.r + (dr as number) };
      if (!landSet.has(key(n))) sea.set(key(n), n);
    }
  }
  return [...sea.values()];
}
