import { cleanTheme, type Theme } from './clean.ts';
import { tilePatterns, type Palette } from './motifs.tsx';

/**
 * One board skin for each look (theme/looks.tsx), drawn with the same printed-tile motifs as
 * Tiles but in the look's own colours, outlines and pieces. Player colours stay the
 * colourblind-safe set from Clean in every skin.
 */

type Base = 'forest' | 'pasture' | 'fields' | 'hills' | 'mountains' | 'desert';

interface SkinSpec {
  id: string;
  name: string;
  description: string;
  land: Record<Base, Palette>;
  /** Everything else (gold, lakes, castles...) as one base colour each, shaded automatically. */
  extra?: Partial<Record<string, string>>;
  sea: Palette;
  outline: string;
  stroke: number;
  token: string;
  tokenText: string;
  tokenHot: string;
  robber: string;
  harbor: [wood: string, face: string, text: string];
  effect: Theme['pieceEffect'];
  shade: boolean;
  /** Page colours on the game screen. */
  ui: Record<string, string>;
  background: string;
}

const EXTRA_BASE: Record<string, string> = {
  gold: '#e0a82a',
  volcano: '#6a3328',
  lake: '#4aa3d4',
  fishingLake: '#3f97c9',
  swamp: '#6f8a4a',
  oasis: '#ecc66f',
  castle: '#b9ad9d',
  hidden: '#7d8a96',
  quarry: '#a39a8c',
  glassworks: '#5f9a9c',
};

/** A darker and a lighter shade of a hex colour, for motifs. */
function shade(hex: string, by: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) =>
    Math.max(0, Math.min(255, Math.round(by < 0 ? v * (1 + by) : v + (255 - v) * by)));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function skin(s: SkinSpec): Theme {
  const extra = { ...EXTRA_BASE, ...s.extra } as Record<string, string>;
  const palette: Record<string, Palette> = {
    ...Object.fromEntries(
      Object.entries(extra).map(([k, c]) => [
        k,
        { base: c, dark: shade(c, -0.5), light: shade(c, 0.6), accent: shade(c, 0.25) },
      ]),
    ),
    ...s.land,
  };
  return {
    ...cleanTheme,
    id: s.id,
    name: s.name,
    description: s.description,
    terrain: {
      ...cleanTheme.terrain,
      ...Object.fromEntries(Object.entries(palette).map(([k, p]) => [k, p.base])),
    },
    sea: s.sea.base,
    seaEdge: s.sea.dark,
    token: s.token,
    tokenText: s.tokenText,
    tokenHot: s.tokenHot,
    outline: s.outline,
    robber: s.robber,
    landStroke: s.outline,
    landStrokeWidth: s.stroke,
    harborWood: s.harbor[0],
    harborFace: s.harbor[1],
    harborText: s.harbor[2],
    shadePieces: s.shade,
    hexShade: s.shade,
    pieceEffect: s.effect,
    terrainIcons: false,
    hexInset: undefined,
    patterns: () => tilePatterns(palette, s.sea),
    patterned: [...Object.keys(palette), 'sea'],
    cards: {
      brick: s.land.hills.base,
      lumber: s.land.forest.base,
      wool: s.land.pasture.base,
      grain: s.land.fields.base,
      ore: s.land.mountains.base,
    },
    ui: { '--sea': s.sea.base, ...s.ui },
    boardBackground: s.background,
  };
}

// ---- BasicBench ----

export const benchDarkSkin = skin({
  id: 'bench-dark',
  name: 'BasicBench Dark',
  description: 'Deep harbour blues, brass tokens and muted, lamp-lit land.',
  land: {
    forest: { base: '#2f6b4f', dark: '#173a2b', light: '#4f8f6c' },
    pasture: { base: '#6f9a58', dark: '#1f2b22', light: '#d9e4c8', accent: '#557d43' },
    fields: { base: '#c8963a', dark: '#6f4f17', light: '#e2b862' },
    hills: { base: '#a4503a', dark: '#5a2618', light: '#d48a6c' },
    mountains: { base: '#6c7686', dark: '#2c3340', light: '#c9d0da', accent: '#8a93a2' },
    desert: { base: '#c9ad78', dark: '#7d6538', light: '#e8d6ad' },
  },
  sea: { base: '#13304f', dark: '#0b1c33', light: '#1d4470', accent: '#3d6c9e' },
  outline: '#0b1422',
  stroke: 3,
  token: '#f3e6c4',
  tokenText: '#0b1422',
  tokenHot: '#b3261e',
  robber: '#0b1422',
  harbor: ['#6b4a26', '#f3e6c4', '#0b1422'],
  effect: 'lift',
  shade: true,
  ui: {
    '--bg': '#0b1422',
    '--card': '#13213a',
    '--text': '#eaf0f8',
    '--muted': '#9aa8bf',
    '--accent': '#e8b04b',
    '--accent-text': '#1a1406',
    '--border': '#22324f',
  },
  background: 'radial-gradient(circle at 50% 42%, #1d4470 0%, #13304f 55%, #0b1c33 100%)',
});

