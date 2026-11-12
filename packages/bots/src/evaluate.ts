import { Ctx, type CornerId, type GameState, type HexId } from '@colonizers/engine';
import type { Style } from './styles.ts';
import { STYLE_WEIGHTS } from './styles.ts';

/** Dots on a number token: how often it is rolled, out of 36. */
export function pips(token: number | undefined): number {
  if (!token || token === 7) return 0;
  return 6 - Math.abs(7 - token);
}

/** Hexes the robber (or pirate) sits on: they produce nothing. */
function blockedHexes(ctx: Ctx): Set<string> {
  const out = new Set<string>();
  for (const type of ['robber', 'pirate']) {
    for (const p of ctx.piecesOfType(type)) if (p.at.kind === 'hex') out.add(p.at.id);
  }
  return out;
}

/** What one hex gives per roll, by card type, weighted by how often it is rolled. */
function hexOutput(
  ctx: Ctx,
  hex: HexId,
  blocked: Set<string>,
): { card: string; rate: number } | null {
  const h = ctx.state.hexes[hex];
  if (!h || h.hidden || !h.token) return null;
  const def = ctx.registry.hexTypes[h.type];
  const card = def?.produces ?? (h.type === 'gold' ? 'any' : null);
  if (!card) return null;
  const rate = pips(h.token) / 36;
  return { card, rate: blocked.has(hex) ? rate * 0.25 : rate };
}

/** Expected cards per roll for a seat, by card type ('any' for gold). */
export function production(
  ctx: Ctx,
  seat: number,
  blocked = blockedHexes(ctx),
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const piece of ctx.piecesOf(seat)) {
    if (piece.at.kind !== 'corner') continue;
    const mult = ctx.registry.pieceTypes[piece.type]?.production ?? 0;
    if (!mult) continue;
    for (const hex of ctx.geometry.cornerHexes.get(piece.at.id) ?? []) {
      const o = hexOutput(ctx, hex, blocked);
      if (o) out[o.card] = (out[o.card] ?? 0) + o.rate * mult;
    }
  }
  return out;
}

/** How good a free corner is to settle, in pips with a bonus for variety. */
export function spotValue(ctx: Ctx, corner: CornerId, blocked = blockedHexes(ctx)): number {
  let total = 0;
  const kinds = new Set<string>();
  for (const hex of ctx.geometry.cornerHexes.get(corner) ?? []) {
    const o = hexOutput(ctx, hex, blocked);
    if (!o) continue;
    total += o.rate * 36;
    kinds.add(o.card);
  }
  return total + kinds.size * 1.2;
}

/** Corners where the distance rule still allows a settlement. */
function openCorner(ctx: Ctx, corner: CornerId): boolean {
  if (ctx.buildingAt(corner) || !ctx.isLandCorner(corner)) return false;
  return !(ctx.geometry.cornerNeighbours.get(corner) ?? []).some((c) => ctx.buildingAt(c));
}

/** Open corners at the end of this seat's roads and ships, best first. */
export function reachableSpots(ctx: Ctx, seat: number): number[] {
  const seen = new Set<CornerId>();
  for (const p of ctx.piecesOf(seat)) {
    if (p.at.kind !== 'edge' || !ctx.registry.pieceTypes[p.type]?.route) continue;
    for (const c of ctx.geometry.edgeCorners.get(p.at.id) ?? []) seen.add(c);
  }
  const blocked = blockedHexes(ctx);
  return [...seen]
    .filter((c) => openCorner(ctx, c))
    .map((c) => spotValue(ctx, c, blocked))
    .sort((a, b) => b - a);
}

/** Things a player saves up for, with their costs, given the modules in play. */
function targets(ctx: Ctx, seat: number): { item: string; cost: Record<string, number> }[] {
  const out: { item: string; cost: Record<string, number> }[] = [];
  const costs = ctx.registry.costs;
  const add = (item: string, ok = true) => {
    if (ok && costs[item]) out.push({ item, cost: ctx.cost(item, seat) });
  };
  add('settlement', ctx.supplyLeft(seat, 'settlement') > 0);
  add('city', ctx.supplyLeft(seat, 'city') > 0 && ctx.piecesOf(seat, 'settlement').length > 0);
  add('road', ctx.supplyLeft(seat, 'road') > 0);
  add('ship', !!ctx.registry.pieceTypes.ship && ctx.supplyLeft(seat, 'ship') > 0);
  const ck = ctx.state.modules.includes('cities-knights');
  add('devCard', !ck && (ctx.state.decks.dev?.length ?? 0) > 0);
  add('knight', ck);
  add('wall', ck);
  return out;
}

