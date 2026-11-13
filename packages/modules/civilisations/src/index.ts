import type { GameModule } from '@colonizers/engine';
import {
  civEffects,
  civCost,
  civSwapRatio,
  civYield,
  wrapBuildWonder,
  wrapImprove,
  wrapSteal,
} from './effects.ts';
import { giftActions } from './gifts.ts';
import { civData, MODULE_ID } from './core.ts';
import { afterSetup, deal, redactCivs, setupActions } from './setup.ts';

/**
 * Civilisations, from the Civilisations & World Wonders fan expansion. Each
 * player leads a civilisation: a start ability, a second ability from the
 * first time they reach 10 points, and their class's bonus (see civs.ts).
 *
 * Plays on Cities & Knights with Greed, Wealth & Power. With World Wonders on
 * too, Monument civilisations start their own wonder more easily.
 *
 * List it last, after World Wonders.
 */

export * from './civs.ts';
export * from './core.ts';
export { dealSize, START_NEUTRAL } from './setup.ts';
export { CALENDAR, calendarTrack, harvestHexes, swapsOf } from './gifts.ts';
export { polarHexes, RESOURCE_COMMODITY, TRACK_RESOURCE } from './effects.ts';

/** Points to win with Civilisations, as the author suggests. */
export const CIV_VP_TARGET = 20;

export const civilisationsModule: GameModule = {
  id: MODULE_ID,
  name: 'Civilisations',
  requires: ['base', 'cities-knights', 'greed-wealth-power'],
  settings: { vpTarget: CIV_VP_TARGET },
  actions: { ...setupActions, ...giftActions },
  wrapActions: { improveCity: wrapImprove, steal: wrapSteal },
  wrapActionsIfPresent: { buildWonder: wrapBuildWonder },
  hooks: {
    init(ctx) {
      civData(ctx);
      deal(ctx);
    },
    afterAction(ctx) {
      afterSetup(ctx);
      civEffects(ctx);
    },
  },
  reducers: {
    cost: civCost,
    hexYield: civYield,
    swapRatio: civSwapRatio,
  },
  redact: redactCivs,
};
