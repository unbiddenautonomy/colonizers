import type { ReactNode } from 'react';

/**
 * Printed-tile art: one picture per hex, in flat colours with bold shapes,
 * like a wooden board with screen-printed tiles. Every shape is drawn here
 * in code for this project.
 *
 * Each picture is an SVG <pattern> sized to one hex (patternUnits
 * "objectBoundingBox"), so every hex shows the whole picture, centred. The
 * number token covers the middle, so the telling detail (a wheat sprig,
 * sheep, a tower) sits in the top half.
 */

/** A hex's box with the board's hex size (60): 60·√3 wide, 120 tall. */
const W = 103.92;
const H = 120;
const CX = W / 2;
const CY = H / 2;

export interface Palette {
  /** Main fill. */
  base: string;
  /** Pattern lines and dark shapes. */
  dark: string;
  /** Highlights, sheep, snow. */
  light: string;
  /** A third colour some pictures use (water in an oasis, lava). */
  accent?: string;
}

const f = (n: number) => +n.toFixed(1);

function rect(fill: string) {
  return <rect width={W} height={H} fill={fill} />;
}

function sprig(cx: number, cy: number, k: number, fill: string, key?: string) {
  const leaves: ReactNode[] = [];
  for (let i = 0; i < 4; i++) {
    const y = cy + (10 - i * 8) * k;
    for (const side of [-1, 1]) {
      const x = cx + side * 5.5 * k;
      leaves.push(
        <ellipse
          key={`${i}${side}`}
          cx={f(x)}
          cy={f(y)}
          rx={f(3.2 * k)}
          ry={f(6 * k)}
          transform={`rotate(${side * 35} ${f(x)} ${f(y)})`}
          fill={fill}
        />,
      );
    }
  }
  return (
    <g key={key}>
      <path
        d={`M${f(cx)},${f(cy + 22 * k)} V${f(cy - 18 * k)}`}
        stroke={fill}
        strokeWidth={f(3 * k)}
        strokeLinecap="round"
      />
      {leaves}
      <ellipse cx={f(cx)} cy={f(cy - 22 * k)} rx={f(3.2 * k)} ry={f(6 * k)} fill={fill} />
    </g>
  );
}

function sheep(cx: number, cy: number, k: number, body: string, head: string, key: string) {
  const puffs: [number, number][] = [
    [-5, -3],
    [0, -5],
    [5, -3],
    [-5.5, 2],
    [0, 3],
    [5.5, 2],
  ];
  return (
    <g key={key}>
      <circle cx={f(cx + 9 * k)} cy={f(cy - 2.5 * k)} r={f(3.4 * k)} fill={head} />
      <path
        d={`M${f(cx - 3 * k)},${f(cy + 5 * k)} v${f(3 * k)} M${f(cx + 3 * k)},${f(cy + 5 * k)} v${f(3 * k)}`}
        stroke={head}
        strokeWidth={f(1.6 * k)}
        strokeLinecap="round"
      />
      {puffs.map(([x, y], i) => (
        <circle key={i} cx={f(cx + x * k)} cy={f(cy + y * k)} r={f(4.6 * k)} fill={body} />
      ))}
    </g>
  );
}

/** Herringbone bricks: a staircase of one flat and one upright brick. */
const HERRINGBONE = (() => {
  const b = 13;
  let d = '';
  for (let i = -6; i <= 12; i++)
    for (let j = -4; j <= 4; j++) {
      const x = (i + 2 * j) * b - 10;
      const y = (i - 2 * j) * b - 10;
      if (x > W + 2 * b || y > H + 2 * b || x < -3 * b || y < -3 * b) continue;
      d += `M${x},${y}h${2 * b}v${b}h${-2 * b}z M${x},${y + b}h${b}v${2 * b}h${-b}z `;
    }
  return d;
})();

/** Rows of mountain peaks, nearest last so they overlap the ones behind. */
function peakRows(p: Palette) {
  const w = 26;
  const h = 15;
  const rows: ReactNode[] = [];
  for (let row = 0; row < 10; row++) {
    const y = row * h + 4;
    const x0 = -w;
    let d = `M${x0},${y}`;
    for (let x = x0; x < W + w; x += w) d += ` l${w / 2},${-h * 0.8} l${w / 2},${h * 0.8}`;
    d += ` V${H + h} H${x0} z`;
    const fill = row < 2 ? p.light : row % 2 ? p.base : (p.accent ?? p.base);
    rows.push(
      <path key={row} d={d} fill={fill} stroke={p.dark} strokeWidth={2.4} strokeLinejoin="miter" />,
    );
  }
  return rows;
}

