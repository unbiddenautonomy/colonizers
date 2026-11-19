import { describe, expect, it } from 'vitest';
import { boardFit, playersText } from './boardFit.ts';

describe('what a board needs', () => {
  it('is said in words', () => {
    expect(playersText({ min: 4, max: 4 })).toBe('4 players');
    expect(playersText({ min: 3, max: 4 })).toBe('3 or 4 players');
    expect(playersText({ min: 3, max: 6 })).toBe('3 to 6 players');
  });
});

describe('whether a board fits the room', () => {
  const three = { min: 3, max: 4 };

  it('fits when the players here are in range', () => {
    expect(boardFit(three, 3, 4)).toEqual({ ok: true });
  });

  it('can still be picked by a host setting up alone', () => {
    expect(boardFit(three, 1, 4)).toEqual({ ok: true, waiting: 'waiting for 3 or 4 players' });
  });

  it('says nothing about a board that only wants the usual second player', () => {
    expect(boardFit({ min: 2, max: 4 }, 1, 4)).toEqual({ ok: true });
  });

  it('is out when the room has too few seats for it', () => {
    expect(boardFit(three, 1, 2)).toEqual({ ok: false, why: 'needs 3 or 4 players' });
  });

  it('is out when too many players are here already', () => {
    expect(boardFit(three, 5, 6)).toEqual({ ok: false, why: 'needs 3 or 4 players' });
  });
});
