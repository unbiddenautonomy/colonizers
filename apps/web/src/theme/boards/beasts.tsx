import type { ReactNode } from 'react';
import type { Theme, ThemePieces } from '../clean.ts';
import { resourceIcon } from './icons.tsx';
import { DECO_ICONS } from './iconSets.ts';
import { artFor } from './art.ts';
import { BASE, H, seaTile, skin, W, type BaseType } from './kit.tsx';

/**
 * Grand Line · Beasts Pirates: the land of Wano as a woodblock print. Flat colours darkening
 * toward the top of each tile the way a printer grades the sky, an indigo sea of overlapping
 * wave scales, and number discs like family crests. Settlements are houses under tiled roofs,
 * cities are castles, and the robber is an oni mask from Onigashima.
 */

interface Ink {
  land: Record<BaseType, string>;
  ink: string;
  paper: string;
  sea: string;
  wave: string;
  vermilion: string;
  stone: string;
  gold: string;
}

function art(k: Ink): Record<BaseType, ReactNode> {
  const tile = (type: BaseType) => (
    <>
      <rect width={W} height={H} fill={k.land[type]} />
      {/* Bokashi: the colour grades darker toward the top in three passes of the block. */}
      <rect width={W} height={30} fill={k.ink} opacity={0.12} />
      <rect width={W} height={20} fill={k.ink} opacity={0.1} />
      <rect width={W} height={11} fill={k.ink} opacity={0.1} />
      {resourceIcon(
        type,
        { body: k.paper, line: k.ink, solid: k.ink, grain: k.paper, width: 1.6 },
        DECO_ICONS,
      )}
    </>
  );
  return Object.fromEntries(BASE.map((t) => [t, tile(t)])) as Record<BaseType, ReactNode>;
}

/** Seigaiha, the wave-scale pattern: rings of arcs, each row laid over the one above it. */
function sea(k: Ink): ReactNode {
  const scale = (cx: number, cy: number) => (
    <g key={`${cx},${cy}`}>
      <circle cx={cx} cy={cy} r={16} fill={k.sea} stroke={k.wave} strokeWidth={1.1} />
      <circle cx={cx} cy={cy} r={11.5} fill="none" stroke={k.wave} strokeWidth={1.1} />
      <circle cx={cx} cy={cy} r={7} fill="none" stroke={k.wave} strokeWidth={1.1} />
      <circle cx={cx} cy={cy} r={2.5} fill="none" stroke={k.wave} strokeWidth={1.1} />
    </g>
  );
  const centres: [number, number][] = [
    [16, -8],
    [0, 0],
    [32, 0],
    [16, 8],
    [0, 16],
    [32, 16],
    [16, 24],
  ];
  return seaTile(32, 16, [
    <rect key="bg" width={32} height={16} fill={k.sea} />,
    ...centres.map(([x, y]) => scale(x, y)),
  ]);
}

