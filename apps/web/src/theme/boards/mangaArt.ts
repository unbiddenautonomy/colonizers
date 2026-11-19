/**
 * The six land tiles of the Straw Hat board, drawn as a manga colour page: an inked scene per
 * terrain, modelled with light and shade rather than filled flat.
 *
 * Three things do the work. Shapes are built rather than smoothed: a crown is a chain of small
 * arcs, a rock is a cut polygon, every line is a run of short segments that wanders. Form comes
 * from gradients: the sun is up and to the left, so each mass runs from a warm lit side to a
 * cool shaded one, and the ground graduates away from the horizon. Ink goes on last: ruled
 * shading, stipple and screentone, the way a page is finished by hand.
 *
 * A scene comes back as gradient definitions and layers of path data; the board skin resolves
 * the roles to its own colours, so another crew can reuse a scene with its own palette.
 */

import {
  brush,
  facet,
  hatch,
  pathOf,
  ring,
  rng,
  scallop,
  stipple,
  strokes,
  wander,
  type Pt,
} from './ink.ts';
import { BASE, H, W, type BaseType } from './hex.ts';

/**
 * What a colour is for. The skin turns these into real colours: shades run cool and lights run
 * warm, which is what stops a tile reading as one hue at three brightnesses.
 */
export type InkRole =
  | 'land' // the land's own colour
  | 'mid' // a step into shade
  | 'dark' // solid shade
  | 'shadow' // the deepest, coolest shade
  | 'light' // lit faces
  | 'glow' // the brightest light, almost white
  | 'ink' // the pen
  | 'tone'; // screentone dots

export interface InkStop {
  at: number;
  role: InkRole;
  opacity?: number;
}

export interface InkGrad {
  id: string;
  kind: 'linear' | 'radial';
  /** linear: x1, y1, x2, y2. radial: cx, cy, r, then an optional focus fx, fy. */
  at: number[];
  stops: InkStop[];
}

export interface InkLayer {
  d: string;
  /** A flat colour… */
  role?: InkRole;
  /** …or one of the scene's gradients. */
  grad?: string;
  /** Filled, or stroked at this width. */
  width?: number;
  opacity?: number;
  /** Round the ends of a stroked line: grass and stalks want it, outlines don't. */
  round?: boolean;
}

export interface InkScene {
  grads: InkGrad[];
  layers: InkLayer[];
}

/** Three line weights, so a drawing has a near edge, an inner edge and texture. */
const CONTOUR = 2.5;
const INNER = 1.2;
const TEXTURE = 0.75;

/** Collects the gradients a scene needs, each under its own id. */
function gradients(prefix: string) {
  const grads: InkGrad[] = [];
  let n = 0;
  return {
    grads,
    /** A gradient along a line: ground falling away, or a face turning from the light. */
    lin(x1: number, y1: number, x2: number, y2: number, stops: InkStop[]): string {
      const id = `${prefix}-g${n++}`;
      grads.push({ id, kind: 'linear', at: [x1, y1, x2, y2], stops });
      return id;
    },
    /** A gradient out from a point: a lit crown, a sun, a pool of shadow. */
    rad(cx: number, cy: number, r: number, stops: InkStop[], fx?: number, fy?: number): string {
      const id = `${prefix}-g${n++}`;
      grads.push({
        id,
        kind: 'radial',
        at: fx === undefined ? [cx, cy, r] : [cx, cy, r, fx, fy!],
        stops,
      });
      return id;
    },
  };
}

const line = (
  d: string,
  role: InkRole,
  width: number,
  opacity?: number,
  round?: boolean,
): InkLayer => ({
  d,
  role,
  width,
  ...(opacity === undefined ? {} : { opacity }),
  ...(round ? { round: true } : {}),
});
const area = (d: string, role: InkRole, opacity?: number): InkLayer => ({
  d,
  role,
  ...(opacity === undefined ? {} : { opacity }),
});
const shaded = (d: string, grad: string, opacity?: number): InkLayer => ({
  d,
  grad,
  ...(opacity === undefined ? {} : { opacity }),
});

/** The whole tile as one path, for a wash behind everything. */
const FULL = `M-6,-6H${W + 6}V${H + 6}H-6Z`;

/** Screentone: dots that thicken toward the bottom, the way manga shades a form. */
function screentone(rnd: () => number, from = 0.45, step = 4.6): string {
  let d = '';
  const top = H * from;
  for (let row = 0, y = top; y < H + 4; y += step, row++) {
    const t = (y - top) / (H - top);
    const r = 0.26 + 1.1 * t ** 1.5;
    for (let x = row % 2 ? step / 2 : step; x < W; x += step) {
      const rr = r * (0.85 + rnd() * 0.3);
      d += `M${(x - rr).toFixed(1)},${y.toFixed(1)}a${rr.toFixed(1)},${rr.toFixed(1)} 0 1 0 ${(2 * rr).toFixed(1)},0a${rr.toFixed(1)},${rr.toFixed(1)} 0 1 0 ${(-2 * rr).toFixed(1)},0`;
    }
  }
  return d;
}

