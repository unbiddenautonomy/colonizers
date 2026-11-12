import type { CornerId, Ctx, EdgeId, HexId, Piece } from '@colonizers/engine';
import { MODULE_ID, RESOURCES } from './constants.ts';

export interface BaseData extends Record<string, unknown> {
  longestRoad: number | null;
  largestArmy: number | null;
  trade: TradeOffer | null;
}

export interface TradeOffer {
  id: number;
  from: number;
  give: Record<string, number>;
  get: Record<string, number>;
  /** Seats the offer is for, or null for everyone. */
  to: number[] | null;
  responses: Record<number, 'accept' | 'decline'>;
}

export interface PlayerData extends Record<string, unknown> {
  /** Turn number on which this player last played a development card. */
  devPlayedTurn?: number;
}

export function baseData(ctx: Ctx): BaseData {
  return ctx.data<BaseData>(MODULE_ID);
}

export function playerData(ctx: Ctx, seat: number): PlayerData {
  return ctx.player(seat).data as PlayerData;
}

export function robber(ctx: Ctx): Piece | undefined {
  return ctx.piecesOfType('robber')[0];
}

// ---- Placement rules ----

/** No building on this corner or any neighbouring corner. */
export function distanceRuleOk(ctx: Ctx, corner: CornerId): boolean {
  if (ctx.buildingAt(corner)) return false;
  return (ctx.geometry.cornerNeighbours.get(corner) ?? []).every((c) => !ctx.buildingAt(c));
}

/** The corner is free of any piece (settlements can't go on a corner a knight holds). */
export function cornerEmpty(ctx: Ctx, corner: CornerId): boolean {
  return ctx.piecesAt({ kind: 'corner', id: corner }).length === 0;
}

export function edgeEmpty(ctx: Ctx, edge: EdgeId): boolean {
  return ctx.piecesAt({ kind: 'edge', id: edge }).length === 0;
}

/** Player's route pieces (roads by default) touching a corner. */
export function routesAt(ctx: Ctx, seat: number, corner: CornerId, route?: string): Piece[] {
  return (ctx.geometry.cornerEdges.get(corner) ?? []).flatMap((e) =>
    ctx
      .piecesAt({ kind: 'edge', id: e })
      .filter(
        (p) =>
          p.owner === seat &&
          (route === undefined
            ? !!ctx.registry.pieceTypes[p.type]?.route
            : ctx.registry.pieceTypes[p.type]?.route === route),
      ),
  );
}

export function canPlaceSettlement(
  ctx: Ctx,
  seat: number,
  corner: CornerId,
  needsRoad: boolean,
): string | null {
  if (!ctx.geometry.cornerHexes.has(corner)) return 'That corner is not on the board';
  if (!ctx.isLandCorner(corner)) return 'Settlements must touch land';
  if (!cornerEmpty(ctx, corner)) return 'That corner is taken';
  if (!distanceRuleOk(ctx, corner)) return 'Too close to another settlement or city';
  if (needsRoad && routesAt(ctx, seat, corner).length === 0)
    return 'Settlements must touch one of your roads';
  if (ctx.supplyLeft(seat, 'settlement') <= 0) return 'No settlements left';
  return null;
}

/**
 * A route piece (road, ship) can extend from one of the player's buildings,
 * or from their own route piece of the same kind at a corner that no
 * opponent building blocks.
 */
export function connectsAt(ctx: Ctx, seat: number, corner: CornerId, route: string): boolean {
  const b = ctx.buildingAt(corner);
  if (b) return b.owner === seat;
  if (ctx.blocksRouteAt(corner, seat)) return false;
  return routesAt(ctx, seat, corner, route).length > 0;
}

export function canPlaceRoad(ctx: Ctx, seat: number, edge: EdgeId): string | null {
  const corners = ctx.geometry.edgeCorners.get(edge);
  if (!corners) return 'That edge is not on the board';
  if (!ctx.isLandEdge(edge)) return 'Roads must run along land';
  if (!edgeEmpty(ctx, edge)) return 'That edge is taken';
  if (ctx.supplyLeft(seat, 'road') <= 0) return 'No roads left';
  if (!corners.some((c) => connectsAt(ctx, seat, c, 'land'))) {
    return 'Roads must connect to your road, settlement or city';
  }
  return null;
}

export function legalRoadEdges(ctx: Ctx, seat: number): EdgeId[] {
  return ctx.geometry.edges.filter((e) => canPlaceRoad(ctx, seat, e) === null);
}

// ---- Production ----

