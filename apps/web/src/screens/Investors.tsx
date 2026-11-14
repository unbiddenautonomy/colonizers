import { useState } from 'react';
import type { Action, Ctx, GameState } from '@colonizers/engine';
import { RESOURCES } from '@colonizers/module-base';
import {
  DERIVATIVE_COST,
  DERIVATIVE_TERMS,
  extraCount,
  FINANCE_ACTIONS,
  financeUsed,
  investorsData,
  LOAN_PENALTY,
  LOAN_REPAY,
  LOAN_TERMS,
  loanBill,
  loansOf,
  RATE_MAX,
  RATE_MIN,
  rateOf,
  SAVINGS_TERMS,
  savingsOf,
  savingsReturn,
  SEVEN_SHOW,
  sevenCounts,
  townItems,
  TOWN_PENALTY,
  TOWN_REPAY,
  TOWN_TERMS,
  COMMODITY_MARKET,
  COMMODITY_PREMIUM,
  tradables,
  type Loan,
} from '@colonizers/module-investors-speculators';
import { nameOf } from '@colonizers/rulebook';
import { ResourceCard } from '../ui/Cards.tsx';
import { Modal } from '../ui/Modal.tsx';

/** Investors & Speculators on screen: the market, the bank, and the 7. */

export const investorsOn = (state: GameState) => state.modules.includes('investors');

const cardName = (c: string) => nameOf(c).name.toLowerCase();

const cardsText = (cards: Record<string, number>) =>
  Object.entries(cards)
    .filter(([, n]) => n > 0)
    .map(([c, n]) => `${n} ${cardName(c)}`)
    .join(', ') || 'nothing';

const list = (cs: readonly string[]) => cs.map(cardName).join(' and ');

export function investorsPrompt(
  state: GameState,
  who: string,
  actor: number | null,
): string | null {
  const mine = actor === state.turn.player;
  const roller = state.players[state.turn.player]?.name ?? '';
  switch (state.phase.id) {
    case 'sevenShow':
      return mine
        ? `${who}: show ${SEVEN_SHOW} of your resource cards to set the market.`
        : `${roller} is showing cards for the market.`;
    case 'sevenRates':
      return mine
        ? `${who}: make the two resources seen most cheaper, and two others dearer.`
        : `${roller} is setting the exchange rates.`;
    case 'sevenKeep':
      return mine
        ? `${who}: keep one of the cards your rivals showed or discarded.`
        : `${roller} is keeping a card.`;
    default:
      return null;
  }
}

/** The exchange rates, for everyone to see. */
export function MarketStatus({ ctx }: { ctx: Ctx }) {
  const rates = investorsData(ctx).rates;
  return (
    <div className="tda-status" aria-label="Exchange market">
      <p>
        📈 Exchange market{' '}
        <small className="muted">
          · the bank’s price for one card ({RATE_MIN}:1 to {RATE_MAX}:1)
        </small>
      </p>
      <div className="row wrap">
        {RESOURCES.map((r) => (
          <span key={r} title={`${rates[r]} cards of one kind buy one ${cardName(r)}`}>
            <ResourceCard card={r} /> {rates[r]}:1
          </span>
        ))}
      </div>
      {Object.keys(COMMODITY_MARKET).some((c) => ctx.registry.cardTypes[c]) && (
        <small className="muted">
          Commodities go by their resource’s rate
          {Object.entries(COMMODITY_PREMIUM)
            .filter(([c]) => ctx.registry.cardTypes[c])
            .map(([c, n]) => `, ${cardName(c)} ${n} more`)
            .join('')}
          .
        </small>
      )}
    </div>
  );
}

