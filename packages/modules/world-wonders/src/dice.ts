import type { Action, ActionDef, Ctx, DiceResult, Phase } from '@colonizers/engine';
import {
  heldAlready,
  heldSoFar,
  releasedRoll,
  rewrapRoll,
  rollEventDie,
  type CkData,
} from '@colonizers/module-cities-knights';
import { action, hasStage, markUsed, usedThisTurn } from './core.ts';

/**
 * Wonders that change the dice:
 *
 * - **Colosseum III** (Emperor Titus' Dictate): once on each of your turns,
 *   throw the two number dice again.
 * - **Machu Picchu III** (Piedra Intihuatana): when you throw doubles, throw
 *   one or both number dice again.
 *
 * When the roller has either, the number dice are thrown and held in a
 * `wonderRoll` step before anything is worked out. The second throw is final.
 * - **Great Wall III** (The Cry of Meng Jiangnu): when the event die shows the
 *   barbarian ship, move the ship two spaces or none (Cities & Knights).
 *
 * With Cities & Knights the event die is thrown with the number dice and held
 * too; throwing again never throws it.
 *
 * Also here, read from the dice once they are worked out:
 *
 * - **Chichen Itza I** (Mayan Geometry): a 1 and 2, or a 1 and 3, gives the
 *   owner a resource of their choice.
 * - **Mausoleum III** (Siege of Halicarnassus): rolling a 6 or 8 lets you move
 *   the robber (or the pirate) this turn.
 */

export const TITUS = 'titus';
export const MACHU = 'machu';

export interface HeldDice {
  /** Red die with Cities & Knights, else the first white die. */
  a: number;
  b: number;
  /** The event die, with Cities & Knights. */
  event?: string;
}

/** Marks a roll these wonders have already held, so they hold it only once. */
const WONDERS = 'wonders';

const ck = (ctx: Ctx) => ctx.state.modules.includes('cities-knights');

type CkDice = Pick<CkData, 'alchemist' | 'forcedEvent' | 'shipSteps'>;

/** What the roller may do with the held dice. */
export function rerollChoices(ctx: Ctx, seat: number, dice: HeldDice): string[] {
  const out: string[] = [];
  if (hasStage(ctx, seat, 'colosseum', 3) && !usedThisTurn(ctx, seat, TITUS)) out.push('titus');
  if (hasStage(ctx, seat, 'machuPicchu', 3) && dice.a === dice.b)
    out.push('machu:a', 'machu:b', 'machu:both');
  return out;
}

/** Great Wall III: how far the roller may move the barbarian ship instead of one space. */
export function wallChoices(ctx: Ctx, seat: number, dice: HeldDice): number[] {
  if (dice.event !== 'ship' && dice.event !== 'wild') return [];
  if (ctx.state.phase.wall !== undefined) return [];
  return hasStage(ctx, seat, 'greatWall', 3) ? [0, 2] : [];
}

function show(ctx: Ctx, dice: HeldDice): void {
  const shown = ck(ctx)
    ? { red: dice.a, yellow: dice.b, ...(dice.event ? { event: dice.event } : {}) }
    : { white1: dice.a, white2: dice.b };
  ctx.state.data.base = {
    ...(ctx.state.data.base as object),
    lastRoll: { dice: shown, total: dice.a + dice.b },
  };
}

/** Works the roll out with these number dice. */
function release(
  ctx: Ctx,
  seat: number,
  dice: HeldDice,
  returnTo: Phase,
  heldBefore: unknown,
  steps?: number,
): void {
  ctx.setPhase(returnTo);
  const roll = ctx.registry.actions.roll!;
  const again = releasedRoll(seat, heldBefore, WONDERS);
  if (ck(ctx)) {
    const d = ctx.state.data['cities-knights'] as CkDice;
    d.alchemist = { red: dice.a, yellow: dice.b };
    if (dice.event) d.forcedEvent = dice.event as NonNullable<CkData['forcedEvent']>;
    if (steps !== undefined) d.shipSteps = steps;
    roll.apply(ctx, again);
  } else {
    // The base roll throws through ctx.rollDice: hand it these dice instead.
    const forced: DiceResult = {
      dice: { white1: dice.a, white2: dice.b },
      total: dice.a + dice.b,
    };
    const own = Object.getOwnPropertyDescriptor(ctx, 'rollDice');
    Object.defineProperty(ctx, 'rollDice', { value: () => forced, configurable: true });
    try {
      roll.apply(ctx, again);
    } finally {
      if (own) Object.defineProperty(ctx, 'rollDice', own);
      else delete (ctx as unknown as Record<string, unknown>).rollDice;
    }
  }
}

