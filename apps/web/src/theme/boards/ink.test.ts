import { describe, expect, it } from 'vitest';
import { facet, hatch, inside, mix, rng, scallop, stipple, wander, type Pt } from './ink.ts';
import { MANGA_SCENES } from './mangaArt.ts';
import { BASE } from './hex.ts';

const square: Pt[] = [
  [0, 0],
  [40, 0],
  [40, 40],
  [0, 40],
];

/** Every coordinate pair in a path. */
function points(d: string): Pt[] {
  return [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

describe('ink kit', () => {
  it('draws the same thing every time from the same seed', () => {
    const one = hatch(square, { rnd: rng(7), angle: 30, gap: 3 });
    const two = hatch(square, { rnd: rng(7), angle: 30, gap: 3 });
    expect(one).toBe(two);
    expect(hatch(square, { rnd: rng(8), angle: 30, gap: 3 })).not.toBe(one);
  });

  it('gives numbers in range', () => {
    const rnd = rng(3);
    for (let i = 0; i < 500; i++) {
      const n = rnd();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });

  it('wander cuts a line into many short segments that stay near it', () => {
    const pts = wander(
      [
        [0, 20],
        [60, 20],
      ],
      { rnd: rng(5), step: 3, amp: 1.5 },
    );
    expect(pts.length).toBeGreaterThan(15);
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(-1);
      expect(x).toBeLessThanOrEqual(61);
      expect(Math.abs(y - 20)).toBeLessThanOrEqual(1.6);
    }
  });

  it('hatch keeps its strokes inside the shape', () => {
    const d = hatch(square, { rnd: rng(9), angle: 45, gap: 4, jitter: 0 });
    const ps = points(d);
    expect(ps.length).toBeGreaterThan(10);
    for (const p of ps) {
      expect(p[0]).toBeGreaterThanOrEqual(-0.6);
      expect(p[0]).toBeLessThanOrEqual(40.6);
      expect(p[1]).toBeGreaterThanOrEqual(-0.6);
      expect(p[1]).toBeLessThanOrEqual(40.6);
    }
  });

  it('stipple puts every dot inside the shape', () => {
    const d = stipple(square, { rnd: rng(11), n: 60, r: 0.5 });
    // Each dot is a move to its left edge, then two arcs: the centre is that point plus r.
    const dots = [...d.matchAll(/M(-?[\d.]+),(-?[\d.]+)a([\d.]+)/g)].map((m): Pt => [
      Number(m[1]) + Number(m[3]),
      Number(m[2]),
    ]);
    expect(dots.length).toBeGreaterThan(30);
    for (const p of dots) expect(inside(p, square)).toBe(true);
  });

  it('facet makes an angular shape with the asked-for number of corners', () => {
    const f = facet(20, 20, 8, 7, rng(13));
    expect(f).toHaveLength(7);
    for (const [x, y] of f) expect(Math.hypot(x - 20, y - 20)).toBeLessThanOrEqual(8 * 1.2);
  });

  it('scallop walks the line as arcs, not one smooth curve', () => {
    const d = scallop(
      [
        [0, 0],
        [10, 0],
        [20, 0],
        [30, 0],
      ],
      4,
    );
    expect((d.match(/A/g) ?? []).length).toBe(3);
  });

  it('mix blends two colours', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});

describe('the drawn lands', () => {
  for (const land of BASE) {
    it(`${land} is a scene of several layers, not a flat tile`, () => {
      const scene = MANGA_SCENES[land];
      expect(scene.layers.length).toBeGreaterThan(5);
      for (const layer of scene.layers) expect(layer.d.length).toBeGreaterThan(0);
      // The whole point: a lot of small strokes rather than a handful of big shapes.
      const commands = scene.layers.reduce((n, l) => n + (l.d.match(/[MLA]/g) ?? []).length, 0);
      expect(commands).toBeGreaterThan(400);
    });

    it(`${land} is modelled with light and shade, not flat colour`, () => {
      const scene = MANGA_SCENES[land];
      // Every gradient is referred to by at least one layer, and every referred-to one exists.
      const ids = new Set(scene.grads.map((g) => g.id));
      expect(ids.size).toBeGreaterThan(2);
      const used = new Set(scene.layers.flatMap((l) => (l.grad ? [l.grad] : [])));
      for (const id of used) expect(ids.has(id)).toBe(true);
      for (const id of ids) expect(used.has(id)).toBe(true);
      // Stops run in order and stay inside the line.
      for (const g of scene.grads) {
        expect(g.stops.length).toBeGreaterThan(1);
        for (let i = 1; i < g.stops.length; i++) {
          expect(g.stops[i]!.at).toBeGreaterThanOrEqual(g.stops[i - 1]!.at);
        }
        for (const s of g.stops) {
          expect(s.at).toBeGreaterThanOrEqual(0);
          expect(s.at).toBeLessThanOrEqual(1);
        }
      }
    });
  }
});
