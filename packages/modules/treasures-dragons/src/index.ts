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
  type Phase,
  type Piece,
} from '@colonizers/engine';
import { routesAt, stealFrom } from '@colonizers/module-base';
import { freeSpots, startGoldPick } from '@colonizers/module-seafarers';

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
  'treasure-islands' | 'into-the-unknown' | 'greater-catan' | 'desert-dragons';

/** Points each scenario adds to the chosen target. */
export const TDA_VP_BONUS: Record<TdaScenario, number> = {
  'treasure-islands': 4,
  'into-the-unknown': 2,
  'greater-catan': 8,
  'desert-dragons': 3,
};

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
  kind: 'freeRoads' | 'anyTwo' | 'anyOne';
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
  if (o.kind === 'freeRoads') {
    const left = ctx.supplyLeft(o.seat, 'road') + ctx.supplyLeft(o.seat, 'ship');
    if (left > 0 && freeSpots(ctx, o.seat))
      ctx.setPhase({ id: 'roadBuilding', remaining: Math.min(2, left), returnTo: 'main' });
    return;
  }
  startGoldPick(ctx, { [o.seat]: o.kind === 'anyTwo' ? 2 : 1 }, { id: 'main' });
}

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

// ---- Module ----

export const treasuresDragonsModule: GameModule = {
  id: MODULE_ID,
  name: 'Treasures, Dragons & Adventurers',
  requires: ['base', 'seafarers'],
  conflicts: ['traders-barbarians', 'cities-knights'],
  settings: { tdaScenario: 'treasure-islands', treasureStack: 0, tokenSupply: [] },
  pieceTypes: {
    treasure: { on: 'corner' },
  },
  actions: { slayDragon, takeToken },
  wrapActions: {
    roll: (prev): ActionDef => ({
      ...prev,
      apply(ctx, a) {
        prev.apply(ctx, a);
        if (!dragonsAttacking(ctx)) return;
        const total = (ctx.state.data.base as { lastRoll?: { total: number } }).lastRoll?.total;
        if (total && total !== 7) spreadDragons(ctx, total);
      },
    }),
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
        if (scenarioOf(ctx) !== 'treasure-islands') return 'There is no pirate in this scenario';
        return prev.check(ctx, a);
      },
    }),
    buildRoad: dragonRoad,
    placeFreeRoad: dragonRoad,
  },
  hooks: {
    init(ctx) {
      const d = tdaData(ctx);
      for (const p of ctx.state.players) {
        d.found[p.seat] = 0;
        d.slain[p.seat] = 0;
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
    afterAction(ctx) {
      const d = tdaData(ctx);
      // An empty sea or desert found in the fog holds a treasure from the stack.
      for (const e of ctx.events) {
        if (e.type !== 'revealed' || typeof e.player !== 'number') continue;
        if (e.terrain !== 'sea' && e.terrain !== 'desert') continue;
        if (d.stack <= 0) continue;
        d.stack--;
        openTreasure(ctx, e.player, 'fog');
      }
      if (dragonsOn(ctx) && ctx.state.phase.id === 'moveRobber') stealFromAnyone(ctx);
      if (greater(ctx) && ctx.state.phase.id !== 'moveToken' && settleBare(ctx)) return;
      settleOwed(ctx);
    },
  },
  reducers: {
    hexYield(ctx, hex, _piece, value) {
      return dragonsOn(ctx) && dragonHex(ctx, hex.id) ? {} : value;
    },
    vp(ctx, seat, value) {
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
    vpTarget(ctx, value) {
      return value + (TDA_VP_BONUS[scenarioOf(ctx)] ?? 0);
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
