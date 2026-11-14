import type { ReactNode } from 'react';
import {
  cornerToPixel,
  hexToPixel,
  type Action,
  type CornerId,
  type Ctx,
  type EdgeId,
  type GameState,
  type HexId,
  type Piece,
} from '@colonizers/engine';
import {
  boostLeft,
  isVehicle,
  lwData,
  VEHICLE_COST,
  vehiclesOf,
  type Vehicle,
} from '@colonizers/module-land-water';
import type { Targets } from '../board/Board.tsx';
import { CostLine } from '../ui/Cards.tsx';

/** Land & Water on screen: trains, ships and planes on the board, and the buttons to run them. */

export const landWaterOn = (state: GameState) => state.modules.includes('landwater');

export type LandWaterMode =
  `lw:${Vehicle}` | `lwFree:${Vehicle}` | 'lwMove' | 'lwActivate' | 'lwChase';
export const LW_MODES: readonly string[] = [
  'lw:train',
  'lw:ferry',
  'lw:plane',
  'lwFree:train',
  'lwFree:ferry',
  'lwFree:plane',
  'lwMove',
  'lwActivate',
  'lwChase',
];

export const VEHICLE_ICON: Record<Vehicle, string> = { train: '🚂', ferry: '⛴️', plane: '✈️' };
export const VEHICLE_NAME: Record<Vehicle, string> = {
  train: 'Train',
  ferry: 'Ship',
  plane: 'Plane',
};

const select = (a: Action, piece: string): Action => ({
  type: 'selectKnight',
  player: a.player,
  knight: piece,
});

/** Puts an action on the board where a piece stands, or at a location. */
function mark(t: Targets, at: Piece['at'] | undefined, a: Action) {
  if (at?.kind === 'corner') {
    if (!t.corners.has(at.id)) t.corners.set(at.id, a);
  } else if (at?.kind === 'hex') {
    if (!t.hexes.has(at.id)) t.hexes.set(at.id, a);
  }
}

/** What the board offers in a Land & Water mode. */
export function landWaterTargets(
  state: GameState,
  legal: Action[],
  mode: LandWaterMode,
  selected: string | null,
): Targets {
  const t: Targets = {
    corners: new Map<CornerId, Action>(),
    edges: new Map<EdgeId, Action>(),
    hexes: new Map<HexId, Action>(),
  };
  for (const a of legal) {
    if (mode.startsWith('lw:') && a.type === 'buildVehicle' && `lw:${a.vehicle}` === mode)
      t.corners.set(a.corner as CornerId, a);
    else if (
      mode.startsWith('lwFree:') &&
      a.type === 'playDevCard' &&
      a.card === 'roadBuilding' &&
      `lwFree:${a.vehicle}` === mode
    )
      t.corners.set(a.corner as CornerId, a);
    else if (mode === 'lwActivate' && a.type === 'activateVehicle')
      mark(t, state.pieces[a.piece as string]?.at, a);
    else if (mode === 'lwMove' && a.type === 'moveVehicle') {
      // First pick a vehicle, then where it goes.
      if (selected === null)
        mark(t, state.pieces[a.piece as string]?.at, select(a, a.piece as string));
      else if (a.piece === selected) mark(t, a.to as Piece['at'], a);
    } else if (mode === 'lwChase' && a.type === 'playDevCard' && a.use === 'chase') {
      if (selected === null)
        mark(t, state.pieces[a.target as string]?.at, select(a, a.target as string));
      else if (a.target === selected) {
        // Nowhere to go: it sinks, so tap it again.
        if (a.to === undefined) mark(t, state.pieces[a.target as string]?.at, a);
        else mark(t, { kind: 'hex', id: a.to as HexId }, a);
      }
    }
  }
  return t;
}

export function landWaterPrompt(who: string, mode: string, selected: string | null): string | null {
  if (mode.startsWith('lw:'))
    return `${who}: tap one of your ${mode === 'lw:plane' ? 'cities' : mode === 'lw:ferry' ? 'settlements or cities on the coast' : 'settlements or cities'} to build a ${VEHICLE_NAME[mode.slice(3) as Vehicle].toLowerCase()} there.`;
  if (mode.startsWith('lwFree:'))
    return `${who}: Road Building. Tap a settlement or city to build a ${VEHICLE_NAME[mode.slice(7) as Vehicle].toLowerCase()} there${mode === 'lwFree:plane' ? ', saving 3 of its cards' : ' for free'}.`;
  if (mode === 'lwMove')
    return selected === null
      ? `${who}: tap one of your active vehicles to move it.`
      : `${who}: tap where it goes. Each step goes into a field or out to one of its corners.`;
  if (mode === 'lwActivate') return `${who}: tap a passive vehicle to turn it active again.`;
  if (mode === 'lwChase')
    return selected === null
      ? `${who}: tap a rival's train or ship in a field to chase it out with a knight.`
      : `${who}: tap the field it goes to.`;
  return null;
}

