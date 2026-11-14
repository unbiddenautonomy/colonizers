import { useState } from 'react';
import type { Action, Ctx, GameState } from '@colonizers/engine';
import { RESOURCES } from '@colonizers/module-base';
import {
  FINANCE_ACTIONS,
  financeUsed,
  investorsData,
  LOAN_PENALTY,
  LOAN_REPAY,
  LOAN_TERMS,
  loansOf,
  RATE_MAX,
  RATE_MIN,
  SAVINGS_TERMS,
  savingsOf,
  savingsReturn,
  SEVEN_SHOW,
  sevenCounts,
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
    </div>
  );
}

/** Savings, loans and bad debt, for the player list. */
export function InvestorsStats({ ctx, seat }: { ctx: Ctx; seat: number }) {
  const saved = savingsOf(ctx, seat);
  const loans = loansOf(ctx, seat);
  const debt = investorsData(ctx).debt[String(seat)] ?? 0;
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
}: {
  ctx: Ctx;
  actor: number;
  legal: Action[];
  act: (a: Action) => void;
  onClose: () => void;
}) {
  const [card, setCard] = useState<string>(RESOURCES[0] as string);
  const rate = investorsData(ctx).rates[card] ?? 4;
  const can = (type: string, f: (a: Action) => boolean) =>
    legal.find((a) => a.type === type && f(a));
  const loans = loansOf(ctx, actor);
  const saved = savingsOf(ctx, actor);
  const left = FINANCE_ACTIONS - financeUsed(ctx);
  return (
    <Modal title="Bank and loans" onClose={onClose}>
      <p className="muted">
        {left} of {FINANCE_ACTIONS} finance actions left this turn (each card saved or borrowed).
      </p>
      <div className="row wrap" role="group" aria-label="Resource">
        {RESOURCES.map((r) => (
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
      {loans.length > 0 && (
        <>
          <p>Your loans (no one wins with a loan open):</p>
          <ul className="plain">
            {loans.map((l) => {
              const pays = legal.filter((a) => a.type === 'repayLoan' && a.loan === l.id);
              return (
                <li key={l.id}>
                  {cardName(l.card)}, {l.left ? `${l.left} turns left` : 'due this turn'}: pay{' '}
                  {LOAN_REPAY[l.term]} {cardName(l.card)}
                  {l.term === 1 ? ' and one card of any kind' : ''}{' '}
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
      {saved.length > 0 && (
        <p className="muted">
          Saved: {saved.map((s) => `${cardName(s.card)} (${s.left} turns left)`).join(', ')}
        </p>
      )}
    </Modal>
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
      <ShowDialog key={state.seq} hand={state.players[actor]?.hand ?? {}} actor={actor} act={act} />
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
  hand,
  actor,
  act,
}: {
  hand: Record<string, number>;
  actor: number;
  act: (a: Action) => void;
}) {
  const have = RESOURCES.reduce((s, r) => s + (hand[r] ?? 0), 0);
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
        {RESOURCES.map((r) => (
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
