import type { ReactNode } from 'react';
import type { Theme, ThemePieces } from '../clean.ts';
import { resourceIcon } from './icons.tsx';
import { BASE, H, seaTile, skin, W, type BaseType } from './kit.tsx';

/**
 * Archipelago boards: islands in a warm lagoon. Each land is one sunny colour rimmed with sand, its
 * icon drawn in white with lines in a deeper shade of the same land, so nothing shouts. The sea is
 * clear water with a few soft ripples.
 *
 * Pieces belong to the islands: settlements are stilt huts with thatch, cities lighthouses banded
 * in the player's colour, roads are boardwalks, and the robber is a shark's fin circling.
 */

interface Ink {
  land: Record<BaseType, string>;
  sand: string;
  /** Hut thatch and boardwalk planks. */
  thatch: string;
  line: string;
  sea: string;
  ripple: string;
  fin: string;
  face: string;
  faceText: string;
  ring: string;
  hot: string;
}

/** Mixes a #rrggbb colour towards black by `f` (0 to 1). */
function deepen(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) =>
    Math.round(v * (1 - f))
      .toString(16)
      .padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

function art(k: Ink): Record<BaseType, ReactNode> {
  const tile = (type: BaseType) => (
    <>
      <rect width={W} height={H} fill={k.land[type]} />
      {resourceIcon(type, {
        body: '#ffffff',
        line: deepen(k.land[type], 0.55),
        solid: deepen(k.land[type], 0.55),
        grain: '#ffffff',
        width: 1.6,
      })}
    </>
  );
  return Object.fromEntries(BASE.map((t) => [t, tile(t)])) as Record<BaseType, ReactNode>;
}

function sea(k: Ink): ReactNode {
  return seaTile(90, 60, [
    <rect key="bg" width={90} height={60} fill={k.sea} />,
    <path
      key="r"
      d="M10,18 q7,-4 14,0 M56,46 q7,-4 14,0"
      fill="none"
      stroke={k.ripple}
      strokeWidth={1.6}
      strokeLinecap="round"
    />,
  ]);
}

