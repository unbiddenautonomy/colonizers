import type { ReactNode } from 'react';
import { TRACK_COLOR } from './clean.ts';

// The Wooden board's metropolis emblems, drawn as vectors so they sit cleanly inside the
// sheet's towers (see metro-tower-*.webp). Coordinates are in the towers' 320-unit frame:
// the sprite's foot is at (160, 320).

const INK = '#161a19';
const CREAM = '#f3ead2';
const W = 7; // matches the towers' bold outlines

/** A cream plaque in the top panel of the shared tower, with the track's mark on it. */
function plaque(mark: ReactNode): ReactNode {
  return (
    <>
      <rect
        x={122}
        y={24}
        width={76}
        height={76}
        rx={10}
        fill={CREAM}
        stroke={INK}
        strokeWidth={W}
      />
      {mark}
    </>
  );
}

/** Each track's picture, alone, in the towers' frame: where its middle is and how far it reaches. */
const ICONS: Record<string, { cx: number; cy: number; r: number; draw: () => ReactNode }> = {
  // A pennant hung on the spire, with a shield on it.
  politics: {
    cx: 160,
    cy: 225,
    r: 44,
    draw: () => (
      <>
        <path d="M124,186 H196" stroke={INK} strokeWidth={W} strokeLinecap="round" />
        <path
          d="M130,186 H190 V264 L160,244 L130,264 Z"
          fill={TRACK_COLOR.politics}
          stroke={INK}
          strokeWidth={W}
          strokeLinejoin="round"
        />
        <path
          d="M145,202 H175 V220 Q175,234 160,240 Q145,234 145,220 Z"
          fill={CREAM}
          stroke={INK}
          strokeWidth={5}
          strokeLinejoin="round"
        />
      </>
    ),
  },
  // A compass set into the dome.
  science: {
    cx: 160,
    cy: 142,
    r: 26,
    draw: () => (
      <>
        <circle cx={160} cy={142} r={20} fill="none" stroke={TRACK_COLOR.science} strokeWidth={4} />
        <path
          d="M160,118 L167,142 L160,166 L153,142 Z"
          fill={TRACK_COLOR.science}
          stroke={INK}
          strokeWidth={3}
          strokeLinejoin="round"
        />
        <path
          d="M160,118 L167,142 H153 Z"
          fill="#b5413a"
          stroke={INK}
          strokeWidth={3}
          strokeLinejoin="round"
        />
        <circle cx={160} cy={142} r={3.5} fill={INK} />
      </>
    ),
  },
  trade: {
    cx: 160,
    cy: 62,
    r: 36,
    draw: () => (
      <g stroke={INK} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M160,36 V86 M146,88 H174 M136,46 H184" fill="none" />
        <path
          d="M136,46 L127,68 M136,46 L145,68 M184,46 L175,68 M184,46 L193,68"
          fill="none"
          strokeWidth={2.5}
        />
        <path d="M125,68 H147 A11,8 0 0 1 125,68 Z" fill={TRACK_COLOR.trade} />
        <path d="M173,68 H195 A11,8 0 0 1 173,68 Z" fill={TRACK_COLOR.trade} />
        <circle cx={160} cy={36} r={4} fill={TRACK_COLOR.trade} />
      </g>
    ),
  },
  religion: {
    cx: 160,
    cy: 62,
    r: 36,
    draw: () => (
      <path
        d="M153,34 H167 V50 H182 V64 H167 V92 H153 V64 H138 V50 H153 Z"
        fill={TRACK_COLOR.religion}
        stroke={INK}
        strokeWidth={4}
        strokeLinejoin="round"
      />
    ),
  },
  magic: {
    cx: 160,
    cy: 62,
    r: 36,
    draw: () => (
      <g stroke={INK} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round">
        <path d="M140,80 Q152,58 156,32 Q170,40 182,36 Q170,48 172,80 Z" fill={TRACK_COLOR.magic} />
        <path d="M130,84 Q160,72 190,84 Q160,94 130,84 Z" fill={TRACK_COLOR.magic} />
        <path
          d="M160,52 l2.4,5 5.4,.6 -4,3.7 1.1,5.4 -4.9,-2.7 -4.9,2.7 1.1,-5.4 -4,-3.7 5.4,-.6 Z"
          fill={TRACK_COLOR.trade}
          strokeWidth={1.5}
        />
      </g>
    ),
  },
  // Three stacks of coins, each coin a short gold cylinder.
  wealth: {
    cx: 160,
    cy: 62,
    r: 36,
    draw: () => (
      <g stroke={INK} strokeWidth={3} fill={TRACK_COLOR.trade} strokeLinejoin="round">
        {(
          [
            [143, 3],
            [177, 4],
            [160, 5],
          ] as const
        ).map(([x, n]) =>
          Array.from({ length: n }, (_, i) => {
            const y = 88 - i * 9 - (x === 160 ? 4 : 0);
            return (
              <g key={`${x}-${i}`}>
                <path d={`M${x - 13},${y - 6} V${y} A13,5 0 0 0 ${x + 13},${y} V${y - 6}`} />
                <ellipse cx={x} cy={y - 6} rx={13} ry={5} fill="#f2cf63" />
              </g>
            );
          }),
        )}
      </g>
    ),
  },
};

