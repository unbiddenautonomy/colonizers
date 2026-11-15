import { useEffect, useSyncExternalStore } from 'react';
import { setTheme } from './themes.tsx';

/**
 * A look: how the screens around the game are dressed (home, setup, lobby, account, menus).
 * Board skins are separate (themes.tsx); each look names the board skin it starts with.
 */
export interface Look {
  id: string;
  /** The theme it belongs to; a theme can have several colour schemes or modes. */
  family: 'basicbench' | 'pop' | 'atlas';
  familyName: string;
  /** The scheme or mode within the theme. */
  name: string;
  dark: boolean;
  /** The board skin this look starts with. */
  board: string;
  tokens: {
    bg: string;
    card: string;
    raised: string;
    sunk: string;
    text: string;
    soft: string;
    muted: string;
    faint: string;
    accent: string;
    accentText: string;
    border: string;
    dash: string;
    good: string;
    bad: string;
    heading: string;
    body: string;
    shadow: string;
    /** Outline colour for looks that draw pieces of the page with a pen. */
    ink?: string;
    /** A second accent. */
    pop?: string;
  };
}

const night: Look = {
  id: 'basicbench-dark',
  family: 'basicbench',
  familyName: 'BasicBench',
  name: 'Dark',
  dark: true,
  board: 'bench-dark',
  tokens: {
    bg: '#0b1422',
    card: '#13213a',
    raised: '#1b2e4f',
    sunk: '#0f1a2c',
    text: '#eaf0f8',
    soft: '#b9c4d6',
    muted: '#9aa8bf',
    faint: '#7d8aa1',
    accent: '#e8b04b',
    accentText: '#1a1406',
    border: '#22324f',
    dash: '#2a3b5c',
    good: '#5fb3b3',
    bad: '#ff8a80',
    heading: "'DM Serif Display', Georgia, serif",
    body: 'Inter, system-ui, sans-serif',
    shadow: '0 12px 40px rgb(0 0 0 / 0.25)',
  },
};

const atelier: Look = {
  id: 'basicbench-light',
  family: 'basicbench',
  familyName: 'BasicBench',
  name: 'Light',
  dark: false,
  board: 'bench-light',
  tokens: {
    bg: '#f5f0e6',
    card: '#ffffff',
    raised: '#eef5f1',
    sunk: '#fbf8f1',
    text: '#1f2624',
    soft: '#3a4240',
    muted: '#4f574f',
    faint: '#6e685c',
    accent: '#0f5e52',
    accentText: '#ffffff',
    border: '#e2d9c6',
    dash: '#cfc4ad',
    good: '#6e9f6a',
    bad: '#b3261e',
    heading: 'Fraunces, Georgia, serif',
    body: 'Manrope, system-ui, sans-serif',
    shadow: '0 8px 24px rgb(15 94 82 / 0.08)',
  },
};

const POP_TYPE = {
  heading: "'Space Grotesk', system-ui, sans-serif",
  body: 'Inter, system-ui, sans-serif',
};

/** Tabletop Pop: chunky outlines, offset shadows and bright flat colour, in four schemes. */
const grape: Look = {
  id: 'pop-grape',
  family: 'pop',
  familyName: 'Tabletop Pop',
  name: 'Grape Soda',
  dark: false,
  board: 'pop-grape',
  tokens: {
    bg: '#f3f1fa',
    card: '#ffffff',
    raised: '#ece9ff',
    sunk: '#ffffff',
    text: '#17152b',
    soft: '#3d3b55',
    muted: '#55536b',
    faint: '#6b6984',
    accent: '#5b4bff',
    accentText: '#ffffff',
    border: '#17152b',
    dash: '#c9c6dc',
    good: '#3fbf73',
    bad: '#d6304a',
    ...POP_TYPE,
    shadow: '6px 6px 0 #17152b',
    ink: '#17152b',
    pop: '#ffb547',
  },
};

const sorbet: Look = {
  id: 'pop-sorbet',
  family: 'pop',
  familyName: 'Tabletop Pop',
  name: 'Sorbet',
  dark: false,
  board: 'pop-sorbet',
  tokens: {
    bg: '#fff1ea',
    card: '#ffffff',
    raised: '#ffe0e6',
    sunk: '#fffaf7',
    text: '#2b1620',
    soft: '#4a2f3a',
    muted: '#6a4d58',
    faint: '#86697a',
    accent: '#d6336c',
    accentText: '#ffffff',
    border: '#2b1620',
    dash: '#e7c7cf',
    good: '#2fa58a',
    bad: '#b3261e',
    ...POP_TYPE,
    shadow: '6px 6px 0 #2b1620',
    ink: '#2b1620',
    pop: '#7fe0c5',
  },
};

const citrus: Look = {
  id: 'pop-citrus',
  family: 'pop',
  familyName: 'Tabletop Pop',
  name: 'Citrus Club',
  dark: false,
  board: 'pop-citrus',
  tokens: {
    bg: '#f4f8e4',
    card: '#ffffff',
    raised: '#e3f4d0',
    sunk: '#fbfdf3',
    text: '#14231c',
    soft: '#2f4338',
    muted: '#4b5f53',
    faint: '#66796d',
    accent: '#16795f',
    accentText: '#ffffff',
    border: '#14231c',
    dash: '#c7d6b4',
    good: '#16795f',
    bad: '#c2410c',
    ...POP_TYPE,
    shadow: '6px 6px 0 #14231c',
    ink: '#14231c',
    pop: '#ffd23f',
  },
};

