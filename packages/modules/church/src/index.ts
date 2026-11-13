import type { ActionDef, GameModule } from '@colonizers/engine';
import { activeTracks, commodityBank, wrapIndulgenceRoll } from '@colonizers/module-cities-knights';
import { cardActions, religionDeck, syncInquisitor, wrapCards } from './cards.ts';
import {
  BEER,
  DIOCESE_COST,
  BREAD,
  CHURCH_EVENT_FACES,
  CHURCH_PROGRESS_LIMIT,
  CHURCH_TRACKS,
  CHURCH_VP_TARGET,
  EXCLUSIVE_METROPOLIS,
  MODULE_ID,
} from './constants.ts';
import {
  beerRatio,
  dioceseOf,
  breadYield,
  brewBeer,
  churchActions,
  churchData,
  churchView,
  dropDeadFestivals,
  dropLostDioceses,
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
 *   points at a track. Five progress cards in hand; owning the Science or
 *   Religion metropolis stops the other at level 3.
 *
 * List it after Cities & Knights (and Seafarers).
 */

export * from './constants.ts';
export { CARDS as RELIGION_CARDS, debtOf, inquisitorSpots, producible } from './cards.ts';
export {
  beerRatio,
  dioceseBlock,
  dioceseOf,
  diocesePrice,
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
  'buildDiocese',
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
    ckTracks: [...CHURCH_TRACKS],
    ckEventFaces: CHURCH_EVENT_FACES,
    progressLimit: CHURCH_PROGRESS_LIMIT,
    exclusiveMetropolis: [...EXCLUSIVE_METROPOLIS],
  },
  cardTypes: { [BREAD]: commodity, [BEER]: commodity },
  costs: { diocese: DIOCESE_COST },
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
    improveCity: (prev): ActionDef =>
      guardFestival({
        ...prev,
        check(ctx, a) {
          if (a.track === 'religion' && dioceseOf(ctx, a.player) === null)
            return 'Religion improvements need a Diocese';
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
      dropLostDioceses(ctx);
      dropDeadFestivals(ctx);
      brewBeer(ctx);
      syncInquisitor(ctx);
      syncBans(ctx);
    },
    turnStarted: endFestivals,
  },
  reducers: {
    vp(ctx, seat, value) {
      return value + (dioceseOf(ctx, seat) !== null ? 1 : 0) - festivalVp(ctx, seat);
    },
    hexYield: breadYield,
    hexBlocked: festivalBlocksYield,
    routeWeight: festivalRouteWeight,
    knightStrength: festivalKnightStrength,
    takesProgress(ctx, seat, deck, value) {
      if (!value) return false;
      if (churchView(ctx).bans?.some((b) => b.target === seat && b.track === deck)) return false;
      return deck !== 'religion' || dioceseOf(ctx, seat) !== null;
    },
    swapRatio(ctx, seat, give, _get, value) {
      return give === BEER ? beerRatio(ctx, seat) : value;
    },
  },
};
