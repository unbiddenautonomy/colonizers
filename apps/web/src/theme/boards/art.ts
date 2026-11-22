import type { BaseType } from './kit.tsx';

/**
 * Painted artwork for the board skins, dropped in as image files. A skin with an art folder,
 * src/art/<folder>/, uses any of these files it finds there (webp, png or jpg):
 *
 *   header      the picture at the top of the setup page
 *   backdrop    a wide picture behind the setup page, kept faint under the page colour
 *   forest … desert   the six land hexes, square, cut to a hexagon
 *   sea         a seamless sea texture, repeated
 *   settlement, city, ship   pieces painted in white and grey; the game tints them per player
 *   robber      the robber, in full colour
 *   token       the disc under each number, seen from above, with a plain centre
 *   land-<type> the object for a rarer land (land-gold, land-fishinglake …), on its flat colour
 *   anything else  a piece or marker by name (knight1, dragon2, camel, crown …): see Board.tsx
 *
 * A file that is there replaces the drawing for that piece; anything missing keeps the drawing,
 * so the art can arrive a few pieces at a time.
 */

export type ArtSlot =
  'header' | 'backdrop' | BaseType | 'sea' | 'settlement' | 'city' | 'ship' | 'robber' | 'token';

/** The slots above, plus any other painting by file name: knight1, land-gold, camel … */
export type ArtSet = Partial<Record<ArtSlot, string>> & Partial<Record<string, string>>;

const FILES = import.meta.glob<string>('../../art/*/*.{webp,png,jpg,jpeg}', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** The art files found for one folder, by slot. */
export function artFor(folder: string, files: Record<string, string> = FILES): ArtSet {
  const set: ArtSet = {};
  for (const [path, url] of Object.entries(files)) {
    const m = /\/art\/([^/]+)\/([a-z0-9-]+)\.(?:webp|png|jpe?g)$/.exec(path);
    if (m && m[1] === folder) set[m[2] as ArtSlot] = url;
  }
  return set;
}