/** A pool of shadow on the ground under something standing on it. */
function castShadow(
  g: ReturnType<typeof gradients>,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): InkLayer {
  const id = g.rad(cx, cy, rx, [
    { at: 0, role: 'shadow', opacity: 0.42 },
    { at: 0.55, role: 'shadow', opacity: 0.2 },
    { at: 1, role: 'shadow', opacity: 0 },
  ]);
  const squash = ry / rx;
  return shaded(
    `M${(cx - rx).toFixed(1)},${cy.toFixed(1)}a${rx.toFixed(1)},${(rx * squash).toFixed(1)} 0 1 0 ${(2 * rx).toFixed(1)},0a${rx.toFixed(1)},${(rx * squash).toFixed(1)} 0 1 0 ${(-2 * rx).toFixed(1)},0`,
    id,
  );
}

/**
 * Sky and ground, graduated: the sky lightens toward the horizon and the ground darkens as it
 * comes forward, which is what gives a flat tile depth before anything is drawn on it.
 */
function backdrop(
  g: ReturnType<typeof gradients>,
  rnd: () => number,
  horizon: number,
  clouds: [number, number, number][] = [],
): InkLayer[] {
  const skyId = g.lin(0, -6, 0, horizon + 2, [
    { at: 0, role: 'mid' },
    { at: 0.55, role: 'land' },
    { at: 1, role: 'glow', opacity: 0.85 },
  ]);
  const groundId = g.lin(0, horizon, 0, H + 6, [
    { at: 0, role: 'light' },
    { at: 0.35, role: 'land' },
    { at: 1, role: 'dark' },
  ]);
  const out: InkLayer[] = [
    shaded(`M-6,-6H${W + 6}V${horizon + 2}H-6Z`, skyId),
    shaded(`M-6,${horizon}H${W + 6}V${H + 6}H-6Z`, groundId),
  ];
  let puff = '';
  let edge = '';
  for (const [cx, cy, r] of clouds) {
    const top = ring(cx, cy, r, r * 0.42, 9, Math.PI, Math.PI * 2);
    puff +=
      scallop(top, r * 0.3) +
      `L${(cx + r).toFixed(1)},${cy.toFixed(1)}L${(cx - r).toFixed(1)},${cy.toFixed(1)}Z`;
    edge += scallop(top, r * 0.3);
  }
  if (clouds.length) {
    out.push(area(puff, 'glow', 0.8));
    out.push(line(edge, 'ink', INNER, 0.45));
  }
  out.push(
    line(
      hatch(
        [
          [-6, -6],
          [W + 6, -6],
          [W + 6, horizon],
          [-6, horizon],
        ],
        { rnd, angle: 0, gap: 3.6, jitter: 0.3, fade: 0.8 },
      ),
      'ink',
      TEXTURE,
      0.09,
    ),
  );
  return out;
}

// ---- forest: three broadleaf trees over a tree line ----

