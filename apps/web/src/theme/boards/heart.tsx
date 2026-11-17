import type { ReactNode } from 'react';
import type { Theme, ThemePieces } from '../clean.ts';
import { resourceIcon } from './icons.tsx';
import { ISLES_ICONS } from './iconSets.ts';
import { BASE, CX, H, seaTile, skin, W, type BaseType } from './kit.tsx';

/**
 * Grand Line · Heart Pirates: North Blue, seen through the Polar Tang's periscope. Cold lands
 * with snow along their top edges, a deep sea full of bubbles, and brass portholes for number
 * discs. Settlements are snow domes, cities are yellow submarines, and the robber is a Room: a
 * pale blue dome where the surgeon has the field to himself.
 */

interface Ink {
  land: Record<BaseType, string>;
  ink: string;
  snow: string;
  sea: string;
  bubble: string;
  brass: string;
  brassDark: string;
  glass: string;
  room: string;
}

/** Snow lying along the two upper edges of the tile, a little lumpy underneath. */
const SNOW = `M0,0 H${W} V31 L${CX},1 Z M0,31 L${CX},1 L${W},31 V38 Q${W - 8},34 ${W - 14},38 T${W - 30},33 T${CX + 4},14 T${CX - 14},16 Q${CX - 22},24 ${CX - 30},26 T22,35 T0,38 Z`;

function art(k: Ink): Record<BaseType, ReactNode> {
  const tile = (type: BaseType) => (
    <>
      <rect width={W} height={H} fill={k.land[type]} />
      <path d={SNOW} fill={k.snow} opacity={0.92} />
      <path
        d="M78,92 l2,-4 l2,4 l-2,4 z M20,84 l1.5,-3 l1.5,3 l-1.5,3 z"
        fill={k.snow}
        opacity={0.7}
      />
      {resourceIcon(
        type,
        { body: k.snow, line: k.ink, solid: k.ink, grain: k.snow, width: 1.6 },
        ISLES_ICONS,
      )}
    </>
  );
  return Object.fromEntries(BASE.map((t) => [t, tile(t)])) as Record<BaseType, ReactNode>;
}

function sea(k: Ink): ReactNode {
  const bubble = (x: number, y: number, r: number, key: string) => (
    <circle
      key={key}
      cx={x}
      cy={y}
      r={r}
      fill="none"
      stroke={k.bubble}
      strokeOpacity={0.55}
      strokeWidth={1}
    />
  );
  return seaTile(72, 72, [
    <rect key="bg" width={72} height={72} fill={k.sea} />,
    bubble(14, 20, 3, 'a'),
    bubble(19, 12, 1.6, 'b'),
    bubble(52, 54, 2.4, 'c'),
    bubble(57, 47, 1.3, 'd'),
    <path
      key="sonar"
      d="M30,64 a12,12 0 0 1 24,0"
      fill="none"
      stroke={k.bubble}
      strokeOpacity={0.18}
      strokeWidth={1}
    />,
  ]);
}

