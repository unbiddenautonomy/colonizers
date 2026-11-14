import type { Action, Cards, CornerId, Ctx } from '@colonizers/engine';
import { RESOURCES } from '@colonizers/module-base';
import { financeLeft } from './bank.ts';
import {
  DERIVATIVE_COST,
  DERIVATIVE_TERMS,
  DERIVATIVES,
  TOWN_ITEMS,
  TOWN_MARKERS,
  TOWN_PENALTY,
  TOWN_TERMS,
  type TownItem,
  type TownTerm,
} from './constants.ts';
import {
  action,
  investorsData,
  isResource,
  onlyActive,
  useFinance,
  type Loan,
  type Resource,
} from './rules.ts';

/**
 * The full game's finance: **town loans** put up a settlement or a city free,
 * to be paid back as 1½ to 2½ of its cost; **derivatives** bet 2 cards that a
 * loan (anyone's, yours too) won't be paid back, and pay points if it isn't.
 */

/** While true, settlements and cities cost nothing: a town loan is building them. */
let financing = false;

/** The cost reducer's part: nothing while a town loan builds. */
export function townCost(item: string, value: Cards): Cards {
  return financing && (TOWN_ITEMS as readonly string[]).includes(item) ? {} : value;
}

function withFinancing<T>(fn: () => T): T {
  const was = financing;
  financing = true;
  try {
    return fn();
  } finally {
    financing = was;
  }
}

const buildType = (item: TownItem) => (item === 'settlement' ? 'buildSettlement' : 'buildCity');

/** Town loans of this kind open across the table. */
export const townMarkersOut = (ctx: Ctx, item: TownItem) =>
  investorsData(ctx).loans.filter((l) => l.card === item).length;

export const buildOnLoan = action<{ item: TownItem; corner: CornerId; term: TownTerm }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a) ?? financeLeft(ctx);
    if (err) return err;
    if (!(TOWN_ITEMS as readonly unknown[]).includes(a.item)) return 'Build a settlement or a city';
    if (!(TOWN_TERMS as readonly unknown[]).includes(a.term))
      return 'Town loans run 3, 5, 7 or 10 turns';
    if (townMarkersOut(ctx, a.item) >= TOWN_MARKERS)
      return `All ${TOWN_MARKERS} ${a.item} loans are taken`;
    const def = ctx.registry.actions[buildType(a.item)];
    if (!def) return 'Can not build that';
    return withFinancing(() =>
      def.check(ctx, { type: buildType(a.item), player: a.player, corner: a.corner }),
    );
  },
  apply(ctx, a) {
    const def = ctx.registry.actions[buildType(a.item)];
    const cost = ctx.cost(a.item, a.player);
    withFinancing(() =>
      def?.apply(ctx, { type: buildType(a.item), player: a.player, corner: a.corner }),
    );
    const d = investorsData(ctx);
    const id = `l${d.nextId++}`;
    d.loans.push({
      id,
      seat: a.player,
      card: a.item,
      term: a.term,
      left: a.term,
      taken: ctx.state.turn.number,
      penalty: TOWN_PENALTY[a.term],
      group: id,
      cost,
    });
    useFinance(ctx);
    ctx.emit({ type: 'townLoan', player: a.player, item: a.item, term: a.term });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || financeLeft(ctx)) return [];
    const out: Action[] = [];
    for (const item of TOWN_ITEMS) {
      if (townMarkersOut(ctx, item) >= TOWN_MARKERS) continue;
      const def = ctx.registry.actions[buildType(item)];
      const corners = withFinancing(() =>
        (def?.enumerate?.(ctx, player) ?? []).map((x) => x.corner as CornerId),
      );
      for (const corner of new Set(corners))
        for (const term of TOWN_TERMS)
          out.push({ type: 'buildOnLoan', player, item, corner, term });
    }
    return out;
  },
});

/** Why this player can't place a derivative on this loan group now, or null. */
export function derivativeBlock(ctx: Ctx, seat: number, group: string): string | null {
  const d = investorsData(ctx);
  const loans = d.loans.filter((l) => l.group === group);
  const first = loans[0] as Loan | undefined;
  if (!first) return 'There is no such loan';
  const terms = DERIVATIVE_TERMS[first.term];
  if (!terms) return 'Loans of 1 and 3 turns are safe from derivatives';
  if (first.left < terms.minLeft)
    return `Derivatives go on a ${first.term}-turn loan only while ${terms.minLeft} or more turns are left`;
  const mine = d.derivatives.filter((x) => x.holder === seat);
  if (mine.length >= DERIVATIVES) return `You have only ${DERIVATIVES} derivatives`;
  if (mine.filter((x) => x.group === group).length >= loans.length)
    return 'You already hold a derivative on that loan';
  return null;
}

export const buyDerivative = action<{ group: string; card: Resource }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a) ?? financeLeft(ctx);
    if (err) return err;
    if (!isResource(a.card)) return 'Pay with 2 cards of one resource';
    if (typeof a.group !== 'string') return 'Pick a loan';
    const block = derivativeBlock(ctx, a.player, a.group);
    if (block) return block;
    return ctx.has(a.player, { [a.card]: DERIVATIVE_COST })
      ? null
      : `A derivative costs ${DERIVATIVE_COST} cards of one kind`;
  },
  apply(ctx, a) {
    const d = investorsData(ctx);
    const loan = d.loans.find((l) => l.group === a.group) as Loan;
    ctx.pay(a.player, { [a.card]: DERIVATIVE_COST });
    d.derivatives.push({
      id: `d${d.nextId++}`,
      holder: a.player,
      group: a.group,
      pays: DERIVATIVE_TERMS[loan.term]?.pays ?? 1,
      paid: false,
    });
    useFinance(ctx);
    ctx.emit({ type: 'derivativeBought', player: a.player, on: loan.seat, card: loan.card });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || financeLeft(ctx)) return [];
    const hand = ctx.player(player).hand;
    const cards = RESOURCES.filter((r) => (hand[r] ?? 0) >= DERIVATIVE_COST);
    if (!cards.length) return [];
    const groups = [...new Set(investorsData(ctx).loans.map((l) => l.group))];
    return groups
      .filter((group) => !derivativeBlock(ctx, player, group))
      .flatMap((group) => cards.map((card) => ({ type: 'buyDerivative', player, group, card })));
  },
});

export const townActions = { buildOnLoan, buyDerivative };