function forest(prefix: string): InkScene {
  const rnd = rng(11);
  const g = gradients(prefix);
  const horizon = 46;
  const layers: InkLayer[] = backdrop(g, rnd, horizon, [
    [26, 20, 15],
    [74, 14, 12],
  ]);

  // A wall of trees along the horizon, in haze: lighter at the top, darker at its foot.
  const far: Pt[] = [];
  for (let x = -6; x <= W + 6; x += 7)
    far.push([x, horizon - 4 - Math.abs(Math.sin(x * 0.11)) * 9]);
  const farId = g.lin(0, horizon - 14, 0, horizon + 6, [
    { at: 0, role: 'mid', opacity: 0.5 },
    { at: 1, role: 'dark', opacity: 0.8 },
  ]);
  layers.push(shaded(scallop(far, 6) + `L${W + 6},${horizon + 6}L-6,${horizon + 6}Z`, farId));

  /** One tree: a trunk that forks, and a crown of overlapping scallops lit from the left. */
  const tree = (cx: number, cy: number, r: number, seedy: number) => {
    const out: InkLayer[] = [];
    const foot = Math.min(H + 4, cy + r * 1.75);
    out.push(castShadow(g, cx + r * 0.3, foot, r * 1.2, r * 0.3));
    const trunkId = g.lin(cx - r * 0.3, 0, cx + r * 0.3, 0, [
      { at: 0, role: 'dark' },
      { at: 0.55, role: 'shadow' },
      { at: 1, role: 'ink' },
    ]);
    out.push(
      shaded(
        brush(
          wander(
            [
              [cx, cy + r * 0.2],
              [cx - r * 0.07, (cy + foot) / 2],
              [cx + r * 0.1, foot],
            ],
            { rnd, step: 2.5, amp: 0.35 },
          ),
          r * 0.12,
          r * 0.26,
        ),
        trunkId,
      ),
    );
    const boughs: Pt[][] = [];
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI * (0.18 + 0.64 * ((i + 0.5) / 4)) + (rnd() - 0.5) * 0.2;
      const len = r * (0.55 + rnd() * 0.35);
      boughs.push(
        wander(
          [
            [cx, cy + r * 0.35],
            [cx + Math.cos(a) * len * 0.6, cy + r * 0.35 + Math.sin(a) * len * 0.6],
            [cx + Math.cos(a) * len, cy + r * 0.35 + Math.sin(a) * len * 1.1],
          ],
          { rnd, step: 3, amp: 0.5 },
        ),
      );
    }
    // The crown: a ring of points pulled in and out, then walked as small arcs.
    const n = 13 + seedy;
    const pts: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const k = 0.78 + (0.3 * ((i * 7919) % 11)) / 11;
      pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * 0.82 * k]);
    }
    const crown = scallop(pts, r * 0.26) + 'Z';
    const crownId = g.rad(
      cx - r * 0.25,
      cy - r * 0.3,
      r * 1.75,
      [
        { at: 0, role: 'glow' },
        { at: 0.28, role: 'light' },
        { at: 0.62, role: 'land' },
        { at: 1, role: 'shadow' },
      ],
      cx - r * 0.45,
      cy - r * 0.5,
    );
    out.push(line(strokes(boughs), 'ink', INNER * 1.3, 0.8, true));
    out.push(shaded(crown, crownId));
    out.push(line(crown, 'ink', CONTOUR));
    // Ruled shading on the side away from the light, over the gradient's own shade.
    const lower = pts.filter(([x, y]) => y > cy - r * 0.15 || x > cx + r * 0.3);
    if (lower.length > 3)
      out.push(
        line(
          hatch(lower, { rnd, angle: 60, gap: 2.8, jitter: 0.5, fade: 0.4 }),
          'ink',
          TEXTURE,
          0.35,
        ),
      );
    // Sprigs: a short run of arcs, the way leaves are suggested rather than drawn one by one.
    let sprigs = '';
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = r * (0.15 + rnd() * 0.5);
      const sx = cx + Math.cos(a) * rr;
      const sy = cy + Math.sin(a) * rr * 0.8;
      const tilt = (rnd() - 0.5) * 1.2;
      sprigs += scallop(
        [
          [sx - r * 0.17, sy + r * 0.05],
          [sx - r * 0.05, sy - r * 0.02 + tilt],
          [sx + r * 0.08, sy + r * 0.03 + tilt],
          [sx + r * 0.2, sy - r * 0.02],
        ],
        r * 0.1,
      );
    }
    out.push(line(sprigs, 'ink', TEXTURE, 0.4));
    return out;
  };

  layers.push(...tree(70, 60, 19, 1));
  layers.push(...tree(26, 70, 23, 3));
  layers.push(...tree(50, 86, 16, 2));

  const grass: Pt[][] = [];
  for (let i = 0; i < 34; i++) {
    const x = 2 + rnd() * (W - 4);
    const y = horizon + 10 + rnd() * (H - horizon - 10);
    const h = 2.5 + rnd() * 3.5;
    grass.push([
      [x, y],
      [x + (rnd() - 0.5) * 2, y - h],
    ]);
  }
  layers.push(line(strokes(grass), 'ink', TEXTURE, 0.32, true));
  layers.push({ d: screentone(rnd, 0.62), role: 'tone', opacity: 0.14 });
  return { grads: g.grads, layers };
}

// ---- hills: a terraced clay pit cut into the red earth ----

