import type { ReactNode } from 'react';
import type { Theme, ThemePieces } from '../clean.ts';
import { resourceIcon } from './icons.tsx';
import { POP_ICONS } from './iconSets.ts';
import { BASE, CX, CY, H, seaTile, skin, W, type BaseType } from './kit.tsx';

/**
 * Sunrise Deck boards: a cartoon voyage. Chunky tiles with a thick navy outline and a glint of
 * morning light along their top edges, cream number discs, and a sea of little blue swells.
 * Settlements are beach huts, cities harbour houses flying a pennant, and the robber is a grumpy
 * rain cloud: nobody works under it.
 */

interface Ink {
  land: Record<BaseType, string>;
  ink: string;
  cream: string;
  sea: string;
  swell: string;
  hot: string;
  cloud: string;
}

/** Hard shadows fall down and to the right, like the panels around the board. */
const SH = { dx: 1.6, dy: 2 };

// The morning glint: a band of light along the two top edges, just inside the outline.
const R = 52;
const SIDE = R * Math.cos(Math.PI / 6);
const GLINT = [
  [CX - SIDE, CY - R / 2],
  [CX, CY - R],
  [CX + SIDE, CY - R / 2],
  [CX + SIDE, CY - R / 2 + 6],
  [CX, CY - R + 6],
  [CX - SIDE, CY - R / 2 + 6],
]
  .map(([x, y]) => `${x!.toFixed(1)},${y!.toFixed(1)}`)
  .join(' ');

function art(k: Ink): Record<BaseType, ReactNode> {
  const tile = (type: BaseType) => (
    <>
      <rect width={W} height={H} fill={k.land[type]} />
      <polygon points={GLINT} fill={k.cream} opacity={0.3} />
      {resourceIcon(
        type,
        { body: k.cream, line: k.ink, solid: k.ink, grain: k.cream, width: 1.9 },
        POP_ICONS,
      )}
    </>
  );
  return Object.fromEntries(BASE.map((t) => [t, tile(t)])) as Record<BaseType, ReactNode>;
}

function sea(k: Ink): ReactNode {
  return seaTile(72, 52, [
    <rect key="bg" width={72} height={52} fill={k.sea} />,
    <path
      key="s"
      d="M8,16 q6,-6 12,0 t12,0 M42,40 q6,-6 12,0 t12,0"
      fill="none"
      stroke={k.swell}
      strokeWidth={2.2}
      strokeLinecap="round"
    />,
    <path
      key="glint"
      d="M58,12 h5 M60.5,9.5 v5"
      stroke={k.cream}
      strokeOpacity={0.55}
      strokeWidth={1.4}
      strokeLinecap="round"
    />,
  ]);
}

