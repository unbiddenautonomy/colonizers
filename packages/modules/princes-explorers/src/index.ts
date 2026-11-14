import type { Action, ActionDef, Ctx, GameModule, HexId, Phase } from '@colonizers/engine';
import { robber, stealFrom } from '@colonizers/module-base';
import { BIG_GAME_HAND_LIMIT, MODULE_ID, PRINCE, ROBBER_MOVE_COST } from './constants.ts';
import {
  princeMoves,
  princesAtCorner,
  princesData,
  princesRouteWeight,
  princesVp,
  robberHex,
  robberTargets,
  robberVictims,
  startingHexes,
  swapNumbers,
  swapPairs,
} from './rules.ts';

/**
 * Princes & Explorers (Fürsten & Forscher, from siedlerinsel.wordpress.com),
 * a fan expansion for the base game:
 *
 * - **Four princes** stand on the board. A settlement or city next to a
 *   prince scores a point more for each prince it touches, and a road there
 *   counts double (triple between two) for the longest road.
 * - Whoever builds a settlement **moves a prince** one field, never across
 *   another player's road, onto another prince or onto the robber.
 * - A settlement built at a prince lets its builder **explore**: swap two
 *   neighbouring numbers, one of them at their own building, neither under a
 *   prince or the robber, and with no other player's road between them.
 * - The **robber** no longer stops production. Buildings next to it score
 *   nothing, and roads next to it drop out of the longest road. It comes in
 *   when someone first settles at the desert (or on the first 7), moves one
 *   to three fields on a 7 or for 1 ore, 1 wool and 1 grain, and its mover
 *   takes a card from anyone.
 * - No development cards, no Largest Army, and play to 14.
 */

export * from './constants.ts';
export {
  princeHexes,
  princeMoves,
  princesAtCorner,
  princesData,
  robberTargets,
  swapPairs,
  type PrincesData,
} from './rules.ts';

/** Defines an action with a typed payload. */
function action<T>(def: ActionDef<Action & T>): ActionDef {
  return def as unknown as ActionDef;
}

/** What a new settlement still sets off, in order. */
type Step = 'prince' | 'explore' | 'robber';

interface StepPhase extends Phase {
  id: 'princeMove' | 'explore' | 'princesRobber';
  by: number;
  then: Step[];
  returnTo: Phase;
}

const PHASE_OF: Record<Step, StepPhase['id']> = {
  prince: 'princeMove',
  explore: 'explore',
  robber: 'princesRobber',
};

function hasOptions(ctx: Ctx, step: Step, seat: number): boolean {
  if (step === 'prince') return princeMoves(ctx, seat).length > 0;
  if (step === 'explore') return swapPairs(ctx, seat).length > 0;
  return !robber(ctx);
}

/** Opens the next step that has something to do, or goes back to the game. */
function nextStep(ctx: Ctx, by: number, steps: Step[], returnTo: Phase): void {
  const rest = [...steps];
  while (rest.length) {
    const step = rest.shift() as Step;
    if (!hasOptions(ctx, step, by)) continue;
    ctx.setPhase({ id: PHASE_OF[step], by, then: rest, returnTo });
    return;
  }
  ctx.setPhase(returnTo);
}

const stepPhase = (ctx: Ctx) => ctx.state.phase as StepPhase;

const movePrince = action<{ prince: string; hex: HexId }>({
  phases: ['princeMove'],
  check(ctx, a) {
    if (a.player !== stepPhase(ctx).by) return 'Not yours to move';
    return princeMoves(ctx, a.player).some((m) => m.prince === a.prince && m.hex === a.hex)
      ? null
      : 'The prince can not go there';
  },
  apply(ctx, a) {
    const ph = stepPhase(ctx);
    const p = ctx.state.pieces[a.prince];
    if (!p) return;
    const from = p.at.kind === 'hex' ? p.at.id : null;
    ctx.move(p, { kind: 'hex', id: a.hex });
    ctx.emit({ type: 'princeMoved', player: a.player, from, to: a.hex });
    nextStep(ctx, ph.by, ph.then, ph.returnTo);
  },
  enumerate: (ctx, player) =>
    player === stepPhase(ctx).by
      ? princeMoves(ctx, player).map((m) => ({ type: 'movePrince', player, ...m }))
      : [],
});

const exploreSwap = action<{ hexes: [HexId, HexId] | null }>({
  phases: ['explore'],
  check(ctx, a) {
    if (a.player !== stepPhase(ctx).by) return 'Not your explorers';
    if (a.hexes === null) return null;
    const [x, y] = a.hexes;
    return swapPairs(ctx, a.player).some(([p, q]) => (p === x && q === y) || (p === y && q === x))
      ? null
      : 'Those numbers can not be swapped';
  },
  apply(ctx, a) {
    const ph = stepPhase(ctx);
    if (a.hexes) {
      const [x, y] = a.hexes;
      swapNumbers(ctx, x, y);
      ctx.emit({ type: 'explorersSwapped', player: a.player, hexes: [x, y] });
    }
    nextStep(ctx, ph.by, ph.then, ph.returnTo);
  },
  enumerate: (ctx, player) =>
    player === stepPhase(ctx).by
      ? [
          ...swapPairs(ctx, player).map((hexes) => ({ type: 'exploreSwap', player, hexes })),
          { type: 'exploreSwap', player, hexes: null },
        ]
      : [],
});