/**
 * How good a position is for one seat, from what that seat can see. Every
 * module's pieces count through the registry (production, VP, costs), and a
 * few known modules add their own hints.
 */
export function evaluate(state: GameState, ctx: Ctx, seat: number, style: Style): number {
  if (state.winner !== null) return state.winner === seat ? 1e6 : -1e6;
  const w = STYLE_WEIGHTS[style];
  const blocked = blockedHexes(ctx);
  const target = ctx.vpTarget();
  const me = state.players[seat]!;

  // Points, with a push as the finish line gets close.
  const vp = ctx.vp(seat);
  let score = vp * 10 + (vp >= target - 2 ? 6 : 0);

  // Production, valued by what this style needs most.
  const prod = production(ctx, seat, blocked);
  let kinds = 0;
  for (const [card, rate] of Object.entries(prod)) {
    const value = card === 'any' ? 1.3 : (w.resources[card] ?? 0.9);
    score += rate * 36 * 0.5 * value;
    if (rate > 0) kinds++;
  }
  score += Math.min(kinds, 5) * 0.9;

  // Room to grow: good open spots our routes already reach.
  const spots = reachableSpots(ctx, seat);
  score += (spots[0] ?? 0) * 0.35 * w.expand + (spots[1] ?? 0) * 0.12 * w.expand;

  // Harbors, worth more when we make what they take.
  for (const h of ctx.harborsOf(seat)) {
    const made = h.resource === 'any' ? 0.5 : (prod[h.resource] ?? 0) * 36 * 0.25;
    score += (0.6 + made) * w.harbor;
  }

  // Cards in hand: worth more the closer they bring a build.
  const hand = me.hand;
  let cards = 0;
  for (const n of Object.values(hand)) cards += n;
  for (const t of targets(ctx, seat)) {
    let missing = 0;
    let total = 0;
    for (const [c, n] of Object.entries(t.cost)) {
      missing += Math.max(0, n - (hand[c] ?? 0));
      total += n;
    }
    const near = 1 - missing / Math.max(1, total);
    score += near * near * (w.targets[t.item] ?? 1) * 2.2;
  }
  score += Math.min(cards, 7) * 0.25;
  const limit = 7;
  if (cards > limit) score -= (cards - limit) * 0.6;

  // Routes and armies.
  score += Math.min(ctx.longestRoute(seat), 12) * 0.35 * w.road;
  score += (me.played.knight ?? 0) * 1.4 * w.army;
  for (const cards of Object.values(me.held)) score += cards.length * 1.6 * w.army;

  // Module hints.
  if (state.modules.includes('cities-knights')) score += ckHints(state, ctx, seat);
  if (ctx.registry.pieceTypes.ship) score += ctx.piecesOf(seat, 'ship').length * 0.15;

  // Other players: their production and points count against us, the leader most.
  let worst = 0;
  for (const p of state.players) {
    if (p.seat === seat) continue;
    const theirVp = ctx.vp(p.seat);
    const theirProd = Object.values(production(ctx, p.seat, blocked)).reduce((s, r) => s + r, 0);
    const danger = 1 + Math.max(0, theirVp - vp) * 0.25 + (theirVp >= target - 2 ? 1 : 0);
    score -= theirProd * 36 * 0.08 * danger;
    worst = Math.max(worst, theirVp);
  }
  score -= worst * 1.2;
  return score;
}

interface CkView {
  levels?: Record<number, Record<string, number>>;
  barbarian?: number;
}

function ckHints(state: GameState, ctx: Ctx, seat: number): number {
  const d = (state.data['cities-knights'] ?? {}) as CkView;
  let score = 0;
  const levels = d.levels?.[seat] ?? {};
  for (const n of Object.values(levels)) score += n * 2.6;
  let strength = 0;
  for (const p of ctx.piecesOf(seat)) {
    const m = p.type.match(/^knight(\d)$/);
    if (!m) continue;
    score += 0.9;
    if (p.props.active) strength += Number(m[1]);
  }
  const danger = (d.barbarian ?? 0) >= 5 ? 1.6 : 0.8;
  score += strength * 1.1 * danger;
  for (const c of ctx.piecesOf(seat, 'city')) if (c.props.wall) score += 0.6;
  for (const c of ['paper', 'cloth', 'coin']) score += (state.players[seat]!.hand[c] ?? 0) * 0.5;
  return score;
}
