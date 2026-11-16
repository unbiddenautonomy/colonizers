import type { ReactNode } from 'react';
import type { Theme, ThemePieces } from '../clean.ts';
import { CX, fill, H, r1, seaTile, sheep, skin, W, type BaseType } from './kit.tsx';

/**
 * Wonderland boards, with a nod on every hex to Carroll's two books (and Tenniel's drawings, all
 * long in the public domain):
 * - forest: the Tulgey Wood, with the Caterpillar's mushroom
 * - pasture: the Sheep from the shop in Looking-Glass, knitting
 * - fields: a Bread-and-butterfly over the wheat
 * - hills: the Queen's garden wall, with white roses half painted red
 * - mountains: Looking-Glass country, ruled into chess squares by brooks
 * - desert: the beach of the Walrus and the Carpenter, with oysters in shoes, sun and moon both up
 * - sea: the Pool of Tears
 * Settlements are the White Rabbit's house, cities the Queen's castle, the robber is the Knave of
 * Hearts (who stole the tarts), and number tokens are pocket watches.
 */

interface Ink {
  land: Record<BaseType, string>;
  deep: Record<BaseType, string>;
  line: string;
  light: string;
  red: string;
  gold: string;
  sea: string;
  seaLine: string;
  face: string;
  faceText: string;
  hot: string;
}

