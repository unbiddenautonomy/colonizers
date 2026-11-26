import type { GameEvent } from '@colonizers/engine';

/**
 * How long bots take over their turns, so the people at the table can follow them. A bot moves
 * once what the last move set going on screen has finished, and a moment after.
 */
export const BOT_PACE = {
  /** The shortest time between two moves. */
  move: 650,
  /** How long a bot waits after the screen comes to rest: the dice have landed and the cards
   * they paid have arrived. */
  afterStill: 500,
} as const;

/**
 * How the screen shows a roll, in ms at normal motion. The web plays its animations from these;
 * an online room, which can't see anyone's screen, works out from them when a roll has finished.
 */
export const ROLL_SHOW = {
  /** The longest the dice take to land, stagger of the last die included. */
  diceMs: 1400,
  /** A produced card rising from its land, hanging there, then flying to its owner. */
  cardMs: 1900,
  /** Between one produced card setting off and the next. */
  staggerMs: 120,
  /** The most cards shown flying at once. */
  maxCards: 28,
} as const;

/**
 * How long the screen takes to show what a move did, as far as bots wait on it: the dice landing
 * and the cards a roll paid arriving. Nothing for a move that doesn't roll.
 */
export function rollShowMs(events: readonly GameEvent[]): number {
  if (!events.some((e) => e.type === 'rolled')) return 0;
  let cards = 0;
  for (const e of events) {
    if (e.type !== 'production') continue;
    const received = (e.received ?? {}) as Record<string, Record<string, number>>;
    for (const hand of Object.values(received))
      for (const n of Object.values(hand)) cards += Math.min(n, 6);
  }
  cards = Math.min(cards, ROLL_SHOW.maxCards);
  return ROLL_SHOW.diceMs + (cards ? (cards - 1) * ROLL_SHOW.staggerMs + ROLL_SHOW.cardMs : 0);
}
