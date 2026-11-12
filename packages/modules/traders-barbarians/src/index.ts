import type {
  Action,
  ActionDef,
  CornerId,
  Ctx,
  EdgeId,
  GameModule,
  HexId,
  Phase,
  Piece,
} from '@colonizers/engine';
import {
  connectsAt,
  legalRoadEdges,
  publicVp,
  RESOURCES,
  robber,
  stealFrom,
} from '@colonizers/module-base';

/**
 * Scenarios from Traders & Barbarians, in our own version. The game setting
 * `tbScenario` picks one:
 *
 * - **fishermen**: fishing grounds off the coast and a lake in the middle
 *   pay fish tokens (1 to 3 fish each). Fish buy small favours: move the
 *   robber off the board, steal a card, take a resource, build a road, or
 *   take a development card. Hidden in the tokens is the old boot, which
 *   costs its holder a point until they pass it on.
 * - **rivers**: rivers cross the island. Only bridges can cross them, and
 *   building by the water pays gold. Gold buys resources, the richest
 *   player gets a point and the poorest lose two.
 * - **caravans**: camel caravans leave an oasis in the middle. At the end of
 *   each round in which anyone built a settlement or city, everyone votes
 *   with wool and grain on where the next camel goes. A road under a camel
 *   counts double for Longest Road, and a building between two camels is
 *   worth a point more.
 *
 * List it before the options module, so out-of-turn building covers bridges.
 */
export const MODULE_ID = 'traders-barbarians';
export type TbScenario = 'fishermen' | 'rivers' | 'caravans';

/** 11 one-fish, 10 two-fish and 8 three-fish tokens, plus the old boot (0). */
export const FISH_TOKENS: readonly number[] = [
  ...Array<number>(11).fill(1),
  ...Array<number>(10).fill(2),
  ...Array<number>(8).fill(3),
  0,
];
/** Most fish tokens a player may hold (the boot doesn't count). */
export const FISH_LIMIT = 7;
export const FISH_COST = { robber: 2, steal: 3, bank: 4, road: 5, devCard: 7 } as const;
export type FishUse = keyof typeof FISH_COST;
export const GOLD_PER_RESOURCE = 2;
export const GOLD_BUYS_PER_TURN = 2;
export const BRIDGES_PER_PLAYER = 3;
export const CAMELS = 22;
/** Most wool and grain one player can put into a single vote. */
export const MAX_BID = 3;

export interface TbData extends Record<string, unknown> {
  /** Fish tokens still face down, drawn from the end. */
  pile: number[];
  /** Spent tokens, shuffled back in when the pile runs out. */
  spent: number[];
  /** Each player's fish tokens. Others only see how many there are. */
  fish: Record<number, number[]>;
  /** Who holds the old boot. */
  boot: number | null;
  /** Gold coins, open for all to see. */
  gold: Record<number, number>;
  /** Gold-for-resource buys made this turn. */
  goldBuys: number;
  /** Edges with a camel. */
  camels: EdgeId[];
  /** The caravans leaving the oasis: the corners each has reached, last one is the head. */
  caravans: { corners: CornerId[]; ended: boolean }[];
  /** A settlement or city was built since the last vote. */
  builtThisRound: boolean;
}

export function tbData(ctx: Ctx): TbData {
  ctx.state.data[MODULE_ID] ??= {
    pile: [],
    spent: [],
    fish: {},
    boot: null,
    gold: {},
    goldBuys: 0,
    camels: [],
    caravans: [],
    builtThisRound: false,
  } satisfies TbData;
  return ctx.state.data[MODULE_ID] as TbData;
}

export function scenarioOf(ctx: Ctx): TbScenario | null {
  const s = ctx.setting<string>('tbScenario');
  return s === 'fishermen' || s === 'rivers' || s === 'caravans' ? s : null;
}

function shuffle(ctx: Ctx, list: number[]): number[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = ctx.rng.int(0, i);
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  return list;
}

const cornerOf = (p: Piece) => (p.at as { id: CornerId }).id;

// ---- Fishermen ----

