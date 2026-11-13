import { useState } from 'react';
import type { Action, CornerId, Ctx, EdgeId, GameState } from '@colonizers/engine';
import { duelOn, NEUTRAL_NAMES, tokenCost, tokensOf } from '@colonizers/module-variants';
import type { Targets } from '../board/Board.tsx';
import { CardPicker, RESOURCES } from '../ui/Cards.tsx';
import { Modal } from '../ui/Modal.tsx';

/** Two-player duel rules: neutral builders, two rolls a turn and trade tokens. */

const NEUTRAL_ICON = ['⚪', '⚫'];

/** Trade tokens, for one player's row. */
export function DuelStats({ ctx, seat }: { ctx: Ctx; seat: number }) {
  if (!duelOn(ctx)) return null;
  return <span title="Trade tokens">🎟️ {tokensOf(ctx, seat)}</span>;
}

/** Where the free neutral road or settlement can go, the chosen builder first. */
export function duelTargets(legal: Action[], neutral: number): Targets {
  const t: Targets = { corners: new Map(), edges: new Map(), hexes: new Map() };
  const ordered = [...legal].sort(
    (a, b) => Number(b.neutral === neutral) - Number(a.neutral === neutral),
  );
  for (const a of ordered) {
    if (a.type === 'neutralRoad' && !t.edges.has(a.edge as EdgeId))
      t.edges.set(a.edge as EdgeId, a);
    if (a.type === 'neutralSettlement' && !t.corners.has(a.corner as CornerId))
      t.corners.set(a.corner as CornerId, a);
  }
  return t;
}

export function duelPrompt(state: GameState, who: string): string | null {
  if (
    state.settings.twoPlayer !== true ||
    state.players.length !== 2 ||
    state.modules.includes('cities-knights') ||
    state.modules.includes('explorers-pirates')
  )
    return null;
  const ph = state.phase;
  const d = (state.data.variants as { duel?: { again: boolean; turn: number } } | undefined)?.duel;
  if (ph.id === 'neutralBuild')
    return ph.piece === 'settlement'
      ? `${who}: place a free settlement for a neutral builder, on one of its roads.`
      : `${who}: place a free road for a neutral builder, joined to its pieces.`;
  if (ph.id === 'giveBack') return `${who}: give back ${ph.count as number} cards of your choice.`;
  if (ph.id === 'roll' && d?.again && d.turn === state.turn.number)
    return `${who}: roll again. The second roll can't repeat the first.`;
  return null;
}

/** Picking the neutral builder, and spending trade tokens. */
export function DuelActions({
  ctx,
  actor,
  legal,
  act,
  neutral,
  setNeutral,
}: {
  ctx: Ctx;
  actor: number;
  legal: Action[];
  act: (a: Action) => void;
  neutral: number;
  setNeutral: (n: number) => void;
}) {
  if (!duelOn(ctx)) return null;
  if (ctx.state.phase.id === 'neutralBuild') {
    const can = (n: number) => legal.some((a) => a.neutral === n);
    return (
      <>
        {[0, 1].map((n) => (
          <button
            key={n}
            type="button"
            className={neutral === n ? 'on' : ''}
            aria-pressed={neutral === n}
            disabled={!can(n)}
            onClick={() => setNeutral(n)}
          >
            {NEUTRAL_ICON[n]} {NEUTRAL_NAMES[n]} builder
          </button>
        ))}
      </>
    );
  }
  if (ctx.state.phase.id !== 'main') return null;
  const cost = tokenCost(ctx, actor);
  const label = `${cost} 🎟️`;
  const force = legal.find((a) => a.type === 'forceTrade');
  const home = legal.find((a) => a.type === 'robberHome');
  return (
    <>
      <button
        type="button"
        disabled={!force}
        onClick={() => force && act(force)}
        title="Take 2 random resources from your opponent, then give back 2 of your choice"
      >
        🎟️ Forced trade <span className="muted small">{label}</span>
      </button>
      <button
        type="button"
        disabled={!home}
        onClick={() => home && act(home)}
        title="Send the robber back to the desert"
      >
        🏜️ Robber home <span className="muted small">{label}</span>
      </button>
    </>
  );
}

export function GiveBackDialog({
  name,
  hand,
  count,
  onGive,
}: {
  name: string;
  hand: Record<string, number>;
  count: number;
  onGive: (cards: Record<string, number>) => void;
}) {
  const [pick, setPick] = useState<Record<string, number>>({});
  const n = Object.values(pick).reduce((s, x) => s + x, 0);
  return (
    <Modal title={`${name}: give back ${count}`}>
      <p>
        You took {count} cards from your opponent. Pick {count} to give back.
      </p>
      <CardPicker
        value={pick}
        onChange={setPick}
        max={hand}
        label="Cards to give back"
        cards={RESOURCES}
      />
      <button
        type="button"
        className="primary"
        disabled={n !== count}
        onClick={() => onGive(Object.fromEntries(Object.entries(pick).filter(([, k]) => k > 0)))}
      >
        Give back {n}/{count}
      </button>
    </Modal>
  );
}