function hills(prefix: string): InkScene {
  const rnd = rng(23);
  const g = gradients(prefix);
  const horizon = 30;
  const layers: InkLayer[] = backdrop(g, rnd, horizon, [[30, 13, 12]]);
  const rim = wander(
    [
      [-6, horizon + 4],
      [W * 0.3, horizon - 2],
      [W * 0.68, horizon + 5],
      [W + 6, horizon],
    ],
    { rnd, step: 4, amp: 1.2 },
  );
  layers.push(line(pathOf(rim), 'ink', CONTOUR));

  // The pit: lips of four terraces, each lower and smaller than the last. Every cut face runs
  // from light at its lip to shade at its foot, so the terraces read as steps down.
  const cx = 50;
  const floor = 116;
  for (let i = 0; i < 4; i++) {
    const rx = 62 - i * 12;
    const ry = 30 - i * 5.4;
    const cy = floor - (3 - i) * 13;
    const lip = wander(ring(cx, cy, rx, ry, 26, Math.PI, Math.PI * 2), {
      rnd,
      step: 3,
      amp: 0.8,
      lumps: 8,
    });
    const face: Pt[] = [...lip, ...lip.map(([x, y]): Pt => [x, y + 13]).reverse()];
    const faceId = g.lin(0, cy - ry, 0, cy + 14, [
      { at: 0, role: 'light' },
      { at: 0.45, role: 'land' },
      { at: 1, role: 'dark' },
    ]);
    layers.push(shaded(pathOf(face, true), faceId));
    layers.push(
      line(
        hatch(face, { rnd, angle: 88, gap: 4.6, jitter: 0.6, fade: 0.55 }),
        'ink',
        TEXTURE,
        0.18,
      ),
    );
    layers.push(line(pathOf(lip), 'ink', i === 3 ? INNER : CONTOUR * 0.8, 0.95));
  }
  // The pit floor catches the least light of all.
  const floorId = g.rad(cx, floor - 6, 32, [
    { at: 0, role: 'shadow', opacity: 0.5 },
    { at: 1, role: 'shadow', opacity: 0 },
  ]);
  layers.push(shaded(`M${cx - 32},${floor - 20}h64v36h-64Z`, floorId));

  // The ramp down into the pit, pinching as it goes.
  const rampL = wander(
    [
      [96, 42],
      [88, 62],
      [80, 84],
      [74, 104],
    ],
    { rnd, step: 4, amp: 0.6 },
  );
  const rampR = wander(
    [
      [W + 4, 48],
      [100, 68],
      [92, 90],
      [86, 108],
    ],
    { rnd, step: 4, amp: 0.6 },
  );
  const rampId = g.lin(74, 0, 104, 0, [
    { at: 0, role: 'glow', opacity: 0.55 },
    { at: 1, role: 'dark', opacity: 0.45 },
  ]);
  layers.push(shaded(pathOf([...rampL, ...rampR.slice().reverse()], true), rampId));
  layers.push(line(pathOf(rampL) + pathOf(rampR), 'ink', INNER, 0.55));

  // Spoil heaps on the rim: cut shapes, lit on one side.
  for (const [x, y, r] of [
    [16, 46, 8],
    [30, 52, 5],
    [92, 36, 6],
  ] as const) {
    const rock = facet(x, y, r, 7, rnd, 0.75);
    const rockId = g.lin(x - r, y - r, x + r, y + r, [
      { at: 0, role: 'light' },
      { at: 0.5, role: 'dark' },
      { at: 1, role: 'shadow' },
    ]);
    layers.push(castShadow(g, x + r * 0.3, y + r * 0.8, r * 1.2, r * 0.35));
    layers.push(shaded(pathOf(rock, true), rockId));
    layers.push(line(pathOf(rock, true), 'ink', INNER * 1.4));
    layers.push(
      line(
        hatch(
          rock.filter(([px]) => px > x - r * 0.1),
          { rnd, angle: 64, gap: 2.4, jitter: 0.3 },
        ),
        'ink',
        TEXTURE,
        0.35,
      ),
    );
  }
  layers.push({ d: screentone(rnd, 0.5), role: 'tone', opacity: 0.12 });
  return { grads: g.grads, layers };
}

// ---- pasture: a meadow, a fence and a small flock ----

