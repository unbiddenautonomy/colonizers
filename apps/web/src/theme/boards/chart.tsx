import type { ReactNode } from 'react';
import type { Theme, ThemePieces } from '../clean.ts';
import { ICONS, resourceIcon } from './icons.tsx';
import { BASE, H, seaTile, skin, W, type BaseType } from './kit.tsx';

/**
 * Storm Chart boards: the island as a surveyor would engrave it. Each land is a pale wash with its
 * own hatching (woods slant one way, clay pits the other, fields are ploughed in rows, pasture is
 * tufted, the mountains crosshatched and the sand stippled), the icons are line engravings, and
 * the sea is ruled paper. Settlements and cities are drawn the way charts mark a town, and the
 * robber is the sea serpent from the corner of every old chart.
 */

interface Ink {
  wash: Record<BaseType, string>;
  ink: string;
  paper: string;
  sea: string;
  rust: string;
  teal: string;
}

const f = (n: number) => Math.round(n * 10) / 10;

/** Parallel lines across the tile box at `deg` (45 or -45 or 0), `gap` apart. */
function lines(deg: 45 | -45 | 0, gap: number): string {
  let d = '';
  if (deg === 0) for (let y = gap / 2; y < H; y += gap) d += `M0,${f(y)} H${f(W)} `;
  else
    for (let c = -H; c < W + H; c += gap)
      d += deg === 45 ? `M${f(c)},0 L${f(c + H)},${H} ` : `M${f(c)},${H} L${f(c + H)},0 `;
  return d;
}

/** Short tufts of grass in staggered rows. */
function tufts(): string {
  let d = '';
  for (let row = 0, y = 6; y < H; y += 9, row++)
    for (let x = row % 2 ? 4 : 9; x < W; x += 10) d += `M${x},${y} l1.6,-3 l1.6,3 `;
  return d;
}

/** A stipple of dots, as small circles in one path. */
function stipple(): string {
  let d = '';
  for (let row = 0, y = 4; y < H; y += 7, row++)
    for (let x = row % 2 ? 3 : 6.5; x < W; x += 7)
      d += `M${x - 0.6},${y} a0.6,0.6 0 1 0 1.2,0 a0.6,0.6 0 1 0 -1.2,0 `;
  return d;
}

const HATCH: Record<BaseType, string> = {
  forest: lines(45, 6),
  hills: lines(-45, 6),
  fields: lines(0, 5),
  pasture: tufts(),
  mountains: lines(45, 6) + lines(-45, 6),
  desert: stipple(),
};

function art(k: Ink): Record<BaseType, ReactNode> {
  const tile = (type: BaseType) => (
    <>
      <rect width={W} height={H} fill={k.wash[type]} />
      <path
        d={HATCH[type]}
        fill={type === 'desert' ? k.ink : 'none'}
        fillOpacity={0.3}
        stroke={type === 'desert' ? 'none' : k.ink}
        strokeOpacity={0.24}
        strokeWidth={0.7}
      />
      {resourceIcon(
        type,
        { body: k.wash[type], line: k.ink, solid: k.ink, grain: k.paper, width: 1.3 },
        ICONS,
      )}
    </>
  );
  return Object.fromEntries(BASE.map((t) => [t, tile(t)])) as Record<BaseType, ReactNode>;
}

function sea(k: Ink): ReactNode {
  return seaTile(40, 8, [
    <rect key="bg" width={40} height={8} fill={k.sea} />,
    <path key="l" d="M0,7.5 H40" stroke={k.ink} strokeOpacity={0.1} strokeWidth={0.8} />,
  ]);
}

