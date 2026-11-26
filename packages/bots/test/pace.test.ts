import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@colonizers/engine';
import { ROLL_SHOW, rollShowMs } from '../src/index.ts';

const ev = (...es: object[]) => es as unknown as GameEvent[];

describe('how long a roll takes to show', () => {
  it('is nothing for a move that does not roll', () => {
    expect(rollShowMs(ev({ type: 'built' }))).toBe(0);
  });

  it('is the dice alone when the roll pays nobody', () => {
    expect(rollShowMs(ev({ type: 'rolled' }))).toBe(ROLL_SHOW.diceMs);
  });

  it('waits for the last card a roll pays to arrive', () => {
    const paid = ev(
      { type: 'rolled' },
      { type: 'production', received: { 0: { wood: 2 }, 2: { ore: 1, wheat: 1 } } },
    );
    expect(rollShowMs(paid)).toBe(ROLL_SHOW.diceMs + 3 * ROLL_SHOW.staggerMs + ROLL_SHOW.cardMs);
  });
});
