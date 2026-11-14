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
 * - **barbarians**: barbarians land on the coast each time someone builds a
 *   settlement or city. Three on a hex conquer it. Knight cards put knights
 *   on the paths by the castle in the middle; knights move along the paths
 *   and beat barbarians at the end of their owner's turn, for prisoners
 *   (2 prisoners are worth a point) and gold.
 *
 * List it before the options module, so out-of-turn building covers bridges.
 */
export const MODULE_ID = 'traders-barbarians';
export type TbScenario = 'fishermen' | 'rivers' | 'caravans' | 'barbarians' | 'traders';

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
export const KNIGHTS_PER_PLAYER = 6;
/** Barbarians it takes to conquer a hex. */
export const CONQUER_AT = 3;
/** Steps a knight can move, and how far with 1 grain. */
export const KNIGHT_STEPS = 3;
export const KNIGHT_STEPS_GRAIN = 5;
/** Gold for each knight lost in a fight, and for a fighter who gets no prisoner. */
export const FIGHT_GOLD = 3;

export interface TbKnight {
  id: string;
  owner: number;
  edge: EdgeId;
}

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
  /** Barbarians on each coastal hex. */
  barbarians: Record<string, number>;
  /** Knights on the paths. */
  knights: TbKnight[];
  nextKnight: number;
  /** Knights that moved this turn. */
  moved: string[];
  /** Barbarians each player has captured. */
  prisoners: Record<number, number>;
  /** A building went up during this action, so barbarians land after it. */
  landing: boolean;
  /** Each player's wagon (main scenario). */
  wagons?: Record<number, TbWagon>;
  /** Commodity stacks by trade hex, face down. */
  stacks?: Record<string, Commodity[]>;
  /** Barbarians on paths (main scenario). */
  edgeBarbarians?: EdgeId[];
  /** Barbarians a wagon tried to drive off this turn. */
  tried?: EdgeId[];
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
    barbarians: {},
    knights: [],
    nextKnight: 0,
    moved: [],
    prisoners: {},
    landing: false,
  } satisfies TbData;
  const d = ctx.state.data[MODULE_ID] as TbData;
  // Games saved before Barbarian Attack lack these.
  d.barbarians ??= {};
  d.knights ??= [];
  d.moved ??= [];
  d.prisoners ??= {};
  return d;
}

export function scenarioOf(ctx: Ctx): TbScenario | null {
  const s = ctx.setting<string>('tbScenario');
  return s === 'fishermen' ||
    s === 'rivers' ||
    s === 'caravans' ||
    s === 'barbarians' ||
    s === 'traders'
    ? s
    : null;
}