/** The first settler at the desert brings the robber in, anywhere but a prince's field. */
const placePrincesRobber = action<{ hex: HexId }>({
  phases: ['princesRobber'],
  check(ctx, a) {
    if (a.player !== stepPhase(ctx).by) return 'Not yours to place';
    return robberTargets(ctx, a.player).includes(a.hex) ? null : 'The robber can not go there';
  },
  apply(ctx, a) {
    const ph = stepPhase(ctx);
    ctx.place('robber', null, { kind: 'hex', id: a.hex });
    princesData(ctx).robberIn = true;
    ctx.emit({ type: 'robberMoved', player: a.player, hex: a.hex });
    nextStep(ctx, ph.by, ph.then, ph.returnTo);
  },
  enumerate: (ctx, player) =>
    player === stepPhase(ctx).by
      ? robberTargets(ctx, player).map((hex) => ({ type: 'placePrincesRobber', player, hex }))
      : [],
});

/** Move the robber without a 7, for 1 ore, 1 wool and 1 grain. */
const buyRobberMove = action<object>({
  phases: ['main'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    if (!robber(ctx)) return 'The robber is not on the board yet';
    if (!robberTargets(ctx, a.player).length) return 'The robber can not move';
    if (!ctx.has(a.player, ctx.cost('robberMove', a.player))) return 'You can not afford that';
    return null;
  },
  apply(ctx, a) {
    ctx.pay(a.player, ctx.cost('robberMove', a.player));
    ctx.emit({ type: 'robberBought', player: a.player });
    ctx.setPhase({ id: 'moveRobber', returnTo: 'main' });
  },
  enumerate: (ctx, player) => (player === ctx.active ? [{ type: 'buyRobberMove', player }] : []),
});

/** The robber goes by Princes & Explorers' rules, and its mover robs anyone. */
function wrapMoveRobber(prev: ActionDef): ActionDef {
  const stuck = (ctx: Ctx, seat: number) => !!robber(ctx) && !robberTargets(ctx, seat).length;
  return {
    ...prev,
    check(ctx, a) {
      if (a.player !== ctx.active) return 'Not your turn';
      const hex = a.hex as HexId;
      // Boxed in: it stays, and the card is still taken.
      if (stuck(ctx, a.player)) return hex === robberHex(ctx) ? null : 'The robber can not move';
      return robberTargets(ctx, a.player).includes(hex) ? null : 'The robber can not go there';
    },
    apply(ctx, a) {
      const returnTo = (ctx.state.phase.returnTo as string | undefined) ?? 'main';
      const hex = a.hex as HexId;
      const r = robber(ctx);
      if (hex !== robberHex(ctx)) {
        if (r) ctx.move(r, { kind: 'hex', id: hex });
        else ctx.place('robber', null, { kind: 'hex', id: hex });
        princesData(ctx).robberIn = true;
        ctx.emit({ type: 'robberMoved', player: a.player, hex });
      }
      const victims = robberVictims(ctx, a.player);
      if (victims.length === 0) ctx.setPhase({ id: returnTo });
      else if (victims.length === 1) {
        stealFrom(ctx, a.player, victims[0] as number);
        ctx.setPhase({ id: returnTo });
      } else ctx.setPhase({ id: 'steal', hex, candidates: victims, returnTo });
    },
    enumerate(ctx, player) {
      if (player !== ctx.active) return [];
      const hexes = stuck(ctx, player) ? [robberHex(ctx) as HexId] : robberTargets(ctx, player);
      return hexes.map((hex) => ({ type: 'moveRobber', player, hex }));
    },
  };
}

const noDevCards = (prev: ActionDef): ActionDef => ({
  ...prev,
  check: () => 'Princes & Explorers plays without development cards',
  enumerate: () => [],
});

/** A settlement just built: move a prince, maybe explore, maybe bring in the robber. */
function afterSettlement(ctx: Ctx, a: Action): void {
  const built = ctx.events.find(
    (e) => e.type === 'built' && e.piece === 'settlement' && e.player === a.player,
  );
  if (!built) return;
  const corner = built.at as string;
  const setup = a.type === 'placeSetupSettlement';
  const steps: Step[] = [];
  if (!setup) {
    steps.push('prince');
    if (princesAtCorner(ctx, corner) > 0) steps.push('explore');
  }
  const atDesert = (ctx.geometry.cornerHexes.get(corner as never) ?? []).some((h) => {
    const hex = ctx.state.hexes[h];
    return !!hex && ctx.isLand(h) && !ctx.registry.hexTypes[hex.type]?.produces;
  });
  if (atDesert && !robber(ctx) && !princesData(ctx).robberIn) steps.push('robber');
  if (steps.length) nextStep(ctx, a.player, steps, ctx.state.phase);
}

export const princesModule: GameModule = {
  id: MODULE_ID,
  name: 'Princes & Explorers',
  pieceTypes: {
    [PRINCE]: { on: 'hex' },
  },
  costs: {
    robberMove: ROBBER_MOVE_COST,
  },
  actions: { movePrince, exploreSwap, placePrincesRobber, buyRobberMove },
  wrapActions: {
    moveRobber: wrapMoveRobber,
    buyDevCard: noDevCards,
    playDevCard: noDevCards,
  },
  hooks: {
    init(ctx) {
      princesData(ctx);
      // The robber starts off the board.
      const r = robber(ctx);
      if (r) ctx.remove(r);
      for (const hex of startingHexes(ctx)) ctx.place(PRINCE, null, { kind: 'hex', id: hex });
    },
    afterAction: afterSettlement,
  },
  reducers: {
    vp: princesVp,
    routeWeight: princesRouteWeight,
    // The robber takes points, not production.
    hexBlocked: (ctx, hex, _piece, value) => value && robberHex(ctx) !== hex.id,
    handLimit: (ctx, _seat, value) =>
      ctx.playerCount >= 5 ? Math.max(value, BIG_GAME_HAND_LIMIT) : value,
  },
};
