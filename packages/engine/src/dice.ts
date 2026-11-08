import type { Rng } from './rng.ts';

export interface DiceRoll {
  readonly dice: readonly [number, number];
  readonly total: number;
}

/** Standard 2d6 roll. Other dice sources (balanced dice, event die) arrive in phase 1. */
export function rollDice(rng: Rng): DiceRoll {
  const a = rng.int(1, 6);
  const b = rng.int(1, 6);
  return { dice: [a, b], total: a + b };
}
