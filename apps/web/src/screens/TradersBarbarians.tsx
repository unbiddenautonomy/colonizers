import { useState } from 'react';
import type { Action, Ctx, GameState } from '@colonizers/engine';
import {
  MAX_BID,
  FISH_COST,
  fishOf,
  goldOf,
  goldStanding,
  scenarioOf,
  tbData,
  GOLD_BUYS_PER_TURN,
  GOLD_PER_RESOURCE,
  type FishUse,
} from '@colonizers/module-traders-barbarians';
import { harbormasterOf, type EventId } from '@colonizers/module-variants';
import { RESOURCE_ICON } from '../theme/clean.ts';
import { Modal } from '../ui/Modal.tsx';

/** Fish, the old boot, gold and the gold awards, for one player's row. */
export function TbPlayerStats({
  ctx,
  seat,
  viewer,
}: {
  ctx: Ctx;
  seat: number;
  viewer: number | null;
}) {
  const scenario = scenarioOf(ctx);
  const d = tbData(ctx);
  const hm = ctx.state.settings.harbormaster === true && harbormasterOf(ctx) === seat;
  if (scenario === 'fishermen') {
    const tokens = fishOf(ctx, seat);
    const mine = seat === viewer || ctx.state.winner !== null;
    const fish = tokens.reduce((s, n) => s + n, 0);
    return (
      <>
        <span title={mine ? `${tokens.length} fish tokens, ${fish} fish` : 'Fish tokens'}>
          🐟 {mine ? `${fish} (${tokens.length})` : tokens.length}
        </span>
        {d.boot === seat && (
          <span className="award" title="The old boot: one point less while you hold it">
            🥾 Old boot
          </span>
        )}
        {hm && <span className="award">Harbormaster</span>}
      </>
    );
  }
  if (scenario === 'rivers') {
    const g = goldStanding(ctx);
    return (
      <>
        <span title="Gold">🪙 {goldOf(ctx, seat)}</span>
        {g.richest === seat && <span className="award">Richest +1</span>}
        {g.poorest.includes(seat) && <span className="award warn">Poorest −2</span>}
        {hm && <span className="award">Harbormaster</span>}
      </>
    );
  }
  return hm ? <span className="award">Harbormaster</span> : null;
}

const USE_LABEL: Record<FishUse, string> = {
  robber: 'Take the robber off the board',
  steal: 'Steal a card from',
  bank: 'Take from the bank',
  road: 'Build a free road',
  devCard: 'Take a development card',
};

/** Buttons for the scenario's own moves on your turn. */
export function TbActions({
  ctx,
  actor,
  legal,
  act,
  names,
  bridgeMode,
  toggleBridge,
}: {
  ctx: Ctx;
  actor: number;
  legal: Action[];
  act: (a: Action) => void;
  names: string[];
  bridgeMode: boolean;
  toggleBridge: () => void;
}) {
  const [open, setOpen] = useState<null | 'fish' | 'gold' | 'boot'>(null);
  const scenario = scenarioOf(ctx);
  const of = (type: string) => legal.filter((a) => a.type === type);
  const close = () => setOpen(null);
  const run = (a: Action) => {
    close();
    act(a);
  };
  if (scenario === 'fishermen') {
    const fish = of('spendFish');
    const boot = of('passBoot');
    return (
      <>
        <button type="button" disabled={!fish.length} onClick={() => setOpen('fish')}>
          🐟 Spend fish
        </button>
        {boot.length > 0 && (
          <button type="button" onClick={() => setOpen('boot')}>
            🥾 Pass the boot
          </button>
        )}
        {open === 'fish' && (
          <Modal title="Spend fish" onClose={close}>
            <p>
              You have {fishOf(ctx, actor).reduce((s, n) => s + n, 0)} fish. Tokens are handed in
              whole, with no change.
            </p>
            {(Object.keys(FISH_COST) as FishUse[]).map((use) => {
              const opts = fish.filter((a) => a.use === use);
              if (!opts.length) return null;
              return (
                <div key={use} className="row wrap">
                  <strong>
                    {FISH_COST[use]} 🐟 {USE_LABEL[use]}
                  </strong>
                  {opts.length === 1 && use !== 'steal' && use !== 'bank' ? (
                    <button type="button" onClick={() => run(opts[0]!)}>
                      Do it
                    </button>
                  ) : (
                    opts.map((a, i) => (
                      <button key={i} type="button" onClick={() => run(a)}>
                        {use === 'steal'
                          ? names[a.target as number]
                          : ((RESOURCE_ICON[a.resource as string] ?? a.resource) as string)}
                      </button>
                    ))
                  )}
                </div>
              );
            })}
          </Modal>
        )}
        {open === 'boot' && (
          <Modal title="Pass the old boot" onClose={close}>
            <p>Give it to a player with as many points as you, or more.</p>
            <div className="row wrap">
              {boot.map((a) => (
                <button key={a.to as number} type="button" onClick={() => run(a)}>
                  {names[a.to as number]}
                </button>
              ))}
            </div>
          </Modal>
        )}
      </>
    );
  }
  if (scenario === 'rivers') {
    const buys = of('buyWithGold');
    return (
      <>
        <button
          type="button"
          className={bridgeMode ? 'on' : ''}
          aria-pressed={bridgeMode}
          disabled={!of('buildBridge').length}
          onClick={toggleBridge}
        >
          🌉 Bridge <small>2🧱 1🪵</small>
        </button>
        <button type="button" disabled={!buys.length} onClick={() => setOpen('gold')}>
          🪙 Buy with gold
        </button>
        {open === 'gold' && (
          <Modal title="Buy with gold" onClose={close}>
            <p>
              {GOLD_PER_RESOURCE} gold buys one resource, up to {GOLD_BUYS_PER_TURN} times a turn.
              You have {goldOf(ctx, actor)} gold.
            </p>
            <div className="row wrap">
              {buys.map((a) => (
                <button key={a.resource as string} type="button" onClick={() => run(a)}>
                  {RESOURCE_ICON[a.resource as string] ?? (a.resource as string)}
                </button>
              ))}
            </div>
          </Modal>
        )}
      </>
    );
  }
  return null;
}

