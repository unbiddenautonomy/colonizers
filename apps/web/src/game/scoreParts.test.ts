import { describe, expect, it } from 'vitest';
import { scoreParts, type ScoreCtx } from './scoreParts.ts';

function fake(pieces: string[], vp: number, dev: string[] = []): ScoreCtx {
  return {
    piecesOf: () => pieces.map((type) => ({ type })),
    registry: { pieceTypes: { settlement: { vp: 1 }, city: { vp: 2 }, road: {} } },
    player: () => ({ held: { dev: dev.map((card) => ({ card })) } }),
    vp: () => vp,
  };
}

const none = { longestRoad: null, largestArmy: null, routeName: 'Longest Road' };

describe('where a player’s points came from', () => {
  it('counts the buildings', () => {
    const ctx = fake(['settlement', 'settlement', 'city', 'road'], 4);
    expect(scoreParts(ctx, 0, none)).toEqual([
      { what: '2 settlements', vp: 2 },
      { what: '1 city', vp: 2 },
    ]);
  });

  it('counts the awards, under the name this game uses', () => {
    const ctx = fake(['settlement'], 5);
    expect(
      scoreParts(ctx, 0, { longestRoad: 0, largestArmy: 0, routeName: 'Longest Trade Route' }),
    ).toEqual([
      { what: '1 settlement', vp: 1 },
      { what: 'Longest Trade Route', vp: 2 },
      { what: 'Largest Army', vp: 2 },
    ]);
  });

  it('counts victory point cards, which only show at the end', () => {
    const ctx = fake(['city'], 3, ['victoryPoint', 'knight']);
    expect(scoreParts(ctx, 0, none)).toEqual([
      { what: '1 city', vp: 2 },
      { what: '1 victory point card', vp: 1 },
    ]);
  });

  it('puts what an expansion adds in one line, so the parts add up', () => {
    const ctx = fake(['city'], 7);
    const parts = scoreParts(ctx, 0, none);
    expect(parts).toEqual([
      { what: '1 city', vp: 2 },
      { what: 'expansion points', vp: 5 },
    ]);
    expect(parts.reduce((t, p) => t + p.vp, 0)).toBe(7);
  });

  it('says so when a game takes points away', () => {
    expect(scoreParts(fake(['city'], 1), 0, none)).toEqual([
      { what: '1 city', vp: 2 },
      { what: 'points lost', vp: -1 },
    ]);
  });
});
