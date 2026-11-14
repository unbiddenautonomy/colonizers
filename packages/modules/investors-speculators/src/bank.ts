import type { Action, Cards, Ctx } from '@colonizers/engine';
import { RESOURCES } from '@colonizers/module-base';
import {
  FINANCE_ACTIONS,
  LOAN_PENALTY,
  LOAN_REPAY,
  LOAN_TERMS,
  SAME_KIND_LOANS,
  SAVINGS_TERMS,
  savingsReturn,
  TOWN_REPAY,
  type LoanTerm,
  type TownTerm,
  type SavingsTerm,
} from './constants.ts';
import {
  action,
  financeUsed,
  investorsData,
  isResource,
  isTownLoan,
  loansOf,
  onlyActive,
  rateOf,
  total,
  useFinance,
  type Loan,
  type Resource,
} from './rules.ts';

/**
 * The bank: save a card for 3 or 5 turns and get it back with interest that
 * follows its exchange rate, or borrow a card now and pay it back with
 * interest later. A loan that comes due must be paid that turn, or it turns
 * into bad debt: minus points that stay for the game.
 */

const inMain = (ctx: Ctx) => (ctx.state.phase.id === 'main' ? null : 'Only in your main turn');

export function financeLeft(ctx: Ctx): string | null {
  return financeUsed(ctx) < FINANCE_ACTIONS
    ? null
    : `Only ${FINANCE_ACTIONS} finance actions a turn`;
}

export const saveCard = action<{ card: Resource; term: SavingsTerm }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a) ?? financeLeft(ctx);
    if (err) return err;
    if (!isResource(a.card)) return 'Pick a resource';
    if (!(SAVINGS_TERMS as readonly unknown[]).includes(a.term)) return 'Save for 3 or 5 turns';
    return ctx.has(a.player, { [a.card]: 1 }) ? null : `You have no ${a.card}`;
  },
  apply(ctx, a) {
    const d = investorsData(ctx);
    ctx.pay(a.player, { [a.card]: 1 });
    d.savings.push({
      id: `s${d.nextId++}`,
      seat: a.player,
      card: a.card,
      term: a.term,
      left: a.term,
    });
    useFinance(ctx);
    ctx.emit({ type: 'cardSaved', player: a.player, card: a.card, term: a.term });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || financeLeft(ctx)) return [];
    const hand = ctx.player(player).hand;
    return RESOURCES.filter((r) => (hand[r] ?? 0) > 0).flatMap((card) =>
      SAVINGS_TERMS.map((term) => ({ type: 'saveCard', player, card, term })),
    );
  },
});

/** Why this player can't borrow this card now, or null. */
export function borrowBlock(ctx: Ctx, seat: number, card: Resource): string | null {
  const err = financeLeft(ctx);
  if (err) return err;
  if (!ctx.bankHas({ [card]: 1 })) return `The bank has no ${card} left`;
  const mine = loansOf(ctx, seat);
  const turn = ctx.state.turn.number;
  if (mine.some(isTownLoan) && !mine.some((l) => isTownLoan(l) && l.taken === turn))
    return 'Pay back your town loans before borrowing cards';
  const same = mine.filter((l) => l.card === card);
  if (same.some((l) => l.taken !== ctx.state.turn.number))
    return `Pay back your ${card} loan before borrowing more`;
  if (same.length >= SAME_KIND_LOANS)
    return `At most ${SAME_KIND_LOANS} ${card} loans, all in one turn`;
  return null;
}

