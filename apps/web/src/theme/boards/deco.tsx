import type { ReactNode } from 'react';
import type { Theme, ThemePieces } from '../clean.ts';
import { inkOn, resourceIcon } from './icons.tsx';
import { BASE, CX, H, poly, r1, seaTile, skin, W, type BaseType } from './kit.tsx';

/**
 * Grand Saloon boards: 1930s liner lacquer. Each land is one deep colour with a faint gold sunburst
 * and a single gold-lined icon; the sea is quiet fan scales. Numbers are set in Jost, a plain
 * geometric face that reads at a glance. Settlements are stepped towers, cities skyscrapers with a
 * spire, and the robber is a jewel thief in a top hat.
 */

interface Ink {
  land: Record<BaseType, string>;
  /** The darker tone of each land, for shapes. */
  deep: Record<BaseType, string>;
  /** Gold leaf for lines. */
  gold: string;
  /** Ivory highlights: sheep, snow, the sun. */
  light: string;
  /** Outlines on pieces. */
  edge: string;
  sea: string;
  seaLine: string;
  face: string;
  faceText: string;
  hot: string;
  thief: string;
}

function art(k: Ink): Record<BaseType, ReactNode> {
  // A faint sunburst behind every hex: the deco note, kept quiet so the icon carries the message.
  const rays = Array.from({ length: 13 }, (_, i) => {
    const a = Math.PI + (Math.PI * (i + 0.5)) / 13;
    return `M${CX},${H + 6} L${r1(CX + 130 * Math.cos(a))},${r1(H + 6 + 130 * Math.sin(a))}`;
  }).join(' ');
  const tile = (type: BaseType) => {
    const ink = inkOn(k.land[type], k.gold, k.edge);
    return (
      <>
        <rect width={W} height={H} fill={k.land[type]} />
        <path d={rays} stroke={k.gold} strokeOpacity={0.13} strokeWidth={1} fill="none" />
        <polygon
          points={poly(CX, H / 2, 52, 6)}
          fill="none"
          stroke={k.gold}
          strokeOpacity={0.45}
          strokeWidth={0.8}
        />
        {resourceIcon(type, {
          body: k.deep[type],
          line: ink,
          solid: ink,
          width: 1.5,
        })}
      </>
    );
  };
  return Object.fromEntries(BASE.map((t) => [t, tile(t)])) as Record<BaseType, ReactNode>;
}

function sea(k: Ink): ReactNode {
  const r = 12;
  const scale = (x: number, y: number, key: string) => (
    <g key={key}>
      {[r, r * 0.7, r * 0.4].map((rr, i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={rr}
          fill={k.sea}
          stroke={k.seaLine}
          strokeOpacity={0.45}
          strokeWidth={0.8}
        />
      ))}
    </g>
  );
  return seaTile(2 * r, r, [
    <rect key="bg" width={2 * r} height={r} fill={k.sea} />,
    scale(r, -r / 2, 'a'),
    scale(0, 0, 'b'),
    scale(2 * r, 0, 'c'),
    scale(r, r / 2, 'd'),
    scale(0, r, 'e'),
    scale(2 * r, r, 'f'),
  ]);
}

