import type { Action, ActionDef, Ctx, DiceResult, Phase } from '@colonizers/engine';
import { rewrapRoll } from '@colonizers/module-cities-knights';
import { action, hasStage, markUsed, MODULE_ID, usedThisTurn } from './core.ts';

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
 * With Cities & Knights the event die is thrown once the number dice are
 * settled, so it is never thrown twice.
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
}

interface RollData extends Record<string, unknown> {
  releasing?: boolean;
}

const ck = (ctx: Ctx) => ctx.state.modules.includes('cities-knights');

interface CkDice extends Record<string, unknown> {
  alchemist?: { red: number; yellow: number } | null;
}

/** What the roller may do with the held dice. */
export function rerollChoices(ctx: Ctx, seat: number, dice: HeldDice): string[] {
  const out: string[] = [];
  if (hasStage(ctx, seat, 'colosseum', 3) && !usedThisTurn(ctx, seat, TITUS)) out.push('titus');
  if (hasStage(ctx, seat, 'machuPicchu', 3) && dice.a === dice.b)
    out.push('machu:a', 'machu:b', 'machu:both');
  return out;
}

function show(ctx: Ctx, dice: HeldDice): void {
  const shown = ck(ctx) ? { red: dice.a, yellow: dice.b } : { white1: dice.a, white2: dice.b };
  ctx.state.data.base = {
    ...(ctx.state.data.base as object),
    lastRoll: { dice: shown, total: dice.a + dice.b },
  };
}

/** Works the roll out with these number dice. */
function release(ctx: Ctx, seat: number, dice: HeldDice, returnTo: Phase): void {
  ctx.setPhase(returnTo);
  const data = ctx.data<RollData>(MODULE_ID);
  data.releasing = true;
  const roll = ctx.registry.actions.roll!;
  try {
    if (ck(ctx)) {
      (ctx.state.data['cities-knights'] as CkDice).alchemist = { red: dice.a, yellow: dice.b };
      roll.apply(ctx, { type: 'roll', player: seat });
    } else {
      // The base roll throws through ctx.rollDice: hand it these dice instead.
      const forced: DiceResult = {
        dice: { white1: dice.a, white2: dice.b },
        total: dice.a + dice.b,
      };
      const own = Object.getOwnPropertyDescriptor(ctx, 'rollDice');
      Object.defineProperty(ctx, 'rollDice', { value: () => forced, configurable: true });
      try {
        roll.apply(ctx, { type: 'roll', player: seat });
      } finally {
        if (own) Object.defineProperty(ctx, 'rollDice', own);
        else delete (ctx as unknown as Record<string, unknown>).rollDice;
      }
    }
  } finally {
    delete data.releasing;
  }
}

/** Holds a fresh roll when the roller can throw again. */
export function wrapRoll(prev: ActionDef): ActionDef {
  const wrapped: ActionDef = {
    ...prev,
    apply(ctx, a: Action) {
      const data = ctx.state.data[MODULE_ID] as RollData | undefined;
      const seat = a.player;
      const canHold = hasStage(ctx, seat, 'colosseum', 3) || hasStage(ctx, seat, 'machuPicchu', 3);
      if (data?.releasing || !canHold) return prev.apply(ctx, a);
      let dice: HeldDice;
      if (ck(ctx)) {
        const d = ctx.state.data['cities-knights'] as CkDice;
        const chosen = d.alchemist;
        d.alchemist = null;
        dice = chosen
          ? { a: chosen.red, b: chosen.yellow }
          : { a: ctx.rng.int(1, 6), b: ctx.rng.int(1, 6) };
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
      if (!rerollChoices(ctx, seat, dice).length) return release(ctx, seat, dice, ctx.state.phase);
      show(ctx, dice);
      ctx.emit({ type: 'wonderDiceHeld', player: seat, a: dice.a, b: dice.b });
      ctx.setPhase({ id: 'wonderRoll', roller: seat, held: dice, returnTo: ctx.state.phase });
    },
  };
  return rewrapRoll(wrapped, prev);
}

const held = (ctx: Ctx) => ctx.state.phase.held as HeldDice;

const keepRoll: ActionDef = {
  phases: ['wonderRoll'],
  check: (ctx, a) => (a.player === ctx.state.phase.roller ? null : 'Not your roll'),
  apply(ctx, a) {
    release(ctx, a.player, held(ctx), ctx.state.phase.returnTo as Phase);
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
    release(ctx, a.player, dice, ctx.state.phase.returnTo as Phase);
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

export const diceActions: Record<string, ActionDef> = { keepRoll, wonderReroll };

/** The two number dice of a roll, if it had two. */
export function numberDice(dice: Record<string, unknown>): [number, number] | null {
  const pair = typeof dice.red === 'number' ? [dice.red, dice.yellow] : [dice.white1, dice.white2];
  return typeof pair[0] === 'number' && typeof pair[1] === 'number' ? [pair[0], pair[1]] : null;
}
