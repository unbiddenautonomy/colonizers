import { cleanTheme, type Theme } from './clean.ts';
import { tilePatterns, type Palette } from './motifs.tsx';

/**
 * Tiles: bold, flat, screen-printed tiles with thick dark outlines, like a
 * wooden board with printed hexes. Zigzag mountains, round-canopy forest,
 * herringbone brick, wheat sprigs, sheep and scalloped sea.
 */

export const PALETTE: Record<string, Palette> = {
  forest: { base: '#3f8a3a', dark: '#24572a', light: '#57a248' },
  pasture: { base: '#86c04f', dark: '#2b2b2b', light: '#fbf6e9', accent: '#5f9c37' },
  fields: { base: '#f2952b', dark: '#a8501a', light: '#f7ad4c' },
  hills: { base: '#c9472f', dark: '#7d2417', light: '#f2a07a' },
  mountains: { base: '#8b9097', dark: '#3f434a', light: '#e9e6dc', accent: '#a7abb1' },
  desert: { base: '#efb443', dark: '#a8701d', light: '#fbe3a4' },
  gold: { base: '#e0a82a', dark: '#8a5a10', light: '#fff2b0' },
  volcano: { base: '#6a3328', dark: '#2b1612', light: '#c9b8a8', accent: '#ff7a2f' },
  lake: { base: '#4aa3d4', dark: '#2a6f9e', light: '#bfe6f7' },
  fishingLake: { base: '#3f97c9', dark: '#1f4f74', light: '#bfe6f7' },
  swamp: { base: '#6f8a4a', dark: '#3a4a24', light: '#a8c46a' },
  oasis: { base: '#ecc66f', dark: '#2f6b2a', light: '#f7e2a8', accent: '#4aa3d4' },
  castle: { base: '#b9ad9d', dark: '#4a4038', light: '#efe7da' },
  hidden: { base: '#7d8a96', dark: '#4a545e', light: '#c9d2da' },
  quarry: { base: '#a39a8c', dark: '#4f463c', light: '#d8d0c2' },
  glassworks: { base: '#5f9a9c', dark: '#24403f', light: '#d6f2f2', accent: '#ff8a3d' },
};

const SEA: Palette = { base: '#2a6f9e', dark: '#1d4f74', light: '#3f8fbf', accent: '#7cc0de' };

export const tilesTheme: Theme = {
  ...cleanTheme,
  id: 'tiles',
  name: 'Tiles',
  description: 'Bold printed tiles with thick outlines, like a wooden board.',
  terrain: {
    ...cleanTheme.terrain,
    ...Object.fromEntries(Object.entries(PALETTE).map(([k, p]) => [k, p.base])),
  },
  sea: SEA.base,
  seaEdge: SEA.dark,
  token: '#fbf6e9',
  tokenText: '#1d2321',
  tokenHot: '#c0392b',
  outline: '#1d2321',
  landStroke: '#1d2321',
  landStrokeWidth: 4,
  harborWood: '#5b3a1f',
  harborFace: '#fbf6e9',
  harborText: '#1d2321',
  terrainIcons: false,
  hexInset: undefined,
  patterns: () => tilePatterns(PALETTE, SEA),
  patterned: [...Object.keys(PALETTE), 'sea'],
  cards: {
    brick: PALETTE.hills!.base,
    lumber: PALETTE.forest!.base,
    wool: PALETTE.pasture!.base,
    grain: PALETTE.fields!.base,
    ore: PALETTE.mountains!.base,
  },
  ui: { '--sea': SEA.base },
  boardBackground: `radial-gradient(circle at 50% 45%, ${SEA.light} 0%, ${SEA.base} 55%, ${SEA.dark} 100%)`,
};
