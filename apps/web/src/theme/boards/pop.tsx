import type { ReactNode } from 'react';
import type { Theme, ThemePieces } from '../clean.ts';
import { CX, fill, r1, seaTile, sheep, skin, type BaseType } from './kit.tsx';

/**
 * Tabletop Pop boards: stickers. Chunky shapes in each scheme's colours, thick ink outlines, a
 * hard offset shadow under everything and a white shine. Settlements and cities sit on their own
 * shadows, the robber is a masked bandit and the number tokens are sticker discs.
 */

interface Ink {
  land: Record<BaseType, string>;
  deep: Record<BaseType, string>;
  ink: string;
  light: string;
  accent: string;
  sea: string;
  wave: string;
  hot: string;
}

/** Draws a shape twice: a hard shadow in ink, then the shape itself. */
function stuck(d: string, color: string, ink: string, w = 2.4, off = 2.2, key?: string) {
  return (
    <g key={key}>
      <path d={d} transform={`translate(${off} ${off})`} fill={ink} />
      <path d={d} fill={color} stroke={ink} strokeWidth={w} strokeLinejoin="round" />
    </g>
  );
}

const circle = (x: number, y: number, r: number) =>
  `M${x - r},${y} a${r},${r} 0 1 0 ${2 * r},0 a${r},${r} 0 1 0 ${-2 * r},0 Z`;

function art(k: Ink): Record<BaseType, ReactNode> {
  const shine = (x: number, y: number, r: number) => (
    <path
      d={`M${r1(x - r * 0.55)},${r1(y - r * 0.1)} a${r * 0.6},${r * 0.6} 0 0 1 ${r1(r * 0.5)},${r1(-r * 0.45)}`}
      fill="none"
      stroke={k.light}
      strokeWidth={2}
      strokeLinecap="round"
    />
  );
  const tree = (x: number, y: number, r: number, key: string) => (
    <g key={key}>
      {stuck(`M${x - 2.5},${y + r * 0.6} h5 v${r * 0.9} h-5 Z`, k.deep.hills, k.ink, 2)}
      {stuck(circle(x, y, r), k.deep.forest, k.ink)}
      {shine(x, y, r)}
    </g>
  );
  return {
    forest: (
      <>
        {fill(k.land.forest)}
        {tree(22, 30, 13, 'a')}
        {tree(CX, 16, 11, 'b')}
        {tree(82, 30, 13, 'c')}
        {tree(18, 90, 10, 'd')}
        {tree(86, 92, 10, 'e')}
      </>
    ),
    pasture: (
      <>
        {fill(k.land.pasture)}
        {[
          [14, 70],
          [92, 72],
          [30, 108],
          [74, 108],
        ].map(([x, y]) => (
          <g key={`${x}`}>
            <circle cx={x} cy={y} r={3.4} fill={k.light} stroke={k.ink} strokeWidth={1.4} />
            <circle cx={x} cy={y} r={1.3} fill={k.accent} />
          </g>
        ))}
        <g transform="translate(2 2)">
          {sheep({ x: 48, y: 30, s: 1.35, wool: k.ink, head: k.ink, line: k.ink, width: 2.4 })}
        </g>
        {sheep({ x: 48, y: 30, s: 1.35, wool: k.light, head: k.ink, line: k.ink, width: 2.2 })}
        <circle cx={66} cy={25} r={1.4} fill={k.light} />
      </>
    ),
    fields: (
      <>
        {fill(k.land.fields)}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <path
            key={i}
            d={`M${6 + i * 18},${74} q4,-8 8,0 M${-3 + i * 18},${100} q4,-8 8,0`}
            fill="none"
            stroke={k.deep.fields}
            strokeWidth={2.4}
            strokeLinecap="round"
          />
        ))}
        {/* A sheaf, tied */}
        {stuck('M40,46 L30,10 Q52,-2 74,10 L64,46 Z', k.deep.fields, k.ink)}
        {[34, 42, 52, 62, 70].map((x, i) => (
          <ellipse
            key={x}
            cx={x}
            cy={10 + (i % 2) * 3}
            rx={4}
            ry={7}
            fill={k.land.fields}
            stroke={k.ink}
            strokeWidth={1.8}
          />
        ))}
        {stuck('M36,28 H68 V35 H36 Z', k.accent, k.ink, 2, 1.6)}
        <path d="M44,40 v6 M52,40 v6 M60,40 v6" stroke={k.ink} strokeWidth={1.4} />
      </>
    ),
    hills: (
      <>
        {fill(k.land.hills)}
        {[
          [22, 30],
          [48, 30],
          [74, 30],
          [35, 16],
          [61, 16],
          [48, 2],
        ].map(([x = 0, y], i) =>
          stuck(`M${x - 12},${y} h24 v12 h-24 Z`, k.deep.hills, k.ink, 2.2, 2, `b${i}`),
        )}
        {[
          [14, 84],
          [90, 80],
          [24, 104],
          [80, 106],
        ].map(([x, y]) => (
          <circle key={`${x}`} cx={x} cy={y} r={2.4} fill={k.deep.hills} />
        ))}
      </>
    ),
    mountains: (
      <>
        {fill(k.land.mountains)}
        {stuck('M-4,62 L28,12 L56,62 Z', k.deep.mountains, k.ink)}
        {stuck('M40,62 L74,6 L110,62 Z', k.deep.mountains, k.ink)}
        <path
          d="M28,12 L20,25 L25,22 L28,27 L32,22 L36,25 Z"
          fill={k.light}
          stroke={k.ink}
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
        <path
          d="M74,6 L65,21 L70,18 L74,23 L78,18 L83,21 Z"
          fill={k.light}
          stroke={k.ink}
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
        {[
          [20, 96],
          [86, 98],
        ].map(([x, y]) => (
          <g key={`${x}`}>
            {stuck(
              `M${x! - 9},${y} L${x},${y! - 12} L${x! + 9},${y} Z`,
              k.deep.mountains,
              k.ink,
              2,
              1.6,
            )}
          </g>
        ))}
      </>
    ),
    desert: (
      <>
        {fill(k.land.desert)}
        {stuck(circle(84, 20, 10), k.accent, k.ink)}
        {stuck('M30,62 V24 a6,6 0 0 1 12,0 V62 Z', k.deep.forest, k.ink)}
        {stuck(
          'M30,44 H22 a4,4 0 0 1 -4,-4 V32 a4,4 0 0 1 8,0 V36 H30 Z',
          k.deep.forest,
          k.ink,
          2.2,
          1.8,
        )}
        {stuck(
          'M42,38 H48 V30 a4,4 0 0 1 8,0 V38 a6,6 0 0 1 -6,6 H42 Z',
          k.deep.forest,
          k.ink,
          2.2,
          1.8,
        )}
        <path d="M34,22 v6 M38,30 v6" stroke={k.light} strokeWidth={1.6} strokeLinecap="round" />
        {[
          [16, 96],
          [86, 92],
          [50, 110],
        ].map(([x, y]) => (
          <path
            key={`${x}`}
            d={`M${x! - 14},${y} q14,-10 28,0`}
            fill="none"
            stroke={k.deep.desert}
            strokeWidth={2.4}
            strokeLinecap="round"
          />
        ))}
      </>
    ),
  };
}

