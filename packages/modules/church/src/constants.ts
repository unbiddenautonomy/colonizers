import type { EventFace } from '@colonizers/module-cities-knights';

export const MODULE_ID = 'church';

/** Cities & Knights' three tracks and Religion. */
export const CHURCH_TRACKS = ['science', 'trade', 'politics', 'religion'] as const;

/** Bread from a Diocese on grain, Beer from the Abbey. */
export const BREAD = 'bread';
export const BEER = 'beer';

/** Points to win: Cities & Knights' 13, plus the Diocese and a fourth metropolis. */
export const CHURCH_VP_TARGET = 15;
export const CHURCH_PROGRESS_LIMIT = 5;

/**
 * Played on its own, a ten-sided event die: five ships, a gate for each of
 * the four tracks, and a joker whose track the roller picks.
 */
export const CHURCH_EVENT_FACES: EventFace[] = [
  'ship',
  'ship',
  'ship',
  'ship',
  'ship',
  'science',
  'trade',
  'politics',
  'religion',
  'joker',
];

/** Owning one of these metropolises stops the other at level 3. */
export const EXCLUSIVE_METROPOLIS = ['science', 'religion'] as const;

export const DIOCESE_COST = { grain: 1, brick: 1, lumber: 1 };

/** Festivals: what the chip goes on, and its price in Beer. */
export const FESTIVAL_COST = {
  road: 2,
  ship: 2,
  knight: 3,
  settlement: 4,
  city: 5,
} as const;
export type FestivalKind = keyof typeof FESTIVAL_COST;

/** Beer goes to the bank 4:1 (3:1 with a 3:1 harbor), for any card; the bank never sells it. */
export const BEER_RATIO = 4;
