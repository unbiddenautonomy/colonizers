import type { Cards, CornerId, Ctx, HexId, HexState, Location, Piece } from '@colonizers/engine';
import { robber } from '@colonizers/module-base';

export const MODULE_ID = 'landwater';

/** The three vehicles. A ferry is this expansion's ship, to keep it apart from Seafarers' ships. */
export const VEHICLES = ['train', 'ferry', 'plane'] as const;
export type Vehicle = (typeof VEHICLES)[number];

export const VEHICLE_COST: Record<Vehicle, Cards> = {
  train: { ore: 1, brick: 1, grain: 1 },
  ferry: { lumber: 1, wool: 1, grain: 1 },
  plane: { ore: 2, brick: 2, grain: 2 },
};

/** What turning a passive vehicle back to its active side costs. */
export const ACTIVATE_COST: Record<Vehicle, Cards> = {
  train: { grain: 1 },
  ferry: { wool: 1 },
  plane: { grain: 2 },
};

export const VEHICLE_SUPPLY: Record<Vehicle, number> = { train: 5, ferry: 5, plane: 3 };

/** Free movement points a turn; each one more costs a grain. */
export const FREE_MOVES: Record<Vehicle, number> = { train: 1, ferry: 1, plane: 2 };
export const MOVE_COST: Cards = { grain: 1 };

/** A knight played to speed a vehicle saves two movement points. */
export const KNIGHT_MOVES = 2;
/** Road Building on a plane saves this many of its cards. */
export const PLANE_SAVING = 3;

/** Trains and ferries per corner and per field; planes have their own limits beside them. */
export const CORNER_CAP = 1;
export const HEX_CAP = 3;
export const PLANE_CORNER_CAP = 1;
export const PLANE_HEX_CAP = 2;

/** The first to 3 vehicles takes the card that replaces the Longest Road. */
export const MOST_VEHICLES_MIN = 3;
export const MOST_VEHICLES_VP = 2;
/** Hands of up to 10 cards are safe on a 7. */
export const HAND_LIMIT_EXTRA = 3;
/** Land & Water plays to 12, 2 points more than usual. */
export const LAND_WATER_EXTRA_VP = 2;

export interface LandWaterData {
  /** Holder of the Most Vehicles card. */
  mostVehicles: number | null;
  /** Free movement points from knights this turn. */
  boost: { turn: number; seat: number; points: number };
  /** Who started moving, and on which turn: no more building for them that turn. */
  moving: { turn: number; seat: number };
}

export function lwData(ctx: Ctx): LandWaterData {
  const d = ctx.data<Partial<LandWaterData>>(MODULE_ID);
  d.mostVehicles ??= null;
  d.boost ??= { turn: -1, seat: -1, points: 0 };
  if (typeof d.moving !== 'object' || d.moving === null) d.moving = { turn: -1, seat: -1 };
  return d as LandWaterData;
}

export const isVehicle = (type: string): type is Vehicle =>
  (VEHICLES as readonly string[]).includes(type);

export const vehiclesOf = (ctx: Ctx, seat: number): Piece[] =>
  ctx.piecesOf(seat).filter((p) => isVehicle(p.type));

export const isActive = (p: Piece) => p.props.passive !== true;

const vehiclesAt = (ctx: Ctx, at: Location) => ctx.piecesAt(at).filter((p) => isVehicle(p.type));

/** Is there room for this vehicle here? */
export function hasRoom(ctx: Ctx, type: Vehicle, at: Location, ignore?: Piece): boolean {
  const here = vehiclesAt(ctx, at).filter((p) => p.id !== ignore?.id);
  const planes = here.filter((p) => p.type === 'plane').length;
  if (type === 'plane') return planes < (at.kind === 'hex' ? PLANE_HEX_CAP : PLANE_CORNER_CAP);
  return here.length - planes < (at.kind === 'hex' ? HEX_CAP : CORNER_CAP);
}