export function fishOf(ctx: Ctx, seat: number): number[] {
  return (tbData(ctx).fish[seat] ??= []);
}

/** The fish a player can spend: the sum of their tokens. */
export function fishTotal(ctx: Ctx, seat: number): number {
  return fishOf(ctx, seat).reduce((s, n) => s + n, 0);
}

/** Lake numbers, or a fishing ground's single number. */
export function fishingNumbers(hex: {
  type: string;
  token?: number;
  props?: Record<string, unknown>;
}): number[] {
  if (hex.type === 'shoal') return hex.token ? [hex.token] : [];
  if (hex.type === 'fishingLake') return (hex.props?.tokens as number[] | undefined) ?? [];
  return [];
}

/** Fishing hexes that pay on this roll. The robber on a lake stops it. */
function fishingHexes(ctx: Ctx, total: number): HexId[] {
  const at = robber(ctx)?.at;
  return Object.values(ctx.state.hexes)
    .filter((h) => fishingNumbers(h).includes(total))
    .filter((h) => !(at?.kind === 'hex' && at.id === h.id))
    .map((h) => h.id);
}

function touchesFishing(ctx: Ctx, corner: CornerId): boolean {
  return (ctx.geometry.cornerHexes.get(corner) ?? []).some((h) => {
    const hex = ctx.state.hexes[h];
    return !!hex && fishingNumbers(hex).length > 0;
  });
}

function drawToken(ctx: Ctx): number | null {
  const d = tbData(ctx);
  if (!d.pile.length && d.spent.length) {
    d.pile = shuffle(ctx, d.spent);
    d.spent = [];
  }
  return d.pile.pop() ?? null;
}

/** Draws up to `n` tokens for a player. Returns the fish caught. */
function catchFish(ctx: Ctx, seat: number, n: number): void {
  const d = tbData(ctx);
  const mine = fishOf(ctx, seat);
  const caught: number[] = [];
  for (let i = 0; i < n; i++) {
    if (mine.length >= FISH_LIMIT) break;
    const t = drawToken(ctx);
    if (t === null) break;
    if (t === 0) {
      d.boot = seat;
      ctx.emit({ type: 'bootFound', player: seat });
      continue;
    }
    mine.push(t);
    caught.push(t);
  }
  if (!caught.length) return;
  ctx.emit({
    type: 'fishCaught',
    player: seat,
    tokens: caught.length,
    fish: caught.reduce((s, x) => s + x, 0),
    visibleTo: [seat],
    redacted: { player: seat, tokens: caught.length },
  });
}

function produceFish(ctx: Ctx, total: number): void {
  const owed = new Map<number, number>();
  for (const hex of fishingHexes(ctx, total)) {
    for (const c of ctx.geometry.hexCorners.get(hex) ?? []) {
      const b = ctx.buildingAt(c);
      if (!b || b.owner === null) continue;
      const n = ctx.registry.pieceTypes[b.type]?.production ?? 0;
      if (n > 0) owed.set(b.owner, (owed.get(b.owner) ?? 0) + n);
    }
  }
  const players = ctx.playerCount;
  for (let i = 0; i < players; i++) {
    const seat = (ctx.active + i) % players;
    const n = owed.get(seat);
    if (n) catchFish(ctx, seat, n);
  }
}

/**
 * The tokens to hand in for `cost`: the smallest total that covers it, then
 * the fewest tokens. Extra fish are lost, as there is no change. Returns
 * token positions, or null if the player can't pay.
 */
export function fishPayment(tokens: readonly number[], cost: number): number[] | null {
  let best: number[] | null = null;
  let bestSum = Infinity;
  for (let mask = 1; mask < 1 << tokens.length; mask++) {
    let sum = 0;
    const picked: number[] = [];
    tokens.forEach((t, i) => {
      if (mask & (1 << i)) {
        sum += t;
        picked.push(i);
      }
    });
    if (sum < cost) continue;
    if (sum < bestSum || (sum === bestSum && picked.length < (best?.length ?? Infinity))) {
      best = picked;
      bestSum = sum;
    }
  }
  return best;
}

