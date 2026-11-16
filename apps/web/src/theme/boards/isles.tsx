import type { ReactNode } from 'react';
import type { Theme, ThemePieces } from '../clean.ts';
import { fill, H, r1, seaTile, sheep, skin, W, type BaseType } from './kit.tsx';

/**
 * Archipelago boards: the island drawn as a hand-inked sea chart. Each land uses the map symbols a
 * cartographer would: little trees for woods, hachured mounds for hills, ranges of peaks, ploughed
 * strips and hedgerows, grass tufts and a fence, stippled sand. The sea has depth lines. Pieces
 * are a cottage and a walled town flying the player's flag, roads are trails, the robber is a
 * bandits' camp and tokens are compass dials.
 */

interface Ink {
  land: Record<BaseType, string>;
  /** Symbol colour on each land. */
  mark: Record<BaseType, string>;
  line: string;
  paper: string;
  sea: string;
  seaLine: string;
  face: string;
  faceText: string;
  hot: string;
  camp: string;
}

/** A fixed scatter of points, the same every time. */
function scatter(n: number, seed: number): [number, number][] {
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  return Array.from({ length: n }, () => [r1(rnd() * W), r1(rnd() * H)]);
}

function art(k: Ink): Record<BaseType, ReactNode> {
  const conifer = (x: number, y: number, key: string) => (
    <g key={key}>
      <path d={`M${x},${y + 5} v3`} stroke={k.line} strokeWidth={1} />
      <path
        d={`M${x},${y - 7} L${x + 5},${y + 5} H${x - 5} Z`}
        fill={k.mark.forest}
        stroke={k.line}
        strokeWidth={0.9}
        strokeLinejoin="round"
      />
    </g>
  );
  const broadleaf = (x: number, y: number, key: string) => (
    <g key={key}>
      <path d={`M${x},${y + 2} v6`} stroke={k.line} strokeWidth={1} />
      <circle cx={x} cy={y - 2} r={5} fill={k.mark.forest} stroke={k.line} strokeWidth={0.9} />
      <path
        d={`M${x - 2},${y - 3} a2,2 0 0 1 3,-2`}
        fill="none"
        stroke={k.land.forest}
        strokeWidth={0.8}
      />
    </g>
  );
  const trees: ReactNode[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 7; col++) {
      const x = col * 16 + (row % 2) * 8 + 2;
      const y = row * 15 + 8;
      trees.push(
        (row + col) % 3 ? conifer(x, y, `${row}-${col}`) : broadleaf(x, y, `${row}-${col}`),
      );
    }
  }

  const mound = (x: number, y: number, w: number, key: string) => (
    <g key={key}>
      <path
        d={`M${x - w},${y} A${w},${w * 0.75} 0 0 1 ${x + w},${y}`}
        fill={k.land.hills}
        stroke={k.line}
        strokeWidth={1.1}
      />
      {[0.2, 0.4, 0.6, 0.8].map((t) => {
        const ax = x + w * Math.cos(Math.PI * (0.5 - t * 0.5));
        const ay = y - w * 0.75 * Math.sin(Math.PI * (0.5 - t * 0.5));
        return (
          <path
            key={t}
            d={`M${r1(ax)},${r1(ay)} l3,4`}
            stroke={k.mark.hills}
            strokeWidth={1.2}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );

  const peak = (x: number, y: number, h: number, key: string) => {
    const w = h * 0.75;
    const hatch: ReactNode[] = [];
    for (let i = 1; i < 6; i++) {
      const t = i / 6;
      hatch.push(
        <path
          key={i}
          d={`M${r1(x + w * t * 0.98)},${r1(y - h + h * t)} L${r1(x + w * t * 0.4)},${r1(y - h + h * t + 3)}`}
          stroke={k.mark.mountains}
          strokeWidth={1}
        />,
      );
    }
    return (
      <g key={key}>
        <path
          d={`M${x - w},${y} L${x},${y - h} L${x + w},${y} Z`}
          fill={k.land.mountains}
          stroke={k.line}
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
        {hatch}
      </g>
    );
  };

  const tuft = (x: number, y: number, key: string) => (
    <path
      key={key}
      d={`M${x - 3},${y} l1,-4 M${x},${y} v-5 M${x + 3},${y} l-1,-4`}
      stroke={k.mark.pasture}
      strokeWidth={1.1}
      strokeLinecap="round"
    />
  );

  const furrows = (y0: number, y1: number, angle: number) => {
    const d: string[] = [];
    for (let x = -60; x < W + 60; x += 5) {
      const dx = Math.tan((angle * Math.PI) / 180) * (y1 - y0);
      d.push(`M${x},${y0} L${r1(x + dx)},${y1}`);
    }
    return <path d={d.join(' ')} stroke={k.mark.fields} strokeWidth={1} />;
  };
  const hedge = (y: number, key: string) => (
    <g key={key}>
      {Array.from({ length: 14 }, (_, i) => (
        <circle
          key={i}
          cx={i * 8 + 2}
          cy={y + (i % 2 ? 1 : -1)}
          r={2.6}
          fill={k.mark.forest}
          stroke={k.line}
          strokeWidth={0.6}
        />
      ))}
    </g>
  );

  return {
    forest: (
      <>
        {fill(k.land.forest)}
        {trees}
      </>
    ),
    hills: (
      <>
        {fill(k.land.hills)}
        {[
          [18, 30, 14],
          [52, 18, 16],
          [88, 32, 14],
          [10, 70, 12],
          [94, 72, 12],
          [30, 108, 15],
          [74, 108, 15],
          [52, 92, 10],
        ].map(([x, y, w]) => mound(x!, y!, w!, `${x}-${y}`))}
      </>
    ),
    mountains: (
      <>
        {fill(k.land.mountains)}
        {peak(20, 36, 28, 'a')}
        {peak(84, 34, 26, 'b')}
        {peak(52, 26, 30, 'c')}
        {peak(12, 84, 22, 'd')}
        {peak(92, 86, 22, 'e')}
        {peak(36, 118, 24, 'f')}
        {peak(70, 118, 26, 'g')}
      </>
    ),
    fields: (
      <>
        {fill(k.land.fields)}
        {furrows(0, 38, 30)}
        {furrows(42, 78, 0)}
        {furrows(82, 120, -30)}
        {hedge(40, 'h1')}
        {hedge(80, 'h2')}
      </>
    ),
    pasture: (
      <>
        {fill(k.land.pasture)}
        {scatter(26, 7).map(([x, y], i) => tuft(x, y, `${i}`))}
        <path
          d={`M-2,96 Q30,86 60,94 T108,90`}
          fill="none"
          stroke={k.line}
          strokeWidth={1.2}
          strokeDasharray="6 3"
        />
        {sheep({ x: 26, y: 28, s: 0.75, wool: k.paper, head: k.line, line: k.line, width: 0.9 })}
        {sheep({ x: 74, y: 22, s: 0.65, wool: k.paper, head: k.line, line: k.line, width: 0.9 })}
        {sheep({ x: 80, y: 104, s: 0.6, wool: k.paper, head: k.line, line: k.line, width: 0.9 })}
      </>
    ),
    desert: (
      <>
        {fill(k.land.desert)}
        {scatter(140, 3).map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={0.8} fill={k.mark.desert} />
        ))}
        {[
          [24, 30],
          [78, 24],
          [16, 82],
          [88, 90],
          [50, 110],
        ].map(([x, y]) => (
          <path
            key={`${x}`}
            d={`M${x! - 12},${y} Q${x},${y! - 9} ${x! + 12},${y} Q${x},${y! - 4} ${x! - 12},${y} Z`}
            fill={k.mark.desert}
            stroke={k.line}
            strokeWidth={0.9}
          />
        ))}
      </>
    ),
  };
}

function sea(k: Ink): ReactNode {
  return seaTile(60, 36, [
    <rect key="bg" width={60} height={36} fill={k.sea} />,
    <path
      key="a"
      d="M0,10 q7.5,-3 15,0 t15,0 t15,0 t15,0"
      fill="none"
      stroke={k.seaLine}
      strokeWidth={0.9}
    />,
    <path
      key="b"
      d="M0,28 q7.5,-3 15,0 t15,0 t15,0 t15,0"
      fill="none"
      stroke={k.seaLine}
      strokeWidth={0.9}
      strokeOpacity={0.55}
    />,
    <circle key="c" cx={44} cy={19} r={0.9} fill={k.seaLine} />,
    <circle key="d" cx={12} cy={20} r={0.9} fill={k.seaLine} />,
  ]);
}

function pieces(k: Ink): ThemePieces {
  const ln = { stroke: k.line, strokeWidth: 1.6, strokeLinejoin: 'round' as const };
  return {
    house: ({ x, y, color, city, s }) => {
      const u = s * 0.1;
      if (!city)
        return (
          <g filter="url(#lift)">
            <rect
              x={x - 1.5 * u}
              y={y - 0.4 * u}
              width={3 * u}
              height={2 * u}
              fill={color}
              {...ln}
            />
            <path
              d={`M${x - 1.9 * u},${y - 0.4 * u} L${x},${y - 2.2 * u} L${x + 1.9 * u},${y - 0.4 * u} Z`}
              fill={k.paper}
              {...ln}
            />
            <rect x={x - 0.35 * u} y={y + 0.5 * u} width={0.7 * u} height={1.1 * u} fill={k.line} />
          </g>
        );
      const merlons = `h${0.5 * u} v${-0.5 * u} h${0.5 * u} v${0.5 * u} `.repeat(5);
      return (
        <g filter="url(#lift)">
          <path
            d={`M${x + 1.2 * u},${y - 2 * u} V${y - 4.2 * u}`}
            stroke={k.line}
            strokeWidth={1.2}
          />
          <path
            d={`M${x + 1.2 * u},${y - 4.2 * u} l${1.5 * u},${0.5 * u} l${-1.5 * u},${0.5 * u} Z`}
            fill={color}
            stroke={k.line}
            strokeWidth={0.9}
          />
          <rect x={x + 0.4 * u} y={y - 2 * u} width={1.6 * u} height={2 * u} fill={color} {...ln} />
          <path
            d={`M${x - 2.6 * u},${y + 1.8 * u} V${y - 0.2 * u} ${merlons} V${y + 1.8 * u} Z`}
            fill={color}
            {...ln}
          />
          <path
            d={`M${x - 0.5 * u},${y + 1.8 * u} v${-u} a${0.5 * u},${0.5 * u} 0 0 1 ${u},0 v${u}`}
            fill={k.line}
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
          strokeWidth={s * 0.17}
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
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={k.paper}
          strokeWidth={s * 0.025}
          strokeDasharray={`${s * 0.06} ${s * 0.06}`}
        />
      </>
    ),
    robber: ({ x, y, s }) => {
      const u = s * 0.1;
      return (
        <g stroke={k.paper} strokeWidth={1.3} strokeLinejoin="round">
          <path d={`M${x},${y - 1.6 * u} V${y - 4 * u}`} />
          <path
            d={`M${x},${y - 4 * u} h${1.8 * u} l-0.5,${0.6 * u} l0.5,${0.6 * u} h${-1.8 * u} Z`}
            fill={k.camp}
          />
          <path
            d={`M${x - 2.4 * u},${y + 2 * u} L${x},${y - 1.8 * u} L${x + 2.4 * u},${y + 2 * u} Z`}
            fill={k.camp}
          />
          <path
            d={`M${x},${y + 2 * u} L${x - 0.7 * u},${y + 0.6 * u} H${x + 0.7 * u} Z`}
            fill={k.paper}
            stroke="none"
          />
          <path d={`M${x - 2.9 * u},${y + 2.1 * u} H${x + 2.9 * u}`} />
        </g>
      );
    },
    token: ({ x, y, r }) => (
      <>
        <circle cx={x} cy={y} r={r} fill={k.face} stroke={k.line} strokeWidth={1.6} />
        <circle cx={x} cy={y} r={r - 2.6} fill="none" stroke={k.line} strokeWidth={0.6} />
        {[0, 90, 180, 270].map((a) => {
          const rad = (a * Math.PI) / 180;
          return (
            <path
              key={a}
              d={`M${r1(x + (r - 2.6) * Math.sin(rad))},${r1(y - (r - 2.6) * Math.cos(rad))} L${r1(x + (r + 2.4) * Math.sin(rad))},${r1(y - (r + 2.4) * Math.cos(rad))}`}
              stroke={k.line}
              strokeWidth={a === 0 ? 2 : 1}
            />
          );
        })}
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
    seaEdge: k.seaLine,
    art: art(k),
    seaPattern: sea(k),
    rest: {
      token: k.face,
      tokenText: k.faceText,
      tokenHot: k.hot,
      outline: k.line,
      robber: k.camp,
      landStroke: k.line,
      landStrokeWidth: 1.8,
      harborWood: k.line,
      harborFace: k.face,
      harborText: k.faceText,
      pieceEffect: 'lift',
      tokenFont: 'Fraunces, Georgia, serif',
      pieces: pieces(k),
      boardBackground: k.sea,
    },
  });
}

export const islesLagoonBoard = islesSkin(
  'isles-lagoon',
  'Archipelago · Lagoon',
  'A hand-inked sea chart.',
  {
    land: {
      forest: '#b7d3a0',
      hills: '#e9c49e',
      pasture: '#d6e6ae',
      fields: '#f0dc9c',
      mountains: '#d6cebd',
      desert: '#f4e6c2',
    },
    mark: {
      forest: '#4f8a55',
      hills: '#9a5a36',
      pasture: '#6f8f3f',
      fields: '#b08a32',
      mountains: '#6f6656',
      desert: '#b5945a',
    },
    line: '#2b3a3a',
    paper: '#fbf5e6',
    sea: '#c4e3df',
    seaLine: '#5fa8a2',
    face: '#fbf5e6',
    faceText: '#17292a',
    hot: '#ad3b26',
    camp: '#2b2622',
  },
);

export const islesNightBoard = islesSkin(
  'isles-night',
  'Archipelago · Night Tide',
  'A sea chart by lantern light.',
  {
    land: {
      forest: '#2c4d40',
      hills: '#6b4a36',
      pasture: '#3f5c3a',
      fields: '#6c6034',
      mountains: '#4d5157',
      desert: '#6e6449',
    },
    mark: {
      forest: '#8fcf9c',
      hills: '#f0b48a',
      pasture: '#c9e39a',
      fields: '#f0d488',
      mountains: '#d8d2c4',
      desert: '#efdcae',
    },
    line: '#0b1a24',
    paper: '#eef5f0',
    sea: '#0f2432',
    seaLine: '#3f8292',
    face: '#eef5f0',
    faceText: '#0f2432',
    hot: '#c0452c',
    camp: '#0b1a24',
  },
);
