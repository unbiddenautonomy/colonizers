import { describe, expect, it } from 'vitest';
import type { GameState } from '@colonizers/engine';
import { cleanSettings, DEFAULT_SETTINGS } from '../src/protocol.ts';
import { buildConfig, library, timedSeats, timeoutAction } from '../src/rules.ts';

/**
 * The turn timer has to watch whoever the rules are waiting on, not just the
 * player whose turn it is. In the Special Building Phase they are not the
 * same, and an absent player used to hold the table up for good.
 */

const rand = () => 0.5;

function game(players: number, options: Record<string, unknown>): GameState {
  const settings = cleanSettings({
    ...DEFAULT_SETTINGS,
    options: { ...DEFAULT_SETTINGS.options, ...options },
  });
  const names = Array.from({ length: players }, (_, i) => `P${i + 1}`);
  return library.createGame({ ...buildConfig(settings, names, 'timer'), fixedSeats: true }).state;
}

function finishSetup(state: GameState): GameState {
  let s = state;
  while (s.phase.id === 'setup' || s.phase.id === 'start') {
    const seat = library.waitingOn(s)[0];
    if (seat === undefined) throw new Error(`Nobody can act in ${s.phase.id}`);
    const [a] = library.legalActions(s, seat);
    if (!a) throw new Error(`No setup move for ${seat}`);
    s = library.apply(s, a).state;
  }
  return s;
}

describe('turn timer', () => {
  it('watches the player who has to build in the Special Building Phase', () => {
    let s = finishSetup(game(6, { turnMode: 'specialBuild' }));
    const active = s.turn.player;
    expect(timedSeats(s)).toEqual([active]);

    s = library.apply(s, { type: 'roll', player: active }).state;
    while (s.phase.id !== 'main') {
      const seat = library.waitingOn(s)[0]!;
      s = library.apply(s, library.legalActions(s, seat)[0]!).state;
    }
    s = library.apply(s, { type: 'endTurn', player: active }).state;
    expect(s.phase.id).toBe('specialBuild');

    // The turn still belongs to the player who ended it, so the timer has to
    // look at the queue instead.
    const next = (s.phase.queue as number[])[0]!;
    expect(s.turn.player).toBe(active);
    expect(timedSeats(s)).toEqual([next]);

    const move = timeoutAction(s, next, rand);
    expect(move).toMatchObject({ type: 'endSpecialBuild', player: next });
    s = library.apply(s, move!).state;
    expect(library.stuck(s)).toBe(false);
  });

  it('plays something for every seat it is waiting on, in every step', () => {
    let s = finishSetup(game(4, {}));
    for (let i = 0; i < 400 && s.winner === null; i++) {
      const seats = timedSeats(s);
      expect(seats.length).toBeGreaterThan(0);
      const move = seats.map((seat) => timeoutAction(s, seat, rand)).find((a) => a);
      expect(move, `nothing to play in ${s.phase.id}`).toBeTruthy();
      s = library.apply(s, move!).state;
      expect(library.stuck(s)).toBe(false);
    }
  });
});