function pasture(prefix: string): InkScene {
  const rnd = rng(37);
  const g = gradients(prefix);
  const horizon = 40;
  const layers: InkLayer[] = backdrop(g, rnd, horizon, [
    [30, 16, 14],
    [78, 12, 10],
  ]);
  // Two low banks, each catching the light along its top.
  for (const [y, k] of [
    [58, 0.75],
    [82, 1],
  ] as const) {
    const top = wander(
      [
        [-6, y + 6],
        [W * 0.35, y - 4],
        [W * 0.7, y + 3],
        [W + 6, y - 2],
      ],
      { rnd, step: 4, amp: 1.4 },
    );
    const id = g.lin(0, y - 6, 0, y + 32, [
      { at: 0, role: 'glow', opacity: 0.5 * k },
      { at: 0.4, role: 'light', opacity: 0.28 * k },
      { at: 1, role: 'dark', opacity: 0.22 },
    ]);
    layers.push(shaded(pathOf([...top, [W + 6, H + 6], [-6, H + 6]], true), id));
    layers.push(line(pathOf(top), 'ink', INNER, 0.45));
  }
  // A post-and-rail fence running back into the field.
  const posts: Pt[][] = [];
  const rail: Pt[] = [];
  for (let i = 0; i < 7; i++) {
    const x = 2 + i * 16.5;
    const y = 64 + i * 2.2;
    const h = 9 + i * 1.3;
    posts.push([
      [x, y],
      [x + 0.5, y - h],
    ]);
    rail.push([x, y - h * 0.72]);
  }
  layers.push(line(strokes(posts), 'ink', 2.2, 0.8, true));
  layers.push(line(pathOf(wander(rail, { rnd, step: 5, amp: 0.5 })), 'ink', INNER, 0.8));

  /** A sheep: a fleece of scallops lit from above, a dark face and four legs. */
  const sheep = (x: number, y: number, s: number, facing: 1 | -1) => {
    const out: InkLayer[] = [];
    out.push(castShadow(g, x, y + 9 * s, 12 * s, 3.2 * s));
    const body = ring(x, y, 9 * s, 6 * s, 11);
    const fleece = scallop(body, 2.6 * s) + 'Z';
    const id = g.rad(
      x - 3 * s,
      y - 4 * s,
      14 * s,
      [
        { at: 0, role: 'glow' },
        { at: 0.45, role: 'light' },
        { at: 1, role: 'dark' },
      ],
      x - 4 * s,
      y - 5 * s,
    );
    out.push(shaded(fleece, id));
    out.push(line(fleece, 'ink', CONTOUR * 0.8));
    const hx = x + facing * 9.5 * s;
    const head = [
      [hx - 2 * s, y - 2.6 * s],
      [hx + facing * 3.4 * s, y - 2 * s],
      [hx + facing * 3.8 * s, y + 1.4 * s],
      [hx - 1 * s, y + 2.2 * s],
    ] as Pt[];
    out.push(area(pathOf(head, true), 'ink'));
    out.push(
      line(
        strokes([
          [
            [x - 4 * s, y + 5 * s],
            [x - 4.6 * s, y + 9 * s],
          ],
          [
            [x - 1 * s, y + 5.4 * s],
            [x - 1.2 * s, y + 9.4 * s],
          ],
          [
            [x + 3 * s, y + 5 * s],
            [x + 3.4 * s, y + 9 * s],
          ],
        ]),
        'ink',
        2 * s,
        1,
        true,
      ),
    );
    return out;
  };
  layers.push(...sheep(34, 92, 1.05, -1));
  layers.push(...sheep(74, 104, 1.2, 1));
  layers.push(...sheep(88, 78, 0.8, 1));

  // Grass: tufts of blades that curve over, bigger toward the front.
  const tufts: Pt[][] = [];
  for (let i = 0; i < 44; i++) {
    const x = 1 + rnd() * (W - 2);
    const y = horizon + 8 + rnd() * (H - horizon - 8);
    const h = 2.5 + (y / H) * 5 + rnd() * 2;
    for (const lean of [-1, 0.2, 1.1]) {
      const tip = lean * h * 0.5;
      tufts.push([
        [x + lean * 0.5, y],
        [x + lean * 0.7 + tip * 0.2, y - h * 0.45],
        [x + lean * 0.8 + tip * 0.55, y - h * 0.8],
        [x + lean * 0.9 + tip, y - h * 0.95],
      ]);
    }
  }
  layers.push(line(strokes(tufts), 'ink', TEXTURE, 0.38, true));
  layers.push({ d: screentone(rnd, 0.6), role: 'tone', opacity: 0.1 });
  return { grads: g.grads, layers };
}

// ---- fields: ripe cereal in rows, with a cart track through it ----

