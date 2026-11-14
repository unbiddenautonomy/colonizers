import type { ActionDef, GameModule } from '@colonizers/engine';
import { advanceBank, bankActions, settleDue } from './bank.ts';
import { BIG_GAME_HAND, goldPrice, MODULE_ID } from './constants.ts';
import { checkEndings, isOut, wrapCapitulate } from './endings.ts';
import {
  marketActions,
  marketRatio,
  maybeStartExchange,
  wrapDiscard,
  wrapMovePirate,
  wrapInvestorsDice,
  wrapMoveRobber,
} from './market.ts';
import { investorsData, isTradable, loansOf, rateOf } from './rules.ts';
import { derivativeBlock, townActions, townCost, townItems, townMarkersOut } from './town.ts';

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
 * - **Town loans**: build a settlement or city free and pay back 1½ to 2½
 *   times its cost in 3 to 10 turns. While one is open, cards can be
 *   borrowed only in the turn a town loan is taken.
 * - **Derivatives**: pay 2 cards of one kind to bet that a loan of 5 turns or
 *   more (anyone's) won't be paid back; it pays 1 or 2 points if it isn't.
 * - At most 5 finance actions (cards saved, loans taken, derivatives) a turn.
 *
 * With other expansions: see market.ts (commodities, the pirate, barbarians),
 * town.ts (harbors, settlers, units) and endings.ts (leaving with loans open).
 */

export * from './constants.ts';
export { borrowBlock, extraChoices, extraCount, loanBill, advanceBank, settleDue } from './bank.ts';
export { derivativeBlock, townItems, townMarkersOut };
export { downChoices, keepChoices, marketRatio, sevenCounts, upChoices } from './market.ts';
export {
  financeUsed,
  investorsData,
  loansOf,
  rateOf,
  savingsOf,
  COMMODITY_MARKET,
  COMMODITY_PREMIUM,
  isTownLoan,
  isTradable,
  marketOf,
  tradables,
  type Derivative,
  type InvestorsData,
  type Loan,
  type Savings,
  type SevenState,
} from './rules.ts';

const wrapEndTurn = (prev: ActionDef): ActionDef => ({
  ...prev,
  apply(ctx, a) {
    settleDue(ctx, ctx.active);
    prev.apply(ctx, a);
  },
});

export const investorsModule: GameModule = {
  id: MODULE_ID,
  name: 'Investors & Speculators',
  wrapDice: wrapInvestorsDice,
  actions: { ...bankActions, ...marketActions, ...townActions },
  wrapActions: {
    discard: wrapDiscard,
    moveRobber: wrapMoveRobber,
    endTurn: wrapEndTurn,
  },
  wrapActionsIfPresent: {
    movePirate: wrapMovePirate,
    capitulate: wrapCapitulate,
  },
  hooks: {
    init(ctx) {
      investorsData(ctx);
    },
    afterAction(ctx) {
      // After the dice (whichever action threw them): the bank moves on, and a 7 opens the market.
      const rolled = ctx.events.find((e) => e.type === 'rolled');
      if (rolled) {
        if (rolled.total === 7) investorsData(ctx).seven = { discarded: {} };
        advanceBank(ctx, ctx.active);
      }
      // Traders & Barbarians: the barbarian moved on a 7 takes no card either.
      const s = investorsData(ctx).seven;
      if (ctx.state.phase.id === 'tbBarbarian' && s && !s.started) ctx.state.phase.steal = false;
      maybeStartExchange(ctx);
      checkEndings(ctx);
    },
  },
  reducers: {
    swapRatio(ctx, seat, give, get, value) {
      if (!isTradable(ctx, get)) return value;
      return marketRatio(ctx, seat, give, get);
    },
    vp(ctx, seat, value) {
      // A player out of the game (Soldiers & Armies) finishes on what they left with, at least 0.
      if (isOut(ctx, seat)) return Math.max(0, value);
      const d = investorsData(ctx);
      const held = d.loans.reduce((n, l) => n + (l.seat === seat ? (l.held ?? 0) : 0), 0);
      return value - (d.debt[String(seat)] ?? 0) + (d.bonus[String(seat)] ?? 0) - held;
    },
    handLimit(ctx, _seat, value) {
      return ctx.playerCount >= 5 ? value + BIG_GAME_HAND : value;
    },
    cost(ctx, item, _seat, value) {
      // Explorers & Pirates' gold goes by the market too: 3, 2 or 1 for a resource by its rate.
      if (item.startsWith('goldBuy:')) return { gold: goldPrice(rateOf(ctx, item.slice(8))) };
      return townCost(item, value);
    },
    canWin(ctx, seat, value) {
      return value && loansOf(ctx, seat).length === 0;
    },
  },
};
