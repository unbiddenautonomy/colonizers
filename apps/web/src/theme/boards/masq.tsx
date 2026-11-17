import type { ReactNode } from 'react';
import type { Theme, ThemePieces } from '../clean.ts';
import { resourceIcon } from './icons.tsx';
import { DECO_ICONS } from './iconSets.ts';
import { BASE, CX, CY, H, poly, seaTile, skin, W, type BaseType } from './kit.tsx';

/**
 * Masquerade boards: the island laid out on a card table. Each land is a dark jewel cut in two
 * tones and rimmed in gold, the sea is green baize with the four suits worn faintly into it, and
 * the numbers are gold on jet chips. Settlements are houses of cards (a city is the tall kind),
 * and the robber is a mask on a stick.
 */

interface Ink {
  /** Each land's outer and inner tone. */
  land: Record<BaseType, [string, string]>;
  gold: string;
  bright: string;
  pink: string;
  jet: string;
  felt: string;
  feltLine: string;
}

function art(k: Ink): Record<BaseType, ReactNode> {
  const tile = (type: BaseType) => {
    const [outer, inner] = k.land[type];
    return (
      <>
        <rect width={W} height={H} fill={outer} />
        <polygon
          points={poly(CX, CY, 49, 6)}
          fill={inner}
          stroke={k.gold}
          strokeOpacity={0.45}
          strokeWidth={0.8}
        />
        {resourceIcon(
          type,
          { body: outer, line: k.bright, solid: k.bright, width: 1.4 },
          DECO_ICONS,
        )}
      </>
    );
  };
  return Object.fromEntries(BASE.map((t) => [t, tile(t)])) as Record<BaseType, ReactNode>;
}

// The four suits, small, for the baize.
const SPADE =
  'M0,-6 C3,-3 6,-1 6,2 C6,4.5 3.5,5.5 1.2,4 L2,7 H-2 L-1.2,4 C-3.5,5.5 -6,4.5 -6,2 C-6,-1 -3,-3 0,-6 Z';
const HEART =
  'M0,6 C-4,2.5 -6.5,0 -6.5,-2.5 C-6.5,-5.5 -2,-6.5 0,-3 C2,-6.5 6.5,-5.5 6.5,-2.5 C6.5,0 4,2.5 0,6 Z';
const DIAMOND = 'M0,-6.5 L5,0 L0,6.5 L-5,0 Z';
const CLUB =
  'M0,-6 A2.6,2.6 0 1 1 0,-0.8 A2.6,2.6 0 1 1 -2.6,3.2 A2.6,2.6 0 1 1 -1,-1 Z M-2,7 L0,1.5 L2,7 Z';

function sea(k: Ink): ReactNode {
  const suit = (d: string, x: number, y: number, key: string) => (
    <path key={key} d={d} transform={`translate(${x} ${y})`} fill={k.feltLine} />
  );
  return seaTile(96, 84, [
    <rect key="bg" width={96} height={84} fill={k.felt} />,
    suit(SPADE, 20, 18, 's'),
    suit(HEART, 68, 18, 'h'),
    suit(DIAMOND, 44, 60, 'd'),
    suit(CLUB, 88, 62, 'c'),
  ]);
}

