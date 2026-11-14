import { indulgenceActions } from './indulgence.ts';
import type { ActionDef, CornerId, Ctx, GameModule, Piece } from '@colonizers/engine';
import { RESOURCES } from '@colonizers/module-base';
import { knightActions } from './actions.ts';
import {
  COMMODITIES,
  DECK_CARDS,
  KNIGHT_TYPES,
  MODULE_ID,
  TERRAIN_COMMODITY,
  VP_PROGRESS,
  WALL_HAND_BONUS,
  commodityBank,
  isCommodity,
} from './constants.ts';
import { progressActions } from './progress.ts';
import { fanActions } from './fancards.ts';
import { dropLostSeats, seatActions, seatVp, seatYield, setUpTracks } from './seats.ts';
import {
  ckData,
  ckDice,
  commoditiesIn,
  hasAbility,
  merchant,
  progressOverLimit,
  rollBelow,
  startRoll,
  wallsOf,
} from './rules.ts';

const NO_DEV_CARDS = 'Cities & Knights uses progress cards instead of development cards';
const keepDevCards = (prev: ActionDef): ActionDef => ({
  ...prev,
  check: (ctx, a) => (ctx.state.modules.includes('landwater') ? prev.check(ctx, a) : NO_DEV_CARDS),
  enumerate: (ctx, player) =>
    ctx.state.modules.includes('landwater') ? (prev.enumerate?.(ctx, player) ?? []) : [],
});

const commodityCard = { category: 'commodity', countsForHandLimit: true, bank: commodityBank };
const knight = (): { on: 'corner'; perPlayer: () => number; blocksRoutes: true } => ({
  on: 'corner',
  perPlayer: () => 2,
  blocksRoutes: true,
});

/**
 * Cities & Knights: commodities from cities, three city improvement tracks
 * with metropolises, knights that defend against the barbarians, progress
 * cards instead of development cards, city walls and the merchant.
 */
export const citiesKnightsModule: GameModule = {
  id: MODULE_ID,
  name: 'Cities & Knights',
  requires: ['base'],
  settings: {
    vpTarget: 13,
    /** Steps the barbarian ship sails before it lands. */
    barbarianTrack: 7,
  },
  cardTypes: Object.fromEntries(COMMODITIES.map((c) => [c, commodityCard])),
  decks: Object.fromEntries(
    Object.entries(DECK_CARDS).map(([deck, cards]) => [deck, { cards: () => ({ ...cards }) }]),
  ),
  pieceTypes: {
    knight1: knight(),
    knight2: knight(),
    knight3: knight(),
    merchant: { on: 'hex' },
  },
  costs: {
    knight: { wool: 1, ore: 1 },
    activate: { grain: 1 },
    promote: { wool: 1, ore: 1 },
    wall: { brick: 2 },
  },
  actions: {
    ...knightActions,
    ...progressActions,
    ...indulgenceActions,
    ...seatActions,
    ...fanActions,
  },
  dice: ckDice,
  wrapActions: {
    roll: (prev): ActionDef => {
      const def: ActionDef = {
        ...prev,
        apply(ctx, a) {
          startRoll(ctx, a.player);
        },
      };
      rollBelow.set(def, prev);
      return def;
    },
    discard: (prev): ActionDef => ({
      ...prev,
      apply(ctx, a) {
        const before = ctx.state.phase;
        prev.apply(ctx, a);
        // Before the first attack, and after a Saboteur, nobody moves the robber.
        if (before.skipRobber && ctx.state.phase.id === 'moveRobber')
          ctx.setPhase({ id: (before.returnTo as string) ?? 'main' });
      },
    }),
    // Land & Water keeps the knight cards (and only those) in place of knight pieces.
    buyDevCard: keepDevCards,
    playDevCard: keepDevCards,
    placeSetupSettlement: (prev): ActionDef => ({
      ...prev,
      apply(ctx, a) {
        const index = ctx.state.phase.index as number;
        prev.apply(ctx, a);
        // The second starting building is a city (a third, where there is one, stays a settlement).
        if (index < ctx.playerCount || index >= 2 * ctx.playerCount) return;
        const b = ctx.buildingAt(a.corner as CornerId);
        if (b?.type === 'settlement' && ctx.supplyLeft(a.player, 'city') > 0) {
          ctx.upgrade(b, 'city');
          ctx.emit({ type: 'built', player: a.player, piece: 'city', at: a.corner });
        }
      },
    }),
    bankTrade: (prev): ActionDef => ({
      ...prev,
      enumerate(ctx, player) {
        if (player !== ctx.active) return [];
        const all = [...RESOURCES, ...commoditiesIn(ctx)];
        return all.flatMap((give) =>
          all.filter((g) => g !== give).map((get) => ({ type: 'bankTrade', player, give, get })),
        );
      },
    }),
  },
  hooks: {
    init(ctx) {
      ckData(ctx);
      setUpTracks(ctx);
    },
    afterAction(ctx) {
      dropLostSeats(ctx);
      // More than 4 progress cards: stop and put the extras back first.
      if (ctx.state.winner !== null || ctx.state.phase.id === 'progressDiscard') return;
      const owed = progressOverLimit(ctx);
      if (!Object.keys(owed).length) return;
      ctx.setPhase({ id: 'progressDiscard', owed, returnTo: ctx.state.phase });
    },
  },
  reducers: {
    hexYield(ctx, hex, piece, value) {
      if (piece.type !== 'city') return value;
      const commodity = TERRAIN_COMMODITY[hex.type];
      const produces = ctx.registry.hexTypes[hex.type]?.produces;
      if (!commodity || !produces || !value[produces]) return seatYield(ctx, hex, piece, value);
      // A city here takes one resource and one commodity instead of two resources.
      return { ...value, [produces]: (value[produces] ?? 0) - 1, [commodity]: 1 };
    },
    handLimit(ctx, seat, value) {
      return value + WALL_HAND_BONUS * wallsOf(ctx, seat);
    },
    tradeRatio(ctx, seat, card, value) {
      let best = value;
      // Trading house: commodities at 2:1.
      if (isCommodity(card) && hasAbility(ctx, seat, 'trade')) best = Math.min(best, 2);
      const m = merchant(ctx);
      if (m && m.owner === seat && m.at.kind === 'hex') {
        const hex = ctx.state.hexes[m.at.id];
        const res = hex ? ctx.registry.hexTypes[hex.type]?.produces : undefined;
        if (res === card) best = Math.min(best, 2);
      }
      const fleet = ckData(ctx).fleet;
      if (
        fleet &&
        fleet.seat === seat &&
        fleet.turn === ctx.state.turn.number &&
        fleet.card === card
      )
        best = Math.min(best, 2);
      return best;
    },
    vp(ctx, seat, value) {
      const d = ckData(ctx);
      let v = value;
      for (const m of Object.values(d.metropolis)) if (m?.seat === seat) v += 2;
      v += d.defender[seat] ?? 0;
      const played = ctx.player(seat).played;
      for (const c of VP_PROGRESS) v += played[c] ?? 0;
      if (merchant(ctx)?.owner === seat) v += 1;
      return v + seatVp(ctx, seat);
    },
  },
  redact(data, viewer) {
    const peek = data.peek as { seat: number } | null | undefined;
    if (peek && peek.seat !== viewer) data.peek = { ...peek, hand: undefined, progress: undefined };
    return data;
  },
};

