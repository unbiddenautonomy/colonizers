import type { Action, ActionDef, Ctx, Phase } from '@colonizers/engine';
import {
  heldAlready,
  heldSoFar,
  releasedRoll,
  rewrapRoll,
  rollEventDie,
  type CkData,
} from '@colonizers/module-cities-knights';
import { action, civData, civView, owes, playsLater, seatOf } from './core.ts';

/**
 * Greece's Athenian Democracy: once every two rounds, on anyone's turn, throw
 * one, two or all of the dice again. When Greece can, each roll is held in a
 * `civDemocracy` step for Greece to keep or throw again; the second throw is
 * final.
 */

export interface Dice {
  red: number;
  yellow: number;
  event: string;
}

/** Which dice Greece may throw again: any one, any two, or all three. */
export const REROLLS = [
  'red',
  'yellow',
  'event',
  'red+yellow',
  'red+event',
  'yellow+event',
  'red+yellow+event',
] as const;

const ROUNDS_BETWEEN = 2;

type CkDice = Pick<CkData, 'alchemist' | 'forcedEvent'>;

/** The seat of a Greece who may throw the dice again now. */
export function democracySeat(ctx: Ctx): number | null {
  const seat = seatOf(ctx, 'greece');
  if (seat === null || !playsLater(ctx, seat, 'greece')) return null;
  const last = civView(ctx).democracy?.[seat];
  return last === undefined || ctx.state.turn.round >= last + ROUNDS_BETWEEN ? seat : null;
}

/** The name this power goes by while a roll is held. */
const DEMOCRACY = 'democracy';

function show(ctx: Ctx, dice: Dice): void {
  ctx.state.data.base = {
    ...(ctx.state.data.base as object),
    lastRoll: { dice: { ...dice }, total: dice.red + dice.yellow },
  };
}

function release(ctx: Ctx, roller: number, dice: Dice, returnTo: Phase, heldBefore: unknown): void {
  ctx.setPhase(returnTo);
  const d = ctx.state.data['cities-knights'] as CkDice;
  d.alchemist = { red: dice.red, yellow: dice.yellow };
  d.forcedEvent = dice.event as NonNullable<CkData['forcedEvent']>;
  ctx.registry.actions.roll!.apply(ctx, releasedRoll(roller, heldBefore, DEMOCRACY));
}

/** Holds the dice for Greece when Greece can throw them again. */
export function wrapRoll(prev: ActionDef): ActionDef {
  const wrapped: ActionDef = {
    ...prev,
    apply(ctx, a: Action) {
      const greece = democracySeat(ctx);
      // One go per roll: never again on a roll Greece has already held.
      if (heldAlready(a, DEMOCRACY) || greece === null) return prev.apply(ctx, a);
      const d = ctx.state.data['cities-knights'] as CkDice;
      const chosen = d.alchemist;
      d.alchemist = null;
      const event = d.forcedEvent ?? rollEventDie(ctx);
      d.forcedEvent = null;
      const dice: Dice = {
        red: chosen ? chosen.red : ctx.rng.int(1, 6),
        yellow: chosen ? chosen.yellow : ctx.rng.int(1, 6),
        event,
      };
      show(ctx, dice);
      ctx.emit({ type: 'civDiceHeld', player: greece, roller: a.player, ...dice });
      ctx.setPhase({
        id: 'civDemocracy',
        owed: { [greece]: 1 },
        roller: a.player,
        held: dice,
        returnTo: ctx.state.phase,
        released: heldSoFar(a),
      });
    },
  };
  return rewrapRoll(wrapped, prev);
}

const civDemocracy = action<{ dice: string }>({
  phases: ['civDemocracy'],
  check(ctx, a) {
    if (!owes(ctx, a.player)) return 'Not your dice';
    return a.dice === 'keep' || (REROLLS as readonly string[]).includes(a.dice)
      ? null
      : 'Pick the dice to throw again';
  },
  apply(ctx, a) {
    const ph = ctx.state.phase;
    const dice = { ...(ph.held as Dice) };
    if (a.dice !== 'keep') {
      (civData(ctx).democracy ??= {})[a.player] = ctx.state.turn.round;
      const which = a.dice.split('+');
      if (which.includes('red')) dice.red = ctx.rng.int(1, 6);
      if (which.includes('yellow')) dice.yellow = ctx.rng.int(1, 6);
      if (which.includes('event')) dice.event = rollEventDie(ctx);
      ctx.emit({ type: 'civDemocracy', player: a.player, dice: which, ...dice });
    }
    release(ctx, ph.roller as number, dice, ph.returnTo as Phase, ph.released);
  },
  enumerate(ctx, player) {
    if (!owes(ctx, player)) return [];
    return ['keep', ...REROLLS].map((dice) => ({ type: 'civDemocracy', player, dice }));
  },
});

export const diceActions: Record<string, ActionDef> = { civDemocracy };
