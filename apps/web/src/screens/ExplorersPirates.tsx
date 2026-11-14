import { useState, type ReactNode } from 'react';
import type { Action, CornerId, Ctx, EdgeId, GameState, HexId } from '@colonizers/engine';
import {
  cargoOf,
  CREWS,
  crewsOut,
  epData,
  GOLD,
  hasPirate,
  LAIR_CREWS,
  missionSteps,
  GOLD_BUYS,
  GOLD_PRICE,
  goldPrice,
  hasFish,
  hasSpice,
  movesLeft,
  SETTLERS,
  settlersOut,
  SPICE_PRICE,
} from '@colonizers/module-explorers-pirates';
import type { Targets } from '../board/Board.tsx';
import { RESOURCE_ICON } from '../theme/clean.ts';
import { CostLine, RESOURCES } from '../ui/Cards.tsx';
import { Modal } from '../ui/Modal.tsx';

/** Board modes for Explorers & Pirates. 'ship' (building one) is shared with Seafarers. */
export type EpMode =
  | 'harbor'
  | 'settler'
  | 'crew'
  | 'sail'
  | 'cargo'
  | 'found'
  | 'lair'
  | 'chase'
  | 'spice'
  | 'deliver'
  // With Soldiers & Armies: armies board and leave ships, and fight the pirate from them.
  | 'board'
  | 'land'
  | 'pirateFight'
  | 'lairUnits'
  | 'seaAttack';

export const EP_MODES: readonly string[] = [
  'harbor',
  'settler',
  'crew',
  'sail',
  'cargo',
  'found',
  'lair',
  'chase',
  'spice',
  'deliver',
  'board',
  'land',
  'pirateFight',
  'lairUnits',
  'seaAttack',
];

/** With Soldiers & Armies, units storm the lairs and crews are gone. */
const withUnits = (ctx: Ctx) => ctx.state.modules.includes('soldiers');

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
      {hasPirate(ctx) && (
        <>
          {!withUnits(ctx) && (
            <span title={`Crews out (at most ${CREWS})`}>⚔️ {crewsOut(ctx, seat)}</span>
          )}
          <span title="Pirate lair mission: 1 point per step">
            🏴‍☠️ {missionSteps(ctx, seat, 'lairs')}
          </span>
        </>
      )}
      {hasFish(ctx) && (
        <span title="Fish mission: 1 point for every 2 fish brought home">
          🐟 {missionSteps(ctx, seat, 'fish')}
        </span>
      )}
      {hasSpice(ctx) && (
        <span title="Spice mission: 1 point for every 2 sacks of spice brought home">
          🌶️ {missionSteps(ctx, seat, 'spices')}
        </span>
      )}
    </>
  );
}