/** Savings, loans and bad debt, for the player list. */
export function InvestorsStats({ ctx, seat }: { ctx: Ctx; seat: number }) {
  const saved = savingsOf(ctx, seat);
  const loans = loansOf(ctx, seat);
  const d = investorsData(ctx);
  const debt = d.debt[String(seat)] ?? 0;
  const bonus = d.bonus[String(seat)] ?? 0;
  const held = d.derivatives.filter((x) => x.holder === seat).length;
  return (
    <>
      {saved.length > 0 && (
        <span
          title={`Savings: ${saved.map((s) => `${cardName(s.card)} (${s.left} turns left)`).join(', ')}`}
        >
          🏦 {saved.length}
        </span>
      )}
      {loans.length > 0 && (
        <span
          title={`Loans (no win while one is open): ${loans
            .map((l) => `${cardName(l.card)} (${l.left ? `${l.left} turns left` : 'due now'})`)
            .join(', ')}`}
        >
          🧾 {loans.length}
        </span>
      )}
      {debt > 0 && <span title={`Bad debt: ${debt} points off`}>📉 −{debt}</span>}
      {held > 0 && <span title="Derivatives placed">🎲 {held}</span>}
      {bonus > 0 && <span title={`Won with derivatives: ${bonus} points`}>📈 +{bonus}</span>}
    </>
  );
}

