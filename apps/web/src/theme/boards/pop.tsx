import type { ReactNode } from 'react';
import type { Theme, ThemePieces } from '../clean.ts';
import { resourceIcon } from './icons.tsx';
import { POP_ICONS } from './iconSets.ts';
import { BASE, H, seaTile, skin, W, type BaseType } from './kit.tsx';

/**
 * Tabletop Pop boards: stickers. Each land is one flat colour with a single white sticker icon,
 * outlined in ink with a hard ink shadow. Pieces, roads and number discs all cast the same
 * shadow, at the same offset, in the same ink.
 */

interface Ink {
  land: Record<BaseType, string>;
  ink: string;
  light: string;
  /** The robber's mask. */
  accent: string;
  sea: string;
  wave: string;
  hot: string;
}

/** The one shadow offset every sticker uses. */
const SH = 2.2;

const circle = (x: number, y: number, r: number) =>
  `M${x - r},${y} a${r},${r} 0 1 0 ${2 * r},0 a${r},${r} 0 1 0 ${-2 * r},0 Z`;

function art(k: Ink): Record<BaseType, ReactNode> {
  const tile = (type: BaseType) => (
    <>
      <rect width={W} height={H} fill={k.land[type]} />
      {resourceIcon(
        type,
        {
          body: k.light,
          line: k.ink,
          solid: k.ink,
          grain: k.light,
          width: 1.8,
          shadow: { color: k.ink, dx: 1.4, dy: 1.4 },
        },
        POP_ICONS,
      )}
    </>
  );
  return Object.fromEntries(BASE.map((t) => [t, tile(t)])) as Record<BaseType, ReactNode>;
}

function sea(k: Ink): ReactNode {
  return seaTile(60, 44, [
    <rect key="bg" width={60} height={44} fill={k.sea} />,
    <path
      key="a"
      d="M8,14 q4,-4 8,0 t8,0 M38,36 q4,-4 8,0 t8,0"
      fill="none"
      stroke={k.wave}
      strokeWidth={1.8}
      strokeLinecap="round"
    />,
  ]);
}

function pieces(k: Ink): ThemePieces {
  return {
    house: ({ x, y, color, city, s }) => {
      const u = s * 0.1;
      const home = (cx: number, by: number, w: number, h: number) =>
        `M${cx - w / 2},${by} V${by - h} L${cx},${by - h - w * 0.55} L${cx + w / 2},${by - h} V${by} Z`;
      const d = city
        ? `${home(x - 1 * u, y + 1.8 * u, 2.6 * u, 2.2 * u)} M${x + 0.3 * u},${y + 1.8 * u} V${y - 2.6 * u} H${x + 2.5 * u} V${y + 1.8 * u} Z`
        : home(x, y + 1.6 * u, 3 * u, 1.9 * u);
      return (
        <g>
          <path d={d} transform={`translate(${SH} ${SH})`} fill={k.ink} />
          <path d={d} fill={color} stroke={k.ink} strokeWidth={2.4} strokeLinejoin="round" />
          {city && (
            <path
              d={`M${x + 0.9 * u},${y - 1.6 * u} h${u} M${x + 0.9 * u},${y - 0.4 * u} h${u}`}
              stroke={k.ink}
              strokeWidth={1.6}
            />
          )}
          <path
            d={
              city
                ? `M${x - 1.4 * u},${y + 1.8 * u} v${-0.9 * u} h${0.8 * u} v${0.9 * u}`
                : `M${x - 0.4 * u},${y + 1.6 * u} v${-u} h${0.8 * u} v${u}`
            }
            fill={k.ink}
          />
        </g>
      );
    },
    road: ({ a, b, color, s }) => (
      <>
        <line
          x1={a.x + SH}
          y1={a.y + SH}
          x2={b.x + SH}
          y2={b.y + SH}
          stroke={k.ink}
          strokeWidth={s * 0.18}
          strokeLinecap="round"
        />
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={k.ink}
          strokeWidth={s * 0.18}
          strokeLinecap="round"
        />
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={color}
          strokeWidth={s * 0.1}
          strokeLinecap="round"
        />
      </>
    ),
    robber: ({ x, y, s }) => {
      const u = s * 0.1;
      const meeple = `M${x - 2.2 * u},${y + 2.2 * u} L${x - 0.9 * u},${y - 0.4 * u} L${x - 2 * u},${y - 0.9 * u} Q${x - 2.2 * u},${y - 1.8 * u} ${x - 0.8 * u},${y - 1.6 * u} A${u},${u} 0 1 1 ${x + 0.8 * u},${y - 1.6 * u} Q${x + 2.2 * u},${y - 1.8 * u} ${x + 2 * u},${y - 0.9 * u} L${x + 0.9 * u},${y - 0.4 * u} L${x + 2.2 * u},${y + 2.2 * u} H${x + 0.6 * u} L${x},${y + 1 * u} L${x - 0.6 * u},${y + 2.2 * u} Z`;
      return (
        <g>
          <path d={meeple} transform={`translate(${SH} ${SH})`} fill={k.ink} />
          <path d={meeple} fill="#2a2433" stroke={k.ink} strokeWidth={2} strokeLinejoin="round" />
          <rect
            x={x - 1.1 * u}
            y={y - 2.75 * u}
            width={2.2 * u}
            height={0.7 * u}
            rx={0.35 * u}
            fill={k.accent}
          />
          <circle cx={x - 0.45 * u} cy={y - 2.4 * u} r={0.18 * u} fill={k.ink} />
          <circle cx={x + 0.45 * u} cy={y - 2.4 * u} r={0.18 * u} fill={k.ink} />
        </g>
      );
    },
    // The shadow is a path, not a circle, so the board's glow for a rolled number lands on the face.
    token: ({ x, y, r }) => (
      <>
        <path d={circle(x + SH, y + SH, r)} fill={k.ink} />
        <circle
          className="token-face"
          cx={x}
          cy={y}
          r={r}
          fill={k.light}
          stroke={k.ink}
          strokeWidth={2.4}
        />
      </>
    ),
  };
}

