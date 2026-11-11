import {
  connectedRegions,
  type CornerId,
  type Ctx,
  type EdgeId,
  type HexId,
  type HexState,
  type Phase,
  type Piece,
} from '@colonizers/engine';
import { RESOURCES } from '@colonizers/module-base';

export const MODULE_ID = 'seafarers';

export interface SeaData extends Record<string, unknown> {
  /** Gold choices owed from the production being worked out right now. */
  pendingGold: Record<number, number>;
  /** Gold choices owed from exploring, handed out after the move. */
  discoveryGold: Record<number, number>;
  /** Turn on which each player last moved a ship. */
  shipMovedTurn: Record<number, number>;
  /** Islands (by key) where each player has had a settlement. */
  islands: Record<number, string[]>;
  /** Island bonus points earned. */
  bonusVp: Record<number, number>;
}

export function seaData(ctx: Ctx): SeaData {
  const d = ctx.data<SeaData>(MODULE_ID);
  d.pendingGold ??= {};
  d.discoveryGold ??= {};
  d.shipMovedTurn ??= {};
  d.islands ??= {};
  d.bonusVp ??= {};
  return d;
}

export function pirate(ctx: Ctx): Piece | undefined {
  return ctx.piecesOfType('pirate')[0];
}

/** Edges around the pirate's hex: no ship can be built, moved or moved to there. */
export function pirateEdges(ctx: Ctx): Set<EdgeId> {
  const at = pirate(ctx)?.at;
  if (at?.kind !== 'hex') return new Set();
  return new Set(ctx.geometry.hexEdges.get(at.id) ?? []);
}

function isShip(ctx: Ctx, p: Piece): boolean {
  return ctx.registry.pieceTypes[p.type]?.route === 'sea';
}

/** The player's ships on an edge touching this corner, leaving one out (a ship being moved). */
export function shipsAt(ctx: Ctx, seat: number, corner: CornerId, ignore?: string): Piece[] {
  return (ctx.geometry.cornerEdges.get(corner) ?? []).flatMap((e) =>
    ctx
      .piecesAt({ kind: 'edge', id: e })
      .filter((p) => p.owner === seat && p.id !== ignore && isShip(ctx, p)),
  );
}

/** A ship can grow from the player's own building, or from their own ship where no rival building sits. */
export function shipConnectsAt(
  ctx: Ctx,
  seat: number,
  corner: CornerId,
  ignore?: string,
): boolean {
  const b = ctx.buildingAt(corner);
  if (b) return b.owner === seat;
  return shipsAt(ctx, seat, corner, ignore).length > 0;
}

export function canPlaceShip(
  ctx: Ctx,
  seat: number,
  edge: EdgeId,
  moving?: Piece,
): string | null {
  const corners = ctx.geometry.edgeCorners.get(edge);
  if (!corners) return 'That edge is not on the board';
  if (!ctx.isSeaEdge(edge)) return 'Ships must sail next to the sea';
  if (ctx.piecesAt({ kind: 'edge', id: edge }).some((p) => p.id !== moving?.id))
    return 'That edge is taken';
  if (pirateEdges(ctx).has(edge)) return 'The pirate blocks that spot';
  if (!moving && ctx.supplyLeft(seat, 'ship') <= 0) return 'No ships left';
  if (!corners.some((c) => shipConnectsAt(ctx, seat, c, moving?.id)))
    return 'Ships must connect to your ship, settlement or city';
  return null;
}

/** Edges worth checking for a new ship: around the player's buildings and ships. */
export function nearbyEdges(ctx: Ctx, seat: number): EdgeId[] {
  const corners = new Set<CornerId>();
  for (const p of ctx.piecesOf(seat)) {
    if (p.at.kind === 'corner') corners.add(p.at.id);
    if (p.at.kind === 'edge' && isShip(ctx, p))
      for (const c of ctx.geometry.edgeCorners.get(p.at.id) ?? []) corners.add(c);
  }
  const edges = new Set<EdgeId>();
  for (const c of corners) for (const e of ctx.geometry.cornerEdges.get(c) ?? []) edges.add(e);
  return [...edges];
}

export function legalShipEdges(ctx: Ctx, seat: number, moving?: Piece): EdgeId[] {
  const out = nearbyEdges(ctx, seat).filter((e) => canPlaceShip(ctx, seat, e, moving) === null);
  if (moving && moving.at.kind === 'edge') {
    const from = moving.at.id;
    return out.filter((e) => e !== from);
  }
  return out;
}

/**
 * A ship can move if it is at the open end of a shipping line: one of its
 * ends has no other ship or building of the owner.
 */
