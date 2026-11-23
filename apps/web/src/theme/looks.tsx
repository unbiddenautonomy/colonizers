import { useEffect, useSyncExternalStore } from 'react';
import { artFor } from './boards/art.ts';
import { ISLAND_COAST, islandFrame } from './frames.ts';
import { setTheme, THEMES, useTheme } from './themes.tsx';
import { prefPicked } from './prefs.ts';
import { fontUrl, loadFonts } from './fonts.ts';

/**
 * A look: how the screens around the game are dressed (home, setup, lobby, account, menus).
 * Board skins are separate (themes.tsx); each look names the board skin it starts with.
 */
export interface Look {
  id: string;
  /** The theme it belongs to; a theme can have several colour schemes or modes. */
  family:
    | 'basicbench'
    | 'pop'
    | 'deco'
    | 'wonderland'
    | 'isles'
    | 'sunrise'
    | 'masquerade'
    | 'chart'
    | 'strawhat'
    | 'heart'
    | 'bigmom'
    | 'wano'
    | 'navy'
    | 'casino'
    | 'clean';
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

/** How wavy an Archipelago panel's coast is: low enough to read as a card. */
const CALM = 0.4;

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
    // The coast is calmed and kept to one depth line, so a panel reads as a card with a soft
    // shore rather than a painted island sitting on top of the page.
    frames: {
      panel: islandFrame({ land: c.card, shore, water, width: 2, rings: 1, calm: CALM }),
      card: islandFrame({ land: c.sunk, shore, water, width: 2, rings: 0, calm: CALM }),
      picked: islandFrame({
        land: c.raised,
        shore: c.accent,
        water,
        width: 3,
        rings: 0,
        calm: CALM,
      }),
      blocked: islandFrame({
        land: c.sunk,
        shore: c.faint,
        water,
        width: 2,
        dashed: true,
        rings: 0,
        calm: CALM,
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

// ---- Sunrise Deck: a cartoon voyage on a scrubbed deck ----

const sunriseMorning: Look = {
  id: 'sunrise-morning',
  family: 'sunrise',
  familyName: 'Sunrise Deck',
  name: 'Morning',
  dark: false,
  board: 'sunrise-morning',
  tokens: {
    bg: '#efd9ae',
    card: '#fff8e6',
    raised: '#ffefc6',
    sunk: '#fbf0d6',
    text: '#1d2433',
    soft: '#2a3346',
    muted: '#3f4960',
    faint: '#4e566b',
    accent: '#b81f27',
    accentText: '#fff8e6',
    border: '#1d2433',
    dash: '#c9ad7e',
    good: '#2e7d4f',
    bad: '#b81f27',
    heading: "'Lilita One', 'Nunito', system-ui, sans-serif",
    body: "'Nunito', system-ui, sans-serif",
    shadow: '4px 5px 0 #1d2433',
    ink: '#1d2433',
    pop: '#e9b938',
    motif:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='60'%3E%3Cpath d='M119.5 0V60' stroke='%23c49a5e' stroke-opacity='0.6'/%3E%3Ccircle cx='112' cy='8' r='1.4' fill='%23a77a42' fill-opacity='0.45'/%3E%3Ccircle cx='112' cy='52' r='1.4' fill='%23a77a42' fill-opacity='0.45'/%3E%3C/svg%3E\")",
  },
};

// ---- Masquerade: the card table of a flamboyant underworld ----

const masqVelvet: Look = {
  id: 'masq-velvet',
  family: 'masquerade',
  familyName: 'Masquerade',
  name: 'Velvet',
  dark: true,
  board: 'masq-velvet',
  tokens: {
    bg: '#140b16',
    card: '#1f1422',
    raised: '#2c1a30',
    sunk: '#180e1b',
    text: '#fff0f6',
    soft: '#f3cfe0',
    muted: '#dcb3c8',
    faint: '#c79db3',
    accent: '#f2c14e',
    accentText: '#1a0510',
    border: '#d4a94a',
    dash: '#4a2a44',
    good: '#7fdcaa',
    bad: '#ff7a9c',
    heading: "'Bodoni Moda', Georgia, serif",
    body: "'DM Sans', system-ui, sans-serif",
    shadow: '0 18px 40px rgba(0, 0, 0, 0.45)',
    ink: '#d4a94a',
    pop: '#ff3e8a',
    motif:
      'repeating-linear-gradient(115deg, transparent 0 22px, rgba(255, 255, 255, 0.035) 22px 24px)',
  },
};

// ---- Storm Chart: a surveyor's chart table ----

const chartSurvey: Look = {
  id: 'chart-survey',
  family: 'chart',
  familyName: 'Storm Chart',
  name: 'Survey',
  dark: false,
  board: 'chart-survey',
  tokens: {
    bg: '#efe4c8',
    card: '#f6eed9',
    raised: '#fbf5e6',
    sunk: '#e9dcbc',
    text: '#1f2a44',
    soft: '#2a3655',
    muted: '#3c4766',
    faint: '#4a5470',
    accent: '#8e3a1f',
    accentText: '#f6eed9',
    border: '#1f2a44',
    dash: '#cdbd96',
    good: '#2f6f5f',
    bad: '#8e3a1f',
    heading: "'IM Fell English SC', 'IM Fell English', Georgia, serif",
    body: "'Spectral', Georgia, serif",
    shadow: 'none',
    ink: '#1f2a44',
    pop: '#2f7f73',
    motif:
      'repeating-linear-gradient(0deg, rgba(31, 42, 68, 0.06) 0 1px, transparent 1px 40px), repeating-linear-gradient(90deg, rgba(31, 42, 68, 0.06) 0 1px, transparent 1px 40px)',
  },
};

// ---- Grand Line: One Piece crews, each dressed for its own waters ----

/** A small SVG tile as a CSS background image. */
const motif = (w: number, h: number, body: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${body}</svg>`,
  )}")`;

const GRAND_LINE = 'Grand Line';

/** Straw Hats: a manga page, white paper with a dot screen, heavy ink and red and straw. */
const strawHat: Look = {
  id: 'strawhat-sunny',
  family: 'strawhat',
  familyName: GRAND_LINE,
  name: 'Straw Hat Pirates',
  dark: false,
  board: 'strawhat-sunny',
  tokens: {
    bg: '#f7f3ea',
    card: '#ffffff',
    raised: '#fff6d6',
    sunk: '#f3eee2',
    text: '#141414',
    soft: '#262626',
    muted: '#3a3a3a',
    faint: '#4a4a4a',
    accent: '#c81e1e',
    accentText: '#ffffff',
    border: '#141414',
    dash: '#bdb6a6',
    good: '#2e7d4f',
    bad: '#b3121f',
    heading: "'Bangers', 'Lilita One', system-ui, sans-serif",
    body: "'Nunito', system-ui, sans-serif",
    shadow: '0 8px 22px rgba(20, 20, 20, 0.14)',
    ink: '#141414',
    pop: '#f4c430',
    motif: motif(8, 8, "<circle cx='4' cy='4' r='1.1' fill='#141414' fill-opacity='0.07'/>"),
  },
};

/** Heart Pirates: inside the Polar Tang, riveted plates, brass and sonar blue. */
const heart: Look = {
  id: 'heart-polar',
  family: 'heart',
  familyName: GRAND_LINE,
  name: 'Heart Pirates',
  dark: true,
  board: 'heart-polar',
  tokens: {
    bg: '#0b1826',
    card: '#11243a',
    raised: '#17304c',
    sunk: '#0d1d30',
    text: '#eef6ff',
    soft: '#cfe0f0',
    muted: '#a9c0d6',
    faint: '#94adc4',
    accent: '#f6c744',
    accentText: '#14110a',
    border: '#2c4a6b',
    dash: '#2c4a6b',
    good: '#6fe0b0',
    bad: '#ff8a7a',
    heading: "'Russo One', system-ui, sans-serif",
    body: "'Barlow', system-ui, sans-serif",
    shadow: '0 14px 30px rgba(0, 0, 0, 0.45)',
    ink: '#f6c744',
    pop: '#6fe0ee',
    motif: motif(
      120,
      80,
      "<path d='M0 79.5H120M119.5 0V80' stroke='#6fe0ee' stroke-opacity='0.07'/><g fill='#6fe0ee' fill-opacity='0.12'><circle cx='6' cy='6' r='1.6'/><circle cx='113' cy='6' r='1.6'/><circle cx='6' cy='73' r='1.6'/><circle cx='113' cy='73' r='1.6'/></g>",
    ),
  },
};

/** Big Mom Pirates: Totto Land, strawberry icing and sprinkles. */
const bigMom: Look = {
  id: 'bigmom-cake',
  family: 'bigmom',
  familyName: GRAND_LINE,
  name: 'Big Mom Pirates',
  dark: false,
  board: 'bigmom-cake',
  tokens: {
    bg: '#ffe4ef',
    card: '#fffaf3',
    raised: '#fff0f6',
    sunk: '#fdeef2',
    text: '#3d2219',
    soft: '#4f2d22',
    muted: '#6a4337',
    faint: '#764c40',
    accent: '#b0174f',
    accentText: '#fffaf3',
    border: '#4a2a1f',
    dash: '#e7b8c9',
    good: '#2f7d63',
    bad: '#b0174f',
    heading: "'Chewy', 'Fredoka', system-ui, sans-serif",
    body: "'Fredoka', system-ui, sans-serif",
    shadow: '0 8px 22px rgba(74, 42, 31, 0.12)',
    ink: '#4a2a1f',
    pop: '#7fd6bd',
  },
};

/** Beasts Pirates: Wano, rice paper, sumi ink, vermilion and indigo wave scales. */
const wano: Look = {
  id: 'beasts-wano',
  family: 'wano',
  familyName: GRAND_LINE,
  name: 'Beasts Pirates (Wano)',
  dark: false,
  board: 'beasts-wano',
  tokens: {
    bg: '#efe6cf',
    card: '#f8f1de',
    raised: '#fffaf0',
    sunk: '#eadfc4',
    text: '#1b2233',
    soft: '#27304a',
    muted: '#3a4360',
    faint: '#4a526b',
    accent: '#b8321e',
    accentText: '#fff8ec',
    border: '#1b2233',
    dash: '#cbbd99',
    good: '#2f6b47',
    bad: '#b8321e',
    heading: "'Shippori Mincho B1', 'Noto Serif JP', Georgia, serif",
    body: "'Barlow', system-ui, sans-serif",
    shadow: 'none',
    ink: '#1b2233',
    pop: '#21406b',
    motif: motif(
      64,
      32,
      [
        [32, -16],
        [0, 0],
        [64, 0],
        [32, 16],
        [0, 32],
        [64, 32],
        [32, 48],
      ]
        .map(
          ([x, y]) =>
            `<g stroke='#21406b' stroke-opacity='0.06'><circle cx='${x}' cy='${y}' r='32' fill='#efe6cf'/><circle cx='${x}' cy='${y}' r='23' fill='none'/><circle cx='${x}' cy='${y}' r='14' fill='none'/><circle cx='${x}' cy='${y}' r='5' fill='none'/></g>`,
        )
        .join(''),
    ),
  },
};

/** The Navy: Marineford, white and Marine blue with gold braid. */
const navy: Look = {
  id: 'navy-marineford',
  family: 'navy',
  familyName: GRAND_LINE,
  name: 'The Navy',
  dark: false,
  board: 'navy-marineford',
  tokens: {
    bg: '#eef2f8',
    card: '#ffffff',
    raised: '#f6f9fd',
    sunk: '#e8eef7',
    text: '#14213d',
    soft: '#1f2e52',
    muted: '#33446a',
    faint: '#44557a',
    accent: '#1f4e9c',
    accentText: '#ffffff',
    border: '#14213d',
    dash: '#b8c4d8',
    good: '#2f7d58',
    bad: '#c0262d',
    heading: "'Oswald', system-ui, sans-serif",
    body: "'Barlow', system-ui, sans-serif",
    shadow: '0 2px 0 #14213d, 0 10px 24px rgba(20, 33, 61, 0.12)',
    ink: '#14213d',
    pop: '#d4a73a',
    motif: 'repeating-linear-gradient(90deg, rgba(20, 33, 61, 0.035) 0 1px, transparent 1px 28px)',
  },
};

/** Casino: felt green and burgundy lacquer under gold leaf. */
const casinoEmerald: Look = {
  id: 'casino-emerald',
  family: 'casino',
  familyName: 'Casino',
  name: 'Emerald & Burgundy',
  dark: true,
  board: 'casino-emerald',
  tokens: {
    bg: '#0b261c',
    card: '#123426',
    raised: '#173f2f',
    sunk: '#0e2c21',
    text: '#f3ead2',
    soft: '#e0d4b4',
    muted: '#c7b992',
    faint: '#b3a682',
    accent: '#d9b45f',
    accentText: '#1a1406',
    border: '#6e1f2b',
    dash: '#2f5446',
    good: '#56c194',
    bad: '#f08a7a',
    ...DECO_TYPE,
    shadow: '0 18px 40px rgb(0 0 0 / 0.45)',
    ink: '#d9b45f',
    pop: '#8e2433',
  },
};

/** Basic Clean: calm flat colours, navy ink, harbour teal and sand. */
const basicClean: Look = {
  id: 'clean-basic',
  family: 'clean',
  familyName: 'Basic Clean',
  name: 'Navy & Sand',
  dark: false,
  board: 'basic-clean',
  tokens: {
    bg: '#f4ede0',
    card: '#ffffff',
    raised: '#f9f5ec',
    sunk: '#efe7d6',
    text: '#1c2939',
    soft: '#2a3a4e',
    muted: '#3b4b5e',
    faint: '#4f5d6c',
    accent: '#305a66',
    accentText: '#ffffff',
    border: '#d8ccb4',
    dash: '#d9cbb0',
    good: '#2f7d58',
    bad: '#b3261e',
    heading: 'Fraunces, Georgia, serif',
    body: 'Manrope, system-ui, sans-serif',
    shadow: '0 8px 24px rgb(28 41 57 / 0.1)',
    ink: '#1c2939',
    pop: '#e2c38d',
  },
};

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
  sunriseMorning,
  masqVelvet,
  chartSurvey,
  strawHat,
  heart,
  bigMom,
  wano,
  navy,
  casinoEmerald,
  basicClean,
];

/** Picks that aren't a single look: BasicBench following the device's light or dark setting. */
export const AUTO = 'basicbench-auto';

/** What a device with no saved pick shows: Basic Clean. */
export const DEFAULT_LOOK = basicClean.id;

export function lookById(id: string, prefersDark: boolean): Look {
  if (id === AUTO) return prefersDark ? night : atelier;
  return LOOKS.find((l) => l.id === id) ?? basicClean;
}

// ---- The chosen look, per device (an admin can set one for everyone) ----

const KEY = 'colonizers.look';
const listeners = new Set<() => void>();

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? DEFAULT_LOOK;
  } catch {
    return DEFAULT_LOOK;
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
  const theme = useTheme();
  // The fonts this look and board need, fetched after the first draw rather
  // than every look's fonts before it.
  useEffect(() => {
    loadFonts(fontUrl([look.tokens.heading, look.tokens.body, theme.tokenFont]));
  }, [look, theme.tokenFont]);
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
    const backdrop = artFor(look.family).backdrop;
    set('backdrop', backdrop ? `url("${backdrop}")` : 'none');
    if (backdrop) root.dataset.backdrop = '';
    else delete root.dataset.backdrop;
    root.dataset.look = look.family;
    root.dataset.lookId = look.id;
  }, [look]);
  return null;
}

/** Picking a look also lays out its own board skin; the board can still be changed after. */
function pickLook(id: string): void {
  setLook(id);
  const board = lookById(id, prefersDark).board;
  const hasBoard = THEMES.some((t) => t.id === board);
  if (hasBoard) setTheme(board);
  prefPicked(hasBoard ? { look: id, board } : { look: id });
}

/** The look picked on this device (may be "auto"). */
export function lookPick(): string {
  return picked;
}

/** The look picker: themes, then their schemes or modes. */
export function LookPicker() {
  const { pick, forced } = useLook();
  if (forced) return null;
  const families = [...new Set(LOOKS.map((l) => l.familyName))];
  return (
    <label className="theme-picker">
      Look{' '}
      <select value={pick} onChange={(e) => pickLook(e.target.value)} aria-label="Look">
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
