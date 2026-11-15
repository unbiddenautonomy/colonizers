/**
 * Shaped frames for panels: SVG images cut into nine pieces with CSS border-image, so a panel
 * keeps its rectangle for the content while its outline is a coastline or a torn poster. The
 * edges repeat, so a frame fits a panel of any size.
 *
 * Each frame is drawn in a square of side 2 * S + M: corners of S, edge pieces of M. One side
 * (the top-left corner and the top edge) is drawn, then turned to make the other three.
 */

type Pt = [number, number];
/** A cubic Bézier piece: two control points and an end point. */
type Seg = [Pt, Pt, Pt];

const S = 100; // corner slice
const M = 100; // edge piece
const W = 2 * S + M; // the whole image

/** Turns a point a quarter clockwise about the centre, k times. */
function turn([x, y]: Pt, k: number): Pt {
  let p: Pt = [x, y];
  for (let i = 0; i < k; i++) p = [W - p[1], p[0]];
  return p;
}

const f = (n: number) => Math.round(n * 10) / 10;
const pt = (p: Pt) => `${f(p[0])} ${f(p[1])}`;

/** A closed path from one side's segments (starting where the last one ends), turned four times. */
function loop(start: Pt, side: Seg[]): string {
  let d = `M${pt(start)}`;
  for (let k = 0; k < 4; k++) {
    for (const [a, b, c] of side) d += `C${pt(turn(a, k))} ${pt(turn(b, k))} ${pt(turn(c, k))}`;
  }
  return d + 'Z';
}

/** A quarter circle round the top-left corner, from the left side up to the top, at distance r. */
function corner(r: number): Seg {
  const c = S; // centre of the turn, where the corner piece meets the edges
  const k = 0.5523 * r;
  return [
    [c - r, c - k],
    [c - k, c - r],
    [c, c - r],
  ];
}

const svg = (body: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${W}' viewBox='0 0 ${W} ${W}'>${body}</svg>`,
  )}")`;

// ---- Islands: a coastline with depth contours around it ----

/** The coast along the top edge piece: two uneven bays, flat where pieces meet. */
function coast(y: number): Seg[] {
  const x = S;
  return [
    [
      [x + 12, y],
      [x + 18, y - 9],
      [x + 34, y - 8],
    ],
    [
      [x + 48, y - 7],
      [x + 52, y + 6],
      [x + 68, y + 5],
    ],
    [
      [x + 82, y + 4],
      [x + 90, y],
      [x + M, y],
    ],
  ];
}

export interface IslandColours {
  land: string;
  shore: string;
  /** The depth lines in the water around it. */
  water: string;
  dashed?: boolean;
  width?: number;
  /** Depth lines round the coast, 0 to 3. Small islands set close together want none. */
  rings?: number;
}

/** Where the coast sits, measured in from the image edge. Use it as border-image-outset. */
export const ISLAND_COAST = 62;

export function islandFrame(c: IslandColours): string {
  const ring = (d: number) =>
    loop(
      [S - (S - ISLAND_COAST + d), S],
      [corner(S - ISLAND_COAST + d), ...coast(ISLAND_COAST - d)],
    );
  const land = loop([ISLAND_COAST, S], [corner(S - ISLAND_COAST), ...coast(ISLAND_COAST)]);
  const sw = c.width ?? 2.5;
  const rings = [
    [10, 1.6, 0.55],
    [20, 1.2, 0.35],
    [30, 1, 0.2],
  ].slice(0, c.rings ?? 3);
  return svg(
    `<g fill='none' stroke='${c.water}' stroke-linejoin='round'>` +
      rings
        .map(([d, w, o]) => `<path d='${ring(d!)}' stroke-width='${w}' stroke-opacity='${o}'/>`)
        .join('') +
      `</g>` +
      `<path d='${land}' fill='${c.land}' stroke='${c.shore}' stroke-width='${sw}' stroke-linejoin='round'${
        c.dashed ? ` stroke-dasharray='7 6'` : ''
      }/>` +
      // A beach line just inside the coast.
      `<path d='${loop([ISLAND_COAST + 9, S], [corner(S - ISLAND_COAST - 9), ...coast(ISLAND_COAST + 9)])}' fill='none' stroke='${c.shore}' stroke-opacity='0.18' stroke-width='1.2' stroke-dasharray='2 5' stroke-linecap='round'/>`,
  );
}

// ---- Posters: a torn sheet pinned at the corners, with a ruled border inside ----

/** A torn edge along the top piece: small uneven teeth, flat where pieces meet. */
function torn(y: number): Seg[] {
  const x = S;
  const teeth = [0, -2.5, 1.5, -1, 2.5, -2, 0.5, -3, 1, -1.5, 0];
  const segs: Seg[] = [];
  const step = M / (teeth.length - 1);
  for (let i = 1; i < teeth.length; i++) {
    const x0 = x + step * (i - 1);
    const x1 = x + step * i;
    const y0 = y + teeth[i - 1]!;
    const y1 = y + teeth[i]!;
    segs.push([
      [x0 + step / 3, y0],
      [x1 - step / 3, y1],
      [x1, y1],
    ]);
  }
  return segs;
}

export interface PosterColours {
  paper: string;
  rule: string;
  pin: string;
}

/** Where the paper's edge sits, measured in from the image edge. */
export const POSTER_EDGE = 76;

export function posterFrame(c: PosterColours): string {
  const e = POSTER_EDGE;
  // A tight corner: paper, not a pebble.
  const cut = (d: number): Seg => [
    [d, S - 10],
    [S - 10, d],
    [S, d],
  ];
  const paper = loop([e, S], [cut(e), ...torn(e)]);
  // The ruled border: straight lines with square corners (a cubic with its controls on the line).
  const rule = (d: number) => {
    const a: Pt = [e + d, e + d];
    const end: Pt = [S + M, e + d];
    return loop(
      [e + d, S],
      [
        [[e + d, S], a, a],
        [a, end, end],
      ],
    );
  };
  const pins = [
    [e + 9, e + 9],
    [W - e - 9, e + 9],
    [e + 9, W - e - 9],
    [W - e - 9, W - e - 9],
  ]
    .map(
      ([x, y]) =>
        `<circle cx='${x}' cy='${y}' r='4.5' fill='${c.pin}'/><circle cx='${x! - 1.3}' cy='${y! - 1.3}' r='1.4' fill='#ffffff' fill-opacity='0.55'/>`,
    )
    .join('');
  return svg(
    `<path d='${paper}' fill='${c.paper}'/>` +
      `<path d='${rule(16)}' fill='none' stroke='${c.rule}' stroke-width='2.5'/>` +
      `<path d='${rule(21)}' fill='none' stroke='${c.rule}' stroke-width='0.8'/>` +
      pins,
  );
}

export const FRAME_SLICE = S;
