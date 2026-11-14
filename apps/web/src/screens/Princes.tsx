import type { Action, CornerId, EdgeId, GameState, HexId } from '@colonizers/engine';
import type { Targets } from '../board/Board.tsx';

/** Princes & Explorers on screen: the princes, the explorers' swap and the new robber. */

export const princesOn = (state: GameState) => state.modules.includes('princes');

/** Steps where the player taps the board. */
export const PRINCES_BOARD_PHASES = ['princeMove', 'explore', 'princesRobber'];

/**
 * What can be tapped. A prince move is two taps (the prince, then where it
 * goes), and so is a swap (one number, then the other).
 */
export function princesTargets(
  state: GameState,
  legal: Action[],
  selected: string | null,
): Targets {
  const t: Targets = {
    corners: new Map<CornerId, Action>(),
    edges: new Map<EdgeId, Action>(),
    hexes: new Map<HexId, Action>(),
  };
  const pick = (player: number, id: string): Action => ({
    type: 'selectKnight',
    player,
    knight: id,
  });
  switch (state.phase.id) {
    case 'princeMove':
      for (const a of legal) {
        if (a.type !== 'movePrince') continue;
        const p = state.pieces[a.prince as string];
        if (selected === null || !legal.some((x) => x.prince === selected)) {
          if (p?.at.kind === 'hex') t.hexes.set(p.at.id, pick(a.player, p.id));
        } else if (a.prince === selected) t.hexes.set(a.hex as HexId, a);
      }
      return t;
    case 'explore':
      for (const a of legal) {
        if (a.type !== 'exploreSwap' || !a.hexes) continue;
        const [x, y] = a.hexes as [HexId, HexId];
        if (selected === x) t.hexes.set(y, a);
        else if (selected === y) t.hexes.set(x, a);
        else if (selected === null) {
          t.hexes.set(x, pick(a.player, x));
          t.hexes.set(y, pick(a.player, y));
        }
      }
      return t;
    case 'princesRobber':
      for (const a of legal) if (a.type === 'placePrincesRobber') t.hexes.set(a.hex as HexId, a);
      return t;
    default:
      return t;
  }
}

export function princesPrompt(
  state: GameState,
  who: string,
  actor: number | null,
  selected: string | null,
): string | null {
  const ph = state.phase;
  const by = state.players[ph.by as number]?.name ?? 'A player';
  const mine = ph.by === actor;
  switch (ph.id) {
    case 'princeMove':
      if (!mine) return `${by} is moving a prince.`;
      return selected
        ? `${who}: tap the field the prince moves to.`
        : `${who}: tap a prince to move it one field (not across another player’s road).`;
    case 'explore':
      if (!mine) return `${by} is exploring.`;
      return selected
        ? `${who}: tap the neighbouring number to swap with.`
        : `${who}: your explorers can swap two neighbouring numbers. Tap the first, or leave them.`;
    case 'princesRobber':
      return mine
        ? `${who}: you settled at the desert first. Tap a field for the robber.`
        : `${by} is bringing in the robber.`;
    default:
      return null;
  }
}

/** The explorers may leave the numbers as they are. */
export function PrincesChoices({
  state,
  legal,
  act,
}: {
  state: GameState;
  legal: Action[];
  act: (a: Action) => void;
}) {
  if (state.phase.id !== 'explore') return null;
  const skip = legal.find((a) => a.type === 'exploreSwap' && a.hexes === null);
  if (!skip) return null;
  return (
    <button type="button" onClick={() => act(skip)}>
      Leave the numbers
    </button>
  );
}

/** The princes on the board, drawn like the other neutral figures. */
export function princesMarkers(state: GameState): {
  id: string;
  hex: HexId;
  owner: number | null;
  icon: string;
  label: string;
  dx: number;
  dy: number;
}[] {
  return Object.values(state.pieces)
    .filter((p) => p.type === 'prince' && p.at.kind === 'hex')
    .map((p) => ({
      id: p.id,
      hex: (p.at as { id: HexId }).id,
      owner: null,
      icon: '🤴',
      label:
        'A prince: buildings here score a point more, and roads here count double for the longest road',
      dx: 0,
      dy: -0.56,
    }));
}
