import { useState, type ReactNode } from 'react';
import type { Action, CornerId, Ctx, EdgeId, GameState } from '@colonizers/engine';
import {
  cargoOf,
  GOLD,
  GOLD_BUYS,
  GOLD_PRICE,
  movesLeft,
  SETTLERS,
  settlersOut,
} from '@colonizers/module-explorers-pirates';
import type { Targets } from '../board/Board.tsx';
import { RESOURCE_ICON } from '../theme/clean.ts';
import { CostLine, RESOURCES } from '../ui/Cards.tsx';
import { Modal } from '../ui/Modal.tsx';

/** Board modes for Explorers & Pirates. 'ship' (building one) is shared with Seafarers. */
export type EpMode = 'harbor' | 'settler' | 'sail' | 'cargo' | 'found';

export const EP_MODES: readonly string[] = ['harbor', 'settler', 'sail', 'cargo', 'found'];

/** Gold and ships, for one player's row. */
export function EpPlayerStats({ ctx, seat }: { ctx: Ctx; seat: number }) {
  const ships = ctx.piecesOf(seat, 'ship');
  const settlers = settlersOut(ctx, seat);
  return (
    <>
      <span title="Gold">🪙 {ctx.player(seat).hand[GOLD] ?? 0}</span>
      <span title="Ships">⛵ {ships.length}</span>
      {settlers > 0 && (
        <span title={`Settlers on ships and docks (at most ${SETTLERS})`}>🧑‍🌾 {settlers}</span>
      )}
    </>
  );
}

/** What can be tapped on the board in an Explorers & Pirates mode. */
export function epTargets(
  state: GameState,
  legal: Action[],
  mode: EpMode,
  selectedShip: string | null,
): Targets {
  const t: Targets = { corners: new Map(), edges: new Map(), hexes: new Map() };
  const at = (id: unknown) => (typeof id === 'string' ? state.pieces[id]?.at : undefined);
  for (const a of legal) {
    if (mode === 'harbor' && a.type === 'buildHarbor') t.corners.set(a.corner as CornerId, a);
    if (mode === 'settler' && a.type === 'buildSettler') {
      const loc = at(a.at);
      if (loc?.kind === 'corner') t.corners.set(loc.id, a);
      if (loc?.kind === 'edge') t.edges.set(loc.id, a);
    }
    if (mode === 'cargo' && a.type === 'swapCargo') {
      const loc = at(a.ship);
      if (loc?.kind === 'edge') t.edges.set(loc.id, a);
    }
    if (mode === 'found' && a.type === 'foundSettlement') t.corners.set(a.corner as CornerId, a);
    if (mode === 'sail' && a.type === 'sailShip') {
      // First pick a ship, then where it sails.
      if (selectedShip === null) {
        const loc = at(a.ship);
        if (loc?.kind === 'edge')
          t.edges.set(loc.id, { type: 'selectShip', player: a.player, ship: a.ship });
      } else if (a.ship === selectedShip) t.edges.set(a.to as EdgeId, a);
    }
  }
  return t;
}

export function epPrompt(state: GameState, who: string, mode: string | null): string | null {
  if (state.phase.id === 'setup') {
    const first = (state.phase.index as number) < state.players.length;
    if ((state.phase.step as string) === 'road')
      return first
        ? `${who}: place a ship beside your harbor settlement. It carries your first settler.`
        : `${who}: place a road next to your new settlement.`;
    return first
      ? `${who}: place your harbor settlement on the coast of the home island.`
      : `${who}: place a settlement (your second, which collects resources).`;
  }
  if (state.phase.id !== 'main' && state.phase.id !== 'sail') return null;
  switch (mode) {
    case 'sail':
      return `${who}: tap a ship, then where it sails. The fog stops it.`;
    case 'harbor':
      return `${who}: tap a settlement on the coast to make it a harbor settlement.`;
    case 'settler':
      return `${who}: tap your harbor settlement, or your ship beside it, for the new settler.`;
    case 'cargo':
      return `${who}: tap a ship beside your harbor settlement to swap their cargo.`;
    case 'found':
      return `${who}: tap a glowing corner to found a settlement there.`;
    case 'ship':
      return `${who}: tap a glowing edge beside your harbor settlement for the new ship.`;
  }
  if (state.phase.id === 'sail')
    return `${who}: sail on, swap cargo or found a settlement, then end your turn.`;
  return null;
}