export const borrowCard = action<{ card: Resource; term: LoanTerm }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (!isResource(a.card)) return 'Pick a resource';
    if (!(LOAN_TERMS as readonly unknown[]).includes(a.term))
      return 'Borrow for 1, 3, 5, 7 or 10 turns';
    return borrowBlock(ctx, a.player, a.card);
  },
  apply(ctx, a) {
    const d = investorsData(ctx);
    ctx.grant(a.player, { [a.card]: 1 });
    d.loans.push({
      id: `l${d.nextId++}`,
      seat: a.player,
      card: a.card,
      term: a.term,
      left: a.term,
      taken: ctx.state.turn.number,
      penalty: LOAN_PENALTY[a.term],
      group: `${a.player}:${a.card}:${ctx.state.turn.number}:${a.term}`,
    });
    useFinance(ctx);
    ctx.emit({ type: 'cardBorrowed', player: a.player, card: a.card, term: a.term });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return RESOURCES.filter((card) => !borrowBlock(ctx, player, card)).flatMap((card) =>
      LOAN_TERMS.map((term) => ({ type: 'borrowCard', player, card, term })),
    );
  },
});

/** What paying back a loan costs, before any cards of your choice it adds. */
export function loanBill(loan: Loan): Cards {
  if (!isTownLoan(loan)) return { [loan.card]: LOAN_REPAY[loan.term as LoanTerm] };
  const times = TOWN_REPAY[loan.term as TownTerm].times;
  return Object.fromEntries(Object.entries(loan.cost ?? {}).map(([c, n]) => [c, (n ?? 0) * times]));
}

/** The cards of your choice a loan adds: one of any kind, or two from the building's cost. */
export function extraCount(loan: Loan): number {
  if (isTownLoan(loan)) return TOWN_REPAY[loan.term as TownTerm].half ? 2 : 0;
  return loan.term === 1 ? 1 : 0;
}

function extraOk(loan: Loan, extra: Cards): boolean {
  if (!Object.values(extra).every((n) => Number.isInteger(n) && (n ?? 0) >= 0)) return false;
  if (total(extra) !== extraCount(loan)) return false;
  if (!isTownLoan(loan)) return Object.keys(extra).every((c) => isResource(c));
  return Object.entries(extra).every(([c, n]) => (n ?? 0) <= (loan.cost?.[c] ?? 0));
}

function extraWording(loan: Loan): string {
  if (isTownLoan(loan))
    return extraCount(loan)
      ? `Add 2 cards from the cost of one more ${loan.card}`
      : 'Pay just the loan';
  return loan.term === 1 ? 'A 1-turn loan also takes one card of any kind' : 'Pay just the loan';
}

function payment(loan: Loan, extra: Cards | undefined): Cards {
  const out: Record<string, number> = { ...loanBill(loan) };
  for (const [c, n] of Object.entries(extra ?? {})) out[c] = (out[c] ?? 0) + (n ?? 0);
  return out;
}

/** Choices of extra cards this hand can add on top of the bill. */
export function extraChoices(loan: Loan, hand: Cards): Cards[] {
  const n = extraCount(loan);
  if (!n) return [{}];
  const left: Record<string, number> = { ...hand } as Record<string, number>;
  for (const [c, k] of Object.entries(loanBill(loan))) left[c] = (left[c] ?? 0) - (k ?? 0);
  const town = isTownLoan(loan);
  const pool = town ? Object.keys(loan.cost ?? {}) : [...RESOURCES];
  const cap = (c: string) => Math.min(left[c] ?? 0, town ? (loan.cost?.[c] ?? 0) : n);
  const out: Cards[] = [];
  if (n === 1) for (const c of pool) if (cap(c) >= 1) out.push({ [c]: 1 });
  if (n === 2)
    for (let i = 0; i < pool.length; i++)
      for (let j = i; j < pool.length; j++) {
        const x = pool[i] as string;
        const y = pool[j] as string;
        if (x === y ? cap(x) >= 2 : cap(x) >= 1 && cap(y) >= 1)
          out.push(x === y ? { [x]: 2 } : { [x]: 1, [y]: 1 });
      }
  return out;
}

/** Once a group of loans is all settled, its derivatives go back to their holders. */
export function releaseDerivatives(ctx: Ctx, group: string): void {
  const d = investorsData(ctx);
  if (d.loans.some((l) => l.group === group)) return;
  d.derivatives = d.derivatives.filter((x) => x.group !== group);
}