/** The emblem as it sits inside the track's tower: the politics pennant on the spire, the
 *  compass set into the dome, and the others on a plaque in the tower's top panel. */
function inTower(track: string): ReactNode {
  const icon = ICONS[track];
  if (!icon) return null;
  if (track === 'politics') return icon.draw();
  if (track === 'science')
    return (
      <g transform="translate(160,150) scale(1.45) translate(-160,-142)">
        <circle cx={160} cy={142} r={30} fill={CREAM} stroke={INK} strokeWidth={W / 1.45} />
        {icon.draw()}
      </g>
    );
  return plaque(icon.draw());
}

/** The emblem for a metropolis track, inside its tower, or null for a track without one. */
export function woodEmblem(track: string, x: number, y: number, size: number): ReactNode {
  if (!ICONS[track]) return null;
  return (
    <g transform={`translate(${x - size / 2},${y - size}) scale(${size / 320})`}>
      {inTower(track)}
    </g>
  );
}

/** The emblem alone on a round cream badge `size` across, its middle at (x, y): for a
 *  metropolis drawn as an ordinary city with its badge above. */
export function woodBadge(track: string, x: number, y: number, size: number): ReactNode {
  const icon = ICONS[track];
  if (!icon) return null;
  const R = 50;
  const k = (R * 0.66) / icon.r;
  return (
    <g transform={`translate(${x},${y}) scale(${size / (2 * R)})`}>
      <circle r={R} fill={CREAM} stroke={INK} strokeWidth={6} />
      <circle r={R - 9} fill="none" stroke={TRACK_COLOR[track] ?? INK} strokeWidth={5} />
      <g transform={`scale(${k}) translate(${-icon.cx},${-icon.cy})`}>{icon.draw()}</g>
    </g>
  );
}

/** A thin black anchor of height `h` centred on (x, y). */
function anchor(x: number, y: number, h: number): ReactNode {
  const top = y - h / 2;
  const bottom = y + h / 2;
  const ring = h * 0.12;
  const bar = y - h * 0.2;
  const d = [
    `M${x},${top + ring * 2} V${bottom}`,
    `M${x - h * 0.24},${bar} H${x + h * 0.24}`,
    `M${x - h * 0.42},${y + h * 0.1} Q${x - h * 0.38},${bottom} ${x},${bottom} Q${x + h * 0.38},${bottom} ${x + h * 0.42},${y + h * 0.1}`,
    `M${x - h * 0.42},${y + h * 0.1} l${-h * 0.09},${-h * 0.04} M${x + h * 0.42},${y + h * 0.1} l${h * 0.09},${-h * 0.04}`,
  ].join(' ');
  return (
    <g fill="none" stroke="#111" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={x} cy={top + ring} r={ring} />
      <path d={d} />
    </g>
  );
}

/** A harbor settlement: the settlement's own house, a little larger, on a small pier of the
 *  owner's colour, with a thin black anchor inside the house. Drawn with the board's house
 *  outline and shading so the two read as one family. `y` is the sprite's foot, as the board
 *  places painted pieces. */
export function woodHarbor(x: number, y: number, s: number, color: string, ink: string): ReactNode {
  const k = s * 0.2 * 1.15;
  const cy = y - 0.2 * s; // the middle of the corner
  const base = cy + k * 0.8; // the house's floor
  const house = `M${x - k * 0.85},${base} v${-k} l${k * 0.85},${-k * 0.8} l${k * 0.85},${k * 0.8} v${k} z`;
  const deck = { x: x - k * 1.25, y: base, w: k * 2.5, h: k * 0.34 };
  const post = (px: number) => (
    <rect
      key={px}
      x={px - k * 0.09}
      y={deck.y + deck.h}
      width={k * 0.18}
      height={k * 0.5}
      fill={color}
      stroke={ink}
      strokeWidth={1.8}
    />
  );
  return (
    <g pointerEvents="none">
      {post(deck.x + k * 0.3)}
      {post(deck.x + deck.w - k * 0.3)}
      <rect
        x={deck.x}
        y={deck.y}
        width={deck.w}
        height={deck.h}
        fill={color}
        stroke={ink}
        strokeWidth={2.2}
      />
      <rect x={deck.x} y={deck.y} width={deck.w} height={deck.h} fill="url(#wood-shade)" />
      <path d={house} fill={color} stroke={ink} strokeWidth={2.5} strokeLinejoin="round" />
      <path d={house} fill="url(#wood-shade)" />
      {anchor(x, base - k * 0.72, k * 0.82)}
    </g>
  );
}
