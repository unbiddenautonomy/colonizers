import { useId, type ReactNode } from 'react';
import { WAGON_LEVELS } from '@colonizers/module-traders-barbarians';
import { CostLine } from './Cards.tsx';

/**
 * The five wagon cards for the Traders scenario, with our own drawn art: a
 * handcart grows into a merchant caravan as the day turns to dusk. The
 * numbers come straight from the engine's WAGON_LEVELS.
 */

export const WAGON_NAMES = [
  'Handcart',
  'Ox cart',
  'Covered wagon',
  'Team wagon',
  'Merchant caravan',
];

const SKY: [string, string, string][] = [
  // top, horizon, sun
  ['#a9dcf2', '#f4f0d6', '#fff2b0'],
  ['#94cdea', '#f6e3b0', '#ffe48a'],
  ['#e9b779', '#fbe6be', '#ffd36b'],
  ['#d9744a', '#f6c98e', '#ffc35a'],
  ['#5a3b78', '#e98a52', '#ffb04a'],
];
const HILLS: [string, string][] = [
  ['#9cc77f', '#77a85f'],
  ['#93bf75', '#6f9f57'],
  ['#a7b56a', '#7f9550'],
  ['#8d9a5a', '#667644'],
  ['#5d6b4a', '#434f37'],
];

const WOOD = '#7a4a26';
const DARK = '#3b2616';
const CANVAS = '#f3ead2';

function Wheel({ x, y, r }: { x: number; y: number; r: number }) {
  const spokes = [0, 45, 90, 135].map((a) => {
    const t = (a * Math.PI) / 180;
    const dx = Math.cos(t) * r;
    const dy = Math.sin(t) * r;
    return <line key={a} x1={x - dx} y1={y - dy} x2={x + dx} y2={y + dy} />;
  });
  return (
    <g stroke={DARK} strokeWidth={1.1}>
      {spokes}
      <circle cx={x} cy={y} r={r} fill="none" strokeWidth={2} />
      <circle cx={x} cy={y} r={1.6} fill={DARK} />
    </g>
  );
}

/** A draught animal facing left, standing on the ground at g. */
function Beast({ x, g, kind, fill }: { x: number; g: number; kind: 'ox' | 'horse'; fill: string }) {
  const legs = [-9, -5, 6, 10].map((dx) => (
    <line key={dx} x1={x + dx} y1={g - 11} x2={x + dx + (dx < 0 ? -1 : 1)} y2={g} />
  ));
  return (
    <g stroke={DARK} strokeWidth={1} fill={fill} strokeLinecap="round">
      <g strokeWidth={2.4}>{legs}</g>
      <path d={`M ${x + 12} ${g - 16} q 5 3 3 10`} fill="none" strokeWidth={1.4} />
      {kind === 'horse' ? (
        <>
          <ellipse cx={x} cy={g - 15} rx={13} ry={6} />
          <path
            d={`M ${x - 9} ${g - 19} L ${x - 16} ${g - 29} L ${x - 23} ${g - 25} L ${x - 20} ${g - 22} L ${x - 15} ${g - 22} L ${x - 11} ${g - 12} Z`}
          />
          <path d={`M ${x - 10} ${g - 21} L ${x - 15} ${g - 29}`} stroke={DARK} strokeWidth={2.2} />
        </>
      ) : (
        <>
          <ellipse cx={x} cy={g - 15} rx={14} ry={7.5} />
          <ellipse cx={x - 16} cy={g - 15} rx={5} ry={4.2} />
          <path
            d={`M ${x - 19} ${g - 18} q -3 -4 -1 -6 M ${x - 13} ${g - 18} q 3 -4 1 -6`}
            fill="none"
            stroke="#efe3c4"
            strokeWidth={1.6}
          />
        </>
      )}
    </g>
  );
}

function Crate({ x, y, s = 7 }: { x: number; y: number; s?: number }) {
  return (
    <g stroke={DARK} strokeWidth={0.8}>
      <rect x={x} y={y} width={s} height={s} fill="#c48a4c" />
      <path d={`M ${x} ${y} L ${x + s} ${y + s} M ${x + s} ${y} L ${x} ${y + s}`} />
    </g>
  );
}

function Sack({ x, y }: { x: number; y: number }) {
  return (
    <path
      d={`M ${x} ${y} q -1 -7 4 -8 l -1 -2 h 4 l -1 2 q 5 1 4 8 z`}
      fill="#e2cc95"
      stroke={DARK}
      strokeWidth={0.8}
    />
  );
}

