import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { motionScale } from './motion.tsx';
import { Modal } from './Modal.tsx';
import { prefPicked } from '../theme/prefs.ts';

// ---- The chosen dice skin, per device ----

export const DICE_SKINS = [
  { id: 'classic', name: 'Classic' },
  { id: 'wood', name: 'Wood' },
  { id: 'marble', name: 'Marble' },
  { id: 'neon', name: 'Neon' },
  { id: 'numbers', name: 'Numbers' },
  { id: 'custom', name: 'Your own…' },
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

// ---- Your own dice: colours and faces ----

export const FACE_STYLES = [
  { id: 'pips', name: 'Pips' },
  { id: 'numbers', name: 'Numbers' },
  { id: 'symbols', name: 'Symbols' },
] as const;
export type FaceStyle = (typeof FACE_STYLES)[number]['id'];

export interface CustomDice {
  body: string;
  ink: string;
  style: FaceStyle;
  /** What each face shows with the symbols style, 1 to 6. */
  faces: string[];
}

export const DEFAULT_CUSTOM_DICE: CustomDice = {
  body: '#1f5f4a',
  ink: '#f6e7b8',
  style: 'pips',
  faces: ['🌲', '🧱', '🐑', '🌾', '🪨', '⭐'],
};

/** Longest symbol on a face, in UTF-16 units: room for one emoji with a modifier, or two letters. */
export const MAX_FACE = 8;
const HEX = /^#[0-9a-f]{6}$/i;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

/** A design read back from storage or the account; null when it doesn't hold together. */
export function parseCustomDice(raw: unknown): CustomDice | null {
  try {
    const d = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Partial<CustomDice> | null;
    if (!d || typeof d !== 'object') return null;
    if (typeof d.body !== 'string' || !HEX.test(d.body)) return null;
    if (typeof d.ink !== 'string' || !HEX.test(d.ink)) return null;
    if (!FACE_STYLES.some((f) => f.id === d.style)) return null;
    if (!Array.isArray(d.faces) || d.faces.length !== 6) return null;
    const faces = d.faces.map((f) => (typeof f === 'string' ? f.trim() : ''));
    if (faces.some((f) => f.length > MAX_FACE || CONTROL.test(f))) return null;
    return { body: d.body.toLowerCase(), ink: d.ink.toLowerCase(), style: d.style!, faces };
  } catch {
    return null;
  }
}

const CUSTOM_KEY = 'colonizers.diceCustom';

function readCustom(): CustomDice {
  try {
    return parseCustomDice(localStorage.getItem(CUSTOM_KEY)) ?? DEFAULT_CUSTOM_DICE;
  } catch {
    return DEFAULT_CUSTOM_DICE;
  }
}

let custom = readCustom();

export function setCustomDice(d: CustomDice): void {
  custom = d;
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(d));
  } catch {
    // Private mode: the design lasts until the page closes.
  }
  for (const l of listeners) l();
}

/** The design on this device (the default one until the player makes their own). */
export function customDice(): CustomDice {
  return custom;
}

function useCustomDice(): CustomDice {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => custom,
  );
}

/** The colours of a design, for the die's style. */
function customVars(d: CustomDice): CSSProperties {
  return { '--die-bg': d.body, '--die-pip': d.ink, '--die-ink': d.ink } as CSSProperties;
}

/** The dice skin picked on this device. */
export function dicePick(): DiceSkin {
  return current;
}

