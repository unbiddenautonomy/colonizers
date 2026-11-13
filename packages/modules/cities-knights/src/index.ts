import type { ActionDef, CornerId, Ctx, GameModule, Piece } from '@colonizers/engine';
import { RESOURCES } from '@colonizers/module-base';
import { knightActions } from './actions.ts';
import {
  COMMODITIES,
  DECK_CARDS,
  KNIGHT_TYPES,
  MODULE_ID,
  TERRAIN_COMMODITY,
  WALL_HAND_BONUS,
  commodityBank,
  isCommodity,
} from './constants.ts';
import { progressActions } from './progress.ts';
import {
  ckData,
  ckDice,
  hasAbility,
  merchant,
  progressOverLimit,
  rollBelow,
  startRoll,
  wallsOf,
} from './rules.ts';

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
  actions: { ...knightActions, ...progressActions },
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
    buyDevCard: (prev): ActionDef => ({
      ...prev,
      check: () => 'Cities & Knights uses progress cards instead of development cards',
      enumerate: () => [],
    }),
    playDevCard: (prev): ActionDef => ({
      ...prev,
      check: () => 'Cities & Knights uses progress cards instead of development cards',
      enumerate: () => [],
    }),
    placeSetupSettlement: (prev): ActionDef => ({
      ...prev,
      apply(ctx, a) {
        const index = ctx.state.phase.index as number;
        prev.apply(ctx, a);
        // The second starting building is a city.
        if (index < ctx.playerCount) return;
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
        const all = [...RESOURCES, ...COMMODITIES] as string[];
        return all.flatMap((give) =>
          all.filter((g) => g !== give).map((get) => ({ type: 'bankTrade', player, give, get })),
        );
      },
    }),
  },
  hooks: {
    init(ctx) {
      ckData(ctx);
    },
    afterAction(ctx) {
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
      if (!commodity || !produces || !value[produces]) return value;
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
      v += (played.printer ?? 0) + (played.constitution ?? 0);
      if (merchant(ctx)?.owner === seat) v += 1;
      return v;
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
  attack,
  barbarianStrength,
  barbarianTrack,
  canAct,
  ckData,
  citiesOf,
  defenseStrength,
  displaceTargets,
  freeCities,
  hasAbility,
  improveBlock,
  improveCost,
  isActive,
  isAway,
  isKnight,
  knightAt,
  knightLevel,
  knightsOf,
  levels,
  merchant,
  moveTargets,
  progressCount,
  progressHeld,
  reachable,
  strength,
  wallsOf,
  type CkData,
  type Levels,
} from './rules.ts';
export { wallBlock } from './actions.ts';