/** A covered wagon whose front wheel is at x, standing on the ground at g. */
function CoveredWagon({
  x,
  g,
  w = 38,
  lantern,
}: {
  x: number;
  g: number;
  w?: number;
  lantern?: boolean;
}) {
  const bed = g - 15;
  return (
    <g>
      <path
        d={`M ${x - 2} ${bed} Q ${x + w / 2} ${bed - 30} ${x + w + 2} ${bed} Z`}
        fill={CANVAS}
        stroke={DARK}
        strokeWidth={1}
      />
      {[0.3, 0.5, 0.7].map((t) => (
        <path
          key={t}
          d={`M ${x - 2 + (w + 4) * t} ${bed} L ${x - 2 + (w + 4) * t} ${bed - 22 + Math.abs(t - 0.5) * 22}`}
          stroke="#c9b991"
          strokeWidth={0.8}
        />
      ))}
      <rect x={x - 3} y={bed} width={w + 6} height={6} fill={WOOD} stroke={DARK} strokeWidth={1} />
      {lantern && (
        <g>
          <line x1={x - 3} y1={bed} x2={x - 6} y2={bed - 8} stroke={DARK} strokeWidth={1} />
          <circle cx={x - 6} cy={bed - 6} r={2.2} fill="#ffd36b" stroke={DARK} strokeWidth={0.6} />
        </g>
      )}
      <Wheel x={x + 3} y={g - 6} r={6} />
      <Wheel x={x + w - 4} y={g - 8} r={8} />
    </g>
  );
}

function Pennant({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <line x1={x} y1={y} x2={x} y2={y - 16} stroke={DARK} strokeWidth={1.2} />
      <path
        d={`M ${x} ${y - 16} l 11 3 l -11 3 z`}
        fill="#c8392b"
        stroke={DARK}
        strokeWidth={0.6}
      />
    </g>
  );
}

function Scene({ level }: { level: number }): ReactNode {
  const g = 84;
  switch (level) {
    case 1:
      // A trader pulls a little handcart with a sack on it.
      return (
        <g>
          <g stroke={DARK} strokeWidth={1.6} strokeLinecap="round" fill="none">
            <circle cx={58} cy={58} r={3.4} fill="#e8c39e" strokeWidth={1} />
            <path d={`M 59 62 L 62 72 M 62 72 L 58 ${g} M 62 72 L 66 ${g} M 60 65 L 70 68`} />
          </g>
          <line x1={70} y1={68} x2={82} y2={70} stroke={DARK} strokeWidth={1.6} />
          <rect x={80} y={67} width={26} height={6} fill={WOOD} stroke={DARK} strokeWidth={1} />
          <Sack x={88} y={67} />
          <Crate x={98} y={60} />
          <Wheel x={93} y={g - 7} r={7} />
        </g>
      );
    case 2:
      // An ox hauls a small open cart of crates.
      return (
        <g>
          <Beast x={56} g={g} kind="ox" fill="#9a6b45" />
          <line x1={67} y1={g - 16} x2={84} y2={g - 16} stroke={DARK} strokeWidth={1.4} />
          <rect x={82} y={g - 20} width={34} height={7} fill={WOOD} stroke={DARK} strokeWidth={1} />
          <Crate x={86} y={g - 28} s={8} />
          <Crate x={95} y={g - 28} s={8} />
          <Sack x={106} y={g - 20} />
          <Wheel x={100} y={g - 8} r={8} />
        </g>
      );
    case 3:
      // A horse and a covered wagon.
      return (
        <g>
          <Beast x={50} g={g} kind="horse" fill="#8c5a36" />
          <line x1={61} y1={g - 17} x2={78} y2={g - 13} stroke={DARK} strokeWidth={1.4} />
          <CoveredWagon x={80} g={g} />
        </g>
      );
    case 4:
      // A pair of horses, a bigger wagon with a lantern and goods at the back.
      return (
        <g>
          <Beast x={44} g={g - 3} kind="horse" fill="#5d3b24" />
          <Beast x={50} g={g} kind="horse" fill="#a8744a" />
          <line x1={61} y1={g - 17} x2={74} y2={g - 13} stroke={DARK} strokeWidth={1.4} />
          <CoveredWagon x={76} g={g} w={44} lantern />
          <Crate x={122} y={g - 23} s={8} />
        </g>
      );
    default:
      // A merchant caravan under a pennant, with a chest of gold.
      return (
        <g>
          <Beast x={34} g={g - 3} kind="horse" fill="#5d3b24" />
          <Beast x={40} g={g} kind="horse" fill="#b07d50" />
          <line x1={51} y1={g - 17} x2={64} y2={g - 13} stroke={DARK} strokeWidth={1.4} />
          <CoveredWagon x={66} g={g} w={42} lantern />
          <Pennant x={87} y={g - 30} />
          <g stroke={DARK} strokeWidth={0.8}>
            <rect x={112} y={g - 10} width={14} height={9} fill="#8a5a2b" />
            <path d={`M 112 ${g - 10} q 7 -6 14 0`} fill="#a86e35" />
            <circle cx={115} cy={g - 13} r={2.2} fill="#f2c230" />
            <circle cx={120} cy={g - 14} r={2.2} fill="#f2c230" />
            <circle cx={124} cy={g - 12} r={2.2} fill="#f2c230" />
          </g>
        </g>
      );
  }
}