function pieces(k: Ink): ThemePieces {
  const edge = { stroke: k.ink, strokeWidth: 2, strokeLinejoin: 'round' as const };
  return {
    house: ({ x, y, color, city, s }) => {
      const u = s * 0.1;
      if (!city) {
        // A snow dome with a round door.
        return (
          <g>
            <path
              d={`M${x - 2.1 * u},${y + 1.6 * u} A${2.1 * u},${2.2 * u} 0 0 1 ${x + 2.1 * u},${y + 1.6 * u} Z`}
              fill={color}
              {...edge}
            />
            <path
              d={`M${x - 1.6 * u},${y + 0.3 * u} H${x + 1.6 * u} M${x - 1.05 * u},${y - 0.55 * u} H${x + 1.05 * u}`}
              stroke={k.ink}
              strokeOpacity={0.45}
              strokeWidth={1}
            />
            <path
              d={`M${x - 0.6 * u},${y + 1.6 * u} V${y + 1 * u} A${0.6 * u},${0.6 * u} 0 0 1 ${x + 0.6 * u},${y + 1 * u} V${y + 1.6 * u} Z`}
              fill={k.ink}
            />
          </g>
        );
      }
      // A submarine: hull, conning tower, periscope and portholes.
      return (
        <g>
          <path
            d={`M${x + 0.25 * u},${y - 1.1 * u} V${y - 2.6 * u} H${x + 1 * u}`}
            fill="none"
            stroke={k.ink}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
          <rect
            x={x - 0.9 * u}
            y={y - 1.3 * u}
            width={1.6 * u}
            height={1.3 * u}
            rx={0.3 * u}
            fill={color}
            {...edge}
          />
          <rect
            x={x - 2.9 * u}
            y={y - 0.2 * u}
            width={5.8 * u}
            height={2 * u}
            rx={u}
            fill={color}
            {...edge}
          />
          {[-1.6, 0, 1.6].map((dx) => (
            <circle
              key={dx}
              cx={x + dx * u}
              cy={y + 0.8 * u}
              r={0.38 * u}
              fill={k.glass}
              stroke={k.ink}
              strokeWidth={1}
            />
          ))}
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
          strokeLinecap="round"
        />
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={color}
          strokeWidth={s * 0.095}
          strokeLinecap="round"
        />
      </>
    ),
    robber: ({ x, y, s }) => {
      const u = s * 0.1;
      // Room: a see-through dome, its rim on the ground, and a long sword standing in it.
      return (
        <g>
          <path
            d={`M${x - 3 * u},${y + 1.2 * u} A${3 * u},${3.1 * u} 0 0 1 ${x + 3 * u},${y + 1.2 * u} Z`}
            fill={k.room}
            fillOpacity={0.45}
            stroke={k.ink}
            strokeWidth={3.4}
          />
          <path
            d={`M${x - 3 * u},${y + 1.2 * u} A${3 * u},${3.1 * u} 0 0 1 ${x + 3 * u},${y + 1.2 * u}`}
            fill="none"
            stroke={k.room}
            strokeWidth={1.6}
          />
          <ellipse
            cx={x}
            cy={y + 1.2 * u}
            rx={3 * u}
            ry={0.7 * u}
            fill="none"
            stroke={k.room}
            strokeWidth={1.4}
            strokeDasharray="3 2"
          />
          <path
            d={`M${x + 1.1 * u},${y + 1.4 * u} L${x + 1.9 * u},${y - 2.4 * u}`}
            stroke={k.ink}
            strokeWidth={2.4}
            strokeLinecap="round"
          />
          <path
            d={`M${x + 1.1 * u},${y + 1.4 * u} L${x + 1.9 * u},${y - 2.4 * u}`}
            stroke="#e9eef5"
            strokeWidth={1}
            strokeLinecap="round"
          />
          <path
            d={`M${x + 1.35 * u},${y - 1.2 * u} l${0.9 * u},${0.2 * u}`}
            stroke={k.brass}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </g>
      );
    },
    // A porthole: brass ring with rivets, and glass with a glint.
    token: ({ x, y, r }) => (
      <>
        <circle
          className="token-face"
          cx={x}
          cy={y}
          r={r}
          fill={k.brass}
          stroke={k.brassDark}
          strokeWidth={1.6}
        />
        {Array.from({ length: 8 }, (_, i) => {
          const a = (Math.PI / 4) * i + Math.PI / 8;
          return (
            <circle
              key={i}
              cx={x + Math.cos(a) * r * 0.88}
              cy={y + Math.sin(a) * r * 0.88}
              r={r * 0.055}
              fill={k.brassDark}
            />
          );
        })}
        <circle cx={x} cy={y} r={r * 0.76} fill={k.glass} stroke={k.brassDark} strokeWidth={1.2} />
        <path
          d={`M${x - r * 0.55},${y - r * 0.15} A${r * 0.58},${r * 0.58} 0 0 1 ${x - r * 0.1},${y - r * 0.56}`}
          fill="none"
          stroke="#ffffff"
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      </>
    ),
  };
}

function heartSkin(id: string, name: string, k: Ink): Theme {
  return skin({
    id,
    name,
    description:
      'North Blue through a periscope: snowy lands, porthole discs, a Room for a robber.',
    terrain: k.land,
    sea: k.sea,
    seaEdge: k.ink,
    art: art(k),
    seaPattern: sea(k),
    rest: {
      token: k.glass,
      tokenText: k.ink,
      tokenHot: '#b3261e',
      outline: k.ink,
      robber: k.room,
      landStroke: k.ink,
      landStrokeWidth: 2.4,
      harborWood: k.brassDark,
      harborFace: k.glass,
      harborText: k.ink,
      pieceEffect: 'lift',
      tokenFont: "'Russo One', system-ui, sans-serif",
      pieces: pieces(k),
      boardBackground: k.sea,
    },
  });
}

export const heartBoard = heartSkin('heart-polar', 'Grand Line · Heart Pirates', {
  land: {
    forest: '#2f6b5e',
    hills: '#b0573d',
    pasture: '#8db58a',
    fields: '#d9b45a',
    mountains: '#7d8ca3',
    desert: '#cdbf9f',
  },
  ink: '#0a1828',
  snow: '#f4fbff',
  sea: '#123049',
  bubble: '#9fe6f2',
  brass: '#d1aa45',
  brassDark: '#5a4515',
  glass: '#e6f6fa',
  room: '#6fe0ee',
});