/** Takes a skin by id, ignoring ones this version doesn't have. */
export function isDiceSkin(id: string): id is DiceSkin {
  return DICE_SKINS.some((s) => s.id === id);
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
  const [designing, setDesigning] = useState(false);
  return (
    <>
      <label className="theme-picker" title="Dice skin">
        {compact ? <span aria-hidden="true">🎲</span> : 'Dice '}
        <select
          value={skin}
          onChange={(e) => {
            const id = e.target.value as DiceSkin;
            setDiceSkin(id);
            prefPicked({ dice: id });
            if (id === 'custom') setDesigning(true);
          }}
          aria-label="Dice skin"
        >
          {DICE_SKINS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {skin === 'custom' && (
          <button
            type="button"
            className="icon"
            onClick={() => setDesigning(true)}
            aria-label="Change your dice"
            title="Change your dice"
          >
            ✎
          </button>
        )}
      </label>
      {designing && <DiceDesigner onClose={() => setDesigning(false)} />}
    </>
  );
}

const SWATCHES: [string, string][] = [
  ['#1f5f4a', '#f6e7b8'],
  ['#fbfaf6', '#b3261e'],
  ['#1d2321', '#f1c40f'],
  ['#3b2a6b', '#ffffff'],
  ['#f4b6c2', '#4a1f2b'],
  ['#0e4c7a', '#ffd166'],
];

/** Make your own dice: colours, and pips, numbers or a symbol on each face. */
function DiceDesigner({ onClose }: { onClose: () => void }) {
  const [d, setD] = useState<CustomDice>(customDice);
  const change = (patch: Partial<CustomDice>) => setD((x) => ({ ...x, ...patch }));
  const save = () => {
    setCustomDice(d);
    setDiceSkin('custom');
    prefPicked({ dice: 'custom', diceFaces: JSON.stringify(d) });
    onClose();
  };
  return (
    <Modal title="Your own dice" onClose={onClose}>
      <div className="dice-designer">
        <div className="dice-preview" style={customVars(d)} aria-label="Preview">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="die-face flat">
              <FaceContent n={n} design={d} />
            </div>
          ))}
        </div>
        <div className="row">
          <label>
            Dice{' '}
            <input type="color" value={d.body} onChange={(e) => change({ body: e.target.value })} />
          </label>
          <label>
            Marks{' '}
            <input type="color" value={d.ink} onChange={(e) => change({ ink: e.target.value })} />
          </label>
          <span className="swatches">
            {SWATCHES.map(([body, ink]) => (
              <button
                key={body}
                type="button"
                className="swatch"
                style={{ background: body, color: ink }}
                aria-label={`Colours ${body} and ${ink}`}
                onClick={() => change({ body, ink })}
              >
                ●
              </button>
            ))}
          </span>
        </div>
        <div className="row" role="radiogroup" aria-label="Faces">
          {FACE_STYLES.map((f) => (
            <label key={f.id} className="toggle">
              <input
                type="radio"
                name="face-style"
                checked={d.style === f.id}
                onChange={() => change({ style: f.id })}
              />{' '}
              {f.name}
            </label>
          ))}
        </div>
        {d.style === 'symbols' && (
          <>
            <p className="muted">
              A symbol or two letters for each face. The number stays in the corner, so everyone can
              still read the roll.
            </p>
            <div className="face-inputs">
              {d.faces.map((f, i) => (
                <label key={i}>
                  {i + 1}
                  <input
                    value={f}
                    maxLength={MAX_FACE}
                    aria-label={`Face ${i + 1}`}
                    onChange={(e) => {
                      const faces = [...d.faces];
                      faces[i] = e.target.value;
                      change({ faces });
                    }}
                  />
                </label>
              ))}
            </div>
          </>
        )}
        <div className="row">
          <button type="button" className="primary" onClick={save}>
            Use these dice
          </button>
          <button type="button" className="ghost" onClick={() => setD(DEFAULT_CUSTOM_DICE)}>
            Start again
          </button>
        </div>
      </div>
    </Modal>
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

/** What a face shows: a label, a number, a symbol with its number, or pips. */
function FaceContent({
  n,
  label,
  numbers,
  design,
}: {
  n: number;
  label?: string | undefined;
  numbers?: boolean;
  design?: CustomDice | null;
}) {
  if (label !== undefined) return <span className="die-label">{label}</span>;
  const style = design?.style ?? (numbers ? 'numbers' : 'pips');
  if (style === 'numbers') return <span className="die-label">{n}</span>;
  const symbol = style === 'symbols' ? design?.faces[n - 1] : '';
  if (symbol)
    return (
      <>
        <span className="die-label">{symbol}</span>
        <span className="die-corner">{n}</span>
      </>
    );
  return (
    <div className="die-pips">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={PIPS[n]!.includes(i) ? 'pip' : 'pip off'} />
      ))}
    </div>
  );
}

function Face({
  n,
  label,
  numbers,
  design,
}: {
  n: number;
  label?: string;
  numbers: boolean;
  design: CustomDice | null;
}) {
  return (
    <div className="die-face" style={{ transform: `${FACE[n]!.place} translateZ(var(--half))` }}>
      <FaceContent n={n} label={label} numbers={numbers} design={design} />
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
  const design = useCustomDice();
  // Your own dice colour the plain dice; the coloured Cities & Knights dice keep theirs.
  const own = skin === 'custom' && kind !== 'red' && kind !== 'yellow' && kind !== 'event';
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
      style={own ? customVars(design) : undefined}
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
            design={own ? design : null}
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
  faces,
  children,
}: {
  dice: Record<string, unknown>;
  rollKey: string;
  icons: Record<string, string>;
  /** The event die's faces, when an expansion changes them. */
  faces?: readonly string[] | undefined;
  children?: ReactNode;
}) {
  const entries = Object.entries(dice);
  const eventFaces = faces ?? EVENT_FACES;
  return (
    <div className="dice" aria-label="Last roll">
      {entries.map(([name, d], i) => {
        if (typeof d === 'number' && d >= 1 && d <= 6)
          return <Die key={name} value={d} kind={name} rollKey={rollKey} index={i} />;
        if (typeof d === 'string' && eventFaces.includes(d)) {
          const rest = [...eventFaces];
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