export function pirateHex(ctx: Ctx): HexId | null {
  const p = ctx.piecesOfType('pirate')[0];
  return p?.at.kind === 'hex' ? p.at.id : null;
}

function robberHex(ctx: Ctx): HexId | null {
  const r = robber(ctx);
  return r?.at.kind === 'hex' ? r.at.id : null;
}

/** Can this kind of vehicle stand in this field? */
export function canEnterHex(ctx: Ctx, type: Vehicle, hex: HexId): boolean {
  const h = ctx.state.hexes[hex];
  if (!h || h.hidden) return false;
  if (hex === robberHex(ctx) || hex === pirateHex(ctx)) return false;
  const terrain = ctx.registry.hexTypes[h.type]?.terrain;
  if (type === 'train') return terrain === 'land';
  if (type === 'ferry') return terrain === 'sea';
  return true;
}

export const touchesSea = (ctx: Ctx, corner: CornerId) =>
  (ctx.geometry.cornerHexes.get(corner) ?? []).some((h) => ctx.isSea(h));

/** Where a vehicle can go with one movement point. */
export function stepsFrom(ctx: Ctx, v: Piece): Location[] {
  const type = v.type as Vehicle;
  if (v.at.kind === 'corner') {
    return (ctx.geometry.cornerHexes.get(v.at.id) ?? [])
      .filter((h) => canEnterHex(ctx, type, h))
      .map((id) => ({ kind: 'hex' as const, id }))
      .filter((at) => hasRoom(ctx, type, at, v));
  }
  if (v.at.kind === 'hex') {
    return (ctx.geometry.hexCorners.get(v.at.id) ?? [])
      .filter((c) => ctx.geometry.cornerHexes.has(c))
      .map((id) => ({ kind: 'corner' as const, id }))
      .filter((at) => hasRoom(ctx, type, at, v));
  }
  return [];
}

/** Movement points the vehicle has used this turn. */
export function movesUsed(ctx: Ctx, v: Piece): number {
  const m = v.props.moves as { turn: number; used: number } | undefined;
  return m && m.turn === ctx.state.turn.number ? m.used : 0;
}

export function boostLeft(ctx: Ctx, seat: number): number {
  const b = lwData(ctx).boost;
  return b.turn === ctx.state.turn.number && b.seat === seat ? b.points : 0;
}

/** What the next step costs this vehicle: nothing, or a grain. */
export function nextStepCost(ctx: Ctx, v: Piece): Cards {
  const free = FREE_MOVES[v.type as Vehicle] ?? 0;
  if (movesUsed(ctx, v) < free || boostLeft(ctx, v.owner ?? -1) > 0) return {};
  return MOVE_COST;
}

/** Can the player build this vehicle at this corner? Leaves the cost out. */
export function canBuildVehicle(
  ctx: Ctx,
  seat: number,
  type: Vehicle,
  corner: CornerId,
): string | null {
  const b = ctx.buildingAt(corner);
  if (!b || b.owner !== seat) return 'Vehicles start at your own settlement or city';
  if (type === 'plane' && b.type === 'settlement') return 'Planes need a city with an airport';
  if (type === 'ferry' && !touchesSea(ctx, corner)) return 'Ships start on the coast';
  if (ctx.supplyLeft(seat, type) <= 0) return `No ${type === 'ferry' ? 'ship' : type}s left`;
  if (!hasRoom(ctx, type, { kind: 'corner', id: corner })) return 'There is no room there';
  return null;
}

/** Fields next to a field where a chased vehicle can go. */
export function chaseTargets(ctx: Ctx, v: Piece): HexId[] {
  if (v.at.kind !== 'hex') return [];
  const type = v.type as Vehicle;
  return (ctx.geometry.hexNeighbours.get(v.at.id) ?? []).filter(
    (h) => canEnterHex(ctx, type, h) && hasRoom(ctx, type, { kind: 'hex', id: h }),
  );
}