const FISH_USES = Object.keys(FISH_COST) as FishUse[];
const BEFORE_ROLL: FishUse[] = ['robber', 'steal', 'bank'];

const spendFish: ActionDef = {
  phases: ['roll', 'main'],
  check(ctx, a) {
    if (scenarioOf(ctx) !== 'fishermen') return 'There is no fishing in this game';
    if (a.player !== ctx.active) return 'Not your turn';
    const use = a.use as FishUse;
    if (!FISH_USES.includes(use)) return 'Pick what to spend fish on';
    if (ctx.state.phase.id === 'roll' && !BEFORE_ROLL.includes(use))
      return 'Roll first, then build';
    if (!fishPayment(fishOf(ctx, a.player), FISH_COST[use]))
      return `You need ${FISH_COST[use]} fish`;
    switch (use) {
      case 'robber': {
        return robber(ctx)?.at.kind === 'hex' ? null : 'The robber is not on the board';
      }
      case 'steal': {
        const t = a.target as number;
        if (typeof t !== 'number' || t === a.player || !ctx.state.players[t])
          return 'Pick a player to steal from';
        return ctx.handSize(t, false) > 0 ? null : 'They have no cards';
      }
      case 'bank': {
        const r = a.resource as string;
        if (!(RESOURCES as readonly string[]).includes(r)) return 'Pick a resource';
        return ctx.bankHas({ [r]: 1 }) ? null : 'The bank has none left';
      }
      case 'road':
        return legalRoadEdges(ctx, a.player).length > 0 ? null : 'There is nowhere to build a road';
      case 'devCard':
        return ctx.state.decks.dev?.length ? null : 'No development cards left';
    }
  },
  apply(ctx, a) {
    const use = a.use as FishUse;
    const d = tbData(ctx);
    const mine = fishOf(ctx, a.player);
    const pay = fishPayment(mine, FISH_COST[use]) as number[];
    const paid = pay.map((i) => mine[i]!);
    d.fish[a.player] = mine.filter((_, i) => !pay.includes(i));
    d.spent.push(...paid);
    ctx.emit({
      type: 'fishSpent',
      player: a.player,
      use,
      fish: paid.reduce((s, x) => s + x, 0),
      ...(use === 'steal' && { target: a.target }),
      ...(use === 'bank' && { resource: a.resource }),
    });
    switch (use) {
      case 'robber':
        // Off the board; the next 7 or knight puts it back.
        ctx.remove(robber(ctx) as Piece);
        return;
      case 'steal':
        stealFrom(ctx, a.player, a.target as number);
        return;
      case 'bank':
        ctx.grant(a.player, { [a.resource as string]: 1 });
        return;
      case 'road':
        ctx.setPhase({ id: 'roadBuilding', remaining: 1, returnTo: 'main' });
        return;
      case 'devCard': {
        const card = ctx.drawCard('dev') as string;
        (ctx.player(a.player).held.dev ??= []).push({
          card,
          acquiredTurn: ctx.state.turn.number,
        });
        ctx.emit({
          type: 'boughtDevCard',
          player: a.player,
          card,
          free: true,
          visibleTo: [a.player],
          redacted: { player: a.player, free: true },
        });
      }
    }
  },
  enumerate(ctx, player) {
    if (scenarioOf(ctx) !== 'fishermen' || player !== ctx.active) return [];
    const out: Action[] = [
      { type: 'spendFish', player, use: 'robber' },
      { type: 'spendFish', player, use: 'road' },
      { type: 'spendFish', player, use: 'devCard' },
    ];
    for (const resource of RESOURCES)
      out.push({ type: 'spendFish', player, use: 'bank', resource });
    for (const p of ctx.state.players)
      if (p.seat !== player) out.push({ type: 'spendFish', player, use: 'steal', target: p.seat });
    return out;
  },
};

/** Points showing, not counting the boot: who the boot may go to. */
function trueVp(ctx: Ctx, seat: number): number {
  return publicVp(ctx, seat) + (tbData(ctx).boot === seat ? 1 : 0);
}

