import type { Action, Cards, Ctx } from '@colonizers/engine';
import { RESOURCES } from '@colonizers/module-base';
import { financeLeft } from './bank.ts';
import {
  DERIVATIVE_COST,
  DERIVATIVE_TERMS,
  DERIVATIVES,
  TOWN_ITEMS,
  TOWN_MARKERS,
  TOWN_MARKERS_BIG,
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

/** While true, town-loan buildings cost nothing: a town loan is building them. */
let financing = false;

/** The cost reducer's part: nothing while a town loan builds. */
export function townCost(item: string, value: Cards): Cards {
  return financing && Object.hasOwn(TOWN_ITEMS, item) ? {} : value;
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

/** What can go on a town loan in this game. */
export const townItems = (ctx: Ctx): string[] =>
  Object.keys(TOWN_ITEMS).filter((item) => !!ctx.registry.actions[TOWN_ITEMS[item]!.action]);

/** Town loan markers of each kind in the box. */
export const townMarkers = (ctx: Ctx) => (ctx.playerCount >= 5 ? TOWN_MARKERS_BIG : TOWN_MARKERS);

/** Town loans open across the table that took this item's kind of marker. */
export const townMarkersOut = (ctx: Ctx, item: string) => {
  const marker = TOWN_ITEMS[item]?.marker;
  return investorsData(ctx).loans.filter((l) => TOWN_ITEMS[l.card]?.marker === marker).length;
};

/** The build action a town loan goes through, with the loan's own fields taken off. */
function underlying(a: Action): Action {
  const { item, term, ...rest } = a as Action & { item: string; term: number };
  void term;
  const def = TOWN_ITEMS[item];
  return { ...rest, type: def?.action ?? '', ...(def?.unit ? { unit: def.unit } : {}) };
}

export const buildOnLoan = action<{ item: TownItem; term: TownTerm }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a) ?? financeLeft(ctx);
    if (err) return err;
    if (typeof a.item !== 'string' || !townItems(ctx).includes(a.item))
      return 'That can not be built on a loan';
    if (!(TOWN_TERMS as readonly unknown[]).includes(a.term))
      return 'Town loans run 3, 5, 7 or 10 turns';
    if (townMarkersOut(ctx, a.item) >= townMarkers(ctx))
      return `All ${townMarkers(ctx)} ${TOWN_ITEMS[a.item]!.marker} loans are taken`;
    const build = underlying(a);
    const def = ctx.registry.actions[build.type];
    if (!def) return 'Can not build that';
    return withFinancing(() => def.check(ctx, build));
  },
  apply(ctx, a) {
    const build = underlying(a);
    const def = ctx.registry.actions[build.type];
    const cost = ctx.cost(a.item, a.player);
    const before = ctx.vp(a.player);
    withFinancing(() => def?.apply(ctx, build));
    // The building's own point (if any) stays; anything beyond waits on the loan.
    const own = a.item === 'settlement' || a.item === 'city' || a.item === 'harbor' ? 1 : 0;
    const held = Math.max(0, ctx.vp(a.player) - before - own);
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
      ...(held ? { held } : {}),
    });
    useFinance(ctx);
    ctx.emit({ type: 'townLoan', player: a.player, item: a.item, term: a.term });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || financeLeft(ctx)) return [];
    const out: Action[] = [];
    for (const item of townItems(ctx)) {
      if (townMarkersOut(ctx, item) >= townMarkers(ctx)) continue;
      const spec = TOWN_ITEMS[item]!;
      const def = ctx.registry.actions[spec.action];
      const builds = withFinancing(() => def?.enumerate?.(ctx, player) ?? []).filter(
        (b) => !spec.unit || b.unit === spec.unit,
      );
      const seen = new Set<string>();
      for (const b of builds) {
        const { type, player: _p, unit: _u, ...rest } = b;
        void type;
        void _p;
        void _u;
        const key = JSON.stringify(rest);
        if (seen.has(key)) continue;
        seen.add(key);
        for (const term of TOWN_TERMS)
          out.push({ type: 'buildOnLoan', player, item, term, ...rest });
      }
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
