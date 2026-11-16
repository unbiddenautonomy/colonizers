import { useEffect, useSyncExternalStore } from 'react';
import { ISLAND_COAST, islandFrame } from './frames.ts';

/**
 * A look: how the screens around the game are dressed (home, setup, lobby, account, menus).
 * Board skins are separate (themes.tsx); each look names the board skin it starts with.
 */
export interface Look {
  id: string;
  /** The theme it belongs to; a theme can have several colour schemes or modes. */
  family: 'basicbench' | 'pop' | 'deco' | 'wonderland' | 'isles';
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
    /** A background pattern (a CSS image) for looks that have one. */
    motif?: string;
  };
  /** Shaped outlines for panels and cards (border-image sources), for looks that have them. */
  frames?: Frames;
}

export interface Frames {
  panel: string;
  card: string;
  picked: string;
  blocked: string;
  /** How far the drawing reaches past the panel's box. */
  outset: number;
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
    faint: '#8c98ad',
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
    faint: '#686680',
    accent: '#5a4afb',
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
    faint: '#795d6d',
    accent: '#bb2e60',
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
    faint: '#5c6f63',
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
    faint: '#9c91c9',
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

// ---- Grand Saloon: a 1930s ocean liner's first-class saloon ----
// Lacquer, gold leaf and stepped corners. Two schemes: Emerald Night and Ivory Deck.

// Bodoni for the titles and Jost (a Futura cut) for the rest: the pairing of 1930s liner posters.
const DECO_TYPE = {
  heading: "'Bodoni Moda', Didot, 'Bodoni 72', Georgia, serif",
  body: "Jost, Futura, 'Century Gothic', system-ui, sans-serif",
};

const emeraldNight: Look = {
  id: 'deco-emerald',
  family: 'deco',
  familyName: 'Grand Saloon',
  name: 'Emerald Night',
  dark: true,
  board: 'deco-emerald',
  tokens: {
    bg: '#07140f',
    card: '#0d231b',
    raised: '#12352a',
    sunk: '#0a1b15',
    text: '#f3ead2',
    soft: '#dfd3b2',
    muted: '#b9ad8c',
    faint: '#a1987c',
    accent: '#d4af5a',
    accentText: '#1a1406',
    border: '#3c5a49',
    dash: '#2c4a3c',
    good: '#4fb38c',
    bad: '#e0806f',
    ...DECO_TYPE,
    shadow: '0 18px 40px rgb(0 0 0 / 0.45)',
    ink: '#d4af5a',
    pop: '#f1d998',
    motif:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='60'%3E%3Cg fill='none' stroke='%23d4af5a' stroke-opacity='0.12' stroke-width='1'%3E%3Cpath d='M0 60 A60 60 0 0 1 60 0'/%3E%3Cpath d='M0 60 A45 45 0 0 1 45 15'/%3E%3Cpath d='M0 60 A30 30 0 0 1 30 30'/%3E%3Cpath d='M60 60 A60 60 0 0 1 120 0'/%3E%3Cpath d='M60 60 A45 45 0 0 1 105 15'/%3E%3Cpath d='M60 60 A30 30 0 0 1 90 30'/%3E%3C/g%3E%3C/svg%3E\")",
  },
};

const ivoryDeck: Look = {
  id: 'deco-ivory',
  family: 'deco',
  familyName: 'Grand Saloon',
  name: 'Ivory Deck',
  dark: false,
  board: 'deco-ivory',
  tokens: {
    bg: '#f4eedf',
    card: '#fffbf1',
    raised: '#f7efd9',
    sunk: '#fbf6ea',
    text: '#15212e',
    soft: '#2c3a48',
    muted: '#4c5866',
    faint: '#626b76',
    accent: '#14365c',
    accentText: '#f6e7b8',
    border: '#b99a52',
    dash: '#d9c99c',
    good: '#2f7a64',
    bad: '#a3352a',
    ...DECO_TYPE,
    shadow: '0 14px 30px rgb(21 33 46 / 0.12)',
    ink: '#a8873e',
    pop: '#14365c',
    motif:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='60'%3E%3Cg fill='none' stroke='%23a8873e' stroke-opacity='0.16' stroke-width='1'%3E%3Cpath d='M0 60 A60 60 0 0 1 60 0'/%3E%3Cpath d='M0 60 A45 45 0 0 1 45 15'/%3E%3Cpath d='M0 60 A30 30 0 0 1 30 30'/%3E%3Cpath d='M60 60 A60 60 0 0 1 120 0'/%3E%3Cpath d='M60 60 A45 45 0 0 1 105 15'/%3E%3Cpath d='M60 60 A30 30 0 0 1 90 30'/%3E%3C/g%3E%3C/svg%3E\")",
  },
};

// ---- Wonderland: a tea party behind the looking-glass ----

// Playfair for titles over Caslon text: the look of a Victorian storybook, both sturdy enough to read.
const WONDER_TYPE = {
  heading: "'Playfair Display', Georgia, serif",
  body: "'Libre Caslon Text', Georgia, serif",
};

const teaParty: Look = {
  id: 'wonder-tea',
  family: 'wonderland',
  familyName: 'Wonderland',
  name: 'Mad Tea Party',
  dark: false,
  board: 'wonder-tea',
  tokens: {
    bg: '#f6efe2',
    card: '#fffaf0',
    raised: '#fdeef0',
    sunk: '#fffdf8',
    text: '#1c1626',
    soft: '#352c42',
    muted: '#574d63',
    faint: '#71677c',
    accent: '#b3122e',
    accentText: '#fffaf0',
    border: '#1c1626',
    dash: '#cdbfa8',
    good: '#1f7f7a',
    bad: '#b3122e',
    ...WONDER_TYPE,
    shadow: '0 2px 0 #1c1626, 0 14px 28px rgb(28 22 38 / 0.14)',
    ink: '#1c1626',
    pop: '#6c3fa0',
    motif:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23f6efe2'/%3E%3Cpath d='M0 0h40v40H0zM40 40h40v40H40z' fill='%231c1626' fill-opacity='0.045'/%3E%3C/svg%3E\")",
  },
};

const lookingGlass: Look = {
  id: 'wonder-glass',
  family: 'wonderland',
  familyName: 'Wonderland',
  name: 'Through the Looking-Glass',
  dark: true,
  board: 'wonder-glass',
  tokens: {
    bg: '#17112a',
    card: '#221a3d',
    raised: '#2e2350',
    sunk: '#1b1432',
    text: '#f4ecff',
    soft: '#d9cdf2',
    muted: '#b6a8d6',
    faint: '#9a8bbe',
    accent: '#ff5d8f',
    accentText: '#1c0a14',
    border: '#d9cdf2',
    dash: '#463a6e',
    good: '#62d6c4',
    bad: '#ff5d8f',
    ...WONDER_TYPE,
    shadow: '0 2px 0 #0b0716, 0 18px 36px rgb(0 0 0 / 0.4)',
    ink: '#d9cdf2',
    pop: '#b48cff',
    motif:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%2317112a'/%3E%3Cpath d='M0 0h40v40H0zM40 40h40v40H40z' fill='%23b48cff' fill-opacity='0.06'/%3E%3C/svg%3E\")",
  },
};

// ---- Archipelago: every panel is an island on a sea chart ----
// The content keeps its rectangle; the coast around it, the depth lines and the pebble buttons don't.

const ISLE_TYPE = {
  heading: 'Fraunces, Georgia, serif',
  body: 'Manrope, system-ui, sans-serif',
};

function isles(
  id: string,
  name: string,
  dark: boolean,
  c: Omit<Look['tokens'], 'heading' | 'body'>,
  water: string,
): Look {
  const shore = c.ink ?? c.border;
  return {
    id: `isles-${id}`,
    family: 'isles',
    familyName: 'Archipelago',
    name,
    dark,
    board: `isles-${id}`,
    tokens: { ...ISLE_TYPE, ...c },
    frames: {
      panel: islandFrame({ land: c.card, shore, water }),
      card: islandFrame({ land: c.sunk, shore, water, width: 2.5, rings: 0 }),
      picked: islandFrame({ land: c.raised, shore: c.accent, water, width: 4, rings: 0 }),
      blocked: islandFrame({
        land: c.sunk,
        shore: c.faint,
        water,
        width: 2,
        dashed: true,
        rings: 0,
      }),
      outset: ISLAND_COAST,
    },
  };
}

const lagoon = isles(
  'lagoon',
  'Lagoon',
  false,
  {
    bg: '#c4e3df',
    card: '#fbf5e6',
    raised: '#fdebd2',
    sunk: '#fffaf0',
    text: '#17292a',
    soft: '#2b4142',
    muted: '#435a5a',
    faint: '#4e6465',
    accent: '#0d6662',
    accentText: '#fffaf0',
    border: '#17292a',
    dash: '#d9ceb4',
    good: '#2f7a46',
    bad: '#ad3b26',
    shadow: 'none',
    ink: '#17292a',
    pop: '#e07a3a',
    motif:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='40'%3E%3Cpath d='M0 26 q15 -8 30 0 t30 0 t30 0 t30 0' fill='none' stroke='%230d6662' stroke-opacity='0.09' stroke-width='1.4'/%3E%3C/svg%3E\")",
  },
  '#0d6662',
);

const nightTide = isles(
  'night',
  'Night Tide',
  true,
  {
    bg: '#0b1a24',
    card: '#17282c',
    raised: '#1f3438',
    sunk: '#132226',
    text: '#eef5f0',
    soft: '#cfe1da',
    muted: '#a9c2ba',
    faint: '#94aea6',
    accent: '#f0b65a',
    accentText: '#1b1203',
    border: '#cfe1da',
    dash: '#2b4247',
    good: '#79d3a4',
    bad: '#f08a72',
    shadow: 'none',
    ink: '#cfe1da',
    pop: '#6fcfc0',
    motif:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='40'%3E%3Cpath d='M0 26 q15 -8 30 0 t30 0 t30 0 t30 0' fill='none' stroke='%236fcfc0' stroke-opacity='0.08' stroke-width='1.4'/%3E%3C/svg%3E\")",
  },
  '#6fcfc0',
);

export const LOOKS: Look[] = [
  night,
  atelier,
  grape,
  sorbet,
  citrus,
  arcade,
  emeraldNight,
  ivoryDeck,
  teaParty,
  lookingGlass,
  lagoon,
  nightTide,
];

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

/** Near-black or white, whichever reads better on the colour. */
function readableOn(hex: string): string {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const l = 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
  return 1.05 / (l + 0.05) > (l + 0.05) / 0.0625 ? '#ffffff' : '#14121a';
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
    set('motif', t.motif ?? 'none');
    set('scheme', look.dark ? 'dark' : 'light');
    set('pop-text', readableOn(t.pop ?? t.accent));
    const fr = look.frames;
    set('frame', fr?.panel ?? 'none');
    set('frame-card', fr?.card ?? 'none');
    set('frame-picked', fr?.picked ?? 'none');
    set('frame-blocked', fr?.blocked ?? 'none');
    set('frame-outset', `${fr?.outset ?? 0}px`);
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
