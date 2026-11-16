import type { ReactNode } from 'react';
import type { BaseType } from './kit.tsx';

/**
 * One resource icon set shared by the board skins, so every skin says the same thing on the same
 * hex: trees for wood, a brick stack, a sheep, a wheat sheaf, a rock for ore, a cactus for desert.
 *
 * Each icon is drawn in a 40 × 24 box and is made of parts with a role, so a skin can colour them
 * its own way without redrawing them:
 * - body: a closed shape (filled or outlined)
 * - solid: a small shape always filled (a sheep's head, wheat kernels)
 * - line: an open stroke (a trunk, a dune, facet lines)
 * - grain: wheat kernels, solid unless the style outlines them
 *
 * `ICON_BOX` places the box in a hex: it stays inside the hex's sides and ends above the number
 * token, with room left at the top corner for a settlement.
 */

export interface Part {
  role: 'body' | 'solid' | 'line' | 'grain';
  d: string;
}

/** Where the 40 × 24 box sits inside the hex (W 103.92, H 120): x, y and scale. */
export const ICON_BOX = { x: 30.96, y: 11.5, s: 1.05 };

const P = (role: Part['role'], d: string): Part => ({ role, d });

/** An ellipse as a path, so every part is one path. */
function ell(cx: number, cy: number, rx: number, ry: number, rot = 0): string {
  const a = (rot * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const x1 = cx - rx * c;
  const y1 = cy - rx * s;
  const x2 = cx + rx * c;
  const y2 = cy + rx * s;
  const f = (n: number) => Math.round(n * 100) / 100;
  return `M${f(x1)},${f(y1)} A${rx},${ry} ${rot} 1 1 ${f(x2)},${f(y2)} A${rx},${ry} ${rot} 1 1 ${f(x1)},${f(y1)} Z`;
}

function pine(cx: number, top: number, k: number): string {
  const p = (dx: number, dy: number) => `${cx + dx * k},${top + dy * k}`;
  return `M${p(0, 0)} L${p(6, 7)} H${cx + 3.2 * k} L${p(8.5, 13)} H${cx + 5.2 * k} L${p(11, 20)} H${cx - 11 * k} L${p(-5.2, 13)} H${cx - 8.5 * k} L${p(-3.2, 7)} H${cx - 6 * k} Z`;
}

function ear(bx: number, by: number, len: number, deg: number): Part[] {
  const a = (deg * Math.PI) / 180;
  const ux = Math.sin(a);
  const uy = -Math.cos(a);
  const at = (t: number) => [bx + ux * t, by + uy * t] as const;
  const [tx, ty] = at(len - 3);
  const out: Part[] = [P('line', `M${bx},${by} L${tx.toFixed(2)},${ty.toFixed(2)}`)];
  const [hx, hy] = at(len - 0.4);
  out.push(P('grain', ell(hx, hy, 1, 2.2, deg)));
  for (const t of [len - 2.9, len - 5.8, len - 8.7]) {
    const [x, y] = at(t);
    for (const side of [-1, 1]) {
      const kx = x + side * Math.cos(a) * 1.75 + ux * 0.5;
      const ky = y + side * Math.sin(a) * 1.75 + uy * 0.5;
      out.push(P('grain', ell(kx, ky, 1, 2.1, deg + side * 28)));
    }
  }
  return out;
}

export const ICONS: Record<BaseType, Part[]> = {
  // Two pines, a big one and a small one, side by side.
  forest: [
    P('line', 'M14,19.5 V24'),
    P('line', 'M31.5,19.5 V23'),
    P('body', pine(14, 0, 1)),
    P('body', pine(31.5, 7, 0.68)),
  ],
  // Six bricks stacked three, two, one.
  hills: [
    ...[
      [1, 17],
      [14, 17],
      [27, 17],
      [7.5, 10],
      [20.5, 10],
      [14, 3],
    ].map(([x = 0, y = 0]) =>
      P(
        'body',
        `M${x + 1},${y} H${x + 11} Q${x + 12},${y} ${x + 12},${y + 1} V${y + 5} Q${x + 12},${y + 6} ${x + 11},${y + 6} H${x + 1} Q${x},${y + 6} ${x},${y + 5} V${y + 1} Q${x},${y} ${x + 1},${y} Z`,
      ),
    ),
  ],
  // A sheep facing right: a fleece cloud, a big dark head with an ear, four legs.
  pasture: [
    P('line', 'M8,18 V23 M11.5,18.6 V23 M18.5,18.6 V23 M22,18 V23'),
    P(
      'body',
      'M6.5,18.6 A3.8,3.8 0 0 1 3.4,11.6 A4.6,4.6 0 0 1 9.6,5.2 A4.6,4.6 0 0 1 17.6,4.8 A4.4,4.4 0 0 1 24,9.6 A3.9,3.9 0 0 1 23.4,17.6 A14,14 0 0 1 6.5,18.6 Z',
    ),
    P('solid', ell(29.6, 13, 5.4, 3.7, 34)),
    P('solid', ell(25.6, 8.8, 2.8, 1.3, -24)),
  ],
  // A wheat sheaf: three ears fanned from a band.
  fields: [
    ...ear(20, 24, 18, -30),
    ...ear(20, 24, 21, 0),
    ...ear(20, 24, 18, 30),
    P('line', 'M16.6,18.6 Q20,20.4 23.4,18.6'),
  ],
  // Ore: one rough rock with cut facets.
  mountains: [
    P('body', 'M3.5,23 L5,17.5 L10,12.5 L15.5,11.5 L20,6.5 L27.5,6 L32.5,11.5 L36,18.5 L35,23 Z'),
    P('line', 'M15.5,11.5 L21.5,14 L20,6.5 M21.5,14 L32.5,11.5 M21.5,14 L19,23'),
  ],
  // Desert: a cactus on bare ground.
  desert: [
    P('line', 'M7,23.4 H33'),
    P(
      'body',
      'M17,23 V15.5 H14.5 A3,3 0 0 1 11.5,12.5 V9 A1.5,1.5 0 0 1 14.5,9 V12.5 H17 V5 A3,3 0 0 1 23,5 V10.5 H25.5 V7 A1.5,1.5 0 0 1 28.5,7 V10.5 A3,3 0 0 1 25.5,13.5 H23 V23 Z',
    ),
  ],
};

export interface IconStyle {
  /** Fill for body parts ('none' for outline only). */
  body: string;
  /** Outline colour for bodies and the colour of lines. */
  line: string;
  /** Fill for solid parts. */
  solid: string;
  width: number;
  opacity?: number;
  /** Wheat kernels filled with this and outlined thinly, instead of solid. */
  grain?: string;
  /** A hard offset copy under the icon, as a sticker shadow. */
  shadow?: { color: string; dx: number; dy: number };
}

/** Draws a resource icon in the hex's icon box. */
export function resourceIcon(type: BaseType, st: IconStyle, box = ICON_BOX): ReactNode {
  const parts = ICONS[type];
  const draw = (p: Part, i: number, shadow?: string) => {
    const c = shadow;
    if (p.role === 'line')
      return (
        <path
          key={i}
          d={p.d}
          fill="none"
          stroke={c ?? st.line}
          strokeWidth={st.width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    if (p.role === 'grain' && st.grain)
      return (
        <path
          key={i}
          d={p.d}
          fill={c ?? st.grain}
          stroke={c ?? st.line}
          strokeWidth={st.width * 0.55}
        />
      );
    if (p.role === 'solid' || p.role === 'grain')
      return <path key={i} d={p.d} fill={c ?? st.solid} />;
    return (
      <path
        key={i}
        d={p.d}
        fill={c ?? st.body}
        stroke={c ?? st.line}
        strokeWidth={st.width}
        strokeLinejoin="round"
      />
    );
  };
  return (
    <g
      transform={`translate(${box.x} ${box.y}) scale(${box.s})`}
      opacity={st.opacity}
      pointerEvents="none"
    >
      {st.shadow && (
        <g transform={`translate(${st.shadow.dx} ${st.shadow.dy})`}>
          {parts.map((p, i) => draw(p, i, st.shadow!.color))}
        </g>
      )}
      {parts.map((p, i) => draw(p, i))}
    </g>
  );
}

function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
}

/** The contrast ratio of two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Of two inks, the first that stands out on `ground` well enough, else the one with more contrast. */
export function inkOn(ground: string, first: string, second: string, min = 2.4): string {
  if (contrast(first, ground) >= min) return first;
  return contrast(second, ground) > contrast(first, ground) ? second : first;
}
