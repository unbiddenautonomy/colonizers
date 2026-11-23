import {
  memo,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import {
  buildGeometry,
  cornerToPixel,
  hexToPixel,
  type Action,
  type CornerId,
  type EdgeId,
  type GameState,
  type HexId,
  type Piece,
} from '@colonizers/engine';
import { RESOURCE_ICON, TRACK_COLOR, type Theme } from '../theme/clean.ts';
import { useTheme } from '../theme/themes.tsx';
import { motionAttrs, useBoardMotion } from './motion.ts';
import { nearestSpot, type Spot } from './nearest.ts';
import { spotLabel } from './spotLabel.ts';
import {
  CanalStretch,
  canalLinks,
  DryBasin,
  DryFarmland,
  farmlandDry,
  GoldRiver,
} from './CanalArt.tsx';
import {
  buildingMarkers,
  deedMarkers,
  GWP_ICON,
  neutralMarkers,
} from '../screens/GreedWealthPower.tsx';
import { churchMarkers } from '../screens/Church.tsx';
import { seatMarkers } from '../screens/CitiesKnights.tsx';
import { witchesMarkers } from '../screens/Witches.tsx';
import { princesMarkers } from '../screens/Princes.tsx';
import { kingdomsMarkers } from '../screens/Kingdoms.tsx';
import { landWaterVehicles } from '../screens/LandWater.tsx';
import { sfCornerMarkers, sfHexMarkers } from '../screens/Strategist.tsx';
import { ArmyFlag, armyLabel, soldiersMarkers, units } from '../screens/Soldiers.tsx';
import { LairMarkers } from './EpArt.tsx';
import { RiverHex, riverRun, riverTitle } from './RiverArt.tsx';
import { WonderMarkers } from './WonderArt.tsx';
import { dragonTint, useDragonColour, usePieceFinish } from '../theme/finishStore.ts';

const S = 60;
/**
 * How dark the robber's hex goes. A painted hex needs a far lighter wash: the same shade that
 * reads as "nothing is produced here" over flat colour simply blots out a picture.
 */
const ROBBER_DIM = (theme: Theme): number => (theme.painted === true ? 0.2 : 0.42);

/** The number disc, as a share of the hex size. */
const TOKEN_R = 0.35;
/** The pips' arc under the number: how far out they sit, and how far apart. */
const PIP_ARC = 0.175;
const PIP_STEP = (24 * Math.PI) / 180;

const PIPS: Record<number, number> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1,
};

export interface Targets {
  corners: Map<CornerId, Action>;
  edges: Map<EdgeId, Action>;
  hexes: Map<HexId, Action>;
}

export const noTargets: Targets = { corners: new Map(), edges: new Map(), hexes: new Map() };

interface BoardProps {
  state: GameState;
  targets: Targets;
  onAction: (a: Action) => void;
  theme?: Theme;
  /** Hex to flash, e.g. the one that just produced. */
  rolled?: number | null | undefined;
}