export const benchLightSkin = skin({
  id: 'bench-light',
  name: 'BasicBench Light',
  description: 'Soft paper colours and a calm green sea, like a printed atlas plate.',
  land: {
    forest: { base: '#4f8a63', dark: '#24513a', light: '#7fb08e' },
    pasture: { base: '#a9c98a', dark: '#2f3a2c', light: '#fbf8f1', accent: '#88ad68' },
    fields: { base: '#e6b85c', dark: '#9a7024', light: '#f2d38f' },
    hills: { base: '#c9765a', dark: '#7e3c27', light: '#ebb39b' },
    mountains: { base: '#a3a8a6', dark: '#4f5553', light: '#f3f1ec', accent: '#bcc0be' },
    desert: { base: '#ead9b0', dark: '#a68c55', light: '#f8efd9' },
  },
  sea: { base: '#5f9c95', dark: '#3d746e', light: '#86bab2', accent: '#b6dcd5' },
  outline: '#1f2624',
  stroke: 2.5,
  token: '#fffdf7',
  tokenText: '#1f2624',
  tokenHot: '#b3261e',
  robber: '#1f2624',
  harbor: ['#7b5b3a', '#fffdf7', '#1f2624'],
  effect: 'lift',
  shade: false,
  ui: {
    '--bg': '#f5f0e6',
    '--card': '#ffffff',
    '--text': '#1f2624',
    '--muted': '#4f574f',
    '--accent': '#0f5e52',
    '--accent-text': '#ffffff',
    '--border': '#e2d9c6',
  },
  background: 'radial-gradient(circle at 50% 42%, #86bab2 0%, #5f9c95 60%, #3d746e 100%)',
});

// ---- Tabletop Pop ----

const popUi = (bg: string, card: string, text: string, accent: string, accentText: string) => ({
  '--bg': bg,
  '--card': card,
  '--text': text,
  '--muted': text + 'b3',
  '--accent': accent,
  '--accent-text': accentText,
  '--border': text,
});

export const popGrapeSkin = skin({
  id: 'pop-grape',
  name: 'Pop · Grape Soda',
  description: 'Candy-bright tiles with thick ink outlines on a violet sea.',
  land: {
    forest: { base: '#2fae6b', dark: '#17152b', light: '#7fe0a8' },
    pasture: { base: '#9be564', dark: '#17152b', light: '#ffffff', accent: '#6fcf3f' },
    fields: { base: '#ffb547', dark: '#17152b', light: '#ffd58f' },
    hills: { base: '#ff6b5b', dark: '#17152b', light: '#ffb0a6' },
    mountains: { base: '#a9a4c9', dark: '#17152b', light: '#ffffff', accent: '#c9c6e6' },
    desert: { base: '#ffe3a3', dark: '#17152b', light: '#fff4d6' },
  },
  sea: { base: '#5b4bff', dark: '#3f30d6', light: '#7b6dff', accent: '#b9b1ff' },
  outline: '#17152b',
  stroke: 4,
  token: '#ffffff',
  tokenText: '#17152b',
  tokenHot: '#ff3d71',
  robber: '#17152b',
  harbor: ['#17152b', '#ffffff', '#17152b'],
  effect: 'lift',
  shade: false,
  ui: popUi('#f3f1fa', '#ffffff', '#17152b', '#5b4bff', '#ffffff'),
  background: 'radial-gradient(circle at 50% 42%, #7b6dff 0%, #5b4bff 60%, #3f30d6 100%)',
});

export const popSorbetSkin = skin({
  id: 'pop-sorbet',
  name: 'Pop · Sorbet',
  description: 'Pastel scoops of land with chocolate outlines on a mint sea.',
  land: {
    forest: { base: '#3fb68b', dark: '#2b1620', light: '#8fe0c2' },
    pasture: { base: '#c4ec9a', dark: '#2b1620', light: '#ffffff', accent: '#a3d87a' },
    fields: { base: '#ffcf70', dark: '#2b1620', light: '#ffe6b0' },
    hills: { base: '#ff8a8a', dark: '#2b1620', light: '#ffc4c4' },
    mountains: { base: '#c9b3d9', dark: '#2b1620', light: '#ffffff', accent: '#e0d0ea' },
    desert: { base: '#ffe9cf', dark: '#2b1620', light: '#fff6ea' },
  },
  sea: { base: '#7fe0c5', dark: '#3fb59a', light: '#a8eedb', accent: '#e0fbf3' },
  outline: '#2b1620',
  stroke: 4,
  token: '#fffaf7',
  tokenText: '#2b1620',
  tokenHot: '#d6336c',
  robber: '#2b1620',
  harbor: ['#2b1620', '#fffaf7', '#2b1620'],
  effect: 'lift',
  shade: false,
  ui: popUi('#fff1ea', '#ffffff', '#2b1620', '#d6336c', '#ffffff'),
  background: 'radial-gradient(circle at 50% 42%, #a8eedb 0%, #7fe0c5 60%, #3fb59a 100%)',
});