function fields(prefix: string): InkScene {
  const rnd = rng(53);
  const g = gradients(prefix);
  const horizon = 38;
  const layers: InkLayer[] = backdrop(g, rnd, horizon, [[64, 16, 15]]);
  // A hedge along the far edge: one scalloped silhouette, not a row of circles.
  const hedgeTop: Pt[] = [];
  for (let x = -6; x <= W + 6; x += 8)
    hedgeTop.push([x, horizon - 1 - Math.abs(Math.sin(x * 0.17 + 1)) * 6]);
  const hedgeId = g.lin(0, horizon - 8, 0, horizon + 8, [
    { at: 0, role: 'dark', opacity: 0.75 },
    { at: 1, role: 'shadow', opacity: 0.9 },
  ]);
  layers.push(
    shaded(scallop(hedgeTop, 5) + `L${W + 6},${horizon + 7}L-6,${horizon + 7}Z`, hedgeId),
  );
  layers.push(line(scallop(hedgeTop, 5), 'ink', INNER * 1.3, 0.7));
  // Sun on the crop just in front of the hedge, falling away toward the front of the tile.
  const sunId = g.lin(0, horizon + 4, 0, H, [
    { at: 0, role: 'glow', opacity: 0.55 },
    { at: 0.4, role: 'light', opacity: 0.22 },
    { at: 1, role: 'dark', opacity: 0.28 },
  ]);
  layers.push(shaded(`M-6,${horizon + 2}H${W + 6}V${H + 6}H-6Z`, sunId));

  // The cart track: two wheel ruts curving away, with the crop parted around them.
  const rut = (off: number): Pt[] =>
    wander(
      [
        [54 + off * 2.6, H + 6],
        [50 + off * 1.8, 96],
        [52 + off * 1.3, 74],
        [57 + off * 0.8, 56],
        [60 + off * 0.5, horizon + 8],
      ],
      { rnd, step: 4, amp: 0.7 },
    );
  const ruts = [rut(-1), rut(1)];
  const trackId = g.lin(0, horizon, 0, H, [
    { at: 0, role: 'light', opacity: 0.45 },
    { at: 1, role: 'glow', opacity: 0.7 },
  ]);
  layers.push(shaded(pathOf([...ruts[0]!, ...ruts[1]!.slice().reverse()], true), trackId));
  layers.push(line(strokes(ruts), 'ink', INNER, 0.4));

  /** One ear of wheat: a stalk and a head of grains angled up off a spine. */
  const ear = (x: number, y: number, h: number, lean: number): string => {
    const top: Pt = [x + lean, y - h];
    const neck: Pt = [x + lean * 0.45, y - h * 0.62];
    let d = pathOf([[x, y], neck, top]);
    const grains = 4;
    for (let i = 0; i < grains; i++) {
      const t = i / grains;
      const px = neck[0] + (top[0] - neck[0]) * t;
      const py = neck[1] + (top[1] - neck[1]) * t;
      const len = h * 0.17 * (1 - t * 0.4);
      d += pathOf([
        [px, py],
        [px - len, py - len * 0.75],
      ]);
      d += pathOf([
        [px, py],
        [px + len, py - len * 0.75],
      ]);
    }
    return d;
  };
  let crop = '';
  let near = '';
  for (let row = 0; row < 10; row++) {
    const t = row / 9;
    const y = horizon + 10 + t * t * 78;
    const h = 7 + t * 15;
    const step = 4.6 + t * 6;
    for (let x = -2 + rnd() * step; x < W + 2; x += step) {
      const mid = 52 + (1 - t) * 7;
      if (Math.abs(x - mid) < 6 + t * 5) continue;
      const d = ear(x, y, h * (0.85 + rnd() * 0.3), (rnd() - 0.5) * h * 0.22);
      if (t > 0.72) near += d;
      else crop += d;
    }
  }
  // The far crop is drawn in the shade colour rather than ink, so the gold reads through it and
  // the field looks sunlit instead of scribbled over; only the near rows get a true black line.
  layers.push(line(crop, 'dark', TEXTURE, 0.55, true));
  layers.push(line(near, 'ink', INNER * 0.95, 0.5, true));
  layers.push({ d: screentone(rnd, 0.64), role: 'tone', opacity: 0.11 });
  return { grads: g.grads, layers };
}

// ---- mountains: three peaks with snow and cross-hatched faces ----