function pieces(k: Ink): ThemePieces {
  const shade = (d: string) => (
    <path d={d} transform={`translate(${SH.dx} ${SH.dy})`} fill={k.ink} opacity={0.4} />
  );
  return {
    house: ({ x, y, color, city, s }) => {
      const u = s * 0.1;
      if (!city) {
        const hut = `M${x - 1.6 * u},${y + 1.7 * u} V${y - 0.3 * u} L${x},${y - 1.9 * u} L${x + 1.6 * u},${y - 0.3 * u} V${y + 1.7 * u} Z`;
        return (
          <g>
            {shade(hut)}
            <path d={hut} fill={color} stroke={k.ink} strokeWidth={2.6} strokeLinejoin="round" />
            <rect
              x={x - 0.45 * u}
              y={y + 0.5 * u}
              width={0.9 * u}
              height={1.2 * u}
              rx={0.3 * u}
              fill={k.ink}
            />
          </g>
        );
      }
      const house = `M${x - 2 * u},${y + 1.8 * u} V${y - 0.3 * u} L${x - u},${y - 1.2 * u} L${x},${y - 0.3 * u} V${y - 1.4 * u} L${x + u},${y - 2.3 * u} L${x + 2 * u},${y - 1.4 * u} V${y + 1.8 * u} Z`;
      return (
        <g>
          {shade(house)}
          <path
            d={`M${x + u},${y - 2.3 * u} V${y - 3.7 * u}`}
            stroke={k.ink}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
          <path
            d={`M${x + u},${y - 3.7 * u} L${x + 2.4 * u},${y - 3.3 * u} L${x + u},${y - 2.85 * u} Z`}
            fill={k.cream}
            stroke={k.ink}
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
          <path d={house} fill={color} stroke={k.ink} strokeWidth={2.6} strokeLinejoin="round" />
          <rect x={x + 0.6 * u} y={y - 0.9 * u} width={0.8 * u} height={0.8 * u} fill={k.ink} />
          <rect
            x={x - 1.4 * u}
            y={y + 0.6 * u}
            width={0.8 * u}
            height={1.2 * u}
            rx={0.3 * u}
            fill={k.ink}
          />
        </g>
      );
    },
    road: ({ a, b, color, s }) => (
      <>
        <line
          x1={a.x + SH.dx}
          y1={a.y + SH.dy}
          x2={b.x + SH.dx}
          y2={b.y + SH.dy}
          stroke={k.ink}
          strokeOpacity={0.4}
          strokeWidth={s * 0.19}
          strokeLinecap="round"
        />
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={k.ink}
          strokeWidth={s * 0.19}
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
      const cloud = `M${x - 2.6 * u},${y} A${1.2 * u},${1.2 * u} 0 0 1 ${x - 1.6 * u},${y - 1.6 * u} A${1.5 * u},${1.5 * u} 0 0 1 ${x + 0.6 * u},${y - 2.2 * u} A${1.3 * u},${1.3 * u} 0 0 1 ${x + 2.2 * u},${y - 1 * u} A${u},${u} 0 0 1 ${x + 2.6 * u},${y} Z`;
      return (
        <g>
          <path
            d={[-1.4, 0, 1.4]
              .map((dx) => `M${x + dx * u},${y + 0.8 * u} l${-0.4 * u},${1.1 * u}`)
              .join(' ')}
            stroke={k.swell}
            strokeWidth={2.2}
            strokeLinecap="round"
          />
          {shade(cloud)}
          <path d={cloud} fill={k.cloud} stroke={k.ink} strokeWidth={2.4} strokeLinejoin="round" />
          <path
            d={`M${x - 1.1 * u},${y - 1.35 * u} L${x - 0.35 * u},${y - 1.05 * u} M${x + 1.1 * u},${y - 1.35 * u} L${x + 0.35 * u},${y - 1.05 * u}`}
            stroke={k.ink}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
          <circle cx={x - 0.7 * u} cy={y - 0.65 * u} r={0.24 * u} fill={k.ink} />
          <circle cx={x + 0.7 * u} cy={y - 0.65 * u} r={0.24 * u} fill={k.ink} />
        </g>
      );
    },
    token: ({ x, y, r }) => (
      <>
        <path
          d={`M${x - r + SH.dx},${y + SH.dy} a${r},${r} 0 1 0 ${2 * r},0 a${r},${r} 0 1 0 ${-2 * r},0 Z`}
          fill={k.ink}
          opacity={0.4}
        />
        <circle
          className="token-face"
          cx={x}
          cy={y}
          r={r}
          fill={k.cream}
          stroke={k.ink}
          strokeWidth={3}
        />
      </>
    ),
  };
}

function sunriseSkin(id: string, name: string, k: Ink): Theme {
  return skin({
    id,
    name,
    description:
      'A cartoon voyage: chunky tiles in thick navy ink, cream discs, a rain-cloud robber.',
    terrain: k.land,
    sea: k.sea,
    seaEdge: k.ink,
    art: art(k),
    seaPattern: sea(k),
    rest: {
      token: k.cream,
      tokenText: k.ink,
      tokenHot: k.hot,
      outline: k.ink,
      robber: k.cloud,
      landStroke: k.ink,
      landStrokeWidth: 4,
      harborWood: '#8a5a2b',
      harborFace: k.cream,
      harborText: k.ink,
      pieceEffect: 'lift',
      tokenFont: "'Lilita One', system-ui, sans-serif",
      pieces: pieces(k),
      boardBackground: k.sea,
    },
  });
}

export const sunriseMorningBoard = sunriseSkin('sunrise-morning', 'Sunrise Deck · Morning', {
  land: {
    forest: '#2f7d3b',
    hills: '#d0632b',
    pasture: '#8cc63f',
    fields: '#f2c230',
    mountains: '#8a8f99',
    desert: '#ead7a1',
  },
  ink: '#1d2433',
  cream: '#fff8e6',
  sea: '#3d9bd1',
  swell: '#7cc3ea',
  hot: '#c6232b',
  cloud: '#6b7489',
});
