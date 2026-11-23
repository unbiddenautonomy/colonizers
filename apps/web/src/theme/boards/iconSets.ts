import { ear, ell, P, type EarShape, type IconSet, type Part } from './icons.tsx';

/**
 * Each skin family's own drawings of the six resources, in the same 40 × 24 box and with the same
 * part roles as the plain set in icons.tsx, so a skin's colours carry over unchanged.
 *
 * - Grand Saloon: symmetric 1930s figures. Three spires, a stepped brick ziggurat, a ram's head,
 *   a sheaf with cut kernels, a cut rock, a sunrise.
 * - Wonderland (now used only by the Big Mom board): storybook things. Cloud trees, a teetering brick stack, a ball of wool with
 *   needles, two ears tied with a bow, a rock with a pick, an hourglass.
 * - Archipelago: island things. Palms, sun-dried blocks, a sheep, a wheat stalk with leaves, a
 *   cairn of beach stones, a starfish.
 */

const f = (n: number) => Math.round(n * 100) / 100;
const pt = (x: number, y: number) => `${f(x)},${f(y)}`;

const circ = (x: number, y: number, r: number) => ell(x, y, r, r);

/** A closed shape through the points. */
function poly(pts: [number, number][]): string {
  return `M${pts.map(([x, y]) => pt(x, y)).join(' L')} Z`;
}

