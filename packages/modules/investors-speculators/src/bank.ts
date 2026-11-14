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
  type LoanTerm,
  type SavingsTerm,
} from './constants.ts';
import {
  action,
  financeUsed,
  investorsData,
  isResource,
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

function financeLeft(ctx: Ctx): string | null {
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
  const same = loansOf(ctx, seat).filter((l) => l.card === card);
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

/** What paying back a loan costs (a 1-turn loan adds one card of any kind, given separately). */
export function loanBill(loan: Loan): Cards {
  return { [loan.card]: LOAN_REPAY[loan.term] };
}

/** The extra cards a loan asks for beyond its bill. */
const extraCount = (loan: Loan) => (loan.term === 1 ? 1 : 0);

function payment(loan: Loan, extra: Cards | undefined): Cards {
  const out: Record<string, number> = { ...loanBill(loan) };
  for (const [c, n] of Object.entries(extra ?? {})) out[c] = (out[c] ?? 0) + (n ?? 0);
  return out;
}

export const repayLoan = action<{ loan: string; extra?: Cards }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a) ?? inMain(ctx);
    if (err) return err;
    const loan = investorsData(ctx).loans.find((l) => l.id === a.loan && l.seat === a.player);
    if (!loan) return 'That is not your loan';
    const extra = a.extra ?? {};
    if (
      !Object.entries(extra).every(([c, n]) => isResource(c) && Number.isInteger(n) && n >= 0) ||
      total(extra) !== extraCount(loan)
    )
      return loan.term === 1
        ? 'A 1-turn loan also takes one card of any kind'
        : 'Pay just the loan';
    return ctx.has(a.player, payment(loan, extra)) ? null : 'You can not pay that back yet';
  },
  apply(ctx, a) {
    const d = investorsData(ctx);
    const loan = d.loans.find((l) => l.id === a.loan) as Loan;
    const paid = payment(loan, a.extra);
    ctx.pay(a.player, paid);
    d.loans = d.loans.filter((l) => l.id !== loan.id);
    ctx.emit({ type: 'loanRepaid', player: a.player, card: loan.card, term: loan.term, paid });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || ctx.state.phase.id !== 'main') return [];
    const out: Action[] = [];
    for (const loan of loansOf(ctx, player)) {
      const bill = loanBill(loan);
      if (!ctx.has(player, bill)) continue;
      if (!extraCount(loan)) {
        out.push({ type: 'repayLoan', player, loan: loan.id });
        continue;
      }
      const hand = { ...ctx.player(player).hand };
      hand[loan.card] = (hand[loan.card] ?? 0) - (bill[loan.card] ?? 0);
      for (const r of RESOURCES)
        if ((hand[r] ?? 0) > 0)
          out.push({ type: 'repayLoan', player, loan: loan.id, extra: { [r]: 1 } });
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
  for (const l of d.loans.filter((x) => x.seat === seat && x.left <= 0)) {
    const points = LOAN_PENALTY[l.term];
    d.debt[String(seat)] = (d.debt[String(seat)] ?? 0) + points;
    ctx.emit({ type: 'loanDefaulted', player: seat, card: l.card, term: l.term, points });
  }
  d.loans = d.loans.filter((x) => !(x.seat === seat && x.left <= 0));
}

export const bankActions = { saveCard, borrowCard, repayLoan };
