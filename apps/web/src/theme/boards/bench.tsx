import type { ReactNode } from 'react';
import type { Theme, ThemePieces } from '../clean.ts';
import { CX, H, poly, seaTile, skin, W, type BaseType } from './kit.tsx';

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
  sea: string;
  seaDot: string;
  face: string;
  faceText: string;
  hot: string;
  edge: string;
  robber: string;
}

function art(k: Ink): Record<BaseType, ReactNode> {
  const icon = (d: string) => (
    <path
      d={d}
      fill="none"
      stroke={k.glyph}
      strokeOpacity={k.glyphOpacity}
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
  const base = (type: BaseType, glyph: string) => (
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
      {icon(glyph)}
    </>
  );
  return {
    forest: base('forest', 'M40,34 L46,22 L52,34 Z M46,34 v5 M54,32 L61,18 L68,32 Z M61,32 v6'),
    hills: base('hills', 'M38,22 h28 v14 h-28 Z M38,29 h28 M52,22 v7 M45,29 v7 M59,29 v7'),
    pasture: base(
      'pasture',
      'M42,32 a5,5 0 0 1 2,-9 a6,6 0 0 1 11,-2 a5,5 0 0 1 8,6 a4,4 0 0 1 -2,7 Z M45,32 v5 M58,32 v5 M63,25 l5,-2',
    ),
    fields: base(
      'fields',
      'M52,40 V16 M52,20 l-5,-3 M52,20 l5,-3 M52,26 l-5,-3 M52,26 l5,-3 M52,32 l-5,-3 M52,32 l5,-3',
    ),
    mountains: base('mountains', 'M36,38 L48,18 L56,30 L60,24 L70,38 Z M44,25 l4,2 l4,-2'),
    desert: base('desert', 'M60,22 a6,6 0 1 1 0.1,0 M36,38 q10,-8 20,0 t20,0'),
  };
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
    sea: '#cfe3ea',
    seaDot: '#a9c9d4',
    face: '#ffffff',
    faceText: '#1f2624',
    hot: '#b3261e',
    edge: '#1f2624',
    robber: '#2b2f33',
  },
);
