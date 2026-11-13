import {
  cardsTotal,
  isCards,
  type Action,
  type ActionDef,
  type Ctx,
  type GameModule,
  type HexId,
  type Phase,
} from '@colonizers/engine';
import { publicVp, robberHexes } from '@colonizers/module-base';
import {
  eventData,
  eventPick,
  quakeRoad,
  quakeSettlement,
  repairRoad,
  startEventPicks,
  turnEventCard,
} from './events.ts';

import {
  duelActions,
  duelAfterAction,
  duelBuild,
  duelOn,
  duelReroll,
  duelRoll,
  placeNeutrals,
} from './duel.ts';

export * from './events.ts';
export * from './duel.ts';

/**
 * Options and house rules, each switched on in the game settings:
 *
 * - `turnMode: 'specialBuild'`: after each turn, every other player in order
 *   may build or buy development cards (no trading, no playing cards).
 * - `turnMode: 'paired'`: during each turn, the player across the table (the
 *   partner) may also build and trade with the bank once the dice are rolled.
 * - `friendlyRobber`: the robber can't go next to a player with 2 or fewer
 *   points showing, unless every hex is like that.
 * - `balancedDice`: the dice come from a shuffled deck of all 36 outcomes.
 * - `robberFreeRounds`: for the first N rounds a 7 does nothing.
 * - `gifting`: on your turn you may give cards to another player.
 * - `eventCards`: a deck of 36 event cards replaces the dice (see events.ts).
 * - `harbormaster`: the first player with 3 points of buildings on harbors
 *   (settlement 1, city 2) takes a 2-point bonus; anyone with more takes it.
 * - `twoPlayer`: duel rules for two players (see duel.ts).
 *
 * List this module before Cities & Knights so its event dice win.
 */

export const MODULE_ID = 'variants';
export type TurnMode = 'normal' | 'specialBuild' | 'paired';

interface VariantsData {
  /** Dice outcomes still in the balanced-dice deck, as [a, b] pairs. */
  deck: [number, number][];
  /** Reshuffle when this many are left (5 to 10). */
  reshuffleAt: number;
  /** For everyone's screens: how many are left. */
  left: number;
  /** Who holds the Harbormaster bonus. */
  harbormaster: number | null;
}

function vData(ctx: Ctx): VariantsData {
  ctx.state.data[MODULE_ID] ??= { deck: [], reshuffleAt: 0, left: 0, harbormaster: null };
  return ctx.state.data[MODULE_ID] as unknown as VariantsData;
}

export function turnMode(ctx: Ctx): TurnMode {
  const m = ctx.setting<string>('turnMode');
  return m === 'specialBuild' || m === 'paired' ? m : 'normal';
}

/** The partner who builds during `seat`'s turn in paired mode: the player across the table. */
export function partnerOf(seat: number, players: number): number | null {
  if (players < 4) return null;
  return (seat + Math.floor(players / 2)) % players;
}

interface SpecialBuildPhase extends Phase {
  id: 'specialBuild';
  /** Players still to build, first one is building now. */
  queue: number[];
  /** Whose turn just ended. */
  ender: number;
}

/** Runs `fn` as if `seat` were the active player in the main phase, then puts things back. */
function asBuilder<T>(ctx: Ctx, seat: number, fn: () => T): T {
  const turn = ctx.state.turn.player;
  const phase = ctx.state.phase;
  ctx.state.turn.player = seat;
  ctx.state.phase = { id: 'main' };
  try {
    return fn();
  } finally {
    ctx.state.turn.player = turn;
    // Keep any new phase the action started (gold picks); otherwise restore ours.
    if (ctx.state.phase.id === 'main') ctx.state.phase = phase;
  }
}

/** Who may build out of turn right now, if anyone. */
function outOfTurnBuilder(ctx: Ctx, kind: 'build' | 'bank'): number | null {
  const ph = ctx.state.phase;
  if (ph.id === 'specialBuild' && kind === 'build')
    return (ph as SpecialBuildPhase).queue[0] ?? null;
  if (ph.id === 'main' && turnMode(ctx) === 'paired' && !openTrade(ctx))
    return partnerOf(ctx.active, ctx.playerCount);
  return null;
}

function openTrade(ctx: Ctx): boolean {
  return !!(ctx.state.data.base as { trade?: unknown } | undefined)?.trade;
}

const BUILD_ACTIONS = ['buildRoad', 'buildSettlement', 'buildCity', 'buyDevCard'];

