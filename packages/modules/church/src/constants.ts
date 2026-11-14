export const MODULE_ID = 'church';

/** Cities & Knights' three tracks and Religion (Magic too, with Witches, Wizards & Dragons). */
export const CHURCH_TRACKS = ['science', 'trade', 'politics', 'religion'] as const;

/** Bread from a Diocese on grain, Beer from the Abbey. */
export const BREAD = 'bread';
export const BEER = 'beer';

/** Points to win: Cities & Knights' 13, plus the Diocese and a fourth metropolis. */
export const CHURCH_VP_TARGET = 15;
export const CHURCH_PROGRESS_LIMIT = 5;

/** Level 4 in one of these stops the others at level 3. */
export const EXCLUSIVE_LEVEL = ['science', 'religion'] as const;

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