export function shipIsOpen(ctx: Ctx, ship: Piece): boolean {
  if (ship.at.kind !== 'edge' || ship.owner === null) return false;
  const corners = ctx.geometry.edgeCorners.get(ship.at.id) ?? [];
  return corners.some(
    (c) =>
      ctx.buildingAt(c)?.owner !== ship.owner &&
      shipsAt(ctx, ship.owner as number, c, ship.id).length === 0,
  );
}

export function canMoveShip(ctx: Ctx, seat: number, ship: Piece | undefined): string | null {
  if (!ship || ship.owner !== seat || !isShip(ctx, ship)) return 'That is not your ship';
  if (ship.placedTurn === ctx.state.turn.number) return 'A ship can not move on the turn it was built';
  if (seaData(ctx).shipMovedTurn[seat] === ctx.state.turn.number)
    return 'You already moved a ship this turn';
  if (ship.at.kind === 'edge' && pirateEdges(ctx).has(ship.at.id))
    return 'The pirate blocks that ship';
  if (!shipIsOpen(ctx, ship)) return 'Only the ship at the open end of a line can move';
  return null;
}

// ---- Islands ----

/** Land regions of the board, each keyed by its first hex id. Fog hides nothing here. */
export function islands(ctx: Ctx): HexId[][] {
  return connectedRegions(ctx.geometry, (h) => {
    const hex = ctx.state.hexes[h];
    return !!hex && ctx.registry.hexTypes[hex.type]?.terrain === 'land';
  });
}

export function islandOf(ctx: Ctx, corner: CornerId): string | null {
  const touching = new Set(ctx.geometry.cornerHexes.get(corner) ?? []);
  const isle = islands(ctx).find((r) => r.some((h) => touching.has(h)));
  return isle?.[0] ?? null;
}

// ---- Gold ----

export interface GoldPhase extends Phase {
  id: 'pickGold';
  owed: Record<number, number>;
  returnTo: Phase;
}

/** How many resources a gold pick can really take, given what the bank holds. */
export function goldAvailable(ctx: Ctx, owed: number): number {
  const inBank = RESOURCES.reduce((s, r) => s + (ctx.state.bank[r] ?? 0), 0);
  return Math.min(owed, inBank);
}

/** Starts the gold choice for everyone owed, then goes back to `returnTo`. */
export function startGoldPick(ctx: Ctx, owed: Record<number, number>, returnTo: Phase): boolean {
  const clean: Record<number, number> = {};
  for (const [seat, n] of Object.entries(owed)) {
    const can = goldAvailable(ctx, n);
    if (can > 0) clean[Number(seat)] = can;
  }
  if (!Object.keys(clean).length) return false;
  ctx.setPhase({ id: 'pickGold', owed: clean, returnTo });
  ctx.emit({ type: 'goldOwed', owed: clean });
  return true;
}

// ---- Fog ----

/** Turns over hidden hexes next to a new road or ship, and pays the explorer. */
export function explore(ctx: Ctx, piece: Piece): void {
  if (piece.at.kind !== 'edge') return;
  const route = ctx.registry.pieceTypes[piece.type]?.route;
  if (!route) return;
  const hexes = new Set<HexId>();
  for (const c of ctx.geometry.edgeCorners.get(piece.at.id) ?? [])
    for (const h of ctx.geometry.cornerHexes.get(c) ?? []) hexes.add(h);
  for (const h of hexes) {
    const hex = ctx.state.hexes[h];
    if (!hex?.hidden) continue;
    delete hex.hidden;
    reveal(ctx, hex, piece.owner);
  }
}

function reveal(ctx: Ctx, hex: HexState, finder: number | null): void {
  ctx.emit({
    type: 'revealed',
    hex: hex.id,
    terrain: hex.type,
    ...(hex.token !== undefined && { token: hex.token }),
    player: finder,
  });
  ctx.hook('hexChanged', hex);
  if (finder === null || ctx.state.phase.id === 'setup') return;
  if (!ctx.setting<boolean>('discoveryReward')) return;
  const def = ctx.registry.hexTypes[hex.type];
  if (def?.produces && (ctx.state.bank[def.produces] ?? 0) > 0) {
    ctx.grant(finder, { [def.produces]: 1 });
    ctx.emit({ type: 'discovered', player: finder, cards: { [def.produces]: 1 } });
  } else if (hex.type === 'gold') {
    const d = seaData(ctx);
    d.discoveryGold[finder] = (d.discoveryGold[finder] ?? 0) + 1;
  }
}
