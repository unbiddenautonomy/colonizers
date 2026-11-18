import { describe, expect, it } from 'vitest';
import { stateFromView, type Action, type GameState } from '@colonizers/engine';
import { giveCards, lib, newGame, quickSetup, rollTo } from './helpers.ts';
import { pickAction } from './simulate.ts';

const key = (a: Action) => JSON.stringify(a, Object.keys(a).sort());

// Confirming a trade checks the other player's hidden hand, so only the server
// can decide it. The browser shows the button once that player has accepted.
const SERVER_ONLY = new Set(['confirmTrade']);
const comparable = (actions: Action[]) =>
  actions
    .filter((a) => !SERVER_ONLY.has(a.type))
    .map(key)
    .sort();

/**
 * Online players only get their own view of the game. The browser rebuilds a
 * state from it to show legal moves, so those moves must match the server's.
 */
describe('legal moves from a player view', () => {
  it('match the full state at every step of a game', () => {
    let s: GameState = newGame('client-view', 4);
    let x = 7;
    const rand = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 1500 && s.winner === null; i++) {
      for (const seat of [0, 1, 2, 3]) {
        const fromView = stateFromView(lib.view(s, seat));
        const mine = comparable(lib.legalActions(fromView, seat));
        const real = comparable(lib.legalActions(s, seat));
        expect(mine, `step ${i} seat ${seat} phase ${s.phase.id}`).toEqual(real);
        // Asking about the seats whose hands are hidden must never throw: an
        // error there leaves an online player with a blank page.
        expect(
          () => lib.waitingOn(fromView),
          `step ${i} seat ${seat} phase ${s.phase.id}`,
        ).not.toThrow();
      }
      const waiting = lib.waitingOn(s);
      const seat = waiting[Math.floor(rand() * waiting.length)]!;
      s = lib.apply(s, pickAction(lib.legalActions(s, seat), rand)).state;
    }
  }, 120_000);

  it('copes with other players owing a discard after a 7', () => {
    let s = quickSetup(newGame('view-discard', 4));
    s = giveCards(s, 1, { brick: 4, lumber: 5 });
    s = giveCards(s, 2, { wool: 6, ore: 4 });
    s = rollTo(s, 7).state;
    const owed = (s.phase as unknown as { owed: Record<number, number> }).owed;
    expect(s.phase.id).toBe('discard');
    expect(Object.keys(owed).map(Number).sort()).toEqual([1, 2]);

    // Every player's browser, and a watcher's, sees the other hands only as counts.
    for (const viewer of [0, 1, 2, 3, null]) {
      const fromView = stateFromView(lib.view(s, viewer));
      for (const seat of [0, 1, 2, 3]) {
        const moves = lib.legalActions(fromView, seat);
        if (seat === viewer)
          expect(comparable(moves)).toEqual(comparable(lib.legalActions(s, seat)));
      }
      // The viewer is asked to act exactly when they owe cards themselves.
      const mustDiscard = viewer !== null && !!owed[viewer];
      expect(lib.waitingOn(fromView).includes(viewer as number), `viewer ${viewer}`).toBe(
        mustDiscard,
      );
    }
  });

  it('keeps hand and card counts for other players', () => {
    const s = newGame('counts', 3);
    const v = stateFromView(lib.view(s, 0));
    expect(v.decks.dev!.length).toBe(s.decks.dev!.length);
    expect(v.decks.dev!.every((c) => c === 'hidden')).toBe(true);
  });
});