function pieces(k: Ink): ThemePieces {
  return {
    house: ({ x, y, color, city, s }) => {
      const u = s * 0.1;
      const d = city
        ? `M${x - 2.6 * u},${y + 1.8 * u} V${y - 0.6 * u} H${x - 1.8 * u} V${y - 1.8 * u} H${x - 0.9 * u} V${y - 3 * u} L${x},${y - 4.6 * u} L${x + 0.9 * u},${y - 3 * u} V${y - 1.8 * u} H${x + 1.8 * u} V${y - 0.6 * u} H${x + 2.6 * u} V${y + 1.8 * u} Z`
        : `M${x - 1.7 * u},${y + 1.6 * u} V${y - 0.6 * u} H${x - 1.1 * u} V${y - 1.6 * u} H${x - 0.5 * u} V${y - 2.4 * u} H${x + 0.5 * u} V${y - 1.6 * u} H${x + 1.1 * u} V${y - 0.6 * u} H${x + 1.7 * u} V${y + 1.6 * u} Z`;
      return (
        <g filter="url(#lift)">
          <path d={d} fill={color} stroke={k.edge} strokeWidth={2} strokeLinejoin="miter" />
          <path
            d={
              city
                ? `M${x},${y - 3.2 * u} V${y + 1.4 * u} M${x - 1.8 * u},${y - 0.2 * u} V${y + 1.4 * u} M${x + 1.8 * u},${y - 0.2 * u} V${y + 1.4 * u}`
                : `M${x},${y - 1.9 * u} V${y + 1.2 * u}`
            }
            stroke={k.gold}
            strokeWidth={1.4}
          />
          <path d={d} fill="none" stroke={k.gold} strokeWidth={0.8} strokeOpacity={0.9} />
        </g>
      );
    },
    road: ({ a, b, color, s }) => (
      <>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={k.edge} strokeWidth={s * 0.17} />
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={s * 0.12} />
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={k.gold} strokeWidth={s * 0.022} />
      </>
    ),
    robber: ({ x, y, s }) => {
      const u = s * 0.1;
      return (
        <g stroke={k.gold} strokeWidth={1.1} strokeLinejoin="round">
          <path
            d={`M${x + 1.9 * u},${y + 2.2 * u} L${x + 2.3 * u},${y - 0.8 * u}`}
            stroke={k.gold}
            strokeWidth={1.6}
          />
          <path
            d={`M${x - 1.8 * u},${y + 2.3 * u} L${x - 1.1 * u},${y - 0.4 * u} Q${x},${y - 1.1 * u} ${x + 1.1 * u},${y - 0.4 * u} L${x + 1.8 * u},${y + 2.3 * u} Z`}
            fill={k.thief}
          />
          <circle cx={x} cy={y - 1.5 * u} r={0.85 * u} fill={k.thief} />
          <rect
            x={x - 0.9 * u}
            y={y - 1.75 * u}
            width={1.8 * u}
            height={0.45 * u}
            fill={k.gold}
            stroke="none"
          />
          <path d={`M${x - 1.3 * u},${y - 2.2 * u} H${x + 1.3 * u}`} strokeWidth={1.6} />
          <rect x={x - 0.75 * u} y={y - 3.5 * u} width={1.5 * u} height={1.3 * u} fill={k.thief} />
        </g>
      );
    },
    token: ({ x, y, r }) => (
      <>
        <circle cx={x} cy={y} r={r} fill={k.face} stroke={k.gold} strokeWidth={2.4} />
        <circle cx={x} cy={y} r={r - 3.2} fill="none" stroke={k.gold} strokeWidth={0.8} />
      </>
    ),
  };
}

function decoSkin(id: string, name: string, description: string, k: Ink): Theme {
  return skin({
    id,
    name,
    description,
    terrain: k.land,
    sea: k.sea,
    seaEdge: k.seaLine,
    art: art(k),
    seaPattern: sea(k),
    rest: {
      token: k.face,
      tokenText: k.faceText,
      tokenHot: k.hot,
      outline: k.edge,
      robber: k.thief,
      landStroke: k.gold,
      landStrokeWidth: 1.6,
      harborWood: k.gold,
      harborFace: k.face,
      harborText: k.faceText,
      pieceEffect: 'lift',
      tokenFont: "Jost, 'Futura', system-ui, sans-serif",
      pieces: pieces(k),
      boardBackground: `radial-gradient(circle at 50% 45%, ${k.sea} 0%, ${k.edge} 100%)`,
    },
  });
}

export const decoEmeraldBoard = decoSkin(
  'deco-emerald',
  'Grand Saloon · Emerald',
  'Art deco lacquer and gold leaf.',
  {
    land: {
      forest: '#1d5a43',
      hills: '#9b4630',
      pasture: '#6f925a',
      fields: '#c9963a',
      mountains: '#55626b',
      desert: '#d6bd86',
    },
    deep: {
      forest: '#0f3a2b',
      hills: '#6e2c1d',
      pasture: '#4d6f3f',
      fields: '#a8772a',
      mountains: '#38434b',
      desert: '#b99a5e',
    },
    gold: '#e3c06e',
    light: '#f6ead0',
    edge: '#0b1712',
    sea: '#0c2f36',
    seaLine: '#3f7f78',
    face: '#f6ead0',
    faceText: '#14211b',
    hot: '#9b2a1a',
    thief: '#121212',
  },
);

export const decoIvoryBoard = decoSkin(
  'deco-ivory',
  'Grand Saloon · Ivory',
  'Art deco ivory, navy and brass.',
  {
    land: {
      forest: '#4f8a6e',
      hills: '#c46f52',
      pasture: '#a7c08a',
      fields: '#e6bf68',
      mountains: '#8c97a3',
      desert: '#efdcae',
    },
    deep: {
      forest: '#2f6650',
      hills: '#9b4e36',
      pasture: '#7f9c64',
      fields: '#c99a45',
      mountains: '#66717d',
      desert: '#d6bd86',
    },
    gold: '#14365c',
    light: '#fffbf1',
    edge: '#14365c',
    sea: '#d9e3e6',
    seaLine: '#8aa3b3',
    face: '#fffbf1',
    faceText: '#14365c',
    hot: '#a3352a',
    thief: '#15212e',
  },
);