/** A rounded rectangle. */
function rrect(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x + r} Q${x},${y + h} ${x},${y + h - r} V${y + r} Q${x},${y} ${x + r},${y} Z`;
}

/**
 * A pointed oval from (x1, y1) to (x2, y2), bulging `w` on each side. `arch` bows it towards the
 * top of the box, as a drooping leaf.
 */
function lens(x1: number, y1: number, x2: number, y2: number, w: number, arch = 0): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  let nx = -dy / len;
  let ny = dx / len;
  if (ny > 0) [nx, ny] = [-nx, -ny];
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const c = (k: number) => pt(mx + nx * k, my + ny * k);
  return `M${pt(x1, y1)} Q${c(2 * (arch + w))} ${pt(x2, y2)} Q${c(2 * (arch - w))} ${pt(x1, y1)} Z`;
}

/** An ellipse whose edge is `n` round bumps, as fleece or a leafy crown. */
function fleece(cx: number, cy: number, rx: number, ry: number, n: number, start = -90): string {
  const pts = Array.from({ length: n }, (_, i) => {
    const a = ((start + (360 * i) / n) * Math.PI) / 180;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as const;
  });
  let d = `M${pt(pts[0]![0], pts[0]![1])}`;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i]!;
    const [bx, by] = pts[(i + 1) % n]!;
    const r = Math.hypot(bx - ax, by - ay) * 0.6;
    d += ` A${f(r)},${f(r)} 0 0 1 ${pt(bx, by)}`;
  }
  return `${d} Z`;
}

/** A rhombus, for cut kernels and flecks. */
function rhomb(cx: number, cy: number, rx: number, ry: number, deg = 0): string {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const at = (x: number, y: number): [number, number] => [cx + x * c - y * s, cy + x * s + y * c];
  return poly([at(0, -ry), at(rx, 0), at(0, ry), at(-rx, 0)]);
}

/** A starfish: five arms with round tips and hollow sides. */
function starfish(cx: number, cy: number, outer: number, deg = 0): string {
  const at = (a: number, r: number) => {
    const t = (a * Math.PI) / 180;
    return pt(cx + r * Math.cos(t), cy + r * Math.sin(t));
  };
  const tip = 1.5;
  let d = '';
  for (let i = 0; i < 5; i++) {
    const a = deg - 90 + i * 72;
    d += `${i ? ' L' : 'M'}${at(a - 7, outer)} A${tip},${tip} 0 0 1 ${at(a + 7, outer)}`;
    d += ` Q${at(a + 36, 2.4)} `;
    d += at(a + 65, outer);
  }
  return `${d} Z`;
}

/** A brick seen from the front and a little from above: three holes on top, the right side shaded. */
function brick3d(x: number, y: number, w: number, h: number, d: number): Part[] {
  const top: [number, number][] = [
    [x, y],
    [x + d, y - d],
    [x + w + d, y - d],
    [x + w, y],
  ];
  const side: [number, number][] = [
    [x + w, y],
    [x + w + d, y - d],
    [x + w + d, y + h - d],
    [x + w, y + h],
  ];
  const front: [number, number][] = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
  return [
    P('body', poly(top)),
    ...[0.27, 0.5, 0.73].map((t) => P('solid', ell(x + w * t + d / 2, y - d / 2, 1.5, d * 0.26))),
    P('solid', poly(side)),
    P('body', poly(front)),
  ];
}

// ---- Grand Saloon ----

const CUT_EAR: EarShape = {
  pairs: 3,
  kx: 1.25,
  ky: 2.3,
  gap: 3.1,
  spread: 1.9,
  tilt: 30,
  kernel: rhomb,
};

export const DECO_ICONS: IconSet = {
  // Three spires, the middle one tallest and banded.
  forest: [
    P('line', 'M20,19 V23.8 M10,20 V23.8 M30,20 V23.8'),
    P('body', 'M10,6.5 L14.2,20 H5.8 Z'),
    P('body', 'M30,6.5 L34.2,20 H25.8 Z'),
    P('body', 'M20,0.5 L26.2,19 H13.8 Z'),
    P('line', 'M16.4,15 L20,11.6 L23.6,15 M17.7,9.6 L20,7 L22.3,9.6'),
  ],
  // A stepped ziggurat of bricks.
  hills: [
    P('body', 'M2,23 V17 H8 V11 H14 V5 H26 V11 H32 V17 H38 V23 Z'),
    P(
      'line',
      'M8,17 H32 M14,11 H26 M11,17 V23 M20,17 V23 M29,17 V23 M15.5,11 V17 M24.5,11 V17 M20,5 V11',
    ),
  ],
  // A ram's head, horns curled.
  pasture: [
    P(
      'line',
      'M16,6.2 C11,1.5 3.6,3.6 3.4,10 C3.2,15.6 9.6,17 11.2,13 C12.4,10 9.4,8.2 7.8,10.2',
      1.6,
    ),
    P(
      'line',
      'M24,6.2 C29,1.5 36.4,3.6 36.6,10 C36.8,15.6 30.4,17 28.8,13 C27.6,10 30.6,8.2 32.2,10.2',
      1.6,
    ),
    P(
      'body',
      'M15.2,6 Q20,2.6 24.8,6 L25.4,11.5 Q24.6,17.5 22.2,21.6 Q20,23.4 17.8,21.6 Q15.4,17.5 14.6,11.5 Z',
    ),
    P('solid', rhomb(17.6, 11.6, 1.2, 0.8)),
    P('solid', rhomb(22.4, 11.6, 1.2, 0.8)),
    P('line', 'M18.6,19.2 L20,20.4 L21.4,19.2'),
  ],
  // Three ears with cut kernels, banded.
  fields: [
    ...ear(20, 24, 17.5, -32, CUT_EAR),
    ...ear(20, 24, 21, 0, CUT_EAR),
    ...ear(20, 24, 17.5, 32, CUT_EAR),
    P('line', 'M16.5,19.2 H23.5'),
  ],
  // A cut rock.
  mountains: [
    P('body', 'M3,23 L6.5,14.5 L13,8 L21,4.5 L29,7.5 L34.5,14 L37,23 Z'),
    P('line', 'M13,8 L18.5,13 L29,7.5 M18.5,13 L15.5,23 M18.5,13 L34.5,14'),
  ],
  // The sun rising over the sand.
  desert: [
    P(
      'line',
      [22.5, 45, 67.5, 90, 112.5, 135, 157.5]
        .map((deg) => {
          const a = (deg * Math.PI) / 180;
          return `M${pt(20 + 9.8 * Math.cos(a), 19 - 9.8 * Math.sin(a))} L${pt(20 + 13 * Math.cos(a), 19 - 13 * Math.sin(a))}`;
        })
        .join(' '),
    ),
    P('line', 'M2.5,19 H37.5'),
    P('body', 'M12.4,19 A7.6,7.6 0 0 1 27.6,19 Z'),
    P('line', 'M8,23 Q15,21 22,23 M24,23 Q29.5,21.4 34,22.8'),
  ],
};

// ---- Wonderland ----

const STORY_EAR: EarShape = { pairs: 3, kx: 1.15, ky: 2.3, gap: 3.1, spread: 1.9, tilt: 28 };

export const WONDER_ICONS: IconSet = {
  // Two cloud trees on bending trunks.
  forest: [
    P('body', 'M11.8,23.8 Q13,19.5 12.6,14 H15.6 Q15.4,19.5 17,23.8 Z'),
    P('body', 'M29.4,23.8 Q30.4,20.5 30.2,16 H32.4 Q32.4,20.5 33.4,23.8 Z'),
    P('body', fleece(13.6, 8.4, 8.4, 7.2, 7)),
    P('body', fleece(31.4, 12, 5.6, 5.4, 6)),
  ],
  // A castle wall of bricks.
  hills: [
    P('body', 'M4,23 V4 H10 V9 H17 V4 H23 V9 H30 V4 H36 V23 Z'),
    P(
      'line',
      'M4,9 H10 M17,9 H23 M30,9 H36 M4,16 H36 M13.5,9 V16 M26.5,9 V16 M8,16 V23 M20,16 V23 M32,16 V23',
    ),
  ],
  // A ball of wool with knitting needles in it.
  pasture: [
    P('line', 'M14,15 L31,1.8 M17,17 L36.5,7.2'),
    P('solid', circ(31.4, 1.5, 1.4)),
    P('solid', circ(37, 6.9, 1.4)),
    P('body', circ(17, 13.6, 9.6)),
    P(
      'line',
      'M9.1,8.1 Q15.5,14 23.4,6.5 M7.4,14.4 Q16.5,18.8 26,10.3 M10.8,21 Q19.5,21.2 26.3,16.1',
    ),
    P('line', 'M24.5,20.6 Q29,24.4 33,22 T38.5,21.4'),
  ],
  // Two ears of wheat crossed and tied with a bow.
  fields: [
    ...ear(17.5, 24, 21.5, 24, STORY_EAR),
    ...ear(22.5, 24, 21.5, -24, STORY_EAR),
    P('line', 'M19.6,18.9 L16.6,21.6 M20.4,18.9 L23.4,21.6'),
    P('body', lens(20, 18.4, 15.2, 16.4, 1.9)),
    P('body', lens(20, 18.4, 24.8, 16.4, 1.9)),
    P('solid', circ(20, 18.4, 1.2)),
  ],
  // A rock with a pick leaning on it.
  mountains: [
    P(
      'body',
      'M3,23.5 L4,17 Q5,13 9,12 L13.5,9 Q17,7.6 20.5,9 L25,10.6 Q28.6,12.4 29.2,16.4 L30.2,23.5 Z',
    ),
    P('line', 'M13.5,9 L15.6,13 L14,16.4'),
    P('line', 'M22.5,23.6 L32.5,6.4', 1.3),
    P('body', 'M26.15,3.48 Q34.7,2.68 38.25,10.5 Q32.9,5.79 26.15,3.48 Z'),
  ],
  // An hourglass: the sand runs through.
  desert: [
    P('line', 'M12.6,4 V21 M27.4,4 V21'),
    P(
      'body',
      'M14.6,4 H25.4 Q25.4,9.6 21,12.5 Q25.4,15.4 25.4,21 H14.6 Q14.6,15.4 19,12.5 Q14.6,9.6 14.6,4 Z',
    ),
    P('solid', 'M15.6,21 Q20,15.2 24.4,21 Z'),
    P('solid', 'M16.6,7.6 H23.4 Q22.4,10.2 20,11.8 Q17.6,10.2 16.6,7.6 Z'),
    P('line', 'M20,12 V18', 0.6),
    P('body', rrect(10.5, 1, 19, 3, 1)),
    P('body', rrect(10.5, 21, 19, 3, 1)),
  ],
};

// ---- Archipelago ----

const TALL_EAR: EarShape = { pairs: 4, kx: 1.2, ky: 2.4, gap: 3, spread: 2, tilt: 26 };

export const ISLES_ICONS: IconSet = {
  // Two palms, one leaning.
  forest: [
    P('body', 'M15.6,23.8 Q11.8,15.5 13.6,6.8 L15.8,7 Q14.6,15.5 18.8,23.8 Z'),
    P('body', 'M27,23.8 Q27.2,17.5 30.8,12 L32.6,12.8 Q29.6,17.8 29.8,23.8 Z'),
    P('body', lens(14.7, 6.4, 4.2, 10.6, 1.6, 1.2)),
    P('body', lens(14.7, 6.4, 7, 1.6, 1.5, 0.8)),
    P('body', lens(14.7, 6.4, 22.4, 2, 1.5, 0.8)),
    P('body', lens(14.7, 6.4, 24.4, 10.2, 1.6, 1.2)),
    P('body', lens(31.8, 11.8, 26.6, 9.6, 1.2, 0.6)),
    P('body', lens(31.8, 11.8, 33.4, 5.4, 1.2, 0.6)),
    P('body', lens(31.8, 11.8, 38.6, 8.2, 1.3, 0.9)),
    P('body', lens(31.8, 11.8, 38, 15.4, 1.3, 0.9)),
    P('solid', circ(13.8, 7.9, 1.3)),
    P('solid', circ(16, 8.2, 1.3)),
    P('solid', circ(31, 13.4, 1.1)),
  ],
  // Three sun-dried blocks, two down and one on top.
  hills: [
    ...brick3d(3, 16.5, 15, 7, 2.6),
    ...brick3d(19.5, 16.5, 15, 7, 2.6),
    ...brick3d(12.3, 8.2, 15, 7, 2.6),
  ],
  // A sheep facing left.
  pasture: [
    P('line', 'M15.5,17 V23.6 M19.5,18 V23.6 M26.5,18 V23.6 M30.5,17 V23.6'),
    P('body', fleece(22.5, 12, 12.5, 7.4, 10)),
    P('solid', ell(8.6, 13.4, 4.6, 3.3, -32)),
    P('solid', ell(12.6, 10.4, 2.6, 1.1, 20)),
  ],
  // A wheat stalk with two leaves.
  fields: [
    P('body', lens(20, 21.5, 8.4, 13.2, 1.8, 1)),
    P('body', lens(20, 19.8, 31.8, 11.4, 1.8, 1)),
    ...ear(20, 24, 21.5, 0, TALL_EAR),
  ],
  // A cairn of beach stones.
  mountains: [
    P('body', ell(20, 19.6, 14, 4.1)),
    P('body', ell(19.2, 12.4, 9.6, 3.5, -4)),
    P('body', ell(21, 5.8, 5.8, 3, 7)),
  ],
  // A starfish on the sand.
  desert: [
    P('body', starfish(20, 12.8, 11.2, 8)),
    ...[0, 1, 2, 3, 4].map((i) => {
      const a = ((8 - 90 + i * 72) * Math.PI) / 180;
      return P('solid', circ(20 + 6 * Math.cos(a), 12.8 + 6 * Math.sin(a), 0.8));
    }),
  ],
};
