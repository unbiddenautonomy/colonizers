import type { ReactNode } from 'react';

/**
 * Plain icons for the rarer lands, drawn borderless on a 100 × 100 square, for boards that lay a
 * land out as one object on a flat colour (Casino, Basic Clean). Each sits on its own colour from
 * RARE_LAND, picked to stay apart from the five resource lands and from one another.
 */
export const RARE_LAND: Record<string, string> = {
  gold: '#b8902f',
  volcano: '#3a1416',
  lake: '#8fcbe8',
  fishingLake: '#5b67c9',
  swamp: '#6b6536',
  oasis: '#e3c584',
  castle: '#f3f0ea',
  quarry: '#85857f',
  glassworks: '#5f9a9c',
  hidden: '#a9b3bc',
};

const INK = '#1d1a17';
const line = { stroke: INK, strokeWidth: 2.4, strokeLinejoin: 'round' as const };

/** A gold bar seen from the front: a trapezoid with a lit top face. */
function bar(x: number, y: number, w: number, h: number): ReactNode {
  const top = `M${x + 6},${y} h${w - 12} l6,${h * 0.35} h${-w} z`;
  return (
    <g key={`${x},${y}`}>
      <path
        d={`M${x},${y + h * 0.35} h${w} l-4,${h * 0.65} h${-(w - 8)} z`}
        fill="#e8b830"
        {...line}
      />
      <path d={top} fill="#ffe27a" {...line} />
    </g>
  );
}

export const LAND_ICON: Record<string, ReactNode> = {
  gold: (
    <>
      {bar(14, 54, 36, 24)}
      {bar(50, 54, 36, 24)}
      {bar(32, 32, 36, 24)}
    </>
  ),
  volcano: (
    <>
      <path d="M10,86 L40,26 h20 L90,86 z" fill="#5a4440" {...line} />
      <path d="M40,26 h20 l-4,10 l-5,-4 l-4,8 l-3,-6 z" fill="#ff5a1f" />
      <path
        d="M47,34 q-4,18 -10,30 M54,36 q5,16 12,26"
        stroke="#ff7a2f"
        strokeWidth={4}
        fill="none"
        strokeLinecap="round"
      />
      <circle cx={44} cy={14} r={6} fill="#7a6a68" opacity={0.8} />
      <circle cx={56} cy={8} r={8} fill="#8c7d7a" opacity={0.7} />
    </>
  ),
  lake: (
    <>
      <path
        d="M22,52 C16,34 34,20 52,24 C70,26 86,36 82,54 C80,72 62,82 44,78 C28,76 26,64 22,52 z"
        fill="#3f9fd8"
        {...line}
      />
      <path
        d="M38,44 q10,-6 20,0 M44,58 q10,-5 20,0"
        stroke="#d6f0ff"
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
      />
    </>
  ),
  fishingLake: (
    <>
      <path d="M18,52 C30,30 62,30 72,50 C62,70 30,72 18,52 z" fill="#f4f6ff" {...line} />
      <path d="M70,50 L90,34 L88,66 z" fill="#f4f6ff" {...line} />
      <circle cx={30} cy={47} r={3.6} fill={INK} />
      <path d="M42,40 q6,10 0,22" stroke="#9aa6e6" strokeWidth={3} fill="none" />
    </>
  ),
  swamp: (
    <>
      <ellipse cx={50} cy={72} rx={38} ry={12} fill="#4a3b22" {...line} />
      <path
        d="M30,70 q-2,-30 -8,-44 M38,70 q2,-26 -2,-48 M66,70 q2,-24 10,-40 M74,70 q0,-20 8,-30"
        stroke="#3f5a22"
        strokeWidth={4}
        fill="none"
        strokeLinecap="round"
      />
      <ellipse cx={38} cy={24} rx={3.5} ry={9} fill="#7a4a24" />
      <ellipse cx={77} cy={32} rx={3.5} ry={9} fill="#7a4a24" />
      <path d="M50,72 a9,5 0 1 1 1,0 z" fill="#8fbf4a" {...line} strokeWidth={1.6} />
    </>
  ),
  oasis: (
    <>
      <ellipse cx={64} cy={70} rx={28} ry={14} fill="#3fa3e0" {...line} />
      <path
        d="M30,84 q4,-30 6,-56"
        stroke="#7a4a24"
        strokeWidth={6}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M36,28 q-18,-6 -28,8 q14,-4 28,-8 z M36,28 q-6,-16 -22,-18 q10,8 22,18 z M36,28 q14,-14 30,-8 q-16,0 -30,8 z M36,28 q20,0 26,14 q-12,-8 -26,-14 z"
        fill="#2f8a3a"
        {...line}
        strokeWidth={1.8}
      />
    </>
  ),
  castle: (
    <>
      <path d="M22,88 V40 h10 v-10 h10 v10 h16 v-10 h10 v10 h10 V88 z" fill="#8d8882" {...line} />
      <path d="M42,88 v-18 a8,8 0 0 1 16,0 v18 z" fill="#5a4a3a" {...line} strokeWidth={1.8} />
      <path d="M50,30 V8" stroke={INK} strokeWidth={2.4} />
      <path d="M50,8 h18 l-5,6 l5,6 h-18 z" fill="#d23a2e" {...line} strokeWidth={1.8} />
    </>
  ),
  quarry: (
    <>
      <path d="M16,84 V58 a34,34 0 0 1 68,0 V84 z" fill="#b5653f" {...line} />
      <path
        d="M16,66 h68 M16,75 h68 M32,58 v8 M50,48 v18 M68,58 v8 M40,75 v9 M60,75 v9"
        stroke="#6e3a22"
        strokeWidth={1.6}
      />
      <path d="M38,84 v-12 a12,12 0 0 1 24,0 v12 z" fill="#ff9a2e" {...line} />
      <rect x={60} y={14} width={12} height={22} fill="#8a5a40" {...line} />
      <circle cx={70} cy={8} r={5} fill="#d8d4cc" opacity={0.85} />
    </>
  ),
  glassworks: (
    <>
      <rect x={18} y={16} width={64} height={70} rx={3} fill="#f8fbfb" {...line} />
      {[
        [22, 20],
        [52, 20],
        [22, 53],
        [52, 53],
      ].map(([x, y]) => (
        <g key={`${x},${y}`}>
          <rect x={x} y={y} width={26} height={29} fill="#bfe8ee" stroke={INK} strokeWidth={1.4} />
          <path
            d={`M${x! + 5},${y! + 20} l12,-14 M${x! + 10},${y! + 24} l8,-9`}
            stroke="#ffffff"
            strokeWidth={3}
            strokeLinecap="round"
          />
        </g>
      ))}
    </>
  ),
  hidden: (
    <g>
      <ellipse cx={30} cy={30} rx={34} ry={16} fill="#ffffff" opacity={0.55} />
      <ellipse cx={72} cy={42} rx={36} ry={17} fill="#f4f6f8" opacity={0.6} />
      <ellipse cx={28} cy={64} rx={36} ry={16} fill="#eef1f4" opacity={0.6} />
      <ellipse cx={70} cy={78} rx={38} ry={16} fill="#ffffff" opacity={0.55} />
      <path
        d="M4,20 q24,-10 46,0 t46,0 M2,52 q24,-10 46,0 t46,0 M4,88 q24,-10 46,0 t46,0"
        stroke="#ffffff"
        strokeWidth={5}
        fill="none"
        strokeLinecap="round"
        opacity={0.7}
      />
    </g>
  ),
};