function mountains(prefix: string): InkScene {
  const rnd = rng(71);
  const g = gradients(prefix);
  const layers: InkLayer[] = [];
  // A cold sky: deeper overhead, pale down at the skyline.
  const skyId = g.lin(0, -6, 0, 96, [
    { at: 0, role: 'dark' },
    { at: 0.45, role: 'mid' },
    { at: 1, role: 'glow', opacity: 0.8 },
  ]);
  layers.push(shaded(FULL, skyId));
  const speed: Pt[][] = [];
  for (let i = 0; i < 11; i++) {
    const y = 6 + i * 2.6 + rnd() * 1.6;
    speed.push([
      [8 + rnd() * 14, y],
      [34 + rnd() * 62, y - 1 - rnd() * 1.6],
    ]);
  }
  layers.push(line(strokes(speed), 'ink', TEXTURE, 0.16, true));

  const base = 108;
  const peaks: { x: number; top: number; w: number }[] = [
    { x: 24, top: 40, w: 32 },
    { x: 86, top: 46, w: 30 },
    { x: 54, top: 18, w: 44 },
  ];
  for (const p of peaks) {
    const left: Pt[] = [
      [p.x - p.w, base],
      [p.x - p.w * 0.62, base - (base - p.top) * 0.38],
      [p.x - p.w * 0.34, base - (base - p.top) * 0.52],
      [p.x - p.w * 0.16, p.top + 7],
      [p.x, p.top],
    ];
    const right: Pt[] = [
      [p.x, p.top],
      [p.x + p.w * 0.18, p.top + 10],
      [p.x + p.w * 0.3, p.top + 7],
      [p.x + p.w * 0.58, base - (base - p.top) * 0.33],
      [p.x + p.w, base],
    ];
    const edge = [
      ...wander(left, { rnd, step: 2.2, amp: 1.3, lumps: 9 }),
      ...wander(right, { rnd, step: 2.2, amp: 1.3, lumps: 9 }),
    ];
    // The whole mass turns from the light: warm on the left arête, cold on the right face.
    const rockId = g.lin(p.x - p.w, p.top, p.x + p.w * 0.8, base, [
      { at: 0, role: 'light' },
      { at: 0.3, role: 'land' },
      { at: 0.62, role: 'dark' },
      { at: 1, role: 'shadow' },
    ]);
    layers.push(shaded(pathOf([...edge, [p.x + p.w, H + 6], [p.x - p.w, H + 6]], true), rockId));
    layers.push(line(pathOf(edge), 'ink', CONTOUR));
    const faceTop = p.top + (base - p.top) * 0.18;
    const shade: Pt[] = [...edge.filter(([x]) => x >= p.x - 1), [p.x + p.w, H + 6], [p.x, H + 6]];
    layers.push(
      line(
        hatch(shade, { rnd, angle: 66, gap: 2.6, jitter: 0.45, fade: 0.3 }),
        'ink',
        TEXTURE,
        0.35,
      ),
    );
    layers.push(
      line(
        hatch(shade, { rnd, angle: 114, gap: 4.6, jitter: 0.45, fade: 0.65 }),
        'ink',
        TEXTURE,
        0.2,
      ),
    );
    // Snow, cut off along a scalloped line, and shaded where it lies away from the sun.
    const snowY = p.top + (base - p.top) * 0.3;
    const cut = wander(
      [
        [p.x - p.w * 0.4, snowY - 1],
        [p.x - p.w * 0.18, snowY + 6],
        [p.x - p.w * 0.04, snowY - 2],
        [p.x + p.w * 0.14, snowY + 7],
        [p.x + p.w * 0.42, snowY + 1],
      ],
      { rnd, step: 2.4, amp: 1.6, lumps: 6 },
    );
    const cap = edge.filter(([, y]) => y <= snowY + 7);
    const snowId = g.lin(p.x - p.w * 0.5, p.top, p.x + p.w * 0.5, snowY + 8, [
      { at: 0, role: 'glow' },
      { at: 0.55, role: 'light' },
      { at: 1, role: 'mid' },
    ]);
    layers.push(shaded(pathOf([...cap, ...cut.slice().reverse()], true), snowId));
    layers.push(line(pathOf(cut), 'ink', INNER, 0.75));
    // Ridge lines running down the form, not random cracks.
    const ridges: Pt[][] = [];
    for (const k of [-0.5, -0.2, 0.25, 0.55]) {
      const sx = p.x + p.w * k * 0.5;
      ridges.push(
        wander(
          [
            [p.x + p.w * k * 0.12, faceTop + 4],
            [sx, faceTop + (base - faceTop) * 0.4],
            [p.x + p.w * k * 0.9, faceTop + (base - faceTop) * 0.75],
          ],
          { rnd, step: 3.5, amp: 0.8 },
        ),
      );
    }
    layers.push(line(strokes(ridges), 'ink', TEXTURE, 0.28));
  }
  // Scree at the foot, in the shade the peaks throw forward.
  const screeId = g.lin(0, 94, 0, H + 6, [
    { at: 0, role: 'shadow', opacity: 0 },
    { at: 1, role: 'shadow', opacity: 0.4 },
  ]);
  layers.push(shaded(`M-6,94H${W + 6}V${H + 6}H-6Z`, screeId));
  const steps: Pt[][] = [];
  for (let i = 0; i < 4; i++) {
    const y = 100 + i * 5;
    steps.push(
      wander(
        [
          [10 + i * 5, y],
          [40 + i * 3, y - 2],
          [72 - i * 4, y + 1],
        ],
        { rnd, step: 5, amp: 0.6 },
      ),
    );
  }
  layers.push(line(strokes(steps), 'ink', INNER, 0.35));
  layers.push({ d: screentone(rnd, 0.7), role: 'tone', opacity: 0.11 });
  return { grads: g.grads, layers };
}

// ---- desert: dunes, a wind-cut butte and a hard sun ----

