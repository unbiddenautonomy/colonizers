import type { ReactNode } from 'react';
import type { Theme, ThemePieces } from '../clean.ts';
import { inkOn, resourceIcon } from './icons.tsx';
import { BASE, H, seaTile, skin, W, type BaseType } from './kit.tsx';

/**
 * Grand Saloon boards: 1930s liner lacquer. Each land is one deep colour with a single gold-lined
 * icon. Across all the land at once is one faint figure in the manner of the Nazca
 * geoglyphs, drawn in board units so its lines cross from hex to hex and pass behind the icons and
 * numbers. The sea is quiet fan
 * scales. Numbers are set in Jost, a plain
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
  /** The geoglyph's line colour. */
  glyph: string;
}

function art(k: Ink): Record<BaseType, ReactNode> {
  const tile = (type: BaseType) => {
    const ink = inkOn(k.land[type], k.gold, k.edge);
    return (
      <>
        <rect width={W} height={H} fill={k.land[type]} />
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

/** The geoglyph tile, centred on the board's centre. */
const NAZCA_W = 960;
const NAZCA_H = 840;

/**
 * One great figure across the whole board, drawn as a geoglyph is: a single unbroken outline. It
 * is a hummingbird in the Nazca manner (an ancient design, long in the public domain), wings
 * spread over the land, its long beak reaching to the upper right, its tail fanned below.
 */
function nazca(k: Ink): ReactNode {
  const ox = NAZCA_W / 2;
  const oy = NAZCA_H / 2 + 10;
  const pts = (list: [number, number][]) =>
    list.map(([x, y], i) => `${i ? 'L' : 'M'}${ox + x},${oy + y}`).join(' ');
  const wing = (side: 1 | -1) =>
    pts(
      (
        [
          [26, -58],
          [232, -150],
          [246, -124],
          [210, -104],
          [244, -86],
          [206, -66],
          [238, -46],
          [198, -28],
          [226, -6],
          [30, 18],
        ] as [number, number][]
      ).map(([x, y]) => [x * side, y]),
    );
  const d = [
    // Beak: a long narrow wedge from the head.
    pts([
      [-7, -128],
      [170, -246],
      [8, -120],
    ]),
    // Head and body as one outline, the eye a ring.
    `M${ox - 26},${oy - 54} C${ox - 40},${oy - 120} ${ox + 40},${oy - 150} ${ox + 26},${oy - 54} C${ox + 34},${oy + 20} ${ox + 20},${oy + 80} ${ox + 14},${oy + 112} L${ox - 14},${oy + 112} C${ox - 20},${oy + 80} ${ox - 34},${oy + 20} ${ox - 26},${oy - 54} Z`,
    `M${ox - 6},${oy - 100} a6,6 0 1 0 12,0 a6,6 0 1 0 -12,0`,
    wing(1),
    wing(-1),
    // Tail: a fan of feathers.
    pts([
      [-14, 112],
      [-64, 222],
      [-34, 208],
      [-22, 236],
      [0, 212],
      [22, 236],
      [34, 208],
      [64, 222],
      [14, 112],
    ]),
  ].join(' ');
  return (
    <pattern
      key="nazca"
      id="deco-nazca"
      patternUnits="userSpaceOnUse"
      x={-NAZCA_W / 2}
      y={-NAZCA_H / 2}
      width={NAZCA_W}
      height={NAZCA_H}
    >
      <path
        d={d}
        transform={`translate(${ox} ${oy}) scale(0.9) translate(${-ox} ${-oy})`}
        fill={k.glyph}
        fillOpacity={0.1}
        fillRule="nonzero"
        stroke={k.glyph}
        strokeOpacity={0.55}
        strokeWidth={2.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </pattern>
  );
}

function decoSkin(id: string, name: string, description: string, k: Ink): Theme {
  const t = skin({
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
      landOverlay: 'deco-nazca',
    },
  });
  const own = t.patterns!;
  return {
    ...t,
    patterns: () => (
      <>
        {nazca(k)}
        {own()}
      </>
    ),
  };
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
    glyph: '#f6ead0',
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
    glyph: '#14365c',
  },
);
