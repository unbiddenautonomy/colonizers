import type { Ctx, GameModule } from '@colonizers/engine';
import { baseActions } from './actions.ts';
import { bankPerResource, devDeck, MODULE_ID, RESOURCES } from './constants.ts';
import { baseData, setupSeat, updateLongestRoad, type BaseData } from './rules.ts';

const resourceCard = {
  category: 'resource',
  countsForHandLimit: true,
  bank: bankPerResource,
};

/** The base game: 3–4 players by default, with counts for 5–8 when more players join. */
export const baseModule: GameModule = {
  id: MODULE_ID,
  name: 'Base game',
  settings: {
    vpTarget: 10,
    discardLimit: 7,
    longestRoadMin: 5,
    largestArmyMin: 3,
    startingResourcesBothRounds: false,
  },
  hexTypes: {
    forest: { terrain: 'land', produces: 'lumber' },
    hills: { terrain: 'land', produces: 'brick' },
    pasture: { terrain: 'land', produces: 'wool' },
    fields: { terrain: 'land', produces: 'grain' },
    mountains: { terrain: 'land', produces: 'ore' },
    desert: { terrain: 'land' },
    sea: { terrain: 'sea', robber: false },
  },
  cardTypes: Object.fromEntries(RESOURCES.map((r) => [r, resourceCard])),
  decks: { dev: { cards: devDeck } },
  pieceTypes: {
    road: { on: 'edge', perPlayer: () => 15, route: 'land' },
    settlement: { on: 'corner', perPlayer: () => 5, building: true, vp: 1, production: 1 },
    city: { on: 'corner', perPlayer: () => 4, building: true, vp: 2, production: 2 },
    robber: { on: 'hex' },
  },
  costs: {
    road: { brick: 1, lumber: 1 },
    settlement: { brick: 1, lumber: 1, wool: 1, grain: 1 },
    city: { grain: 2, ore: 3 },
    devCard: { wool: 1, grain: 1, ore: 1 },
  },
  actions: baseActions,
  hooks: {
    init(ctx) {
      const data: BaseData = { longestRoad: null, largestArmy: null, trade: null };
      ctx.state.data[MODULE_ID] = data;
      ctx.state.turn = { number: 0, player: setupSeat(ctx, 0), round: 0 };
      ctx.setPhase({ id: 'setup', index: 0, step: 'settlement' });
    },
    afterAction(ctx) {
      updateLongestRoad(ctx);
    },
  },
  reducers: {
    vp(ctx, seat, value) {
      const data = baseData(ctx);
      let v = value;
      if (data.longestRoad === seat) v += 2;
      if (data.largestArmy === seat) v += 2;
      v += (ctx.player(seat).held.dev ?? []).filter((c) => c.card === 'victoryPoint').length;
      return v;
    },
    tradeRatio(ctx, seat, card, value) {
      let best = value;
      for (const h of ctx.harborsOf(seat)) {
        if (h.resource === 'any' || h.resource === card) best = Math.min(best, h.ratio);
      }
      return best;
    },
  },
};

/** Victory points everyone can see: hidden Victory Point cards are left out until the game ends. */
export function publicVp(ctx: Ctx, seat: number): number {
  const hidden = (ctx.player(seat).held.dev ?? []).filter((c) => c.card === 'victoryPoint').length;
  return ctx.vp(seat) - (ctx.state.winner === null ? hidden : 0);
}

export { RESOURCES, TERRAIN_RESOURCE, DEV_CARDS, devDeck, bankPerResource } from './constants.ts';
export {
  randomBaseMap,
  ring,
  spiral,
  coastalEdges,
  BASE_TERRAIN,
  BASE_TOKEN_SPIRAL,
  BASE_HARBORS,
} from './map.ts';
export {
  baseData,
  canPlaceRoad,
  canPlaceSettlement,
  connectsAt,
  distanceRuleOk,
  legalRoadEdges,
  produce,
  robber,
  robberHexes,
  routesAt,
  startNextTurn,
  stealCandidates,
  stealFrom,
  updateLargestArmy,
  updateLongestRoad,
  type BaseData,
  type TradeOffer,
} from './rules.ts';
export { startSeven } from './actions.ts';
