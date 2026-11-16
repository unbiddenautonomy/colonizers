import type { ReactNode } from 'react';
import type { Theme, ThemePieces } from '../clean.ts';
import { resourceIcon } from './icons.tsx';
import { BASE, CX, H, poly, seaTile, skin, W, type BaseType } from './kit.tsx';

/**
 * BasicBench boards: quiet and exact, like the app around them. Each land is one soft colour with
 * light falling from the top left and a single line icon at the top; the sea is a calm dot grid.
 * Pieces are smooth rounded shapes, the robber a hooded figure, tokens plain discs.
 */

interface Ink {
  land: Record<BaseType, string>;
  /** Icon and inner-ring colour. */
  glyph: string;
  glyphOpacity: number;
  /** A faint fill inside icon shapes. */
  glyphFill: string;
  sea: string;
  seaDot: string;
  face: string;
  faceText: string;
  hot: string;
  edge: string;
  robber: string;
}

function art(k: Ink): Record<BaseType, ReactNode> {
  const base = (type: BaseType) => (
    <>
      <rect width={W} height={H} fill={k.land[type]} />
      <rect width={W} height={H} fill="url(#bench-light)" />
      <polygon
        points={poly(CX, H / 2, 50, 6)}
        fill="none"
        stroke={k.glyph}
        strokeOpacity={k.glyphOpacity * 0.35}
        strokeWidth={1}
      />
      {resourceIcon(type, {
        body: k.glyphFill,
        line: k.glyph,
        solid: k.glyph,
        width: 2.2,
        opacity: k.glyphOpacity,
      })}
    </>
  );
  return Object.fromEntries(BASE.map((t) => [t, base(t)])) as Record<BaseType, ReactNode>;
}

function sea(k: Ink): ReactNode {
  return seaTile(16, 16, [
    <rect key="bg" width={16} height={16} fill={k.sea} />,
    <circle key="d" cx={8} cy={8} r={1} fill={k.seaDot} />,
  ]);
}

function pieces(k: Ink): ThemePieces {
  return {
    house: ({ x, y, color, city, s }) => {
      const u = s * 0.1;
      const d = city
        ? `M${x - 2.6 * u},${y + 1.7 * u} V${y - 0.2 * u} L${x - 1.3 * u},${y - 1.4 * u} L${x},${y - 0.2 * u} V${y - 1.4 * u} H${x + 2.6 * u} V${y + 1.7 * u} Z`
        : `M${x - 1.6 * u},${y + 1.6 * u} V${y - 0.3 * u} L${x},${y - 1.8 * u} L${x + 1.6 * u},${y - 0.3 * u} V${y + 1.6 * u} Z`;
      return (
        <g filter="url(#lift)">
          <path d={d} fill={color} stroke={k.edge} strokeWidth={1.6} strokeLinejoin="round" />
          <path d={d} fill="url(#bench-light)" pointerEvents="none" />
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
          stroke={k.edge}
          strokeWidth={s * 0.15}
          strokeLinecap="round"
        />
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={color}
          strokeWidth={s * 0.11}
          strokeLinecap="round"
        />
      </>
    ),
    robber: ({ x, y, s }) => {
      const u = s * 0.1;
      return (
        <g stroke={k.face} strokeWidth={1.4} strokeOpacity={0.9}>
          <path
            d={`M${x - 1.6 * u},${y + 2.2 * u} Q${x - 1.8 * u},${y - 0.6 * u} ${x - 1.1 * u},${y - 1.6 * u} A${1.2 * u},${1.3 * u} 0 0 1 ${x + 1.1 * u},${y - 1.6 * u} Q${x + 1.8 * u},${y - 0.6 * u} ${x + 1.6 * u},${y + 2.2 * u} Z`}
            fill={k.robber}
          />
          <ellipse cx={x} cy={y - 1.3 * u} rx={0.6 * u} ry={0.7 * u} fill={k.edge} stroke="none" />
        </g>
      );
    },
    token: ({ x, y, r }) => (
      <>
        <circle
          cx={x}
          cy={y}
          r={r}
          fill={k.face}
          stroke={k.edge}
          strokeOpacity={0.35}
          strokeWidth={1}
        />
      </>
    ),
  };
}

function benchSkin(id: string, name: string, description: string, k: Ink): Theme {
  const t = skin({
    id,
    name,
    description,
    terrain: k.land,
    sea: k.sea,
    seaEdge: k.seaDot,
    art: art(k),
    seaPattern: sea(k),
    rest: {
      token: k.face,
      tokenText: k.faceText,
      tokenHot: k.hot,
      outline: k.edge,
      robber: k.robber,
      landStroke: k.sea,
      landStrokeWidth: 3,
      harborWood: k.glyph,
      harborFace: k.face,
      harborText: k.faceText,
      pieceEffect: 'lift',
      tokenFont: 'Inter, system-ui, sans-serif',
      pieces: pieces(k),
      boardBackground: k.sea,
    },
  });
  const own = t.patterns!;
  return {
    ...t,
    patterns: () => (
      <>
        <linearGradient id="bench-light" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.18" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.12" />
        </linearGradient>
        {own()}
      </>
    ),
  };
}

export const benchDarkBoard = benchSkin(
  'bench-dark',
  'BasicBench · Dark',
  'Quiet colours and line icons, for dark mode.',
  {
    land: {
      forest: '#2f6b57',
      hills: '#a5583f',
      pasture: '#6f9e5f',
      fields: '#c99a42',
      mountains: '#5c6b7d',
      desert: '#b9a27a',
    },
    glyph: '#ffffff',
    glyphOpacity: 0.6,
    glyphFill: 'rgba(255,255,255,0.22)',
    sea: '#0f2238',
    seaDot: '#24405f',
    face: '#eaf0f8',
    faceText: '#0b1422',
    hot: '#b3261e',
    edge: '#0b1422',
    robber: '#0b1422',
  },
);

export const benchLightBoard = benchSkin(
  'bench-light',
  'BasicBench · Light',
  'Quiet colours and line icons, for light mode.',
  {
    land: {
      forest: '#7fb08f',
      hills: '#e09a7a',
      pasture: '#b4d69a',
      fields: '#f0cf7e',
      mountains: '#aab4c0',
      desert: '#eadcb8',
    },
    glyph: '#ffffff',
    glyphOpacity: 0.85,
    glyphFill: 'rgba(255,255,255,0.3)',
    sea: '#cfe3ea',
    seaDot: '#a9c9d4',
    face: '#ffffff',
    faceText: '#1f2624',
    hot: '#b3261e',
    edge: '#1f2624',
    robber: '#2b2f33',
  },
);
