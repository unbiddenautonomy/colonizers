import type { Cards } from '@colonizers/engine';

export const MODULE_ID = 'princes';

/** The four neutral princes. */
export const PRINCE = 'prince';
export const PRINCE_COUNT = 4;

/** Princes & Explorers plays to 14 with the usual 10. */
export const PRINCES_EXTRA_VP = 4;

/** On a 7 (or when paid for) the robber goes one to three fields. */
export const ROBBER_RANGE = 3;

/** With Cities & Knights, the Bishop takes it up to six. */
export const BISHOP_RANGE = 6;

/** Moving the robber without a 7 costs what a development card would. */
export const ROBBER_MOVE_COST: Cards = { ore: 1, wool: 1, grain: 1 };

/** With five or more players, a 7 lets you keep ten cards. */
export const BIG_GAME_HAND_LIMIT = 10;

/** A road next to the robber is left out of the longest road; this weight cuts it. */
export const CUT_ROAD = -100;

/**
 * The citadel (Nachi's deadlock house rule): a player with nothing left to build can turn a city
 * into a citadel, worth a point more. At most this many each.
 */
export const CITADEL_MAX = 2;

/** What a citadel costs. */
export const CITADEL_COST: Cards = { ore: 3, grain: 2, wool: 1 };
