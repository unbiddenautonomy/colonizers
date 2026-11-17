import {
  hexId,
  parseHexId,
  type ActionDef,
  type Action,
  type Ctx,
  type CornerId,
  type EdgeId,
  type GameModule,
  type HexId,
  type HexState,
  type Phase,
  type Piece,
} from '@colonizers/engine';
import { RESOURCES, routesAt, stealFrom } from '@colonizers/module-base';
import { freeSpots, startGoldPick } from '@colonizers/module-seafarers';
import {
  canAct,
  isAway,
  isKnight,
  knightAt,
  knightLevel,
  knightsOf,
  reachable,
  drawProgress,
  TRACKS,
  type Track,
} from '@colonizers/module-cities-knights';

/**
 * Treasures, Dragons & Adventurers (part 1), played on Seafarers boards.
 *
 * - Treasure Islands and Into the Unknown: face-down treasure chests wait on
 *   corners out at sea. Building a road or ship next to one opens it. Turning
 *   over an empty sea or desert hex in the fog also finds a treasure.
 * - Desert Dragons: no robber and no pirate. Each new settlement or city
 *   wakes dragons in the three deserts. Once all 18 are awake, a rolled
 *   number next to a dragon draws one onto that hex: it stops producing,
 *   roads between two dragon hexes are cut, and towns ringed by dragons
 *   score nothing. A Knight card drives one dragon away for good.
 */

export const MODULE_ID = 'treasures-dragons';

export type TdaScenario =
  | 'treasure-islands'
  | 'into-the-unknown'
  | 'greater-catan'
  | 'desert-dragons'
  | 'enchanted-land'
  | 'great-canal';

/** Points each scenario adds to the chosen target. */
export const TDA_VP_BONUS: Record<TdaScenario, number> = {
  'treasure-islands': 4,
  'into-the-unknown': 2,
  'greater-catan': 8,
  'enchanted-land': 5,
  'desert-dragons': 3,
  'great-canal': 5,
};

/**
 * With Cities & Knights (which adds 3 points itself), these scenarios aim a
 * point lower: 14 and 20 with the usual 10.
 */
export const TDA_CK_ADJUST: Partial<Record<TdaScenario, number>> = {
  'into-the-unknown': -1,
  'greater-catan': -1,
};

const withCk = (ctx: Ctx) => ctx.state.modules.includes('cities-knights');

export type TreasureKind =
  'freeRoads' | 'devCard' | 'grain' | 'wool' | 'brick' | 'anyTwo' | 'anyOne';

/** One full set of 20 treasures; bigger games repeat it. */
export const TREASURE_SET: Record<TreasureKind, number> = {
  freeRoads: 3,
  devCard: 3,
  grain: 2,
  wool: 2,
  brick: 2,
  anyTwo: 3,
  anyOne: 5,
};

export const TREASURE_TEXT: Record<TreasureKind, string> = {
  freeRoads: 'build 2 roads or ships for free',
  devCard: 'take a development card',
  grain: 'take 1 grain',
  wool: 'take 1 wool',
  brick: 'take 1 brick',
  anyTwo: 'take any 2 resources',
  anyOne: 'take any 1 resource',
};

export const TOTAL_DRAGONS = 18;

/** Treasures that need a choice or a build, kept until it is that player's turn. */
interface Owed {
  seat: number;
  kind: 'freeRoads' | 'anyTwo' | 'anyOne' | 'progress';
}

export interface TdaData extends Record<string, unknown> {
  /** Face-down treasures, top first (hidden from players). */
  deck: TreasureKind[];
  /** Treasures beside the board, for empty sea and desert found in the fog. */
  stack: number;
  /** Treasures each player has opened. */
  found: Record<number, number>;
  owed: Owed[];
  /** Dragons on each hex: any number on a desert, at most one elsewhere. */
  dragons: Record<string, number>;
  /** Dragons woken so far (they attack once all are awake). */
  awake: number;
  /** Dragons each player has driven out. */
  slain: Record<number, number>;
  /** Greater Catan: face-down number tokens for the new islands, top last. */
  supply: number[];
  /** Bare hexes reached this action, waiting for a number. */
  bare: { seat: number; hex: HexId }[];
  /** Enchanted Land: players who have sent their one knight across. */
  crossed: Record<number, boolean>;
  /** Great Canal: canal chips each player has earned (1 point each). */
  chips: Record<number, number>;
  /** Great Canal: the canal is finished and the basin has flooded. */
  flooded: boolean;
  /** Great Canal: gold owed to prospectors, waiting for the main phase. */
  prospect: Record<number, number>;
}

export function tdaData(ctx: Ctx): TdaData {
  const d = ctx.data<TdaData>(MODULE_ID);
  d.deck ??= [];
  d.stack ??= 0;
  d.found ??= {};
  d.owed ??= [];
  d.dragons ??= {};
  d.awake ??= 0;
  d.slain ??= {};
  d.supply ??= [];
  d.bare ??= [];
  d.crossed ??= {};
  d.chips ??= {};
  d.flooded ??= false;
  d.prospect ??= {};
  return d;
}

export function scenarioOf(ctx: Ctx): TdaScenario {
  return (ctx.setting<string>('tdaScenario') ?? 'treasure-islands') as TdaScenario;
}

const dragonsOn = (ctx: Ctx) => scenarioOf(ctx) === 'desert-dragons';

function shuffle<T>(ctx: Ctx, list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = ctx.rng.int(0, i);
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  return list;
}

function neighbours(id: HexId): HexId[] {
  const { q, r } = parseHexId(id);
  return [
    hexId(q + 1, r),
    hexId(q - 1, r),
    hexId(q, r + 1),
    hexId(q, r - 1),
    hexId(q + 1, r - 1),
    hexId(q - 1, r + 1),
  ];
}

// ---- Treasures ----