const passBoot: ActionDef = {
  phases: ['main'],
  check(ctx, a) {
    if (scenarioOf(ctx) !== 'fishermen') return 'There is no old boot in this game';
    if (a.player !== ctx.active) return 'Not your turn';
    if (tbData(ctx).boot !== a.player) return 'You do not have the old boot';
    const to = a.to as number;
    if (typeof to !== 'number' || to === a.player || !ctx.state.players[to])
      return 'Pick who gets the boot';
    return trueVp(ctx, to) >= trueVp(ctx, a.player)
      ? null
      : 'The boot can only go to a player with as many points as you, or more';
  },
  apply(ctx, a) {
    tbData(ctx).boot = a.to as number;
    ctx.emit({ type: 'bootPassed', player: a.player, to: a.to });
  },
  enumerate(ctx, player) {
    if (tbData(ctx).boot !== player || player !== ctx.active) return [];
    return ctx.state.players
      .filter((p) => p.seat !== player)
      .map((p) => ({ type: 'passBoot', player, to: p.seat }));
  },
};

// ---- Rivers ----

export function riverEdges(ctx: Ctx): Set<EdgeId> {
  return new Set(ctx.piecesOfType('river').map((p) => (p.at as { id: EdgeId }).id));
}

function riverCorners(ctx: Ctx): Set<CornerId> {
  const out = new Set<CornerId>();
  for (const e of riverEdges(ctx))
    for (const c of ctx.geometry.edgeCorners.get(e) ?? []) out.add(c);
  return out;
}

export function goldOf(ctx: Ctx, seat: number): number {
  return tbData(ctx).gold[seat] ?? 0;
}

function earnGold(ctx: Ctx, seat: number, n: number, reason: string): void {
  const d = tbData(ctx);
  d.gold[seat] = (d.gold[seat] ?? 0) + n;
  ctx.emit({ type: 'goldEarned', player: seat, gold: n, reason });
}

/** The one player with the most gold (if one leads alone), and everyone tied for the least. */
export function goldStanding(ctx: Ctx): { richest: number | null; poorest: number[] } {
  if (scenarioOf(ctx) !== 'rivers' || ctx.state.phase.id === 'setup')
    return { richest: null, poorest: [] };
  const gold = ctx.state.players.map((p) => goldOf(ctx, p.seat));
  const max = Math.max(...gold);
  const min = Math.min(...gold);
  const leaders = gold.flatMap((g, s) => (g === max ? [s] : []));
  return {
    richest: leaders.length === 1 ? leaders[0]! : null,
    poorest: gold.flatMap((g, s) => (g === min ? [s] : [])),
  };
}

const buildBridge: ActionDef = {
  phases: ['main'],
  check(ctx, a) {
    if (scenarioOf(ctx) !== 'rivers') return 'There are no rivers in this game';
    if (a.player !== ctx.active) return 'Not your turn';
    const edge = a.edge as EdgeId;
    if (!riverEdges(ctx).has(edge)) return 'Bridges go across a river';
    if (ctx.piecesAt({ kind: 'edge', id: edge }).some((p) => p.type === 'bridge'))
      return 'There is a bridge there already';
    if (ctx.supplyLeft(a.player, 'bridge') <= 0) return 'No bridges left';
    if (!ctx.has(a.player, ctx.cost('bridge', a.player))) return 'You can not afford a bridge';
    const corners = ctx.geometry.edgeCorners.get(edge) ?? [];
    if (!corners.some((c) => connectsAt(ctx, a.player, c, 'land')))
      return 'Bridges must connect to your road, settlement or city';
    return null;
  },
  apply(ctx, a) {
    ctx.pay(a.player, ctx.cost('bridge', a.player));
    ctx.place('bridge', a.player, { kind: 'edge', id: a.edge as EdgeId });
    ctx.emit({ type: 'built', player: a.player, piece: 'bridge', at: a.edge });
  },
  enumerate(ctx, player) {
    if (scenarioOf(ctx) !== 'rivers' || !ctx.has(player, ctx.cost('bridge', player))) return [];
    return [...riverEdges(ctx)].map((edge) => ({ type: 'buildBridge', player, edge }));
  },
};