function shuffle<T>(ctx: Ctx, list: T[]): T[] {
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

/** Scenarios that pay gold. */
export function hasGold(ctx: Ctx): boolean {
  const s = scenarioOf(ctx);
  return s === 'rivers' || s === 'barbarians' || s === 'traders';
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

/** Gold for one resource: 2, unless another expansion prices it (Investors & Speculators' market). */
export function goldPrice(ctx: Ctx, seat: number, resource: string): number {
  return (
    ctx.reduce('cost', `goldBuy:${resource}`, seat, { gold: GOLD_PER_RESOURCE }).gold ??
    GOLD_PER_RESOURCE
  );
}

const buyWithGold: ActionDef = {
  phases: ['main'],
  check(ctx, a) {
    if (!hasGold(ctx)) return 'There is no gold in this game';
    if (a.player !== ctx.active) return 'Not your turn';
    if (tbData(ctx).goldBuys >= GOLD_BUYS_PER_TURN)
      return `You can buy with gold ${GOLD_BUYS_PER_TURN} times a turn`;
    const r = a.resource as string;
    if (!(RESOURCES as readonly string[]).includes(r)) return 'Pick a resource';
    const price = goldPrice(ctx, a.player, r);
    if (goldOf(ctx, a.player) < price) return `You need ${price} gold`;
    return ctx.bankHas({ [r]: 1 }) ? null : 'The bank has none left';
  },
  apply(ctx, a) {
    const d = tbData(ctx);
    const price = goldPrice(ctx, a.player, a.resource as string);
    d.gold[a.player] = goldOf(ctx, a.player) - price;
    d.goldBuys += 1;
    ctx.grant(a.player, { [a.resource as string]: 1 });
    ctx.emit({
      type: 'goldSpent',
      player: a.player,
      gold: price,
      resource: a.resource,
    });
  },
  enumerate(ctx, player) {
    if (!hasGold(ctx) || player !== ctx.active) return [];
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

// ---- Barbarian Attack ----

export function castleHex(ctx: Ctx): HexId | null {
  return Object.values(ctx.state.hexes).find((h) => h.type === 'castle')?.id ?? null;
}

export function barbariansOn(ctx: Ctx, hex: HexId): number {
  return tbData(ctx).barbarians[hex] ?? 0;
}

export function isConquered(ctx: Ctx, hex: HexId): boolean {
  return barbariansOn(ctx, hex) >= CONQUER_AT;
}

/** Land hexes on the coast, where barbarians land. */
export function coastalHexes(ctx: Ctx): HexId[] {
  return ctx.geometry.hexes.filter((h) => {
    if (!ctx.isLand(h) || ctx.state.hexes[h]?.type === 'castle') return false;
    const around = ctx.geometry.hexNeighbours.get(h) ?? [];
    return around.length < 6 || around.some((n) => !ctx.isLand(n));
  });
}

/** A building that touches only conquered land: no points, no harbor. */
export function buildingConquered(ctx: Ctx, corner: CornerId): boolean {
  const land = (ctx.geometry.cornerHexes.get(corner) ?? []).filter((h) => ctx.isLand(h));
  return land.length > 0 && land.every((h) => isConquered(ctx, h));
}

function touchesConquered(ctx: Ctx, hexes: readonly HexId[] | undefined): boolean {
  return (hexes ?? []).some((h) => isConquered(ctx, h));
}

export function knightsOf(ctx: Ctx, seat: number): TbKnight[] {
  return tbData(ctx).knights.filter((k) => k.owner === seat);
}

export function prisonersOf(ctx: Ctx, seat: number): number {
  return tbData(ctx).prisoners[seat] ?? 0;
}

/** Free paths that lead away from the castle: where new knights start. */
export function knightStartEdges(ctx: Ctx): EdgeId[] {
  const castle = castleHex(ctx);
  if (!castle) return [];
  const own = new Set(ctx.geometry.hexEdges.get(castle) ?? []);
  const taken = new Set(tbData(ctx).knights.map((k) => k.edge));
  const out = new Set<EdgeId>();
  for (const c of ctx.geometry.hexCorners.get(castle) ?? [])
    for (const e of ctx.geometry.cornerEdges.get(c) ?? [])
      if (!own.has(e) && !taken.has(e) && ctx.isLandEdge(e)) out.add(e);
  return [...out].sort();
}

/**
 * Where a knight can go and how many steps it takes, up to the most a knight
 * can ever move. Knights pass anything, but stop only on a free path that is
 * not one of the castle's own sides.
 */
export function knightMoves(ctx: Ctx, knight: TbKnight): Map<EdgeId, number> {
  const castle = castleHex(ctx);
  const castleEdges = new Set(castle ? (ctx.geometry.hexEdges.get(castle) ?? []) : []);
  const taken = new Set(tbData(ctx).knights.map((k) => k.edge));
  const dist = new Map<EdgeId, number>([[knight.edge, 0]]);
  let frontier: EdgeId[] = [knight.edge];
  for (let step = 1; step <= KNIGHT_STEPS_GRAIN; step++) {
    const next: EdgeId[] = [];
    for (const e of frontier)
      for (const c of ctx.geometry.edgeCorners.get(e) ?? [])
        for (const n of ctx.geometry.cornerEdges.get(c) ?? []) {
          if (dist.has(n) || !ctx.isLandEdge(n)) continue;
          dist.set(n, step);
          next.push(n);
        }
    frontier = next;
  }
  const out = new Map<EdgeId, number>();
  for (const [e, n] of dist) if (n > 0 && !taken.has(e) && !castleEdges.has(e)) out.set(e, n);
  return out;
}

/** Rolls up to three different numbers (never 7); a barbarian lands on each coastal hex showing one. */
function landBarbarians(ctx: Ctx): void {
  const d = tbData(ctx);
  const numbers: number[] = [];
  for (let tries = 0; numbers.length < 3 && tries < 100; tries++) {
    const n = ctx.rng.int(1, 6) + ctx.rng.int(1, 6);
    if (n !== 7 && !numbers.includes(n)) numbers.push(n);
  }
  const hexes: HexId[] = [];
  for (const n of numbers)
    for (const h of coastalHexes(ctx)) {
      if (ctx.state.hexes[h]?.token !== n || isConquered(ctx, h)) continue;
      d.barbarians[h] = barbariansOn(ctx, h) + 1;
      hexes.push(h);
    }
  ctx.emit({
    type: 'barbariansLanded',
    numbers,
    hexes,
    conquered: hexes.filter((h) => isConquered(ctx, h)),
  });
}

function dieSide(die: number): 'NE' | 'E' | 'SE' {
  if (die === 1 || die === 6) return 'NE';
  return die === 2 || die === 5 ? 'E' : 'SE';
}

/**
 * Knights beat the barbarians on a hex when they outnumber them. Each
 * fighter takes a prisoner while they last (the most knights takes the rest),
 * and a fighter left without one gets gold. Then a die picks one direction of
 * path: knights on those paths of the hex are lost, for gold.
 */
function fightBarbarians(ctx: Ctx): void {
  const d = tbData(ctx);
  for (const hex of Object.keys(d.barbarians).sort() as HexId[]) {
    const n = d.barbarians[hex] ?? 0;
    if (n <= 0) continue;
    const edges = new Set(ctx.geometry.hexEdges.get(hex) ?? []);
    const here = d.knights.filter((k) => edges.has(k.edge));
    if (here.length <= n) continue;
    delete d.barbarians[hex];
    const count = new Map<number, number>();
    for (const k of here) count.set(k.owner, (count.get(k.owner) ?? 0) + 1);
    const fighters = [...count.keys()].sort((a, b) => a - b);
    const got: Record<number, number> = {};
    const gold: Record<number, number> = {};
    const addGold = (seat: number, g: number) => (gold[seat] = (gold[seat] ?? 0) + g);
    if (fighters.length === 1) got[fighters[0]!] = n;
    else if (n >= fighters.length) {
      for (const p of fighters) got[p] = 1;
      const rest = n - fighters.length;
      if (rest > 0) {
        const most = Math.max(...count.values());
        const top = fighters.filter((p) => count.get(p) === most);
        const winner = top[ctx.rng.int(0, top.length - 1)]!;
        got[winner] = (got[winner] ?? 0) + rest;
        for (const p of top) if (p !== winner) addGold(p, FIGHT_GOLD);
      }
    } else {
      shuffle(ctx, [...fighters]).forEach((p, i) => {
        if (i < n) got[p] = 1;
        else addGold(p, FIGHT_GOLD);
      });
    }
    const die = ctx.rng.int(1, 6);
    const side = dieSide(die);
    const lost = here.filter((k) => k.edge.endsWith(`,${side}`));
    for (const k of lost) addGold(k.owner, FIGHT_GOLD);
    d.knights = d.knights.filter((k) => !lost.includes(k));
    for (const [seat, p] of Object.entries(got))
      d.prisoners[Number(seat)] = prisonersOf(ctx, Number(seat)) + p;
    ctx.emit({
      type: 'barbariansDefeated',
      hex,
      prisoners: got,
      die,
      lost: lost.map((k) => k.owner),
    });
    for (const [seat, g] of Object.entries(gold)) earnGold(ctx, Number(seat), g, 'fight');
  }
}

interface TbKnightPhase extends Phase {
  id: 'tbKnight';
  returnTo: string;
}

const placeTbKnight: ActionDef = {
  phases: ['tbKnight'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    return knightStartEdges(ctx).includes(a.edge as EdgeId)
      ? null
      : 'New knights start on a free path leading away from the castle';
  },
  apply(ctx, a) {
    const d = tbData(ctx);
    const knight: TbKnight = { id: `k${d.nextKnight++}`, owner: a.player, edge: a.edge as EdgeId };
    d.knights.push(knight);
    ctx.emit({ type: 'tbKnightPlaced', player: a.player, edge: a.edge });
    ctx.setPhase({ id: (ctx.state.phase as TbKnightPhase).returnTo });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return knightStartEdges(ctx).map((edge) => ({ type: 'placeTbKnight', player, edge }));
  },
};

const moveTbKnight: ActionDef = {
  phases: ['main'],
  check(ctx, a) {
    if (scenarioOf(ctx) !== 'barbarians') return 'There are no knights in this game';
    if (a.player !== ctx.active) return 'Not your turn';
    const d = tbData(ctx);
    const knight = d.knights.find((k) => k.id === a.knight);
    if (!knight || knight.owner !== a.player) return 'Pick one of your knights';
    if (d.moved.includes(knight.id)) return 'That knight already moved this turn';
    const steps = knightMoves(ctx, knight).get(a.to as EdgeId);
    if (steps === undefined) return 'A knight can not go there';
    if (steps > KNIGHT_STEPS && !ctx.has(a.player, { grain: 1 }))
      return `Going more than ${KNIGHT_STEPS} steps costs 1 grain`;
    return null;
  },
  apply(ctx, a) {
    const d = tbData(ctx);
    const knight = d.knights.find((k) => k.id === a.knight)!;
    const steps = knightMoves(ctx, knight).get(a.to as EdgeId)!;
    if (steps > KNIGHT_STEPS) ctx.pay(a.player, { grain: 1 });
    ctx.emit({ type: 'tbKnightMoved', player: a.player, from: knight.edge, to: a.to, steps });
    knight.edge = a.to as EdgeId;
    d.moved.push(knight.id);
  },
  enumerate(ctx, player) {
    if (scenarioOf(ctx) !== 'barbarians' || player !== ctx.active) return [];
    const d = tbData(ctx);
    const out: Action[] = [];
    for (const k of knightsOf(ctx, player)) {
      if (d.moved.includes(k.id)) continue;
      for (const to of knightMoves(ctx, k).keys())
        out.push({ type: 'moveTbKnight', player, knight: k.id, to });
    }
    return out;
  },
};

/** Builds next to a conquered hex are not allowed. */
const notOnConquered =
  (where: 'edge' | 'corner') =>
  (prev: ActionDef): ActionDef => ({
    ...prev,
    check(ctx, a) {
      const err = prev.check(ctx, a);
      if (err) return err;
      if (scenarioOf(ctx) === 'traders' && where === 'edge')
        return edgeBarbarians(ctx).includes(a.edge as EdgeId)
          ? 'A barbarian blocks that path'
          : null;
      if (scenarioOf(ctx) !== 'barbarians') return err;
      const hexes =
        where === 'edge'
          ? ctx.geometry.edgeHexes.get(a.edge as EdgeId)
          : ctx.geometry.cornerHexes.get(a.corner as CornerId);
      return touchesConquered(ctx, hexes) ? 'Barbarians hold that land' : null;
    },
  });

/** Points lost for buildings on conquered land. */
function conqueredVp(ctx: Ctx, seat: number): number {
  let lost = 0;
  for (const p of ctx.piecesOf(seat)) {
    const def = ctx.registry.pieceTypes[p.type];
    if (!def?.building || p.at.kind !== 'corner') continue;
    if (buildingConquered(ctx, cornerOf(p))) lost += def.vp ?? 0;
  }
  return lost;
}

// ---- Traders & Barbarians (the main scenario) ----

export type Commodity = 'glass' | 'marble' | 'sand' | 'tools';
export type TradeHex = 'castle' | 'quarry' | 'glassworks';
export const TRADE_HEXES: readonly TradeHex[] = ['castle', 'quarry', 'glassworks'];
/** Where each commodity is delivered. */
export const COMMODITY_TO: Record<Commodity, TradeHex> = {
  glass: 'castle',
  marble: 'castle',
  tools: 'quarry',
  sand: 'glassworks',
};
/** The face-down stack beside each trade hex: 12 tokens, none bound for the hex itself. */
export const COMMODITY_STACKS: Record<TradeHex, Commodity[]> = {
  quarry: [...Array<Commodity>(6).fill('marble'), ...Array<Commodity>(6).fill('sand')],
  glassworks: [...Array<Commodity>(6).fill('glass'), ...Array<Commodity>(6).fill('tools')],
  castle: [...Array<Commodity>(6).fill('tools'), ...Array<Commodity>(6).fill('sand')],
};
/** Wagon levels 1 to 5: moves per turn, gold per delivery, the die it takes to drive off a barbarian, and the upgrade cost. */
export const WAGON_LEVELS: readonly {
  mp: number;
  gold: number;
  drive: number | null;
  cost: Record<string, number>;
}[] = [
  { mp: 4, gold: 1, drive: null, cost: {} },
  { mp: 5, gold: 2, drive: 6, cost: { lumber: 1, wool: 1, ore: 1 } },
  { mp: 6, gold: 3, drive: 5, cost: { lumber: 1, wool: 1, ore: 1, grain: 1 } },
  { mp: 7, gold: 4, drive: 4, cost: { lumber: 1, wool: 2, ore: 2 } },
  { mp: 8, gold: 5, drive: 3, cost: { lumber: 2, wool: 2, ore: 2 } },
];
export const EDGE_BARBARIANS = 3;
export const STARTING_GOLD = 5;
/** The scenario's own 25 development cards. */
export const TRADERS_DEV_DECK: Record<string, number> = {
  knight: 16,
  roadBuilding: 3,
  swiftJourney: 3,
  victoryPoint: 3,
};

export interface TbWagon {
  corner: CornerId | null;
  /** 1 to 5. */
  level: number;
  /** The commodity on board, or none before the first trade hex. */
  cargo: Commodity | null;
  delivered: number;
  /** Moves left this turn. */
  mp: number;
  /** Paid grain for 2 more moves this turn. */
  boosted: boolean;
}

export function wagonOf(ctx: Ctx, seat: number): TbWagon {
  const d = tbData(ctx);
  d.wagons ??= {};
  return (d.wagons[seat] ??= {
    corner: null,
    level: 1,
    cargo: null,
    delivered: 0,
    mp: 0,
    boosted: false,
  });
}

export function edgeBarbarians(ctx: Ctx): EdgeId[] {
  return (tbData(ctx).edgeBarbarians ??= []);
}

/** The trade hex a corner touches, if any. */
export function tradeHexAt(ctx: Ctx, corner: CornerId): TradeHex | null {
  for (const h of ctx.geometry.cornerHexes.get(corner) ?? []) {
    const t = ctx.state.hexes[h]?.type;
    if (t && (TRADE_HEXES as readonly string[]).includes(t)) return t as TradeHex;
  }
  return null;
}

/** What one step along a path costs: moves, and gold to the road's owner. */
export function wagonStep(
  ctx: Ctx,
  seat: number,
  edge: EdgeId,
): { mp: number; toll: number; owner: number | null } {
  const road = ctx
    .piecesAt({ kind: 'edge', id: edge })
    .find((p) => p.owner !== null && ctx.registry.pieceTypes[p.type]?.route === 'land');
  let mp = road ? 1 : 2;
  if (edgeBarbarians(ctx).includes(edge)) mp += 2;
  const theirs = !!road && road.owner !== seat;
  return { mp, toll: theirs ? 1 : 0, owner: theirs ? road.owner : null };
}

function drawCommodity(ctx: Ctx, from: TradeHex): Commodity | null {
  const d = tbData(ctx);
  return ((d.stacks ??= {})[from] ?? []).shift() ?? null;
}

/** The wagon reached a corner: pick up at a trade hex, or deliver there. */
function wagonArrives(ctx: Ctx, seat: number): void {
  const w = wagonOf(ctx, seat);
  const at = w.corner ? tradeHexAt(ctx, w.corner) : null;
  if (!at) return;
  if (w.cargo === null) {
    w.cargo = drawCommodity(ctx, at);
    if (w.cargo) {
      ctx.emit({ type: 'commodityLoaded', player: seat, at, commodity: w.cargo });
      w.mp = 0;
    }
    return;
  }
  if (COMMODITY_TO[w.cargo] !== at) return;
  const gold = WAGON_LEVELS[w.level - 1]!.gold;
  w.delivered += 1;
  ctx.emit({ type: 'commodityDelivered', player: seat, at, commodity: w.cargo, gold });
  earnGold(ctx, seat, gold, 'delivery');
  w.cargo = drawCommodity(ctx, at);
  if (w.cargo) ctx.emit({ type: 'commodityLoaded', player: seat, at, commodity: w.cargo });
  w.mp = 0;
}

const tradersOnly = (ctx: Ctx, a: Action): string | null => {
  if (scenarioOf(ctx) !== 'traders') return 'There are no wagons in this game';
  return a.player === ctx.active ? null : 'Not your turn';
};

const moveWagon: ActionDef = {
  phases: ['main'],
  check(ctx, a) {
    const err = tradersOnly(ctx, a);
    if (err) return err;
    const w = wagonOf(ctx, a.player);
    if (!w.corner) return 'Your wagon is not on the board';
    const edge = (ctx.geometry.cornerEdges.get(w.corner) ?? []).find((e) =>
      ctx.geometry.edgeCorners.get(e)?.includes(a.corner as CornerId),
    );
    if (!edge || !ctx.isLandEdge(edge)) return 'Wagons move one path at a time, over land';
    const step = wagonStep(ctx, a.player, edge);
    if (step.mp > w.mp) return `That path takes ${step.mp} moves; you have ${w.mp}`;
    if (step.toll > goldOf(ctx, a.player)) return 'You need 1 gold for the toll';
    return null;
  },
  apply(ctx, a) {
    const w = wagonOf(ctx, a.player);
    const from = w.corner as CornerId;
    const edge = (ctx.geometry.cornerEdges.get(from) ?? []).find((e) =>
      ctx.geometry.edgeCorners.get(e)?.includes(a.corner as CornerId),
    ) as EdgeId;
    const step = wagonStep(ctx, a.player, edge);
    w.mp -= step.mp;
    w.corner = a.corner as CornerId;
    if (step.toll && step.owner !== null) {
      const d = tbData(ctx);
      d.gold[a.player] = goldOf(ctx, a.player) - step.toll;
      d.gold[step.owner] = goldOf(ctx, step.owner) + step.toll;
    }
    ctx.emit({
      type: 'wagonMoved',
      player: a.player,
      from,
      to: a.corner,
      ...(step.owner !== null && { tollTo: step.owner }),
    });
    wagonArrives(ctx, a.player);
  },
  enumerate(ctx, player) {
    if (scenarioOf(ctx) !== 'traders' || player !== ctx.active) return [];
    const w = wagonOf(ctx, player);
    if (!w.corner || w.mp <= 0) return [];
    return (ctx.geometry.cornerNeighbours.get(w.corner) ?? []).map((corner) => ({
      type: 'moveWagon',
      player,
      corner,
    }));
  },
};

const boostWagon: ActionDef = {
  phases: ['main'],
  check(ctx, a) {
    const err = tradersOnly(ctx, a);
    if (err) return err;
    if (wagonOf(ctx, a.player).boosted) return 'Only once a turn';
    return ctx.has(a.player, { grain: 1 }) ? null : 'You need 1 grain';
  },
  apply(ctx, a) {
    const w = wagonOf(ctx, a.player);
    ctx.pay(a.player, { grain: 1 });
    w.mp += 2;
    w.boosted = true;
    ctx.emit({ type: 'wagonBoost', player: a.player });
  },
  enumerate: (ctx, player) =>
    scenarioOf(ctx) === 'traders' && player === ctx.active ? [{ type: 'boostWagon', player }] : [],
};

const upgradeWagon: ActionDef = {
  phases: ['main'],
  check(ctx, a) {
    const err = tradersOnly(ctx, a);
    if (err) return err;
    const w = wagonOf(ctx, a.player);
    if (w.level >= WAGON_LEVELS.length) return 'Your wagon is fully upgraded';
    return ctx.has(a.player, WAGON_LEVELS[w.level]!.cost) ? null : 'You can not afford the upgrade';
  },
  apply(ctx, a) {
    const w = wagonOf(ctx, a.player);
    const next = WAGON_LEVELS[w.level]!;
    ctx.pay(a.player, next.cost);
    // The extra moves count from this turn.
    w.mp += next.mp - WAGON_LEVELS[w.level - 1]!.mp;
    w.level += 1;
    ctx.emit({ type: 'wagonUpgraded', player: a.player, level: w.level });
  },
  enumerate: (ctx, player) =>
    scenarioOf(ctx) === 'traders' && player === ctx.active
      ? [{ type: 'upgradeWagon', player }]
      : [],
};

const driveBarbarian: ActionDef = {
  phases: ['main'],
  check(ctx, a) {
    const err = tradersOnly(ctx, a);
    if (err) return err;
    const w = wagonOf(ctx, a.player);
    const edge = a.edge as EdgeId;
    if (!edgeBarbarians(ctx).includes(edge)) return 'There is no barbarian there';
    if (!w.corner || !ctx.geometry.edgeCorners.get(edge)?.includes(w.corner))
      return 'Your wagon must stand next to the barbarian';
    if (w.level < 2) return 'Upgrade your wagon first';
    return (tbData(ctx).tried ?? []).includes(edge)
      ? 'You already tried that barbarian this turn'
      : null;
  },
  apply(ctx, a) {
    const d = tbData(ctx);
    const edge = a.edge as EdgeId;
    (d.tried ??= []).push(edge);
    const need = WAGON_LEVELS[wagonOf(ctx, a.player).level - 1]!.drive as number;
    const die = ctx.rng.int(1, 6);
    const won = die >= need;
    ctx.emit({ type: 'barbarianChallenged', player: a.player, edge, die, need, won });
    if (won)
      ctx.setPhase({
        id: 'tbBarbarian',
        returnTo: 'main',
        from: edge,
        steal: false,
      } satisfies TbBarbarianPhase);
  },
  enumerate(ctx, player) {
    if (scenarioOf(ctx) !== 'traders' || player !== ctx.active) return [];
    const at = wagonOf(ctx, player).corner;
    if (!at) return [];
    return edgeBarbarians(ctx)
      .filter((e) => ctx.geometry.edgeCorners.get(e)?.includes(at))
      .map((edge) => ({ type: 'driveBarbarian', player, edge }));
  },
};

interface TbBarbarianPhase extends Phase {
  id: 'tbBarbarian';
  returnTo: string;
  /** The barbarian that must move (one just driven off), or any. */
  from: EdgeId | null;
  /** On a 7 or a Knight card, landing on a road takes a card from its owner. */
  steal: boolean;
}

/** Paths a barbarian may move to. */
export function barbarianTargets(ctx: Ctx): EdgeId[] {
  const taken = new Set(edgeBarbarians(ctx));
  return ctx.geometry.edges.filter(
    (e) =>
      !taken.has(e) &&
      (ctx.geometry.edgeHexes.get(e) ?? []).filter((h) => ctx.isLand(h)).length === 2,
  );
}

const moveEdgeBarbarian: ActionDef = {
  phases: ['tbBarbarian'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    const ph = ctx.state.phase as TbBarbarianPhase;
    const from = a.from as EdgeId;
    if (!edgeBarbarians(ctx).includes(from)) return 'Pick a barbarian';
    if (ph.from && from !== ph.from) return 'Move the barbarian you drove off';
    return barbarianTargets(ctx).includes(a.edge as EdgeId)
      ? null
      : 'Barbarians move to a free inland path';
  },
  apply(ctx, a) {
    const ph = ctx.state.phase as TbBarbarianPhase;
    const d = tbData(ctx);
    d.edgeBarbarians = edgeBarbarians(ctx).map((e) => (e === a.from ? (a.edge as EdgeId) : e));
    ctx.emit({ type: 'edgeBarbarianMoved', player: a.player, from: a.from, to: a.edge });
    if (ph.steal) {
      const road = ctx
        .piecesAt({ kind: 'edge', id: a.edge as EdgeId })
        .find((p) => p.type === 'road' && p.owner !== null && p.owner !== a.player);
      if (road && ctx.handSize(road.owner as number, false) > 0)
        stealFrom(ctx, a.player, road.owner as number);
    }
    ctx.setPhase({ id: ph.returnTo });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    const ph = ctx.state.phase as TbBarbarianPhase;
    const froms = ph.from ? [ph.from] : edgeBarbarians(ctx);
    const to = barbarianTargets(ctx);
    return froms.flatMap((from) =>
      to.map((edge) => ({ type: 'moveEdgeBarbarian', player, from, edge })),
    );
  },
};

/** Places the starting barbarians on inland paths, apart from each other. */
function placeStartBarbarians(ctx: Ctx): void {
  const d = tbData(ctx);
  const free = barbarianTargets(ctx).filter(
    (e) =>
      !(ctx.geometry.edgeHexes.get(e) ?? []).some((h) =>
        (TRADE_HEXES as readonly string[]).includes(ctx.state.hexes[h]?.type ?? ''),
      ),
  );
  const order = shuffle(
    ctx,
    free.map((_, i) => i),
  ).map((i) => free[i]!);
  const picked: EdgeId[] = [];
  const near = (a: EdgeId, b: EdgeId) => {
    const ca = new Set(ctx.geometry.edgeCorners.get(a));
    return (ctx.geometry.edgeCorners.get(b) ?? []).some((c) =>
      (ctx.geometry.cornerNeighbours.get(c) ?? []).some((n) => ca.has(n) || ca.has(c)),
    );
  };
  for (const e of order) {
    if (picked.length >= EDGE_BARBARIANS) break;
    if (picked.some((p) => near(p, e))) continue;
    picked.push(e);
  }
  d.edgeBarbarians = picked;
}

function playableDev(ctx: Ctx, seat: number, card: string): number {
  return (ctx.player(seat).held.dev ?? []).findIndex(
    (h) => h.card === card && h.acquiredTurn < ctx.state.turn.number,
  );
}

/** Swift Journey: the wagon gets its moves again this turn. */
function checkSwiftJourney(ctx: Ctx, a: Action): string | null {
  if (scenarioOf(ctx) !== 'traders') return 'That card can not be played';
  if (a.player !== ctx.active) return 'Not your turn';
  if (ctx.state.phase.id !== 'main') return 'Roll first';
  const pd = ctx.player(a.player).data as { devPlayedTurn?: number };
  if (pd.devPlayedTurn === ctx.state.turn.number)
    return 'You already played a development card this turn';
  return playableDev(ctx, a.player, 'swiftJourney') >= 0
    ? null
    : 'You have no playable card of that kind';
}

function applySwiftJourney(ctx: Ctx, a: Action): void {
  const p = ctx.player(a.player);
  (p.held.dev ?? []).splice(playableDev(ctx, a.player, 'swiftJourney'), 1);
  p.played.swiftJourney = (p.played.swiftJourney ?? 0) + 1;
  (p.data as { devPlayedTurn?: number }).devPlayedTurn = ctx.state.turn.number;
  const w = wagonOf(ctx, a.player);
  w.mp += WAGON_LEVELS[w.level - 1]!.mp;
  ctx.emit({ type: 'playedDevCard', player: a.player, card: 'swiftJourney' });
}

/** Points from the wagon: one per delivery, and one for a fully upgraded wagon. */
function wagonVp(ctx: Ctx, seat: number): number {
  const w = tbData(ctx).wagons?.[seat];
  if (!w) return 0;
  return w.delivered + (w.level >= WAGON_LEVELS.length ? 1 : 0);
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
    castle: { terrain: 'land', robber: false },
    quarry: { terrain: 'land', robber: false },
    glassworks: { terrain: 'land', robber: false },
    shoal: { terrain: 'sea', robber: false },
    fishingLake: { terrain: 'land' },
    swamp: { terrain: 'land' },
  },
  pieceTypes: {
    river: { on: 'edge' },
    bridge: { on: 'edge', perPlayer: () => BRIDGES_PER_PLAYER, route: 'land' },
  },
  costs: { bridge: { brick: 2, lumber: 1 } },
  actions: {
    spendFish,
    passBoot,
    buildBridge,
    buyWithGold,
    camelBid,
    placeTbKnight,
    moveTbKnight,
    moveWagon,
    boostWagon,
    upgradeWagon,
    driveBarbarian,
    moveEdgeBarbarian,
  },
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
        // Against the barbarians, and for traders, the second one starts as a city.
        if ((scenarioOf(ctx) === 'barbarians' || scenarioOf(ctx) === 'traders') && second) {
          const b = ctx.buildingAt(a.corner as CornerId);
          if (b?.type === 'settlement') ctx.upgrade(b, 'city');
          // The trader's wagon sets out from that city.
          if (scenarioOf(ctx) === 'traders') wagonOf(ctx, a.player).corner = a.corner as CornerId;
        }
      },
    }),
    playDevCard: (prev): ActionDef => ({
      ...prev,
      check(ctx, a) {
        if (a.card === 'swiftJourney') return checkSwiftJourney(ctx, a);
        const err = prev.check(ctx, a);
        if (err || a.card !== 'knight' || scenarioOf(ctx) !== 'barbarians') return err;
        if (knightsOf(ctx, a.player).length >= KNIGHTS_PER_PLAYER)
          return 'All your knights are out';
        return knightStartEdges(ctx).length ? null : 'There is no free path by the castle';
      },
      apply(ctx, a) {
        if (a.card === 'swiftJourney') return applySwiftJourney(ctx, a);
        const returnTo = ctx.state.phase.id;
        prev.apply(ctx, a);
        // A Knight card sends a knight out from the castle instead of moving the robber.
        if (a.card === 'knight' && scenarioOf(ctx) === 'barbarians')
          ctx.setPhase({ id: 'tbKnight', returnTo } satisfies TbKnightPhase);
      },
      enumerate(ctx, player) {
        const out = prev.enumerate?.(ctx, player) ?? [];
        if (scenarioOf(ctx) === 'traders' && player === ctx.active)
          out.push({ type: 'playDevCard', player, card: 'swiftJourney' });
        return out;
      },
    }),
    endTurn: (prev): ActionDef => ({
      ...prev,
      apply(ctx, a) {
        if (scenarioOf(ctx) === 'barbarians') fightBarbarians(ctx);
        prev.apply(ctx, a);
      },
    }),
    buildRoad: notOnConquered('edge'),
    placeFreeRoad: notOnConquered('edge'),
    buildSettlement: notOnConquered('corner'),
    buildCity: notOnConquered('corner'),
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
      if (scenarioOf(ctx) === 'traders') {
        // No robber and no Longest Road; barbarians wait on the paths instead.
        for (const r of ctx.piecesOfType('robber')) ctx.remove(r);
        ctx.state.settings.longestRoadMin = 99;
        for (const p of ctx.state.players) {
          d.gold[p.seat] = STARTING_GOLD;
          wagonOf(ctx, p.seat);
        }
        d.stacks = Object.fromEntries(
          TRADE_HEXES.map((t) => [t, shuffle(ctx, [...COMMODITY_STACKS[t]])]),
        );
        const deck = Object.entries(TRADERS_DEV_DECK).flatMap(([card, n]) =>
          Array<string>(n).fill(card),
        );
        ctx.state.decks.dev = shuffle(ctx, deck);
        placeStartBarbarians(ctx);
      }
      if (scenarioOf(ctx) === 'barbarians') {
        // No robber and no Largest Army: Knight cards bring knights instead.
        for (const r of ctx.piecesOfType('robber')) ctx.remove(r);
        ctx.state.settings.largestArmyMin = 99;
        // The first barbarians wait on the coast's 2 and 12.
        for (const h of coastalHexes(ctx)) {
          const t = ctx.state.hexes[h]?.token;
          if (t === 2 || t === 12) d.barbarians[h] = 1;
        }
      }
    },
    afterAction(ctx) {
      // On a 7 or a Knight card, a barbarian on the paths moves instead of the robber.
      if (scenarioOf(ctx) === 'traders' && ctx.state.phase.id === 'moveRobber')
        ctx.setPhase({
          id: 'tbBarbarian',
          returnTo: (ctx.state.phase.returnTo as string | undefined) ?? 'main',
          from: null,
          steal: true,
        } satisfies TbBarbarianPhase);
      if (scenarioOf(ctx) !== 'barbarians') return;
      const d = tbData(ctx);
      if (d.landing) {
        d.landing = false;
        landBarbarians(ctx);
      }
      // A 7 still makes big hands discard, but there is no robber to move.
      if (ctx.state.phase.id === 'moveRobber')
        ctx.setPhase({ id: (ctx.state.phase.returnTo as string | undefined) ?? 'main' });
    },
    turnStarted(ctx) {
      tbData(ctx).goldBuys = 0;
      tbData(ctx).moved = [];
      if (scenarioOf(ctx) === 'traders') {
        tbData(ctx).tried = [];
        const w = wagonOf(ctx, ctx.state.turn.player);
        w.mp = WAGON_LEVELS[w.level - 1]!.mp;
        w.boosted = false;
      }
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
      if (
        scenarioOf(ctx) === 'barbarians' &&
        piece.owner !== null &&
        previous === null &&
        (piece.type === 'settlement' || piece.type === 'city') &&
        ctx.state.phase.id !== 'setup'
      )
        tbData(ctx).landing = true;
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
      if (scenarioOf(ctx) === 'barbarians')
        v += Math.floor(prisonersOf(ctx, seat) / 2) - conqueredVp(ctx, seat);
      if (scenarioOf(ctx) === 'traders') v += wagonVp(ctx, seat);
      return v;
    },
    tradeRatio(ctx, seat, card, value) {
      if (scenarioOf(ctx) !== 'barbarians') return value;
      // Harbors only count from buildings the barbarians have not cut off.
      let best = 4;
      for (const h of ctx.state.harbors) {
        if (h.resource !== 'any' && h.resource !== card) continue;
        const corners = ctx.geometry.edgeCorners.get(h.edge) ?? [];
        if (corners.some((c) => ctx.buildingAt(c)?.owner === seat && !buildingConquered(ctx, c)))
          best = Math.min(best, h.ratio);
      }
      return Math.max(value, best);
    },
    hexYield(ctx, hex, _piece, value) {
      return scenarioOf(ctx) === 'barbarians' && isConquered(ctx, hex.id) ? {} : value;
    },
    vpTarget(ctx, value) {
      if (scenarioOf(ctx) === 'traders') return value + 3;
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
    // Commodity stacks are face down: everyone sees only how many are left.
    const stacks = d.stacks
      ? Object.fromEntries(Object.entries(d.stacks).map(([k, v]) => [k, v.map(() => 'sand')]))
      : undefined;
    return {
      ...d,
      pile: d.pile.map(() => 1),
      spent: [],
      fish,
      ...(stacks && { stacks }),
    };
  },
};
