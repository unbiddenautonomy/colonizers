import {
  cardsTotal,
  isCards,
  type Action,
  type ActionDef,
  type CornerId,
  type Ctx,
  type EdgeId,
  type HexId,
  type Phase,
} from '@colonizers/engine';
import { RESOURCES, setupRounds, setupSeat, stealFrom } from '@colonizers/module-base';
import {
  canMoveShip,
  canPlaceShip,
  goldAvailable,
  legalShipEdges,
  pirate,
  seaData,
  type GoldPhase,
} from './rules.ts';

type A<T> = Action & T;

function action<T>(def: ActionDef<A<T>>): ActionDef {
  return def as unknown as ActionDef;
}

const onlyActive = (ctx: Ctx, a: Action): string | null =>
  a.player === ctx.active ? null : 'Not your turn';

function phase<T>(ctx: Ctx): T {
  return ctx.state.phase as unknown as T;
}

// ---- Ships ----

const buildShip = action<{ edge: EdgeId }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (!ctx.has(a.player, ctx.cost('ship', a.player))) return 'You can not afford a ship';
    return canPlaceShip(ctx, a.player, a.edge);
  },
  apply(ctx, a) {
    ctx.pay(a.player, ctx.cost('ship', a.player));
    ctx.place('ship', a.player, { kind: 'edge', id: a.edge });
    ctx.emit({ type: 'built', player: a.player, piece: 'ship', at: a.edge });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || !ctx.has(player, ctx.cost('ship', player))) return [];
    return legalShipEdges(ctx, player).map((edge) => ({ type: 'buildShip', player, edge }));
  },
});

const moveShip = action<{ ship: string; to: EdgeId }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    const ship = ctx.state.pieces[a.ship];
    const why = canMoveShip(ctx, a.player, ship);
    if (why) return why;
    if (ship?.at.kind === 'edge' && ship.at.id === a.to) return 'Pick a different spot';
    return canPlaceShip(ctx, a.player, a.to, ship);
  },
  apply(ctx, a) {
    const ship = ctx.state.pieces[a.ship]!;
    const from = ship.at.kind === 'edge' ? ship.at.id : null;
    seaData(ctx).shipMovedTurn[a.player] = ctx.state.turn.number;
    ctx.move(ship, { kind: 'edge', id: a.to });
    ctx.emit({ type: 'shipMoved', player: a.player, from, to: a.to });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    const out: Action[] = [];
    for (const ship of ctx.piecesOf(player, 'ship')) {
      if (canMoveShip(ctx, player, ship)) continue;
      for (const to of legalShipEdges(ctx, player, ship))
        out.push({ type: 'moveShip', player, ship: ship.id, to });
    }
    return out;
  },
});

interface SetupPhase {
  id: 'setup';
  index: number;
  step: 'settlement' | 'road';
  settlement?: CornerId;
}

const placeSetupShip = action<{ edge: EdgeId }>({
  phases: ['setup'],
  check(ctx, a) {
    const ph = phase<SetupPhase>(ctx);
    if (ph.step !== 'road') return 'Place a settlement first';
    if (a.player !== ctx.active) return 'Not your turn';
    const corners = ctx.geometry.edgeCorners.get(a.edge);
    if (!corners || !ph.settlement || !corners.includes(ph.settlement))
      return 'The ship must touch the settlement you just placed';
    return canPlaceShip(ctx, a.player, a.edge);
  },
  apply(ctx, a) {
    const ph = phase<SetupPhase>(ctx);
    ctx.place('ship', a.player, { kind: 'edge', id: a.edge });
    ctx.emit({ type: 'built', player: a.player, piece: 'ship', at: a.edge });
    // Same hand-off as placing a setup road.
    const next = ph.index + 1;
    if (next >= ctx.playerCount * setupRounds(ctx)) {
      ctx.state.turn = { number: 1, player: 0, round: 0 };
      ctx.setPhase({ id: 'roll' });
      ctx.emit({ type: 'turnStarted', player: 0, turn: 1 });
      ctx.hook('turnStarted');
    } else {
      ctx.state.turn.player = setupSeat(ctx, next);
      ctx.setPhase({ id: 'setup', index: next, step: 'settlement' });
    }
  },
  enumerate(ctx, player) {
    const ph = phase<SetupPhase>(ctx);
    if (player !== ctx.active || ph.step !== 'road' || !ph.settlement) return [];
    return (ctx.geometry.cornerEdges.get(ph.settlement) ?? []).map((edge) => ({
      type: 'placeSetupShip',
      player,
      edge,
    }));
  },
});

interface RoadBuildingPhase {
  id: 'roadBuilding';
  remaining: number;
  returnTo: string;
}

/** The Road Building card lets you place ships too, in any mix. */
const placeFreeShip = action<{ edge: EdgeId }>({
  phases: ['roadBuilding'],
  check(ctx, a) {
    return onlyActive(ctx, a) ?? canPlaceShip(ctx, a.player, a.edge);
  },
  apply(ctx, a) {
    const ph = phase<RoadBuildingPhase>(ctx);
    ctx.place('ship', a.player, { kind: 'edge', id: a.edge });
    ctx.emit({ type: 'built', player: a.player, piece: 'ship', at: a.edge, free: true });
    const remaining = ph.remaining - 1;
    if (remaining > 0 && freeSpots(ctx, a.player)) ctx.setPhase({ ...ph, remaining });
    else ctx.setPhase({ id: ph.returnTo });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return legalShipEdges(ctx, player).map((edge) => ({ type: 'placeFreeShip', player, edge }));
  },
});

