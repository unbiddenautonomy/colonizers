import type {
  Action,
  ActionDef,
  CornerId,
  Ctx,
  EdgeId,
  HexId,
  HexState,
  Piece,
} from '@colonizers/engine';

/** Explorers & Pirates: shared pieces, the board, ships and discovery. */

export const MODULE_ID = 'explorers-pirates';

export type EpScenario =
  'land-ho' | 'pirate-lairs' | 'fishing-grounds' | 'spice-islands' | 'full-voyage';

/** Points each scenario adds to the chosen target (10 by default). */
export const EP_VP_BONUS: Record<EpScenario, number> = {
  'land-ho': -2,
  'pirate-lairs': 2,
  'fishing-grounds': 0,
  'spice-islands': 0,
  'full-voyage': 3,
};

export const GOLD = 'gold';
/** Movement points of a ship each turn, and the extra a wool buys. */
export const SHIP_MOVES = 4;
export const BOOST_MOVES = 2;
/** Room in a ship's hold or a harbor's dock: a settler fills it; a crew, fish or spice takes half. */
export const HOLD = 2;
/** Hold space each load takes. An army (Soldiers & Armies) fills the hold. */
export const CARGO_SIZE: Record<string, number> = {
  settler: 2,
  crew: 1,
  fish: 1,
  spice: 1,
  army: 2,
};
/** Settlers each player can have out at once. */
export const SETTLERS = 2;
/** Gold buys a resource for this much, this many times a turn. */
export const GOLD_PRICE = 2;
export const GOLD_BUYS = 2;
export const STARTING_GOLD = 2;

export type Mission = 'lairs' | 'fish' | 'spices';

export interface EpData extends Record<string, unknown> {
  /** Resources bought with gold this turn. */
  bought: number;
  boughtTurn: number;
  /** Pirate lairs not yet captured, with the crews each player has landed there. */
  lairs: Record<string, Record<number, number>>;
  /** Gold fields whose lair has been captured: they pay gold. */
  captured: HexId[];
  /** Steps each player has made on each mission track (1 point each). */
  missions: Record<number, Partial<Record<Mission, number>>>;
  /** Fish and spice each player has brought home. */
  delivered: Record<number, Partial<Record<'fish' | 'spice', number>>>;
}

export function epData(ctx: Ctx): EpData {
  const d = ctx.data<EpData>(MODULE_ID);
  d.bought ??= 0;
  d.boughtTurn ??= -1;
  d.lairs ??= {};
  d.captured ??= [];
  d.missions ??= {};
  d.delivered ??= {};
  return d;
}

export type A<T> = Action & T;

export function action<T>(def: ActionDef<A<T>>): ActionDef {
  return def as unknown as ActionDef;
}

export const onlyActive = (ctx: Ctx, a: Action): string | null =>
  a.player === ctx.active ? null : 'Not your turn';

export const canAfford = (
  ctx: Ctx,
  seat: number,
  item: string,
  what = `a ${item}`,
): string | null => (ctx.has(seat, ctx.cost(item, seat)) ? null : `You can not afford ${what}`);

// ---- The board ----

export function hidden(ctx: Ctx, hex: HexId): boolean {
  const h = ctx.state.hexes[hex];
  return !!h && (h.hidden === true || h.type === 'hidden');
}

/** A corner touching a hex nobody has turned over yet. */
export function nearFog(ctx: Ctx, corner: CornerId): boolean {
  return (ctx.geometry.cornerHexes.get(corner) ?? []).some((h) => hidden(ctx, h));
}

/** An edge with either end touching the fog. */
export function edgeNearFog(ctx: Ctx, edge: EdgeId): boolean {
  return (ctx.geometry.edgeCorners.get(edge) ?? []).some((c) => nearFog(ctx, c));
}

/** Ships sail along edges with open sea on at least one side. */
export function navigable(ctx: Ctx, edge: EdgeId): boolean {
  return (ctx.geometry.edgeHexes.get(edge) ?? []).some((h) => ctx.isSea(h));
}

/** A corner where land meets the open sea. */
export function coastal(ctx: Ctx, corner: CornerId): boolean {
  const hexes = ctx.geometry.cornerHexes.get(corner) ?? [];
  return hexes.some((h) => ctx.isLand(h)) && hexes.some((h) => ctx.isSea(h));
}

export function isShip(p: Piece | undefined): p is Piece {
  return !!p && p.type === 'ship' && p.at.kind === 'edge';
}

export function shipAt(ctx: Ctx, edge: EdgeId): Piece | undefined {
  return ctx.piecesAt({ kind: 'edge', id: edge }).find((p) => p.type === 'ship');
}

export function cargoOf(p: Piece): string[] {
  return Array.isArray(p.props.cargo) ? (p.props.cargo as string[]) : [];
}

export function cargoRoom(p: Piece): number {
  return HOLD - cargoOf(p).reduce((s, c) => s + (CARGO_SIZE[c] ?? 1), 0);
}

/** Settlers this player has on ships and docks. */
export function settlersOut(ctx: Ctx, seat: number): number {
  let n = 0;
  for (const p of ctx.piecesOf(seat))
    if (p.type === 'ship' || p.type === 'harbor')
      n += cargoOf(p).filter((c) => c === 'settler').length;
  return n;
}

/** The player's harbor settlement on one end of this edge, if any. */
export function harborBeside(ctx: Ctx, seat: number, edge: EdgeId): Piece | undefined {
  for (const c of ctx.geometry.edgeCorners.get(edge) ?? []) {
    const b = ctx.buildingAt(c);
    if (b?.type === 'harbor' && b.owner === seat) return b;
  }
  return undefined;
}