export const EVENT_NAME: Record<EventId, string> = {
  prospers: 'Good times',
  robberAttacks: 'The robber strikes',
  epidemic: 'Epidemic',
  earthquake: 'Earthquake',
  goodNeighbors: 'Good neighbours',
  tournament: 'Tournament',
  tradeAdvantage: 'Trade advantage',
  calmSeas: 'Calm seas',
  robberFlees: 'The robber flees',
  neighborlyAssistance: 'Helping hand',
  conflict: 'Conflict',
  plentifulYear: 'Plentiful year',
};

const EVENT_ASK: Partial<Record<EventId, string>> = {
  earthquake: 'tap one of your roads to be damaged by the earthquake.',
  goodNeighbors: 'give one resource to the player on your left.',
  tournament: 'most knights played: take a resource from the bank.',
  calmSeas: 'most harbors: take a resource from the bank.',
  neighborlyAssistance: 'give one resource to a player with fewer points.',
  tradeAdvantage: 'take a random resource from a player of your choice.',
  conflict: 'take a random resource from a player of your choice.',
  plentifulYear: 'take a resource of your choice from the bank.',
};

/** The line at the top of the screen for this module's steps. */
export function tbPrompt(state: GameState, who: string, actor: number | null): string | null {
  const owed = (state.phase.owed as Record<number, number> | undefined)?.[actor ?? -1];
  switch (state.phase.id) {
    case 'camelVote':
      return owed
        ? `${who}: vote on the next camel. Set your wool and grain, then tap a glowing path.`
        : 'Everyone is voting on where the next camel goes.';
    case 'eventPick': {
      const event = state.phase.event as EventId;
      return owed
        ? `${who}: ${EVENT_NAME[event]}: ${EVENT_ASK[event] ?? 'make your choice.'}`
        : `${EVENT_NAME[event]}: waiting for players to choose.`;
    }
    default:
      return null;
  }
}

/** Wool and grain to put into the camel vote. */
export function CamelBidPanel({
  hand,
  bid,
  setBid,
}: {
  hand: Record<string, number>;
  bid: { wool: number; grain: number };
  setBid: (b: { wool: number; grain: number }) => void;
}) {
  const step = (card: 'wool' | 'grain', d: number) => {
    const next = { ...bid, [card]: bid[card] + d };
    if (next[card] < 0 || next[card] > (hand[card] ?? 0) || next.wool + next.grain > MAX_BID)
      return;
    setBid(next);
  };
  return (
    <div className="row wrap camel-bid" aria-label="Your camel vote">
      <span>🐪 Votes:</span>
      {(['wool', 'grain'] as const).map((c) => (
        <span key={c} className="row">
          {RESOURCE_ICON[c]}
          <button
            type="button"
            className="small"
            onClick={() => step(c, -1)}
            aria-label={`Less ${c}`}
          >
            −
          </button>
          <strong>{bid[c]}</strong>
          <button
            type="button"
            className="small"
            onClick={() => step(c, 1)}
            aria-label={`More ${c}`}
          >
            +
          </button>
        </span>
      ))}
      <small className="muted">Up to {MAX_BID}; cards bid are spent either way.</small>
    </div>
  );
}

/** Choices for an event card that are not on the board. */
export function EventPickDialog({
  state,
  legal,
  act,
  names,
}: {
  state: GameState;
  legal: Action[];
  act: (a: Action) => void;
  names: string[];
}) {
  const picks = legal.filter((a) => a.type === 'eventPick' && typeof a.edge !== 'string');
  if (state.phase.id !== 'eventPick' || !picks.length) return null;
  const event = state.phase.event as EventId;
  const label = (a: Action) => {
    const res = typeof a.resource === 'string' ? (RESOURCE_ICON[a.resource] ?? a.resource) : '';
    if (typeof a.to === 'number') return `${res} to ${names[a.to]}`;
    if (typeof a.from === 'number') return names[a.from] ?? '';
    return res;
  };
  return (
    <Modal title={EVENT_NAME[event]}>
      <p>{EVENT_ASK[event]}</p>
      <div className="row wrap">
        {picks.map((a, i) => (
          <button key={i} type="button" onClick={() => act(a)}>
            {label(a)}
          </button>
        ))}
      </div>
    </Modal>
  );
}
