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
