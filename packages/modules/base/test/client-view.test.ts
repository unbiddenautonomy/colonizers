import { describe, expect, it } from 'vitest';
import { stateFromView, type Action, type GameState } from '@colonizers/engine';
import { lib, newGame } from './helpers.ts';
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
      }
      const waiting = lib.waitingOn(s);
      const seat = waiting[Math.floor(rand() * waiting.length)]!;
      s = lib.apply(s, pickAction(lib.legalActions(s, seat), rand)).state;
    }
  }, 120_000);

  it('keeps hand and card counts for other players', () => {
    const s = newGame('counts', 3);
    const v = stateFromView(lib.view(s, 0));
    expect(v.decks.dev!.length).toBe(s.decks.dev!.length);
    expect(v.decks.dev!.every((c) => c === 'hidden')).toBe(true);
  });
});
