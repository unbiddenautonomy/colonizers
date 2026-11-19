import type { Action } from '@colonizers/engine';

/** Words for the pieces whose action name does not say it plainly. */
const PIECE: Record<string, string> = {
  ferry: 'ship',
  wall: 'city wall',
  harbor: 'harbor settlement',
};

/** Action names that read badly word by word. */
const PLAIN: Record<string, string> = {
  placeSetupSettlement: 'Place a settlement',
  placeSetupRoad: 'Place a road',
  placeSetupShip: 'Place a ship',
  placeFreeRoad: 'Place a free road',
  placeFreeShip: 'Place a free ship',
  buildCitySeat: "Take a knight's seat",
};

/**
 * What a place on the board is for, in words: "Build a settlement", "Move the
 * robber". The board used to label every spot "Build here", which told a
 * screen reader (and a tooltip) nothing about which of the three kinds of
 * spot it had landed on.
 */
export function spotLabel(action: Action): string {
  const a = action as unknown as Record<string, unknown>;
  const plain = PLAIN[String(a.type)];
  if (plain) return plain;
  const piece = typeof a.piece === 'string' ? (PIECE[a.piece] ?? a.piece) : null;
  const words = String(a.type)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase();
  const [verb = words, ...rest] = words.split(' ');
  const what = piece ?? rest.join(' ');
  if (!what) return words.charAt(0).toUpperCase() + words.slice(1);
  const article = /^(?:a|e|i|o|u)/.test(what) ? 'an' : 'a';
  const the = verb === 'move' || verb === 'place' ? 'the' : article;
  return `${verb.charAt(0).toUpperCase()}${verb.slice(1)} ${the} ${what}`;
}
