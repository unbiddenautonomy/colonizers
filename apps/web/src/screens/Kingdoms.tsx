import type { ReactNode } from 'react';
import type { Action, CornerId, Ctx, EdgeId, GameState, HexId } from '@colonizers/engine';
import {
  hasFree,
  kingdomPoints,
  MARKER,
  MARKER_PAY,
  markersOf,
} from '@colonizers/module-kingdoms-warriors';
import type { Targets } from '../board/Board.tsx';
import { CostLine } from '../ui/Cards.tsx';

/** Kingdoms & Warriors on screen: kingdom markers on the fields, and the buttons to place them. */

export const kingdomsOn = (state: GameState) => state.modules.includes('kingdoms');

export type KingdomMode = 'kingdom:ore' | 'kingdom:grain' | 'kingdomFree';
export const KINGDOM_MODES: readonly string[] = ['kingdom:ore', 'kingdom:grain', 'kingdomFree'];

/** Fields where a marker can go in this mode. */
export function kingdomTargets(legal: Action[], mode: KingdomMode): Targets {
  const t: Targets = {
    corners: new Map<CornerId, Action>(),
    edges: new Map<EdgeId, Action>(),
    hexes: new Map<HexId, Action>(),
  };
  for (const a of legal) {
    if (mode === 'kingdomFree' ? a.type !== 'placeFreeMarker' : a.type !== 'buyMarker') continue;
    if (mode !== 'kingdomFree' && `kingdom:${a.pay as string}` !== mode) continue;
    t.hexes.set(a.hex as HexId, a);
  }
  return t;
}

/** Markers to draw: a small disc in the owner's colour, side by side when two share a field. */
export function kingdomsMarkers(state: GameState): {
  id: string;
  hex: HexId;
  owner: number | null;
  icon: string;
  label: string;
  dx: number;
  dy: number;
}[] {
  const seen = new Map<string, number>();
  return Object.values(state.pieces)
    .filter((p) => p.type === MARKER && p.at.kind === 'hex')
    .map((p) => {
      const hex = (p.at as { id: HexId }).id;
      const k = seen.get(hex) ?? 0;
      seen.set(hex, k + 1);
      const fight = typeof p.props.contest === 'string';
      return {
        id: p.id,
        hex,
        owner: p.owner,
        icon: fight ? '⚔️' : '👑',
        label: fight
          ? 'A kingdom marker on a rival’s field: they fight when the turn ends'
          : 'A kingdom marker: it takes this field’s resource, and every 3 joined make a point',
        dx: -0.42 + k * 0.3,
        dy: 0.42,
      };
    });
}

export function KingdomsActions({
  ctx,
  actor,
  legal,
  mode,
  setMode,
}: {
  ctx: Ctx;
  actor: number;
  legal: Action[];
  mode: string | null;
  setMode: (m: KingdomMode | null) => void;
}) {
  const can = (pay: 'ore' | 'grain') => legal.some((a) => a.type === 'buyMarker' && a.pay === pay);
  const free = hasFree(ctx, actor);
  const button = (m: KingdomMode, label: ReactNode, ok: boolean, title: string) => (
    <button
      key={m}
      type="button"
      className={mode === m ? 'on' : ''}
      aria-pressed={mode === m}
      disabled={!ok}
      onClick={() => setMode(mode === m ? null : m)}
      title={title}
    >
      {label}
    </button>
  );
  return (
    <>
      {button(
        'kingdom:ore',
        <>
          👑 Kingdom <CostLine cost={MARKER_PAY.ore} />
        </>,
        can('ore'),
        'A kingdom marker beside one of your cities or markers, paid with ore',
      )}
      {button(
        'kingdom:grain',
        <>
          👑 Kingdom <CostLine cost={MARKER_PAY.grain} />
        </>,
        can('grain'),
        'A kingdom marker beside one of your cities or markers, paid with grain',
      )}
      {free &&
        button(
          'kingdomFree',
          <>👑 Free marker</>,
          legal.some((a) => a.type === 'placeFreeMarker'),
          'Place your free kingdom marker',
        )}
    </>
  );
}

/** Kingdom markers and points, for the player list. */
export function KingdomsStats({ ctx, seat }: { ctx: Ctx; seat: number }) {
  const n = markersOf(ctx, seat).length;
  if (!n) return null;
  return (
    <small className="muted" title="Kingdom markers, and the points their kingdoms are worth">
      👑 {n} · {kingdomPoints(ctx, seat)} VP
    </small>
  );
}
