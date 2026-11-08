import { describe, expect, it } from 'vitest';
import { Rng } from '@colonizers/engine';
import { randomBaseMap } from '../src/index.ts';
import { lib, newGame } from './helpers.ts';
import { simulate } from './simulate.ts';

describe('random full games', () => {
  for (const players of [3, 4]) {
    it(`finish with no rule errors (${players} players, 15 games)`, () => {
      for (let g = 0; g < 15; g++) {
        const { state, turns } = simulate(newGame(`sim-${players}-${g}`, players), g + 1);
        expect(state.winner, `game ${g} after ${turns} turns`).not.toBeNull();
        expect(state.phase.id).toBe('gameOver');
      }
    }, 120_000);
  }

  it('replays exactly from seed and actions', () => {
    const config = {
      seed: 'replay',
      players: ['A', 'B', 'C', 'D'],
      modules: ['base'],
      map: randomBaseMap(Rng.fromSeed('replay-map')),
    };
    const initial = lib.createGame(config).state;
    const { state, actions } = simulate(initial, 99, 3000, false);
    const replayed = lib.replay(config, actions);
    expect(replayed).toEqual(state);
  }, 60_000);
});