function art(k: Ink): Record<BaseType, ReactNode> {
  const ln = {
    stroke: k.line,
    strokeWidth: 1.3,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
  };

  const curlyTree = (x: number, y: number, r: number, key: string) => (
    <g key={key}>
      <path
        d={`M${x},${y + r * 2.2} C${x - 3},${y + r * 1.4} ${x + 3},${y + r} ${x},${y + r * 0.4}`}
        fill="none"
        {...ln}
        strokeWidth={2.2}
      />
      <circle cx={x} cy={y} r={r} fill={k.deep.forest} {...ln} />
      <path
        d={`M${x},${y} m${-r * 0.15},0 a${r * 0.15},${r * 0.15} 0 1 1 ${r * 0.3},0 a${r * 0.35},${r * 0.35} 0 1 1 ${-r * 0.65},0 a${r * 0.55},${r * 0.55} 0 1 1 ${r * 1.05},0`}
        fill="none"
        stroke={k.land.forest}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    </g>
  );

  const ear = (x: number, y: number, h: number, key: string) => (
    <g key={key}>
      <path d={`M${x},${y + h} V${y}`} {...ln} strokeWidth={1.1} stroke={k.deep.fields} />
      {[0, 5, 10].map((d) => (
        <g key={d}>
          <ellipse
            cx={x - 2.4}
            cy={y + d + 2}
            rx={1.8}
            ry={3.4}
            transform={`rotate(-25 ${x - 2.4} ${y + d + 2})`}
            fill={k.deep.fields}
          />
          <ellipse
            cx={x + 2.4}
            cy={y + d + 4}
            rx={1.8}
            ry={3.4}
            transform={`rotate(25 ${x + 2.4} ${y + d + 4})`}
            fill={k.deep.fields}
          />
        </g>
      ))}
    </g>
  );

  const rose = (x: number, y: number, red: boolean, key: string) => (
    <g key={key}>
      <circle cx={x} cy={y} r={4} fill={red ? k.red : k.light} stroke={k.line} strokeWidth={0.9} />
      <path
        d={`M${x - 1.6},${y} a1.6,1.6 0 1 1 3.2,0`}
        fill="none"
        stroke={k.line}
        strokeWidth={0.7}
      />
    </g>
  );

  const oyster = (x: number, y: number, key: string) => (
    <g key={key}>
      <path
        d={`M${x - 2.5},${y + 3} v4 h-2.4 M${x + 2.5},${y + 3} v4 h2.4`}
        fill="none"
        {...ln}
        strokeWidth={1.1}
      />
      <path
        d={`M${x - 8},${y + 2} Q${x - 8},${y - 7} ${x},${y - 7} Q${x + 8},${y - 7} ${x + 8},${y + 2} Z`}
        fill={k.light}
        {...ln}
      />
      {[-4, 0, 4].map((d) => (
        <path
          key={d}
          d={`M${x + d},${y + 2} L${x + d * 0.6},${y - 5}`}
          stroke={k.line}
          strokeWidth={0.7}
        />
      ))}
    </g>
  );

  return {
    forest: (
      <>
        {fill(k.land.forest)}
        {curlyTree(20, 30, 12, 'a')}
        {curlyTree(CX, 16, 10, 'b')}
        {curlyTree(84, 30, 12, 'c')}
        {curlyTree(16, 84, 10, 'd')}
        {/* The Caterpillar's mushroom */}
        <path d="M80,108 C80,98 76,94 78,88 H90 C92,94 88,98 88,108 Z" fill={k.light} {...ln} />
        <path d="M66,90 C66,74 102,74 102,90 Q84,95 66,90 Z" fill={k.red} {...ln} />
        {[
          [74, 84],
          [84, 80],
          [94, 85],
        ].map(([x, y]) => (
          <circle key={x} cx={x} cy={y} r={2.2} fill={k.light} />
        ))}
        <path
          d="M86,74 c-4,-6 4,-9 0,-15 c-4,-6 4,-9 0,-15"
          fill="none"
          stroke={k.light}
          strokeWidth={1.2}
          strokeOpacity={0.8}
          strokeLinecap="round"
        />
      </>
    ),
    pasture: (
      <>
        {fill(k.land.pasture)}
        {[
          [12, 70],
          [94, 66],
          [20, 104],
          [86, 102],
          [52, 112],
        ].map(([x, y]) => (
          <path
            key={`${x}`}
            d={`M${x! - 4},${y} l2,-6 l2,6 l2,-7 l2,7`}
            fill="none"
            stroke={k.deep.pasture}
            strokeWidth={1.3}
            strokeLinecap="round"
          />
        ))}
        {sheep({ x: 42, y: 30, s: 1.15, wool: k.light, head: k.light, line: k.line, width: 1.2 })}
        {/* Her shawl, spectacles and knitting */}
        <path
          d="M50,26 q4,8 0,12"
          fill="none"
          stroke={k.red}
          strokeWidth={2.6}
          strokeLinecap="round"
        />
        <circle cx={57.5} cy={25} r={1.8} fill="none" stroke={k.line} strokeWidth={0.8} />
        <path
          d="M60,40 L76,18 M64,42 L72,16"
          stroke={k.line}
          strokeWidth={1.3}
          strokeLinecap="round"
        />
        <circle cx={76} cy={18} r={1.6} fill={k.line} />
        <circle cx={72} cy={16} r={1.6} fill={k.line} />
        <path d="M66,34 Q74,40 80,52" fill="none" stroke={k.red} strokeWidth={1} />
        <circle cx={82} cy={56} r={6} fill={k.red} {...ln} strokeWidth={1.1} />
        <path
          d="M77,54 q5,-3 10,1 M77,58 q5,-3 10,1"
          fill="none"
          stroke={k.light}
          strokeWidth={0.8}
        />
      </>
    ),
    fields: (
      <>
        {fill(k.land.fields)}
        {[8, 22, 82, 96].map((x, i) => ear(x, 52 + (i % 2) * 6, 26, `a${x}`))}
        {[14, 30, 46, 62, 78, 94].map((x, i) => ear(x, 92 + (i % 2) * 5, 26, `b${x}`))}
        {/* A Bread-and-butterfly: bread wings, a crust body, a sugar-lump head */}
        <g transform="rotate(-8 52 26)">
          {[-1, 1].map((sd) => (
            <g key={sd}>
              <rect
                x={sd < 0 ? 30 : 56}
                y={12}
                width={18}
                height={18}
                rx={5}
                fill={k.deep.fields}
                {...ln}
              />
              <rect x={sd < 0 ? 33 : 59} y={15} width={12} height={12} rx={3} fill={k.light} />
              <rect x={sd < 0 ? 36 : 62} y={18} width={5} height={4} fill={k.gold} />
            </g>
          ))}
          <rect x={49} y={12} width={6} height={22} rx={3} fill={k.deep.fields} {...ln} />
          <rect x={49} y={6} width={6} height={6} fill={k.light} {...ln} strokeWidth={1} />
          <path d="M51,6 q-3,-5 -6,-5 M53,6 q3,-5 6,-5" fill="none" {...ln} strokeWidth={0.9} />
        </g>
      </>
    ),
    hills: (
      <>
        {fill(k.land.hills)}
        <ellipse cx={18} cy={26} rx={20} ry={14} fill={k.deep.forest} {...ln} />
        <ellipse cx={CX} cy={14} rx={20} ry={13} fill={k.deep.forest} {...ln} />
        <ellipse cx={86} cy={26} rx={20} ry={14} fill={k.deep.forest} {...ln} />
        {rose(12, 22, true, 'r1')}
        {rose(24, 30, false, 'r2')}
        {rose(46, 12, false, 'r3')}
        {rose(58, 18, true, 'r4')}
        {rose(80, 22, false, 'r5')}
        {rose(92, 30, true, 'r6')}
        <rect x={0} y={40} width={W} height={H - 40} fill={k.deep.hills} />
        {Array.from({ length: 10 }, (_, row) => {
          const y = 40 + row * 8;
          const off = (row % 2) * 8;
          return (
            <g key={row}>
              <path d={`M0,${y} H${W}`} stroke={k.light} strokeOpacity={0.5} strokeWidth={1} />
              {Array.from({ length: 8 }, (_, i) => (
                <path
                  key={i}
                  d={`M${off + i * 16},${y} v8`}
                  stroke={k.light}
                  strokeOpacity={0.5}
                  strokeWidth={1}
                />
              ))}
            </g>
          );
        })}
        <path d={`M0,40 H${W}`} {...ln} strokeWidth={1.6} />
        {/* The paint pot and brush */}
        <path d="M80,104 h14 l-2,12 h-10 Z" fill={k.light} {...ln} />
        <ellipse cx={87} cy={104} rx={7} ry={2} fill={k.red} {...ln} strokeWidth={1} />
        <path d="M90,103 L98,86" stroke={k.line} strokeWidth={1.6} strokeLinecap="round" />
        <path d="M97,88 l3,-6" stroke={k.red} strokeWidth={3} strokeLinecap="round" />
      </>
    ),
    mountains: (
      <>
        {fill(k.land.mountains)}
        <path
          d="M-6,64 L22,14 L40,40 L58,6 L84,46 L96,30 L112,64 Z"
          fill={k.deep.mountains}
          {...ln}
        />
        <path d="M22,14 L16,26 L22,23 L28,26 Z M58,6 L51,18 L58,15 L65,18 Z" fill={k.light} />
        {/* Looking-Glass country: squares, brooks between the rows, hedges between the columns */}
        {Array.from({ length: 4 }, (_, row) =>
          Array.from({ length: 6 }, (_, col) =>
            (row + col) % 2 ? null : (
              <rect
                key={`${row}-${col}`}
                x={col * 18}
                y={64 + row * 15}
                width={18}
                height={15}
                fill={k.light}
                opacity={0.55}
              />
            ),
          ),
        )}
        {[79, 94, 109].map((y) => (
          <path key={y} d={`M0,${y} H${W}`} stroke={k.seaLine} strokeWidth={1.6} />
        ))}
        {[18, 36, 54, 72, 90].map((x) => (
          <path
            key={x}
            d={`M${x},64 V${H}`}
            stroke={k.deep.forest}
            strokeWidth={1.8}
            strokeDasharray="2 1.5"
          />
        ))}
        <path d={`M0,64 H${W}`} {...ln} />
      </>
    ),
    desert: (
      <>
        {fill(k.land.desert)}
        <circle cx={22} cy={22} r={9} fill={k.gold} {...ln} />
        {Array.from({ length: 8 }, (_, i) => {
          const a = (Math.PI / 4) * i;
          return (
            <path
              key={i}
              d={`M${r1(22 + 12 * Math.cos(a))},${r1(22 + 12 * Math.sin(a))} L${r1(22 + 16 * Math.cos(a))},${r1(22 + 16 * Math.sin(a))}`}
              stroke={k.line}
              strokeWidth={1.1}
              strokeLinecap="round"
            />
          );
        })}
        <path d="M86,12 A10,10 0 1 0 92,30 A8,8 0 1 1 86,12 Z" fill={k.light} {...ln} />
        <path d="M80,22 q2,1 3,0" stroke={k.line} strokeWidth={0.8} fill="none" />
        {[78, 90, 102, 114].map((y) => (
          <path
            key={y}
            d={`M-4,${y} q14,-4 28,0 t28,0 t28,0 t28,0`}
            fill="none"
            stroke={k.deep.desert}
            strokeWidth={1.3}
          />
        ))}
        {oyster(18, 64, 'a')}
        {oyster(86, 66, 'b')}
        {oyster(50, 104, 'c')}
      </>
    ),
  };
}