/** A deck of `n` treasures in the set's proportions. */
export function treasureDeck(n: number): TreasureKind[] {
  const set = Object.entries(TREASURE_SET).flatMap(([k, c]) =>
    Array<TreasureKind>(c).fill(k as TreasureKind),
  );
  const out: TreasureKind[] = [];
  while (out.length < n) out.push(...set.slice(0, n - out.length));
  return out;
}

function openTreasure(ctx: Ctx, seat: number, from: 'chest' | 'fog'): void {
  const d = tdaData(ctx);
  const kind = d.deck.shift();
  if (!kind) return;
  d.found[seat] = (d.found[seat] ?? 0) + 1;
  ctx.emit({ type: 'treasure', player: seat, kind, from });
  switch (kind) {
    case 'grain':
    case 'wool':
    case 'brick':
      if ((ctx.state.bank[kind] ?? 0) > 0) {
        ctx.grant(seat, { [kind]: 1 });
        ctx.emit({ type: 'discovered', player: seat, cards: { [kind]: 1 } });
      }
      return;
    case 'devCard': {
      // With Cities & Knights, the finder takes a progress card from a deck of their choice.
      if (withCk(ctx)) {
        d.owed.push({ seat, kind: 'progress' });
        return;
      }
      const card = ctx.drawCard('dev');
      if (!card) return;
      (ctx.player(seat).held.dev ??= []).push({ card, acquiredTurn: ctx.state.turn.number });
      ctx.emit({
        type: 'boughtDevCard',
        player: seat,
        card,
        free: true,
        visibleTo: [seat],
        redacted: { player: seat, free: true },
      });
      return;
    }
    default:
      d.owed.push({ seat, kind });
  }
}

/** Opens chests at the ends of a newly built road or ship. */
function takeChests(ctx: Ctx, piece: Piece): void {
  if (piece.owner === null || piece.at.kind !== 'edge') return;
  if (!ctx.registry.pieceTypes[piece.type]?.route) return;
  for (const c of ctx.geometry.edgeCorners.get(piece.at.id) ?? []) {
    for (const chest of ctx.piecesAt({ kind: 'corner', id: c })) {
      if (chest.type !== 'treasure') continue;
      ctx.remove(chest);
      openTreasure(ctx, piece.owner, 'chest');
    }
  }
}

/** Owed treasures start once it is the owner's own turn, one at a time. */
function settleOwed(ctx: Ctx): void {
  const d = tdaData(ctx);
  if (ctx.state.phase.id !== 'main' || ctx.state.winner !== null) return;
  const i = d.owed.findIndex((o) => o.seat === ctx.active);
  if (i < 0) return;
  const [o] = d.owed.splice(i, 1);
  if (!o) return;
  if (o.kind === 'progress') {
    if (!TRACKS.some((t) => (ctx.state.decks[t]?.length ?? 0) > 0)) return;
    ctx.setPhase({ id: 'treasureProgress', owed: { [o.seat]: 1 }, returnTo: { id: 'main' } });
    return;
  }
  if (o.kind === 'freeRoads') {
    const left = ctx.supplyLeft(o.seat, 'road') + ctx.supplyLeft(o.seat, 'ship');
    if (left > 0 && freeSpots(ctx, o.seat))
      ctx.setPhase({ id: 'roadBuilding', remaining: Math.min(2, left), returnTo: 'main' });
    return;
  }
  startGoldPick(ctx, { [o.seat]: o.kind === 'anyTwo' ? 2 : 1 }, { id: 'main' });
}

/** Cities & Knights: a treasure's progress card, from the deck the finder picks. */
const treasureProgress: ActionDef<Action & { deck: string }> = {
  phases: ['treasureProgress'],
  check(ctx, a) {
    const owed = ctx.state.phase.owed as Record<number, number> | undefined;
    if (!owed?.[a.player]) return 'You have no treasure to take';
    if (!(TRACKS as readonly string[]).includes(a.deck)) return 'Pick a progress deck';
    return ctx.state.decks[a.deck]?.length ? null : 'That deck is empty';
  },
  apply(ctx, a) {
    const returnTo = (ctx.state.phase.returnTo as Phase | undefined) ?? { id: 'main' };
    ctx.setPhase(returnTo);
    drawProgress(ctx, a.player, a.deck as Track);
  },
  enumerate(ctx, player) {
    const owed = ctx.state.phase.owed as Record<number, number> | undefined;
    if (!owed?.[player]) return [];
    return TRACKS.filter((t) => (ctx.state.decks[t]?.length ?? 0) > 0).map((deck) => ({
      type: 'treasureProgress',
      player,
      deck,
    }));
  },
};

// ---- Greater Catan: numbers for the new islands ----

const greater = (ctx: Ctx) => scenarioOf(ctx) === 'greater-catan';
const RED = (t: number | undefined) => t === 6 || t === 8;

function homeHexes(ctx: Ctx): Set<HexId> {
  return new Set(ctx.setting<HexId[] | null>('setupHexes') ?? []);
}

/** Land hexes next to a newly built road or ship that still have no number. */
function queueBare(ctx: Ctx, piece: Piece): void {
  if (piece.owner === null || piece.at.kind !== 'edge') return;
  if (!ctx.registry.pieceTypes[piece.type]?.route) return;
  const d = tdaData(ctx);
  for (const c of ctx.geometry.edgeCorners.get(piece.at.id) ?? []) {
    for (const h of ctx.geometry.cornerHexes.get(c) ?? []) {
      const hex = ctx.state.hexes[h];
      if (!hex || hex.hidden || hex.token !== undefined || hex.type === 'desert') continue;
      if (ctx.registry.hexTypes[hex.type]?.terrain !== 'land') continue;
      if (!ctx.registry.hexTypes[hex.type]?.produces && hex.type !== 'gold') continue;
      if (d.bare.some((b) => b.hex === h)) continue;
      d.bare.push({ seat: piece.owner, hex: h });
    }
  }
}

/**
 * Home-island numbers a player may move to a bare hex. In order, the rules
 * are: no 6 or 8 next to another 6 or 8 on the new island; take it from a
 * hex next to your own building; and leave every building next to that hex
 * at least one other number. When no number keeps all three, the first rule
 * is dropped, then the second, then the third.
 */
