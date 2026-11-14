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

/** The robber's die when an army attacks it. */
export const ROBBER_DIE = 6;

export const WALL_COST: Cards = { brick: 3 };
export const MAX_WALLS = 3;

/** Corners an army walks for free each turn; each one further costs ARMY_STEP_COST. */
export const FREE_STEPS = 3;
export const ARMY_STEP_COST: Cards = { lumber: 1, grain: 1 };

/** Cards kept on a 7, and how many more each wall keeps. */
export const HAND_LIMIT = 10;
export const WALL_HAND = 2;

/** Development cards a player may hold. */
export const DEV_HOLD_MAX = 4;

/** Soldiers & Armies plays to 13. */
export const SOLDIERS_EXTRA_VP = 3;
