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

// ---- Wooden board: printed tiles on wood, from a photo ----

const WOOD_COLOURS = {
  forest: '#4e7a2c',
  hills: '#c0503a',
  pasture: '#a2c95a',
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
