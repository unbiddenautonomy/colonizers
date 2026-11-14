import type { Ctx, GameModule } from '@colonizers/engine';
import { RESOURCES } from '@colonizers/module-base';
import { commodityBank, hasAbility, type CitySeat } from '@colonizers/module-cities-knights';
import {
  CITADEL,
  CITADEL_COST,
  CITADEL_DISCOUNT,
  CRYSTAL,
  EXCLUSIVE_LEVEL,
  KITCHEN_GIVES,
  MODULE_ID,
  WITCHES_PROGRESS_LIMIT,
  WITCHES_VP_TARGET,
} from './constants.ts';

/**
 * Witches, Wizards & Dragons (Hexen, Zauberer und Drachen, by Reini, in the
 * version 3 made to match Church, Faith & Reformation), a fan expansion for
 * Cities & Knights:
 *
 * - A fourth track, **Magic**, whose commodity is **Magic Crystal**. Its level
 *   3, the **Magic Kitchen**, trades brick 1:1 for any other resource on your
 *   turn, as often as you like.
 * - The **Citadel**: one city per player becomes one (1 ore, 2 brick; straight
 *   from a settlement 3 ore, 2 grain, 2 brick). It is worth a point, its city
 *   makes Crystal in place of its second brick, and only a Citadel opens Magic
 *   improvements and Magic cards.
 * - A ten-sided event die (twelve sides with Church, Faith & Reformation),
 *   five progress cards in hand, and level 4 in Science or Magic (or
 *   Religion) stopping the others at level 3.
 *
 * Cities & Knights holds the shared parts (the extra track, the die, the city
 * seat), so this plays alone or next to Church, Faith & Reformation.
 */

export * from './constants.ts';

const commodity = { category: 'commodity', countsForHandLimit: true, bank: commodityBank };

export const citadelSeat: CitySeat = {
  id: CITADEL,
  name: 'Citadel',
  track: 'magic',
  resource: 'brick',
  commodity: CRYSTAL,
  settlementDiscount: CITADEL_DISCOUNT,
};

/** Can this player use the Magic Kitchen to swap these cards now? */
export function kitchenSwap(ctx: Ctx, seat: number, give: string, get: string): boolean {
  return (
    give === KITCHEN_GIVES &&
    get !== KITCHEN_GIVES &&
    (RESOURCES as readonly string[]).includes(get) &&
    seat === ctx.active &&
    hasAbility(ctx, seat, 'magic')
  );
}

export const witchesModule: GameModule = {
  id: MODULE_ID,
  name: 'Witches, Wizards & Dragons',
  requires: ['cities-knights'],
  // Greed, Wealth & Power has its own Magic track and cards.
  conflicts: ['greed-wealth-power'],
  settings: {
    vpTarget: WITCHES_VP_TARGET,
    ckAddTracks: ['magic'],
    ckExclusiveLevel: [...EXCLUSIVE_LEVEL],
    ckCitySeat: citadelSeat,
    progressLimit: WITCHES_PROGRESS_LIMIT,
  },
  cardTypes: { [CRYSTAL]: commodity },
  costs: { [CITADEL]: CITADEL_COST },
  reducers: {
    swapRatio(ctx, seat, give, get, value) {
      return kitchenSwap(ctx, seat, give, get) ? 1 : value;
    },
  },
};
