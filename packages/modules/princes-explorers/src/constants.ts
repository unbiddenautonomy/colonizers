import type { Cards } from '@colonizers/engine';

export const MODULE_ID = 'princes';

/** The four neutral princes. */
export const PRINCE = 'prince';
export const PRINCE_COUNT = 4;

/** Princes & Explorers plays to 14 with the usual 10. */
export const PRINCES_EXTRA_VP = 4;

/** On a 7 (or when paid for) the robber goes one to three fields. */
export const ROBBER_RANGE = 3;

/** Moving the robber without a 7 costs what a development card would. */
export const ROBBER_MOVE_COST: Cards = { ore: 1, wool: 1, grain: 1 };

/** With five or more players, a 7 lets you keep ten cards. */
export const BIG_GAME_HAND_LIMIT = 10;

/** A road next to the robber is left out of the longest road; this weight cuts it. */
export const CUT_ROAD = -100;