/** Holds a fresh roll when the roller can throw again. */
export function wrapRoll(prev: ActionDef): ActionDef {
  const wrapped: ActionDef = {
    ...prev,
    apply(ctx, a: Action) {
      const seat = a.player;
      const canHold =
        hasStage(ctx, seat, 'colosseum', 3) ||
        hasStage(ctx, seat, 'machuPicchu', 3) ||
        (ck(ctx) && hasStage(ctx, seat, 'greatWall', 3));
      // One go per roll: never again on a roll these wonders have already held.
      if (heldAlready(a, WONDERS) || !canHold) return prev.apply(ctx, a);
      let dice: HeldDice;
      if (ck(ctx)) {
        const d = ctx.state.data['cities-knights'] as CkDice;
        const chosen = d.alchemist;
        d.alchemist = null;
        dice = chosen
          ? { a: chosen.red, b: chosen.yellow }
          : { a: ctx.rng.int(1, 6), b: ctx.rng.int(1, 6) };
        dice.event = d.forcedEvent ?? rollEventDie(ctx);
        d.forcedEvent = null;
      } else {
        const r = ctx.rollDice();
        const w1 = r.dice.white1;
        const w2 = r.dice.white2;
        // Event cards and the like have no two dice to throw again.
        if (typeof w1 !== 'number' || typeof w2 !== 'number') {
          const own = Object.getOwnPropertyDescriptor(ctx, 'rollDice');
          Object.defineProperty(ctx, 'rollDice', { value: () => r, configurable: true });
          try {
            return prev.apply(ctx, a);
          } finally {
            if (own) Object.defineProperty(ctx, 'rollDice', own);
            else delete (ctx as unknown as Record<string, unknown>).rollDice;
          }
        }
        dice = { a: w1, b: w2 };
      }
      if (!rerollChoices(ctx, seat, dice).length && !wallChoices(ctx, seat, dice).length)
        return release(ctx, seat, dice, ctx.state.phase, heldSoFar(a));
      show(ctx, dice);
      ctx.emit({ type: 'wonderDiceHeld', player: seat, a: dice.a, b: dice.b });
      ctx.setPhase({
        id: 'wonderRoll',
        roller: seat,
        held: dice,
        returnTo: ctx.state.phase,
        released: heldSoFar(a),
      });
    },
  };
  return rewrapRoll(wrapped, prev);
}

const held = (ctx: Ctx) => ctx.state.phase.held as HeldDice;
const wallSteps = (ctx: Ctx) => ctx.state.phase.wall as number | undefined;
/** The powers that have already held this roll. */
const heldBy = (ctx: Ctx) => ctx.state.phase.released;

const keepRoll: ActionDef = {
  phases: ['wonderRoll'],
  check: (ctx, a) => (a.player === ctx.state.phase.roller ? null : 'Not your roll'),
  apply(ctx, a) {
    release(
      ctx,
      a.player,
      held(ctx),
      ctx.state.phase.returnTo as Phase,
      heldBy(ctx),
      wallSteps(ctx),
    );
  },
  enumerate: (ctx, player) =>
    player === ctx.state.phase.roller ? [{ type: 'keepRoll', player }] : [],
};

const wonderReroll = action<{ use: string }>({
  phases: ['wonderRoll'],
  check(ctx, a) {
    if (a.player !== ctx.state.phase.roller) return 'Not your roll';
    return rerollChoices(ctx, a.player, held(ctx)).includes(a.use)
      ? null
      : 'You can not throw those again';
  },
  apply(ctx, a) {
    const dice = { ...held(ctx) };
    const which = a.use === 'titus' || a.use === 'machu:both' ? 'both' : a.use.slice(6);
    if (which === 'both' || which === 'a') dice.a = ctx.rng.int(1, 6);
    if (which === 'both' || which === 'b') dice.b = ctx.rng.int(1, 6);
    if (a.use === 'titus') markUsed(ctx, a.player, TITUS);
    show(ctx, dice);
    ctx.emit({
      type: 'wonderReroll',
      player: a.player,
      wonder: a.use === 'titus' ? 'colosseum' : 'machuPicchu',
      a: dice.a,
      b: dice.b,
    });
    release(ctx, a.player, dice, ctx.state.phase.returnTo as Phase, heldBy(ctx), wallSteps(ctx));
  },
  enumerate(ctx, player) {
    if (player !== ctx.state.phase.roller) return [];
    return rerollChoices(ctx, player, held(ctx)).map((use) => ({
      type: 'wonderReroll',
      player,
      use,
    }));
  },
});

/** Great Wall III: the barbarian ship moves two spaces, or stays. */
const wonderWall = action<{ steps: number }>({
  phases: ['wonderRoll'],
  check(ctx, a) {
    if (a.player !== ctx.state.phase.roller) return 'Not your roll';
    return wallChoices(ctx, a.player, held(ctx)).includes(a.steps)
      ? null
      : 'The barbarian ship moves one space';
  },
  apply(ctx, a) {
    ctx.state.phase.wall = a.steps;
    ctx.emit({ type: 'wonderWall', player: a.player, steps: a.steps });
    // With nothing left to choose, the roll goes on.
    if (!rerollChoices(ctx, a.player, held(ctx)).length)
      release(ctx, a.player, held(ctx), ctx.state.phase.returnTo as Phase, heldBy(ctx), a.steps);
  },
  enumerate(ctx, player) {
    if (player !== ctx.state.phase.roller) return [];
    return wallChoices(ctx, player, held(ctx)).map((steps) => ({
      type: 'wonderWall',
      player,
      steps,
    }));
  },
});

export const diceActions: Record<string, ActionDef> = { keepRoll, wonderReroll, wonderWall };

/** The two number dice of a roll, if it had two. */
export function numberDice(dice: Record<string, unknown>): [number, number] | null {
  const pair = typeof dice.red === 'number' ? [dice.red, dice.yellow] : [dice.white1, dice.white2];
  return typeof pair[0] === 'number' && typeof pair[1] === 'number' ? [pair[0], pair[1]] : null;
}
