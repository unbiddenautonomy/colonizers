import type { Action, ActionDef, CornerId, Ctx, EdgeId, Phase, Piece } from '@colonizers/engine';
import {
  cargoOf,
  cargoRoom,
  CARGO_SIZE,
  nearFog,
  ownShip,
  pirateShip,
} from '@colonizers/module-explorers-pirates';
import { ARMY, ROBBER_DIE } from './constants.ts';
import { armyDie, canStop, cornerOf, setTurnFlag, turnFlag } from './rules.ts';

/**
 * Soldiers & Armies with Explorers & Pirates:
 *
 * - Building is followed by one stretch for ships and armies alike: sailing
 *   takes the field, and armies march while ships sail.
 * - Armies don't march along these ships. To reach another island an army
 *   boards one of your ships from your harbor settlement's corner (it takes
 *   one place in the hold), and goes ashore at either end of the ship.
 * - A ship carrying an army can fight the pirate ship, as armies fight the
 *   robber: win and move it, lose and give up a resource. Nothing else can.
 * - Harbor settlements defend like cities.
 * - Everyone starts with a harbor settlement and a city.
 */

export const withEp = (ctx: Ctx) => ctx.state.modules.includes('explorers-pirates');

const ARMY_CARGO = 'army';

function action<T>(def: ActionDef<Action & T>): ActionDef {
  return def as unknown as ActionDef;
}

const onlyActive = (ctx: Ctx, a: Action) => (a.player === ctx.active ? null : 'Not your turn');

/** The army a ship carries, as the army piece's props. */
export function armyAboard(ship: Piece): Record<string, unknown> | null {
  const a = ship.props.army;
  return a && typeof a === 'object' ? (a as Record<string, unknown>) : null;
}

const shipEdge = (ship: Piece): EdgeId | null => (ship.at.kind === 'edge' ? ship.at.id : null);

const ends = (ctx: Ctx, ship: Piece): readonly CornerId[] => {
  const e = shipEdge(ship);
  return e ? (ctx.geometry.edgeCorners.get(e) ?? []) : [];
};

function ownArmy(ctx: Ctx, seat: number, id: unknown): Piece | undefined {
  const p = typeof id === 'string' ? ctx.state.pieces[id] : undefined;
  return p && p.type === ARMY && p.owner === seat && p.at.kind === 'corner' ? p : undefined;
}

/** Ships an army can board: empty, yours, at the army's own harbor settlement. */
export function boardingShips(ctx: Ctx, army: Piece): Piece[] {
  const c = cornerOf(army);
  const b = c ? ctx.buildingAt(c) : undefined;
  if (!c || b?.type !== 'harbor' || b.owner !== army.owner) return [];
  return ctx
    .piecesOf(army.owner as number, 'ship')
    .filter(
      (s) => ends(ctx, s).includes(c) && !armyAboard(s) && cargoRoom(s) >= (CARGO_SIZE.army ?? 1),
    );
}

/** Where a ship's army can go ashore. */
export function landingCorners(ctx: Ctx, ship: Piece): CornerId[] {
  if (!armyAboard(ship)) return [];
  return ends(ctx, ship).filter(
    (c) => ctx.isLandCorner(c) && !nearFog(ctx, c) && canStop(ctx, c, ship.owner as number),
  );
}

const boardShip = action<{ army: string; ship: string }>({
  phases: ['main', 'campaign'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    const army = ownArmy(ctx, a.player, a.army);
    if (!army) return 'That is not your army';
    return boardingShips(ctx, army).some((s) => s.id === a.ship)
      ? null
      : 'Armies board a ship of yours with room, at your harbor settlement';
  },
  apply(ctx, a) {
    const army = ctx.state.pieces[a.army] as Piece;
    const ship = ctx.state.pieces[a.ship] as Piece;
    const at = cornerOf(army);
    ship.props.army = { ...army.props };
    ship.props.cargo = [...cargoOf(ship), ARMY_CARGO];
    ctx.remove(army);
    ctx.emit({ type: 'armyBoarded', player: a.player, at });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return ctx.piecesOf(player, ARMY).flatMap((army) =>
      boardingShips(ctx, army).map((s) => ({
        type: 'boardShip',
        player,
        army: army.id,
        ship: s.id,
      })),
    );
  },
});

