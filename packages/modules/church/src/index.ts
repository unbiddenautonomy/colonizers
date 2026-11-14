import type { ActionDef, GameModule } from '@colonizers/engine';
import {
  activeTracks,
  commodityBank,
  wrapIndulgenceRoll,
  type CitySeat,
} from '@colonizers/module-cities-knights';
import { cardActions, religionDeck, syncInquisitor, wrapCards } from './cards.ts';
import {
  BEER,
  BREAD,
  CHURCH_PROGRESS_LIMIT,
  CHURCH_TRACKS,
  CHURCH_VP_TARGET,
  DIOCESE_COST,
  EXCLUSIVE_LEVEL,
  MODULE_ID,
} from './constants.ts';
import {
  beerRatio,
  brewBeer,
  churchActions,
  churchData,
  churchView,
  DIOCESE,
  dropDeadFestivals,
  syncBans,
  endFestivals,
  festivalBlocksYield,
  festivalKnightStrength,
  festivalRouteWeight,
  festivalVp,
  guardFestival,
  wrapAqueductPick,
  wrapBankTrade,
} from './rules.ts';

/**
 * Church, Faith & Reformation (Kirche, Glaube & Reformation, version 3, by
 * ErzEngel), a fan expansion for Cities & Knights, played on its own:
 *
 * - A fourth track, **Religion**, whose commodity is **Bread**. Its level 3,
 *   the **Abbey**, brews a **Beer** on a roll that brings you nothing.
 * - The **Diocese**: one city per player becomes one (1 grain, 1 brick, 1
 *   lumber; a settlement pays for the city too). It is worth a point, its
 *   city makes Bread in place of its second grain, and only a Diocese opens
 *   Religion improvements and Religion cards.
 * - **Beer** trades to the bank 4:1 (3:1 with a 3:1 harbor) for any card, but
 *   the bank never sells it. It pays for **festivals**: a chip on a rival's
 *   road or ship (2 Beer), knight (3), settlement (4) or city (5) shuts that
 *   piece down until your next turn.
 * - A ten-sided event die: five ships, four gates and a joker the roller
 *   points at a track (twelve sides with Witches, Wizards & Dragons too).
 *   Five progress cards in hand; level 4 in Science or Religion (or Magic)
 *   stops the others at level 3.
 *
 * List it after Cities & Knights (and Seafarers).
 */

export * from './constants.ts';
export { CARDS as RELIGION_CARDS, debtOf, inquisitorSpots, producible } from './cards.ts';
export {
  beerRatio,
  DIOCESE,
  dioceseOf,
  churchData,
  churchView,
  festivalBlock,
  festivalKind,
  festivalsOf,
  festivalSpots,
  festiveAt,
  isDiocese,
  type ChurchData,
  type Festival,
} from './rules.ts';

const commodity = { category: 'commodity', countsForHandLimit: true, bank: commodityBank };

/** Actions a festival can stop. */
const GUARDED = [
  'activateKnight',
  'promoteKnight',
  'moveKnight',
  'displaceKnight',
  'chaseRobber',
  'buildCity',
  'buildWall',
  'buildRoad',
  'buildSettlement',
];

export const churchModule: GameModule = {
  id: MODULE_ID,
  name: 'Church, Faith & Reformation',
  requires: ['cities-knights'],
  // Greed, Wealth & Power has its own Religion track and cards.
  conflicts: ['greed-wealth-power'],
  settings: {
    vpTarget: CHURCH_VP_TARGET,
    // Cities & Knights joins these with other modules' (Magic) and sizes the event die.
    ckAddTracks: ['religion'],
    ckExclusiveLevel: [...EXCLUSIVE_LEVEL],
    ckCitySeat: {
      id: DIOCESE,
      name: 'Diocese',
      track: 'religion',
      resource: 'grain',
      commodity: BREAD,
    } satisfies CitySeat,
    progressLimit: CHURCH_PROGRESS_LIMIT,
  },
  cardTypes: { [BREAD]: commodity, [BEER]: commodity },
  costs: { [DIOCESE]: DIOCESE_COST },
  decks: {
    religion: { cards: () => religionDeck([...CHURCH_TRACKS]) },
  },
  actions: { ...churchActions, ...cardActions },
  wrapActions: {
    ...Object.fromEntries(GUARDED.map((t) => [t, guardFestival])),
    bankTrade: wrapBankTrade,
    playProgress: wrapCards,
    roll: wrapIndulgenceRoll,
    aqueductPick: wrapAqueductPick,
    improveCity: guardFestival,
    // The Inquisitor's city can't become a Citadel.
    buildCitySeat: (prev): ActionDef =>
      guardFestival({
        ...prev,
        check(ctx, a) {
          if (a.seat === 'citadel' && a.corner === churchView(ctx).inquisitor)
            return 'Not while the Inquisitor is there';
          return prev.check(ctx, a);
        },
      }),
  },
  wrapActionsIfPresent: { buildShip: guardFestival, moveShip: guardFestival },
  hooks: {
    init(ctx) {
      churchData(ctx);
      // With Witches, Wizards & Dragons, Witch Burning joins the deck.
      const extra = Object.entries(religionDeck(activeTracks(ctx))).flatMap(([c, n]) =>
        (ctx.state.decks.religion ?? []).includes(c) ? [] : Array<string>(n).fill(c),
      );
      if (extra.length && ctx.state.decks.religion)
        ctx.state.decks.religion = ctx.rng.shuffle([...ctx.state.decks.religion, ...extra]);
    },
    afterAction(ctx) {
      dropDeadFestivals(ctx);
      brewBeer(ctx);
      syncInquisitor(ctx);
      syncBans(ctx);
    },
    turnStarted: endFestivals,
  },
  reducers: {
    vp(ctx, seat, value) {
      return value - festivalVp(ctx, seat);
    },
    hexBlocked: festivalBlocksYield,
    routeWeight: festivalRouteWeight,
    knightStrength: festivalKnightStrength,
    takesProgress(ctx, seat, deck, value) {
      if (!value) return false;
      return !churchView(ctx).bans?.some((b) => b.target === seat && b.track === deck);
    },
    swapRatio(ctx, seat, give, _get, value) {
      return give === BEER ? beerRatio(ctx, seat) : value;
    },
  },
};
