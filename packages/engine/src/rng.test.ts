import { describe, expect, it } from 'vitest';
import { Rng, hashSeed, rollDice } from './index.ts';

describe('Rng', () => {
  it('is deterministic for the same seed', () => {
    const a = Rng.fromSeed('game-1');
    const b = Rng.fromSeed('game-1');
    const seqA = Array.from({ length: 100 }, () => a.nextUint32());
    const seqB = Array.from({ length: 100 }, () => b.nextUint32());
    expect(seqA).toEqual(seqB);
  });

  it('differs for different seeds', () => {
    const a = Rng.fromSeed('game-1');
    const b = Rng.fromSeed('game-2');
    expect(a.nextUint32()).not.toBe(b.nextUint32());
  });

  it('resumes exactly from a saved state', () => {
    const rng = Rng.fromSeed('resume');
    for (let i = 0; i < 50; i++) rng.nextUint32();
    const saved = rng.getState();
    const expected = Array.from({ length: 20 }, () => rng.nextUint32());
    const resumed = Rng.fromState(saved);
    expect(Array.from({ length: 20 }, () => resumed.nextUint32())).toEqual(expected);
  });

  it('keeps int() inside its bounds', () => {
    const rng = Rng.fromSeed('bounds');
    for (let i = 0; i < 10_000; i++) {
      const x = rng.int(3, 9);
      expect(x).toBeGreaterThanOrEqual(3);
      expect(x).toBeLessThanOrEqual(9);
    }
  });

  it('rejects invalid ranges', () => {
    const rng = Rng.fromSeed('bad');
    expect(() => rng.int(5, 1)).toThrow(RangeError);
    expect(() => rng.int(0.5, 2)).toThrow(RangeError);
  });

  it('shuffles without losing or duplicating items', () => {
    const rng = Rng.fromSeed('shuffle');
    const items = Array.from({ length: 19 }, (_, i) => i);
    const shuffled = rng.shuffle(items);
    expect(shuffled).not.toEqual(items);
    expect([...shuffled].sort((x, y) => x - y)).toEqual(items);
  });

  it('hashSeed returns four uint32s', () => {
    const state = hashSeed('anything');
    expect(state).toHaveLength(4);
    for (const n of state) expect(n >>> 0).toBe(n);
  });
});

describe('rollDice', () => {
  it('produces a roughly fair 2d6 distribution', () => {
    const rng = Rng.fromSeed('dice');
    const counts = new Map<number, number>();
    const n = 36_000;
    for (let i = 0; i < n; i++) {
      const { dice, total } = rollDice(rng);
      expect(dice[0] + dice[1]).toBe(total);
      counts.set(total, (counts.get(total) ?? 0) + 1);
    }
    // Expected count for total t is n * ways(t) / 36; allow 10% slack.
    for (let t = 2; t <= 12; t++) {
      const ways = 6 - Math.abs(7 - t);
      const expected = (n * ways) / 36;
      expect(Math.abs((counts.get(t) ?? 0) - expected)).toBeLessThan(expected * 0.1);
    }
  });
});