const buyWithGold: ActionDef = {
  phases: ['main'],
  check(ctx, a) {
    if (scenarioOf(ctx) !== 'rivers') return 'There is no gold in this game';
    if (a.player !== ctx.active) return 'Not your turn';
    if (tbData(ctx).goldBuys >= GOLD_BUYS_PER_TURN)
      return `You can buy with gold ${GOLD_BUYS_PER_TURN} times a turn`;
    if (goldOf(ctx, a.player) < GOLD_PER_RESOURCE) return `You need ${GOLD_PER_RESOURCE} gold`;
    const r = a.resource as string;
    if (!(RESOURCES as readonly string[]).includes(r)) return 'Pick a resource';
    return ctx.bankHas({ [r]: 1 }) ? null : 'The bank has none left';
  },
  apply(ctx, a) {
    const d = tbData(ctx);
    d.gold[a.player] = goldOf(ctx, a.player) - GOLD_PER_RESOURCE;
    d.goldBuys += 1;
    ctx.grant(a.player, { [a.resource as string]: 1 });
    ctx.emit({
      type: 'goldSpent',
      player: a.player,
      gold: GOLD_PER_RESOURCE,
      resource: a.resource,
    });
  },
  enumerate(ctx, player) {
    if (scenarioOf(ctx) !== 'rivers' || player !== ctx.active) return [];
    return RESOURCES.map((resource) => ({ type: 'buyWithGold', player, resource }));
  },
};

// ---- Caravans ----

export function camelEdges(ctx: Ctx): Set<EdgeId> {
  return new Set(tbData(ctx).camels ?? []);
}

/** Where the next camel may go: one step on from the head of a caravan still travelling. */
export function camelOptions(ctx: Ctx): EdgeId[] {
  const d = tbData(ctx);
  if ((d.camels?.length ?? 0) >= CAMELS) return [];
  const taken = camelEdges(ctx);
  const oasis = new Set(
    Object.values(ctx.state.hexes)
      .filter((h) => h.type === 'oasis')
      .flatMap((h) => ctx.geometry.hexCorners.get(h.id) ?? []),
  );
  const out = new Set<EdgeId>();
  for (const c of d.caravans ?? []) {
    if (c.ended) continue;
    const head = c.corners[c.corners.length - 1]!;
    for (const e of ctx.geometry.cornerEdges.get(head) ?? []) {
      if (taken.has(e) || !ctx.isLandEdge(e)) continue;
      const [a, b] = ctx.geometry.edgeCorners.get(e)!;
      const next = a === head ? b : a;
      // No loops back into its own trail, and no running round the oasis.
      if (c.corners.includes(next) || (oasis.has(head) && oasis.has(next))) continue;
      out.add(e);
    }
  }
  return [...out].sort();
}

function placeCamel(ctx: Ctx, edge: EdgeId): void {
  const d = tbData(ctx);
  const [a, b] = ctx.geometry.edgeCorners.get(edge)!;
  const caravan = d.caravans.find((c) => {
    const head = c.corners[c.corners.length - 1];
    return !c.ended && (head === a || head === b);
  });
  d.camels.push(edge);
  if (caravan) {
    const head = caravan.corners[caravan.corners.length - 1];
    const next = head === a ? b : a;
    // Joining another caravan ends this one: caravans merge but never split.
    if (d.caravans.some((o) => o !== caravan && o.corners.includes(next))) caravan.ended = true;
    caravan.corners.push(next);
  }
  ctx.emit({ type: 'camelPlaced', edge });
}

export interface CamelVotePhase extends Phase {
  id: 'camelVote';
  /** Players still to vote; the first is voting now. */
  order: number[];
  /** Who breaks a tie: the player whose turn is starting. */
  first: number;
  votes: Record<string, number>;
  /** Each player's chosen path. */
  picks: Record<number, EdgeId>;
  owed: Record<number, number>;
  returnTo: Phase;
}