/** Save, borrow and pay back: the finance actions of a main turn. */
export function FinanceDialog({
  ctx,
  actor,
  legal,
  act,
  onClose,
  onLoanBuild,
  names,
}: {
  ctx: Ctx;
  actor: number;
  legal: Action[];
  act: (a: Action) => void;
  onClose: () => void;
  /** Start placing a settlement or city on a town loan of this term. */
  onLoanBuild: (item: string, term: number) => void;
  names: string[];
}) {
  const [card, setCard] = useState<string>(RESOURCES[0] as string);
  const rate = rateOf(ctx, card);
  const can = (type: string, f: (a: Action) => boolean) =>
    legal.find((a) => a.type === type && f(a));
  const loans = loansOf(ctx, actor);
  const saved = savingsOf(ctx, actor);
  const left = FINANCE_ACTIONS - financeUsed(ctx);
  return (
    <Modal title="Bank and loans" onClose={onClose}>
      <p className="muted">
        {left} of {FINANCE_ACTIONS} finance actions left this turn (each card saved or borrowed,
        town loan or derivative).
      </p>
      <div className="row wrap" role="group" aria-label="Resource">
        {tradables(ctx).map((r) => (
          <button
            key={r}
            type="button"
            className={card === r ? 'on' : ''}
            onClick={() => setCard(r)}
          >
            <ResourceCard card={r} count={ctx.state.players[actor]?.hand[r] ?? 0} />
          </button>
        ))}
      </div>
      <p>
        Save one {cardName(card)} (paid back by its rate when it comes due, now {rate}:1):
      </p>
      <div className="row wrap">
        {SAVINGS_TERMS.map((term) => {
          const a = can('saveCard', (x) => x.card === card && x.term === term);
          return (
            <button key={term} type="button" disabled={!a} onClick={() => a && act(a)}>
              {term} turns → {savingsReturn(term, rate)}
            </button>
          );
        })}
      </div>
      <p>Borrow one {cardName(card)} (unpaid, it turns into bad debt):</p>
      <div className="row wrap">
        {LOAN_TERMS.map((term) => {
          const a = can('borrowCard', (x) => x.card === card && x.term === term);
          return (
            <button
              key={term}
              type="button"
              disabled={!a}
              onClick={() => a && act(a)}
              title={`Pay back ${LOAN_REPAY[term]} ${cardName(card)}${term === 1 ? ' and one card of any kind' : ''}, or lose ${LOAN_PENALTY[term]} points`}
            >
              {term} {term === 1 ? 'turn' : 'turns'} → {LOAN_REPAY[term]}
              {term === 1 ? ' + 1' : ''}
            </button>
          );
        })}
      </div>
      {townItems(ctx).map((item) => (
        <div key={item}>
          <p>
            Build {townLabel(item)} on a loan (free now; paid back as 1½ to 2½ of its cost,{' '}
            {cardsText(ctx.cost(item, actor))}):
          </p>
          <div className="row wrap">
            {TOWN_TERMS.map((term) => {
              const ok = legal.some(
                (a) => a.type === 'buildOnLoan' && a.item === item && a.term === term,
              );
              const { times, half } = TOWN_REPAY[term];
              return (
                <button
                  key={term}
                  type="button"
                  disabled={!ok}
                  onClick={() => onLoanBuild(item, term)}
                  title={`Pay back ${times}${half ? '½' : ''} × the cost, or lose ${TOWN_PENALTY[term]} points`}
                >
                  {term} turns → {times}
                  {half ? '½' : ''}×
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {loans.length > 0 && (
        <>
          <p>Your loans (no one wins with a loan open):</p>
          <ul className="plain">
            {loans.map((l) => {
              const pays = legal.filter((a) => a.type === 'repayLoan' && a.loan === l.id);
              const extra = extraCount(l);
              return (
                <li key={l.id}>
                  {cardName(l.card)}, {l.left ? `${l.left} turns left` : 'due this turn'}: pay{' '}
                  {cardsText(loanBill(l))}
                  {extra === 1 ? ' and one card of any kind' : ''}
                  {extra === 2 ? ` and 2 cards from a ${l.card}’s cost` : ''} (or {l.penalty}{' '}
                  {l.penalty === 1 ? 'point' : 'points'} of bad debt){' '}
                  {pays.length === 0 && <small className="muted">(not enough cards)</small>}
                  {pays.map((a, i) => (
                    <button key={i} type="button" className="small" onClick={() => act(a)}>
                      Pay back
                      {a.extra ? ` (+ ${cardsText(a.extra as Record<string, number>)})` : ''}
                    </button>
                  ))}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <DerivativeList ctx={ctx} legal={legal} act={act} names={names} />
      {saved.length > 0 && (
        <p className="muted">
          Saved: {saved.map((s) => `${cardName(s.card)} (${s.left} turns left)`).join(', ')}
        </p>
      )}
    </Modal>
  );
}

/** Loans that take derivatives, with a button to bet on each. */
function DerivativeList({
  ctx,
  legal,
  act,
  names,
}: {
  ctx: Ctx;
  legal: Action[];
  act: (a: Action) => void;
  names: string[];
}) {
  const d = investorsData(ctx);
  const groups = new Map<string, Loan[]>();
  for (const l of d.loans)
    if (l.term >= 5) groups.set(l.group, [...(groups.get(l.group) ?? []), l]);
  if (!groups.size) return null;
  return (
    <>
      <p>
        Derivatives: pay {DERIVATIVE_COST} cards of one kind to bet a loan won’t be paid back (5
        turns or more, early in its term):
      </p>
      <ul className="plain">
        {[...groups].map(([group, ls]) => {
          const l = ls[0] as Loan;
          const buys = legal.filter((a) => a.type === 'buyDerivative' && a.group === group);
          const held = d.derivatives.filter((x) => x.group === group);
          return (
            <li key={group}>
              {names[l.seat]}: {ls.length > 1 ? `${ls.length} × ` : ''}
              {cardName(l.card)}, {l.left} turns left, pays {DERIVATIVE_TERMS[l.term]?.pays ?? 1}
              {held.length > 0 && (
                <small className="muted">
                  {' '}
                  (held by {held.map((x) => names[x.holder]).join(', ')})
                </small>
              )}{' '}
              {buys.map((a, i) => (
                <button key={i} type="button" className="small" onClick={() => act(a)}>
                  Bet with {DERIVATIVE_COST} {cardName(a.card as string)}
                </button>
              ))}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** The 7: show cards, set the rates, keep a card. */
export function InvestorsChoices({
  state,
  ctx,
  actor,
  legal,
  act,
  names,
}: {
  state: GameState;
  ctx: Ctx;
  actor: number;
  legal: Action[];
  act: (a: Action) => void;
  names: string[];
}) {
  const id = state.phase.id;
  if (actor !== state.turn.player) return null;
  if (id === 'sevenShow')
    return (
      <ShowDialog
        key={state.seq}
        cards={tradables(ctx)}
        hand={state.players[actor]?.hand ?? {}}
        actor={actor}
        act={act}
      />
    );
  if (id === 'sevenRates') {
    const opts = legal.filter((a) => a.type === 'sevenRates');
    const seen = sevenCounts(ctx);
    return (
      <Modal title="Set the market">
        <p>
          Seen on this 7: {RESOURCES.map((r) => `${seen[r]} ${cardName(r)}`).join(', ')}. The two
          seen most get cheaper; pick two others to get dearer.
        </p>
        <div className="row wrap">
          {opts.map((a, i) => (
            <button key={i} type="button" onClick={() => act(a)}>
              Cheaper: {list(a.up as string[])} · Dearer:{' '}
              {(a.down as string[]).length ? list(a.down as string[]) : 'none'}
            </button>
          ))}
        </div>
      </Modal>
    );
  }
  if (id === 'sevenKeep') {
    const opts = legal.filter((a) => a.type === 'sevenKeep');
    return (
      <Modal title="Keep a card">
        <p>Keep one card a rival showed (from their hand) or discarded (from the bank).</p>
        <div className="row wrap">
          {opts.map((a, i) => (
            <button key={i} type="button" onClick={() => act(a)}>
              <ResourceCard card={a.card as string} /> {names[a.from as number]}
              {a.source === 'discarded' ? ' (discarded)' : ''}
            </button>
          ))}
        </div>
      </Modal>
    );
  }
  return null;
}

function ShowDialog({
  cards,
  hand,
  actor,
  act,
}: {
  cards: string[];
  hand: Record<string, number>;
  actor: number;
  act: (a: Action) => void;
}) {
  const have = cards.reduce((s, r) => s + (hand[r] ?? 0), 0);
  const want = Math.min(SEVEN_SHOW, have);
  const [pick, setPick] = useState<Record<string, number>>({});
  const n = Object.values(pick).reduce((s, x) => s + x, 0);
  return (
    <Modal title="Show your cards">
      <p>
        Show {want} of your resource cards. With the cards drawn from your rivals, they set the
        rates.
      </p>
      <div className="row wrap">
        {cards.map((r) => (
          <button
            key={r}
            type="button"
            disabled={(pick[r] ?? 0) >= (hand[r] ?? 0) || n >= want}
            onClick={() => setPick({ ...pick, [r]: (pick[r] ?? 0) + 1 })}
          >
            <ResourceCard card={r} count={(hand[r] ?? 0) - (pick[r] ?? 0)} />
          </button>
        ))}
      </div>
      <p>Showing: {cardsText(pick)}</p>
      <div className="row">
        <button type="button" onClick={() => setPick({})} disabled={!n}>
          Clear
        </button>
        <button
          type="button"
          className="primary"
          disabled={n !== want}
          onClick={() => act({ type: 'sevenShow', player: actor, cards: pick })}
        >
          Show
        </button>
      </div>
    </Modal>
  );
}

const TOWN_LABEL: Record<string, string> = {
  settlement: 'a settlement',
  city: 'a city',
  harbor: 'a harbor settlement',
  settler: 'a settler',
  cavalry: 'a cavalry unit',
  artillery: 'an artillery unit',
};

/** "a settlement", "an artillery unit": what a town loan builds, in words. */
export const townLabel = (item: string) => TOWN_LABEL[item] ?? `a ${item}`;

/** A board mode for building on a town loan: `loan:<item>:<term>`. */
export const loanMode = (item: string, term: number) => `loan:${item}:${term}` as const;

export function parseLoanMode(mode: string | null): { item: string; term: number } | null {
  const m = mode?.match(/^loan:(\w+):(\d+)$/);
  return m ? { item: m[1] as string, term: Number(m[2]) } : null;
}