function pieces(k: Ink): ThemePieces {
  /** An A of two cards leaning together, centred on cx, standing on `base`, `h` tall. */
  const leaning = (cx: number, base: number, h: number, w: number) =>
    `M${cx - w},${base} L${cx},${base - h} L${cx + w},${base} H${cx + w * 0.45} L${cx},${base - h * 0.5} L${cx - w * 0.45},${base} Z`;
  return {
    house: ({ x, y, color, city, s }) => {
      const u = s * 0.1;
      const edge = {
        fill: color,
        stroke: k.jet,
        strokeWidth: 1.6,
        strokeLinejoin: 'round' as const,
      };
      if (!city)
        return (
          <g>
            <path d={leaning(x, y + 1.7 * u, 3.7 * u, 2 * u)} {...edge} />
            <path
              d={`M${x - 1.4 * u},${y + 1.7 * u} H${x + 1.4 * u}`}
              stroke={k.gold}
              strokeWidth={1.2}
              strokeLinecap="round"
            />
          </g>
        );
      return (
        <g>
          <path d={leaning(x - 1.2 * u, y + 1.8 * u, 2.2 * u, 1.2 * u)} {...edge} />
          <path d={leaning(x + 1.2 * u, y + 1.8 * u, 2.2 * u, 1.2 * u)} {...edge} />
          <rect
            x={x - 2.5 * u}
            y={y - 0.75 * u}
            width={5 * u}
            height={0.45 * u}
            fill={k.gold}
            stroke={k.jet}
            strokeWidth={1}
          />
          <path d={leaning(x, y - 0.75 * u, 2.3 * u, 1.25 * u)} {...edge} />
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
          stroke={k.jet}
          strokeWidth={s * 0.17}
          strokeLinecap="square"
        />
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={color}
          strokeWidth={s * 0.09}
          strokeLinecap="square"
        />
      </>
    ),
    robber: ({ x, y, s }) => {
      const u = s * 0.1;
      const my = y - 0.9 * u;
      const mask = `M${x - 2.6 * u},${my - 0.6 * u} C${x - 2.5 * u},${my - 1.9 * u} ${x - 0.8 * u},${my - 1.7 * u} ${x},${my - 1.1 * u} C${x + 0.8 * u},${my - 1.7 * u} ${x + 2.5 * u},${my - 1.9 * u} ${x + 2.6 * u},${my - 0.6 * u} C${x + 2.4 * u},${my + 0.8 * u} ${x + 0.8 * u},${my + 1 * u} ${x + 0.3 * u},${my + 0.2 * u} Q${x},${my - 0.1 * u} ${x - 0.3 * u},${my + 0.2 * u} C${x - 0.8 * u},${my + 1 * u} ${x - 2.4 * u},${my + 0.8 * u} ${x - 2.6 * u},${my - 0.6 * u} Z`;
      return (
        <g>
          <path
            d={`M${x + 1.7 * u},${my + 0.5 * u} L${x + 2.4 * u},${y + 2.4 * u}`}
            stroke={k.gold}
            strokeWidth={2.2}
            strokeLinecap="round"
          />
          <path d={mask} fill={k.jet} stroke={k.pink} strokeWidth={1.6} strokeLinejoin="round" />
          <ellipse cx={x - 1.2 * u} cy={my - 0.5 * u} rx={0.65 * u} ry={0.35 * u} fill={k.bright} />
          <ellipse cx={x + 1.2 * u} cy={my - 0.5 * u} rx={0.65 * u} ry={0.35 * u} fill={k.bright} />
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
          fill={k.jet}
          stroke={k.gold}
          strokeWidth={2}
        />
        <circle
          cx={x}
          cy={y}
          r={r - 3.5}
          fill="none"
          stroke={k.gold}
          strokeOpacity={0.5}
          strokeWidth={0.7}
        />
      </>
    ),
  };
}

function masqSkin(id: string, name: string, k: Ink): Theme {
  const flat = Object.fromEntries(BASE.map((t) => [t, k.land[t][1]])) as Record<BaseType, string>;
  return skin({
    id,
    name,
    description:
      'The island on a card table: jewel tiles rimmed in gold, green baize, a masked thief.',
    terrain: flat,
    sea: k.felt,
    seaEdge: k.gold,
    art: art(k),
    seaPattern: sea(k),
    rest: {
      token: k.jet,
      tokenText: k.bright,
      tokenHot: k.pink,
      outline: k.jet,
      robber: k.jet,
      landStroke: k.gold,
      landStrokeWidth: 2.2,
      harborWood: '#2a1a2e',
      harborFace: k.jet,
      harborText: k.bright,
      pieceEffect: 'lift',
      tokenFont: "'Bodoni Moda', Georgia, serif",
      pieces: pieces(k),
      boardBackground: k.felt,
    },
  });
}

export const masqVelvetBoard = masqSkin('masq-velvet', 'Masquerade · Velvet', {
  land: {
    forest: ['#16483a', '#1d5c46'],
    hills: ['#712e21', '#8e3b2a'],
    pasture: ['#4a7330', '#5f8f3a'],
    fields: ['#94701a', '#b88a1e'],
    mountains: ['#3a3d4f', '#4b4f63'],
    desert: ['#55473a', '#6b5a48'],
  },
  gold: '#d4a94a',
  bright: '#f2c14e',
  pink: '#ff3e8a',
  jet: '#0c060d',
  felt: '#0f3a36',
  feltLine: '#0c302d',
});
