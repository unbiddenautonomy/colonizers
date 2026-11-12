import { describe, expect, it } from 'vitest';
import { generateSpecialBoard, SPECIAL_MAPS, scaledTerrain } from '../src/index.ts';

describe('Special maps', () => {
  it('stretches the base mix to any board size', () => {
    for (const n of [13, 18, 19, 20, 30, 37]) {
      const t = scaledTerrain(n);
      expect(Object.values(t).reduce((s, v) => s + v, 0)).toBe(n);
    }
  });

  for (const spec of SPECIAL_MAPS) {
    it(`${spec.name} builds for every player count, 200 seeds each`, () => {
      for (let players = spec.players.min; players <= spec.players.max; players++) {
        for (let i = 0; i < 200; i++) {
          const b = generateSpecialBoard({ seed: `s${i}`, players, map: spec.id });
          expect(b.modules).toEqual(['base', ...spec.modules]);
          const land = b.map.hexes.filter((h) => h.type !== 'sea' && h.type !== 'lake');
          expect(land.length).toBeGreaterThan(10);
          if (spec.id === 'gold-rush')
            expect(land.filter((h) => h.type === 'gold').length).toBeGreaterThanOrEqual(3);
          if (spec.id === 'volcano')
            expect(land.some((h) => h.type === 'volcano' && h.token)).toBe(true);
          if (spec.id === 'lakes') {
            expect(b.map.hexes.some((h) => h.type === 'lake')).toBe(true);
            expect(b.map.harbors!.length).toBeGreaterThan(9);
          }
          if (spec.id === 'deep-forest') {
            const count = (t: string) => land.filter((h) => h.type === t).length;
            expect(count('forest')).toBeGreaterThan(count('hills') * 3);
          }
        }
        // The same seed gives the same board.
        expect(generateSpecialBoard({ seed: 'x', players, map: spec.id })).toEqual(
          generateSpecialBoard({ seed: 'x', players, map: spec.id }),
        );
      }
    });
  }
});