function pieces(k: Ink): ThemePieces {
  const edge = { stroke: k.ink, strokeWidth: 1.8, strokeLinejoin: 'round' as const };
  /** A tiled roof with upturned eaves: `w` half-width at the eaves, rising `h` from `base`. */
  const roof = (x: number, base: number, w: number, h: number) =>
    `M${x - w},${base} Q${x - w * 0.7},${base - h * 0.25} ${x - w * 0.55},${base - h} H${x + w * 0.55} Q${x + w * 0.7},${base - h * 0.25} ${x + w},${base} Z`;
  return {
    house: ({ x, y, color, city, s }) => {
      const u = s * 0.1;
      if (!city)
        return (
          <g>
            <rect
              x={x - 1.3 * u}
              y={y - 0.2 * u}
              width={2.6 * u}
              height={1.9 * u}
              fill={k.paper}
              {...edge}
            />
            <path
              d={`M${x - 0.15 * u},${y + 0.2 * u} V${y + 1.7 * u} M${x - 1.3 * u},${y + 0.6 * u} H${x + 1.3 * u}`}
              stroke={k.ink}
              strokeWidth={0.8}
              strokeOpacity={0.6}
            />
            <path d={roof(x, y, 2.3 * u, 1.6 * u)} fill={color} {...edge} />
          </g>
        );
      return (
        <g>
          <rect
            x={x - 2 * u}
            y={y + 0.9 * u}
            width={4 * u}
            height={0.9 * u}
            fill={k.stone}
            {...edge}
          />
          <rect
            x={x - 1.5 * u}
            y={y - 0.4 * u}
            width={3 * u}
            height={1.3 * u}
            fill={k.paper}
            {...edge}
          />
          <path d={roof(x, y - 0.2 * u, 2.5 * u, 0.9 * u)} fill={color} {...edge} />
          <rect
            x={x - 0.9 * u}
            y={y - 1.9 * u}
            width={1.8 * u}
            height={1 * u}
            fill={k.paper}
            {...edge}
          />
          <path d={roof(x, y - 1.7 * u, 1.7 * u, 1.1 * u)} fill={color} {...edge} />
          <path
            d={`M${x - 0.5 * u},${y - 2.8 * u} l${-0.3 * u},${-0.4 * u} M${x + 0.5 * u},${y - 2.8 * u} l${0.3 * u},${-0.4 * u}`}
            stroke={k.gold}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        </g>
      );
    },
    road: ({ a, b, color, s }) => (
      <>
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={k.ink}
          strokeWidth={s * 0.17}
          strokeLinecap="square"
        />
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={color}
          strokeWidth={s * 0.095}
          strokeLinecap="square"
        />
      </>
    ),
    robber: ({ x, y, s }) => {
      const u = s * 0.1;
      const fy = y - 0.4 * u;
      // An oni mask: red face, two horns, gold eyes under heavy brows, and fangs.
      const horn = (side: 1 | -1) =>
        `M${x + side * 0.6 * u},${fy - 1.7 * u} Q${x + side * 1.6 * u},${fy - 2.4 * u} ${x + side * 1.9 * u},${fy - 3.6 * u} Q${x + side * 1.9 * u},${fy - 2.2 * u} ${x + side * 1.5 * u},${fy - 1.2 * u} Z`;
      return (
        <g>
          <ellipse cx={x} cy={y + 1.7 * u} rx={2 * u} ry={0.5 * u} fill={k.ink} opacity={0.35} />
          <path d={horn(-1)} fill={k.paper} {...edge} />
          <path d={horn(1)} fill={k.paper} {...edge} />
          <ellipse cx={x} cy={fy} rx={1.95 * u} ry={2.05 * u} fill={k.vermilion} {...edge} />
          <path
            d={`M${x - 1.4 * u},${fy - 0.95 * u} L${x - 0.3 * u},${fy - 0.45 * u} M${x + 1.4 * u},${fy - 0.95 * u} L${x + 0.3 * u},${fy - 0.45 * u}`}
            stroke={k.ink}
            strokeWidth={2.2}
            strokeLinecap="round"
          />
          <circle cx={x - 0.8 * u} cy={fy - 0.15 * u} r={0.36 * u} fill={k.gold} stroke={k.ink} />
          <circle cx={x + 0.8 * u} cy={fy - 0.15 * u} r={0.36 * u} fill={k.gold} stroke={k.ink} />
          <path
            d={`M${x - 1.1 * u},${fy + 0.8 * u} Q${x},${fy + 1.5 * u} ${x + 1.1 * u},${fy + 0.8 * u} Z`}
            fill={k.ink}
          />
          <path
            d={`M${x - 0.75 * u},${fy + 0.85 * u} l${0.18 * u},${0.45 * u} l${0.18 * u},${-0.4 * u} M${x + 0.75 * u},${fy + 0.85 * u} l${-0.18 * u},${0.45 * u} l${-0.18 * u},${-0.4 * u}`}
            fill={k.paper}
          />
        </g>
      );
    },
    // A family crest: paper disc, ink ring, and a thin ring inside it.
    token: ({ x, y, r }) => (
      <>
        <circle
          className="token-face"
          cx={x}
          cy={y}
          r={r}
          fill={k.paper}
          stroke={k.ink}
          strokeWidth={2.2}
        />
        <circle
          cx={x}
          cy={y}
          r={r * 0.84}
          fill="none"
          stroke={k.vermilion}
          strokeOpacity={0.7}
          strokeWidth={1}
        />
      </>
    ),
  };
}

function beastsSkin(id: string, name: string, k: Ink): Theme {
  return skin({
    id,
    name,
    description:
      'Wano as a woodblock print: graded colours, wave-scale sea, castles, an oni robber.',
    terrain: k.land,
    sea: k.sea,
    seaEdge: k.ink,
    art: art(k),
    seaPattern: sea(k),
    paintings: artFor('wano'),
    rest: {
      token: k.paper,
      tokenText: k.ink,
      tokenHot: k.vermilion,
      outline: k.ink,
      robber: k.vermilion,
      landStroke: k.ink,
      landStrokeWidth: 2.4,
      harborWood: k.ink,
      harborFace: k.paper,
      harborText: k.ink,
      pieceEffect: 'lift',
      tokenFont: "'Shippori Mincho B1', 'Noto Serif JP', Georgia, serif",
      pieces: pieces(k),
      boardBackground: k.sea,
    },
  });
}

export const beastsBoard = beastsSkin('beasts-wano', 'Grand Line · Beasts Pirates (Wano)', {
  land: {
    forest: '#3c6e47',
    hills: '#b8452e',
    pasture: '#9cb86a',
    fields: '#d9a93e',
    mountains: '#6e7a8a',
    desert: '#e2cfa3',
  },
  ink: '#1b2233',
  paper: '#f3ead2',
  sea: '#21406b',
  wave: '#4e6f9a',
  vermilion: '#b8321e',
  stone: '#7d8494',
  gold: '#d9a93e',
});
