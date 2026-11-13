import { useState } from 'react';
import type { Action, CornerId, Ctx, GameState, HexId } from '@colonizers/engine';
import {
  beerOf,
  beerRatio,
  BUILDINGS,
  buildingsOf,
  GWP_COMMODITIES,
  type Building,
} from '@colonizers/module-greed-wealth-power';
import { nameOf } from '@colonizers/rulebook';
import type { Targets } from '../board/Board.tsx';
import { CostLine, ResourceCard } from '../ui/Cards.tsx';
import { Modal } from '../ui/Modal.tsx';

/** Board modes for Greed, Wealth & Power: one per building, and Beer for a knight. */
export type GwpMode = Building | 'beerKnight';
export const GWP_MODES: readonly string[] = [...BUILDINGS, 'beerKnight'];

export const GWP_ICON: Record<Building, string> = {
  citadel: '🏰',
  diocese: '⛪',
  monument: '🗿',
  silo: '🌾',
};

const LABEL: Record<Building, string> = {
  citadel: 'Citadel',
  diocese: 'Diocese',
  monument: 'Monument',
  silo: 'Silo',
};

const WHERE: Record<Building, string> = {
  citadel: 'brick hex',
  diocese: 'grain hex',
  monument: 'gold field',
  silo: 'grain hex',
};

export function gwpOn(state: GameState): boolean {
  return state.modules.includes('greed-wealth-power');
}

/** Beer and buildings, for one player's row. */
export function GwpPlayerStats({ ctx, seat }: { ctx: Ctx; seat: number }) {
  const mine = buildingsOf(ctx, seat);
  const built = BUILDINGS.filter((b) => mine[b]);
  return (
    <>
      <span title="Beer">🍺 {beerOf(ctx, seat)}</span>
      {built.length > 0 && (
        <span title={built.map((b) => LABEL[b]).join(', ')}>
          {built.map((b) => GWP_ICON[b]).join('')}
        </span>
      )}
    </>
  );
}

/**
 * What can be tapped in a Greed, Wealth & Power mode. For a building: first
 * the city (when it could go on more than one hex), then the hex.
 */
export function gwpTargets(
  legal: Action[],
  mode: GwpMode,
  picked: string | null,
  state: GameState,
): Targets {
  const t: Targets = { corners: new Map(), edges: new Map(), hexes: new Map() };
  if (mode === 'beerKnight') {
    for (const a of legal) {
      if (a.type !== 'beerKnight') continue;
      const k = state.pieces[a.knight as string];
      if (k?.at.kind === 'corner') t.corners.set(k.at.id, a);
    }
    return t;
  }
  const opts = legal.filter((a) => a.type === 'buildGwp' && a.building === mode);
  const byCorner = new Map<CornerId, Action[]>();
  for (const a of opts) {
    const list = byCorner.get(a.corner as CornerId) ?? [];
    list.push(a);
    byCorner.set(a.corner as CornerId, list);
  }
  if (picked && byCorner.has(picked as CornerId)) {
    for (const a of byCorner.get(picked as CornerId) ?? []) t.hexes.set(a.hex as HexId, a);
    return t;
  }
  for (const [corner, list] of byCorner) {
    t.corners.set(
      corner,
      list.length === 1
        ? (list[0] as Action)
        : { type: 'selectKnight', player: list[0]!.player, knight: corner },
    );
  }
  return t;
}

export function gwpPrompt(who: string, mode: string | null, picked: string | null): string | null {
  if (mode === 'beerKnight')
    return `${who}: tap any inactive knight to switch it on for 1 Beer. Tap the button again to cancel.`;
  if (mode && (BUILDINGS as readonly string[]).includes(mode)) {
    const b = mode as Building;
    return picked
      ? `${who}: tap the ${WHERE[b]} for your ${LABEL[b]}.`
      : `${who}: tap the city for your ${LABEL[b]} (then the ${WHERE[b]}, if it touches more than one). Tap the button again to cancel.`;
  }
  return null;
}

/** Buttons for the buildings and Beer, on your turn. */
export function GwpActions({
  ctx,
  actor,
  legal,
  act,
  mode,
  setMode,
}: {
  ctx: Ctx;
  actor: number;
  legal: Action[];
  act: (a: Action) => void;
  mode: string | null;
  setMode: (m: GwpMode | null) => void;
}) {
  const [beerOpen, setBeerOpen] = useState(false);
  const mine = buildingsOf(ctx, actor);
  const beer = beerOf(ctx, actor);
  const can = (b: Building) => legal.some((a) => a.type === 'buildGwp' && a.building === b);
  const trades = legal.filter((a) => a.type === 'beerTrade');
  return (
    <>
      {BUILDINGS.filter((b) => !mine[b]).map((b) => (
        <button
          key={b}
          type="button"
          className={mode === b ? 'on' : ''}
          aria-pressed={mode === b}
          disabled={!can(b)}
          onClick={() => setMode(mode === b ? null : b)}
          title={`${LABEL[b]}: on a ${WHERE[b]} beside one of your cities`}
        >
          {GWP_ICON[b]} {LABEL[b]} <CostLine cost={ctx.cost(b, actor)} />
        </button>
      ))}
      <button
        type="button"
        className={mode === 'beerKnight' ? 'on' : ''}
        aria-pressed={mode === 'beerKnight'}
        disabled={!legal.some((a) => a.type === 'beerKnight')}
        onClick={() => setMode(mode === 'beerKnight' ? null : 'beerKnight')}
        title="Switch on any knight for 1 Beer"
      >
        🍺 Knight
      </button>
      <button type="button" disabled={!trades.length} onClick={() => setBeerOpen(true)}>
        🍺 Beer for commodities ({beer})
      </button>
      {beerOpen && (
        <Modal title="Beer for commodities" onClose={() => setBeerOpen(false)}>
          <p>
            You have {beer} Beer. The bank gives 1 commodity for {beerRatio(ctx, actor)} Beer.
          </p>
          <div className="row">
            {trades.map((a) => (
              <button
                key={a.get as string}
                type="button"
                onClick={() => {
                  act(a);
                  if (beer - beerRatio(ctx, actor) < beerRatio(ctx, actor)) setBeerOpen(false);
                }}
              >
                <ResourceCard card={a.get as string} />
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

/** The GWP commodities, for the hand row. */
export const GWP_HAND = GWP_COMMODITIES;

/** Small markers for the special buildings, drawn on the hex beside their city. */
export function buildingMarkers(state: GameState): {
  key: string;
  corner: CornerId;
  hex: HexId;
  owner: number;
  building: Building;
  label: string;
}[] {
  const d = state.data['greed-wealth-power'] as
    | { buildings?: Record<number, Partial<Record<Building, { corner: CornerId; hex: HexId }>>> }
    | undefined;
  const out: {
    key: string;
    corner: CornerId;
    hex: HexId;
    owner: number;
    building: Building;
    label: string;
  }[] = [];
  for (const [seat, mine] of Object.entries(d?.buildings ?? {}))
    for (const b of BUILDINGS) {
      const at = mine[b];
      if (at)
        out.push({
          key: `${seat}-${b}`,
          corner: at.corner,
          hex: at.hex,
          owner: Number(seat),
          building: b,
          label: `${nameOf(b).name}`,
        });
    }
  return out;
}