/** The sea field in front of a harbor. */
export function harborHex(ctx: Ctx, edge: string): HexId | undefined {
  return (ctx.geometry.edgeHexes.get(edge as never) ?? []).find((h) => ctx.isSea(h));
}

/**
 * Harbors the player uses, each with how often: a settlement or city on it
 * counts once, an active ship in front of it once more. The pirate in front
 * of a harbor closes it.
 */
export function harborUses(ctx: Ctx, seat: number): Map<string, number> {
  const pirate = pirateHex(ctx);
  const uses = new Map<string, number>();
  for (const h of ctx.state.harbors) {
    const sea = harborHex(ctx, h.edge);
    if (sea && sea === pirate) continue;
    const corners = ctx.geometry.edgeCorners.get(h.edge) ?? [];
    let n = corners.some((c) => ctx.buildingAt(c)?.owner === seat) ? 1 : 0;
    if (
      sea &&
      ctx
        .piecesAt({ kind: 'hex', id: sea })
        .some((p) => p.owner === seat && p.type === 'ferry' && isActive(p))
    )
      n += 1;
    if (n) uses.set(h.resource, (uses.get(h.resource) ?? 0) + n);
  }
  return uses;
}

/** The ratio Land & Water's harbors give for a card. */
export function harborRatio(ctx: Ctx, seat: number, card: string): number {
  const uses = harborUses(ctx, seat);
  let best = 4;
  if ((uses.get('any') ?? 0) >= 1) best = 3;
  const own = uses.get(card) ?? 0;
  if (own >= 2) best = 1;
  else if (own >= 1) best = Math.min(best, 2);
  return best;
}

/** What the base rules alone give from buildings on harbors. */
export function buildingRatio(ctx: Ctx, seat: number, card: string): number {
  let best = 4;
  for (const h of ctx.harborsOf(seat))
    if (h.resource === 'any' || h.resource === card) best = Math.min(best, h.ratio);
  return best;
}

/** Two generic harbors let you trade two of a kind plus any one card for one. */
export const canMixTrade = (ctx: Ctx, seat: number) => (harborUses(ctx, seat).get('any') ?? 0) >= 2;

/** Is the field's yield blocked for this vehicle (the robber or the pirate)? */
export function blocked(ctx: Ctx, hex: HexState, v: Piece): boolean {
  const robbed = hex.id === robberHex(ctx) || hex.id === pirateHex(ctx);
  return ctx.reduce('hexBlocked', hex, v, robbed);
}

/** Sea fields where the player has an active ship that fishes (not in front of a harbor). */
export function fishingGrounds(ctx: Ctx, seat: number): HexId[] {
  const harbors = new Set(ctx.state.harbors.map((h) => harborHex(ctx, h.edge)));
  const out = new Set<HexId>();
  for (const v of vehiclesOf(ctx, seat)) {
    if (v.type !== 'ferry' || !isActive(v) || v.at.kind !== 'hex') continue;
    const hex = ctx.state.hexes[v.at.id];
    if (!hex || !ctx.isSea(hex.id) || harbors.has(hex.id) || blocked(ctx, hex, v)) continue;
    out.add(hex.id);
  }
  return [...out];
}

export function updateMostVehicles(ctx: Ctx): void {
  const d = lwData(ctx);
  const counts = ctx.state.players.map((p) => vehiclesOf(ctx, p.seat).length);
  const holder = d.mostVehicles;
  const max = Math.max(...counts);
  let next = holder;
  if (holder === null || counts[holder] !== max) {
    const leaders = counts.flatMap((n, seat) => (n === max ? [seat] : []));
    // A tie for the lead leaves the card where it is.
    if (max >= MOST_VEHICLES_MIN && leaders.length === 1) next = leaders[0] as number;
  }
  if (next !== holder) {
    d.mostVehicles = next;
    ctx.emit({ type: 'award', award: 'mostVehicles', from: holder, to: next, vehicles: max });
  }
}