function sea(k: Ink): ReactNode {
  return seaTile(48, 30, [
    <rect key="bg" width={48} height={30} fill={k.sea} />,
    <path
      key="w1"
      d="M0,8 q6,-4 12,0 t12,0 t12,0 t12,0"
      fill="none"
      stroke={k.seaLine}
      strokeWidth={1.1}
    />,
    <path
      key="w2"
      d="M0,23 q6,-4 12,0 t12,0 t12,0 t12,0"
      fill="none"
      stroke={k.seaLine}
      strokeWidth={1.1}
      opacity={0.6}
    />,
    <path
      key="t"
      d="M36,12 q-3,4 -3,6 a3,3 0 0 0 6,0 q0,-2 -3,-6 Z"
      fill={k.light}
      fillOpacity={0.7}
      stroke={k.seaLine}
      strokeWidth={0.8}
    />,
  ]);
}

function pieces(k: Ink): ThemePieces {
  const ln = { stroke: k.line, strokeWidth: 1.8, strokeLinejoin: 'round' as const };
  return {
    house: ({ x, y, color, city, s }) => {
      const u = s * 0.1;
      if (!city)
        return (
          <g filter="url(#lift)">
            <rect
              x={x + 0.6 * u}
              y={y - 2.6 * u}
              width={0.7 * u}
              height={1.4 * u}
              fill={k.light}
              {...ln}
              strokeWidth={1.2}
            />
            <path
              d={`M${x - 1.8 * u},${y - 0.6 * u} L${x},${y - 2.4 * u} L${x + 1.8 * u},${y - 0.6 * u} Z`}
              fill={k.line}
              {...ln}
            />
            <rect
              x={x - 1.4 * u}
              y={y - 0.6 * u}
              width={2.8 * u}
              height={2.2 * u}
              fill={color}
              {...ln}
            />
            <path
              d={`M${x - 0.5 * u},${y + 1.6 * u} v${-0.9 * u} a${0.5 * u},${0.5 * u} 0 0 1 ${u},0 v${0.9 * u} Z`}
              fill={k.light}
            />
          </g>
        );
      const tower = (cx: number, w: number, h: number, key: string) => (
        <g key={key}>
          <rect x={cx - w / 2} y={y + 1.8 * u - h} width={w} height={h} fill={color} {...ln} />
          <path
            d={`M${cx - w / 2 - 0.3 * u},${y + 1.8 * u - h} L${cx},${y + 1.8 * u - h - 1.6 * u} L${cx + w / 2 + 0.3 * u},${y + 1.8 * u - h} Z`}
            fill={k.line}
            {...ln}
          />
        </g>
      );
      return (
        <g filter="url(#lift)">
          {tower(x - 1.9 * u, 1.4 * u, 2.6 * u, 'l')}
          {tower(x + 1.9 * u, 1.4 * u, 2.6 * u, 'r')}
          {tower(x, 2 * u, 3.8 * u, 'm')}
          <path
            d={`M${x},${y - 3.5 * u} c-0.5,-0.9 -1.8,-0.4 -1.3,0.6 l1.3,1.3 l1.3,-1.3 c0.5,-1 -0.8,-1.5 -1.3,-0.6 Z`}
            transform={`translate(0 ${-0.3 * u}) scale(1)`}
            fill={k.red}
            stroke={k.line}
            strokeWidth={0.6}
          />
          <path
            d={`M${x - 0.45 * u},${y + 1.8 * u} v${-u} a${0.45 * u},${0.45 * u} 0 0 1 ${0.9 * u},0 v${u} Z`}
            fill={k.light}
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
      </>
    ),
    robber: ({ x, y, s }) => {
      const u = s * 0.1;
      return (
        <g {...ln} strokeWidth={1.3}>
          <path
            d={`M${x - 0.6 * u},${y + 1.6 * u} v${1.2 * u} M${x + 0.6 * u},${y + 1.6 * u} v${1.2 * u}`}
            fill="none"
          />
          <path d={`M${x + 1.2 * u},${y - 0.4 * u} L${x + 2 * u},${y - 1.2 * u}`} fill="none" />
          <circle cx={x + 2.2 * u} cy={y - 1.5 * u} r={0.7 * u} fill={k.gold} />
          <rect
            x={x - 1.3 * u}
            y={y - 1.2 * u}
            width={2.6 * u}
            height={3 * u}
            rx={0.3 * u}
            fill={k.light}
          />
          <path
            d={`M${x},${y + 0.9 * u} c-1.2,-1 -2.6,-2.4 -2.6,-3.4 a1.3,1.3 0 0 1 2.6,-0.6 a1.3,1.3 0 0 1 2.6,0.6 c0,1 -1.4,2.4 -2.6,3.4 Z`}
            fill={k.red}
            stroke="none"
          />
          <circle cx={x} cy={y - 2 * u} r={0.8 * u} fill={k.light} />
          <path
            d={`M${x - 0.9 * u},${y - 2.6 * u} h${1.8 * u} l-0.3,-1.6 h${-1.2 * u} Z`}
            fill={k.red}
          />
        </g>
      );
    },
    token: ({ x, y, r }) => (
      <>
        <circle cx={x} cy={y - r - 1.5} r={2.6} fill="none" stroke={k.gold} strokeWidth={1.4} />
        <rect
          x={x - 2.4}
          y={y - r - 1}
          width={4.8}
          height={3.2}
          rx={1}
          fill={k.gold}
          stroke={k.line}
          strokeWidth={0.6}
        />
        <circle cx={x} cy={y} r={r} fill={k.face} stroke={k.gold} strokeWidth={2.6} />
        <circle cx={x} cy={y} r={r + 1.3} fill="none" stroke={k.line} strokeWidth={0.7} />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (Math.PI / 6) * i;
          return (
            <path
              key={i}
              d={`M${r1(x + (r - 3.5) * Math.sin(a))},${r1(y - (r - 3.5) * Math.cos(a))} L${r1(x + (r - 1.6) * Math.sin(a))},${r1(y - (r - 1.6) * Math.cos(a))}`}
              stroke={k.line}
              strokeWidth={0.8}
            />
          );
        })}
      </>
    ),
  };
}

