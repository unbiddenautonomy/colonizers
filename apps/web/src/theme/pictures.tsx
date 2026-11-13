import type { Theme } from './clean.ts';
import { pictureTilePatterns, type Palette, type PictureSet } from './motifs.tsx';
import { PALETTE as TILE_PALETTE, tilesTheme } from './tiles.tsx';

/**
 * Board themes built from tile pictures Nachi provided (see CREDITS.md).
 * Each picture set covers the seven base hexes; every other hex type uses
 * the drawn tiles from the Tiles theme so the board stays in one style.
 */

const BASE_TYPES = ['forest', 'hills', 'pasture', 'fields', 'mountains', 'desert'] as const;

function pictures(dir: string, sea: PictureSet['sea']): PictureSet {
  return {
    hexes: Object.fromEntries(BASE_TYPES.map((t) => [t, `/tiles/${dir}/${t}.webp`])),
    sea,
  };
}

function pictureTheme(
  base: Omit<Theme, 'patterns' | 'patterned'>,
  set: PictureSet,
  palettes: Record<string, Palette>,
  sea: Palette,
): Theme {
  return {
    ...base,
    patterns: () => pictureTilePatterns(set, palettes, sea),
    patterned: [...new Set([...Object.keys(palettes), ...Object.keys(set.hexes), 'sea'])],
  };
}

const CARDS = (c: Record<string, string>) => ({
  brick: c.hills!,
  lumber: c.forest!,
  wool: c.pasture!,
  grain: c.fields!,
  ore: c.mountains!,
});

// ---- Bold: flat colours and thick black outlines ----

const BOLD_COLOURS = {
  forest: '#1f8a2e',
  hills: '#7a2e0a',
  pasture: '#1f8f2a',
  fields: '#ff8a00',
  mountains: '#5a5a5a',
  desert: '#f6c46e',
};
const BOLD_SEA: Palette = { base: '#4a6fc4', dark: '#2b3f8a', light: '#6fa0dc', accent: '#9dc4ec' };

export const boldTheme = pictureTheme(
  {
    ...tilesTheme,
    id: 'bold',
    name: 'Bold',
    description: 'Flat colours with heavy black outlines.',
    terrain: { ...tilesTheme.terrain, ...BOLD_COLOURS },
    sea: BOLD_SEA.base,
    seaEdge: '#111111',
    landStroke: '#111111',
    landStrokeWidth: 6,
    cards: CARDS(BOLD_COLOURS),
    ui: { '--sea': BOLD_SEA.base },
    boardBackground: '#ffffff',
  },
  pictures('bold', { href: '/tiles/bold/sea.webp', perHex: true }),
  TILE_PALETTE,
  BOLD_SEA,
);

// ---- Mosaic: layered geometric tiles with pale grout ----

const MOSAIC_COLOURS = {
  forest: '#0e6b3a',
  hills: '#8e2f12',
  pasture: '#b7cf4c',
  fields: '#f2b041',
  mountains: '#8a8580',
  desert: '#c9704c',
};
const MOSAIC_SEA: Palette = {
  base: '#1f7fd1',
  dark: '#1d2f8a',
  light: '#3ca6e8',
  accent: '#7cc8f2',
};

export const mosaicTheme = pictureTheme(
  {
    ...tilesTheme,
    id: 'mosaic',
    name: 'Mosaic',
    description: 'Layered geometric tiles set in pale grout.',
    terrain: { ...tilesTheme.terrain, ...MOSAIC_COLOURS },
    sea: MOSAIC_SEA.base,
    seaEdge: '#e9e9e9',
    landStroke: '#efefef',
    landStrokeWidth: 6,
    outline: '#1d2321',
    cards: CARDS(MOSAIC_COLOURS),
    ui: { '--sea': MOSAIC_SEA.base },
    boardBackground: '#f4f4f2',
  },
  pictures('schenk', { href: '/tiles/schenk/sea.webp', perHex: true }),
  TILE_PALETTE,
  MOSAIC_SEA,
);

// ---- Wooden board: printed tiles on wood, from a photo ----

const WOOD_COLOURS = {
  forest: '#6f9a3c',
  hills: '#c0503a',
  pasture: '#7fae3e',
  fields: '#ef8a22',
  mountains: '#8a7566',
  desert: '#e8a838',
};
const WOOD_SEA: Palette = { base: '#2c6c7a', dark: '#24325a', light: '#3d8a94', accent: '#7cbab8' };

export const woodTheme = pictureTheme(
  {
    ...tilesTheme,
    id: 'wood',
    name: 'Wooden board',
    description: 'Printed tiles on a wooden board.',
    terrain: { ...tilesTheme.terrain, ...WOOD_COLOURS },
    sea: WOOD_SEA.base,
    seaEdge: '#1e2b2f',
    landStroke: '#2b1d12',
    landStrokeWidth: 2.5,
    shadePieces: true,
    hexShade: true,
    cards: CARDS(WOOD_COLOURS),
    ui: { '--sea': WOOD_SEA.base },
    boardBackground: 'radial-gradient(circle at 50% 40%, #a8743d 0%, #6b4422 75%)',
  },
  // The photo's waves repeat every 116×79 px at 110 px per hex radius;
  // the board uses 60, so one repeat is 63.3×43.1 board units.
  pictures('wood', { href: '/tiles/wood/sea.webp', perHex: false, width: 63.27, height: 43.09 }),
  TILE_PALETTE,
  WOOD_SEA,
);