export function tokenOptions(ctx: Ctx, seat: number, target: HexId): HexId[] {
  const home = homeHexes(ctx);
  const all = [...home].filter((h) => ctx.state.hexes[h]?.token !== undefined).sort();
  const near = ctx.geometry.hexNeighbours.get(target) ?? [];
  const rule1 = (h: HexId) =>
    !RED(ctx.state.hexes[h]?.token) ||
    !near.some((n) => n !== h && !home.has(n) && RED(ctx.state.hexes[n]?.token));
  const corners = (h: HexId) => ctx.geometry.hexCorners.get(h) ?? [];
  const rule2 = (h: HexId) => corners(h).some((c) => ctx.buildingAt(c)?.owner === seat);
  const rule3 = (h: HexId) =>
    corners(h).every((c) => {
      if (!ctx.buildingAt(c)) return true;
      return (ctx.geometry.cornerHexes.get(c) ?? []).some(
        (o) => o !== h && ctx.state.hexes[o]?.token !== undefined,
      );
    });
  for (const rules of [[rule1, rule2, rule3], [rule2, rule3], [rule3], []]) {
    const ok = all.filter((h) => rules.every((r) => r(h)));
    if (ok.length) return ok;
  }
  return [];
}

export interface TokenPhase {
  id: 'moveToken';
  hex: HexId;
  options: HexId[];
  returnTo: Phase;
}

/** Numbers bare hexes from the pile, or asks the builder to move one from home. */
function settleBare(ctx: Ctx): boolean {
  const d = tdaData(ctx);
  while (d.bare.length) {
    const next = d.bare[0]!;
    const hex = ctx.state.hexes[next.hex];
    if (!hex || hex.token !== undefined) {
      d.bare.shift();
      continue;
    }
    const token = d.supply.pop();
    if (token !== undefined) {
      d.bare.shift();
      hex.token = token;
      ctx.emit({ type: 'tokenPlaced', hex: hex.id, token, player: next.seat, from: 'pile' });
      ctx.hook('hexChanged', hex);
      continue;
    }
    const options = tokenOptions(ctx, next.seat, next.hex);
    // Only the builder, on their own move, picks the number to bring over.
    if (!options.length || next.seat !== ctx.active || ctx.state.winner !== null) {
      d.bare.shift();
      continue;
    }
    ctx.setPhase({
      id: 'moveToken',
      hex: next.hex,
      options,
      returnTo: ctx.state.phase,
    } as TokenPhase & Phase);
    return true;
  }
  return false;
}

const takeToken: ActionDef<Action & { hex: HexId }> = {
  phases: ['moveToken'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    const ph = ctx.state.phase as unknown as TokenPhase;
    return ph.options.includes(a.hex) ? null : 'Take a number from one of the glowing hexes';
  },
  apply(ctx, a) {
    const ph = ctx.state.phase as unknown as TokenPhase;
    const from = ctx.state.hexes[a.hex]!;
    const to = ctx.state.hexes[ph.hex]!;
    to.token = from.token as number;
    delete from.token;
    tdaData(ctx).bare.shift();
    ctx.emit({ type: 'tokenPlaced', hex: to.id, token: to.token, player: a.player, from: a.hex });
    ctx.hook('hexChanged', from);
    ctx.hook('hexChanged', to);
    ctx.setPhase(ph.returnTo);
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    const ph = ctx.state.phase as unknown as TokenPhase;
    return ph.options.map((hex) => ({ type: 'takeToken', player, hex }));
  },
};

// ---- Dragons ----

const isDesert = (ctx: Ctx, h: string) => ctx.state.hexes[h as HexId]?.type === 'desert';

export function dragonHex(ctx: Ctx, h: HexId): boolean {
  return (tdaData(ctx).dragons[h] ?? 0) > 0;
}

/** True once every dragon is awake and they have started to spread. */
export function dragonsAttacking(ctx: Ctx): boolean {
  return dragonsOn(ctx) && tdaData(ctx).awake >= TOTAL_DRAGONS;
}

function deserts(ctx: Ctx): HexId[] {
  return Object.values(ctx.state.hexes)
    .filter((h) => h.type === 'desert')
    .map((h) => h.id)
    .sort();
}

/** A new building wakes 3 dragons (3 players) or 2 (more players), spread evenly. */
function wakeDragons(ctx: Ctx): void {
  const d = tdaData(ctx);
  const homes = deserts(ctx);
  if (!homes.length || d.awake >= TOTAL_DRAGONS) return;
  let n = ctx.playerCount <= 3 ? 3 : 2;
  while (n-- > 0 && d.awake < TOTAL_DRAGONS) {
    const h = homes.reduce((a, b) => ((d.dragons[b] ?? 0) < (d.dragons[a] ?? 0) ? b : a));
    d.dragons[h] = (d.dragons[h] ?? 0) + 1;
    d.awake++;
  }
  ctx.emit({ type: 'dragonsWake', awake: d.awake, total: TOTAL_DRAGONS });
  if (d.awake >= TOTAL_DRAGONS) ctx.emit({ type: 'dragonsAttack' });
}

/**
 * Dragon relief (an option, off by default): a player whose building stood on a rolled hex that
 * a dragon blocked takes one random resource from the bank instead, once a roll.
 */
export function dragonRelief(ctx: Ctx, total: number): void {
  const seats = new Set<number>();
  for (const h of Object.values(ctx.state.hexes)) {
    if (h.token !== total || h.hidden || !dragonHex(ctx, h.id) || isDesert(ctx, h.id)) continue;
    for (const c of ctx.geometry.hexCorners.get(h.id) ?? []) {
      const b = ctx.buildingAt(c);
      if (b && b.owner !== null) seats.add(b.owner);
    }
  }
  const received: Record<number, Record<string, number>> = {};
  for (const seat of [...seats].sort((a, b) => a - b)) {
    const stock = RESOURCES.filter((r) => ctx.bankHas({ [r]: 1 }));
    if (!stock.length) break;
    const card = stock[ctx.rng.int(0, stock.length - 1)]!;
    ctx.grant(seat, { [card]: 1 });
    received[seat] = { [card]: 1 };
  }
  if (Object.keys(received).length) ctx.emit({ type: 'dragonRelief', total, received });
}

