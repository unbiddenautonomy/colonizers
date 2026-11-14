import type { Cards } from '@colonizers/engine';

export const MODULE_ID = 'soldiers';

/** The piece that holds a player's units on one corner. */
export const ARMY = 'army';

export const UNITS = ['infantry', 'cavalry', 'artillery'] as const;
export type Unit = (typeof UNITS)[number];

export const UNIT_COSTS: Record<Unit, Cards> = {
  infantry: { ore: 1, wool: 1, grain: 1 },
  cavalry: { ore: 1, wool: 2, grain: 2 },
  artillery: { ore: 4, wool: 1, lumber: 1, grain: 1 },
};

/** How many of each unit a player has to buy. */
export const UNIT_LIMIT: Record<Unit, number> = { infantry: 7, cavalry: 4, artillery: 3 };

/** The die an army rolls, by its best unit. */
export const UNIT_DIE: Record<Unit, number> = { infantry: 6, cavalry: 10, artillery: 12 };

/** The die a building defends with. Anything bigger than a settlement rolls like a city. */
export const SETTLEMENT_DIE = 8;
export const CITY_DIE = 12;
export const METROPOLIS_DIE = 20;

/** The robber's die when an army attacks it. */
export const ROBBER_DIE = 6;

export const WALL_COST: Cards = { brick: 3 };
export const MAX_WALLS = 3;

/** Corners an army walks for free each turn; each one further costs ARMY_STEP_COST. */
export const FREE_STEPS = 3;
/** With Cities & Knights, the Politics metropolis marches its owner's armies five corners free. */
export const POLITICS_STEPS = 5;
export const ARMY_STEP_COST: Cards = { lumber: 1, grain: 1 };

/** Cards kept on a 7, and how many more each wall keeps. */
export const HAND_LIMIT = 10;
export const WALL_HAND = 2;

/** Development cards a player may hold. */
export const DEV_HOLD_MAX = 4;

/** Soldiers & Armies plays to 13. */
export const SOLDIERS_EXTRA_VP = 3;

/** The once-a-game nuke: 6 ore, 5 grain and 5 cards of any kind, for a field up to 6 away. */
export const NUKE = 'nuke';
export const NUKE_COST: Cards = { ore: 6, grain: 5 };
export const NUKE_ANY = 5;
export const NUKE_RANGE = 6;

/** With Cities & Knights: the barbarians' die against a city, and the merchant's defence. */
export const BARBARIAN_DIE = 12;
export const MERCHANT_DIE = 10;
export const MERCHANT_TOLL = 2;
/** Each unit's weight against the barbarians (and for Defender of Catan). */
export const UNIT_STRENGTH = { infantry: 1, cavalry: 2, artillery: 3, nuke: 4 } as const;
