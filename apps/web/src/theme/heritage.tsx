import { cleanTheme, type Theme } from './clean.ts';
import { tilePatterns, type Palette } from './motifs.tsx';

/**
 * Heritage: the feel of a wooden board game, with our own art. Painted
 * tiles, turned-wood pieces, parchment cards and a walnut frame.
 * Every shape here is drawn in code for this project.
 */

const PAINT = {
  forest: '#4a6b2f',
  hills: '#a8552f',
  pasture: '#8cab4c',
  fields: '#d9a93c',
  mountains: '#7f7a73',
  desert: '#d8c08a',
  gold: '#c99a2e',
  volcano: '#5e2f24',
  lake: '#6b9cb8',
  fishingLake: '#5d93b3',
  swamp: '#6f7a4c',
  oasis: '#dcc27c',
  castle: '#a89a88',
  quarry: '#b5a48d',
  glassworks: '#94b2b2',
  hidden: '#6f6a5e',
};

// Painted versions of the printed tiles: earthier colours and a soft
// light-and-shade wash over each hex.
const PALETTE: Record<string, Palette> = {
  forest: { base: PAINT.forest, dark: '#2f4c1d', light: '#5b7d3a' },
  pasture: { base: PAINT.pasture, dark: '#3d3a33', light: '#f3efe2', accent: '#6b8a34' },
  fields: { base: PAINT.fields, dark: '#7a4f17', light: '#e8c065' },
  hills: { base: PAINT.hills, dark: '#6e2f17', light: '#d08a5e' },
  mountains: { base: PAINT.mountains, dark: '#4a4640', light: '#ece8df', accent: '#958f86' },
  desert: { base: PAINT.desert, dark: '#9c7f48', light: '#efe0b8' },
  gold: { base: PAINT.gold, dark: '#7a5a14', light: '#f7e08a' },
  volcano: { base: PAINT.volcano, dark: '#2e1611', light: '#b9a28c', accent: '#d2582a' },
  lake: { base: PAINT.lake, dark: '#3d6f8e', light: '#b8d4e2' },
  fishingLake: { base: PAINT.fishingLake, dark: '#2e5a75', light: '#b8d4e2' },
  swamp: { base: PAINT.swamp, dark: '#3f4628', light: '#97a368' },
  oasis: { base: PAINT.oasis, dark: '#3f5a25', light: '#efe0b8', accent: '#6b9cb8' },
  castle: { base: PAINT.castle, dark: '#4f4438', light: '#e9dfcf' },
  hidden: { base: PAINT.hidden, dark: '#4a463e', light: '#b5ae9f' },
  quarry: { base: PAINT.quarry, dark: '#4a4038', light: '#cfc4b2' },
  glassworks: { base: PAINT.glassworks, dark: '#2b3a36', light: '#d9eae4', accent: '#d2582a' },
};

const SEA: Palette = { base: '#3d6f8e', dark: '#2e5a75', light: '#4d7f9e', accent: '#7aa6c0' };

export const heritageTheme: Theme = {
  ...cleanTheme,
  id: 'heritage',
  name: 'Heritage',
  description: 'Painted land, wooden pieces and parchment, like a board game on the table.',
  terrain: { ...cleanTheme.terrain, ...PAINT },
  sea: '#3d6f8e',
  seaEdge: '#2e5a75',
  token: '#f3e6c4',
  tokenText: '#3b2a1a',
  tokenHot: '#9e2a1c',
  players: [
    { color: '#b8401f', shape: 'circle', name: 'Red' },
    { color: '#2c5e9e', shape: 'square', name: 'Blue' },
    { color: '#e0a526', shape: 'triangle', name: 'Ochre' },
    { color: '#3f7f4a', shape: 'diamond', name: 'Green' },
    { color: '#f2ead8', shape: 'star', name: 'Ivory' },
    { color: '#7a4a2a', shape: 'hexagon', name: 'Walnut' },
    { color: '#7b4f9e', shape: 'cross', name: 'Plum' },
    { color: '#4a4a4a', shape: 'pentagon', name: 'Slate' },
  ],
  outline: '#2b1d12',
  robber: '#3a2c22',
  pirate: '#1f1a17',
  landStroke: '#e9d9b0',
  harborWood: '#5b3a1f',
  harborFace: '#f3e6c4',
  harborText: '#3b2a1a',
  shadePieces: true,
  pieceEffect: 'lift',
  terrainIcons: false,
  hexShade: true,
  hexInset: undefined,
  patterns: () => tilePatterns(PALETTE, SEA),
  patterned: [...Object.keys(PALETTE), 'sea'],
  cards: {
    brick: '#b9643c',
    lumber: '#4f7535',
    wool: '#a3bf68',
    grain: '#e2b955',
    ore: '#8c877f',
    paper: '#efe2bd',
    cloth: '#b79bc9',
    coin: '#d9b44a',
  },
  ui: {
    '--bg': '#efe4cc',
    '--card': '#fbf4e3',
    '--text': '#2b1d12',
    '--muted': '#6e5a45',
    '--accent': '#7a3e1d',
    '--accent-text': '#fbf4e3',
    '--border': '#d6c29a',
    '--danger': '#9e2a1c',
    '--sea': '#3d6f8e',
    '--font': "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif",
  },
  boardBackground:
    'radial-gradient(circle at 50% 45%, #4d7f9e 0%, #2e5a75 70%), linear-gradient(#5b3a1f, #5b3a1f)',
};