/** After production: each rolled hex beside a dragon draws one from the deserts. */
export function spreadDragons(ctx: Ctx, total: number): void {
  const d = tdaData(ctx);
  const targets = Object.values(ctx.state.hexes)
    .filter(
      (h) =>
        h.token === total &&
        !h.hidden &&
        h.type !== 'desert' &&
        ctx.registry.hexTypes[h.type]?.terrain === 'land' &&
        !dragonHex(ctx, h.id) &&
        neighbours(h.id).some((n) => dragonHex(ctx, n)),
    )
    .map((h) => h.id)
    .sort();
  const moved: HexId[] = [];
  for (const t of targets) {
    const from = deserts(ctx)
      .filter((h) => (d.dragons[h] ?? 0) > 0)
      .sort((a, b) => (d.dragons[b] ?? 0) - (d.dragons[a] ?? 0))[0];
    if (!from) break;
    d.dragons[from] = (d.dragons[from] ?? 0) - 1;
    if (!d.dragons[from]) delete d.dragons[from];
    d.dragons[t] = 1;
    moved.push(t);
  }
  if (moved.length) ctx.emit({ type: 'dragonsSpread', hexes: moved });
}

/** A road between two dragon hexes is cut. */
export function roadBlocked(ctx: Ctx, edge: EdgeId): boolean {
  if (!dragonsOn(ctx)) return false;
  const hs = ctx.geometry.edgeHexes.get(edge) ?? [];
  return hs.length === 2 && hs.every((h) => dragonHex(ctx, h));
}

/** A town with dragons on every side scores nothing. */
export function buildingBlocked(ctx: Ctx, corner: CornerId): boolean {
  if (!dragonsOn(ctx)) return false;
  const hs = ctx.geometry.cornerHexes.get(corner) ?? [];
  return hs.length > 0 && hs.every((h) => dragonHex(ctx, h));
}

/** Hexes a Knight card can clear: dragons out on the land, not those still in the deserts. */
export function slayableHexes(ctx: Ctx): HexId[] {
  return Object.keys(tdaData(ctx).dragons)
    .filter((h) => !isDesert(ctx, h) && dragonHex(ctx, h as HexId))
    .sort() as HexId[];
}

function connectsUnblocked(ctx: Ctx, seat: number, corner: CornerId): boolean {
  const b = ctx.buildingAt(corner);
  if (b) return b.owner === seat;
  if (ctx.blocksRouteAt(corner, seat)) return false;
  return routesAt(ctx, seat, corner, 'land').some(
    (p) => p.at.kind === 'edge' && !roadBlocked(ctx, p.at.id),
  );
}

/** Roads can't go between two dragon hexes or join a road the dragons have cut. */
const dragonRoad = (prev: ActionDef): ActionDef => ({
  ...prev,
  check(ctx, a) {
    const err = prev.check(ctx, a);
    if (err || !dragonsOn(ctx) || typeof a.edge !== 'string') return err;
    const edge = a.edge as EdgeId;
    if (roadBlocked(ctx, edge)) return 'Dragons hold both sides of this path';
    const ends = ctx.geometry.edgeCorners.get(edge) ?? [];
    return ends.some((c) => connectsUnblocked(ctx, a.player, c))
      ? null
      : 'This road would join a road the dragons have cut';
  },
});

export interface SlayPhase {
  id: 'slayDragon';
  returnTo: string;
}

const slayDragon: ActionDef<Action & { hex: HexId }> = {
  phases: ['slayDragon'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    return slayableHexes(ctx).includes(a.hex) ? null : 'There is no dragon there to drive out';
  },
  apply(ctx, a) {
    const d = tdaData(ctx);
    delete d.dragons[a.hex];
    d.slain[a.player] = (d.slain[a.player] ?? 0) + 1;
    ctx.emit({ type: 'dragonSlain', player: a.player, hex: a.hex });
    ctx.setPhase({ id: (ctx.state.phase as unknown as SlayPhase).returnTo });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return slayableHexes(ctx).map((hex) => ({ type: 'slayDragon', player, hex }));
  },
};

/** On a 7 with no robber: after discards, the roller takes a card from anyone. */
function stealFromAnyone(ctx: Ctx): void {
  const returnTo = (ctx.state.phase.returnTo as string | undefined) ?? 'main';
  const thief = ctx.active;
  const candidates = ctx.state.players
    .map((p) => p.seat)
    .filter((s) => s !== thief && ctx.handSize(s, false) > 0);
  if (!candidates.length) return ctx.setPhase({ id: returnTo });
  if (candidates.length === 1) {
    stealFrom(ctx, thief, candidates[0]!);
    return ctx.setPhase({ id: returnTo });
  }
  ctx.setPhase({ id: 'steal', candidates, returnTo });
}

// ---- Enchanted Land (with Cities & Knights) ----

const enchanted = (ctx: Ctx) => scenarioOf(ctx) === 'enchanted-land';
export const DRAGONS_TO_WIN = 6;
export const ROAM_STEPS = 3;

export function isEnchantedHex(ctx: Ctx, h: HexId): boolean {
  return ctx.state.hexes[h]?.props?.enchanted === true;
}

export function enchantedCorner(ctx: Ctx, c: CornerId): boolean {
  return (ctx.geometry.cornerHexes.get(c) ?? []).some((h) => isEnchantedHex(ctx, h));
}

function coastalCorner(ctx: Ctx, c: CornerId): boolean {
  const hs = ctx.geometry.cornerHexes.get(c) ?? [];
  return hs.length < 3 || hs.some((h) => ctx.isSea(h));
}

export function dragonOn(ctx: Ctx, c: CornerId): Piece | undefined {
  return ctx.piecesAt({ kind: 'corner', id: c }).find((p) => p.type === 'dragon');
}