/** The missions in play, for the side panel. */
export function EpStatus({ ctx }: { ctx: Ctx }) {
  const lairs = hasPirate(ctx);
  const fish = hasFish(ctx);
  const spice = hasSpice(ctx);
  if (!lairs && !fish && !spice) return null;
  const d = epData(ctx);
  const total = Object.keys(d.lairs).length + d.captured.length;
  return (
    <div className="tda-status" aria-label="Missions">
      {lairs && (
        <p>
          🏴‍☠️ Pirate lairs captured: <strong>{d.captured.length}</strong> of {total}
          <small className="muted">
            {' '}
            · {LAIR_CREWS} {withUnits(ctx) ? 'unit points' : 'crews'} take a lair
          </small>
        </p>
      )}
      {fish && (
        <p>
          🐟 Fishing grounds
          <small className="muted">
            {' '}
            · ships beside one take a fish on its number; 2 fish brought home are a step
          </small>
        </p>
      )}
      {spice && (
        <p>
          🌶️ Spice villages
          <small className="muted">
            {' '}
            · {SPICE_PRICE} gold a sack; 2 sacks brought home are a step
          </small>
        </p>
      )}
      <p>
        <small className="muted">Each step on a mission track is 1 point.</small>
      </p>
    </div>
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
    if (mode === 'crew' && a.type === 'buildCrew') {
      const loc = at(a.at);
      if (loc?.kind === 'corner') t.corners.set(loc.id, a);
      if (loc?.kind === 'edge') t.edges.set(loc.id, a);
    }
    if (mode === 'lair' && a.type === 'landCrew') t.hexes.set(a.hex as HexId, a);
    if (
      (mode === 'spice' && a.type === 'buySpice') ||
      (mode === 'deliver' && a.type === 'deliverGoods')
    ) {
      const loc = at(a.ship);
      if (loc?.kind === 'edge') t.edges.set(loc.id, a);
    }
    if (mode === 'board' && a.type === 'boardShip') {
      const loc = at(a.army);
      if (loc?.kind === 'corner') t.corners.set(loc.id, a);
    }
    if (mode === 'land' && a.type === 'landArmy') t.corners.set(a.corner as CornerId, a);
    if (mode === 'lairUnits' && a.type === 'landUnits') t.hexes.set(a.hex as HexId, a);
    if (mode === 'seaAttack' && a.type === 'attackShip') {
      const loc = at(a.target);
      if (loc?.kind === 'edge') t.edges.set(loc.id, a);
    }
    if (
      (mode === 'chase' && a.type === 'chasePirate') ||
      (mode === 'pirateFight' && a.type === 'attackPirate')
    ) {
      const loc = at(a.ship);
      if (loc?.kind === 'edge') t.edges.set(loc.id, a);
    }
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
  if (state.phase.id === 'moveRobber')
    return `${who}: move the pirate ship to open sea away from the home island. It robs a player with a ship beside it.`;
  if (state.phase.id !== 'main' && state.phase.id !== 'sail' && state.phase.id !== 'campaign')
    return null;
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
    case 'crew':
      return `${who}: tap your harbor settlement, or your ship beside it, for the new crew.`;
    case 'lair':
      return `${who}: tap a pirate lair beside your ship to land its crews.`;
    case 'chase':
      return `${who}: tap your ship beside the pirate. On a 6 the pirate is driven off.`;
    case 'ship':
      return `${who}: tap a glowing edge beside your harbor settlement for the new ship.`;
    case 'spice':
      return `${who}: tap your ship beside a spice village to buy a sack for ${SPICE_PRICE} gold.`;
    case 'deliver':
      return `${who}: tap your ship beside your harbor settlement to bring its fish and spice ashore.`;
    case 'board':
      return `${who}: tap your army at a harbor settlement to put it aboard your empty ship there.`;
    case 'land':
      return `${who}: tap a free corner at either end of your ship to put its army ashore.`;
    case 'pirateFight':
      return `${who}: tap your ship with an army aboard beside the pirate ship to fight it.`;
    case 'lairUnits':
      return `${who}: tap a pirate lair beside your ship to put its army ashore there. 3 unit points take it.`;
    case 'seaAttack':
      return `${who}: tap a rival ship with cargo next to your ship with an army aboard.`;
  }
  if (state.phase.id === 'campaign') return null;
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
  // With Soldiers & Armies, ships sail while the armies are in the field.
  const sailing = ctx.state.phase.id === 'sail' || ctx.state.phase.id === 'campaign';
  const lairs = hasPirate(ctx);
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
          {lairs &&
            !withUnits(ctx) &&
            modeButton(
              'crew',
              <>
                ⚔️ Crew <CostLine cost={ctx.cost('crew', actor)} />
              </>,
              'buildCrew',
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
      {lairs && !withUnits(ctx) && modeButton('lair', '🏴‍☠️ Land crews', 'landCrew')}
      {lairs && has('landUnits') && modeButton('lairUnits', '🏴‍☠️ Storm lair', 'landUnits')}
      {has('attackShip') && modeButton('seaAttack', '⚔️ Attack ship', 'attackShip')}
      {lairs && has('chasePirate') && modeButton('chase', '💥 Chase pirate', 'chasePirate')}
      {has('boardShip') && modeButton('board', '🪖 Board ship', 'boardShip')}
      {has('landArmy') && modeButton('land', '🪖 Land army', 'landArmy')}
      {has('attackPirate') && modeButton('pirateFight', '⚔️ Fight pirate', 'attackPirate')}
      {hasSpice(ctx) &&
        modeButton(
          'spice',
          <>
            🌶️ Buy spice <span className="muted small">{SPICE_PRICE} 🪙</span>
          </>,
          'buySpice',
        )}
      {(hasFish(ctx) || hasSpice(ctx)) &&
        modeButton('deliver', '📦 Bring goods home', 'deliverGoods')}
      {ctx.state.phase.id === 'sail' && (
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
          <h3 className="subhead">Buy with 🪙</h3>
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
                  {RESOURCE_ICON[r]} {goldPrice(ctx, actor, r)} 🪙
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
