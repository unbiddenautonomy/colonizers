import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { motionScale } from './motion.tsx';

// ---- The chosen dice skin, per device ----

export const DICE_SKINS = [
  { id: 'classic', name: 'Classic' },
  { id: 'wood', name: 'Wood' },
  { id: 'marble', name: 'Marble' },
  { id: 'neon', name: 'Neon' },
  { id: 'numbers', name: 'Numbers' },
] as const;
export type DiceSkin = (typeof DICE_SKINS)[number]['id'];

const KEY = 'colonizers.dice';
const listeners = new Set<() => void>();

function read(): DiceSkin {
  try {
    const v = localStorage.getItem(KEY);
    return DICE_SKINS.some((s) => s.id === v) ? (v as DiceSkin) : 'classic';
  } catch {
    return 'classic';
  }
}

let current = read();

export function setDiceSkin(id: DiceSkin): void {
  current = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Private mode: the choice lasts until the page closes.
  }
  for (const l of listeners) l();
}

export function useDiceSkin(): DiceSkin {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export function DicePicker({ compact }: { compact?: boolean }) {
  const skin = useDiceSkin();
  return (
    <label className="theme-picker" title="Dice skin">
      {compact ? <span aria-hidden="true">🎲</span> : 'Dice '}
      <select
        value={skin}
        onChange={(e) => setDiceSkin(e.target.value as DiceSkin)}
        aria-label="Dice skin"
      >
        {DICE_SKINS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

// ---- One die ----

/** Pip positions on a 3×3 grid (0 is top left, 8 bottom right). */
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/** Each face's place on the cube, and the turn that brings it to the front. */
const FACE: Record<number, { place: string; show: string }> = {
  1: { place: 'rotateY(0deg)', show: 'rotateX(0deg) rotateY(0deg)' },
  6: { place: 'rotateY(180deg)', show: 'rotateX(0deg) rotateY(-180deg)' },
  2: { place: 'rotateY(90deg)', show: 'rotateX(0deg) rotateY(-90deg)' },
  5: { place: 'rotateY(-90deg)', show: 'rotateX(0deg) rotateY(90deg)' },
  3: { place: 'rotateX(90deg)', show: 'rotateX(-90deg) rotateY(0deg)' },
  4: { place: 'rotateX(-90deg)', show: 'rotateX(90deg) rotateY(0deg)' },
};

function Face({ n, label, numbers }: { n: number; label?: string; numbers: boolean }) {
  const content = label ?? (numbers ? String(n) : null);
  return (
    <div className="die-face" style={{ transform: `${FACE[n]!.place} translateZ(var(--half))` }}>
      {content !== null ? (
        <span className="die-label">{content}</span>
      ) : (
        <div className="die-pips">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className={PIPS[n]!.includes(i) ? 'pip' : 'pip off'} />
          ))}
        </div>
      )}
    </div>
  );
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;

/**
 * A die as a small cube. When `rollKey` changes it is thrown in from a
 * random side, tumbling, and lands showing `value`. Faces can carry labels
 * (the Cities & Knights event die): the rolled label is put on the front face.
 */
export function Die({
  value,
  label,
  others,
  kind,
  rollKey,
  index,
}: {
  /** 1–6 for a numbered die. */
  value: number;
  /** Text for the rolled face, for dice without numbers. */
  label?: string;
  /** Labels for the other faces of a labelled die. */
  others?: string[];
  /** Colour class (red, yellow, event...). */
  kind: string;
  rollKey: string;
  index: number;
}) {
  const skin = useDiceSkin();
  const wrap = useRef<HTMLDivElement>(null);
  const cube = useRef<HTMLDivElement>(null);
  const seen = useRef(rollKey);
  const face = label !== undefined ? 1 : value;

  useEffect(() => {
    // Only a new roll is thrown; the roll already showing when the page opens just sits there.
    if (seen.current === rollKey) return;
    seen.current = rollKey;
    const w = wrap.current;
    const c = cube.current;
    const k = motionScale();
    if (!w || !c || k === 0) return;
    const dir = pick(['left', 'right', 'top', 'bottom'] as const);
    const dist = rand(160, 300);
    const side = rand(-90, 90);
    const [sx, sy] =
      dir === 'left'
        ? [-dist, side]
        : dir === 'right'
          ? [dist, side]
          : dir === 'top'
            ? [side, -dist]
            : [side, dist];
    const duration = rand(650, 950) * k;
    const delay = index * rand(40, 110) * k;
    // Two bounces on the way in, smaller each time.
    const hop = rand(18, 34);
    w.animate(
      [
        { transform: `translate(${sx}px, ${sy}px) scale(1.25)`, opacity: 0 },
        { offset: 0.15, opacity: 1 },
        {
          offset: 0.55,
          transform: `translate(${sx * 0.18}px, ${sy * 0.18 - hop}px) scale(1.1)`,
        },
        { offset: 0.75, transform: `translate(${sx * 0.04}px, 0px) scale(1)` },
        { offset: 0.87, transform: `translate(0px, ${-hop * 0.3}px) scale(1)` },
        { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
      ],
      { duration, delay, easing: 'cubic-bezier(.22,.7,.3,1)', fill: 'backwards' },
    );
    const turns = () => 360 * Math.round(rand(2, 4)) * pick([1, -1]);
    c.animate(
      [
        {
          transform: `rotateX(${turns() + rand(0, 90)}deg) rotateY(${turns() + rand(0, 90)}deg) rotateZ(${rand(-180, 180)}deg)`,
        },
        { transform: `${FACE[face]!.show} rotateZ(0deg)` },
      ],
      {
        duration: duration * 0.92,
        delay,
        easing: 'cubic-bezier(.15,.65,.25,1)',
        fill: 'backwards',
      },
    );
  }, [rollKey, face, index]);

  const labels = label !== undefined ? [label, ...(others ?? [])] : null;
  return (
    <div
      ref={wrap}
      className={`die3d die-${kind} skin-${skin}`}
      role="img"
      aria-label={label ?? String(value)}
    >
      <div
        ref={cube}
        className="die-cube"
        style={{ transform: `${FACE[face]!.show} rotateZ(0deg)` }}
      >
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <Face
            key={n}
            n={n}
            numbers={skin === 'numbers'}
            {...(labels && { label: labels[(n - 1) % labels.length] ?? '' })}
          />
        ))}
      </div>
    </div>
  );
}