/** Somewhere to put a free road or ship. */
export function freeSpots(ctx: Ctx, seat: number): boolean {
  if (ctx.supplyLeft(seat, 'ship') > 0 && legalShipEdges(ctx, seat).length > 0) return true;
  if (ctx.supplyLeft(seat, 'road') <= 0) return false;
  return ctx.geometry.edges.some((e) => {
    const err = ctx.registry.actions.placeFreeRoad?.check(ctx, {
      type: 'placeFreeRoad',
      player: seat,
      edge: e,
    });
    return err === null;
  });
}

// ---- The pirate ----

function pirateHexes(ctx: Ctx): HexId[] {
  const at = pirate(ctx)?.at;
  return (Object.keys(ctx.state.hexes) as HexId[]).filter((h) => {
    if (at?.kind === 'hex' && at.id === h) return false;
    return ctx.isSea(h);
  });
}

/** Players with a ship beside the hex and at least one card, other than the thief. */
export function pirateVictims(ctx: Ctx, hex: HexId, thief: number): number[] {
  const seats = new Set<number>();
  for (const e of ctx.geometry.hexEdges.get(hex) ?? []) {
    for (const p of ctx.piecesAt({ kind: 'edge', id: e })) {
      if (p.type !== 'ship' || p.owner === null || p.owner === thief) continue;
      if (ctx.handSize(p.owner, false) > 0) seats.add(p.owner);
    }
  }
  return [...seats].sort((x, y) => x - y);
}

interface RobberPhase {
  id: 'moveRobber';
  returnTo: string;
}

/** On a 7 or a knight, the player can move the pirate instead of the robber. */
const movePirate = action<{ hex: HexId }>({
  phases: ['moveRobber'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    if (!pirateHexes(ctx).includes(a.hex)) return 'The pirate can only sail to another sea hex';
    return null;
  },
  apply(ctx, a) {
    const ph = phase<RobberPhase>(ctx);
    const p = pirate(ctx);
    if (p) ctx.move(p, { kind: 'hex', id: a.hex });
    else ctx.place('pirate', null, { kind: 'hex', id: a.hex });
    ctx.emit({ type: 'pirateMoved', player: a.player, hex: a.hex });
    const candidates = pirateVictims(ctx, a.hex, a.player);
    if (candidates.length === 0) ctx.setPhase({ id: ph.returnTo });
    else if (candidates.length === 1) {
      stealFrom(ctx, a.player, candidates[0]!);
      ctx.setPhase({ id: ph.returnTo });
    } else ctx.setPhase({ id: 'steal', hex: a.hex, candidates, returnTo: ph.returnTo });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return pirateHexes(ctx).map((hex) => ({ type: 'movePirate', player, hex }));
  },
});

// ---- Gold ----

const pickGold = action<{ cards: Record<string, number> }>({
  phases: ['pickGold'],
  check(ctx, a) {
    const owed = phase<GoldPhase>(ctx).owed[a.player];
    if (!owed) return 'You have no gold to spend';
    if (!isCards(a.cards, (c) => (RESOURCES as readonly string[]).includes(c)))
      return 'Pick resources';
    const can = goldAvailable(ctx, owed);
    if (cardsTotal(a.cards) !== can) return `Pick ${can} resource${can === 1 ? '' : 's'}`;
    if (!ctx.bankHas(a.cards)) return 'The bank does not have those resources';
    return null;
  },
  apply(ctx, a) {
    const ph = phase<GoldPhase>(ctx);
    if (cardsTotal(a.cards) > 0) ctx.grant(a.player, a.cards);
    ctx.emit({ type: 'goldPicked', player: a.player, cards: a.cards });
    const owed = { ...ph.owed };
    delete owed[a.player];
    if (Object.keys(owed).length) ctx.setPhase({ ...ph, owed });
    else ctx.setPhase(ph.returnTo);
  },
  enumerate(ctx, player) {
    const owed = phase<GoldPhase>(ctx).owed[player];
    if (!owed) return [];
    const can = goldAvailable(ctx, owed);
    const out: Action[] = [];
    // All of one kind, or (for two) any pair. Players can pick any mix.
    for (const r of RESOURCES) out.push({ type: 'pickGold', player, cards: { [r]: can } });
    if (can === 2)
      RESOURCES.forEach((r1, i) =>
        RESOURCES.slice(i + 1).forEach((r2) =>
          out.push({ type: 'pickGold', player, cards: { [r1]: 1, [r2]: 1 } }),
        ),
      );
    return out;
  },
});

export const seaActions: Record<string, ActionDef> = {
  buildShip,
  moveShip,
  placeSetupShip,
  placeFreeShip,
  movePirate,
  pickGold,
};

export type { Phase };