function popSkin(id: string, name: string, k: Ink): Theme {
  return skin({
    id,
    name,
    description: 'Stickers: flat colours, one clear icon, thick ink and hard shadows.',
    terrain: k.land,
    sea: k.sea,
    seaEdge: k.ink,
    art: art(k),
    seaPattern: sea(k),
    rest: {
      token: k.light,
      tokenText: k.ink,
      tokenHot: k.hot,
      outline: k.ink,
      robber: '#2a2433',
      landStroke: k.ink,
      landStrokeWidth: 3,
      harborWood: k.ink,
      harborFace: k.light,
      harborText: k.ink,
      pieceEffect: 'lift',
      tokenFont: "'Space Grotesk', system-ui, sans-serif",
      pieces: pieces(k),
      boardBackground: k.sea,
    },
  });
}

export const popGrapeBoard = popSkin('pop-grape', 'Tabletop Pop · Grape Soda', {
  land: {
    forest: '#3aa676',
    hills: '#e8735f',
    pasture: '#a9d27f',
    fields: '#f2c45a',
    mountains: '#aaa6cf',
    desert: '#efdcb4',
  },
  ink: '#1d1a33',
  light: '#ffffff',
  accent: '#f2c45a',
  sea: '#5d58c8',
  wave: '#7a76d6',
  hot: '#c8324a',
});

export const popSorbetBoard = popSkin('pop-sorbet', 'Tabletop Pop · Sorbet', {
  land: {
    forest: '#73bf9e',
    hills: '#ee9e93',
    pasture: '#c6e3a4',
    fields: '#f5d596',
    mountains: '#c6bfe0',
    desert: '#f6e9cf',
  },
  ink: '#3a2430',
  light: '#ffffff',
  accent: '#ee9e93',
  sea: '#a3d9d1',
  wave: '#c3e8e2',
  hot: '#b8325a',
});

export const popCitrusBoard = popSkin('pop-citrus', 'Tabletop Pop · Citrus Club', {
  land: {
    forest: '#2f8f62',
    hills: '#ea7a4c',
    pasture: '#b2d35f',
    fields: '#f6cd48',
    mountains: '#a8b5ae',
    desert: '#f4e3b2',
  },
  ink: '#172420',
  light: '#ffffff',
  accent: '#ea7a4c',
  sea: '#3b9dbf',
  wave: '#5fb2cf',
  hot: '#b93a0a',
});

export const popArcadeBoard = popSkin('pop-arcade', 'Tabletop Pop · Arcade Night', {
  land: {
    forest: '#23ad8b',
    hills: '#e9607d',
    pasture: '#7fc96a',
    fields: '#efc650',
    mountains: '#8c84d4',
    desert: '#e5a96c',
  },
  ink: '#0b0916',
  light: '#ffffff',
  accent: '#e9607d',
  sea: '#1d1939',
  wave: '#2d2856',
  hot: '#d22a66',
});
