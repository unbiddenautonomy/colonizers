import type { ReactNode } from 'react';
import { woodBadge, woodEmblem } from './woodEmblems.tsx';
import type { Theme, ThemePieces } from './clean.ts';
import { pictureTilePatterns, type Palette, type PictureSet } from './motifs.tsx';
import { PALETTE as TILE_PALETTE, tilesTheme } from './tiles.tsx';
import { artFor } from './boards/art.ts';
import { paintedPieces } from './boards/kit.tsx';

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

// Nachi's wood sheets (Nov 2026): printed tiles for the rarer lands, an object per land, and
// the expansion pieces and markers. See scripts/cut-wood-sheets.py.
const WOOD_ART = artFor('wood');

/** The rarer lands' printed tiles (gold, volcano, lake …), by hex type. */
const WOOD_RARE: Record<string, string> = Object.fromEntries(
  Object.keys(TILE_PALETTE)
    .filter((t) => !(BASE_TYPES as readonly string[]).includes(t))
    .flatMap((t) => {
      const href = WOOD_ART[`tile-${t.toLowerCase()}`];
      return href ? [[t, href]] : [];
    }),
);

/** The object drawn on each land when the board shows resource icons, by hex type. */
const WOOD_ICONS: Record<string, string> = Object.fromEntries(
  Object.keys(TILE_PALETTE).flatMap((t) => {
    const href = WOOD_ART[`land-${t.toLowerCase()}`];
    return href ? [[t, href]] : [];
  }),
);

/** A building's owner-coloured part (a roof, a band), from its grey `-accent` layer. */
function accent(href: string, x: number, y: number, size: number, color: string): ReactNode {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  const k = (i: number) => (m ? (parseInt(m[i] ?? 'ff', 16) / 255) * 1.25 : 1);
  const [r, g, b] = [k(1), k(2), k(3)];
  const row = (k: number) => `${0.3 * k} ${0.59 * k} ${0.11 * k} 0 0`;
  const id = `wood-accent-${color.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <>
      <filter id={id} colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values={`${row(r)} ${row(g)} ${row(b)} 0 0 0 1 0`} />
      </filter>
      <image
        href={href}
        x={x - size / 2}
        y={y - size}
        width={size}
        height={size}
        preserveAspectRatio="xMidYMax meet"
        filter={`url(#${id})`}
      />
    </>
  );
}

/**
 * The sheet's pieces, with the metropolis emblems drawn as vectors, the stone buildings
 * (chapel, monument, tower, silo) wearing their owner's colour on a roof or band, and the
 * dragons kept in their own white and jade, never tinted.
 */
function woodPieces(rim: string): ThemePieces {
  const painted = paintedPieces(WOOD_ART, tilesTheme.pieces, rim);
  const sprite = painted.sprite;
  return {
    ...painted,
    sprite: (o) => {
      const metro = /^metro-emblem-(\w+)$/.exec(o.key);
      if (metro?.[1]) return woodEmblem(metro[1], o.x, o.y, o.size);
      const part = WOOD_ART[`${o.key}-accent`];
      const owner = o.owner ?? o.color;
      if (part) {
        const base = sprite?.({ key: o.key, x: o.x, y: o.y, size: o.size, s: o.s }) ?? null;
        return owner ? (
          <g>
            {base}
            {accent(part, o.x, o.y, o.size, owner)}
          </g>
        ) : (
          base
        );
      }
      return (
        sprite?.(/dragon/.test(o.key) ? { key: o.key, x: o.x, y: o.y, size: o.size, s: o.s } : o) ??
        null
      );
    },
  };
}

function woodBoard(icons: boolean): Theme {
  const set = pictures('wood', {
    href: '/tiles/wood/sea.webp',
    perHex: false,
    // The photo's waves repeat every 116×79 px at 110 px per hex radius;
    // the board uses 60, so one repeat is 63.3×43.1 board units.
    width: 63.27,
    height: 43.09,
  });
  const outline = '#1d2321';
  return pictureTheme(
    {
      ...tilesTheme,
      // One board in the picker; the icons are a setting on it (see landIcons.ts).
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
      pieces: woodPieces(tilesTheme.outline ?? outline),
      // Its houses are small, so roads run nearly to the corners to meet them.
      roadInset: 0.05,
      // Its towers are tall; kept smaller so they leave the harbour signs and numbers clear.
      metroScale: 0.7,
      harborReach: 0.8,
      metroBadge: woodBadge,
      // Walls are plain brown bars with raised ends, the city sitting in them like a cup.
      wallTint: '#8a5a34',
      ...(icons ? { tokenDrop: 0.25 } : {}),
    },
    { ...set, hexes: { ...set.hexes, ...WOOD_RARE }, ...(icons ? { icons: WOOD_ICONS } : {}) },
    TILE_PALETTE,
    WOOD_SEA,
  );
}

export const woodTheme = woodBoard(false);
export const woodIconsTheme = woodBoard(true);