/** Where each vehicle is drawn: on its corner (beside a building there), or spread out in its field. */
export function landWaterVehicles(
  state: GameState,
  S: number,
): {
  id: string;
  x: number;
  y: number;
  at: string;
  owner: number | null;
  icon: string;
  passive: boolean;
  title: string;
}[] {
  const inHex = new Map<string, number>();
  const out = [];
  const buildings = new Set(
    Object.values(state.pieces)
      .filter((p) => p.at.kind === 'corner' && ['settlement', 'city'].includes(p.type))
      .map((p) => (p.at as { id: string }).id),
  );
  for (const p of Object.values(state.pieces)) {
    if (!isVehicle(p.type)) continue;
    const type = p.type as Vehicle;
    const passive = p.props.passive === true;
    let x: number;
    let y: number;
    let at: string;
    if (p.at.kind === 'corner') {
      const c = cornerToPixel(p.at.id, S);
      const beside = buildings.has(p.at.id);
      const plane = type === 'plane';
      x = c.x + (beside ? S * 0.3 : 0) + (plane ? -S * 0.3 : 0);
      y = c.y - (beside || plane ? S * 0.28 : 0);
      at = p.at.id;
    } else if (p.at.kind === 'hex') {
      const h = state.hexes[p.at.id];
      if (!h) continue;
      const c = hexToPixel(h.q, h.r, S);
      const k = inHex.get(p.at.id) ?? 0;
      inHex.set(p.at.id, k + 1);
      const angle = (k / 5) * Math.PI * 2 - Math.PI / 2;
      x = c.x + Math.cos(angle) * S * 0.5;
      y = c.y + Math.sin(angle) * S * 0.5;
      at = `hex:${p.at.id}`;
    } else continue;
    out.push({
      id: p.id,
      x,
      y,
      at,
      owner: p.owner,
      icon: VEHICLE_ICON[type],
      passive,
      title: `${VEHICLE_NAME[type]}${passive ? ' (passive: pay to activate it before it moves again)' : ''}`,
    });
  }
  return out;
}

export function LandWaterActions({
  ctx,
  actor,
  legal,
  mode,
  setMode,
  act,
}: {
  ctx: Ctx;
  actor: number;
  legal: Action[];
  mode: string | null;
  setMode: (m: LandWaterMode | null) => void;
  act: (a: Action) => void;
}) {
  const button = (m: LandWaterMode, label: ReactNode, ok: boolean, title: string) => (
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
  const can = (type: string, f: (a: Action) => boolean = () => true) =>
    legal.some((a) => a.type === type && f(a));
  const vehicles = (['train', 'ferry', 'plane'] as const).map((v) =>
    button(
      `lw:${v}`,
      <>
        {VEHICLE_ICON[v]} {VEHICLE_NAME[v]} <CostLine cost={VEHICLE_COST[v]} />
      </>,
      can('buildVehicle', (a) => a.vehicle === v),
      v === 'plane'
        ? 'A plane, built at a city: it flies over land and sea, two steps free a turn'
        : v === 'ferry'
          ? 'A ship, built on the coast: it sails the sea, fishes, and opens harbors'
          : 'A train, built at a settlement or city: it collects the yield of the field it stands in',
    ),
  );
  const free = (['train', 'ferry', 'plane'] as const)
    .filter((v) => can('playDevCard', (a) => a.card === 'roadBuilding' && a.vehicle === v))
    .map((v) =>
      button(
        `lwFree:${v}`,
        <>🛤️ Free {VEHICLE_NAME[v].toLowerCase()}</>,
        true,
        v === 'plane'
          ? 'Road Building: a plane for 3 cards less'
          : `Road Building: a free ${VEHICLE_NAME[v].toLowerCase()}`,
      ),
    );
  const boost = boostLeft(ctx, actor);
  return (
    <>
      {vehicles}
      {button(
        'lwMove',
        <>🧭 Move{boost ? ` (+${boost} free)` : ''}</>,
        can('moveVehicle'),
        'Move a vehicle: one step free a turn (a plane two), then a grain a step',
      )}
      {vehiclesOf(ctx, actor).some((v) => v.props.passive === true) &&
        button(
          'lwActivate',
          <>🔄 Activate</>,
          can('activateVehicle'),
          'Turn a passive vehicle active again: a train for 1 grain, a ship for 1 wool, a plane for 2 grain',
        )}
      {can('playDevCard', (a) => a.card === 'knight' && a.use === 'move') && (
        <button
          type="button"
          onClick={() => act({ type: 'playDevCard', player: actor, card: 'knight', use: 'move' })}
          title="Play a knight to give your vehicles two free steps this turn"
        >
          ⚔️ Knight: +2 steps
        </button>
      )}
      {can('playDevCard', (a) => a.card === 'knight' && a.use === 'chase') &&
        button(
          'lwChase',
          <>⚔️ Knight: chase</>,
          true,
          "Play a knight to chase a rival's train or ship out of its field",
        )}
      {free}
    </>
  );
}

/** Vehicles and the Most Vehicles card, for the player list. */
export function LandWaterStats({ ctx, seat }: { ctx: Ctx; seat: number }) {
  const vs = vehiclesOf(ctx, seat);
  const most = lwData(ctx).mostVehicles === seat;
  if (!vs.length && !most) return null;
  const count = (t: Vehicle) => vs.filter((v) => v.type === t).length;
  return (
    <small className="muted" title="Trains, ships and planes; Most Vehicles is worth 2 points">
      🚂 {count('train')} ⛴️ {count('ferry')} ✈️ {count('plane')}
      {most ? ' · 🏅 Most Vehicles' : ''}
    </small>
  );
}
