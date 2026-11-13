import { Ctx, type CornerId, type EdgeId, type GameState, type HexId } from '@colonizers/engine';
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
  let card = def?.produces ?? (h.type === 'gold' ? 'any' : null);
  let rate = pips(h.token) / 36;
  // Explorers & Pirates: a gold field pays 2 gold once its lair is captured.
  if (h.type === 'gold' && ctx.state.modules.includes('explorers-pirates')) {
    const ep = ctx.state.data['explorers-pirates'] as { captured?: string[] } | undefined;
    if (!ep?.captured?.includes(hex)) return null;
    card = 'gold';
    rate *= 1.2;
  }
  if (!card) return null;
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
  // Explorers & Pirates: harbor settlements and settlers to ship out.
  const ep = !!ctx.registry.pieceTypes.harbor;
  add('harbor', ep && ctx.piecesOf(seat, 'settlement').length > 0);
  add('settler', ep);
  add(
    'crew',
    ep && Object.keys((ctx.state.data['explorers-pirates']?.lairs as object) ?? {}).length > 0,
  );
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
  if (state.modules.includes('explorers-pirates')) score += epHints(state, ctx, seat, blocked);
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

// ---- Explorers & Pirates ----

function hiddenHex(state: GameState, hex: HexId): boolean {
  const h = state.hexes[hex];
  return !!h && (h.hidden === true || h.type === 'hidden');
}

function cargo(p: { props: Record<string, unknown> }): string[] {
  return Array.isArray(p.props.cargo) ? (p.props.cargo as string[]) : [];
}

/**
 * Ships are worth more the closer they are to the fog (to explore) or, with
 * a settler aboard, to a good free corner to found a settlement on.
 */