/** Knights of every strength, for the UI and bots. */
export function knightPieces(ctx: Ctx, seat: number): Piece[] {
  return ctx.piecesOf(seat).filter((p) => (KNIGHT_TYPES as readonly string[]).includes(p.type));
}

export * from './constants.ts';
export {
  activeTracks,
  attack,
  barbarianStrength,
  barbarianTrack,
  canAct,
  ckData,
  citiesOf,
  canPlaceKnight,
  cityAtRisk,
  shielded,
  isSheltered,
  commoditiesIn,
  drawProgress,
  eventFaces,
  rollEventDie,
  rewrapRoll,
  gateOpen,
  defenseStrength,
  displaceTargets,
  freeCities,
  hasAbility,
  improveBlock,
  improveCost,
  isActive,
  isActiveTrack,
  isAway,
  isKnight,
  landBarbarians,
  knightAt,
  knightLevel,
  knightStrength,
  knightsOf,
  levels,
  merchant,
  moveTargets,
  giveProgress,
  progressCount,
  progressHeld,
  progressLimit,
  progressOverLimit,
  reachable,
  rivalMetropolis,
  setMetropolis,
  takesProgress,
  pillage,
  strength,
  wallsOf,
  wildDecks,
  winsMetropolis,
  type CkData,
  type Levels,
} from './rules.ts';
export { claimMetropolis, lowerTrack, raiseTrack, wallBlock } from './actions.ts';
export { holdsProgress, openRoutes, spendProgress } from './progress.ts';
export {
  askVeto,
  attackHeld,
  attackWindow,
  crusaderCard,
  defineFanCards,
  excuseDiscard,
  FAN_PHASES,
  fanCard,
  fanDeck,
  heldIn,
  indulgenceCard,
  keepOne,
  others,
  pickTarget,
  reformationCard,
  refugeCard,
  returnHeld,
  takeFromEach,
  takeHeld,
  targets,
  VETO,
  wrapFanCards,
  type CardTiming,
  type FanCard,
  type Play as FanPlay,
  type Pooled,
} from './fancards.ts';
export {
  INDULGENCE,
  indulgenceTiming,
  playIndulgence,
  REROLLS as INDULGENCE_REROLLS,
  wrapIndulgenceRoll,
  type HeldRoll,
} from './indulgence.ts';
export {
  citySeats,
  jokerDie,
  seatAllows,
  seatAt,
  seatBlock,
  seatDef,
  seatForTrack,
  seatOf,
  seatPrice,
  type CitySeat,
} from './seats.ts';