export function movesLeft(ship: Piece): number {
  const used = Number(ship.props.used ?? 0);
  return SHIP_MOVES + (ship.props.boost === true ? BOOST_MOVES : 0) - used;
}

/**
 * Where a ship can sail this turn, with the moves each spot costs. Ships pass
 * each other but can't stop on another ship; reaching the fog ends the trip.
 */
export function scenarioOf(ctx: Ctx): EpScenario {
  return ctx.setting<EpScenario | undefined>('epScenario') ?? 'land-ho';
}

/** Scenarios with pirate lairs and the pirate ship, which a 7 moves instead of the robber. */
export function hasPirate(ctx: Ctx): boolean {
  const s = scenarioOf(ctx);
  return s === 'pirate-lairs' || s === 'full-voyage';
}

/** Scenarios with fishing grounds out in the fog. */
export function hasFish(ctx: Ctx): boolean {
  const s = scenarioOf(ctx);
  return s === 'fishing-grounds' || s === 'full-voyage';
}

/** Scenarios with spice villages out in the fog. */
export function hasSpice(ctx: Ctx): boolean {
  const s = scenarioOf(ctx);
  return s === 'spice-islands' || s === 'full-voyage';
}

export function pirateShip(ctx: Ctx): Piece | undefined {
  return ctx.piecesOfType('pirate')[0];
}

/** The edges around the pirate ship: sailing onto one costs a gold in tribute. */
export function pirateEdges(ctx: Ctx): Set<EdgeId> {
  const at = pirateShip(ctx)?.at;
  return at?.kind === 'hex' ? new Set(ctx.geometry.hexEdges.get(at.id) ?? []) : new Set();
}

export const TRIBUTE = 1;

export interface SailOption {
  moves: number;
  /** Gold owed to the pirate for sailing past it. */
  tribute: number;
}

/**
 * Where a ship can sail this turn, what each spot costs in moves, and
 * whether the trip passes the pirate ship (1 gold, once per voyage).
 */
export function sailPlan(ctx: Ctx, ship: Piece): Map<EdgeId, SailOption> {
  const out = new Map<EdgeId, SailOption>();
  const taxed = pirateEdges(ctx);
  for (const [e, moves] of reach(ctx, ship, (n) => !taxed.has(n)))
    out.set(e, { moves, tribute: 0 });
  if (taxed.size && ship.owner !== null && ctx.has(ship.owner, { [GOLD]: TRIBUTE }))
    for (const [e, moves] of reach(ctx, ship, () => true))
      if (!out.has(e)) out.set(e, { moves, tribute: TRIBUTE });
  return out;
}

export function sailRange(ctx: Ctx, ship: Piece): Map<EdgeId, number> {
  return new Map([...sailPlan(ctx, ship)].map(([e, o]) => [e, o.moves]));
}

function reach(ctx: Ctx, ship: Piece, allowed: (e: EdgeId) => boolean): Map<EdgeId, number> {
  const out = new Map<EdgeId, number>();
  if (ship.at.kind !== 'edge') return out;
  const left = movesLeft(ship);
  const start = ship.at.id;
  const seen = new Map<EdgeId, number>([[start, 0]]);
  let frontier: EdgeId[] = [start];
  for (let step = 1; step <= left && frontier.length; step++) {
    const next: EdgeId[] = [];
    for (const e of frontier) {
      for (const c of ctx.geometry.edgeCorners.get(e) ?? []) {
        for (const n of ctx.geometry.cornerEdges.get(c) ?? []) {
          if (seen.has(n) || !navigable(ctx, n) || !allowed(n)) continue;
          seen.set(n, step);
          if (!shipAt(ctx, n)) out.set(n, step);
          // The fog stops a ship where it first touches it.
          if (!edgeNearFog(ctx, n)) next.push(n);
        }
      }
    }
    frontier = next;
  }
  return out;
}

// ---- Discovery ----

function reveal(ctx: Ctx, hex: HexState, finder: number): void {
  delete hex.hidden;
  ctx.emit({
    type: 'revealed',
    hex: hex.id,
    terrain: hex.type,
    ...(hex.token !== undefined && { token: hex.token }),
    player: finder,
  });
  ctx.hook('hexChanged', hex);
  const produces = ctx.registry.hexTypes[hex.type]?.produces;
  const cards = produces && (ctx.state.bank[produces] ?? 0) > 0 ? { [produces]: 1 } : { [GOLD]: 2 };
  if (!ctx.bankHas(cards)) return;
  ctx.grant(finder, cards);
  ctx.emit({ type: 'discovered', player: finder, cards });
}

/** Turns over the fog a ship touches. Returns whether anything was found. */
export function discover(ctx: Ctx, ship: Piece): boolean {
  if (ship.at.kind !== 'edge' || ship.owner === null) return false;
  let found = false;
  for (const c of ctx.geometry.edgeCorners.get(ship.at.id) ?? [])
    for (const h of ctx.geometry.cornerHexes.get(c) ?? []) {
      const hex = ctx.state.hexes[h];
      if (hex && hidden(ctx, h)) {
        reveal(ctx, hex, ship.owner);
        found = true;
      }
    }
  return found;
}

// ---- Turn helpers ----

export const toSail = (ctx: Ctx) => {
  if (ctx.state.phase.id !== 'sail') ctx.setPhase({ id: 'sail' });
};

export function ownShip(ctx: Ctx, seat: number, id: unknown): Piece | string {
  const ship = typeof id === 'string' ? ctx.state.pieces[id] : undefined;
  if (!isShip(ship) || ship.owner !== seat) return 'That is not your ship';
  return ship;
}