const arcade: Look = {
  id: 'pop-arcade',
  family: 'pop',
  familyName: 'Tabletop Pop',
  name: 'Arcade Night',
  dark: true,
  board: 'pop-arcade',
  tokens: {
    bg: '#141029',
    card: '#221c46',
    raised: '#2f2760',
    sunk: '#1a1536',
    text: '#f6f2ff',
    soft: '#d6cff5',
    muted: '#b3a9e0',
    faint: '#9489c4',
    accent: '#ff5fb8',
    accentText: '#1a0b16',
    border: '#000000',
    dash: '#463c80',
    good: '#3df5d0',
    bad: '#ff7a7a',
    ...POP_TYPE,
    shadow: '6px 6px 0 #000000',
    ink: '#000000',
    pop: '#3df5d0',
  },
};

/** Atlas: an explorer's chart table. Parchment, sepia ink, wax-seal red, cut corners and stamps. */
const atlas: Look = {
  id: 'atlas',
  family: 'atlas',
  familyName: 'Atlas',
  name: 'Chart Table',
  dark: false,
  board: 'atlas',
  tokens: {
    bg: '#e9dcc0',
    card: '#f6eedb',
    raised: '#efe2c4',
    sunk: '#f9f3e4',
    text: '#2b2118',
    soft: '#45372a',
    muted: '#5e4d3b',
    faint: '#7a6750',
    accent: '#8c2f1e',
    accentText: '#fbf3e2',
    border: '#7a6750',
    dash: '#b9a582',
    good: '#3e7c74',
    bad: '#8c2f1e',
    heading: "'IM Fell English SC', 'IM Fell English', Georgia, serif",
    body: 'Spectral, Georgia, serif',
    shadow: '0 1px 0 #fff8 inset, 0 10px 24px rgb(60 40 20 / 0.18)',
    ink: '#2b2118',
    pop: '#c08a2e',
  },
};

export const LOOKS: Look[] = [night, atelier, grape, sorbet, citrus, arcade, atlas];

/** Picks that aren't a single look: BasicBench following the device's light or dark setting. */
export const AUTO = 'basicbench-auto';

export function lookById(id: string, prefersDark: boolean): Look {
  if (id === AUTO) return prefersDark ? night : atelier;
  return LOOKS.find((l) => l.id === id) ?? (prefersDark ? night : atelier);
}

// ---- The chosen look, per device (an admin can set one for everyone) ----

const KEY = 'colonizers.look';
const listeners = new Set<() => void>();

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? AUTO;
  } catch {
    return AUTO;
  }
}

let picked = read();
let forced: string | null = null;

const media =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
let prefersDark = media?.matches ?? false;
media?.addEventListener?.('change', (e) => {
  prefersDark = e.matches;
  for (const l of listeners) l();
});

function emit() {
  for (const l of listeners) l();
}

/** Picks a look, and the board skin made for it (players can still change the board after). */
export function setLook(id: string): void {
  picked = id;
  setTheme(lookById(id, prefersDark).board);
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Private mode: the choice lasts until the page closes.
  }
  emit();
}

/** An admin's look for everyone, or null to let each player choose. */
export function setForcedLook(id: string | null): void {
  forced = id;
  emit();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

const snapshot = () => `${forced ?? picked}|${prefersDark ? 1 : 0}`;

/** The look this device shows, and the raw pick (which may be "auto"). */
export function useLook(): { look: Look; pick: string; forced: boolean } {
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [pick, dark] = s.split('|') as [string, string];
  return { look: lookById(pick, dark === '1'), pick, forced: forced !== null };
}

/** Puts the look's tokens on the document as --shell-* properties. */
export function LookStyles() {
  const { look } = useLook();
  useEffect(() => {
    const root = document.documentElement;
    const t = look.tokens;
    const set = (k: string, v: string) => root.style.setProperty(`--shell-${k}`, v);
    set('bg', t.bg);
    set('card', t.card);
    set('raised', t.raised);
    set('sunk', t.sunk);
    set('text', t.text);
    set('soft', t.soft);
    set('muted', t.muted);
    set('faint', t.faint);
    set('accent', t.accent);
    set('accent-text', t.accentText);
    set('border', t.border);
    set('dash', t.dash);
    set('good', t.good);
    set('bad', t.bad);
    set('heading', t.heading);
    set('body', t.body);
    set('shadow', t.shadow);
    set('ink', t.ink ?? t.border);
    set('pop', t.pop ?? t.accent);
    set('scheme', look.dark ? 'dark' : 'light');
    root.dataset.look = look.family;
    root.dataset.lookId = look.id;
  }, [look]);
  return null;
}

/** The look picker: themes, then their schemes or modes. */
export function LookPicker() {
  const { pick, forced } = useLook();
  if (forced) return null;
  const families = [...new Set(LOOKS.map((l) => l.familyName))];
  return (
    <label className="theme-picker">
      Look{' '}
      <select value={pick} onChange={(e) => setLook(e.target.value)} aria-label="Look">
        {families.map((f) => (
          <optgroup key={f} label={f}>
            {f === 'BasicBench' && <option value={AUTO}>BasicBench · Match device</option>}
            {LOOKS.filter((l) => l.familyName === f).map((l) => (
              <option key={l.id} value={l.id}>
                {l.familyName} · {l.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