const free = (ctx: Ctx, c: CornerId) => ctx.piecesAt({ kind: 'corner', id: c }).length === 0;
const cornerOfPiece = (p: Piece) => (p.at as { id: CornerId }).id;

/** Coastal corners of the enchanted land this knight could sail to (once per player). */
export function crossTargets(ctx: Ctx, k: Piece): CornerId[] {
  if (!enchanted(ctx) || k.owner === null || !isKnight(k) || isAway(k) || !canAct(ctx, k))
    return [];
  if (tdaData(ctx).crossed[k.owner]) return [];
  const seat = k.owner;
  const out = new Set<CornerId>();
  for (const c of reachable(ctx, seat, cornerOfPiece(k))) {
    if (!enchantedCorner(ctx, c) || !coastalCorner(ctx, c)) continue;
    if (free(ctx, c)) out.add(c);
    else if (ctx.buildingAt(c)?.owner === seat)
      // Your own settlement there: step ashore beside it.
      for (const n of ctx.geometry.cornerNeighbours.get(c) ?? [])
        if (enchantedCorner(ctx, n) && coastalCorner(ctx, n) && free(ctx, n)) out.add(n);
  }
  return [...out].sort();
}

/** Corners an away knight can reach: up to 3 steps along any path, never ending on the coast. */
export function roamTargets(ctx: Ctx, k: Piece): CornerId[] {
  if (!enchanted(ctx) || k.owner === null || !isAway(k) || !canAct(ctx, k)) return [];
  const seat = k.owner;
  const start = cornerOfPiece(k);
  const dist = new Map<CornerId, number>([[start, 0]]);
  const queue: CornerId[] = [start];
  while (queue.length) {
    const c = queue.shift()!;
    const d = dist.get(c)!;
    if (d >= ROAM_STEPS) continue;
    const rival = knightAt(ctx, c);
    if (c !== start && rival && rival.owner !== seat) continue;
    for (const e of ctx.geometry.cornerEdges.get(c) ?? []) {
      if (!ctx.isLandEdge(e)) continue;
      for (const n of ctx.geometry.edgeCorners.get(e) ?? []) {
        if (dist.has(n) || !enchantedCorner(ctx, n)) continue;
        dist.set(n, d + 1);
        queue.push(n);
      }
    }
  }
  const level = knightLevel(k);
  return [...dist.keys()]
    .filter((c) => {
      if (c === start || coastalCorner(ctx, c)) return false;
      const other = knightAt(ctx, c);
      return !other || (other.owner !== seat && knightLevel(other) < level);
    })
    .sort();
}

/** Where a knight pushed away on the enchanted land goes: the first free inland corner. */
function pushSpot(ctx: Ctx, not: CornerId): CornerId | undefined {
  return ctx.geometry.corners
    .filter((c) => c !== not && enchantedCorner(ctx, c) && !coastalCorner(ctx, c) && free(ctx, c))
    .sort()[0];
}

export function canFight(ctx: Ctx, k: Piece): boolean {
  return enchanted(ctx) && isAway(k) && canAct(ctx, k) && !!dragonOn(ctx, cornerOfPiece(k));
}

const ownKnight = (ctx: Ctx, a: Action): Piece | undefined => {
  const k = typeof a.knight === 'string' ? ctx.state.pieces[a.knight] : undefined;
  return k && isKnight(k) && k.owner === a.player ? k : undefined;
};

const crossKnight: ActionDef<Action & { knight: string; to: CornerId }> = {
  phases: ['main'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    const k = ownKnight(ctx, a);
    if (!k) return 'Pick one of your knights';
    if (tdaData(ctx).crossed[a.player])
      return 'You have already sent a knight to the enchanted land';
    return crossTargets(ctx, k).includes(a.to)
      ? null
      : 'An active knight crosses where your ships reach the enchanted land';
  },
  apply(ctx, a) {
    const k = ownKnight(ctx, a)!;
    ctx.move(k, { kind: 'corner', id: a.to });
    k.props.away = true;
    k.props.active = false;
    tdaData(ctx).crossed[a.player] = true;
    ctx.emit({ type: 'knightCrossed', player: a.player, at: a.to });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || !enchanted(ctx)) return [];
    return knightsOf(ctx, player).flatMap((k) =>
      crossTargets(ctx, k).map((to) => ({ type: 'crossKnight', player, knight: k.id, to })),
    );
  },
};

const roamKnight: ActionDef<Action & { knight: string; to: CornerId }> = {
  phases: ['main'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    const k = ownKnight(ctx, a);
    if (!k || !isAway(k)) return 'Pick your knight on the enchanted land';
    return roamTargets(ctx, k).includes(a.to)
      ? null
      : 'An active knight moves up to 3 corners inland, or pushes a weaker knight';
  },
  apply(ctx, a) {
    const k = ownKnight(ctx, a)!;
    const rival = knightAt(ctx, a.to);
    if (rival && rival.owner !== a.player) {
      const spot = pushSpot(ctx, a.to);
      if (spot) ctx.move(rival, { kind: 'corner', id: spot });
      else ctx.remove(rival);
      ctx.emit({ type: 'knightPushed', player: a.player, victim: rival.owner, to: spot ?? null });
    }
    ctx.move(k, { kind: 'corner', id: a.to });
    k.props.active = false;
    ctx.emit({ type: 'knightRoamed', player: a.player, to: a.to });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || !enchanted(ctx)) return [];
    return knightsOf(ctx, player).flatMap((k) =>
      roamTargets(ctx, k).map((to) => ({ type: 'roamKnight', player, knight: k.id, to })),
    );
  },
};