export function EpActions({
  ctx,
  actor,
  legal,
  act,
  mode,
  setMode,
  selectedShip,
}: {
  ctx: Ctx;
  actor: number;
  legal: Action[];
  act: (a: Action) => void;
  mode: string | null;
  setMode: (m: EpMode | 'ship' | null) => void;
  selectedShip: string | null;
}) {
  const [goldOpen, setGoldOpen] = useState(false);
  const has = (type: string) => legal.some((a) => a.type === type);
  const sailing = ctx.state.phase.id === 'sail';
  const toggle = (m: EpMode | 'ship') => setMode(mode === m ? null : m);
  const gold = ctx.player(actor).hand[GOLD] ?? 0;
  const boost = selectedShip
    ? legal.find((a) => a.type === 'boostShip' && a.ship === selectedShip)
    : undefined;
  const ship = selectedShip ? ctx.state.pieces[selectedShip] : undefined;
  const buys = legal.filter((a) => a.type === 'buyWithGold');
  const sells = legal.filter((a) => a.type === 'bankTrade' && a.get === GOLD);
  const modeButton = (m: EpMode | 'ship', label: ReactNode, type: string) => (
    <button
      key={m}
      type="button"
      className={mode === m ? 'on' : ''}
      aria-pressed={mode === m}
      disabled={!has(type)}
      onClick={() => toggle(m)}
    >
      {label}
    </button>
  );
  return (
    <>
      {!sailing && (
        <>
          {modeButton(
            'harbor',
            <>
              ⚓ Harbor <CostLine cost={ctx.cost('harbor', actor)} />
            </>,
            'buildHarbor',
          )}
          {modeButton(
            'ship',
            <>
              ⛵ Ship <CostLine cost={ctx.cost('ship', actor)} />
            </>,
            'buildShip',
          )}
          {modeButton(
            'settler',
            <>
              🧑‍🌾 Settler <CostLine cost={ctx.cost('settler', actor)} />
            </>,
            'buildSettler',
          )}
          <button type="button" disabled={!gold} onClick={() => setGoldOpen(true)}>
            🪙 Gold ({gold})
          </button>
        </>
      )}
      {modeButton('sail', '🧭 Sail', 'sailShip')}
      {mode === 'sail' && boost && (
        <button type="button" onClick={() => act(boost)}>
          Extra sails: +2 <CostLine cost={ctx.cost('boost', actor)} />
        </button>
      )}
      {mode === 'sail' && ship && (
        <span className="muted small">
          {Math.max(0, movesLeft(ship))} move{movesLeft(ship) === 1 ? '' : 's'} left
          {cargoOf(ship).length ? ` · carrying ${cargoOf(ship).join(', ')}` : ''}
        </span>
      )}
      {modeButton('cargo', '🔁 Swap cargo', 'swapCargo')}
      {modeButton('found', '🏠 Found settlement', 'foundSettlement')}
      {sailing && (
        <button
          type="button"
          className="primary"
          disabled={!has('endTurn')}
          onClick={() => act({ type: 'endTurn', player: actor })}
          data-shortcut="e"
          title="End turn (E)"
        >
          End turn
        </button>
      )}
      {goldOpen && (
        <Modal title="Gold" onClose={() => setGoldOpen(false)}>
          <p>
            You have {gold} 🪙. {GOLD_PRICE} gold buy 1 resource, up to {GOLD_BUYS} a turn. Three of
            one resource sell for 1 gold.
          </p>
          <h3 className="subhead">Buy for {GOLD_PRICE} 🪙</h3>
          <div className="row wrap">
            {RESOURCES.map((r) => {
              const a = buys.find((x) => x.resource === r);
              return (
                <button
                  key={r}
                  type="button"
                  disabled={!a}
                  onClick={() => {
                    if (a) act(a);
                  }}
                >
                  {RESOURCE_ICON[r]}
                </button>
              );
            })}
          </div>
          <h3 className="subhead">Sell 3 for 1 🪙</h3>
          <div className="row wrap">
            {RESOURCES.map((r) => {
              const a = sells.find((x) => x.give === r);
              return (
                <button
                  key={r}
                  type="button"
                  disabled={!a}
                  onClick={() => {
                    if (a) act(a);
                  }}
                >
                  3 {RESOURCE_ICON[r]}
                </button>
              );
            })}
          </div>
        </Modal>
      )}
    </>
  );
}