/** Concentric waves (seigaiha), tiled across the whole sea. */
export function seaPattern(id: string, p: Palette, r = 16): ReactNode {
  const rings = (x: number, y: number, k: string) => (
    <g key={k}>
      <circle cx={x} cy={y} r={r} fill={p.base} />
      <circle cx={x} cy={y} r={r * 0.74} fill={p.light} />
      <circle cx={x} cy={y} r={r * 0.5} fill={p.base} />
      <circle cx={x} cy={y} r={r * 0.24} fill={p.accent ?? p.light} />
    </g>
  );
  // Rows half a radius apart; later (lower) rows cover the ones above.
  const circles: ReactNode[] = [];
  for (const [i, y] of [-r / 2, 0, r / 2, r, (3 * r) / 2].entries()) {
    const xs = i % 2 === 0 ? [r] : [0, 2 * r];
    for (const x of xs) circles.push(rings(x, y, `${i}-${x}`));
  }
  return (
    <pattern key={id} id={id} width={2 * r} height={r} patternUnits="userSpaceOnUse">
      <rect width={2 * r} height={r} fill={p.base} />
      {circles}
    </pattern>
  );
}

type Art = (p: Palette) => ReactNode;

const ART: Record<string, Art> = {
  forest: (p) => (
    <>
      {rect(p.base)}
      {(
        [
          [18, 28, 17],
          [58, 14, 13],
          [92, 40, 18],
          [12, 84, 16],
          [50, 106, 19],
          [94, 98, 14],
        ] as const
      ).map(([x, y, r], i) => (
        <circle key={`l${i}`} cx={x} cy={y} r={r} fill={p.light} />
      ))}
      {(
        [
          [24, 30, 12],
          [62, 18, 8],
          [86, 44, 13],
          [16, 80, 9],
          [44, 100, 13],
          [88, 92, 9],
          [38, 22, 5],
        ] as const
      ).map(([x, y, r], i) => (
        <circle key={`d${i}`} cx={x} cy={y} r={r} fill={p.dark} />
      ))}
    </>
  ),
  pasture: (p) => (
    <>
      {rect(p.base)}
      <ellipse cx={20} cy={124} rx={70} ry={34} fill={p.accent ?? p.dark} opacity={0.55} />
      <ellipse cx={96} cy={-6} rx={56} ry={30} fill={p.accent ?? p.dark} opacity={0.4} />
      <path
        d={`M0,${H * 0.36} Q${CX},${H * 0.22} ${W},${H * 0.4}`}
        stroke={p.light}
        strokeOpacity={0.35}
        strokeWidth={5}
        fill="none"
      />
      {sheep(30, 30, 1.05, p.light, p.dark, 'a')}
      {sheep(80, 88, 0.9, p.light, p.dark, 'b')}
      {sheep(24, 92, 0.7, p.light, p.dark, 'c')}
    </>
  ),
  fields: (p) => (
    <>
      {rect(p.base)}
      {Array.from({ length: 9 }, (_, i) => {
        const y = i * 15 - 4;
        return (
          <path
            key={i}
            d={`M-4,${y + 10} Q${CX},${y - 6} ${W + 4},${y + 10}`}
            stroke={p.light}
            strokeWidth={4.5}
            fill="none"
          />
        );
      })}
      {sprig(CX, 26, 0.75, p.dark, 'top')}
      {sprig(18, 92, 0.6, p.dark, 'l')}
      {sprig(86, 92, 0.6, p.dark, 'r')}
    </>
  ),
  hills: (p) => (
    <>
      {rect(p.base)}
      <path d={HERRINGBONE} fill="none" stroke={p.dark} strokeWidth={2.2} />
      <path d={`M0,0 H${W} V18 Q${CX},30 0,18 z`} fill={p.light} opacity={0.18} />
    </>
  ),
  mountains: (p) => <>{peakRows(p)}</>,
  desert: (p) => (
    <>
      {rect(p.base)}
      <path
        d="M0,30 l18,6 l14,-10 l20,8 l16,-6 l22,10 l14,-4 M30,26 l-4,-16 l10,-10 M68,28 l6,-14 l-8,-14 M0,72 l14,-4 l12,10 l-6,14 l10,12 l-4,16 M104,66 l-16,4 l-8,14 l10,14 l-6,22 M24,0 l4,10 M40,120 l6,-10 l18,-2 l8,8"
        fill="none"
        stroke={p.dark}
        strokeWidth={2.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={84} cy={22} r={3} fill={p.light} />
      <circle cx={16} cy={50} r={2} fill={p.light} />
    </>
  ),
  gold: (p) => (
    <>
      {rect(p.base)}
      {(
        [
          [CX, 18, 10],
          [20, 46, 6],
          [86, 46, 7],
          [26, 96, 7],
          [80, 100, 5],
        ] as const
      ).map(([x, y, s], i) => (
        <path
          key={i}
          d={`M${x},${y - s} Q${x},${y} ${x + s},${y} Q${x},${y} ${x},${y + s} Q${x},${y} ${x - s},${y} Q${x},${y} ${x},${y - s} z`}
          fill={p.light}
        />
      ))}
      <path d="M8,70 l8,-6 l10,4 l-2,8 l-10,2 z M78,70 l10,-4 l8,6 l-4,8 l-10,0 z" fill={p.dark} />
    </>
  ),
  volcano: (p) => (
    <>
      {rect(p.base)}
      <path d={`M6,64 L38,10 H66 L98,64 z`} fill={p.dark} />
      <path
        d="M44,12 q-4,14 2,24 q4,8 -2,20 M58,12 q6,12 0,22 q-4,10 4,22"
        stroke={p.accent ?? p.light}
        strokeWidth={4}
        fill="none"
        strokeLinecap="round"
      />
      <ellipse cx={CX} cy={8} rx={18} ry={6} fill={p.light} opacity={0.7} />
    </>
  ),
  lake: (p) => (
    <>
      {rect(p.base)}
      {[10, 22, 34, 46].map((r) => (
        <circle
          key={r}
          cx={CX}
          cy={CY}
          r={r}
          fill="none"
          stroke={p.light}
          strokeWidth={3}
          opacity={0.7}
        />
      ))}
      <path
        d="M8,22 q6,-4 12,0 t12,0 M70,104 q6,-4 12,0 t12,0"
        stroke={p.dark}
        strokeWidth={2.4}
        fill="none"
      />
    </>
  ),
  fishingLake: (p) => (
    <>
      {rect(p.base)}
      {[34, 46].map((r) => (
        <circle
          key={r}
          cx={CX}
          cy={CY}
          r={r}
          fill="none"
          stroke={p.light}
          strokeWidth={3}
          opacity={0.6}
        />
      ))}
      {(
        [
          [CX, 20, 1],
          [22, 96, -1],
          [82, 96, 1],
        ] as const
      ).map(([x, y, d], i) => (
        <path
          key={i}
          d={`M${x - 10 * d},${y} q${10 * d},-8 ${18 * d},0 q${-8 * d},8 ${-18 * d},0 z M${x + 8 * d},${y} l${6 * d},-5 v10 z`}
          fill={p.dark}
        />
      ))}
    </>
  ),
  swamp: (p) => (
    <>
      {rect(p.base)}
      {(
        [
          [24, 30, 9],
          [80, 84, 11],
          [20, 96, 7],
        ] as const
      ).map(([x, y, r], i) => (
        <path key={i} d={`M${x},${y} l${r},-3 A${r},${r} 0 1 1 ${x},${y - r} z`} fill={p.light} />
      ))}
      <path
        d="M54,36 q2,-14 -2,-26 M60,36 q0,-12 6,-22 M48,36 q-2,-10 -10,-18 M86,46 q1,-10 -2,-18 M92,46 q2,-8 6,-14"
        stroke={p.dark}
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
      />
    </>
  ),
  oasis: (p) => (
    <>
      {rect(p.base)}
      <ellipse cx={CX} cy={98} rx={30} ry={12} fill={p.accent ?? p.light} />
      <path
        d="M50,40 q4,-14 2,-26"
        stroke={p.dark}
        strokeWidth={4}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M52,14 q-14,-6 -24,6 q12,-2 24,-6 q-8,-12 -20,-10 M52,14 q14,-6 24,6 q-12,-2 -24,-6 q8,-12 20,-10"
        fill={p.dark}
      />
      <path d="M0,60 q20,-8 40,0 M64,30 q20,-8 40,0" stroke={p.light} strokeWidth={3} fill="none" />
    </>
  ),
  castle: (p) => (
    <>
      {rect(p.base)}
      {Array.from({ length: 10 }, (_, row) =>
        Array.from({ length: 6 }, (_, col) => (
          <rect
            key={`${row}-${col}`}
            x={col * 22 - (row % 2) * 11}
            y={row * 12}
            width={22}
            height={12}
            fill="none"
            stroke={p.dark}
            strokeWidth={1.2}
            opacity={0.45}
          />
        )),
      )}
      <path
        d="M34,40 V14 h6 v-6 h6 v6 h12 v-6 h6 v6 h6 V40 z"
        fill={p.light}
        stroke={p.dark}
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
      <path d="M47,40 v-10 a5,5 0 0 1 10,0 v10" fill={p.dark} />
    </>
  ),
  quarry: (p) => (
    <>
      {rect(p.base)}
      {/* Stepped terraces cut into the stone. */}
      {[0, 1, 2, 3].map((i) => (
        <path
          key={i}
          d={`M0,${8 + i * 30} H${30 + i * 8} V${20 + i * 30} H${W}`}
          fill="none"
          stroke={p.dark}
          strokeWidth={2.4}
        />
      ))}
      <rect x={60} y={14} width={20} height={12} fill={p.light} stroke={p.dark} strokeWidth={2} />
      <rect x={70} y={26} width={22} height={12} fill={p.light} stroke={p.dark} strokeWidth={2} />
      <rect x={14} y={92} width={18} height={11} fill={p.light} stroke={p.dark} strokeWidth={2} />
    </>
  ),
  glassworks: (p) => (
    <>
      {rect(p.base)}
      {/* A round furnace with a glowing mouth, and a bottle beside it. */}
      <path d="M30,44 V24 a22,18 0 0 1 44,0 V44 z" fill={p.dark} />
      <path d="M44,44 v-10 a8,8 0 0 1 16,0 v10 z" fill={p.accent ?? p.light} />
      <rect x={56} y={2} width={8} height={10} fill={p.dark} />
      <path
        d="M84,30 v-8 h4 v8 q6,4 6,12 v4 h-16 v-4 q0,-8 6,-12 z"
        fill={p.light}
        stroke={p.dark}
        strokeWidth={2}
      />
      <path
        d="M8,96 q10,-8 20,0 M76,100 q10,-8 20,0"
        stroke={p.light}
        strokeWidth={3}
        fill="none"
      />
    </>
  ),
  hidden: (p) => (
    <>
      {rect(p.base)}
      {[20, 50, 80, 110].map((y, i) => (
        <path
          key={y}
          d={`M${-10 + (i % 2) * 14},${y} q12,-10 24,0 q12,-10 24,0 q12,-10 24,0 q12,-10 24,0`}
          stroke={p.light}
          strokeWidth={4}
          fill="none"
          strokeLinecap="round"
          opacity={0.6}
        />
      ))}
    </>
  ),
};

/** Hex types that have a printed picture. */
export const MOTIF_TYPES = Object.keys(ART);

/** <pattern> elements "pat-<type>" for every type the palettes cover. */
/** One drawn tile's picture, filling a 104×120 hex box, or undefined if there is none. */
export function drawnArt(type: string, palette: Palette): ReactNode {
  return ART[type]?.(palette);
}

export function drawnPatterns(palettes: Record<string, Palette>): ReactNode {
  return Object.entries(palettes).map(([type, p]) => {
    const art = ART[type];
    if (!art) return null;
    return (
      <pattern key={type} id={`pat-${type}`} patternUnits="objectBoundingBox" width="1" height="1">
        {art(p)}
      </pattern>
    );
  });
}

/** The drawn tiles for every type the palettes cover, plus the sea. */
export function tilePatterns(palettes: Record<string, Palette>, sea: Palette): ReactNode {
  return (
    <>
      {drawnPatterns(palettes)}
      {seaPattern('pat-sea', sea)}
    </>
  );
}

/**
 * Picture tiles: hexes cut from artwork, one image per hex type, each a
 * pointy-top hex filling a 104×120 box. The sea is either one picture per
 * sea hex or a small picture repeated across the whole sea. Hex types
 * without a picture fall back to the drawn tiles in `palettes`.
 */
export interface PictureSet {
  hexes: Record<string, string>;
  sea:
    { href: string; perHex: true } | { href: string; perHex: false; width: number; height: number };
}

export function pictureTilePatterns(
  set: PictureSet,
  palettes: Record<string, Palette>,
  sea: Palette,
): ReactNode {
  const drawn = Object.fromEntries(Object.entries(palettes).filter(([t]) => !set.hexes[t]));
  const hexImage = (id: string, href: string) => (
    <pattern key={id} id={id} patternUnits="objectBoundingBox" width="1" height="1">
      <rect width={W} height={H} fill={sea.base} />
      <image href={href} width={W} height={H} preserveAspectRatio="none" />
    </pattern>
  );
  return (
    <>
      {drawnPatterns(drawn)}
      {Object.entries(set.hexes).map(([type, href]) => hexImage(`pat-${type}`, href))}
      {set.sea.perHex ? (
        hexImage('pat-sea', set.sea.href)
      ) : (
        <pattern
          key="pat-sea"
          id="pat-sea"
          patternUnits="userSpaceOnUse"
          width={set.sea.width}
          height={set.sea.height}
        >
          <image
            href={set.sea.href}
            width={set.sea.width}
            height={set.sea.height}
            preserveAspectRatio="none"
          />
        </pattern>
      )}
    </>
  );
}