function startCamelVote(ctx: Ctx): void {
  const d = tbData(ctx);
  if (!d.builtThisRound) return;
  d.builtThisRound = false;
  if (!camelOptions(ctx).length) return;
  const n = ctx.playerCount;
  const first = ctx.active;
  const order = Array.from({ length: n }, (_, i) => (first + i) % n);
  ctx.setPhase({
    id: 'camelVote',
    order,
    first,
    votes: {},
    picks: {},
    owed: { [first]: 1 },
    returnTo: ctx.state.phase,
  } satisfies CamelVotePhase);
  ctx.emit({ type: 'camelVoteStarted' });
}

const bidOk = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0;

const camelBid: ActionDef = {
  phases: ['camelVote'],
  check(ctx, a) {
    const ph = ctx.state.phase as CamelVotePhase;
    if (ph.order[0] !== a.player) return 'Wait for your turn to vote';
    if (!camelOptions(ctx).includes(a.edge as EdgeId)) return 'Pick a path where a camel can go';
    if (!bidOk(a.wool) || !bidOk(a.grain)) return 'Bid whole cards';
    const wool = a.wool as number;
    const grain = a.grain as number;
    if (wool + grain > MAX_BID) return `Bid at most ${MAX_BID} cards`;
    return ctx.has(a.player, { wool, grain }) ? null : 'You do not have those cards';
  },
  apply(ctx, a) {
    const ph = ctx.state.phase as CamelVotePhase;
    const wool = a.wool as number;
    const grain = a.grain as number;
    const edge = a.edge as EdgeId;
    if (wool + grain > 0) ctx.pay(a.player, { wool, grain });
    const votes = { ...ph.votes, [edge]: (ph.votes[edge] ?? 0) + wool + grain };
    const picks = { ...ph.picks, [a.player]: edge };
    ctx.emit({ type: 'camelBid', player: a.player, edge, votes: wool + grain });
    const order = ph.order.slice(1);
    if (order.length) {
      ctx.setPhase({ ...ph, order, votes, picks, owed: { [order[0]!]: 1 } });
      return;
    }
    const max = Math.max(0, ...Object.values(votes));
    const top = Object.keys(votes)
      .filter((e) => votes[e] === max)
      .sort() as EdgeId[];
    const choice = top.includes(picks[ph.first]!) || !top.length ? picks[ph.first]! : top[0]!;
    placeCamel(ctx, choice);
    ctx.setPhase(ph.returnTo);
  },
  enumerate(ctx, player) {
    const ph = ctx.state.phase as CamelVotePhase;
    if (ph.order?.[0] !== player) return [];
    const out: Action[] = [];
    for (const edge of camelOptions(ctx))
      for (let wool = 0; wool <= MAX_BID; wool++)
        for (let grain = 0; wool + grain <= MAX_BID; grain++)
          out.push({ type: 'camelBid', player, edge, wool, grain });
    return out;
  },
};

/** Buildings with camels on two or more of their paths. */
function camelBonus(ctx: Ctx, seat: number): number {
  const camels = camelEdges(ctx);
  if (!camels.size) return 0;
  return ctx
    .piecesOf(seat)
    .filter((p) => ctx.registry.pieceTypes[p.type]?.building && p.at.kind === 'corner')
    .filter(
      (p) =>
        (ctx.geometry.cornerEdges.get(cornerOf(p)) ?? []).filter((e) => camels.has(e)).length >= 2,
    ).length;
}

// ---- Module ----

