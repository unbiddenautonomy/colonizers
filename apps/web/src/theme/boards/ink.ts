/**
 * Drawing kit for the hand-drawn boards: the small pieces an illustrator repeats by hand.
 *
 * Everything here builds SVG path data out of many short segments rather than a few smooth
 * curves, because that is what makes a drawn line look drawn: a coastline is a hundred little
 * strokes, a shaded face is forty ruled lines, a sand bank is three hundred dots. Every shape
 * is made from a seeded number stream, so a tile looks hand-made but comes out identical on
 * every device, every render and in every test.
 */

export type Pt = [number, number];

/** A seeded stream of numbers in [0, 1). The same seed always gives the same drawing. */
export function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** Rounds to one decimal: shorter paths, no visible difference. */
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Path data through points, as straight segments. */
export function pathOf(pts: Pt[], close = false): string {
  if (pts.length === 0) return '';
  let d = `M${r1(pts[0]![0])},${r1(pts[0]![1])}`;
  for (let i = 1; i < pts.length; i++) d += `L${r1(pts[i]![0])},${r1(pts[i]![1])}`;
  return close ? d + 'Z' : d;
}

/** Smooth value noise in one dimension, so a wobble drifts rather than jumps. */
function noise(rnd: () => number, n: number): number[] {
  const corners = Array.from({ length: n + 1 }, () => rnd() * 2 - 1);
  return corners;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * (t * t * (3 - 2 * t));

/** Reads the drifting noise above at a point along its length. */
function at(ns: number[], t: number): number {
  const x = t * (ns.length - 1);
  const i = Math.min(ns.length - 2, Math.floor(x));
  return lerp(ns[i]!, ns[i + 1]!, x - i);
}

/**
 * Walks a line through the given points, cutting it into short segments and pushing each one
 * sideways by a drifting amount: a ruled line becomes a drawn one.
 */
export function wander(
  pts: Pt[],
  o: { rnd: () => number; step?: number; amp?: number; lumps?: number; close?: boolean },
): Pt[] {
  const step = o.step ?? 3;
  const amp = o.amp ?? 1;
  const src = o.close ? [...pts, pts[0]!] : pts;
  const out: Pt[] = [];
  // Total length, so the noise runs at the same rate along every line.
  let total = 0;
  for (let i = 1; i < src.length; i++)
    total += Math.hypot(src[i]![0] - src[i - 1]![0], src[i]![1] - src[i - 1]![1]);
  const ns = noise(o.rnd, Math.max(3, o.lumps ?? Math.round(total / 14)));
  let walked = 0;
  for (let i = 1; i < src.length; i++) {
    const [x0, y0] = src[i - 1]!;
    const [x1, y1] = src[i]!;
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len === 0) continue;
    const nx = -(y1 - y0) / len;
    const ny = (x1 - x0) / len;
    const n = Math.max(1, Math.round(len / step));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) {
      const t = k / n;
      const push = at(ns, Math.min(1, (walked + t * len) / total)) * amp;
      out.push([x0 + (x1 - x0) * t + nx * push, y0 + (y1 - y0) * t + ny * push]);
    }
    walked += len;
  }
  return out;
}

/** A closed organic shape: an ellipse pushed around by drifting noise. */
export function blob(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  o: { rnd: () => number; n?: number; amp?: number; lumps?: number },
): Pt[] {
  const n = o.n ?? 48;
  const amp = o.amp ?? 0.12;
  const ns = noise(o.rnd, o.lumps ?? 7);
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const a = t * Math.PI * 2;
    // Wrap the noise so the shape closes without a seam.
    const k = 1 + amp * (at(ns, t) * (1 - t) + at(ns, 0) * t);
    out.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return out;
}

/** Is the point inside the polygon? */
export function inside(p: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function bbox(poly: Pt[]): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of poly) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

/**
 * Rules evenly spaced lines across a shape and keeps the parts inside it: the way a pen shades
 * a face. `density` fades the lines in along the direction they run, for a gradient of shade.
 */
export function hatch(
  poly: Pt[],
  o: {
    rnd: () => number;
    angle: number;
    gap: number;
    jitter?: number;
    /** 0 keeps every line, 1 drops all but the far end: shading that fades out. */
    fade?: number;
    /** Leaves a gap at each end of a line, so the strokes don't make a solid block. */
    inset?: number;
  },
): string {
  const a = (o.angle * Math.PI) / 180;
  const cos = Math.cos(-a);
  const sin = Math.sin(-a);
  const rot = (p: Pt): Pt => [p[0] * cos - p[1] * sin, p[0] * sin + p[1] * cos];
  const back = (p: Pt): Pt => [p[0] * cos + p[1] * sin, -p[0] * sin + p[1] * cos];
  const turned = poly.map(rot);
  const [x0, y0, x1, y1] = bbox(turned);
  const jitter = o.jitter ?? 0.25;
  const fade = o.fade ?? 0;
  const inset = o.inset ?? 0;
  let d = '';
  let row = 0;
  for (let y = y0 + o.gap * 0.5; y < y1; y += o.gap, row++) {
    const t = (y - y0) / Math.max(1, y1 - y0);
    if (fade > 0 && o.rnd() < fade * (1 - t)) continue;
    // Where this ruled line crosses the shape.
    const xs: number[] = [];
    for (let i = 0, j = turned.length - 1; i < turned.length; j = i++) {
      const [xi, yi] = turned[i]!;
      const [xj, yj] = turned[j]!;
      if (yi > y !== yj > y) xs.push(xi + ((xj - xi) * (y - yi)) / (yj - yi));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      let sx = xs[i]! + inset;
      let ex = xs[i + 1]! - inset;
      if (ex - sx < 1.2) continue;
      sx += (o.rnd() - 0.5) * 2 * jitter;
      ex += (o.rnd() - 0.5) * 2 * jitter;
      const wob = (o.rnd() - 0.5) * jitter;
      const s = back([sx, y + wob]);
      const e = back([ex, y - wob]);
      d += `M${r1(s[0])},${r1(s[1])}L${r1(e[0])},${r1(e[1])}`;
    }
    void x0;
    void x1;
    void row;
  }
  return d;
}

