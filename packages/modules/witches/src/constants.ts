export const MODULE_ID = 'witches';

/** Magic Crystal, from a Citadel on brick. */
export const CRYSTAL = 'crystal';

export const CITADEL = 'citadel';
/** A city becomes a Citadel for 1 ore and 2 brick. */
export const CITADEL_COST = { ore: 1, brick: 2 };
/** Straight from a settlement it saves 1 ore (3 ore, 2 grain, 2 brick in all). */
export const CITADEL_DISCOUNT = { ore: 1 };

/** Points to win: Cities & Knights' 13, plus the Citadel and a fourth metropolis. */
export const WITCHES_VP_TARGET = 15;
export const WITCHES_PROGRESS_LIMIT = 5;

/** Level 4 in one of these stops the others at level 3. */
export const EXCLUSIVE_LEVEL = ['science', 'magic'] as const;

/** The Magic Kitchen (Magic level 3): brick for any other resource, 1:1, on your turn. */
export const KITCHEN_GIVES = 'brick';