/** A loan in the group defaulted: each holder's first unpaid derivative on it pays. */
function payDerivatives(ctx: Ctx, loan: Loan): void {
  const d = investorsData(ctx);
  const seen = new Set<number>();
  for (const x of d.derivatives) {
    if (x.group !== loan.group || x.paid || seen.has(x.holder)) continue;
    seen.add(x.holder);
    x.paid = true;
    d.bonus[String(x.holder)] = (d.bonus[String(x.holder)] ?? 0) + x.pays;
    ctx.emit({ type: 'derivativePaid', player: x.holder, from: loan.seat, points: x.pays });
  }
}

export const repayLoan = action<{ loan: string; extra?: Cards }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a) ?? inMain(ctx);
    if (err) return err;
    const loan = investorsData(ctx).loans.find((l) => l.id === a.loan && l.seat === a.player);
    if (!loan) return 'That is not your loan';
    if (!extraOk(loan, a.extra ?? {})) return extraWording(loan);
    return ctx.has(a.player, payment(loan, a.extra)) ? null : 'You can not pay that back yet';
  },
  apply(ctx, a) {
    const d = investorsData(ctx);
    const loan = d.loans.find((l) => l.id === a.loan) as Loan;
    const paid = payment(loan, a.extra);
    ctx.pay(a.player, paid);
    d.loans = d.loans.filter((l) => l.id !== loan.id);
    releaseDerivatives(ctx, loan.group);
    ctx.emit({ type: 'loanRepaid', player: a.player, card: loan.card, term: loan.term, paid });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || ctx.state.phase.id !== 'main') return [];
    const out: Action[] = [];
    const hand = ctx.player(player).hand;
    for (const loan of loansOf(ctx, player)) {
      if (!ctx.has(player, loanBill(loan))) continue;
      for (const extra of extraChoices(loan, hand))
        out.push(
          extraCount(loan)
            ? { type: 'repayLoan', player, loan: loan.id, extra }
            : { type: 'repayLoan', player, loan: loan.id },
        );
    }
    return out;
  },
});

/** After the roll: the player's savings and loans move one turn on. */
export function advanceBank(ctx: Ctx, seat: number): void {
  const d = investorsData(ctx);
  for (const s of d.savings) if (s.seat === seat) s.left -= 1;
  for (const s of d.savings.filter((x) => x.seat === seat && x.left <= 0)) {
    const owed = savingsReturn(s.term, rateOf(ctx, s.card));
    const n = Math.min(owed, ctx.state.bank[s.card] ?? 0);
    if (n > 0) ctx.grant(seat, { [s.card]: n });
    ctx.emit({ type: 'savingsPaid', player: seat, card: s.card, term: s.term, cards: n });
  }
  d.savings = d.savings.filter((x) => !(x.seat === seat && x.left <= 0));
  for (const l of d.loans) if (l.seat === seat && l.left > 0) l.left -= 1;
}

/** At the end of the turn, loans that came due and weren't paid turn into bad debt. */
export function settleDue(ctx: Ctx, seat: number): void {
  const d = investorsData(ctx);
  const due = d.loans.filter((x) => x.seat === seat && x.left <= 0);
  d.loans = d.loans.filter((x) => !(x.seat === seat && x.left <= 0));
  for (const l of due) {
    d.debt[String(seat)] = (d.debt[String(seat)] ?? 0) + l.penalty;
    ctx.emit({
      type: 'loanDefaulted',
      player: seat,
      card: l.card,
      term: l.term,
      points: l.penalty,
    });
    payDerivatives(ctx, l);
  }
  for (const g of new Set(due.map((l) => l.group))) releaseDerivatives(ctx, g);
}

export const bankActions = { saveCard, borrowCard, repayLoan };