const landArmy = action<{ ship: string; corner: CornerId }>({
  phases: ['main', 'campaign'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    const ship = ownShip(ctx, a.player, a.ship);
    if (typeof ship === 'string') return ship;
    if (!armyAboard(ship)) return 'The ship carries no army';
    return landingCorners(ctx, ship).includes(a.corner)
      ? null
      : 'The army goes ashore at a free end of the ship';
  },
  apply(ctx, a) {
    const ship = ctx.state.pieces[a.ship] as Piece;
    const props = armyAboard(ship) as Record<string, unknown>;
    delete ship.props.army;
    const cargo = [...cargoOf(ship)];
    cargo.splice(cargo.indexOf(ARMY_CARGO), 1);
    ship.props.cargo = cargo;
    ctx.place(ARMY, a.player, { kind: 'corner', id: a.corner }, props);
    ctx.emit({ type: 'armyLanded', player: a.player, at: a.corner });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return ctx.piecesOf(player, 'ship').flatMap((s) =>
      landingCorners(ctx, s).map((corner) => ({
        type: 'landArmy',
        player,
        ship: s.id,
        corner,
      })),
    );
  },
});

/** Ships with an army aboard beside the pirate ship. */
function shipsAtPirate(ctx: Ctx, seat: number): Piece[] {
  const at = pirateShip(ctx)?.at;
  if (at?.kind !== 'hex') return [];
  const edges = ctx.geometry.hexEdges.get(at.id) ?? [];
  return ctx.piecesOf(seat, 'ship').filter((s) => {
    const e = shipEdge(s);
    return !!e && edges.includes(e) && !!armyAboard(s);
  });
}

const dieAboard = (ship: Piece) => armyDie({ ...ship, props: armyAboard(ship) ?? {} });

/** Fight the pirate ship from a ship with an army aboard, once a turn. */
const attackPirate = action<{ ship: string }>({
  phases: ['campaign'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (turnFlag(ctx, 'robberFought')) return 'You have fought the pirate this turn';
    return shipsAtPirate(ctx, a.player).some((s) => s.id === a.ship)
      ? null
      : 'Only a ship with an army aboard, beside the pirate ship, can attack it';
  },
  apply(ctx, a) {
    setTurnFlag(ctx, 'fought');
    setTurnFlag(ctx, 'robberFought');
    const ship = ctx.state.pieces[a.ship] as Piece;
    const dice = [dieAboard(ship), ROBBER_DIE] as const;
    const rolls = [ctx.rng.int(1, dice[0]), ctx.rng.int(1, dice[1])] as const;
    const won = rolls[0] > rolls[1];
    ctx.emit({ type: 'pirateFought', player: a.player, dice, rolls, won });
    if (won) ctx.setPhase({ id: 'moveRobber', returnTo: 'campaign' });
    else if (ctx.handSize(a.player) > 0) ctx.setPhase({ id: 'robberToll' });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || turnFlag(ctx, 'robberFought')) return [];
    return shipsAtPirate(ctx, player).map((s) => ({ type: 'attackPirate', player, ship: s.id }));
  },
});

export const epActions: Record<string, ActionDef> = { boardShip, landArmy, attackPirate };

/** Sailing actions also run while the armies are in the field. */
const alsoInTheField = (prev: ActionDef): ActionDef => ({
  ...prev,
  phases: [...new Set([...(prev.phases ?? ['main']), 'campaign'])],
});

const armyStaysAboard = (prev: ActionDef): ActionDef => ({
  ...alsoInTheField(prev),
  check(ctx, a) {
    const ship = typeof a.ship === 'string' ? ctx.state.pieces[a.ship] : undefined;
    if (ship && armyAboard(ship)) return 'Put the army ashore first';
    return prev.check(ctx, a);
  },
});

const noChase = (prev: ActionDef): ActionDef => ({
  ...prev,
  check: () => 'Only a ship with an army aboard can fight the pirate',
  enumerate: () => [],
});

/** Explorers & Pirates actions that change with armies in the game. */
export const epWraps: Record<string, (prev: ActionDef) => ActionDef> = {
  sailShip: alsoInTheField,
  boostShip: alsoInTheField,
  swapCargo: armyStaysAboard,
  foundSettlement: armyStaysAboard,
  landCrew: alsoInTheField,
  buySpice: alsoInTheField,
  deliverGoods: alsoInTheField,
  chasePirate: noChase,
};

/** Sailing takes the field: ships and armies share the stretch after building. */
export function sailIsCampaign(ctx: Ctx): void {
  if (withEp(ctx) && ctx.state.phase.id === 'sail') ctx.setPhase({ id: 'campaign' } as Phase);
}
