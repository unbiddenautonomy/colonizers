import {
  hexEdges,
  hexToPixel,
  type EdgeId,
  type Harbor,
  type MapSpec,
  type Rng,
} from '@colonizers/engine';

export const BASE_TERRAIN: Record<string, number> = {
  forest: 4,
  pasture: 4,
  fields: 4,
  hills: 3,
  mountains: 3,
  desert: 1,
};

/** Official spiral order of number tokens (A–R). */
export const BASE_TOKEN_SPIRAL = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];

export const BASE_HARBORS = ['any', 'any', 'any', 'any', 'brick', 'lumber', 'wool', 'grain', 'ore'];

/** Hexes in a ring at distance `radius`, walking clockwise from the top-left. */
export function ring(radius: number): { q: number; r: number }[] {
  if (radius === 0) return [{ q: 0, r: 0 }];
  const out: { q: number; r: number }[] = [];
  // Start at the NW-most corner of the ring and walk E, SE, SW, W, NW, NE.
  let q = 0;
  let r = -radius;
  const steps: [number, number][] = [
    [1, 0],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [0, -1],
    [1, -1],
  ];
  for (const [dq, dr] of steps) {
    for (let i = 0; i < radius; i++) {
      out.push({ q, r });
      q += dq;
      r += dr;
    }
  }
  return out;
}

/** Spiral from the outer ring inwards, the order tokens are laid in the official rules. */
export function spiral(radius: number): { q: number; r: number }[] {
  const out: { q: number; r: number }[] = [];
  for (let k = radius; k >= 0; k--) out.push(...ring(k));
  return out;
}

/** Coastal edges (land on one side, sea on the other), sorted clockwise around the centre. */
export function coastalEdges(land: Set<string>, sea: Set<string>): EdgeId[] {
  const edges = new Map<EdgeId, number>();
  for (const key of land) {
    const [q, r] = key.split(',').map(Number) as [number, number];
    const neighbours = [
      [q + 1, r - 1],
      [q + 1, r],
      [q, r + 1],
      [q - 1, r + 1],
      [q - 1, r],
      [q, r - 1],
    ];
    const es = hexEdges(q, r);
    neighbours.forEach(([nq, nr], i) => {
      if (sea.has(`${nq},${nr}`)) {
        const a = hexToPixel(q, r);
        const b = hexToPixel(nq as number, nr as number);
        edges.set(es[i] as EdgeId, Math.atan2((a.y + b.y) / 2, (a.x + b.x) / 2));
      }
    });
  }
  return [...edges.entries()].sort((x, y) => x[1] - y[1]).map(([e]) => e);
}

/**
 * A random base-game board: 19 land hexes with the official spiral of tokens
 * and 9 harbors around the coast. Phase 2 replaces this with the full map
 * generator and preset maps.
 */
export function randomBaseMap(rng: Rng): MapSpec {
  const landCoords = spiral(2);
  const terrain = rng.shuffle(
    Object.entries(BASE_TERRAIN).flatMap(([t, n]) => Array<string>(n).fill(t)),
  );
  // Start the spiral at a random corner of the outer ring.
  const outer = ring(2);
  const shift = rng.int(0, 5) * 2;
  const order = [...outer.slice(shift), ...outer.slice(0, shift), ...ring(1), ...ring(0)];
  const typeAt = new Map<string, string>();
  landCoords.forEach((c, i) => typeAt.set(`${c.q},${c.r}`, terrain[i] as string));

  const hexes: MapSpec['hexes'] = [];
  let t = 0;
  for (const c of order) {
    const type = typeAt.get(`${c.q},${c.r}`) as string;
    if (type === 'desert') hexes.push({ q: c.q, r: c.r, type });
    else hexes.push({ q: c.q, r: c.r, type, token: BASE_TOKEN_SPIRAL[t++] as number });
  }
  for (const c of ring(3)) hexes.push({ q: c.q, r: c.r, type: 'sea' });

  const land = new Set(landCoords.map((c) => `${c.q},${c.r}`));
  const sea = new Set(ring(3).map((c) => `${c.q},${c.r}`));
  const coast = coastalEdges(land, sea);
  const kinds = rng.shuffle(BASE_HARBORS);
  const harbors: Harbor[] = kinds.map((resource, i) => ({
    edge: coast[Math.floor((i * coast.length) / kinds.length)] as EdgeId,
    resource,
    ratio: resource === 'any' ? 3 : 2,
  }));

  const desert = hexes.find((h) => h.type === 'desert') as { q: number; r: number };
  return {
    hexes,
    harbors,
    pieces: [{ type: 'robber', at: { kind: 'hex', id: `h:${desert.q},${desert.r}` } }],
  };
}
