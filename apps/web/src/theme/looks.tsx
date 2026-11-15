import { useEffect, useSyncExternalStore } from 'react';

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

export const LOOKS: Look[] = [night, atelier];

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

export function setLook(id: string): void {
  picked = id;
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
