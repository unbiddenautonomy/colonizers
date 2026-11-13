import type { Action, ActionDef, Ctx, Phase } from '@colonizers/engine';
import {
  ckData,
  holdsProgress,
  rewrapRoll,
  rollEventDie,
  type EventFace,
} from '@colonizers/module-cities-knights';
import { MODULE_ID } from './constants.ts';

/**
 * Indulgence: whoever holds it may re-roll any of the dice just thrown, on
 * anyone's turn, before anything from the roll is worked out. The second throw
 * is final.
 *
 * When a roll is made and someone holds an Indulgence, the dice are thrown but
 * held in an `indulgence` step. Each holder, in turn order from the roller,
 * plays the card or lets the roll stand. Once one plays it (or all pass), the
 * roll is worked out with those dice, through Cities & Knights' usual roll.
 */

export const INDULGENCE = 'indulgence';
export const DICE = ['red', 'yellow', 'event'] as const;
export type Die = (typeof DICE)[number];

/** The seven choices of dice to throw again, written like "red+event". */
export const REROLLS: string[] = [
  'red',
  'yellow',
  'event',
  'red+yellow',
  'red+event',
  'yellow+event',
  'red+yellow+event',
];

export interface HeldRoll {
  red: number;
  yellow: number;
  event: EventFace;
}

interface RollData extends Record<string, unknown> {
  /** Set while the held roll is being worked out, so the roll goes straight through. */
  releasing?: boolean;
}

/** Seats in turn order starting with `from`. */
function fromSeat(ctx: Ctx, from: number): number[] {
  const n = ctx.state.players.length;
  return Array.from({ length: n }, (_, i) => (from + i) % n);
}

function holders(ctx: Ctx, roller: number): number[] {
  return fromSeat(ctx, roller).filter((s) => holdsProgress(ctx, s, INDULGENCE));
}

const heldRoll = (ctx: Ctx): HeldRoll => ctx.state.phase.roll as HeldRoll;

function showDice(ctx: Ctx, r: HeldRoll): void {
  ctx.state.data.base = {
    ...(ctx.state.data.base as object),
    lastRoll: { dice: { yellow: r.yellow, red: r.red, event: r.event }, total: r.red + r.yellow },
  };
}

/** Works out the held roll through the usual roll. */
function release(ctx: Ctx): void {
  const ph = ctx.state.phase;
  const r = heldRoll(ctx);
  const d = ckData(ctx);
  d.alchemist = { red: r.red, yellow: r.yellow };
  d.forcedEvent = r.event;
  ctx.setPhase(ph.returnTo as Phase);
  const data = ctx.data<RollData>(MODULE_ID);
  data.releasing = true;
  try {
    ctx.registry.actions.roll!.apply(ctx, { type: 'roll', player: ph.roller as number });
  } finally {
    delete data.releasing;
  }
}

/** Indulgence played: throw the chosen dice again and work the roll out. */
export function playIndulgence(ctx: Ctx, seat: number, option: string): void {
  const r = { ...heldRoll(ctx) };
  const dice = option.split('+') as Die[];
  if (dice.includes('red')) r.red = ctx.rng.int(1, 6);
  if (dice.includes('yellow')) r.yellow = ctx.rng.int(1, 6);
  if (dice.includes('event')) r.event = rollEventDie(ctx);
  ctx.state.phase.roll = r;
  showDice(ctx, r);
  ctx.emit({
    type: 'indulgence',
    player: seat,
    dice,
    red: r.red,
    yellow: r.yellow,
    event: r.event,
  });
  release(ctx);
}

export function indulgenceTiming(ctx: Ctx, seat: number): string | null {
  const ph = ctx.state.phase;
  if (ph.id !== 'indulgence') return 'Play this right after any roll, before it is worked out';
  if (!(ph.owed as Record<number, number>)[seat]) return 'Not you';
  return null;
}

/** Lets the roll stand. */
const passIndulgence: ActionDef = {
  phases: ['indulgence'],
  check(ctx, a) {
    return (ctx.state.phase.owed as Record<number, number>)[a.player] ? null : 'Not you';
  },
  apply(ctx, a) {
    const owed = ctx.state.phase.owed as Record<number, number>;
    delete owed[a.player];
    if (!Object.keys(owed).length) release(ctx);
  },
  enumerate(ctx, player) {
    return (ctx.state.phase.owed as Record<number, number>)[player]
      ? [{ type: 'passIndulgence', player }]
      : [];
  },
};

export const indulgenceActions: Record<string, ActionDef> = { passIndulgence };

/** Holds a fresh roll for anyone with an Indulgence. */
export function wrapRoll(prev: ActionDef): ActionDef {
  return rewrapRoll(wrapped(prev), prev);
}

function wrapped(prev: ActionDef): ActionDef {
  return {
    ...prev,
    apply(ctx, a: Action) {
      const data = ctx.state.data[MODULE_ID] as RollData | undefined;
      const who = data?.releasing ? [] : holders(ctx, a.player);
      if (!who.length) return prev.apply(ctx, a);
      const d = ckData(ctx);
      const chosen = d.alchemist;
      d.alchemist = null;
      const r: HeldRoll = {
        red: chosen ? chosen.red : ctx.rng.int(1, 6),
        yellow: chosen ? chosen.yellow : ctx.rng.int(1, 6),
        event: d.forcedEvent ?? rollEventDie(ctx),
      };
      d.forcedEvent = null;
      showDice(ctx, r);
      ctx.emit({
        type: 'rollHeld',
        player: a.player,
        red: r.red,
        yellow: r.yellow,
        event: r.event,
      });
      ctx.setPhase({
        id: 'indulgence',
        roller: a.player,
        roll: r,
        owed: Object.fromEntries(who.map((s) => [s, 1])),
        returnTo: ctx.state.phase,
      });
    },
  };
}