function pieces(k: Ink): ThemePieces {
  const edge = { stroke: k.ink, strokeWidth: 1.5, strokeLinejoin: 'round' as const };
  return {
    house: ({ x, y, color, city, s }) => {
      const u = s * 0.1;
      const home = (cx: number, base: number, w: number, h: number) =>
        `M${cx - w / 2},${base} V${base - h} L${cx},${base - h - w * 0.55} L${cx + w / 2},${base - h} V${base} Z`;
      if (!city)
        return (
          <g>
            <path d={home(x, y + 1.6 * u, 3 * u, 1.9 * u)} fill={color} {...edge} />
            <path
              d={`M${x - 0.4 * u},${y + 1.6 * u} v${-0.9 * u} h${0.8 * u} v${0.9 * u}`}
              fill="none"
              {...edge}
              strokeWidth={1}
            />
          </g>
        );
      return (
        <g>
          <path d={home(x - 1.2 * u, y + 1.8 * u, 2.4 * u, 1.8 * u)} fill={color} {...edge} />
          <path d={home(x + 1.1 * u, y + 1.8 * u, 2.4 * u, 2.8 * u)} fill={color} {...edge} />
          <path
            d={`M${x + 0.5 * u},${y - 0.4 * u} h${1.2 * u} M${x + 0.5 * u},${y + 0.5 * u} h${1.2 * u}`}
            stroke={k.ink}
            strokeWidth={1}
          />
        </g>
      );
    },
    road: ({ a, b, color, s }) => (
      <>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={k.ink} strokeWidth={s * 0.13} />
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={s * 0.08} />
      </>
    ),
    robber: ({ x, y, s }) => {
      const u = s * 0.1;
      const body = `M${x - 2.7 * u},${y + 0.8 * u} Q${x - 2.8 * u},${y - 1.9 * u} ${x - 1.7 * u},${y - 2 * u} Q${x - 0.7 * u},${y - 2 * u} ${x - 0.9 * u},${y - 0.6 * u} M${x - 0.3 * u},${y + 0.8 * u} Q${x + 0.5 * u},${y - 1.6 * u} ${x + 1.3 * u},${y + 0.8 * u} M${x + 1.7 * u},${y + 0.8 * u} Q${x + 2.3 * u},${y - 0.7 * u} ${x + 2.9 * u},${y + 0.8 * u}`;
      return (
        <g>
          <path d={body} fill="none" stroke={k.ink} strokeWidth={s * 0.16} strokeLinecap="round" />
          <path d={body} fill="none" stroke={k.teal} strokeWidth={s * 0.09} strokeLinecap="round" />
          <circle cx={x - 1.75 * u} cy={y - 1.55 * u} r={0.22 * u} fill={k.paper} />
          <path
            d={`M${x - 3.2 * u},${y + 1.2 * u} q${0.5 * u},${-0.45 * u} ${u},0 t${u},0 t${u},0 t${u},0 t${u},0 t${u},0 t${u},0`}
            fill="none"
            stroke={k.ink}
            strokeWidth={1.2}
            strokeLinecap="round"
          />
        </g>
      );
    },
    token: ({ x, y, r }) => (
      <>
        <circle
          className="token-face"
          cx={x}
          cy={y}
          r={r}
          fill={k.paper}
          stroke={k.ink}
          strokeWidth={1.5}
        />
        <circle
          cx={x}
          cy={y}
          r={r - 3}
          fill="none"
          stroke={k.ink}
          strokeOpacity={0.45}
          strokeWidth={0.7}
        />
      </>
    ),
  };
}

function chartSkin(id: string, name: string, k: Ink): Theme {
  return skin({
    id,
    name,
    description:
      'An engraved sea chart: pale washes, hatching per land, a sea serpent for a robber.',
    terrain: k.wash,
    sea: k.sea,
    seaEdge: k.ink,
    art: art(k),
    seaPattern: sea(k),
    rest: {
      token: k.paper,
      tokenText: k.ink,
      tokenHot: k.rust,
      outline: k.ink,
      robber: k.teal,
      landStroke: k.ink,
      landStrokeWidth: 1.5,
      harborWood: k.ink,
      harborFace: k.paper,
      harborText: k.ink,
      pieceEffect: 'lift',
      tokenFont: "'Spectral', Georgia, serif",
      pieces: pieces(k),
      boardBackground: k.sea,
    },
  });
}

export const chartSurveyBoard = chartSkin('chart-survey', 'Storm Chart · Survey', {
  wash: {
    forest: '#a7bf9f',
    hills: '#ddae94',
    pasture: '#cfdaa6',
    fields: '#ead79a',
    mountains: '#bdbab4',
    desert: '#f2e7cc',
  },
  ink: '#1f2a44',
  paper: '#f6eed9',
  sea: '#e2e3d3',
  rust: '#a4492a',
  teal: '#2f7f73',
});
