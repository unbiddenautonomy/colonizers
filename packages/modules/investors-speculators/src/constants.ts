export const MODULE_ID = 'investors';

/** Exchange rates run from 2:1 (plenty) to 6:1 (scarce), starting at 4:1. */
export const RATE_MIN = 2;
export const RATE_MAX = 6;
export const RATE_START = 4;

/** Finance actions (each card saved, each loan taken) allowed per turn. */
export const FINANCE_ACTIONS = 5;

/** On a 7 the roller shows this many of their own cards and draws this many from each rival. */
export const SEVEN_SHOW = 3;

/** Savings terms, in the saver's turns. */
export const SAVINGS_TERMS = [3, 5] as const;
export type SavingsTerm = (typeof SAVINGS_TERMS)[number];

/** What one saved card pays back, by term and the card's rate when it comes due. */
export function savingsReturn(term: SavingsTerm, rate: number): number {
  if (term === 3) return rate <= 3 ? 2 : 1;
  return rate <= 3 ? 3 : rate === 4 ? 2 : 1;
}

/** Resource loan terms, in the borrower's turns. */
export const LOAN_TERMS = [1, 3, 5, 7, 10] as const;
export type LoanTerm = (typeof LOAN_TERMS)[number];

/** Cards of the borrowed kind owed back (a 1-turn loan also owes one card of any kind). */
export const LOAN_REPAY: Record<LoanTerm, number> = { 1: 1, 3: 2, 5: 2, 7: 3, 10: 4 };

/** Bad debt points for a loan that isn't paid back. */
export const LOAN_PENALTY: Record<LoanTerm, number> = { 1: 1, 3: 1, 5: 2, 7: 2, 10: 3 };

/** One loan of a kind at a time, but up to this many of it in the turn it is taken. */
export const SAME_KIND_LOANS = 5;

/** Town loans: a settlement or city built free, paid back later. */
export const TOWN_TERMS = [3, 5, 7, 10] as const;
export type TownTerm = (typeof TOWN_TERMS)[number];
/**
 * What can be built on a town loan (where its expansion is in the game): the
 * build action it goes through, and the marker it takes from the box. A settler
 * takes a settlement marker.
 */
export const TOWN_ITEMS: Record<string, { action: string; marker: string; unit?: string }> = {
  settlement: { action: 'buildSettlement', marker: 'settlement' },
  city: { action: 'buildCity', marker: 'city' },
  harbor: { action: 'buildHarbor', marker: 'harbor' },
  settler: { action: 'buildSettler', marker: 'settlement' },
  cavalry: { action: 'buyUnit', marker: 'cavalry', unit: 'cavalry' },
  artillery: { action: 'buyUnit', marker: 'artillery', unit: 'artillery' },
};
export type TownItem = string;

/**
 * What a town loan costs back, in whole buildings, and whether 2 cards of one
 * more building's cost are added (the "and a half").
 */
export const TOWN_REPAY: Record<TownTerm, { times: number; half: boolean }> = {
  3: { times: 1, half: true },
  5: { times: 1, half: true },
  7: { times: 2, half: false },
  10: { times: 2, half: true },
};

/** Bad debt points for an unpaid town loan (the building stays). */
export const TOWN_PENALTY: Record<TownTerm, number> = { 3: 3, 5: 4, 7: 4, 10: 5 };

/** Town loan markers in the box: this many open for settlements, and as many for cities. */
export const TOWN_MARKERS = 10;
/** With 5 or 6 players there are twice as many. */
export const TOWN_MARKERS_BIG = 20;

/** With 5 or 6 players, a 7 lets everyone hold this many more cards. */
export const BIG_GAME_HAND = 3;

/** Derivatives each player holds. */
export const DERIVATIVES = 5;
/** A derivative costs 2 cards of one kind. */
export const DERIVATIVE_COST = 2;

/**
 * Loans a derivative can be placed on: the term, how many turns must still be
 * left, and the points it pays its holder if the loan isn't paid back.
 */
export const DERIVATIVE_TERMS: Record<number, { minLeft: number; pays: number }> = {
  5: { minLeft: 4, pays: 1 },
  7: { minLeft: 6, pays: 1 },
  10: { minLeft: 8, pays: 2 },
};

/** Gold for one resource with Explorers & Pirates, by the resource's market rate. */
export const goldPrice = (rate: number) => (rate >= 5 ? 3 : rate >= 3 ? 2 : 1);