function wonderSkin(id: string, name: string, description: string, k: Ink): Theme {
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
      robber: k.red,
      landStroke: k.line,
      landStrokeWidth: 2.2,
      harborWood: k.line,
      harborFace: k.face,
      harborText: k.faceText,
      pieceEffect: 'lift',
      tokenFont: "'Playfair Display', Georgia, serif",
      pieces: pieces(k),
      boardBackground: `radial-gradient(circle at 50% 45%, ${k.sea} 0%, ${k.seaLine} 100%)`,
    },
  });
}

export const wonderTeaBoard = wonderSkin(
  'wonder-tea',
  'Wonderland · Tea Party',
  'Carroll and Tenniel: a nod on every hex.',
  {
    land: {
      forest: '#78a46a',
      hills: '#c9705a',
      pasture: '#bcd79a',
      fields: '#efd18c',
      mountains: '#b4b6c8',
      desert: '#f3e2b6',
    },
    deep: {
      forest: '#4a7a46',
      hills: '#a24a3a',
      pasture: '#86a861',
      fields: '#b9883a',
      mountains: '#7d8199',
      desert: '#d4b97c',
    },
    line: '#2a2233',
    light: '#fffaf0',
    red: '#c0283e',
    gold: '#d4a63c',
    sea: '#9cc9dc',
    seaLine: '#5a8eab',
    face: '#fffaf0',
    faceText: '#1c1626',
    hot: '#b3122e',
  },
);

export const wonderGlassBoard = wonderSkin(
  'wonder-glass',
  'Wonderland · Looking-Glass',
  'Carroll and Tenniel by twilight.',
  {
    land: {
      forest: '#3f6e5c',
      hills: '#a54c48',
      pasture: '#6f9c70',
      fields: '#c9a557',
      mountains: '#76749a',
      desert: '#c7b48f',
    },
    deep: {
      forest: '#284a3e',
      hills: '#7a3230',
      pasture: '#4f7552',
      fields: '#9c7a35',
      mountains: '#55537a',
      desert: '#a08c66',
    },
    line: '#160f24',
    light: '#f4ecff',
    red: '#ff5d8f',
    gold: '#e3b85a',
    sea: '#2f3a72',
    seaLine: '#8a8fd0',
    face: '#f4ecff',
    faceText: '#1b1432',
    hot: '#c2185b',
  },
);
