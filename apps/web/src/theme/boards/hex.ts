/**
 * The plain numbers behind a board tile, kept apart from the drawing components so the scene
 * builders can be read and tested without pulling in React.
 */

/** A hex's box at the board's hex size (60): 60·√3 wide, 120 tall, pointy top. */
export const W = 103.92;
export const H = 120;
export const CX = W / 2;
export const CY = H / 2;

export const BASE = ['forest', 'hills', 'pasture', 'fields', 'mountains', 'desert'] as const;
export type BaseType = (typeof BASE)[number];

/** Rounds to one decimal for shorter paths. */
export const r1 = (n: number) => Math.round(n * 10) / 10;

/** A regular polygon's points. */
export function poly(cx: number, cy: number, r: number, n: number, rot = -90): string {
  return Array.from({ length: n }, (_, i) => {
    const a = ((rot + (360 / n) * i) * Math.PI) / 180;
    return `${r1(cx + r * Math.cos(a))},${r1(cy + r * Math.sin(a))}`;
  }).join(' ');
}
