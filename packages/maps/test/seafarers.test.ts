import { describe, expect, it } from 'vitest';
import { checkSeaBoard, generateSeaBoard, SEA_SCENARIOS } from '../src/index.ts';

describe('Seafarers boards', () => {
  for (const scenario of SEA_SCENARIOS) {
    it(`${scenario.name} passes its checks for every player count it supports`, () => {
      for (let players = scenario.players.min; players <= scenario.players.max; players++) {
        for (let i = 0; i < 25; i++) {
          const board = generateSeaBoard({ seed: `t${i}`, players, scenario: scenario.id });
          expect(checkSeaBoard(board, players), `${players}p seed t${i}`).toEqual([]);
        }
      }
    }, 120_000);
  }

  it('is deterministic for a seed', () => {
    const a = generateSeaBoard({ seed: 'same', players: 4, scenario: 'new-shores' });
    const b = generateSeaBoard({ seed: 'same', players: 4, scenario: 'new-shores' });
    expect(a).toEqual(b);
  });

  it('hides the outer sea in fog scenarios only', () => {
    const fog = generateSeaBoard({ seed: 'f', players: 4, scenario: 'fog-islands' });
    const clear = generateSeaBoard({ seed: 'f', players: 4, scenario: 'new-shores' });
    expect(fog.map.hexes.some((h) => h.hidden)).toBe(true);
    expect(clear.map.hexes.some((h) => h.hidden)).toBe(false);
  });
});