const fightDragon: ActionDef<Action & { knight: string }> = {
  phases: ['main'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    const k = ownKnight(ctx, a);
    if (!k) return 'Pick one of your knights';
    return canFight(ctx, k)
      ? null
      : 'An active knight on a dragon fights it, from the turn after it was activated';
  },
  apply(ctx, a) {
    const k = ownKnight(ctx, a)!;
    const dragon = dragonOn(ctx, cornerOfPiece(k))!;
    const tier = Number(dragon.props.tier ?? 1);
    const won = knightLevel(k) >= tier;
    k.props.active = false;
    ctx.emit({ type: 'dragonFight', player: a.player, tier, won });
    if (!won) return;
    ctx.remove(dragon);
    const d = tdaData(ctx);
    d.slain[a.player] = (d.slain[a.player] ?? 0) + 1;
    if ((d.slain[a.player] ?? 0) >= DRAGONS_TO_WIN && ctx.state.winner === null) {
      ctx.state.winner = a.player;
      ctx.setPhase({ id: 'gameOver' });
      ctx.emit({
        type: 'gameOver',
        winner: a.player,
        vp: ctx.state.players.map((_, i) => ctx.vp(i)),
        dragons: true,
      });
    }
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || !enchanted(ctx)) return [];
    return knightsOf(ctx, player)
      .filter((k) => canFight(ctx, k))
      .map((k) => ({ type: 'fightDragon', player, knight: k.id }));
  },
};

/** Cities & Knights moves are for knights at home; knights away roam instead. */
const homeKnightsOnly = (prev: ActionDef): ActionDef => ({
  ...prev,
  check(ctx, a) {
    if (enchanted(ctx) || canalGame(ctx)) {
      const where = enchanted(ctx) ? 'on the enchanted land' : 'on a small island';
      const k = typeof a.knight === 'string' ? ctx.state.pieces[a.knight] : undefined;
      if (k && isAway(k))
        return enchanted(ctx)
          ? 'This knight roams the enchanted land'
          : 'This knight stays on its island';
      const to = typeof a.to === 'string' ? (a.to as CornerId) : undefined;
      const target = to ? knightAt(ctx, to) : undefined;
      if (target && isAway(target)) return `That knight is ${where}`;
      if (to && canalGame(ctx) && smallIslandCorner(ctx, to))
        return 'Knights on the small islands are raised there';
    }
    return prev.check(ctx, a);
  },
});

/** Building on the enchanted land: coastal settlements only, no cities, no roads, no new knights. */
const enchantedBuild =
  (what: 'settlement' | 'city' | 'road' | 'knight') =>
  (prev: ActionDef): ActionDef => ({
    ...prev,
    check(ctx, a) {
      if (enchanted(ctx)) {
        if (what === 'road' && typeof a.edge === 'string') {
          const hs = ctx.geometry.edgeHexes.get(a.edge as EdgeId) ?? [];
          if (hs.some((h) => isEnchantedHex(ctx, h))) return 'No roads on the enchanted land';
        }
        if (typeof a.corner === 'string' && enchantedCorner(ctx, a.corner as CornerId)) {
          const c = a.corner as CornerId;
          if (what === 'settlement' && !coastalCorner(ctx, c))
            return 'On the enchanted land, settlements go on the coast';
          if (what === 'city') return 'Settlements on the enchanted land stay settlements';
          if (what === 'knight') return 'New knights are raised at home';
        }
      }
      return prev.check(ctx, a);
    },
  });

// ---- The Great Canal (with Cities & Knights) ----

export const canalGame = (ctx: Ctx) => scenarioOf(ctx) === 'great-canal';

/** The canal's hexes in order, from the lake to the basin. */
export function canalHexes(ctx: Ctx): HexState[] {
  return Object.values(ctx.state.hexes)
    .filter((h) => typeof h.props?.canal === 'string')
    .sort((a, b) => Number(a.props?.canalStep ?? 0) - Number(b.props?.canalStep ?? 0));
}

/** Stretches of canal still to dig. */
export function canalLeft(ctx: Ctx): number {
  return canalHexes(ctx).filter((h) => h.props?.canal === 'dig').length;
}

/** A corner on one of the small islands, away from the home island. */
export function smallIslandCorner(ctx: Ctx, c: CornerId): boolean {
  const home = homeHexes(ctx);
  const hs = ctx.geometry.cornerHexes.get(c) ?? [];
  return !hs.some((h) => home.has(h)) && hs.some((h) => ctx.isLand(h));
}

const goldRiverCorner = (ctx: Ctx, c: CornerId) =>
  (ctx.geometry.cornerHexes.get(c) ?? []).some(
    (h) => ctx.state.hexes[h]?.props?.goldRiver === true,
  );

const harborCorner = (ctx: Ctx, c: CornerId) =>
  ctx.state.harbors.some((h) =>
    (ctx.geometry.edgeCorners.get(h.edge) ?? ([] as CornerId[])).includes(c),
  );

const activeAtHome = (k: Piece | undefined): k is Piece =>
  !!k && k.owner !== null && k.props.active === true && !isAway(k);

/** Two active knights beside a marked hex dig its stretch of canal. */
function digCanal(ctx: Ctx): void {
  const d = tdaData(ctx);
  if (d.flooded) return;
  for (const hex of canalHexes(ctx)) {
    if (hex.props?.canal !== 'dig') continue;
    const knights = (ctx.geometry.hexCorners.get(hex.id) ?? [])
      .map((c) => knightAt(ctx, c))
      .filter(activeAtHome);
    if (knights.length < 2) continue;
    const mine = knights.filter((k) => k.owner === ctx.active);
    const pair =
      mine.length >= 2
        ? mine.slice(0, 2)
        : mine.length === 1
          ? [mine[0]!, knights.find((k) => k.owner !== ctx.active)!]
          : knights.slice(0, 2);
    const diggers = pair.map((k) => k.owner!);
    hex.props = { ...hex.props, canal: 'dug' };
    for (const seat of diggers) d.chips[seat] = (d.chips[seat] ?? 0) + 1;
    ctx.emit({ type: 'canalDug', hex: hex.id, players: diggers });
  }
  // With one stretch left the canal is done: its chips leave the game and the basin floods.
  if (canalHexes(ctx).length && canalLeft(ctx) <= 1) flood(ctx);
}