export function produce(ctx: Ctx, total: number): void {
  const robberHex = robber(ctx)?.at;
  const owed = new Map<string, Map<number, number>>();
  for (const hex of Object.values(ctx.state.hexes)) {
    if (hex.token !== total || hex.hidden) continue;
    if (robberHex?.kind === 'hex' && robberHex.id === hex.id) continue;
    const def = ctx.registry.hexTypes[hex.type];
    if (!def || def.terrain !== 'land') continue;
    for (const corner of ctx.geometry.hexCorners.get(hex.id) ?? []) {
      for (const piece of ctx.piecesAt({ kind: 'corner', id: corner })) {
        if (piece.owner === null) continue;
        const pdef = ctx.registry.pieceTypes[piece.type];
        const base: Record<string, number> = {};
        if (def.produces && pdef?.production) base[def.produces] = pdef.production;
        const got = ctx.reduce('hexYield', hex, piece, base);
        for (const [card, n] of Object.entries(got)) {
          if (n <= 0) continue;
          if (!owed.has(card)) owed.set(card, new Map());
          const m = owed.get(card) as Map<number, number>;
          m.set(piece.owner, (m.get(piece.owner) ?? 0) + n);
        }
      }
    }
  }

  const received: Record<number, Record<string, number>> = {};
  const shortages: string[] = [];
  for (const [card, byPlayer] of owed) {
    const need = [...byPlayer.values()].reduce((s, n) => s + n, 0);
    const inBank = ctx.state.bank[card] ?? 0;
    if (need > inBank) {
      shortages.push(card);
      // Bank shortage: nobody gets it, unless only one player is owed it.
      if (byPlayer.size !== 1) continue;
      const [[seat, n]] = [...byPlayer.entries()] as [[number, number]];
      byPlayer.set(seat, Math.min(n, inBank));
    }
    for (const [seat, n] of byPlayer) {
      if (n <= 0) continue;
      ctx.grant(seat, { [card]: n });
      (received[seat] ??= {})[card] = n;
    }
  }
  ctx.emit({ type: 'production', total, received, shortages });
}

// ---- Robber ----

export function robberHexes(ctx: Ctx): HexId[] {
  const current = robber(ctx)?.at;
  return (Object.keys(ctx.state.hexes) as HexId[]).filter((h) => {
    if (current?.kind === 'hex' && current.id === h) return false;
    const hex = ctx.state.hexes[h];
    if (!hex || hex.hidden) return false;
    const def = ctx.registry.hexTypes[hex.type];
    return def?.robber ?? def?.terrain === 'land';
  });
}

/** Players with a building on the hex and at least one card, other than the thief. */
export function stealCandidates(ctx: Ctx, hex: HexId, thief: number): number[] {
  const seats = new Set<number>();
  for (const c of ctx.geometry.hexCorners.get(hex) ?? []) {
    const b = ctx.buildingAt(c);
    if (b && b.owner !== null && b.owner !== thief && ctx.handSize(b.owner, false) > 0)
      seats.add(b.owner);
  }
  return [...seats].sort((a, b) => a - b);
}

export function stealFrom(ctx: Ctx, thief: number, victim: number): void {
  const card = ctx.randomCard(victim);
  if (!card) return;
  ctx.transfer(victim, thief, { [card]: 1 });
  ctx.emit({
    type: 'stole',
    thief,
    victim,
    card,
    visibleTo: [thief, victim],
    redacted: { thief, victim },
  });
}

// ---- Awards ----

export function updateLongestRoad(ctx: Ctx): void {
  const data = baseData(ctx);
  const lengths = ctx.state.players.map((p) => ctx.longestRoute(p.seat));
  const max = Math.max(...lengths);
  const holder = data.longestRoad;
  const min = ctx.setting<number>('longestRoadMin') ?? 5;
  let next: number | null;
  if (holder !== null && lengths[holder] === max && max >= min) {
    next = holder;
  } else if (max < min) {
    next = null;
  } else {
    const leaders = lengths.flatMap((l, seat) => (l === max ? [seat] : []));
    next = leaders.length === 1 ? (leaders[0] as number) : null;
  }
  if (next !== holder) {
    data.longestRoad = next;
    ctx.emit({ type: 'award', award: 'longestRoad', from: holder, to: next, length: max });
  }
}

export function updateLargestArmy(ctx: Ctx, seat: number): void {
  const data = baseData(ctx);
  const knights = ctx.player(seat).played.knight ?? 0;
  const min = ctx.setting<number>('largestArmyMin') ?? 3;
  if (knights < min || data.largestArmy === seat) return;
  const holderCount =
    data.largestArmy === null ? 0 : (ctx.player(data.largestArmy).played.knight ?? 0);
  if (knights > holderCount) {
    const from = data.largestArmy;
    data.largestArmy = seat;
    ctx.emit({ type: 'award', award: 'largestArmy', from, to: seat, knights });
  }
}

// ---- Turns ----

/** Setup order: 0..n-1 then n-1..0. */
export function setupSeat(ctx: Ctx, index: number): number {
  const n = ctx.playerCount;
  return index < n ? index : 2 * n - 1 - index;
}

/** Moves to the next player's turn. Modules can wrap `endTurn` to insert phases first. */
export function startNextTurn(ctx: Ctx): void {
  ctx.hook('turnEnded');
  baseData(ctx).trade = null;
  const n = ctx.playerCount;
  const next = (ctx.state.turn.player + 1) % n;
  ctx.state.turn.number += 1;
  if (next === 0) ctx.state.turn.round += 1;
  ctx.state.turn.player = next;
  ctx.setPhase({ id: 'roll' });
  ctx.emit({ type: 'turnStarted', player: next, turn: ctx.state.turn.number });
  ctx.hook('turnStarted');
}

export function isResource(card: string): boolean {
  return (RESOURCES as readonly string[]).includes(card);
}