function epHints(state: GameState, ctx: Ctx, seat: number, blocked: Set<string>): number {
  const g = ctx.geometry;
  const fogCorner = (c: CornerId) => (g.cornerHexes.get(c) ?? []).some((h) => hiddenHex(state, h));
  const fogEdge = (e: EdgeId) => (g.edgeCorners.get(e) ?? []).some(fogCorner);
  const seaEdge = (e: EdgeId) => (g.edgeHexes.get(e) ?? []).some((h) => ctx.isSea(h));
  const free = (c: CornerId) => openCorner(ctx, c) && !fogCorner(c);
  const lairs = ((
    state.data['explorers-pirates'] as { lairs?: Record<string, Record<number, number>> }
  )?.lairs ?? {}) as Record<string, Record<number, number>>;
  const lairEdge = (e: EdgeId) =>
    (g.edgeHexes.get(e) ?? []).some((h) => !!lairs[h] && !hiddenHex(state, h));
  // Docks with a settler or crews waiting for a ship, and all our harbors.
  const docks = new Set<CornerId>();
  const harbors = new Set<CornerId>();
  for (const h of ctx.piecesOf(seat, 'harbor')) {
    if (h.at.kind !== 'corner') continue;
    harbors.add(h.at.id);
    if (cargo(h).length) docks.add(h.at.id);
  }
  // Fishing grounds and spice villages in sight.
  const shoalEdge = (e: EdgeId) =>
    (g.edgeHexes.get(e) ?? []).some(
      (h) => state.hexes[h]?.type === 'shoal' && !hiddenHex(state, h),
    );
  const villageEdge = (e: EdgeId) =>
    (g.edgeHexes.get(e) ?? []).some(
      (h) => state.hexes[h]?.props?.village === true && !hiddenHex(state, h),
    );
  const homeEdge = (e: EdgeId) => (g.edgeCorners.get(e) ?? []).some((c) => harbors.has(c));
  const shoalPips = (e: EdgeId) =>
    (g.edgeHexes.get(e) ?? []).reduce(
      (s, h) => s + (state.hexes[h]?.type === 'shoal' ? pips(state.hexes[h]?.token) : 0),
      0,
    );
  const gold = state.players[seat]!.hand.gold ?? 0;
  const ep = state.data['explorers-pirates'] as
    { delivered?: Record<number, Record<string, number>> } | undefined;
  let score = 0;
  for (const crews of Object.values(lairs)) score += (crews[seat] ?? 0) * 4;
  // Half a step already brought home.
  for (const n of Object.values(ep?.delivered?.[seat] ?? {})) score += (n % 2) * 4.5;
  for (const p of ctx.piecesOf(seat)) {
    const load = cargo(p);
    if (p.type === 'harbor') {
      score += load.filter((x) => x === 'settler').length * 2.5;
      score += load.filter((x) => x === 'crew').length * 0.8;
      continue;
    }
    if (p.type !== 'ship' || p.at.kind !== 'edge') continue;
    const settler = load.includes('settler');
    score += 1.5;
    // Sail distance to the fog and to free land, up to a few turns away.
    let fog = Infinity;
    let land = 0;
    let lair = Infinity;
    let dock = Infinity;
    let capture = 0;
    const crews = load.filter((x) => x === 'crew').length;
    const goods = load.filter((x) => x === 'fish' || x === 'spice').length;
    const room = 2 - load.reduce((s, x) => s + (x === 'settler' ? 2 : 1), 0);
    let home = Infinity;
    let shoal = Infinity;
    let village = Infinity;
    const seen = new Set<EdgeId>([p.at.id]);
    let frontier: EdgeId[] = [p.at.id];
    for (let step = 0; step <= 14 && frontier.length; step++) {
      const next: EdgeId[] = [];
      for (const e of frontier) {
        if (crews && lairEdge(e)) {
          lair = Math.min(lair, step);
          // Enough crews aboard to finish a lair off: a capture in reach.
          for (const h of g.edgeHexes.get(e) ?? []) {
            const there = Object.values(lairs[h] ?? {}).reduce((a, n) => a + n, 0);
            if (lairs[h] && crews >= 3 - there) capture = Math.max(capture, 6 - step * 0.3);
          }
        }
        if (!load.length && (g.edgeCorners.get(e) ?? []).some((c) => docks.has(c)))
          dock = Math.min(dock, step);
        if (goods && home === Infinity && homeEdge(e)) home = step;
        if (room > 0 && !settler && !crews && shoal === Infinity && shoalEdge(e)) shoal = step;
        if (room > 0 && gold >= 2 && !settler && !crews && village === Infinity && villageEdge(e))
          village = step;
        if (fogEdge(e)) {
          fog = Math.min(fog, step);
          if (step > 0) continue;
        }
        if (settler)
          for (const c of g.edgeCorners.get(e) ?? [])
            if (free(c)) land = Math.max(land, spotValue(ctx, c, blocked) - step * 1.2);
        for (const c of g.edgeCorners.get(e) ?? [])
          for (const n of g.cornerEdges.get(c) ?? []) {
            if (seen.has(n) || !seaEdge(n)) continue;
            seen.add(n);
            next.push(n);
          }
      }
      frontier = next;
    }
    if (settler) score += 3 + Math.max(0, land) * 0.25;
    if (crews) score += crews * (1.2 + (lair < Infinity ? Math.max(0, 2.4 - lair * 0.2) : 0));
    score += capture;
    // Explore: worth most for an empty ship, or one with somewhere better to go.
    // An empty ship heads home to pick up what waits on the dock.
    if (dock < Infinity) score += Math.max(0, 2 - dock * 0.2);
    // Fish and spice: worth most at home, where they turn into points.
    if (goods) score += goods * (2 + (home < Infinity ? Math.max(0, 2 - home * 0.2) : 0));
    // Fishing: right beside a fishing ground, the better its number the better.
    if (shoal === 0) score += room * (0.8 + shoalPips(p.at.id) * 0.25);
    else if (shoal < Infinity) score += Math.max(0, 2 - shoal * 0.2);
    if (village < Infinity) score += Math.max(0, 2.2 - village * 0.2);
    const busy =
      (settler && land > 6) ||
      (crews > 0 && lair < Infinity) ||
      dock < Infinity ||
      goods > 0 ||
      shoal < Infinity ||
      village < Infinity;
    if (fog < Infinity) score += Math.max(0, 3 - fog * 0.3) * (busy ? 0.3 : 1);
  }
  score += (state.players[seat]!.hand.gold ?? 0) * 0.3;
  return score;
}