/** Event die faces in Cities & Knights: three ships and one of each city gate. */
const EVENT_FACES = ['ship', 'ship', 'ship', 'science', 'trade', 'politics'];

/** The dice from the last roll, thrown in whenever a new roll comes. */
export function DiceTray({
  dice,
  rollKey,
  icons,
  children,
}: {
  dice: Record<string, unknown>;
  rollKey: string;
  icons: Record<string, string>;
  children?: ReactNode;
}) {
  const entries = Object.entries(dice);
  return (
    <div className="dice" aria-label="Last roll">
      {entries.map(([name, d], i) => {
        if (typeof d === 'number' && d >= 1 && d <= 6)
          return <Die key={name} value={d} kind={name} rollKey={rollKey} index={i} />;
        if (typeof d === 'string' && EVENT_FACES.includes(d)) {
          const rest = [...EVENT_FACES];
          rest.splice(rest.indexOf(d), 1);
          return (
            <Die
              key={name}
              value={1}
              label={icons[d] ?? d}
              others={rest.map((f) => icons[f] ?? f)}
              kind={name}
              rollKey={rollKey}
              index={i}
            />
          );
        }
        if (typeof d !== 'string' && typeof d !== 'number') return null;
        return (
          <span key={name} className={`die die-${name}`} title={name}>
            {typeof d === 'number' ? d : (icons[d] ?? d)}
          </span>
        );
      })}
      {children}
    </div>
  );
}
