import type { Action, ActionDef, Cards, Ctx } from '@colonizers/engine';
import { RESOURCES } from '@colonizers/module-base';
import {
  MODULE_ID,
  RATE_MAX,
  RATE_MIN,
  RATE_START,
  TOWN_ITEMS,
  type LoanTerm,
  type SavingsTerm,
  type TownTerm,
} from './constants.ts';

export type Resource = (typeof RESOURCES)[number];

/** A card saved at the bank, paying out when its turns run down. */
export interface Savings {
  id: string;
  seat: number;
  card: string;
  term: SavingsTerm;
  /** The saver's turns left until it comes due. */
  left: number;
}

/** A loan from the bank: repaid with interest, or it costs points. */
export interface Loan {
  id: string;
  seat: number;
  /** The resource borrowed, or 'settlement' / 'city' for a town loan. */
  card: string;
  term: LoanTerm | TownTerm;
  /** Bad debt points if it isn't paid back. */
  penalty: number;
  /** Loans that stand or fall together for derivatives: same kind, term and turn. */
  group: string;
  /** For a town loan, what the building cost when it was built. */
  cost?: Cards;
  /** Points the building brought beyond its own (an island bonus, say), held until it's paid. */
  held?: number;
  /** The borrower's turns left until it comes due; 0 means due this turn. */
  left: number;
  /** The turn number it was taken in. */
  taken: number;
}

export interface InvestorsData {
  /** Exchange rate for each resource: give this many of one kind for one of it. */
  rates: Record<string, number>;
  savings: Savings[];
  loans: Loan[];
  /** Bad debt points per seat. */
  debt: Record<string, number>;
  /** Points won with derivatives, per seat. */
  bonus: Record<string, number>;
  derivatives: Derivative[];
  /** Finance actions used this turn. */
  actions: number;
  actionsTurn: number;
  nextId: number;
  /** The exchange being set after a 7. */
  seven: SevenState | null;
}

/** A bet that a loan (or a group of loans) won't be paid back. */
export interface Derivative {
  id: string;
  holder: number;
  group: string;
  /** Points it pays when a loan in the group defaults (once). */
  pays: number;
  paid: boolean;
}

export interface SevenState {
  /** Cards discarded on this 7, by seat. */
  discarded: Record<string, Cards>;
  /** Cards the roller showed. */
  shown?: Cards;
  /** Cards drawn from each rival's hand. */
  drawn?: Record<string, Cards>;
  /** Resources moved up this time (they can't go down). */
  up?: Resource[];
  /** The exchange has begun (the robber is done). */
  started?: boolean;
}

export function investorsData(ctx: Ctx): InvestorsData {
  const d = ctx.data<Partial<InvestorsData>>(MODULE_ID);
  d.rates ??= Object.fromEntries(RESOURCES.map((r) => [r, RATE_START]));
  d.savings ??= [];
  d.loans ??= [];
  d.debt ??= {};
  d.bonus ??= {};
  d.derivatives ??= [];
  d.actions ??= 0;
  d.actionsTurn ??= 0;
  d.nextId ??= 1;
  d.seven ??= null;
  return d as InvestorsData;
}

/** Commodities trade, save and borrow at the rate of the resource they come from. */
export const COMMODITY_MARKET: Record<string, Resource> = {
  paper: 'lumber',
  cloth: 'wool',
  coin: 'ore',
};

/** The resource whose rate a card goes by. */
export const marketOf = (card: string): string => COMMODITY_MARKET[card] ?? card;

/** Cards the bank trades, saves and lends in this game: the resources, and the commodities. */
export const tradables = (ctx: Ctx): string[] => [
  ...RESOURCES,
  ...Object.keys(COMMODITY_MARKET).filter((c) => !!ctx.registry.cardTypes[c]),
];

export const isTradable = (ctx: Ctx, c: unknown): c is string =>
  typeof c === 'string' && tradables(ctx).includes(c);

export const rateOf = (ctx: Ctx, card: string) =>
  investorsData(ctx).rates[marketOf(card)] ?? RATE_START;

export const clampRate = (n: number) => Math.max(RATE_MIN, Math.min(RATE_MAX, n));

export function financeUsed(ctx: Ctx): number {
  const d = investorsData(ctx);
  return d.actionsTurn === ctx.state.turn.number ? d.actions : 0;
}

export function useFinance(ctx: Ctx, n = 1): void {
  const d = investorsData(ctx);
  if (d.actionsTurn !== ctx.state.turn.number) {
    d.actionsTurn = ctx.state.turn.number;
    d.actions = 0;
  }
  d.actions += n;
}

export const loansOf = (ctx: Ctx, seat: number) =>
  investorsData(ctx).loans.filter((l) => l.seat === seat);

export const savingsOf = (ctx: Ctx, seat: number) =>
  investorsData(ctx).savings.filter((s) => s.seat === seat);

export const isResource = (c: unknown): c is Resource =>
  (RESOURCES as readonly unknown[]).includes(c);

export function action<T>(def: ActionDef<Action & T>): ActionDef {
  return def as unknown as ActionDef;
}

export const onlyActive = (ctx: Ctx, a: Action) =>
  a.player === ctx.active ? null : 'Not your turn';

export const total = (c: Cards) => Object.values(c).reduce((s, n) => s + (n ?? 0), 0);

export const isTownLoan = (l: Loan) => Object.hasOwn(TOWN_ITEMS, l.card);
