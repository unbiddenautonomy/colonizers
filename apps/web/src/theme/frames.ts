/**
 * Shaped frames for panels: SVG images cut into nine pieces with CSS border-image, so a panel
 * keeps its rectangle for the content while its outline is a coastline. The
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

/**
 * The coast along the top edge piece: two uneven bays, flat where pieces meet. `calm` flattens
 * the bays, from 1 (a drawn island) down towards 0 (a card with a soft edge).
 */
function coast(y: number, calm = 1): Seg[] {
  const x = S;
  const d = (n: number) => y + n * calm;
  return [
    [
      [x + 12, y],
      [x + 18, d(-9)],
      [x + 34, d(-8)],
    ],
    [
      [x + 48, d(-7)],
      [x + 52, d(6)],
      [x + 68, d(5)],
    ],
    [
      [x + 82, d(4)],
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
  /** How wavy the coast is: 1 is a drawn island, lower reads as a card with a soft edge. */
  calm?: number;
}

/** Where the coast sits, measured in from the image edge. Use it as border-image-outset. */
export const ISLAND_COAST = 62;

export function islandFrame(c: IslandColours): string {
  const calm = c.calm ?? 1;
  const ring = (d: number) =>
    loop(
      [S - (S - ISLAND_COAST + d), S],
      [corner(S - ISLAND_COAST + d), ...coast(ISLAND_COAST - d, calm)],
    );
  const land = loop([ISLAND_COAST, S], [corner(S - ISLAND_COAST), ...coast(ISLAND_COAST, calm)]);
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
      `<path d='${loop([ISLAND_COAST + 9, S], [corner(S - ISLAND_COAST - 9), ...coast(ISLAND_COAST + 9, calm)])}' fill='none' stroke='${c.shore}' stroke-opacity='0.18' stroke-width='1.2' stroke-dasharray='2 5' stroke-linecap='round'/>`,
  );
}

export const FRAME_SLICE = S;