function wrapBuild(kind: 'build' | 'bank') {
  return (prev: ActionDef): ActionDef => ({
    ...prev,
    ...(prev.phases && { phases: [...prev.phases, 'specialBuild'] }),
    check(ctx, a) {
      const builder = outOfTurnBuilder(ctx, kind);
      if (builder !== null && a.player === builder && a.player !== ctx.active)
        return asBuilder(ctx, builder, () => prev.check(ctx, a));
      if (ctx.state.phase.id === 'specialBuild') return 'Wait for your turn to build';
      return prev.check(ctx, a);
    },
    apply(ctx, a) {
      const builder = outOfTurnBuilder(ctx, kind);
      if (builder !== null && a.player === builder && a.player !== ctx.active) {
        asBuilder(ctx, builder, () => prev.apply(ctx, a));
        return;
      }
      prev.apply(ctx, a);
    },
    enumerate(ctx, player) {
      const builder = outOfTurnBuilder(ctx, kind);
      if (builder !== null && player === builder && player !== ctx.active)
        return asBuilder(ctx, builder, () => prev.enumerate?.(ctx, player) ?? []);
      if (ctx.state.phase.id === 'specialBuild') return [];
      return prev.enumerate?.(ctx, player) ?? [];
    },
  });
}

/** The end of turn from the modules below, kept so the Special Building Phase can finish it. */
const BELOW = Symbol('endTurnBelow');
type WithBelow = ActionDef & { [BELOW]?: ActionDef };

function finishTurn(ctx: Ctx, ender: number): void {
  const below = (ctx.registry.actions.endTurn as WithBelow | undefined)?.[BELOW];
  ctx.setPhase({ id: 'main' });
  below?.apply(ctx, { type: 'endTurn', player: ender });
}

const endSpecialBuild: ActionDef = {
  phases: ['specialBuild'],
  check(ctx, a) {
    const ph = ctx.state.phase as SpecialBuildPhase;
    return ph.queue[0] === a.player ? null : 'Not your turn to build';
  },
  apply(ctx, a) {
    const ph = ctx.state.phase as SpecialBuildPhase;
    const queue = ph.queue.slice(1);
    ctx.emit({ type: 'specialBuildDone', player: a.player });
    if (queue.length) ctx.setPhase({ ...ph, queue });
    else finishTurn(ctx, ph.ender);
  },
  enumerate(ctx, player) {
    const ph = ctx.state.phase as SpecialBuildPhase;
    return ph.queue[0] === player ? [{ type: 'endSpecialBuild', player }] : [];
  },
};

// ---- Gifts ----

const giveCards: ActionDef = {
  phases: ['main'],
  check(ctx, a) {
    if (!ctx.setting<boolean>('gifting')) return 'Gifts are not on in this game';
    if (a.player !== ctx.active) return 'Not your turn';
    const to = a.to as number;
    if (typeof to !== 'number' || to === a.player || !ctx.state.players[to])
      return 'Pick who gets the gift';
    const cards = a.cards as Record<string, number>;
    if (!isCards(cards, (c) => !!ctx.registry.cardTypes[c]) || cardsTotal(cards) < 1)
      return 'Pick at least one card';
    if (!ctx.has(a.player, cards)) return 'You do not have those cards';
    return null;
  },
  apply(ctx, a) {
    ctx.transfer(a.player, a.to as number, a.cards as Record<string, number>);
    ctx.emit({ type: 'gifted', from: a.player, to: a.to, cards: a.cards });
  },
};

// ---- Dice ----

function standardRoll(ctx: Ctx): [number, number] {
  return [ctx.rng.int(1, 6), ctx.rng.int(1, 6)];
}

function balancedRoll(ctx: Ctx): [number, number] {
  const d = vData(ctx);
  if (d.deck.length <= d.reshuffleAt) {
    const deck: [number, number][] = [];
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) deck.push([a, b]);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = ctx.rng.int(0, i);
      [deck[i], deck[j]] = [deck[j]!, deck[i]!];
    }
    d.deck = deck;
    d.reshuffleAt = ctx.rng.int(5, 10);
    ctx.emit({ type: 'diceShuffled' });
  }
  const pair = d.deck.pop()!;
  d.left = d.deck.length;
  return pair;
}

