import type { ActionDef, Ctx } from '@colonizers/engine';
import { extraChoices, loanBill, releaseDerivatives } from './bank.ts';
import { investorsData, type Loan } from './rules.ts';

/**
 * Leaving the game with loans open (Soldiers & Armies): a player who
 * capitulates, or the last one standing, pays back what they can first. The
 * rest is bad debt, and derivatives on it pay nothing. A player wiped out
 * leaves on 0 points, their loans with them.
 */

type OutData = { out?: Record<string, { vp: number }> };

/** Players out of the game (Soldiers & Armies), with the points they finish on. */
export function outOf(ctx: Ctx): Record<string, { vp: number }> {
  return (ctx.state.data.soldiers as OutData | undefined)?.out ?? {};
}

export const isOut = (ctx: Ctx, seat: number) => !!outOf(ctx)[String(seat)];

/** The cheapest way this hand pays the loan back, or null. */
function settlement(ctx: Ctx, seat: number, loan: Loan) {
  const hand = ctx.player(seat).hand;
  if (!ctx.has(seat, loanBill(loan))) return null;
  for (const extra of extraChoices(loan, hand)) {
    const paid: Record<string, number> = { ...loanBill(loan) } as Record<string, number>;
    for (const [c, n] of Object.entries(extra)) paid[c] = (paid[c] ?? 0) + (n ?? 0);
    if (ctx.has(seat, paid)) return paid;
  }
  return null;
}

/** Pay back every loan the hand can, shortest first; the rest turns to bad debt. */
export function settleAll(ctx: Ctx, seat: number): void {
  const d = investorsData(ctx);
  const mine = d.loans.filter((l) => l.seat === seat).sort((a, b) => a.left - b.left);
  const groups = new Set(mine.map((l) => l.group));
  for (const loan of mine) {
    const paid = settlement(ctx, seat, loan);
    if (paid) {
      ctx.pay(seat, paid);
      ctx.emit({ type: 'loanRepaid', player: seat, card: loan.card, term: loan.term, paid });
    } else {
      d.debt[String(seat)] = (d.debt[String(seat)] ?? 0) + loan.penalty + (loan.held ?? 0);
      ctx.emit({
        type: 'loanDefaulted',
        player: seat,
        card: loan.card,
        term: loan.term,
        points: loan.penalty,
      });
    }
  }
  d.loans = d.loans.filter((l) => l.seat !== seat);
  for (const g of groups) releaseDerivatives(ctx, g);
}

/** A player out of the game takes nothing more from the bank. */
function dropOut(ctx: Ctx, seat: number): void {
  const d = investorsData(ctx);
  const groups = new Set(d.loans.filter((l) => l.seat === seat).map((l) => l.group));
  d.loans = d.loans.filter((l) => l.seat !== seat);
  d.savings = d.savings.filter((s) => s.seat !== seat);
  for (const g of groups) releaseDerivatives(ctx, g);
}

/** Capitulating: settle the loans, then hand everything over on half the points left. */
export function wrapCapitulate(prev: ActionDef): ActionDef {
  return {
    ...prev,
    apply(ctx, a) {
      settleAll(ctx, a.player);
      prev.apply(ctx, a);
    },
  };
}

/** After every action: clear out players who left, and settle the last one standing. */
export function checkEndings(ctx: Ctx): void {
  const d = investorsData(ctx);
  for (const p of ctx.state.players)
    if (
      isOut(ctx, p.seat) &&
      (d.loans.some((l) => l.seat === p.seat) || d.savings.some((s) => s.seat === p.seat))
    )
      dropOut(ctx, p.seat);
  const over = ctx.events.find((e) => e.type === 'gameOver' && e.lastStanding);
  if (!over || ctx.state.winner === null) return;
  const last = ctx.state.winner;
  settleAll(ctx, last);
  // The last one standing wins only on more points than anyone who left; otherwise the best does.
  const vps = ctx.state.players.map((p) => ctx.vp(p.seat));
  const best = Math.max(...vps);
  const lastVp = vps[last] ?? 0;
  const ahead = vps.every((v, i) => i === last || v < lastVp);
  if (!ahead && best > 0) ctx.state.winner = vps.indexOf(best);
  over.winner = ctx.state.winner;
  over.vp = vps;
}