function flood(ctx: Ctx): void {
  tdaData(ctx).flooded = true;
  for (const hex of canalHexes(ctx)) hex.props = { ...hex.props, canal: 'water' };
  for (const hex of Object.values(ctx.state.hexes)) {
    if (hex.props?.basin !== true) continue;
    hex.type = 'lake';
    ctx.hook('hexChanged', hex);
  }
  ctx.emit({ type: 'canalFlooded' });
}

/** On an 8, each knight's owner beside a gold river pans one resource of their choice. */
function prospect(ctx: Ctx): void {
  const d = tdaData(ctx);
  for (const hex of Object.values(ctx.state.hexes)) {
    if (hex.props?.goldRiver !== true) continue;
    const owners = new Set<number>();
    for (const c of ctx.geometry.hexCorners.get(hex.id) ?? []) {
      const k = knightAt(ctx, c);
      if (k && k.owner !== null) owners.add(k.owner);
    }
    for (const seat of owners) d.prospect[seat] = (d.prospect[seat] ?? 0) + 1;
  }
}

function settleProspect(ctx: Ctx): void {
  const d = tdaData(ctx);
  if (!Object.keys(d.prospect).length || ctx.state.winner !== null) return;
  const ph = ctx.state.phase;
  if (ph.id === 'pickGold') {
    // Seafarers gold is already being picked: add the panned gold to it.
    const owed = { ...(ph.owed as Record<number, number>) };
    for (const [seat, n] of Object.entries(d.prospect))
      owed[Number(seat)] = (owed[Number(seat)] ?? 0) + n;
    ctx.setPhase({ ...ph, owed });
  } else if (ph.id === 'main') {
    startGoldPick(ctx, d.prospect, { id: 'main' });
  } else return;
  ctx.emit({ type: 'goldPanned', owed: d.prospect });
  d.prospect = {};
}

/** Small islands: knights only by a gold river or a harbor, and they stay there. */
const canalKnight = (prev: ActionDef): ActionDef => ({
  ...prev,
  check(ctx, a) {
    if (canalGame(ctx) && typeof a.corner === 'string') {
      const c = a.corner as CornerId;
      if (smallIslandCorner(ctx, c) && !goldRiverCorner(ctx, c) && !harborCorner(ctx, c))
        return 'On the small islands, knights stand by a gold river or a harbor';
    }
    return prev.check(ctx, a);
  },
  apply(ctx, a) {
    prev.apply(ctx, a);
    if (!canalGame(ctx) || typeof a.corner !== 'string') return;
    const c = a.corner as CornerId;
    const k = knightAt(ctx, c);
    if (k && smallIslandCorner(ctx, c)) k.props.away = true;
  },
});

const canalSettlement = (prev: ActionDef): ActionDef => ({
  ...prev,
  check(ctx, a) {
    if (
      canalGame(ctx) &&
      typeof a.corner === 'string' &&
      smallIslandCorner(ctx, a.corner as CornerId)
    )
      return 'No settlements on the small islands';
    return prev.check(ctx, a);
  },
});

/** Great Canal ships: never on the lake, and shipping lines don't branch. */
export function canalShipProblem(
  ctx: Ctx,
  seat: number,
  edge: EdgeId,
  moving?: string,
): string | null {
  if (!canalGame(ctx)) return null;
  const hs = ctx.geometry.edgeHexes.get(edge) ?? [];
  if (!hs.some((h) => ctx.state.hexes[h]?.type === 'sea')) return 'Ships stay off the lake';
  for (const c of ctx.geometry.edgeCorners.get(edge) ?? []) {
    if (ctx.buildingAt(c)?.owner === seat) continue;
    const ships = (ctx.geometry.cornerEdges.get(c) ?? []).filter(
      (e) =>
        e !== edge &&
        ctx
          .piecesAt({ kind: 'edge', id: e })
          .some((p) => p.owner === seat && p.type === 'ship' && p.id !== moving),
    ).length;
    if (ships >= 2) return 'Shipping lines do not branch in this scenario';
  }
  return null;
}

const canalShip = (prev: ActionDef): ActionDef => ({
  ...prev,
  check(ctx, a) {
    const edge = (typeof a.edge === 'string' ? a.edge : a.to) as EdgeId | undefined;
    if (typeof edge === 'string') {
      const moving = typeof a.ship === 'string' ? a.ship : undefined;
      const err = canalShipProblem(ctx, a.player, edge, moving);
      if (err) return err;
    }
    return prev.check(ctx, a);
  },
});

// ---- Module ----