function sea(k: Ink): ReactNode {
  return seaTile(40, 30, [
    <rect key="bg" width={40} height={30} fill={k.sea} />,
    <path
      key="a"
      d="M4,10 q4,-5 8,0 t8,0"
      fill="none"
      stroke={k.wave}
      strokeWidth={2.2}
      strokeLinecap="round"
    />,
    <path
      key="b"
      d="M24,25 q4,-5 8,0 t8,0"
      fill="none"
      stroke={k.wave}
      strokeWidth={2.2}
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
          <path d={d} transform={`translate(${0.4 * u} ${0.4 * u})`} fill={k.ink} />
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
          x1={a.x + 2}
          y1={a.y + 2}
          x2={b.x + 2}
          y2={b.y + 2}
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
          <path d={meeple} transform={`translate(${0.4 * u} ${0.4 * u})`} fill={k.ink} />
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
    token: ({ x, y, r }) => (
      <>
        <circle cx={x + 2} cy={y + 2} r={r} fill={k.ink} />
        <circle cx={x} cy={y} r={r} fill={k.light} stroke={k.ink} strokeWidth={2.4} />
      </>
    ),
  };
}

function popSkin(id: string, name: string, k: Ink): Theme {
  return skin({
    id,
    name,
    description: 'Stickers: chunky shapes, thick ink, hard shadows.',
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
    forest: '#2fb36c',
    hills: '#ff6b5a',
    pasture: '#a5e36f',
    fields: '#ffc25c',
    mountains: '#b3adf0',
    desert: '#ffe0a0',
  },
  deep: {
    forest: '#1f8a52',
    hills: '#c8432f',
    pasture: '#6cb83f',
    fields: '#e08a1a',
    mountains: '#6f67c9',
    desert: '#e8b34f',
  },
  ink: '#17152b',
  light: '#ffffff',
  accent: '#ffb547',
  sea: '#6a5cff',
  wave: '#b4adff',
  hot: '#d6304a',
});

export const popSorbetBoard = popSkin('pop-sorbet', 'Tabletop Pop · Sorbet', {
  land: {
    forest: '#64c9a0',
    hills: '#ff9a94',
    pasture: '#c3efa5',
    fields: '#ffd29a',
    mountains: '#cfc3ee',
    desert: '#ffe9c2',
  },
  deep: {
    forest: '#2f9a74',
    hills: '#e0606f',
    pasture: '#82c866',
    fields: '#f0a052',
    mountains: '#9a86c9',
    desert: '#f2c27e',
  },
  ink: '#2b1620',
  light: '#ffffff',
  accent: '#ff7aa8',
  sea: '#7fe0c5',
  wave: '#ffffff',
  hot: '#bb2e60',
});

export const popCitrusBoard = popSkin('pop-citrus', 'Tabletop Pop · Citrus Club', {
  land: {
    forest: '#1f8f6c',
    hills: '#ff8550',
    pasture: '#b4e05a',
    fields: '#ffd84a',
    mountains: '#a9bab0',
    desert: '#ffeaa5',
  },
  deep: {
    forest: '#0d5a46',
    hills: '#d0501f',
    pasture: '#6fa82a',
    fields: '#e6a800',
    mountains: '#6f8278',
    desert: '#f2c94a',
  },
  ink: '#14231c',
  light: '#ffffff',
  accent: '#ff8550',
  sea: '#3fb6d8',
  wave: '#bfeefa',
  hot: '#c2410c',
});

export const popArcadeBoard = popSkin('pop-arcade', 'Tabletop Pop · Arcade Night', {
  land: {
    forest: '#1fd1a5',
    hills: '#ff5f8a',
    pasture: '#8cff6a',
    fields: '#ffd23f',
    mountains: '#9a88ff',
    desert: '#ffb86b',
  },
  deep: {
    forest: '#0f8f72',
    hills: '#c82c5c',
    pasture: '#3fc23a',
    fields: '#e0a000',
    mountains: '#5a45d6',
    desert: '#e0802f',
  },
  ink: '#000000',
  light: '#ffffff',
  accent: '#ff5fb8',
  sea: '#221c46',
  wave: '#3df5d0',
  hot: '#d6246e',
});
