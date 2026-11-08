import type { Cards } from './types.ts';

export function cardsTotal(cards: Cards): number {
  return Object.values(cards).reduce((s, n) => s + n, 0);
}

export function addCards(a: Cards, b: Cards): Cards {
  const out = { ...a };
  for (const [c, n] of Object.entries(b)) out[c] = (out[c] ?? 0) + n;
  return out;
}

export function subtractCards(a: Cards, b: Cards): Cards {
  const out = { ...a };
  for (const [c, n] of Object.entries(b)) out[c] = (out[c] ?? 0) - n;
  return out;
}

/** Checks that a value from a client is a card map with positive whole counts of known cards. */
export function isCards(value: unknown, known: (card: string) => boolean): value is Cards {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.entries(value).every(
    ([c, n]) => known(c) && typeof n === 'number' && Number.isInteger(n) && n >= 0,
  );
}