function pieces(k: Ink): ThemePieces {
  const ln = {
    stroke: k.line,
    strokeWidth: 1.5,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
  };
  return {
    house: ({ x, y, color, city, s }) => {
      const u = s * 0.1;
      if (!city) {
        // A stilt hut: a box on two legs under a thatched roof.
        return (
          <g filter="url(#lift)">
            <path
              d={`M${x - 1.1 * u},${y + 0.6 * u} v${1.3 * u} M${x + 1.1 * u},${y + 0.6 * u} v${1.3 * u}`}
              {...ln}
              strokeWidth={1.6}
            />
            <rect
              x={x - 1.4 * u}
              y={y - 0.8 * u}
              width={2.8 * u}
              height={1.5 * u}
              fill={color}
              {...ln}
            />
            <path
              d={`M${x - 2.1 * u},${y - 0.6 * u} L${x},${y - 2.4 * u} L${x + 2.1 * u},${y - 0.6 * u} Z`}
              fill={k.thatch}
              {...ln}
            />
          </g>
        );
      }
      // A lighthouse: a tapered tower banded in the player's colour, a lamp room and a cap.
      const b = y + 1.9 * u;
      const t = y - 1.6 * u;
      const tower = `M${x - 1.3 * u},${b} L${x - 0.8 * u},${t} H${x + 0.8 * u} L${x + 1.3 * u},${b} Z`;
      return (
        <g filter="url(#lift)">
          <path d={tower} fill="#ffffff" {...ln} />
          <path
            d={`M${x - 1.2 * u},${y + 1.1 * u} H${x + 1.2 * u} L${x + 1.12 * u},${y + 0.3 * u} H${x - 1.12 * u} Z M${x - 1.02 * u},${y - 0.5 * u} H${x + 1.02 * u} L${x + 0.94 * u},${y - 1.2 * u} H${x - 0.94 * u} Z`}
            fill={color}
          />
          <path d={tower} fill="none" {...ln} />
          <rect
            x={x - 0.65 * u}
            y={t - 0.9 * u}
            width={1.3 * u}
            height={0.9 * u}
            fill="#ffe28a"
            {...ln}
            strokeWidth={1.2}
          />
          <path
            d={`M${x - 0.95 * u},${t - 0.9 * u} L${x},${t - 1.7 * u} L${x + 0.95 * u},${t - 0.9 * u} Z`}
            fill={color}
            {...ln}
            strokeWidth={1.2}
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
          stroke={k.line}
          strokeWidth={s * 0.15}
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
      // A shark's fin cutting the water, with a ring of ripple round it.
      const u = s * 0.1;
      return (
        <g filter="url(#lift)">
          <ellipse
            cx={x}
            cy={y + 1.5 * u}
            rx={2.6 * u}
            ry={0.75 * u}
            fill={k.sea}
            stroke="#ffffff"
            strokeWidth={1.6}
          />
          <path
            d={`M${x - 1.6 * u},${y + 1.5 * u} C${x - 0.9 * u},${y + 0.2 * u} ${x - 0.2 * u},${y - 1.4 * u} ${x + 0.4 * u},${y - 2.5 * u} C${x + 0.5 * u},${y - 1 * u} ${x + 0.9 * u},${y + 0.4 * u} ${x + 1.6 * u},${y + 1.5 * u} Z`}
            fill={k.fin}
            {...ln}
          />
        </g>
      );
    },
    // The face is the first circle, so a rolled number's glow lands on it.
    token: ({ x, y, r }) => (
      <>
        <circle
          className="token-face"
          cx={x}
          cy={y}
          r={r}
          fill={k.face}
          stroke={k.ring}
          strokeWidth={2}
        />
      </>
    ),
  };
}

function islesSkin(id: string, name: string, description: string, k: Ink): Theme {
  return skin({
    id,
    name,
    description,
    terrain: k.land,
    sea: k.sea,
    seaEdge: k.ripple,
    art: art(k),
    seaPattern: sea(k),
    rest: {
      token: k.face,
      tokenText: k.faceText,
      tokenHot: k.hot,
      outline: k.line,
      robber: k.fin,
      landStroke: k.sand,
      landStrokeWidth: 3.5,
      harborWood: k.thatch,
      harborFace: k.face,
      harborText: k.faceText,
      pieceEffect: 'lift',
      tokenFont: 'Manrope, system-ui, sans-serif',
      pieces: pieces(k),
      boardBackground: k.sea,
    },
  });
}

export const islesLagoonBoard = islesSkin(
  'isles-lagoon',
  'Archipelago · Lagoon',
  'Sunny islands rimmed with sand in a clear lagoon.',
  {
    land: {
      forest: '#3f9a6b',
      hills: '#e3825a',
      pasture: '#9fcf6a',
      fields: '#f0c75a',
      mountains: '#9aa5b5',
      desert: '#efd9a4',
    },
    sand: '#f7e8c3',
    thatch: '#d9b26a',
    line: '#163a40',
    sea: '#45b8c4',
    ripple: '#7fd2da',
    fin: '#5d6f7d',
    face: '#ffffff',
    faceText: '#163a40',
    ring: '#163a40',
    hot: '#c43b2a',
  },
);

export const islesNightBoard = islesSkin(
  'isles-night',
  'Archipelago · Night Tide',
  'The same islands under a warm night sky.',
  {
    land: {
      forest: '#2f7357',
      hills: '#b3644a',
      pasture: '#6f9e56',
      fields: '#c49d48',
      mountains: '#6f7a8c',
      desert: '#bfa97c',
    },
    sand: '#d9c79c',
    thatch: '#c9a35e',
    line: '#0d1c26',
    sea: '#163a58',
    ripple: '#2a5677',
    fin: '#8797a6',
    face: '#f6f1e4',
    faceText: '#0d1c26',
    ring: '#0d1c26',
    hot: '#c43b2a',
  },
);