export const variantsModule: GameModule = {
  id: MODULE_ID,
  name: 'Options and house rules',
  requires: ['base'],
  settings: {
    turnMode: 'normal',
    friendlyRobber: false,
    balancedDice: false,
    robberFreeRounds: 0,
    gifting: false,
    harbormaster: false,
    eventCards: false,
    twoPlayer: false,
  },
  actions: { endSpecialBuild, giveCards, eventPick, repairRoad, ...duelActions },
  dice(ctx) {
    if (ctx.setting<boolean>('eventCards')) {
      const card = turnEventCard(ctx);
      return { dice: { card: card.total }, total: card.total };
    }
    const [a, b] = duelReroll(ctx, () =>
      ctx.setting<boolean>('balancedDice') ? balancedRoll(ctx) : standardRoll(ctx),
    );
    return { dice: { white1: a, white2: b }, total: a + b };
  },
  wrapActionsIfPresent: {
    buildShip: wrapBuild('build'),
    buildBridge: wrapBuild('build'),
  },
  wrapActions: {
    ...Object.fromEntries(BUILD_ACTIONS.map((t) => [t, wrapBuild('build')])),
    buildRoad: (prev) => duelBuild('road')(wrapBuild('build')(quakeRoad(prev))),
    buildSettlement: (prev) => duelBuild('settlement')(wrapBuild('build')(quakeSettlement(prev))),
    bankTrade: wrapBuild('bank'),
    endTurn: (prev): ActionDef => {
      const def: WithBelow = {
        ...prev,
        apply(ctx, a) {
          if (turnMode(ctx) !== 'specialBuild' || openTrade(ctx)) return prev.apply(ctx, a);
          const n = ctx.playerCount;
          const queue = Array.from({ length: n - 1 }, (_, i) => (a.player + 1 + i) % n);
          (ctx.state.data.base as { trade?: unknown }).trade = null;
          ctx.setPhase({ id: 'specialBuild', queue, ender: a.player });
          ctx.emit({ type: 'specialBuildStarted', after: a.player });
        },
      };
      def[BELOW] = prev;
      return def;
    },
    moveRobber: (prev): ActionDef => ({
      ...prev,
      check(ctx, a) {
        const err = prev.check(ctx, a);
        if (err || !ctx.setting<boolean>('friendlyRobber')) return err;
        const hex = a.hex as HexId;
        if (!ctx.isLand(hex) || !protectedHex(ctx, hex, a.player)) return null;
        const elsewhere = robberHexes(ctx).some(
          (h) => ctx.isLand(h) && !protectedHex(ctx, h, a.player),
        );
        return elsewhere
          ? 'Friendly robber: that hex touches a player with 2 or fewer points'
          : null;
      },
    }),
    roll: (prev): ActionDef =>
      duelRoll({
        ...prev,
        apply(ctx, a) {
          prev.apply(ctx, a);
          const quiet = ctx.setting<number>('robberFreeRounds') ?? 0;
          const last = (ctx.state.data.base as { lastRoll?: { total: number } }).lastRoll;
          const id = ctx.state.phase.id;
          if (
            quiet > ctx.state.turn.round &&
            last?.total === 7 &&
            (id === 'discard' || id === 'moveRobber')
          ) {
            ctx.setPhase({ id: 'main' });
            ctx.emit({ type: 'robberResting', rounds: quiet });
          }
          if (ctx.setting<boolean>('eventCards')) {
            eventData(ctx).epidemic = false;
            startEventPicks(ctx);
          }
        },
      }),
  },
  hooks: {
    init(ctx) {
      vData(ctx);
      if (duelOn(ctx)) placeNeutrals(ctx);
    },
    afterAction(ctx, a) {
      if (ctx.setting<boolean>('harbormaster')) updateHarbormaster(ctx);
      duelAfterAction(ctx, a);
    },
  },
  reducers: {
    vp(ctx, seat, value) {
      return vData(ctx).harbormaster === seat ? value + HARBORMASTER_VP : value;
    },
    hexYield(ctx, _hex, piece, value) {
      // Epidemic: each city pays only one card this roll.
      if (piece.type !== 'city' || !eventData(ctx)?.epidemic) return value;
      return Object.fromEntries(Object.entries(value).map(([c, n]) => [c, Math.min(n, 1)]));
    },
  },
  redact(data) {
    const d = data as unknown as VariantsData;
    return { ...d, deck: [], eventDeck: [] } as unknown as Record<string, unknown>;
  },
};

// ---- Harbormaster ----

export const HARBORMASTER_MIN = 3;
export const HARBORMASTER_VP = 2;

/** Points of buildings each player has on harbor corners: 1 per settlement, 2 per city. */
export function harborPoints(ctx: Ctx): number[] {
  const corners = new Set<string>();
  for (const h of ctx.state.harbors)
    for (const c of ctx.geometry.edgeCorners.get(h.edge) ?? []) corners.add(c);
  const out = ctx.state.players.map(() => 0);
  for (const c of corners) {
    const b = ctx.buildingAt(c as never);
    if (b && b.owner !== null) out[b.owner]! += b.type === 'city' ? 2 : 1;
  }
  return out;
}

export function harbormasterOf(ctx: Ctx): number | null {
  return vData(ctx).harbormaster ?? null;
}

function updateHarbormaster(ctx: Ctx): void {
  const d = vData(ctx);
  const points = harborPoints(ctx);
  const holder = d.harbormaster ?? null;
  const max = Math.max(...points);
  let next = holder;
  if (holder !== null && points[holder]! < HARBORMASTER_MIN) next = null;
  const leaders = points.flatMap((p, s) => (p === max ? [s] : []));
  if (max >= HARBORMASTER_MIN && leaders.length === 1 && (next === null || max > points[next]!))
    next = leaders[0]!;
  if (next !== holder) {
    d.harbormaster = next;
    ctx.emit({ type: 'award', award: 'harbormaster', from: holder, to: next, points: max });
  }
}

/** A land hex touching a player (other than the mover) who has 2 or fewer points showing. */
function protectedHex(ctx: Ctx, hex: HexId, mover: number): boolean {
  for (const c of ctx.geometry.hexCorners.get(hex) ?? []) {
    const b = ctx.buildingAt(c);
    if (b && b.owner !== null && b.owner !== mover && publicVp(ctx, b.owner) <= 2) return true;
  }
  return false;
}

export function isOutOfTurnAction(action: Action): boolean {
  return action.type === 'endSpecialBuild';
}
