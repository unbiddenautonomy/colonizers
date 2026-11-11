import type { ActionDef, CornerId, GameModule, HexId } from '@colonizers/engine';
import { freeSpots, seaActions } from './actions.ts';
import {
  explore,
  islandOf,
  MODULE_ID,
  seaData,
  startGoldPick,
  type SeaData,
} from './rules.ts';

/**
 * Seafarers: ships on sea edges, moving ships, the pirate, gold fields, fog
 * of war with discovery rewards, and bonus points for settling new islands.
 * Scenarios are map files plus settings (see @colonizers/maps).
 */
export const seafarersModule: GameModule = {
  id: MODULE_ID,
  name: 'Seafarers',
  requires: ['base'],
  settings: {
    /** Points for the first settlement on each island beyond your starting ones. */
    islandBonus: 2,
    /** Exploring a fog hex pays its resource (gold: a free pick). */
    discoveryReward: true,
    /** If set, setup settlements must touch one of these hexes (the home island). */
    setupHexes: null,
  },
  hexTypes: {
    gold: { terrain: 'land' },
  },
  pieceTypes: {
    ship: { on: 'edge', perPlayer: () => 15, route: 'sea' },
    pirate: { on: 'hex' },
  },
  costs: { ship: { lumber: 1, wool: 1 } },
  actions: seaActions,
  wrapActions: {
    roll: (prev): ActionDef => ({
      ...prev,
      apply(ctx, a) {
        const d = seaData(ctx);
        d.pendingGold = {};
        prev.apply(ctx, a);
        const owed = d.pendingGold;
        d.pendingGold = {};
        if (Object.keys(owed).length && ctx.state.phase.id === 'main') {
          startGoldPick(ctx, owed, { id: 'main' });
        }
      },
    }),
    placeSetupSettlement: (prev): ActionDef => ({
      ...prev,
      check(ctx, a) {
        const home = ctx.setting<HexId[] | null>('setupHexes');
        if (home?.length) {
          const touching = ctx.geometry.cornerHexes.get(a.corner as CornerId) ?? [];
          if (!touching.some((h) => home.includes(h)))
            return 'Starting settlements go on the home island';
        }
        return prev.check(ctx, a);
      },
      apply(ctx, a) {
        const index = ctx.state.phase.index as number;
        prev.apply(ctx, a);
        // A starting settlement next to gold lets you pick one resource per gold hex.
        const collects =
          index >= ctx.playerCount || ctx.setting<boolean>('startingResourcesBothRounds');
        if (!collects) return;
        const gold = (ctx.geometry.cornerHexes.get(a.corner as CornerId) ?? []).filter((h) => {
          const hex = ctx.state.hexes[h];
          return hex && !hex.hidden && hex.type === 'gold';
        }).length;
        if (gold > 0) startGoldPick(ctx, { [a.player]: gold }, ctx.state.phase);
      },
    }),
    playDevCard: (prev): ActionDef => ({
      ...prev,
      check(ctx, a) {
        const why = prev.check(ctx, a);
        // Road Building also builds ships, so it works when only ships fit.
        if (
          why &&
          a.card === 'roadBuilding' &&
          (why === 'There is nowhere to build a road' || why === 'No roads left') &&
          freeSpots(ctx, a.player)
        )
          return null;
        return why;
      },
      apply(ctx, a) {
        prev.apply(ctx, a);
        if (a.card === 'roadBuilding' && ctx.state.phase.id === 'roadBuilding') {
          const left = ctx.supplyLeft(a.player, 'road') + ctx.supplyLeft(a.player, 'ship');
          ctx.setPhase({ ...ctx.state.phase, remaining: Math.min(2, left) });
        }
      },
    }),
    placeFreeRoad: (prev): ActionDef => ({
      ...prev,
      apply(ctx, a) {
        const before = ctx.state.phase as { id: string; remaining: number; returnTo: string };
        prev.apply(ctx, a);
        // Base rules stop when no road fits; a ship might still fit.
        const remaining = before.remaining - 1;
        if (ctx.state.phase.id !== 'roadBuilding' && remaining > 0 && freeSpots(ctx, a.player)) {
          ctx.setPhase({ ...before, remaining });
        }
      },
    }),
  },
  hooks: {
    init(ctx) {
      seaData(ctx);
    },
    piecePlaced(ctx, piece, previous) {
      explore(ctx, piece);
      // Island bonus for the first settlement on each new island.
      if (piece.type !== 'settlement' || previous !== null || piece.owner === null) return;
      if (piece.at.kind !== 'corner') return;
      const key = islandOf(ctx, piece.at.id);
      if (!key) return;
      const d = seaData(ctx);
      const mine = (d.islands[piece.owner] ??= []);
      if (mine.includes(key)) return;
      mine.push(key);
      const bonus = ctx.setting<number>('islandBonus') ?? 0;
      if (ctx.state.phase.id === 'setup' || bonus <= 0) return;
      d.bonusVp[piece.owner] = (d.bonusVp[piece.owner] ?? 0) + bonus;
      ctx.emit({ type: 'islandBonus', player: piece.owner, island: key, vp: bonus });
    },
    afterAction(ctx) {
      const d = seaData(ctx);
      const owed = d.discoveryGold;
      if (!Object.keys(owed).length) return;
      d.discoveryGold = {};
      const ph = ctx.state.phase.id;
      if (ph === 'main' || ph === 'roadBuilding') startGoldPick(ctx, owed, ctx.state.phase);
    },
  },
  reducers: {
    hexYield(ctx, hex, piece, value) {
      if (hex.type !== 'gold' || piece.owner === null) return value;
      const n = ctx.registry.pieceTypes[piece.type]?.production ?? 0;
      if (n > 0) {
        const d = seaData(ctx);
        d.pendingGold[piece.owner] = (d.pendingGold[piece.owner] ?? 0) + n;
      }
      return value;
    },
    vp(ctx, seat, value) {
      return value + (seaData(ctx).bonusVp[seat] ?? 0);
    },
  },
};

export {
  canMoveShip,
  canPlaceShip,
  islandOf,
  islands,
  legalShipEdges,
  pirate,
  pirateEdges,
  seaData,
  shipIsOpen,
  MODULE_ID as SEAFARERS_ID,
  type GoldPhase,
  type SeaData,
} from './rules.ts';
export { pirateVictims } from './actions.ts';
export type { SeaData as SeafarersData };