/** The picture at the top of a wagon card. */
export function WagonArt({ level }: { level: number }) {
  const id = useId().replace(/:/g, '');
  const i = Math.min(Math.max(level, 1), SKY.length) - 1;
  const [top, horizon, sun] = SKY[i]!;
  const [far, near] = HILLS[i]!;
  return (
    <svg className="wc-art" viewBox="0 0 160 100" aria-hidden="true">
      <defs>
        <linearGradient id={`sky${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="0.8" stopColor={horizon} />
        </linearGradient>
      </defs>
      <rect width="160" height="100" fill={`url(#sky${id})`} />
      <circle cx={126 - i * 6} cy={30 + i * 9} r={12} fill={sun} opacity={0.9} />
      <path d="M 0 66 Q 30 50 62 62 T 120 56 T 160 60 V 100 H 0 Z" fill={far} />
      <path d="M 0 78 Q 45 68 90 76 T 160 72 V 100 H 0 Z" fill={near} />
      <path d="M 0 90 Q 60 80 160 86 V 100 H 0 Z" fill="#d8bd8a" opacity={0.85} />
      <g transform="translate(-24 -19) scale(1.3)">
        <Scene level={i + 1} />
      </g>
    </svg>
  );
}

export type WagonCardState = 'done' | 'current' | 'next' | 'later';

export function WagonCard({ level, state }: { level: number; state?: WagonCardState }) {
  const l = WAGON_LEVELS[level - 1];
  if (!l) return null;
  const top = level === WAGON_LEVELS.length;
  return (
    <figure className={`wagon-card${state ? ` ${state}` : ''}`} aria-label={`Wagon level ${level}`}>
      <figcaption className="wc-head">
        <span className="wc-num">{level}</span>
        <span className="wc-name">{WAGON_NAMES[level - 1]}</span>
        {state === 'current' && <span className="wc-tag">Yours</span>}
      </figcaption>
      <WagonArt level={level} />
      <div className="wc-stats">
        <span title="Moves each turn">
          <b>{l.mp}</b> moves
        </span>
        <span title="Gold for each delivery">
          <b>{l.gold}</b> 🪙
        </span>
        <span title="Roll this or more to drive off a barbarian">
          {l.drive ? (
            <>
              🎲 <b>{l.drive === 6 ? '6' : `${l.drive}+`}</b>
            </>
          ) : (
            <span className="muted">no drive-off</span>
          )}
        </span>
        {top && (
          <span className="wc-vp" title="Worth a victory point">
            +1 ⭐
          </span>
        )}
      </div>
      <div className="wc-cost">
        {level === 1 ? (
          <span className="muted">Every trader starts here</span>
        ) : (
          <CostLine cost={l.cost} />
        )}
      </div>
    </figure>
  );
}

/** All five cards in a row, marking the player's level and the next one. */
export function WagonCardRow({ level }: { level: number }) {
  return (
    <div className="wagon-row">
      {WAGON_LEVELS.map((_, i) => {
        const n = i + 1;
        const state: WagonCardState =
          n < level ? 'done' : n === level ? 'current' : n === level + 1 ? 'next' : 'later';
        return <WagonCard key={n} level={n} state={state} />;
      })}
    </div>
  );
}