export const tradersBarbariansModule: GameModule = {
  id: MODULE_ID,
  name: 'Traders & Barbarians',
  requires: ['base'],
  conflicts: ['seafarers', 'cities-knights'],
  settings: { tbScenario: 'fishermen' },
  hexTypes: {
    oasis: { terrain: 'land' },
    shoal: { terrain: 'sea', robber: false },
    fishingLake: { terrain: 'land' },
    swamp: { terrain: 'land' },
  },
  pieceTypes: {
    river: { on: 'edge' },
    bridge: { on: 'edge', perPlayer: () => BRIDGES_PER_PLAYER, route: 'land' },
  },
  costs: { bridge: { brick: 2, lumber: 1 } },
  actions: { spendFish, passBoot, buildBridge, buyWithGold, camelBid },
  wrapActions: {
    roll: (prev): ActionDef => ({
      ...prev,
      apply(ctx, a) {
        prev.apply(ctx, a);
        if (scenarioOf(ctx) !== 'fishermen') return;
        const total = (ctx.state.data.base as { lastRoll?: { total: number } }).lastRoll?.total;
        if (total && total !== 7) produceFish(ctx, total);
      },
    }),
    placeSetupSettlement: (prev): ActionDef => ({
      ...prev,
      apply(ctx, a) {
        const second = (ctx.state.phase.index as number) >= ctx.playerCount;
        prev.apply(ctx, a);
        // The second starting settlement by the water lands a first catch.
        if (scenarioOf(ctx) === 'fishermen' && second && touchesFishing(ctx, a.corner as CornerId))
          catchFish(ctx, a.player, 1);
      },
    }),
  },
  hooks: {
    init(ctx) {
      const d = tbData(ctx);
      for (const p of ctx.state.players) {
        d.fish[p.seat] = [];
        d.gold[p.seat] = 0;
      }
      if (scenarioOf(ctx) === 'fishermen') d.pile = shuffle(ctx, [...FISH_TOKENS]);
      if (scenarioOf(ctx) === 'caravans') {
        // Three caravans leave from every other corner of the oasis.
        const oasis = Object.values(ctx.state.hexes).find((h) => h.type === 'oasis');
        const corners = oasis ? (ctx.geometry.hexCorners.get(oasis.id) ?? []) : [];
        d.caravans = [0, 2, 4]
          .map((i) => corners[i])
          .filter((c): c is CornerId => !!c)
          .map((c) => ({ corners: [c], ended: false }));
      }
    },
    turnStarted(ctx) {
      tbData(ctx).goldBuys = 0;
      // A new round: vote on a camel if anyone built a settlement or city.
      if (scenarioOf(ctx) === 'caravans' && ctx.state.turn.player === 0) startCamelVote(ctx);
    },
    piecePlaced(ctx, piece, previous) {
      if (
        scenarioOf(ctx) === 'caravans' &&
        piece.owner !== null &&
        previous === null &&
        (piece.type === 'settlement' || piece.type === 'city') &&
        ctx.state.phase.id !== 'setup'
      )
        tbData(ctx).builtThisRound = true;
      if (scenarioOf(ctx) !== 'rivers' || piece.owner === null || previous !== null) return;
      if (piece.type === 'bridge') return earnGold(ctx, piece.owner, 3, 'bridge');
      if (piece.type === 'road') {
        const edge = (piece.at as { id: EdgeId }).id;
        const near = riverCorners(ctx);
        if ((ctx.geometry.edgeCorners.get(edge) ?? []).some((c) => near.has(c)))
          earnGold(ctx, piece.owner, 1, 'road');
        return;
      }
      if (piece.type === 'settlement' && riverCorners(ctx).has(cornerOf(piece)))
        earnGold(ctx, piece.owner, 1, 'settlement');
    },
  },
  reducers: {
    vp(ctx, seat, value) {
      let v = value;
      if (tbData(ctx).boot === seat) v -= 1;
      const g = goldStanding(ctx);
      if (g.richest === seat) v += 1;
      if (g.poorest.includes(seat)) v -= 2;
      if (scenarioOf(ctx) === 'caravans') v += camelBonus(ctx, seat);
      return v;
    },
    vpTarget(ctx, value) {
      return scenarioOf(ctx) === 'caravans' ? value + 2 : value;
    },
    routeWeight(ctx, piece, value) {
      if (piece.type !== 'road' || scenarioOf(ctx) !== 'caravans') return value;
      return camelEdges(ctx).has((piece.at as { id: EdgeId }).id) ? value * 2 : value;
    },
  },
  redact(data, viewer) {
    const d = data as TbData;
    const fish = Object.fromEntries(
      Object.entries(d.fish).map(([seat, t]) => [
        seat,
        Number(seat) === viewer ? t : t.map(() => 0),
      ]),
    );
    // The pile keeps its size; its faces are hidden (1s, so look-ahead never finds the boot).
    return { ...d, pile: d.pile.map(() => 1), spent: [], fish };
  },
};