function hexPoints(q: number, r: number, scale = 1): string {
  const c = hexToPixel(q, r, S);
  const R = S * scale;
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 90);
    return `${(c.x + R * Math.cos(a)).toFixed(1)},${(c.y + R * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

function edgeEnds(edge: EdgeId, g: ReturnType<typeof buildGeometry>) {
  const [a, b] = g.edgeCorners.get(edge) as [CornerId, CornerId];
  return [cornerToPixel(a, S), cornerToPixel(b, S)] as const;
}

/** The glowing border on a hex a dragon holds. Pink, so it doesn't read as the barbarians' red. */
const DRAGON_PINK = '#ff5fa2';

/**
 * A cross pattée turned 45° into an ×, `r` from its centre to the tip of each arm: the arms flare
 * out to a wide, slightly hollowed end.
 */
function crossPattee(x: number, y: number, r: number): string {
  const neck = r * 0.16;
  const end = r * 0.5;
  const dip = r * 0.82;
  const arm = [
    [neck, neck],
    [end, r],
    [0, dip],
    [-end, r],
    [-neck, neck],
  ];
  const pts: string[] = [];
  for (let i = 0; i < 4; i++) {
    const t = Math.PI / 4 - (i * Math.PI) / 2;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    for (const [u, v] of arm.slice(i === 0 ? 0 : 1)) {
      // u runs across the arm, v along it; turn the arm to its corner.
      pts.push(`${(x + v! * cos - u! * sin).toFixed(2)},${(y + v! * sin + u! * cos).toFixed(2)}`);
    }
  }
  return `M${pts.join(' L')} Z`;
}

function HouseShape({
  x,
  y,
  color,
  city,
  theme,
}: {
  x: number;
  y: number;
  color: string;
  city: boolean;
  theme: Theme;
}) {
  const own = theme.pieces?.house;
  if (own) return <>{own({ x, y, color, city, s: S })}</>;
  const k = S * 0.2;
  const d = city
    ? `M${x - k * 1.3},${y + k * 0.9} v${-k * 1.2} l${k * 0.65},${-k * 0.7} l${k * 0.65},${k * 0.7} h${k * 1.3} v${k * 1.2} z`
    : `M${x - k * 0.85},${y + k * 0.8} v${-k * 1.0} l${k * 0.85},${-k * 0.8} l${k * 0.85},${k * 0.8} v${k * 1.0} z`;
  return (
    <>
      <path d={d} fill={color} stroke={theme.outline} strokeWidth={2.5} strokeLinejoin="round" />
      {theme.shadePieces && <path d={d} fill="url(#wood-shade)" pointerEvents="none" />}
    </>
  );
}

/** The neutral builders in two-player duel games: white and black. */
const NEUTRAL_COLORS = ['#f4f1ea', '#2f2f35'];

const CARGO_ICON: Record<string, string> = {
  settler: '🧑‍🌾',
  crew: '⚔️',
  fish: '🐟',
  spice: '🌶️',
  army: '🪖',
};
const CARGO_NAME: Record<string, string> = {
  settler: 'a settler',
  crew: 'a crew',
  fish: 'a fish',
  spice: 'a sack of spice',
  army: 'an army',
};

/** What a ship or harbor settlement carries (Explorers & Pirates). */
function Cargo({
  x,
  y,
  props,
  crates = false,
  theme,
}: {
  x: number;
  y: number;
  props: Record<string, unknown>;
  crates?: boolean;
  theme?: Theme;
}) {
  const cargo = Array.isArray(props.cargo) ? (props.cargo as string[]) : [];
  if (!cargo.length) return null;
  // Painted cargo, side by side, the first standing at (x, y).
  const art = theme
    ? cargo.map((c, i) => sprite(theme, `cargo-${c}`, x + S * 0.12 + i * S * 0.26, y, 0.3))
    : [];
  if (art.length && art.every((a) => a !== null))
    return (
      <g pointerEvents="none" className="cargo">
        {art.map((a, i) => (
          <g key={i}>{a}</g>
        ))}
        <title>{`Carrying ${cargo.map((c) => CARGO_NAME[c] ?? c).join(' and ')}`}</title>
      </g>
    );
  if (crates) {
    // Wooden crates in a row, the first at (x, y): a brown box with its boards and brace in black.
    const c = S * 0.2;
    return (
      <g pointerEvents="none" className="cargo">
        {cargo.map((_, i) => {
          const cx = x + i * c * 1.05;
          return (
            <g key={i}>
              <rect
                x={cx}
                y={y - c}
                width={c}
                height={c}
                fill="#9a6a3a"
                stroke="#1b1b1b"
                strokeWidth={1.4}
              />
              <path
                d={`M${cx},${y - c * 0.5} h${c} M${cx},${y - c} L${cx + c},${y}`}
                stroke="#1b1b1b"
                strokeWidth={1}
              />
            </g>
          );
        })}
        <title>{`Carrying ${cargo.map((c) => CARGO_NAME[c] ?? c).join(' and ')}`}</title>
      </g>
    );
  }
  const w = S * 0.26 * cargo.length;
  return (
    <g pointerEvents="none" className="cargo">
      <rect
        x={x - w / 2 - S * 0.04}
        y={y - S * 0.16}
        width={w + S * 0.08}
        height={S * 0.3}
        rx={S * 0.1}
        fill="#fff8e6"
        stroke="#5a3d1e"
        strokeWidth={1.5}
      />
      {cargo.map((c, i) => (
        <text
          key={i}
          x={x - w / 2 + S * 0.13 + i * S * 0.26}
          y={y + S * 0.07}
          textAnchor="middle"
          fontSize={S * 0.2}
        >
          {CARGO_ICON[c] ?? '📦'}
        </text>
      ))}
      <title>{`Carrying ${cargo.map((c) => CARGO_NAME[c] ?? c).join(' and ')}`}</title>
    </g>
  );
}

const KNIGHT_LEVEL: Record<string, number> = { knight1: 1, knight2: 2, knight3: 3 };

/** The board's painting by name, its foot at (x, y), `size` hexes tall, tinted when `color` is
 *  given; null when the board has none, so the drawing stays. */
function sprite(
  theme: Theme,
  key: string,
  x: number,
  y: number,
  size: number,
  color?: string,
  plain?: boolean,
): ReactNode {
  return (
    theme.pieces?.sprite?.({
      key,
      x,
      y,
      size: size * S,
      s: S,
      ...(color ? { color } : {}),
      ...(plain ? { plain } : {}),
    }) ?? null
  );
}

/** Marker emoji and the painting that can stand in for each. */
const EMOJI_SPRITE: Record<string, string> = {
  '🏰': 'citadel',
  '⛪': 'diocese',
  '🗿': 'monument',
  '🌾': 'silo',
  '🍻': 'festival',
  '👁️': 'inquisitor',
  '⚖️': 'inquisitor',
  '🧙': 'wizard',
  '🎩': 'junker',
  '🎖️': 'duke',
  '🎓': 'scholar',
  '📜': 'scholar',
  '💼': 'envoy',
  '🐉': 'gwpdragon',
  '👸': 'damsel',
  '🤴': 'prince',
  '👑': 'crown',
  '☢️': 'nukemark',
  '🚂': 'train',
  '⛴️': 'ferry',
  '✈️': 'plane',
};

/** Paintings that are white figures, tinted in their owner's colour like the pieces. */
const WHITE_FIGURES = new Set([
  'wizard',
  'junker',
  'duke',
  'scholar',
  'inquisitor',
  'envoy',
  'gwpdragon',
  'damsel',
  'train',
  'ferry',
  'plane',
]);

/**
 * A marker as the board's painting, standing on its own (no chip) and centred near (x, y): a
 * white figure takes its owner's colour; a coloured building stands on a base in that colour.
 * Null when the board has no painting for it.
 */
function markerArt(theme: Theme, icon: string, x: number, y: number, owner?: string): ReactNode {
  const key = EMOJI_SPRITE[icon];
  if (!key) return null;
  const foot = y + S * 0.2;
  if (WHITE_FIGURES.has(key)) return sprite(theme, key, x, foot, 0.44, owner);
  const art = sprite(theme, key, x, foot, 0.44);
  if (!art) return null;
  return (
    <>
      {owner && (
        <ellipse
          cx={x}
          cy={foot - S * 0.01}
          rx={S * 0.17}
          ry={S * 0.055}
          fill={owner}
          stroke={theme.outline}
          strokeWidth={1.2}
        />
      )}
      {art}
    </>
  );
}

/** A marker's emoji, or the board's painting for it, filling a chip of radius r at (x, y). */
function MarkerIcon({
  theme,
  icon,
  x,
  y,
  r,
  fontSize,
}: {
  theme: Theme;
  icon: string;
  x: number;
  y: number;
  r: number;
  fontSize: number;
}) {
  const key = EMOJI_SPRITE[icon];
  const art = key ? sprite(theme, key, x, y + r * 0.85, (r * 1.7) / S) : null;
  if (art) return <g pointerEvents="none">{art}</g>;
  return (
    <text x={x} y={y + fontSize * 0.36} textAnchor="middle" fontSize={fontSize}>
      {icon}
    </text>
  );
}

/** A shield: filled when active, pale when not, with one bar per strength level. */
function Knight({
  x,
  y,
  color,
  level,
  active,
  theme,
  fx,
}: {
  x: number;
  y: number;
  color: string;
  level: number;
  active: boolean;
  theme: Theme;
  fx: string;
}) {
  const k = S * 0.22;
  const art = sprite(
    theme,
    `knight${level}`,
    x,
    y + S * 0.27,
    0.62 * (theme.knightScale ?? 1),
    color,
  );
  if (art)
    return (
      <g filter={fx} opacity={active ? 1 : 0.55}>
        {art}
        <title>{`${['Basic', 'Strong', 'Mighty'][level - 1]} knight${active ? ' (active)' : ' (inactive)'}`}</title>
      </g>
    );
  return (
    <g filter={fx} opacity={active ? 1 : 0.85}>
      <path
        d={`M${x - k},${y - k} h${2 * k} v${k * 0.9} q0,${k * 0.9} ${-k},${k * 1.3} q${-k},${-k * 0.4} ${-k},${-k * 1.3} z`}
        fill={active ? color : '#fbf6e9'}
        stroke={color}
        strokeWidth={active ? 2 : 3.5}
      />
      <path
        d={`M${x - k},${y - k} h${2 * k} v${k * 0.9} q0,${k * 0.9} ${-k},${k * 1.3} q${-k},${-k * 0.4} ${-k},${-k * 1.3} z`}
        fill="none"
        stroke={theme.outline}
        strokeWidth={1.2}
      />
      {Array.from({ length: level }, (_, i) => (
        <line
          key={i}
          x1={x - k * 0.55}
          x2={x + k * 0.55}
          y1={y - k * 0.5 + i * k * 0.45}
          y2={y - k * 0.5 + i * k * 0.45}
          stroke={active ? '#fff' : color}
          strokeWidth={S * 0.045}
          strokeLinecap="round"
        />
      ))}
      <title>{`${['Basic', 'Strong', 'Mighty'][level - 1]} knight${active ? ' (active)' : ' (inactive)'}`}</title>
    </g>
  );
}

/** A small boat in the middle of the edge, over a thin wake line. */
/**
 * Three wind lines trailing from a boosted ship's stern (extra sails this turn). Each dips in the
 * middle and turns up at both ends, at the height of the hull.
 */
function BoostWind({
  a,
  b,
  bow,
}: {
  a: { x: number; y: number };
  b: { x: number; y: number };
  bow: 'left' | 'right';
}) {
  const x = (a.x + b.x) / 2;
  const foot = (a.y + b.y) / 2 + S * 0.168;
  const side = bow === 'left' ? 1 : -1;
  const k = S / 60;
  return (
    <g pointerEvents="none">
      {[-21, -14, -7].map((dy) => (
        <path
          key={dy}
          d={`M${x + side * 17 * k},${foot + dy * k} q${side * 8 * k},${4 * k} ${side * 16 * k},0`}
          fill="none"
          stroke="#fff"
          strokeWidth={1.25 * k}
          strokeOpacity={0.6}
          strokeLinecap="round"
        />
      ))}
      <title>Extra sails: two more moves this turn</title>
    </g>
  );
}

function Ship({
  a,
  b,
  color,
  theme,
  fx,
}: {
  a: { x: number; y: number };
  b: { x: number; y: number };
  color: string;
  theme: Theme;
  fx: string;
}) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const k = S * 0.2;
  return (
    <g filter={fx}>
      <line
        x1={a.x + (b.x - a.x) * 0.12}
        y1={a.y + (b.y - a.y) * 0.12}
        x2={b.x - (b.x - a.x) * 0.12}
        y2={b.y - (b.y - a.y) * 0.12}
        stroke={color}
        strokeWidth={S * 0.06}
        strokeLinecap="round"
        strokeDasharray={`${S * 0.08} ${S * 0.07}`}
      />
      {theme.pieces?.ship ? (
        theme.pieces.ship({ a, b, color, s: S })
      ) : (
        <g transform={`translate(${mx} ${my})`}>
          <path
            d={`M${-k * 1.3},${-k * 0.1} h${k * 2.6} l${-k * 0.5},${k * 0.7} h${-k * 1.6} z`}
            fill={color}
            stroke={theme.outline}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          <path
            d={`M${-k * 0.1},${-k * 0.15} v${-k * 1.1} l${k * 0.85},${k * 1.1} z`}
            fill={theme.harborFace}
            stroke={theme.outline}
            strokeWidth={1.5}
          />
        </g>
      )}
      <title>Ship</title>
    </g>
  );
}

/** True for a light colour, which wants dark marks on it. */
function isLight(hex: string): boolean {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  if (Number.isNaN(n)) return false;
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150;
}

/** The pirate: a ship under a black sail with a skull and crossbones, larger than a player's ship. */
function PirateShip({ x, y, color, ink }: { x: number; y: number; color: string; ink: string }) {
  const u = S * 0.1;
  const bone = isLight(color) ? '#1b1b1b' : '#f4efe4';
  const sx = x + 0.2 * u;
  const sy = y - 3.1 * u;
  return (
    <>
      <path
        d={`M${x - 4.4 * u},${y + 0.2 * u} h${8.8 * u} l${-1.6 * u},${2.6 * u} h${-5.6 * u} z`}
        fill={color}
        stroke={ink}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <line x1={x} y1={y + 0.2 * u} x2={x} y2={y - 6 * u} stroke={ink} strokeWidth={S * 0.04} />
      <path
        d={`M${x - 2.8 * u},${y - 5.4 * u} q${3 * u},${-0.6 * u} ${6.2 * u},0 v${4.6 * u} q${-3.2 * u},${-0.6 * u} ${-6.2 * u},0 z`}
        fill={color}
        stroke={ink}
        strokeWidth={1.4}
      />
      <path
        d={`M${sx - 1.3 * u},${sy + 0.6 * u} L${sx + 1.3 * u},${sy + 1.9 * u} M${sx + 1.3 * u},${sy + 0.6 * u} L${sx - 1.3 * u},${sy + 1.9 * u}`}
        stroke={bone}
        strokeWidth={S * 0.035}
        strokeLinecap="round"
      />
      <circle cx={sx} cy={sy} r={0.95 * u} fill={bone} />
      <circle cx={sx - 0.35 * u} cy={sy - 0.05 * u} r={0.24 * u} fill={color} />
      <circle cx={sx + 0.35 * u} cy={sy - 0.05 * u} r={0.24 * u} fill={color} />
    </>
  );
}

/**
 * A painted board's army: its figures in the owner's colour with a disc counting its units, or
 * null when the board has no army painting and the flag is drawn instead.
 */
function armyArt(theme: Theme, army: Piece, x: number, y: number, fill: string): ReactNode {
  const art = sprite(theme, 'army', x - S * 0.06, y + S * 0.28, 0.6, fill);
  if (!art) return null;
  const u = units(army);
  const n = u.infantry + u.cavalry + u.artillery;
  const bx = x + S * 0.2;
  const by = y - S * 0.06;
  return (
    <g>
      {art}
      <circle cx={bx} cy={by} r={S * 0.1} fill={fill} stroke={theme.outline} strokeWidth={1.5} />
      <text
        x={bx}
        y={by + S * 0.045}
        textAnchor="middle"
        fontSize={S * 0.13}
        fontWeight={800}
        fill="#fff"
        stroke={theme.outline}
        strokeWidth={0.6}
      >
        {n}
      </text>
      <title>{armyLabel(army)}</title>
    </g>
  );
}

/** A stretch of city wall with battlements, its top edge at y, centred on x. */
function Battlement({ x, y, ink }: { x: number; y: number; ink: string }) {
  const w = S * 0.7;
  const h = S * 0.1;
  const m = S * 0.055;
  const n = 6;
  const step = w / (2 * n - 1);
  // The top runs merlon, gap, merlon … across; the body is a band of stone below it.
  let d = `M${x - w / 2},${y + h}`;
  for (let i = 0; i < 2 * n - 1; i++) {
    const x0 = x - w / 2 + i * step;
    d += i % 2 === 0 ? ` V${y - m} H${x0 + step} V${y}` : ` H${x0 + step}`;
  }
  d += ` V${y + h} Z`;
  const joints = Array.from({ length: 5 }, (_, i) => {
    const bx = x - w / 2 + ((i + 0.5) * w) / 5;
    return `M${bx},${y} V${y + h / 2} M${bx + w / 10},${y + h / 2} V${y + h}`;
  }).join(' ');
  return (
    <g pointerEvents="none">
      <path d={d} fill="#f2efe8" stroke={ink} strokeWidth={1.6} strokeLinejoin="round" />
      <path
        d={`M${x - w / 2},${y + h / 2} H${x + w / 2} ${joints}`}
        stroke="#8f8a82"
        strokeOpacity={0.6}
        strokeWidth={1}
      />
    </g>
  );
}

/** A pirate's treasure chest: a domed lid, iron bands, a lock and gold spilling out. */
function TreasureChest({ x, y }: { x: number; y: number }) {
  const u = S * 0.1;
  const edge = { stroke: '#2b1a0e', strokeWidth: 1.5, strokeLinejoin: 'round' as const };
  return (
    <>
      <path
        d={`M${x - 2.6 * u},${y - 0.6 * u} q${2.6 * u},${-1.6 * u} ${5.2 * u},0`}
        fill="#f2c230"
        stroke="#8a5a10"
        strokeWidth={1.2}
      />
      <rect
        x={x - 2.6 * u}
        y={y - 0.6 * u}
        width={5.2 * u}
        height={2.8 * u}
        rx={2}
        fill="#8a5a2b"
        {...edge}
      />
      <path
        d={`M${x - 2.8 * u},${y - 0.6 * u} q${2.8 * u},${-2.4 * u} ${5.6 * u},0 z`}
        fill="#a86e35"
        {...edge}
      />
      <path
        d={`M${x - 1.6 * u},${y + 2.2 * u} V${y - 1.4 * u} M${x + 1.6 * u},${y + 2.2 * u} V${y - 1.4 * u}`}
        stroke="#4a4a4a"
        strokeWidth={S * 0.045}
      />
      <rect
        x={x - 0.55 * u}
        y={y - 0.9 * u}
        width={1.1 * u}
        height={1.3 * u}
        rx={1}
        fill="#f2c230"
        {...edge}
        strokeWidth={1}
      />
    </>
  );
}

/** A small dragon in profile: wings up, long neck, curled tail. */
function Dragon({ x, y, fill }: { x: number; y: number; fill: string }) {
  const k = (S * 0.68) / 100;
  return (
    <g transform={`translate(${x - 50 * k} ${y - 58 * k}) scale(${k})`}>
      <path
        d="M30,62 Q10,74 6,56 Q14,64 26,56 z"
        fill={fill}
        stroke="#1a0a06"
        strokeWidth={4}
        strokeLinejoin="round"
      />
      <path
        d="M38,52 L18,14 L32,26 L36,6 L48,28 L56,12 L58,48 z"
        fill="#c9583a"
        stroke="#1a0a06"
        strokeWidth={4}
        strokeLinejoin="round"
      />
      <ellipse cx={50} cy={62} rx={24} ry={13} fill={fill} stroke="#1a0a06" strokeWidth={4} />
      <path
        d="M64,58 Q74,40 82,32 L96,36 L90,44 L80,44 Q78,52 72,66 z"
        fill={fill}
        stroke="#1a0a06"
        strokeWidth={4}
        strokeLinejoin="round"
      />
      <path d="M84,32 l-2,-8 l6,6 z" fill="#f6d27a" stroke="#1a0a06" strokeWidth={2} />
      <circle cx={87} cy={37} r={2.4} fill="#f6d27a" />
      <path d="M38,72 v12 M58,72 v12" stroke="#1a0a06" strokeWidth={6} strokeLinecap="round" />
    </g>
  );
}

function BoardImpl({ state, targets, onAction, theme: given, rolled }: BoardProps) {
  const chosen = useTheme();
  const theme = given ?? chosen;
  const fx = theme.pieceEffect === 'glow' ? 'url(#glow)' : 'url(#lift)';
  // Painted pieces read the finish as they draw, so a new pick has to redraw the board.
  usePieceFinish();
  useDragonColour();
  const patterned = new Set(theme.patterned ?? []);
  const hexes = useMemo(() => Object.values(state.hexes), [state.hexes]);
  const canal = useMemo(() => canalLinks(state, S), [state]);
  const dry = farmlandDry(state);
  const g = useMemo(() => buildGeometry(hexes.map((h) => h.id)), [hexes]);
  const river = useMemo(() => riverRun(hexes), [hexes]);
  const svgRef = useRef<SVGSVGElement>(null);
  useBoardMotion(svgRef, g, state);

  const viewBox = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    // Frame the land (plus room for harbors), not the whole sea ring.
    const land = hexes.filter((h) => h.type !== 'sea' && h.type !== 'shoal');
    for (const h of land.length ? land : hexes) {
      const c = hexToPixel(h.q, h.r, S);
      xs.push(c.x);
      ys.push(c.y);
    }
    const pad = S * 1.75;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    return `${minX} ${minY} ${Math.max(...xs) + pad - minX} ${Math.max(...ys) + pad - minY}`;
  }, [hexes]);

  const pieces = Object.values(state.pieces);
  const color = (seat: number | null) =>
    seat === null ? '#444' : (theme.players[seat]?.color ?? '#999');
  // Two-player duel rules: the neutral builders' pieces are white and black.
  const pieceColor = (p: { owner: number | null; props: Record<string, unknown> }) =>
    p.owner === null && typeof p.props.neutral === 'number'
      ? (NEUTRAL_COLORS[p.props.neutral] ?? '#444')
      : color(p.owner);
  const robberHex = pieces.find((p) => p.type === 'robber')?.at;
  const tb = state.data['traders-barbarians'] as
    | {
        barbarians?: Record<string, number>;
        knights?: { id: string; owner: number; edge: EdgeId }[];
        wagons?: Record<string, { corner: CornerId | null }>;
        edgeBarbarians?: EdgeId[];
      }
    | undefined;
  const barbarians = tb?.barbarians ?? {};
  const dragons =
    (state.data['treasures-dragons']?.dragons as Record<string, number> | undefined) ?? {};
  const dragonAt = (h: HexId | undefined) => !!h && (dragons[h] ?? 0) > 0;
  const pirateHex = pieces.find((p) => p.type === 'pirate')?.at;

  /**
   * Every place that can be chosen now, in reading order (top to bottom, then
   * left to right), for taps that land near a spot and for the arrow keys.
   */
  const spots = useMemo(() => {
    const list: (Spot<Action> & { key: string; kind: 'hex' | 'edge' | 'corner' })[] = [];
    [...targets.hexes].forEach(([id, action], i) => {
      const h = state.hexes[id];
      if (!h) return;
      const c = hexToPixel(h.q, h.r, S);
      list.push({ ...c, what: action, key: `hex:${i}`, kind: 'hex' });
    });
    [...targets.edges].forEach(([id, action], i) => {
      const [a, b] = edgeEnds(id, g);
      list.push({
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        what: action,
        key: `edge:${i}`,
        kind: 'edge',
      });
    });
    [...targets.corners].forEach(([id, action], i) => {
      const c = cornerToPixel(id, S);
      list.push({ x: c.x, y: c.y, what: action, key: `corner:${i}`, kind: 'corner' });
    });
    return list.sort((a, b) => a.y - b.y || a.x - b.x);
  }, [targets, state.hexes, g]);
  const spotCount = spots.length;

  /** Which spot the arrow keys are on; the first one until they are used. */
  const [spotKey, setSpotKey] = useState<string | null>(null);
  const onSpot = spots.find((s) => s.key === spotKey) ?? spots[0] ?? null;
  const keyIndex = (key: string) => (onSpot && key === onSpot.key ? 0 : -1);

  /**
   * The board is one keyboard stop with the arrow keys moving between the
   * places that can be chosen: none of the 54 building spots could be reached
   * with a keyboard at all, and 54 tab stops would be worse than none.
   */
  const onSpotKey = (e: KeyboardEvent<SVGGElement>) => {
    const at = spots.findIndex((s) => s.key === (onSpot?.key ?? ''));
    if (at < 0) return;
    const go = (to: number) => {
      e.preventDefault();
      const next = spots[(to + spots.length) % spots.length]!;
      setSpotKey(next.key);
      svgRef.current
        ?.querySelector<SVGElement & { focus(): void }>(`[data-spot="${next.key}"]`)
        ?.focus();
    };
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go(at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(spots.length - 1);
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onAction(spots[at]!.what);
    }
  };

  /**
   * A tap that lands on nothing takes the nearest building spot. The spots
   * themselves are 12 px across on a phone and cannot grow much without a
   * road's spot and a settlement's spot stealing each other's taps.
   */
  const tapNearby = (e: MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || (e.target as Element).closest('.target')) return;
    const reachable = spots.filter((s) => s.kind !== 'hex');
    if (!reachable.length) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const at = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    // How far from a spot a tap still counts, in board units, so the reach is
    // the same on screen however far the board is zoomed in. Spots are about
    // 37 px apart on a phone, so 26 px gives a spot a tap area wider than a
    // thumb while leaving the middle of a hex, where nothing is meant to be
    // built, out of reach.
    const within = 26 / (ctm.a || 1);
    const action = nearestSpot({ x: at.x, y: at.y }, reachable, within);
    if (action) onAction(action);
  };

  return (
    <svg
      ref={svgRef}
      className="board"
      viewBox={viewBox}
      role="img"
      aria-label="Game board"
      onClick={tapNearby}
    >
      <defs>
        <filter id="lift" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.35" />
        </filter>
        <filter id="boost-aura" x="-40%" y="-40%" width="180%" height="180%">
          <feMorphology in="SourceAlpha" operator="dilate" radius={1.2} />
          <feGaussianBlur stdDeviation={3.2} result="spread" />
          <feFlood floodColor="#ffcf4a" />
          <feComposite in2="spread" operator="in" result="aura" />
          <feMerge>
            <feMergeNode in="aura" />
            <feMergeNode in="aura" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="wood-shade" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.3" />
        </linearGradient>
        <radialGradient id="hex-shade" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.28" />
        </radialGradient>
        {theme.patterns?.()}
      </defs>

      {hexes.map((h) => {
        const fog = !!h.hidden || h.type === 'hidden';
        const type = fog ? 'hidden' : h.type;
        const shoal = type === 'shoal';
        const robbed = robberHex?.kind === 'hex' && robberHex.id === h.id;
        const isSea = type === 'sea' || shoal;
        const lakeNumbers = type === 'fishingLake' ? ((h.props?.tokens as number[]) ?? []) : [];
        const c = hexToPixel(h.q, h.r, S);
        const drop = S * (theme.tokenDrop ?? 0);
        const key = isSea ? 'sea' : type;
        const fill = patterned.has(key)
          ? `url(#pat-${key})`
          : isSea
            ? theme.sea
            : (theme.terrain[type] ?? '#ccc');
        return (
          <g key={h.id}>
            <polygon
              points={hexPoints(h.q, h.r)}
              fill={fill}
              stroke={isSea ? theme.seaEdge : theme.landStroke}
              strokeWidth={isSea ? 0.5 : (theme.landStrokeWidth ?? 3)}
              strokeOpacity={isSea ? 0.5 : 1}
            >
              <title>
                {fog
                  ? 'Fog: not explored yet'
                  : shoal
                    ? `Fishing ground: fish on ${h.token}`
                    : lakeNumbers.length
                      ? `Fishing lake: fish on ${lakeNumbers.join(', ')}`
                      : (riverTitle(h) ?? h.type)}
              </title>
            </polygon>
            {theme.landOverlay && !isSea && !fog && (
              <polygon
                points={hexPoints(h.q, h.r)}
                fill={`url(#${theme.landOverlay})`}
                pointerEvents="none"
                aria-hidden="true"
              />
            )}
            {shoal && (
              <g aria-hidden="true">
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={S * 0.62}
                  fill="none"
                  stroke={theme.seaEdge}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                />
                <text x={c.x} y={c.y - S * 0.4} textAnchor="middle" fontSize={S * 0.26}>
                  🐟
                </text>
              </g>
            )}
            {lakeNumbers.length > 0 && (
              <g className={lakeNumbers.includes(rolled ?? -1) ? 'token hot' : 'token'}>
                <rect
                  x={c.x - S * 0.5}
                  y={c.y - S * 0.17}
                  width={S}
                  height={S * 0.34}
                  rx={S * 0.17}
                  fill={theme.token}
                  stroke={theme.outline}
                  strokeWidth={1.5}
                />
                <text
                  x={c.x}
                  y={c.y + S * 0.08}
                  textAnchor="middle"
                  fontSize={S * 0.2}
                  fontWeight={700}
                  fill={theme.tokenText}
                >
                  {lakeNumbers.join(' · ')}
                </text>
              </g>
            )}
            {!isSea && theme.hexShade && (
              <polygon
                points={hexPoints(h.q, h.r)}
                fill="url(#hex-shade)"
                pointerEvents="none"
                aria-hidden="true"
              />
            )}
            {!isSea && theme.hexInset && (
              <polygon
                points={hexPoints(h.q, h.r, 0.86)}
                fill="none"
                stroke={theme.hexInset}
                strokeOpacity={0.4}
                strokeWidth={2.5}
                pointerEvents="none"
                aria-hidden="true"
              />
            )}
            {!fog && (h.props?.gwpRiver === true || h.props?.swampland === true) && (
              <RiverHex hex={h} run={river} S={S} />
            )}
            {!isSea && theme.terrainIcons && theme.terrainIcon[type] && (
              <g aria-hidden="true" pointerEvents="none">
                <circle
                  cx={c.x}
                  cy={c.y - S * 0.6}
                  r={S * 0.19}
                  fill={theme.token}
                  fillOpacity={0.9}
                  stroke={theme.outline}
                  strokeOpacity={0.35}
                />
                <text
                  x={c.x}
                  y={c.y - S * 0.6}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={S * 0.24}
                >
                  {h.props?.swampland === true ? '🐸' : theme.terrainIcon[type]}
                </text>
              </g>
            )}
            {!isSea && !fog && (
              <polygon
                points={hexPoints(h.q, h.r)}
                className="robber-dim"
                fill="#14110f"
                opacity={robbed ? ROBBER_DIM(theme) : 0}
                pointerEvents="none"
                aria-hidden={robbed ? undefined : true}
              >
                {robbed && <title>The robber is here: this hex produces nothing</title>}
              </polygon>
            )}
            {(barbarians[h.id] ?? 0) >= 3 && (
              <g pointerEvents="none">
                <polygon
                  className="hex-glow"
                  points={hexPoints(h.q, h.r, 0.96)}
                  fill="none"
                  stroke="#ff4a3a"
                  strokeWidth={S * 0.07}
                  strokeLinejoin="round"
                  filter="url(#glow)"
                />
                <title>Held by barbarians: no production, and no building next to it</title>
              </g>
            )}
            {dry && h.props?.farmland === true && (
              <DryFarmland hex={h} S={S} points={hexPoints(h.q, h.r)} />
            )}
            {h.props?.basin === true && h.type === 'desert' && <DryBasin hex={h} S={S} />}
            {h.props?.goldRiver === true && !fog && <GoldRiver hex={h} S={S} />}
            {canal.has(h.id) && <CanalStretch hex={h} link={canal.get(h.id)!} S={S} />}
            {h.token && !fog && (barbarians[h.id] ?? 0) < 3 && (
              <g
                className={`${rolled === h.token ? 'token hot' : 'token'}${robbed ? ' robbed' : ''}`}
                opacity={(dry && h.props?.farmland === true) || robbed ? 0.55 : undefined}
              >
                {theme.pieces?.token ? (
                  theme.pieces.token({
                    x: c.x,
                    y: c.y + drop,
                    r: S * TOKEN_R,
                    hot: h.token === 6 || h.token === 8,
                  })
                ) : (
                  <circle
                    cx={c.x}
                    cy={c.y + drop}
                    r={S * TOKEN_R}
                    fill={theme.token}
                    stroke={theme.outline}
                    strokeWidth={1.5}
                  />
                )}
                <text
                  x={c.x}
                  y={c.y + drop + S * 0.06}
                  textAnchor="middle"
                  fontSize={S * 0.3}
                  fontWeight={700}
                  fontFamily={theme.tokenFont}
                  fill={h.token === 6 || h.token === 8 ? theme.tokenHot : theme.tokenText}
                >
                  {h.token}
                </text>
                {/* The pips curve under the number rather than lying in a line: the ends rise
                    into the open space either side of it, which keeps even a row of five well
                    inside the face of a themed disc instead of running onto its rim. */}
                {Array.from({ length: PIPS[h.token] ?? 0 }, (_, i) => {
                  const n = PIPS[h.token as number] ?? 0;
                  const a = Math.PI / 2 + (i - (n - 1) / 2) * PIP_STEP;
                  return (
                    <circle
                      key={i}
                      cx={c.x + Math.cos(a) * S * PIP_ARC}
                      cy={c.y + drop + Math.sin(a) * S * PIP_ARC}
                      r={S * 0.025}
                      fill={h.token === 6 || h.token === 8 ? theme.tokenHot : theme.tokenText}
                    />
                  );
                })}
              </g>
            )}
          </g>
        );
      })}

      {state.harbors.map((hb) => {
        const [a, b] = edgeEnds(hb.edge, g);
        const sea = (g.edgeHexes.get(hb.edge) ?? []).find((id) => state.hexes[id]?.type === 'sea');
        const sh = sea ? state.hexes[sea] : undefined;
        const sc = sh ? hexToPixel(sh.q, sh.r, S) : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const px = mx + (sc.x - mx) * 0.55;
        const py = my + (sc.y - my) * 0.55;
        return (
          <g key={hb.edge} className="harbor">
            <line x1={a.x} y1={a.y} x2={px} y2={py} stroke={theme.harborWood} strokeWidth={4} />
            <line x1={b.x} y1={b.y} x2={px} y2={py} stroke={theme.harborWood} strokeWidth={4} />
            <circle
              cx={px}
              cy={py}
              r={S * 0.27}
              fill={theme.harborFace}
              stroke={theme.harborWood}
              strokeWidth={2}
            />
            <text
              x={px}
              y={py - S * 0.02}
              textAnchor="middle"
              fontSize={S * 0.17}
              fontWeight={700}
              fontFamily={theme.tokenFont}
              fill={theme.harborText}
            >
              {hb.ratio}:1
            </text>
            <text
              x={px}
              y={py + S * 0.17}
              textAnchor="middle"
              fontSize={S * 0.15}
              fill={theme.harborText}
            >
              {hb.resource === 'any' ? '?' : RESOURCE_ICON[hb.resource]}
            </text>
            <title>
              {hb.resource === 'any'
                ? 'Harbor: trade any 3 for 1'
                : `Harbor: trade 2 ${hb.resource} for 1`}
            </title>
          </g>
        );
      })}

      <LairMarkers
        state={state}
        S={S}
        color={color}
        paint={(k, x, y, size) => sprite(theme, k, x, y, size)}
      />
      <WonderMarkers state={state} S={S} color={color} outline={theme.outline} />

      {pieces
        .filter((p) => p.at.kind === 'edge')
        // Rivers lie under everything else.
        .sort((x, y) => Number(y.type === 'river') - Number(x.type === 'river'))
        .map((p) => {
          const edge = (p.at as { id: EdgeId }).id;
          const [a, b] = edgeEnds(edge, g);
          const k = 0.16;
          const attrs =
            p.type === 'river'
              ? {}
              : motionAttrs(p.id, `edge:${edge}`, (a.x + b.x) / 2, (a.y + b.y) / 2, {
                  owner: p.owner,
                  kind: p.type,
                  ends: g.edgeCorners.get(edge),
                });
          const inner = (() => {
            if (p.type === 'river')
              return (
                <g key={p.id} strokeLinecap="round">
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={theme.seaEdge}
                    strokeWidth={S * 0.22}
                  />
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={theme.terrain.lake ?? theme.sea}
                    strokeWidth={S * 0.1}
                  />
                  <title>River: only a bridge can cross</title>
                </g>
              );
            if (p.type === 'bridge') {
              const len = Math.hypot(b.x - a.x, b.y - a.y);
              // Unit vectors along the bridge and across it.
              const ux = (b.x - a.x) / len;
              const uy = (b.y - a.y) / len;
              const nx = -uy;
              const ny = ux;
              const at = (t: number, off: number) => ({
                x: a.x + (b.x - a.x) * t + nx * off * S,
                y: a.y + (b.y - a.y) * t + ny * off * S,
              });
              const rail = (side: number) => {
                const p0 = at(0.06, side * 0.15);
                const p1 = at(0.94, side * 0.15);
                return (
                  <g key={`rail-${side}`}>
                    <line
                      x1={p0.x}
                      y1={p0.y}
                      x2={p1.x}
                      y2={p1.y}
                      stroke={theme.outline}
                      strokeWidth={S * 0.05}
                      strokeLinecap="round"
                    />
                    <line
                      x1={p0.x}
                      y1={p0.y}
                      x2={p1.x}
                      y2={p1.y}
                      stroke="#c99a62"
                      strokeWidth={S * 0.022}
                      strokeLinecap="round"
                    />
                    {[0.06, 0.5, 0.94].map((t) => {
                      const q = at(t, side * 0.15);
                      return (
                        <circle
                          key={t}
                          cx={q.x}
                          cy={q.y}
                          r={S * 0.04}
                          fill="#8a5a34"
                          stroke={theme.outline}
                          strokeWidth={1.4}
                        />
                      );
                    })}
                  </g>
                );
              };
              return (
                <g key={p.id} filter={fx}>
                  {/* The wooden deck, its planks, the owner's road along it, a rail each side. */}
                  <line
                    x1={a.x + ux * len * 0.06}
                    y1={a.y + uy * len * 0.06}
                    x2={b.x - ux * len * 0.06}
                    y2={b.y - uy * len * 0.06}
                    stroke={theme.outline}
                    strokeWidth={S * 0.32}
                    strokeLinecap="butt"
                  />
                  <line
                    x1={a.x + ux * len * 0.065}
                    y1={a.y + uy * len * 0.065}
                    x2={b.x - ux * len * 0.065}
                    y2={b.y - uy * len * 0.065}
                    stroke="#a8743f"
                    strokeWidth={S * 0.27}
                    strokeLinecap="butt"
                  />
                  {Array.from({ length: 9 }, (_, i) => {
                    const t = 0.1 + (i * 0.8) / 8;
                    const p0 = at(t, -0.13);
                    const p1 = at(t, 0.13);
                    return (
                      <line
                        key={i}
                        x1={p0.x}
                        y1={p0.y}
                        x2={p1.x}
                        y2={p1.y}
                        stroke={theme.outline}
                        strokeOpacity={0.45}
                        strokeWidth={1.1}
                      />
                    );
                  })}
                  <line
                    x1={a.x + (b.x - a.x) * k}
                    y1={a.y + (b.y - a.y) * k}
                    x2={b.x - (b.x - a.x) * k}
                    y2={b.y - (b.y - a.y) * k}
                    stroke={color(p.owner)}
                    strokeWidth={S * 0.09}
                    strokeLinecap="round"
                  />
                  {rail(-1)}
                  {rail(1)}
                  <title>Bridge</title>
                </g>
              );
            }
            if (p.type === 'road' && p.props.damaged)
              return (
                <line
                  key={p.id}
                  x1={a.x + (b.x - a.x) * k}
                  y1={a.y + (b.y - a.y) * k}
                  x2={b.x - (b.x - a.x) * k}
                  y2={b.y - (b.y - a.y) * k}
                  stroke={color(p.owner)}
                  strokeWidth={S * 0.13}
                  strokeDasharray={`${S * 0.1} ${S * 0.06}`}
                  opacity={0.75}
                  filter={fx}
                >
                  <title>Damaged road: repair it before building new roads</title>
                </line>
              );
            if (p.type === 'ship')
              return (
                <g key={p.id}>
                  {p.props.boost === true ? (
                    <g filter="url(#boost-aura)">
                      <Ship a={a} b={b} color={color(p.owner)} theme={theme} fx={fx} />
                    </g>
                  ) : (
                    <Ship a={a} b={b} color={color(p.owner)} theme={theme} fx={fx} />
                  )}
                  {p.props.boost === true && (
                    <BoostWind a={a} b={b} bow={theme.shipBow ?? 'left'} />
                  )}
                  {theme.crateCargo ? (
                    <Cargo
                      theme={theme}
                      x={(a.x + b.x) / 2 + S * 0.2}
                      y={(a.y + b.y) / 2 + S * 0.1}
                      props={p.props}
                      crates
                    />
                  ) : (
                    <Cargo
                      x={(a.x + b.x) / 2}
                      y={(a.y + b.y) / 2 - S * 0.3}
                      props={p.props}
                      theme={theme}
                    />
                  )}
                </g>
              );
            if (theme.pieces?.road)
              return (
                <g key={p.id} filter={fx}>
                  {theme.pieces.road({
                    a: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k },
                    b: { x: b.x - (b.x - a.x) * k, y: b.y - (b.y - a.y) * k },
                    color: pieceColor(p),
                    s: S,
                  })}
                </g>
              );
            return (
              <line
                key={p.id}
                x1={a.x + (b.x - a.x) * k}
                y1={a.y + (b.y - a.y) * k}
                x2={b.x - (b.x - a.x) * k}
                y2={b.y - (b.y - a.y) * k}
                stroke={pieceColor(p)}
                strokeWidth={S * 0.13}
                strokeLinecap="round"
                filter={fx}
              />
            );
          })();
          return (
            <g key={p.id} {...attrs}>
              {inner}
            </g>
          );
        })}

      {((state.data['traders-barbarians']?.camels as EdgeId[] | undefined) ?? []).map((e) => {
        const [a, b] = edgeEnds(e, g);
        const art = sprite(theme, 'camel', (a.x + b.x) / 2, (a.y + b.y) / 2 + S * 0.2, 0.42);
        if (art)
          return (
            <g key={`camel-${e}`} className="camel" filter="url(#lift)">
              {art}
              <title>Camel: a road here counts double</title>
            </g>
          );
        return (
          <text
            key={`camel-${e}`}
            x={(a.x + b.x) / 2}
            y={(a.y + b.y) / 2 + S * 0.1}
            textAnchor="middle"
            fontSize={S * 0.3}
            className="camel"
          >
            🐪<title>Camel: a road here counts double</title>
          </text>
        );
      })}

      {Object.entries(barbarians).map(([id, n]) => {
        const h = state.hexes[id as HexId];
        if (!h || n <= 0) return null;
        const c = hexToPixel(h.q, h.r, S);
        const band = sprite(theme, `barb${Math.min(n, 3)}`, c.x, c.y + S * 0.86, 0.5);
        if (band)
          return (
            <g key={`barb-${id}`} className="barbarians" filter="url(#lift)">
              {band}
              <title>
                {n} barbarian{n === 1 ? '' : 's'}
                {n >= 3 ? ': this hex is held' : ''}
              </title>
            </g>
          );
        return (
          <g key={`barb-${id}`} className="barbarians" filter="url(#lift)">
            <circle
              cx={c.x}
              cy={c.y + S * 0.52}
              r={S * 0.17}
              fill={n >= 3 ? '#7a1f12' : '#3b2a20'}
              stroke="#f1e3c8"
              strokeWidth={2}
            />
            <text
              x={c.x}
              y={c.y + S * 0.59}
              textAnchor="middle"
              fontSize={S * 0.2}
              fill="#f1e3c8"
              fontWeight={700}
              pointerEvents="none"
            >
              {n}
            </text>
            <title>
              {n} barbarian{n === 1 ? '' : 's'}
              {n >= 3 ? ': this hex is held' : ''}
            </title>
          </g>
        );
      })}

      {Object.entries(dragons).map(([id, n]) => {
        const h = state.hexes[id as HexId];
        if (!h || n <= 0) return null;
        const c = hexToPixel(h.q, h.r, S);
        const lair = h.type === 'desert';
        // A painted dragon curled beside the number disc, where the board has one.
        const drop = S * (theme.tokenDrop ?? 0);
        const painted = sprite(
          theme,
          'dragon1',
          c.x + S * (TOKEN_R + 0.12),
          c.y + drop + S * (TOKEN_R + 0.02),
          0.4,
          dragonTint(2),
          true,
        );
        // In the desert, a bigger dragon with the number of dragons beside it.
        const lairArt = lair
          ? sprite(theme, 'dragon1', c.x, c.y + S * 0.42, 0.6, dragonTint(2), true)
          : null;
        return (
          <g key={`dragon-${id}`} className="dragon" pointerEvents="none">
            {!lair && (
              <polygon
                className="hex-glow"
                points={hexPoints(h.q, h.r, 0.96)}
                fill="none"
                stroke={DRAGON_PINK}
                strokeWidth={S * 0.07}
                strokeLinejoin="round"
                filter="url(#glow)"
              />
            )}
            {!lair && painted ? (
              <g filter="url(#lift)">{painted}</g>
            ) : lairArt ? (
              <g filter="url(#lift)">
                {lairArt}
                <text
                  x={c.x + S * 0.22}
                  y={c.y + S * 0.36}
                  textAnchor="middle"
                  fontSize={S * 0.28}
                  fontWeight={800}
                  fill="#f6d27a"
                  stroke="#2a0a08"
                  strokeWidth={S * 0.06}
                  strokeLinejoin="round"
                  paintOrder="stroke"
                >
                  {n}
                </text>
              </g>
            ) : (
              <g filter="url(#lift)">
                <circle
                  cx={c.x}
                  cy={c.y + (lair ? 0 : S * 0.5)}
                  r={S * (lair ? 0.3 : 0.2)}
                  fill="#7a1a12"
                  stroke="#f6d27a"
                  strokeWidth={2}
                />
                <text
                  x={c.x}
                  y={c.y + (lair ? S * 0.02 : S * 0.5)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={S * (lair ? 0.3 : 0.22)}
                >
                  🐉
                </text>
                {lair && (
                  <text
                    x={c.x + S * 0.24}
                    y={c.y + S * 0.26}
                    textAnchor="middle"
                    fontSize={S * 0.2}
                    fontWeight={700}
                    fill="#f6d27a"
                    stroke="#3a0b07"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {n}
                  </text>
                )}
              </g>
            )}
            <title>
              {lair
                ? `${n} dragon${n === 1 ? '' : 's'} in the desert`
                : 'Dragon: this hex produces nothing'}
            </title>
          </g>
        );
      })}

      {pieces
        .filter((p) => p.type === 'road' && p.at.kind === 'edge')
        .map((p) => {
          const e = (p.at as { id: EdgeId }).id;
          const hs = g.edgeHexes.get(e) ?? [];
          if (hs.length !== 2 || !hs.every(dragonAt)) return null;
          const [a, b] = edgeEnds(e, g);
          const x = (a.x + b.x) / 2;
          const y = (a.y + b.y) / 2;
          return (
            <g key={`cut-${p.id}`} className="road-cut" pointerEvents="none">
              <path
                d={crossPattee(x, y, S * 0.19)}
                fill="#b3193a"
                stroke="#fff"
                strokeWidth={S * 0.07}
                strokeLinejoin="round"
                paintOrder="stroke"
              />
              <path
                d={crossPattee(x, y, S * 0.19)}
                fill="#b3193a"
                stroke="#4a0716"
                strokeWidth={S * 0.03}
                strokeLinejoin="round"
              />
              <title>Cut by dragons</title>
            </g>
          );
        })}

      {pieces
        .filter((p) => p.type === 'treasure' && p.at.kind === 'corner')
        .map((p) => {
          const corner = (p.at as { id: CornerId }).id;
          const c = cornerToPixel(corner, S);
          return (
            <g
              key={p.id}
              className="treasure"
              filter="url(#lift)"
              {...motionAttrs(p.id, `corner:${corner}`, c.x, c.y, { kind: 'treasure' })}
            >
              {sprite(theme, 'chest', c.x, c.y + S * 0.2, 0.42) ?? (
                <TreasureChest x={c.x} y={c.y} />
              )}
              <title>Treasure chest: build a road or ship here to open it</title>
            </g>
          );
        })}

      {hexes
        .filter((h) => h.props?.enchanted === true)
        .map((h) => (
          <polygon
            key={`ench-${h.id}`}
            className="enchanted hex-glow"
            points={hexPoints(h.q, h.r, 0.96)}
            fill="none"
            stroke="#ffe7a0"
            strokeWidth={S * 0.07}
            strokeLinejoin="round"
            filter="url(#glow)"
            pointerEvents="none"
          />
        ))}

      {pieces
        .filter((p) => p.type === 'dragon' && p.at.kind === 'corner')
        .map((p) => {
          const corner = (p.at as { id: CornerId }).id;
          const c = cornerToPixel(corner, S);
          const tier = Number(p.props.tier ?? 1);
          const r = S * 0.17;
          // A stronger dragon stands bigger, and its pips (the knight level it takes to beat it)
          // sit in a row under its feet.
          const art = sprite(
            theme,
            `dragon${tier}`,
            c.x,
            c.y + S * 0.3,
            [0.5, 0.62, 0.76][tier - 1] ?? 0.62,
            dragonTint(tier),
            true,
          );
          const pipY = art ? c.y + S * 0.38 : c.y + r + S * 0.05;
          const pipR = S * (art ? 0.045 : 0.03);
          return (
            <g
              key={p.id}
              className="dragon-piece"
              filter="url(#lift)"
              {...motionAttrs(p.id, `corner:${corner}`, c.x, c.y, { kind: 'dragon' })}
            >
              {art ?? (
                <Dragon
                  x={c.x}
                  y={c.y}
                  fill={tier === 3 ? '#3a0b07' : tier === 2 ? '#7a1a12' : '#a8452a'}
                />
              )}
              {Array.from({ length: tier }, (_, i) => (
                <circle
                  key={i}
                  cx={c.x + (i - (tier - 1) / 2) * pipR * 2.6}
                  cy={pipY}
                  r={pipR}
                  fill="#f6d27a"
                  stroke="#3a0b07"
                  strokeWidth={art ? 1.6 : 1}
                />
              ))}
              <title>
                {tier === 1
                  ? 'Dragon: any knight can beat it'
                  : tier === 2
                    ? 'Dragon: only a strong or mighty knight can beat it'
                    : 'Dragon: only a mighty knight can beat it'}
              </title>
            </g>
          );
        })}

      {(tb?.edgeBarbarians ?? []).map((e) => {
        const [a, b] = edgeEnds(e, g);
        const x = (a.x + b.x) / 2;
        const y = (a.y + b.y) / 2;
        return (
          <g
            key={`ebarb-${e}`}
            className="barbarians"
            filter="url(#lift)"
            {...motionAttrs(`ebarb-${e}`, `edge:${e}`, x, y)}
          >
            {sprite(theme, 'barb1', x, y + S * 0.2, 0.42) ?? (
              <>
                <circle
                  cx={x}
                  cy={y}
                  r={S * 0.17}
                  fill="#3b2a20"
                  stroke="#f1e3c8"
                  strokeWidth={2}
                />
                <text
                  x={x}
                  y={y + S * 0.07}
                  textAnchor="middle"
                  fontSize={S * 0.18}
                  pointerEvents="none"
                >
                  🪓
                </text>
              </>
            )}
            <title>Barbarian: blocks road building; wagons pay 2 more moves to pass</title>
          </g>
        );
      })}

      {Object.entries(tb?.wagons ?? {}).map(([seat, w], i) => {
        if (!w.corner) return null;
        const p = cornerToPixel(w.corner, S);
        const x = p.x + S * 0.22 + (i % 2) * S * 0.12;
        const y = p.y - S * 0.22 + Math.floor(i / 2) * S * 0.12;
        return (
          <g
            key={`wagon-${seat}`}
            className="wagon"
            filter="url(#lift)"
            {...motionAttrs(`wagon-${seat}`, `corner:${w.corner}`, x, y)}
          >
            {sprite(theme, 'wagon', x, y + S * 0.16, 0.4, color(Number(seat))) ?? (
              <>
                <rect
                  x={x - S * 0.15}
                  y={y - S * 0.11}
                  width={S * 0.3}
                  height={S * 0.18}
                  rx={S * 0.04}
                  fill={color(Number(seat))}
                  stroke={theme.outline}
                  strokeWidth={2}
                />
                <circle cx={x - S * 0.08} cy={y + S * 0.09} r={S * 0.05} fill={theme.outline} />
                <circle cx={x + S * 0.08} cy={y + S * 0.09} r={S * 0.05} fill={theme.outline} />
              </>
            )}
            <title>Wagon</title>
          </g>
        );
      })}

      {(tb?.knights ?? []).map((k) => {
        const [a, b] = edgeEnds(k.edge, g);
        const x = (a.x + b.x) / 2;
        const y = (a.y + b.y) / 2;
        const r = S * 0.16;
        return (
          <g
            key={`knight-${k.id}`}
            className="tb-knight"
            filter="url(#lift)"
            {...motionAttrs(`tbk-${k.id}`, `edge:${k.edge}`, x, y)}
          >
            <path
              d={`M${x - r},${y - r} h${2 * r} v${r * 0.9} q0,${r * 0.8} ${-r},${r * 1.2} q${-r},${-r * 0.4} ${-r},${-r * 1.2} z`}
              fill={color(k.owner)}
              stroke={theme.outline}
              strokeWidth={2}
            />
            <text
              x={x}
              y={y + r * 0.45}
              textAnchor="middle"
              fontSize={r * 1.3}
              fill="#fff"
              pointerEvents="none"
            >
              ♞
            </text>
            <title>Knight</title>
          </g>
        );
      })}

      {pirateHex?.kind === 'hex' &&
        (() => {
          const h = state.hexes[pirateHex.id];
          if (!h) return null;
          const c = hexToPixel(h.q, h.r, S);
          return (
            <g
              className="pirate"
              filter="url(#lift)"
              {...motionAttrs('pirate', `hex:${pirateHex.id}`, c.x, c.y)}
            >
              {sprite(theme, 'pirate', c.x, c.y + S * 0.36, 0.85) ?? (
                <PirateShip x={c.x} y={c.y} color={theme.pirate} ink={theme.outline} />
              )}
              <title>Pirate</title>
            </g>
          );
        })()}

      {robberHex?.kind === 'hex' &&
        (() => {
          const h = state.hexes[robberHex.id];
          if (!h) return null;
          const c = hexToPixel(h.q, h.r, S);
          const x = c.x + S * 0.42;
          const y = c.y + S * 0.1;
          return (
            <g
              className="robber"
              filter="url(#lift)"
              {...motionAttrs('robber', `hex:${robberHex.id}`, x, y)}
            >
              {theme.pieces?.robber ? (
                theme.pieces.robber({ x, y, s: S })
              ) : (
                /* A pale rim keeps the robber visible on the dimmed hex. */
                <g stroke={theme.landStroke} strokeWidth={1.5} strokeOpacity={0.85}>
                  <ellipse
                    cx={x}
                    cy={y + S * 0.2}
                    rx={S * 0.16}
                    ry={S * 0.07}
                    fill={theme.robber}
                  />
                  <path
                    d={`M${x - S * 0.13},${y + S * 0.2} Q${x - S * 0.15},${y - S * 0.1} ${x},${y - S * 0.12} Q${x + S * 0.15},${y - S * 0.1} ${x + S * 0.13},${y + S * 0.2} z`}
                    fill={theme.robber}
                  />
                  <circle cx={x} cy={y - S * 0.2} r={S * 0.1} fill={theme.robber} />
                </g>
              )}
              <title>Robber</title>
            </g>
          );
        })()}

      {buildingMarkers(state).map((m) => {
        const h = state.hexes[m.hex];
        if (!h) return null;
        // Between the city and the middle of the hex it stands on.
        const c = hexToPixel(h.q, h.r, S);
        const k = cornerToPixel(m.corner, S);
        const x = k.x + (c.x - k.x) * 0.42;
        const y = k.y + (c.y - k.y) * 0.42;
        const r = S * 0.13;
        const art = markerArt(theme, GWP_ICON[m.building], x, y, color(m.owner));
        if (art)
          return (
            <g
              key={m.key}
              className="gwp-building"
              filter="url(#lift)"
              {...motionAttrs(m.key, `gwp:${m.hex}:${m.corner}`, x, y)}
            >
              {art}
              <title>{m.label}</title>
            </g>
          );
        return (
          <g
            key={m.key}
            className="gwp-building"
            filter="url(#lift)"
            {...motionAttrs(m.key, `gwp:${m.hex}:${m.corner}`, x, y)}
          >
            <rect
              x={x - r}
              y={y - r}
              width={r * 2}
              height={r * 2}
              rx={r * 0.35}
              fill={color(m.owner)}
              stroke={theme.outline}
              strokeWidth={1.5}
            />
            <MarkerIcon
              theme={theme}
              icon={GWP_ICON[m.building]}
              x={x}
              y={y}
              r={r}
              fontSize={r * 1.2}
            />
            <title>{m.label}</title>
          </g>
        );
      })}

      {deedMarkers(state).map((m) => {
        const k = cornerToPixel(m.corner, S);
        const w = S * 0.3;
        const h = S * 0.14;
        const notch = w / 5;
        // A short wall with three merlons, in the owner's colour.
        const d = `M${k.x - w / 2},${k.y + h / 2} v${-h} h${notch} v${-h * 0.6} h${notch} v${h * 0.6} h${notch} v${-h * 0.6} h${notch} v${h * 0.6} h${notch} v${h} z`;
        return (
          <g key={`deed-${m.owner}`} className="gwp-deed" filter="url(#lift)">
            <circle
              cx={k.x}
              cy={k.y}
              r={S * 0.24}
              fill="none"
              stroke={color(m.owner)}
              strokeWidth={2}
              strokeDasharray="3 3"
            />
            <path d={d} fill={color(m.owner)} stroke={theme.outline} strokeWidth={1.2} />
            <title>Land Deed: this spot is held for its owner</title>
          </g>
        );
      })}

      {[
        ...seatMarkers(state),
        ...churchMarkers(state),
        ...witchesMarkers(state),
        ...sfCornerMarkers(state),
      ].map((m) => {
        const edge = m.at.startsWith('e:');
        if (edge && !g.edgeCorners.has(m.at as EdgeId)) return null;
        const [a, b] = edge ? edgeEnds(m.at as EdgeId, g) : [null, null];
        const k =
          a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : cornerToPixel(m.at as CornerId, S);
        // A Diocese or Citadel above its city, the Inquisitor to its right, a festival chip on the piece.
        const r = S * 0.15;
        const x = k.x + (m.slot === 1 ? S * 0.32 : 0);
        const y = k.y - (m.slot === 0 ? 0 : S * 0.34);
        const art = markerArt(theme, m.icon, x, y, m.owner === null ? undefined : color(m.owner));
        if (art)
          return (
            <g key={m.key} className="church-marker" pointerEvents="none" filter="url(#lift)">
              {art}
              <title>{m.title}</title>
            </g>
          );
        return (
          <g key={m.key} className="church-marker" pointerEvents="none" filter="url(#lift)">
            <circle
              cx={x}
              cy={y}
              r={r}
              fill={m.owner === null ? '#fbf3e2' : color(m.owner)}
              stroke={theme.outline}
              strokeWidth={1.5}
            />
            <MarkerIcon theme={theme} icon={m.icon} x={x} y={y} r={r} fontSize={r * 1.1} />
            <title>{m.title}</title>
          </g>
        );
      })}

      {[
        ...neutralMarkers(state),
        ...princesMarkers(state),
        ...soldiersMarkers(state),
        ...kingdomsMarkers(state),
        ...sfHexMarkers(state),
      ].map((m) => {
        const h = state.hexes[m.hex];
        if (!h) return null;
        const c = hexToPixel(h.q, h.r, S);
        const x = c.x + S * m.dx;
        const y = c.y + S * m.dy;
        const r = S * (m.owner === null ? 0.2 : 0.15);
        // A painted figure stands on its own, in the owner's colour, low beside the number
        // disc, clear of the land's picture at the top of the hex.
        const key = EMOJI_SPRITE[m.icon];
        const side = m.dx < 0 ? -1 : 1;
        const fx2 = c.x + side * S * 0.52;
        const fy2 = c.y + S * 0.62;
        const figure = key
          ? sprite(theme, key, fx2, fy2, 0.46, m.owner === null ? undefined : color(m.owner))
          : null;
        if (figure)
          return (
            <g
              key={m.id}
              className="gwp-neutral"
              filter="url(#lift)"
              {...motionAttrs(m.id, `hex:${m.hex}`, fx2, fy2)}
            >
              {figure}
              <title>{m.label}</title>
            </g>
          );
        return (
          <g
            key={m.id}
            className="gwp-neutral"
            filter="url(#lift)"
            {...motionAttrs(m.id, `hex:${m.hex}`, x, y)}
          >
            <circle
              cx={x}
              cy={y}
              r={r}
              fill={m.owner === null ? '#fbf3e2' : color(m.owner)}
              stroke={theme.outline}
              strokeWidth={2}
            />
            <MarkerIcon theme={theme} icon={m.icon} x={x} y={y} r={r} fontSize={r * 1.25} />
            <title>{m.label}</title>
          </g>
        );
      })}

      {landWaterVehicles(state, S).map((v) => {
        const r = S * 0.17;
        const art = markerArt(theme, v.icon, v.x, v.y, color(v.owner));
        if (art)
          return (
            <g
              key={v.id}
              className="lw-vehicle"
              filter="url(#lift)"
              pointerEvents="none"
              opacity={v.passive ? 0.55 : 1}
              {...motionAttrs(v.id, v.at, v.x, v.y)}
            >
              {art}
              <title>{v.title}</title>
            </g>
          );
        return (
          <g
            key={v.id}
            className="lw-vehicle"
            filter="url(#lift)"
            pointerEvents="none"
            opacity={v.passive ? 0.55 : 1}
            {...motionAttrs(v.id, v.at, v.x, v.y)}
          >
            <rect
              x={v.x - r}
              y={v.y - r}
              width={r * 2}
              height={r * 2}
              rx={r * 0.45}
              fill={color(v.owner)}
              stroke={theme.outline}
              strokeWidth={2}
              strokeDasharray={v.passive ? '3 2' : undefined}
            />
            <MarkerIcon theme={theme} icon={v.icon} x={v.x} y={v.y} r={r} fontSize={r * 1.2} />
            <title>{v.title}</title>
          </g>
        );
      })}

      {pieces
        .filter((p) => p.type === 'merchant' && p.at.kind === 'hex')
        .map((p) => {
          const h = state.hexes[(p.at as { id: HexId }).id];
          if (!h) return null;
          const c = hexToPixel(h.q, h.r, S);
          // Beside the number disc, wherever the board puts it.
          const drop = theme.tokenDrop ?? 0;
          const x = c.x - S * (drop ? 0.56 : 0.42);
          const y = c.y + S * (0.12 + drop);
          // A painted board's merchant figure stands beside the number disc, in its owner's colour.
          const art = sprite(theme, 'merchant', x, y + S * 0.24, 0.52, color(p.owner));
          if (art)
            return (
              <g
                key={p.id}
                className="merchant"
                filter={fx}
                {...motionAttrs(p.id, `hex:${h.id}`, x, y)}
              >
                {art}
                <title>Merchant</title>
              </g>
            );
          return (
            <g
              key={p.id}
              className="merchant"
              filter="url(#lift)"
              {...motionAttrs(p.id, `hex:${h.id}`, x, y)}
            >
              {/* A gold coin stamped M, rimmed in its owner's colour. */}
              <circle
                cx={x}
                cy={y}
                r={S * 0.17}
                fill={color(p.owner)}
                stroke={theme.outline}
                strokeWidth={1.5}
              />
              <circle
                cx={x}
                cy={y}
                r={S * 0.125}
                fill="#f2c230"
                stroke="#8a5a10"
                strokeWidth={1.4}
              />
              <text
                x={x}
                y={y + S * 0.055}
                textAnchor="middle"
                fontSize={S * 0.15}
                fontWeight={800}
                fill="#6b4507"
              >
                M
              </text>
              <title>Merchant</title>
            </g>
          );
        })}

      {pieces
        .filter(
          (p) =>
            p.at.kind === 'corner' &&
            p.type !== 'treasure' &&
            p.type !== 'dragon' &&
            // Soldiers & Armies' armies stand beside the corner, drawn below.
            p.type !== 'army' &&
            p.type !== 'nuke' &&
            // The Wizard shows as a marker beside its building.
            p.type !== 'wizard',
        )
        .map((p) => {
          const corner = (p.at as { id: CornerId }).id;
          const c = cornerToPixel(corner, S);
          const inner = (() => {
            const level = KNIGHT_LEVEL[p.type];
            if (level)
              return (
                <Knight
                  key={p.id}
                  x={c.x}
                  y={c.y}
                  color={color(p.owner)}
                  level={level}
                  active={p.props.active === true}
                  theme={theme}
                  fx={fx}
                />
              );
            // A painted city stands taller and wider than the drawn one and would hide walls
            // behind it, so on a painted board they are drawn in front, along its foot.
            const paintedHouse = theme.painted === true && !!theme.pieces?.house;
            const wallY = paintedHouse ? 0.14 : 0.08;
            const harborArt =
              p.type === 'harbor'
                ? sprite(theme, 'harbor', c.x, c.y + S * 0.2, 0.62, pieceColor(p))
                : null;
            const wallArt =
              p.props.wall === true || typeof p.props.walls === 'number'
                ? sprite(theme, 'wall', c.x, c.y + S * 0.34, 0.42)
                : null;
            const walls = wallArt ? (
              <g pointerEvents="none">
                {wallArt}
                <title>City wall</title>
              </g>
            ) : (
              <>
                {Array.from(
                  {
                    length:
                      typeof p.props.walls === 'number'
                        ? p.props.walls
                        : p.props.wall === true
                          ? 1
                          : 0,
                  },
                  (_, i) => (
                    <Battlement
                      key={`wall-${i}`}
                      x={c.x}
                      y={c.y + S * (wallY + i * 0.11)}
                      ink={theme.outline}
                    />
                  ),
                )}
                {(typeof p.props.walls === 'number' || p.props.wall === true) && (
                  <title>
                    {typeof p.props.walls === 'number'
                      ? `City walls: ${p.props.walls}`
                      : 'City wall'}
                  </title>
                )}
              </>
            );
            // A metropolis replaces the city with a tower in the player's colour, its emblem on
            // top in the track's own colour; a damaged city is drawn broken and dimmed.
            const metro = typeof p.props.metropolis === 'string' ? p.props.metropolis : null;
            const tower =
              p.type === 'city' && metro
                ? sprite(theme, `metro-tower-${metro}`, c.x, c.y + S * 0.2, 1.05, pieceColor(p))
                : null;
            const broken =
              p.type === 'city' && !tower && p.props.damaged === true
                ? sprite(theme, 'city-broken', c.x, c.y + S * 0.2, 0.84, pieceColor(p))
                : null;
            return (
              <g key={p.id} filter={fx} opacity={p.props.damaged === true ? 0.9 : 1}>
                {p.props.damaged === true && <title>Damaged in battle</title>}
                {!paintedHouse && walls}
                {(p.type === 'harbor' && harborArt) || tower || broken || (
                  <HouseShape
                    x={c.x}
                    y={c.y}
                    color={pieceColor(p)}
                    city={p.type === 'city'}
                    theme={theme}
                  />
                )}
                {paintedHouse && walls}
                {p.type === 'harbor' && harborArt && <title>Harbor settlement (2 points)</title>}
                {p.type === 'harbor' && !harborArt && (
                  <g pointerEvents="none">
                    <text
                      x={c.x}
                      y={c.y + S * 0.08}
                      textAnchor="middle"
                      fontSize={S * 0.22}
                      fontWeight={700}
                      fill="#fff"
                      stroke={theme.outline}
                      strokeWidth={0.8}
                    >
                      ⚓
                    </text>
                    <title>Harbor settlement (2 points)</title>
                  </g>
                )}
                {p.type === 'harbor' && (
                  <Cargo
                    theme={theme}
                    x={c.x + S * 0.3}
                    y={c.y - S * (theme.crateCargo ? 0 : 0.25)}
                    props={p.props}
                    crates={theme.crateCargo === true}
                  />
                )}
                {p.type === 'city' &&
                  p.props.citadel === true &&
                  sprite(theme, 'citadel', c.x + S * 0.34, c.y + S * 0.12, 0.46) !== null && (
                    <g pointerEvents="none">
                      {sprite(theme, 'citadel', c.x + S * 0.34, c.y + S * 0.12, 0.46)}
                      <title>Citadel (a point more)</title>
                    </g>
                  )}
                {p.type === 'city' &&
                  p.props.citadel === true &&
                  !sprite(theme, 'citadel', 0, 0, 1) && (
                    <g pointerEvents="none">
                      <path
                        d={`M${c.x + S * 0.12},${c.y - S * 0.14} v${-S * 0.26} h${S * 0.05} v${S * 0.05} h${S * 0.05} v${-S * 0.05} h${S * 0.05} v${S * 0.05} h${S * 0.05} v${-S * 0.05} h${S * 0.05} v${S * 0.26} Z`}
                        fill="#f2c14e"
                        stroke={theme.outline}
                        strokeWidth={1.6}
                        strokeLinejoin="round"
                      />
                      <title>Citadel (a point more)</title>
                    </g>
                  )}
                {metro && tower && (
                  <g pointerEvents="none">
                    {sprite(theme, `metro-emblem-${metro}`, c.x, c.y + S * 0.2, 1.05)}
                    <title>{`Metropolis (${metro})`}</title>
                  </g>
                )}
                {metro && !tower && (
                  <g>
                    <rect
                      x={c.x - S * 0.07}
                      y={c.y - S * (paintedHouse ? 0.64 : 0.42)}
                      width={S * 0.14}
                      height={S * 0.24}
                      fill={TRACK_COLOR[metro] ?? '#fff'}
                      stroke={theme.outline}
                      strokeWidth={2}
                    />
                    <title>{`Metropolis (${metro})`}</title>
                  </g>
                )}
              </g>
            );
          })();
          return (
            <g
              key={p.id}
              {...motionAttrs(p.id, `corner:${corner}`, c.x, c.y, { owner: p.owner, kind: p.type })}
            >
              {inner}
            </g>
          );
        })}

      {pieces
        .filter((p) => p.type === 'nuke' && p.at.kind === 'corner')
        .map((p) => {
          const corner = (p.at as { id: CornerId }).id;
          const c = cornerToPixel(corner, S);
          const x = c.x - S * 0.24;
          const y = c.y - S * 0.24;
          const art = sprite(theme, 'nuke', x, y + S * 0.22, 0.44, color(p.owner));
          if (art)
            return (
              <g key={p.id} filter={fx}>
                {art}
                <title>Nuke: once, on a field up to 6 away</title>
              </g>
            );
          return (
            <g key={p.id} filter={fx}>
              <circle
                cx={x}
                cy={y}
                r={S * 0.14}
                fill={color(p.owner)}
                stroke={theme.outline}
                strokeWidth={2}
              />
              <text x={x} y={y + S * 0.06} textAnchor="middle" fontSize={S * 0.17}>
                ☢️
              </text>
              <title>Nuke: once, on a field up to 6 away</title>
            </g>
          );
        })}

      {pieces
        .filter((p) => p.type === 'army' && p.at.kind === 'corner')
        .map((p) => {
          const corner = (p.at as { id: CornerId }).id;
          const c = cornerToPixel(corner, S);
          const x = c.x + S * 0.2;
          const y = c.y - S * 0.24;
          return (
            <g
              key={p.id}
              filter={fx}
              {...motionAttrs(p.id, `corner:${corner}`, x, y, { owner: p.owner, kind: p.type })}
            >
              {armyArt(theme, p, x, y, color(p.owner)) ?? (
                <ArmyFlag x={x} y={y} color={color(p.owner)} army={p} theme={theme} />
              )}
            </g>
          );
        })}

      {!!spotCount && (
        <g
          role="group"
          aria-label={`${spotCount} place${spotCount === 1 ? '' : 's'} to choose from. Arrow keys to move between them, Enter to choose.`}
          onKeyDown={onSpotKey}
        >
          {[...targets.hexes].map(([id, action], i) => {
            const h = state.hexes[id];
            if (!h) return null;
            return (
              <polygon
                key={`t-${id}`}
                className="target target-hex"
                points={hexPoints(h.q, h.r)}
                onClick={() => onAction(action)}
                role="button"
                tabIndex={keyIndex(`hex:${i}`)}
                data-spot={`hex:${i}`}
                aria-label={`${spotLabel(action)}: the ${h.type} hex`}
              />
            );
          })}
          {[...targets.edges].map(([id, action], i) => {
            const [a, b] = edgeEnds(id, g);
            return (
              <line
                key={`t-${id}`}
                className="target target-edge"
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                onClick={() => onAction(action)}
                role="button"
                tabIndex={keyIndex(`edge:${i}`)}
                data-spot={`edge:${i}`}
                aria-label={spotLabel(action)}
              />
            );
          })}
          {[...targets.corners].map(([id, action], i) => {
            const c = cornerToPixel(id, S);
            return (
              <circle
                key={`t-${id}`}
                className="target target-corner"
                cx={c.x}
                cy={c.y}
                r={S * 0.16}
                onClick={() => onAction(action)}
                role="button"
                tabIndex={keyIndex(`corner:${i}`)}
                data-spot={`corner:${i}`}
                aria-label={spotLabel(action)}
              />
            );
          })}
        </g>
      )}
    </svg>
  );
}

export const Board = memo(BoardImpl);