export const treasuresDragonsModule: GameModule = {
  id: MODULE_ID,
  name: 'Treasures, Dragons & Adventurers',
  requires: ['base', 'seafarers'],
  conflicts: ['traders-barbarians'],
  settings: {
    tdaScenario: 'treasure-islands',
    treasureStack: 0,
    tokenSupply: [],
    dragonRelief: false,
  },
  pieceTypes: {
    treasure: { on: 'corner' },
    dragon: { on: 'corner' },
  },
  actions: { slayDragon, takeToken, crossKnight, roamKnight, fightDragon, treasureProgress },
  wrapActionsIfPresent: {
    moveKnight: homeKnightsOnly,
    displaceKnight: homeKnightsOnly,
    chaseRobber: homeKnightsOnly,
    buildKnight: (prev) => enchantedBuild('knight')(canalKnight(prev)),
  },
  wrapActions: {
    playDevCard: (prev): ActionDef => ({
      ...prev,
      check(ctx, a) {
        const err = prev.check(ctx, a);
        if (err || a.card !== 'knight' || !dragonsOn(ctx)) return err;
        return slayableHexes(ctx).length ? null : 'There is no dragon out on the land yet';
      },
      apply(ctx, a) {
        const returnTo = ctx.state.phase.id;
        prev.apply(ctx, a);
        // A Knight drives out a dragon instead of moving the robber.
        if (a.card === 'knight' && dragonsOn(ctx))
          ctx.setPhase({ id: 'slayDragon', returnTo } satisfies SlayPhase);
      },
    }),
    movePirate: (prev): ActionDef => ({
      ...prev,
      check(ctx, a) {
        if (!ctx.piecesOfType('pirate').length) return 'There is no pirate in this scenario';
        return prev.check(ctx, a);
      },
    }),
    buildRoad: (prev) => enchantedBuild('road')(dragonRoad(prev)),
    placeFreeRoad: (prev) => enchantedBuild('road')(dragonRoad(prev)),
    buildSettlement: (prev) => enchantedBuild('settlement')(canalSettlement(prev)),
    buildShip: canalShip,
    moveShip: canalShip,
    placeSetupShip: canalShip,
    placeFreeShip: canalShip,
    buildCity: enchantedBuild('city'),
  },
  hooks: {
    init(ctx) {
      const d = tdaData(ctx);
      for (const p of ctx.state.players) {
        d.found[p.seat] = 0;
        d.slain[p.seat] = 0;
        if (canalGame(ctx)) d.chips[p.seat] = 0;
      }
      const chests = ctx.piecesOfType('treasure').length;
      d.stack = ctx.setting<number>('treasureStack') ?? 0;
      d.deck = shuffle(ctx, treasureDeck(chests + d.stack));
      d.supply = [...(ctx.setting<number[]>('tokenSupply') ?? [])];
      if (dragonsOn(ctx)) {
        // No robber, no pirate, and no Largest Army: Knights fight dragons.
        for (const r of ctx.piecesOfType('robber')) ctx.remove(r);
        for (const r of ctx.piecesOfType('pirate')) ctx.remove(r);
        ctx.state.settings.largestArmyMin = 99;
      }
    },
    piecePlaced(ctx, piece, previous) {
      if (previous !== null) return;
      takeChests(ctx, piece);
      if (greater(ctx)) queueBare(ctx, piece);
      if (
        dragonsOn(ctx) &&
        piece.owner !== null &&
        (piece.type === 'settlement' || piece.type === 'city') &&
        ctx.state.phase.id !== 'setup'
      )
        wakeDragons(ctx);
    },
    afterAction(ctx, action) {
      const d = tdaData(ctx);
      // Hooked rather than wrapped, so Cities & Knights keeps the top of the roll.
      if (action.type === 'roll' && dragonsAttacking(ctx)) {
        const total = (ctx.state.data.base as { lastRoll?: { total: number } }).lastRoll?.total;
        if (total && total !== 7) {
          if (ctx.setting<boolean>('dragonRelief')) dragonRelief(ctx, total);
          spreadDragons(ctx, total);
        }
      }
      // An empty sea or desert found in the fog holds a treasure from the stack.
      for (const e of ctx.events) {
        if (e.type !== 'revealed' || typeof e.player !== 'number') continue;
        if (e.terrain !== 'sea' && e.terrain !== 'desert') continue;
        if (d.stack <= 0) continue;
        d.stack--;
        openTreasure(ctx, e.player, 'fog');
      }
      if (dragonsOn(ctx) && ctx.state.phase.id === 'moveRobber') stealFromAnyone(ctx);
      if (canalGame(ctx)) {
        digCanal(ctx);
        if (!d.flooded && ctx.events.some((e) => e.type === 'production' && e.total === 8))
          prospect(ctx);
        settleProspect(ctx);
      }
      if (greater(ctx) && ctx.state.phase.id !== 'moveToken' && settleBare(ctx)) return;
      settleOwed(ctx);
    },
  },
  reducers: {
    hexYield(ctx, hex, _piece, value) {
      // Dry farmland grows nothing until the basin floods (starting resources still come).
      if (
        canalGame(ctx) &&
        hex.props?.farmland === true &&
        !tdaData(ctx).flooded &&
        ctx.state.phase.id !== 'setup'
      )
        return {};
      return dragonsOn(ctx) && dragonHex(ctx, hex.id) ? {} : value;
    },
    vp(ctx, seat, value) {
      // Each dragon beaten on the enchanted land is a point.
      if (enchanted(ctx)) return value + (tdaData(ctx).slain[seat] ?? 0);
      if (canalGame(ctx)) return value + (tdaData(ctx).chips[seat] ?? 0);
      if (!dragonsOn(ctx)) return value;
      let lost = 0;
      for (const p of ctx.piecesOf(seat)) {
        if (p.at.kind !== 'corner' || !buildingBlocked(ctx, p.at.id)) continue;
        lost += ctx.registry.pieceTypes[p.type]?.vp ?? 0;
      }
      return value - lost;
    },
    supply(ctx, _seat, type, value) {
      // Greater Catan gives everyone 4 more cities.
      return greater(ctx) && type === 'city' ? value + 4 : value;
    },
    tradeRatio(ctx, seat, card, value) {
      if (!canalGame(ctx)) return value;
      // A knight at a small island's harbor trades there as if it were a settlement.
      let best = value;
      for (const h of ctx.state.harbors) {
        const here = (ctx.geometry.edgeCorners.get(h.edge) ?? []).some((c) => {
          const k = knightAt(ctx, c);
          return k?.owner === seat && isAway(k);
        });
        if (here && (h.resource === 'any' || h.resource === card)) best = Math.min(best, h.ratio);
      }
      return best;
    },
    vpTarget(ctx, value) {
      const s = scenarioOf(ctx);
      return value + (TDA_VP_BONUS[s] ?? 0) + (withCk(ctx) ? (TDA_CK_ADJUST[s] ?? 0) : 0);
    },
    routeWeight(ctx, piece, value) {
      // A cut road breaks the trade route: no path through it can be the longest.
      return piece.at.kind === 'edge' && roadBlocked(ctx, piece.at.id) ? -100 : value;
    },
  },
  redact(data) {
    const d = data as TdaData;
    // Treasures stay face down: everyone sees only how many are left.
    return { ...d, deck: d.deck.map(() => 'anyOne'), supply: (d.supply ?? []).map(() => 0) };
  },
};
