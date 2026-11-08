import { describe as suite, expect, it } from 'vitest';
import { generateBoard } from '@colonizers/maps';
import { describe } from './describe.ts';
import { library } from './library.ts';
import { actorOf } from './useLocalGame.ts';

suite('local game helpers', () => {
  const { state } = library.createGame({
    seed: 'web',
    players: ['A', 'B', 'C'],
    modules: ['base'],
    map: generateBoard({ seed: 'web', players: 3 }).map,
    fixedSeats: true,
  });

  it('hands the device to whoever must act', () => {
    expect(actorOf(state)).toBe(0);
    const discarding = { ...state, phase: { id: 'discard', owed: { 2: 4, 1: 5 } } };
    expect(actorOf(discarding)).toBe(1);
    expect(actorOf({ ...state, winner: 0 })).toBeNull();
  });

  it('describes events in plain language', () => {
    const names = ['Ann', 'Ben', 'Cat'];
    expect(describe({ type: 'rolled', player: 1, total: 8 }, names)).toBe('Ben rolled 8.');
    expect(describe({ type: 'stole', thief: 0, victim: 2 }, names)).toBe(
      'Ann stole a card from Cat.',
    );
    expect(describe({ type: 'award', award: 'longestRoad', from: null, to: 2 }, names)).toBe(
      'Cat takes Longest Road!',
    );
    expect(describe({ type: 'phase' }, names)).toBeNull();
  });
});