export const popCitrusSkin = skin({
  id: 'pop-citrus',
  name: 'Pop · Citrus Club',
  description: 'Zesty limes and lemons with bottle-green outlines on a teal sea.',
  land: {
    forest: { base: '#16795f', dark: '#14231c', light: '#4fb08f' },
    pasture: { base: '#b5e550', dark: '#14231c', light: '#ffffff', accent: '#93cc2f' },
    fields: { base: '#ffd23f', dark: '#14231c', light: '#ffe68a' },
    hills: { base: '#ff8a3d', dark: '#14231c', light: '#ffbf8f' },
    mountains: { base: '#9fb0a6', dark: '#14231c', light: '#ffffff', accent: '#c3d0c8' },
    desert: { base: '#f4ecc4', dark: '#14231c', light: '#fbf7e3' },
  },
  sea: { base: '#2aa3a3', dark: '#177a7a', light: '#55c2c2', accent: '#b8ecec' },
  outline: '#14231c',
  stroke: 4,
  token: '#fbfdf3',
  tokenText: '#14231c',
  tokenHot: '#c2410c',
  robber: '#14231c',
  harbor: ['#14231c', '#fbfdf3', '#14231c'],
  effect: 'lift',
  shade: false,
  ui: popUi('#f4f8e4', '#ffffff', '#14231c', '#16795f', '#ffffff'),
  background: 'radial-gradient(circle at 50% 42%, #55c2c2 0%, #2aa3a3 60%, #177a7a 100%)',
});

export const popArcadeSkin = skin({
  id: 'pop-arcade',
  name: 'Pop · Arcade Night',
  description: 'Neon land on a midnight grid, with glowing pieces.',
  land: {
    forest: { base: '#1fbf8f', dark: '#000000', light: '#3df5d0' },
    pasture: { base: '#8ef05a', dark: '#000000', light: '#f6f2ff', accent: '#5fd12f' },
    fields: { base: '#ffd23f', dark: '#000000', light: '#fff09a' },
    hills: { base: '#ff5fb8', dark: '#000000', light: '#ffa6d8' },
    mountains: { base: '#8f86d9', dark: '#000000', light: '#e0dbff', accent: '#b0a8ee' },
    desert: { base: '#e8c9ff', dark: '#000000', light: '#f6ecff' },
  },
  sea: { base: '#221c46', dark: '#141029', light: '#2f2760', accent: '#5a4fa8' },
  outline: '#000000',
  stroke: 4,
  token: '#f6f2ff',
  tokenText: '#141029',
  tokenHot: '#ff3d71',
  robber: '#000000',
  harbor: ['#000000', '#f6f2ff', '#141029'],
  effect: 'glow',
  shade: false,
  ui: popUi('#141029', '#221c46', '#f6f2ff', '#ff5fb8', '#1a0b16'),
  background: 'radial-gradient(circle at 50% 42%, #2f2760 0%, #221c46 55%, #141029 100%)',
});

// ---- Atlas ----

export const atlasSkin = skin({
  id: 'atlas',
  name: 'Atlas',
  description: 'A hand-tinted sea chart: washed inks on parchment, sepia outlines.',
  land: {
    forest: { base: '#6f8a5a', dark: '#2b2118', light: '#9fb18a' },
    pasture: { base: '#b5bf86', dark: '#2b2118', light: '#f6eedb', accent: '#9aa56c' },
    fields: { base: '#d9b46a', dark: '#2b2118', light: '#ead09a' },
    hills: { base: '#b9704f', dark: '#2b2118', light: '#d9a589' },
    mountains: { base: '#9a9184', dark: '#2b2118', light: '#f6eedb', accent: '#b5ad9f' },
    desert: { base: '#e6d3a8', dark: '#2b2118', light: '#f3e8cc' },
  },
  extra: { gold: '#c08a2e', lake: '#8fb3b0', fishingLake: '#7fa6a3', hidden: '#b9a582' },
  sea: { base: '#9fbcb4', dark: '#6f948b', light: '#bdd3cc', accent: '#e3ede8' },
  outline: '#2b2118',
  stroke: 2,
  token: '#f6eedb',
  tokenText: '#2b2118',
  tokenHot: '#8c2f1e',
  robber: '#2b2118',
  harbor: ['#5e4d3b', '#f6eedb', '#2b2118'],
  effect: 'lift',
  shade: true,
  ui: {
    '--bg': '#e9dcc0',
    '--card': '#f6eedb',
    '--text': '#2b2118',
    '--muted': '#5e4d3b',
    '--accent': '#8c2f1e',
    '--accent-text': '#fbf3e2',
    '--border': '#b9a582',
  },
  background: 'radial-gradient(circle at 50% 42%, #bdd3cc 0%, #9fbcb4 60%, #6f948b 100%)',
});

export const LOOK_SKINS: Theme[] = [
  benchDarkSkin,
  benchLightSkin,
  popGrapeSkin,
  popSorbetSkin,
  popCitrusSkin,
  popArcadeSkin,
  atlasSkin,
];
