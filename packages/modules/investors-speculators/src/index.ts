import type { ActionDef, GameModule } from '@colonizers/engine';
import { RESOURCES } from '@colonizers/module-base';
import { advanceBank, bankActions, settleDue } from './bank.ts';
import { MODULE_ID } from './constants.ts';
import {
  investorsDice,
  marketActions,
  marketRatio,
  wrapDiscard,
  wrapMoveRobber,
} from './market.ts';
import { investorsData, loansOf } from './rules.ts';

/**
 * Investors & Speculators (Investoren und Spekulanten, a fan expansion from
 * siedlerinsel.de), for the base game:
 *
 * - An **exchange market**: the bank trades each resource at its own rate,
 *   from 2:1 to 6:1, starting at 4:1. Harbors take 1 off (3:1) or 2 off for
 *   their resource (2:1).
 * - A **7** robs no one: after discards and the robber, the roller shows 3 of
 *   their cards and draws 3 from each rival. The two resources seen most get
 *   cheaper, two others dearer, and the roller keeps one rival card that came
 *   to light. A 7 in the first round is thrown again.
 * - **Savings**: put a card in the bank for 3 or 5 turns and get back 1 to 3,
 *   depending on its rate when it comes due.
 * - **Loans**: borrow a card for 1 to 10 turns and pay it back with interest.
 *   A loan not paid back by the end of the turn it comes due becomes bad debt,
 *   points off for the rest of the game, and no one wins with a loan open.
 * - At most 5 finance actions (cards saved and loans taken) a turn.
 */

export * from './constants.ts';
export { borrowBlock, loanBill, advanceBank, settleDue } from './bank.ts';
export { downChoices, keepChoices, marketRatio, sevenCounts, upChoices } from './market.ts';
export {
  financeUsed,
  investorsData,
  loansOf,
  rateOf,
  savingsOf,
  type InvestorsData,
  type Loan,
  type Savings,
  type SevenState,
} from './rules.ts';

const wrapRoll = (prev: ActionDef): ActionDef => ({
  ...prev,
  apply(ctx, a) {
    prev.apply(ctx, a);
    const last = (ctx.state.data.base as { lastRoll?: { total: number } } | undefined)?.lastRoll;
    if (last?.total === 7) investorsData(ctx).seven = { discarded: {} };
    advanceBank(ctx, ctx.active);
  },
});

const wrapEndTurn = (prev: ActionDef): ActionDef => ({
  ...prev,
  apply(ctx, a) {
    settleDue(ctx, ctx.active);
    prev.apply(ctx, a);
  },
});

const isResource = (c: string) => (RESOURCES as readonly string[]).includes(c);

export const investorsModule: GameModule = {
  id: MODULE_ID,
  name: 'Investors & Speculators',
  dice: investorsDice,
  actions: { ...bankActions, ...marketActions },
  wrapActions: {
    roll: wrapRoll,
    discard: wrapDiscard,
    moveRobber: wrapMoveRobber,
    endTurn: wrapEndTurn,
  },
  hooks: {
    init(ctx) {
      investorsData(ctx);
    },
  },
  reducers: {
    swapRatio(ctx, seat, give, get, value) {
      if (!isResource(get)) return value;
      return marketRatio(ctx, seat, give, get);
    },
    vp(ctx, seat, value) {
      return value - (investorsData(ctx).debt[String(seat)] ?? 0);
    },
    canWin(ctx, seat, value) {
      return value && loansOf(ctx, seat).length === 0;
    },
  },
};
