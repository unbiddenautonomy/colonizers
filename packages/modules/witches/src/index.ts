import type { Ctx, GameModule } from '@colonizers/engine';
import { RESOURCES } from '@colonizers/module-base';
import {
  commodityBank,
  hasAbility,
  wrapFanCards,
  type CitySeat,
} from '@colonizers/module-cities-knights';
import { CARDS, cardActions, magicDeck, wrapActivate } from './cards.ts';
import {
  endFortune,
  endPower,
  fortuneCost,
  magicDefense,
  syncSpell,
  syncWizard,
  witchesData,
  wizardOwner,
  wizardRobbable,
  wizardUnblocks,
} from './rules.ts';
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
  WIZARD,
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
 * - The **Magic deck**: eighteen cards, among them the **Wizard**, who guards
 *   one of your settlements or cities from the robber and is worth a point,
 *   and **Magic Veto**, which turns away a card aimed at you.
 *
 * Cities & Knights holds the shared parts (the extra track, the die, the city
 * seat, the card engine), so this plays alone or next to Church, Faith &
 * Reformation. List it before Church, so the Wizard's guard against the robber
 * doesn't lift a festival.
 */

export * from './constants.ts';
export { CARDS as MAGIC_CARDS, magicDeck, pickSpots, PICK_CARDS } from './cards.ts';
export {
  inquisitorAt,
  spellOn,
  witchesData,
  witchesView,
  wizardOwner,
  wizardPiece,
  wizardSpots,
  type WitchesData,
} from './rules.ts';

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
  decks: { magic: { cards: () => magicDeck() } },
  pieceTypes: { [WIZARD]: { on: 'corner' } },
  actions: cardActions,
  wrapActions: {
    playProgress: wrapFanCards(CARDS),
    activateKnight: wrapActivate,
  },
  hooks: {
    init(ctx) {
      witchesData(ctx);
    },
    afterAction(ctx) {
      syncWizard(ctx);
      syncSpell(ctx);
      endPower(ctx);
      endFortune(ctx);
    },
  },
  reducers: {
    swapRatio(ctx, seat, give, get, value) {
      // Brick at 1:1; on Investors & Speculators' market, 3 off its rate, never better than 1:1.
      return kitchenSwap(ctx, seat, give, get) ? Math.max(1, value - 3) : value;
    },
    vp(ctx, seat, value) {
      return wizardOwner(ctx) === seat ? value + 1 : value;
    },
    hexBlocked: wizardUnblocks,
    robbable: wizardRobbable,
    defense: magicDefense,
    cost: fortuneCost,
  },
};