function desert(prefix: string): InkScene {
  const rnd = rng(97);
  const g = gradients(prefix);
  const layers: InkLayer[] = [];
  // A hot sky: bleached white at the skyline, deeper up above.
  const skyId = g.lin(0, -6, 0, 86, [
    { at: 0, role: 'mid' },
    { at: 0.5, role: 'land' },
    { at: 1, role: 'glow' },
  ]);
  layers.push(shaded(FULL, skyId));
  // The sun, with its glare bleeding into the sky and a ring of ruled rays.
  const glareId = g.rad(74, 24, 32, [
    { at: 0, role: 'glow', opacity: 0.9 },
    { at: 0.45, role: 'glow', opacity: 0.32 },
    { at: 1, role: 'glow', opacity: 0 },
  ]);
  layers.push(shaded('M42,-8h64v64h-64Z', glareId));
  const rays: Pt[][] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    rays.push([
      [74 + Math.cos(a) * 13, 24 + Math.sin(a) * 13],
      [74 + Math.cos(a) * (17 + (i % 3) * 3), 24 + Math.sin(a) * (17 + (i % 3) * 3)],
    ]);
  }
  layers.push(area(pathOf(ring(74, 24, 11, 11, 24), true), 'glow'));
  layers.push(line(pathOf(ring(74, 24, 11, 11, 24), true), 'ink', INNER, 0.45));
  layers.push(line(strokes(rays), 'ink', TEXTURE, 0.28, true));

  // Dune crests: each band runs light along its crest into shade in the trough behind.
  const crests = [38, 58, 80, 104];
  crests.forEach((y, i) => {
    const crest = wander(
      [
        [-6, y + 7 - i * 2],
        [W * 0.22, y - 7],
        [W * 0.55, y + 5],
        [W * 0.8, y - 3],
        [W + 6, y - 8 + i * 2],
      ],
      { rnd, step: 3, amp: 1, lumps: 6 },
    );
    const id = g.lin(0, y - 8, 0, y + 32, [
      { at: 0, role: 'glow', opacity: i === 0 ? 0.45 : 0.9 },
      { at: 0.22, role: 'light' },
      { at: 1, role: 'dark' },
    ]);
    layers.push(shaded(pathOf([...crest, [W + 6, H + 6], [-6, H + 6]], true), id));
    layers.push(line(pathOf(crest), 'ink', i > 1 ? CONTOUR : INNER, 0.8));
    const lee: Pt[] = [...crest, ...crest.map(([x, yy]): Pt => [x, yy + 10]).reverse()];
    layers.push(
      line(hatch(lee, { rnd, angle: 3, gap: 2.2, jitter: 0.35, fade: 0.5 }), 'ink', TEXTURE, 0.26),
    );
    layers.push({
      d: stipple(
        [
          [-6, y + 2],
          [W + 6, y - 4],
          [W + 6, y + 24],
          [-6, y + 28],
        ],
        { rnd, n: 70, r: 0.5, bias: 0.6 },
      ),
      role: 'ink',
      opacity: 0.2,
    });
  });

  // A flat-topped butte: a straight skyline, battered sides and a skirt of fallen rock.
  const topY = 56;
  const butte: Pt[] = [
    [20, 104],
    [25, 78],
    [27, 62],
    [31, topY],
    [52, topY - 2],
    [57, 64],
    [60, 80],
    [66, 104],
  ];
  const cut = wander(butte, { rnd, step: 2.6, amp: 0.9 });
  const butteId = g.lin(20, 0, 66, 0, [
    { at: 0, role: 'light' },
    { at: 0.35, role: 'land' },
    { at: 0.75, role: 'dark' },
    { at: 1, role: 'shadow' },
  ]);
  layers.push(castShadow(g, 38, 104, 32, 7));
  layers.push(shaded(pathOf([...cut, [66, H + 6], [20, H + 6]], true), butteId));
  layers.push(line(pathOf(cut), 'ink', CONTOUR));
  layers.push(
    line(
      hatch([...cut.filter(([x]) => x > 44), [66, 108], [44, 108]], {
        rnd,
        angle: 84,
        gap: 3.2,
        jitter: 0.4,
        fade: 0.4,
      }),
      'ink',
      TEXTURE,
      0.24,
    ),
  );
  const strata: Pt[][] = [];
  for (let i = 0; i < 6; i++) {
    const y = 64 + i * 7;
    strata.push(
      wander(
        [
          [24 + i * 0.4, y],
          [42, y - 1.5],
          [60 - i * 0.4, y + 1],
        ],
        { rnd, step: 4, amp: 0.5 },
      ),
    );
  }
  layers.push(line(strokes(strata), 'ink', TEXTURE, 0.22));
  const talus = wander(
    [
      [12, 110],
      [24, 100],
      [43, 97],
      [62, 101],
      [74, 110],
    ],
    { rnd, step: 3, amp: 0.8 },
  );
  const talusId = g.lin(0, 96, 0, H + 6, [
    { at: 0, role: 'light' },
    { at: 1, role: 'dark' },
  ]);
  layers.push(shaded(pathOf([...talus, [74, H + 6], [12, H + 6]], true), talusId));
  layers.push(line(pathOf(talus), 'ink', INNER, 0.65));
  layers.push({
    d: stipple([...talus, [74, H + 4], [12, H + 4]], { rnd, n: 110, r: 0.6 }),
    role: 'ink',
    opacity: 0.26,
  });

  const wind: Pt[][] = [];
  for (let i = 0; i < 6; i++) {
    const y = 44 + rnd() * 70;
    wind.push(
      wander(
        [
          [-2, y],
          [30 + rnd() * 28, y - 3],
          [64 + rnd() * 40, y + 2],
        ],
        { rnd, step: 6, amp: 0.7 },
      ),
    );
  }
  layers.push(line(strokes(wind), 'ink', TEXTURE, 0.22, true));
  layers.push({ d: screentone(rnd, 0.6), role: 'tone', opacity: 0.09 });
  return { grads: g.grads, layers };
}

const SCENES: Record<BaseType, (prefix: string) => InkScene> = {
  forest,
  hills,
  pasture,
  fields,
  mountains,
  desert,
};

/** The drawn scene for each land, built once. */
export const MANGA_SCENES: Record<BaseType, InkScene> = Object.fromEntries(
  BASE.map((t) => [t, SCENES[t](`sh-${t}`)]),
) as Record<BaseType, InkScene>;
