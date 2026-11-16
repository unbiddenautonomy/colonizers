import type { ReactNode } from 'react';
import type { Theme, ThemePieces } from '../clean.ts';
import { CX, fill, H, poly, r1, seaTile, sheep, skin, W, type BaseType } from './kit.tsx';

/**
 * Grand Saloon boards: the land as 1930s liner decoration. Cypress groves cut in chevrons, wheat
 * under a sunburst, sheep on rolling arcs, a brick ziggurat, peaks ruled with gold, a pyramid at
 * sunrise and a sea of fan scales. Settlements are stepped towers, cities skyscrapers with a spire,
 * and the robber is a jewel thief in a top hat.
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
  const g = { stroke: k.gold, fill: 'none', strokeLinejoin: 'round' as const };

  const cypress = (x: number, y: number, h: number, w: number, key: string) => {
    const chevrons: ReactNode[] = [];
    for (let i = 1; i <= 4; i++) {
      const yy = y - (h * i) / 5.2;
      const ww = w * (0.75 - i * 0.08);
      chevrons.push(
        <path
          key={i}
          d={`M${r1(x - ww)},${r1(yy + ww * 0.7)} L${r1(x)},${r1(yy)} L${r1(x + ww)},${r1(yy + ww * 0.7)}`}
          {...g}
          strokeWidth={0.9}
        />,
      );
    }
    return (
      <g key={key}>
        <rect x={x - 1.5} y={y - 2} width={3} height={8} fill={k.gold} />
        <path
          d={`M${x},${y - h} Q${x + w * 1.15},${y - h * 0.42} ${x},${y} Q${x - w * 1.15},${y - h * 0.42} ${x},${y - h} Z`}
          fill={k.deep.forest}
          stroke={k.gold}
          strokeWidth={1.3}
        />
        <path d={`M${x},${y - h + 4} V${y - 2}`} {...g} strokeWidth={0.9} />
        {chevrons}
      </g>
    );
  };

  const ear = (x: number, y: number, key: string) => (
    <g key={key}>
      <path d={`M${x},${y + 30} V${y}`} {...g} strokeWidth={1.4} />
      {[0, 6, 12, 18].map((d) => (
        <g key={d}>
          <polygon points={poly(x - 3.2, y + d + 2, 3.4, 4, 0)} fill={k.gold} />
          <polygon points={poly(x + 3.2, y + d + 5, 3.4, 4, 0)} fill={k.gold} />
        </g>
      ))}
      <polygon
        points={poly(x, y - 2, 3.2, 4, 0)}
        fill={k.light}
        stroke={k.gold}
        strokeWidth={0.8}
      />
    </g>
  );

  const lamb = (x: number, y: number, s: number, key: string) =>
    sheep({ x, y, s, wool: k.light, head: k.deep.pasture, line: k.gold, key });

  const rays = (cx: number, cy: number, n: number, from: number, to: number, r: number) =>
    Array.from({ length: n }, (_, i) => {
      const a0 = from + ((to - from) / n) * i;
      const a1 = a0 + (to - from) / n;
      const p = (a: number) =>
        `${r1(cx + r * Math.cos((a * Math.PI) / 180))},${r1(cy + r * Math.sin((a * Math.PI) / 180))}`;
      return i % 2 ? null : (
        <path key={i} d={`M${cx},${cy} L${p(a0)} L${p(a1)} Z`} fill={k.deep.fields} />
      );
    });

  return {
    forest: (
      <>
        {fill(k.land.forest)}
        <path d={`M0,${H - 26} H${W}`} {...g} strokeWidth={0.8} opacity={0.6} />
        <path d={`M0,${H - 22} H${W}`} {...g} strokeWidth={0.8} opacity={0.6} />
        {cypress(20, 64, 46, 10, 'a')}
        {cypress(CX, 46, 40, 9, 'b')}
        {cypress(84, 64, 46, 10, 'c')}
        {cypress(30, 116, 28, 7, 'd')}
        {cypress(74, 116, 28, 7, 'e')}
      </>
    ),
    fields: (
      <>
        {fill(k.land.fields)}
        {rays(CX, H + 6, 18, 180, 360, 140)}
        <circle cx={CX} cy={H + 6} r={34} fill={k.land.fields} stroke={k.gold} strokeWidth={1.2} />
        <circle cx={CX} cy={H + 6} r={40} {...g} strokeWidth={0.8} />
        {ear(22, 26, 'a')}
        {ear(CX, 10, 'b')}
        {ear(82, 26, 'c')}
      </>
    ),
    pasture: (
      <>
        {fill(k.land.pasture)}
        <circle cx={14} cy={H + 4} r={52} fill={k.deep.pasture} opacity={0.5} />
        <circle cx={96} cy={H + 14} r={48} fill={k.deep.pasture} opacity={0.4} />
        {[30, 40, 50].map((r) => (
          <path
            key={r}
            d={`M${14 - r},${H + 4} A${r},${r} 0 0 1 ${14 + r},${H + 4}`}
            {...g}
            strokeWidth={0.9}
            opacity={0.75}
          />
        ))}
        {[26, 36].map((r) => (
          <path
            key={`b${r}`}
            d={`M${96 - r},${H + 14} A${r},${r} 0 0 1 ${96 + r},${H + 14}`}
            {...g}
            strokeWidth={0.9}
            opacity={0.75}
          />
        ))}
        {lamb(44, 28, 1.1, 'a')}
        {lamb(84, 58, 0.7, 'b')}
      </>
    ),
    hills: (
      <>
        {fill(k.land.hills)}
        <circle cx={CX} cy={30} r={22} fill={k.light} opacity={0.18} />
        {[0, 1, 2, 3].map((i) => {
          const w = 100 - i * 22;
          const y = H - (i + 1) * 24;
          const x = CX - w / 2;
          const joints: string[] = [];
          for (let row = 0; row < 3; row++) {
            const yy = y + row * 8;
            joints.push(`M${x},${yy} H${x + w}`);
            for (let j = (row % 2) * 6; j < w; j += 12) joints.push(`M${x + j},${yy} v8`);
          }
          return (
            <g key={i}>
              <rect x={x} y={y} width={w} height={24} fill={k.deep.hills} />
              <path d={joints.join(' ')} stroke={k.land.hills} strokeWidth={1.1} />
              <rect x={x} y={y} width={w} height={24} {...g} strokeWidth={1.3} />
            </g>
          );
        })}
      </>
    ),
    mountains: (
      <>
        {fill(k.land.mountains)}
        {Array.from({ length: 7 }, (_, i) => (
          <path key={i} d={`M0,${78 + i * 7} H${W}`} {...g} strokeWidth={0.7} opacity={0.55} />
        ))}
        {(
          [
            [20, 40, 46],
            [86, 36, 44],
            [CX, 8, 58],
          ] as const
        ).map(([x, top, half], i) => {
          const base = 112;
          return (
            <g key={i}>
              <path d={`M${x},${top} L${x - half},${base} H${x} Z`} fill={k.land.mountains} />
              <path d={`M${x},${top} L${x + half},${base} H${x} Z`} fill={k.deep.mountains} />
              {[0.3, 0.5, 0.7].map((t) => (
                <path
                  key={t}
                  d={`M${r1(x + half * t)},${r1(top + (base - top) * t)} L${r1(x + half * t * 0.4)},${r1(top + (base - top) * t)}`}
                  {...g}
                  strokeWidth={0.8}
                />
              ))}
              <path
                d={`M${x},${top} L${r1(x - half * 0.24)},${r1(top + (base - top) * 0.24)} L${x},${r1(top + (base - top) * 0.18)} L${r1(x + half * 0.24)},${r1(top + (base - top) * 0.24)} Z`}
                fill={k.light}
              />
              <path
                d={`M${x - half},${base} L${x},${top} L${x + half},${base}`}
                {...g}
                strokeWidth={1.3}
              />
            </g>
          );
        })}
      </>
    ),
    desert: (
      <>
        {fill(k.land.desert)}
        {Array.from({ length: 9 }, (_, i) => {
          const a = 180 + i * 22.5;
          const rad = (a * Math.PI) / 180;
          return (
            <path
              key={i}
              d={`M${r1(78 + 15 * Math.cos(rad))},${r1(40 + 15 * Math.sin(rad))} L${r1(78 + 24 * Math.cos(rad))},${r1(40 + 24 * Math.sin(rad))}`}
              {...g}
              strokeWidth={1.2}
            />
          );
        })}
        <path d="M66,40 A12,12 0 0 1 90,40 Z" fill={k.light} stroke={k.gold} strokeWidth={1.2} />
        <path d="M26,14 L4,44 H48 Z" fill={k.land.desert} stroke={k.gold} strokeWidth={1.2} />
        <path d="M26,14 L48,44 H26 Z" fill={k.deep.desert} />
        <path d="M26,14 L4,44 H48 Z" {...g} strokeWidth={1.2} />
        {[22, 30, 38].map((y) => (
          <path
            key={y}
            d={`M${r1(26 - (y - 14) * 0.73)},${y} H${r1(26 + (y - 14) * 0.73)}`}
            {...g}
            strokeWidth={0.6}
          />
        ))}
        <path
          d={`M-4,${H - 34} Q30,${H - 52} 60,${H - 36} T112,${H - 40}`}
          {...g}
          strokeWidth={1.1}
        />
        <path
          d={`M-4,${H - 22} Q34,${H - 40} 64,${H - 24} T112,${H - 28}`}
          fill={k.deep.desert}
          stroke={k.gold}
          strokeWidth={1.1}
        />
        <path
          d={`M-4,${H - 10} Q40,${H - 26} 70,${H - 12} T112,${H - 14}`}
          {...g}
          strokeWidth={1.1}
        />
      </>
    ),
  };
}

function sea(k: Ink): ReactNode {
  const r = 12;
  const scale = (x: number, y: number, key: string) => (
    <g key={key}>
      {[r, r * 0.7, r * 0.4].map((rr, i) => (
        <circle key={i} cx={x} cy={y} r={rr} fill={k.sea} stroke={k.seaLine} strokeWidth={0.8} />
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
      tokenFont: "'Bodoni Moda', Didot, Georgia, serif",
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