/** Scatters dots inside a shape, thicker toward the bottom where a form turns away. */
export function stipple(
  poly: Pt[],
  o: { rnd: () => number; n: number; r?: number; bias?: number },
): string {
  const [x0, y0, x1, y1] = bbox(poly);
  const r = o.r ?? 0.5;
  const bias = o.bias ?? 0;
  let d = '';
  for (let i = 0, tries = 0; i < o.n && tries < o.n * 12; tries++) {
    const px = x0 + o.rnd() * (x1 - x0);
    const t = o.rnd();
    const py = y0 + (bias > 0 ? t ** (1 / (1 + bias)) : t) * (y1 - y0);
    if (!inside([px, py], poly)) continue;
    const rr = r * (0.6 + o.rnd() * 0.8);
    d += `M${r1(px - rr)},${r1(py)}a${r1(rr)},${r1(rr)} 0 1 0 ${r1(2 * rr)},0a${r1(rr)},${r1(rr)} 0 1 0 ${r1(-2 * rr)},0`;
    i++;
  }
  return d;
}

/**
 * A brush stroke along a line: a filled shape that starts at `w0` wide and ends at `w1`, so a
 * stroke can taper the way a nib or a brush lifts off the paper.
 */
export function brush(pts: Pt[], w0: number, w1 = 0): string {
  if (pts.length < 2) return '';
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;
    const t = i / (pts.length - 1);
    // Fattest a third of the way along, like a pen pressed and then lifted.
    const w = (w0 + (w1 - w0) * t) * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.15)));
    left.push([p[0] + nx * w, p[1] + ny * w]);
    right.push([p[0] - nx * w, p[1] - ny * w]);
  }
  return pathOf([...left, ...right.reverse()], true);
}

/** Several strokes in one path: handy for grass, stalks, rigging and rain. */
export function strokes(lines: Pt[][]): string {
  return lines.map((l) => pathOf(l)).join('');
}

/**
 * A chain of small arcs along a line: the way a pen draws a leafy crown, a fleece or a hedge,
 * where a smooth curve would read as a balloon. Each step bulges out by `r`.
 */
export function scallop(pts: Pt[], r: number, out = true): string {
  if (pts.length < 2) return '';
  let d = `M${r1(pts[0]![0])},${r1(pts[0]![1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [x, y] = pts[i]!;
    const [px, py] = pts[i - 1]!;
    const len = Math.hypot(x - px, y - py);
    const rr = Math.max(r, len / 1.9);
    d += `A${r1(rr)},${r1(rr)} 0 0 ${out ? 1 : 0} ${r1(x)},${r1(y)}`;
  }
  return d;
}

/** Points around an ellipse, for scalloping or wandering into a shape. */
export function ring(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  n: number,
  from = 0,
  to = Math.PI * 2,
): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

/** An angular shape: a rock, a crystal, a cut stone. Radii vary, corners stay sharp. */
export function facet(
  cx: number,
  cy: number,
  r: number,
  n: number,
  rnd: () => number,
  squash = 1,
): Pt[] {
  const out: Pt[] = [];
  const start = rnd() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = start + (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.35;
    const rr = r * (0.62 + rnd() * 0.55);
    out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * squash]);
  }
  return out;
}

/** Mixes two hex colours; t is how much of the second. */
export function mix(a: string, b: string, t: number): string {
  const read = (h: string): [number, number, number] => {
    const n = h.replace('#', '');
    const full = n.length === 3 ? n.replace(/./g, (c) => c + c) : n;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
  };
  const [r, g, bl] = read(a);
  const [r2, g2, b2] = read(b);
  const out = [r + (r2 - r) * t, g + (g2 - g) * t, bl + (b2 - bl) * t];
  return (
    '#' +
    out
      .map((v) =>
        Math.round(Math.max(0, Math.min(255, v)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

/** A hand-drawn circle: a ring walked as short segments, so it is never quite round. */
export function circle(cx: number, cy: number, r: number, rnd: () => number, amp = 0.6): Pt[] {
  return wander(ring(cx, cy, r, r, Math.max(16, Math.round(r * 1.6))), {
    rnd,
    step: Math.max(1.5, r / 6),
    amp,
    lumps: 6,
    close: false,
  });
}
