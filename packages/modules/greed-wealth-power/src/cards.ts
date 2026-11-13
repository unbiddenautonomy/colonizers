import type {
  Action,
  ActionDef,
  Cards,
  CornerId,
  Ctx,
  EdgeId,
  HexId,
  HexState,
  Phase,
  Piece,
} from '@colonizers/engine';
import { RESOURCES, robber, stealFrom } from '@colonizers/module-base';
import {
  activeTracks,
  barbarianTrack,
  ckData,
  commoditiesIn,
  drawProgress,
  eventFaces,
  giveProgress,
  hasAbility,
  holdsProgress,
  isActive,
  isAway,
  isKnight,
  knightsOf,
  levels,
  openRoutes,
  progressCount,
  progressHeld,
  spendProgress,
  type Track,
} from '@colonizers/module-cities-knights';
import { MODULE_ID } from './constants.ts';
import { dragonData, dragonGone, landDragon } from './dragon.ts';
import { festivals, stopFestival } from './festival.ts';
import { deedCheck, deedSpots, placeDeed } from './deed.ts';
import { indulgenceTiming, playIndulgence, REROLLS } from './indulgence.ts';

/**
 * Greed, Wealth & Power's new progress cards (besides the neutral pieces and
 * the victory point cards). Each card is a row in CARDS: when it can be
 * played, the choices it offers, and what it does.
 */

const MAIN: Phase = { id: 'main' };

const isResource = (c: string) => (RESOURCES as readonly string[]).includes(c);

export interface CardData extends Record<string, unknown> {
  /** Kontor: other players' harbors a player may use. */
  kontor?: Record<number, { resource: string; ratio: number }[]>;
  /** Trading Post: 1 card back for a harbor settlement or city built this turn. */
  tradingPost?: { seat: number; turn: number; resource: string } | null;
  /** Astrolabe: a Citadel or Diocese for 1 brick this turn. */
  astrolabe?: { seat: number; turn: number } | null;
  /** Will-o'-Wisp: the turn whose production is switched around. */
  wisp?: number | null;
  /** Brickworks and the like: 2-for-1 bank trades for the rest of a turn. */
  exchanges?: { seat: number; turn: number; give: string; get: string }[];
}

export function cardData(ctx: Ctx): CardData {
  return ctx.data<CardData>(MODULE_ID);
}

function others(ctx: Ctx, seat: number): number[] {
  return ctx.state.players.map((p) => p.seat).filter((s) => s !== seat);
}

type Play = Action & {
  card: string;
  target?: number;
  resource?: string;
  option?: string;
  knight?: string;
  face?: string;
};

type When = 'main' | 'roll' | 'beforeOrAfter' | 'discard' | 'indulgence';

interface CardDef {
  deck: Track;
  count: number;
  /** When it can be played: on your turn after rolling (default), before rolling, either, or when a 7 makes you discard. */
  when?: When;
  /** The choices offered (merged into the action). One empty choice if left out. */
  options?(ctx: Ctx, seat: number): Partial<Play>[];
  check?(ctx: Ctx, a: Play): string | null;
  apply(ctx: Ctx, a: Play): void;
}

// ---- Small helpers ----

function pickTarget(ctx: Ctx, a: Play): string | null {
  const t = a.target;
  if (!Number.isInteger(t) || t === a.player || !ctx.state.players[t as number])
    return 'Pick another player';
  return null;
}

function stealEach(ctx: Ctx, seat: number, count: (s: number) => number): void {
  for (const s of others(ctx, seat))
    for (let i = count(s); i > 0 && ctx.handSize(s, false) > 0; i--) stealFrom(ctx, seat, s);
}

/** Who owes what in a `wedding` phase (each gives cards of their choice). */
function askGifts(ctx: Ctx, seat: number, from: number[], reason: string): void {
  const owed: Record<number, number> = {};
  for (const s of from) if (ctx.handSize(s, false) > 0) owed[s] = 1;
  if (Object.keys(owed).length)
    ctx.setPhase({ id: 'wedding', owed, by: seat, reason, returnTo: MAIN });
}

/** Puts a held progress card back under its deck. */
function returnHeld(ctx: Ctx, seat: number, deck: Track, card: string): void {
  const held = ctx.player(seat).held[deck] ?? [];
  const i = held.findIndex((h) => h.card === card);
  if (i < 0) return;
  held.splice(i, 1);
  (ctx.state.decks[deck] ??= []).push(card);
}

function heldIn(ctx: Ctx, seat: number, deck: Track): string[] {
  return (ctx.player(seat).held[deck] ?? []).map((h) => h.card);
}

/** Takes cards from others into a pool the player keeps one of; the rest go under their decks. */
function keepOne(ctx: Ctx, seat: number, pool: { card: string; deck: Track }[]): void {
  if (!pool.length) return;
  if (pool.length === 1) {
    const [only] = pool as [{ card: string; deck: Track }];
    giveProgress(ctx, seat, only.deck, only.card);
    return;
  }
  ctx.setPhase({ id: 'keepProgress', by: seat, pool, returnTo: MAIN });
}

function hexIsHarbor(ctx: Ctx, corner: CornerId): boolean {
  return ctx.state.harbors.some((h) =>
    ((ctx.geometry.edgeCorners.get(h.edge) ?? []) as readonly CornerId[]).includes(corner),
  );
}

function deserts(ctx: Ctx): HexId[] {
  return Object.values(ctx.state.hexes)
    .filter((h) => h.type === 'desert' && !h.hidden)
    .map((h) => h.id);
}

const SHIP_TYPES = ['ship'];

/** Open shipping lanes: a player's ships with an end that leads nowhere. */
function openLanes(ctx: Ctx, seat: number): number {
  return SHIP_TYPES.flatMap((t) => (ctx.registry.pieceTypes[t] ? openRoutes(ctx, t) : [])).filter(
    (p) => p.owner === seat,
  ).length;
}

/** What a player could lose to Summoning: open roads and ships, and inactive knights. */
export function summonTargets(ctx: Ctx, target: number): { edge?: EdgeId; knight?: string }[] {
  const out: { edge?: EdgeId; knight?: string }[] = [];
  for (const t of ['road', ...SHIP_TYPES]) {
    if (!ctx.registry.pieceTypes[t]) continue;
    for (const p of openRoutes(ctx, t))
      if (p.owner === target && p.at.kind === 'edge') out.push({ edge: p.at.id });
  }
  for (const k of knightsOf(ctx, target))
    if (!isActive(k) && !isAway(k)) out.push({ knight: k.id });
  return out;
}

const WISP: Record<string, string> = {
  lumber: 'ore',
  brick: 'grain',
  wool: 'lumber',
  grain: 'wool',
  ore: 'brick',
  // Commodities follow the resource of their terrain.
  paper: 'coin',
  crystal: 'bread',
  cloth: 'paper',
  bread: 'cloth',
  coin: 'crystal',
};

/** Will-o'-Wisp: this turn every hex yields what the next terrain would. */
export function wispYield(ctx: Ctx, _hex: HexState, _piece: Piece, value: Cards): Cards {
  if (cardData(ctx).wisp !== ctx.state.turn.number) return value;
  const out: Cards = {};
  for (const [c, n] of Object.entries(value)) {
    const to = WISP[c] && ctx.registry.cardTypes[WISP[c] as string] ? (WISP[c] as string) : c;
    out[to] = (out[to] ?? 0) + n;
  }
  return out;
}

const EXCHANGES: Record<string, { give: string; get: string }> = {
  brickworks: { give: 'brick', get: 'crystal' },
  leasedLand: { give: 'wool', get: 'cloth' },
  publisher: { give: 'lumber', get: 'paper' },
  coinHouse: { give: 'ore', get: 'coin' },
  bakery: { give: 'grain', get: 'bread' },
  goldExchange: { give: '*', get: 'gold' },
};

/** Brickworks and the like: 2 of a resource for 1 commodity, for the rest of the turn. */
export function exchangeRatio(
  ctx: Ctx,
  seat: number,
  give: string,
  get: string,
  value: number,
): number {
  const turn = ctx.state.turn.number;
  for (const e of cardData(ctx).exchanges ?? []) {
    if (e.seat !== seat || e.turn !== turn || e.get !== get) continue;
    if (e.give === give || (e.give === '*' && isResource(give))) return Math.min(value, 2);
  }
  return value;
}

/** Kontor: another player's harbor counts as yours. */
export function kontorRatio(ctx: Ctx, seat: number, card: string, value: number): number {
  let best = value;
  for (const h of cardData(ctx).kontor?.[seat] ?? [])
    if (h.resource === 'any' || h.resource === card) best = Math.min(best, h.ratio);
  return best;
}

/** Astrolabe: a Citadel or Diocese for 1 brick this turn. */
export function astrolabeCost(ctx: Ctx, item: string, seat: number, value: Cards): Cards {
  const a = cardData(ctx).astrolabe;
  if (!a || a.seat !== seat || a.turn !== ctx.state.turn.number) return value;
  return ['citadel', 'citadelSettlement', 'diocese'].includes(item) ? { brick: 1 } : value;
}

/** Ends Astrolabe and Trading Post once used. */
export function settleCardEffects(ctx: Ctx): void {
  const d = cardData(ctx);
  for (const e of ctx.events) {
    if (
      e.type === 'gwpBuilt' &&
      d.astrolabe?.seat === e.player &&
      (e.building === 'citadel' || e.building === 'diocese')
    )
      d.astrolabe = null;
    const tp = d.tradingPost;
    if (
      e.type === 'built' &&
      tp &&
      tp.seat === e.player &&
      tp.turn === ctx.state.turn.number &&
      (e.piece === 'settlement' || e.piece === 'city') &&
      !e.free &&
      hexIsHarbor(ctx, e.at as CornerId)
    ) {
      d.tradingPost = null;
      if (ctx.bankHas({ [tp.resource]: 1 })) {
        ctx.grant(tp.seat, { [tp.resource]: 1 });
        ctx.emit({ type: 'tradingPost', player: tp.seat, got: { [tp.resource]: 1 } });
      }
    }
  }
}

// ---- The cards ----

const resourceChoices = () => RESOURCES.map((r) => ({ resource: r }));

export const CARDS: Record<string, CardDef> = {
  // ---- Trade ----
  kontor: {
    deck: 'trade',
    count: 3,
    options(ctx, seat) {
      const out: Partial<Play>[] = [];
      const seen = new Set<string>();
      for (const s of others(ctx, seat))
        for (const h of ctx.harborsOf(s)) {
          const key = `${h.resource}:${h.ratio}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ option: key });
        }
      return out;
    },
    check(ctx, a) {
      const [resource, ratio] = String(a.option).split(':');
      const ok = others(ctx, a.player).some((s) =>
        ctx.harborsOf(s).some((h) => h.resource === resource && h.ratio === Number(ratio)),
      );
      if (!ok) return 'Pick another player’s harbor';
      const mine = ctx.reduce('tradeRatio', a.player, resource === 'any' ? 'lumber' : resource!, 4);
      return mine <= Number(ratio) ? 'You already trade that well' : null;
    },
    apply(ctx, a) {
      const [resource, ratio] = String(a.option).split(':') as [string, string];
      const d = cardData(ctx);
      ((d.kontor ??= {})[a.player] ??= []).push({ resource, ratio: Number(ratio) });
    },
  },
  tradingPost: {
    deck: 'trade',
    count: 4,
    options: resourceChoices,
    check: (_ctx, a) => (isResource(a.resource ?? '') ? null : 'Pick a resource'),
    apply(ctx, a) {
      cardData(ctx).tradingPost = {
        seat: a.player,
        turn: ctx.state.turn.number,
        resource: a.resource as string,
      };
    },
  },

  // ---- Politics ----
  brothel: {
    deck: 'politics',
    count: 1,
    options: (ctx, seat) => others(ctx, seat).map((target) => ({ target })),
    check(ctx, a) {
      const e = pickTarget(ctx, a);
      if (e) return e;
      if (ctx.vp(a.target as number) <= ctx.vp(a.player)) return 'Pick a player with more points';
      return knightsOf(ctx, a.target as number).some(isActive)
        ? null
        : 'That player has no active knights';
    },
    apply(ctx, a) {
      ctx.setPhase({
        id: 'brothel',
        owed: { [a.target as number]: 1 },
        by: a.player,
        returnTo: MAIN,
      });
    },
  },
  alliance: {
    deck: 'politics',
    count: 1,
    when: 'beforeOrAfter',
    options(ctx, seat) {
      return Object.values(ctx.state.pieces)
        .filter((k) => isKnight(k) && k.owner !== null && k.owner !== seat && isActive(k))
        .map((k) => ({ knight: k.id }));
    },
    check(ctx, a) {
      const k = ctx.state.pieces[a.knight ?? ''];
      if (!k || !isKnight(k) || k.owner === a.player || k.owner === null || !isActive(k))
        return 'Pick another player’s active knight';
      return null;
    },
    apply(ctx, a) {
      ckData(ctx).alliance = { seat: a.player, knight: a.knight as string };
    },
  },
  tournament: {
    deck: 'politics',
    count: 2,
    options: (ctx, seat) =>
      knightsOf(ctx, seat)
        .filter((k) => k.type === 'knight2')
        .map((k) => ({ knight: k.id })),
    check(ctx, a) {
      const k = ctx.state.pieces[a.knight ?? ''];
      if (!k || k.owner !== a.player || k.type !== 'knight2')
        return 'Pick one of your strong knights';
      if (ctx.supplyLeft(a.player, 'knight3') <= 0) return 'No mighty knights left';
      return ctx.has(a.player, { wool: 1, ore: 1 }) ? null : 'You need 1 wool and 1 ore';
    },
    apply(ctx, a) {
      ctx.pay(a.player, { wool: 1, ore: 1 });
      const k = ctx.upgrade(ctx.state.pieces[a.knight as string] as Piece, 'knight3');
      ctx.emit({
        type: 'knightPromoted',
        player: a.player,
        at: (k.at as { id: CornerId }).id,
        level: 3,
      });
    },
  },

  // ---- Science ----
  secretSociety: {
    deck: 'science',
    count: 2,
    when: 'beforeOrAfter',
    options(ctx, seat) {
      const out: Partial<Play>[] = [];
      for (const target of others(ctx, seat))
        for (const t of activeTracks(ctx))
          if (hasAbility(ctx, target, t) && !hasAbility(ctx, seat, t))
            out.push({ target, option: t });
      return out;
    },
    check(ctx, a) {
      const e = pickTarget(ctx, a);
      if (e) return e;
      const t = a.option as Track;
      if (!activeTracks(ctx).includes(t) || !hasAbility(ctx, a.target as number, t))
        return 'Pick an ability that player has';
      return null;
    },
    apply(ctx, a) {
      ckData(ctx).lent = {
        seat: a.player,
        track: a.option as Track,
        turn: ctx.state.turn.number,
      };
    },
  },
  astrolabe: {
    deck: 'science',
    count: 2,
    options: () => [{ option: 'build' }, { option: 'paper' }],
    check(ctx, a) {
      const mine = gwpBuildings(ctx, a.player);
      if (a.option === 'build')
        return mine.citadel && mine.diocese ? 'You have both a Citadel and a Diocese' : null;
      if (a.option === 'paper') {
        if (!mine.citadel && !mine.diocese) return 'You need a Citadel or a Diocese first';
        return ctx.bankHas({ paper: 1 }) ? null : 'The bank has no paper';
      }
      return 'Pick one';
    },
    apply(ctx, a) {
      if (a.option === 'paper') ctx.grant(a.player, { paper: 1 });
      else cardData(ctx).astrolabe = { seat: a.player, turn: ctx.state.turn.number };
    },
  },

  // ---- Magic ----
  summoning: {
    deck: 'magic',
    count: 2,
    options: (ctx, seat) => others(ctx, seat).map((target) => ({ target })),
    check(ctx, a) {
      return (
        pickTarget(ctx, a) ??
        (summonTargets(ctx, a.target as number).length
          ? null
          : 'That player has no open road or ship, or inactive knight')
      );
    },
    apply(ctx, a) {
      ctx.setPhase({ id: 'summoning', target: a.target, returnTo: MAIN });
    },
  },
  ghostShip: {
    deck: 'magic',
    count: 1,
    check: (ctx, a) =>
      others(ctx, a.player).some((s) => openLanes(ctx, s) > 0 && ctx.handSize(s, false) > 0)
        ? null
        : 'Nobody has an open shipping lane',
    apply(ctx, a) {
      stealEach(ctx, a.player, (s) => openLanes(ctx, s));
    },
  },
  witchsNight: {
    deck: 'magic',
    count: 1,
    apply(ctx, a) {
      stealEach(ctx, a.player, () => 1);
    },
  },
  willOWisp: {
    deck: 'magic',
    count: 2,
    when: 'roll',
    apply(ctx) {
      cardData(ctx).wisp = ctx.state.turn.number;
    },
  },
  magicCurrent: {
    deck: 'magic',
    count: 1,
    options: () => [{ option: 'forward' }, { option: 'back' }],
    check(ctx, a) {
      const at = ckData(ctx).barbarian;
      if (a.option === 'back') return at > 0 ? null : 'The ship is at the start';
      if (a.option === 'forward')
        return at < barbarianTrack(ctx) - 1 ? null : 'The ship is about to land';
      return 'Pick one';
    },
    apply(ctx, a) {
      const d = ckData(ctx);
      // Forward stops one step short of landing: the attack comes on a roll.
      d.barbarian =
        a.option === 'back'
          ? Math.max(0, d.barbarian - 2)
          : Math.min(barbarianTrack(ctx) - 1, d.barbarian + 2);
      ctx.emit({ type: 'barbariansAdvance', at: d.barbarian, of: barbarianTrack(ctx) });
    },
  },
  ravenFlight: {
    deck: 'magic',
    count: 3,
    options: () => [{ option: 'desert' }, { option: 'grain' }, { option: 'festival' }],
    check(ctx, a) {
      if (a.option === 'festival')
        return festivals(ctx).length ? null : 'There is no Beer festival going';
      if (a.option === 'desert') {
        const at = robber(ctx)?.at;
        const d = deserts(ctx);
        return d.length && !(at?.kind === 'hex' && d.includes(at.id))
          ? null
          : 'The robber can not go to a desert';
      }
      if (a.option === 'grain')
        return others(ctx, a.player).some((s) => (ctx.player(s).hand.grain ?? 0) > 0)
          ? null
          : 'Nobody else has grain';
      return 'Pick one';
    },
    apply(ctx, a) {
      if (a.option === 'festival') {
        stopFestival(ctx, a.player);
        return;
      }
      if (a.option === 'desert') {
        const r = robber(ctx);
        const to = deserts(ctx)[0] as HexId;
        if (r) ctx.move(r, { kind: 'hex', id: to });
        ctx.emit({ type: 'robberMoved', player: a.player, hex: to });
        return;
      }
      for (const s of others(ctx, a.player))
        if ((ctx.player(s).hand.grain ?? 0) > 0) {
          ctx.pay(s, { grain: 1 });
          ctx.emit({ type: 'discarded', player: s, cards: { grain: 1 } });
        }
    },
  },
  stoneCircle: {
    deck: 'magic',
    count: 1,
    options(ctx, seat) {
      const out: Partial<Play>[] = RESOURCES.map((r) => ({ option: 'ore', resource: r }));
      for (const k of knightsOf(ctx, seat))
        for (const c of commoditiesIn(ctx))
          out.push({ option: 'knight', knight: k.id, resource: c });
      return out;
    },
    check(ctx, a) {
      if (a.option === 'ore') {
        if (!isResource(a.resource ?? '')) return 'Pick a resource';
        if (!ctx.has(a.player, { [a.resource as string]: 1 })) return 'You do not have that';
        return ctx.bankHas({ ore: 3 }) ? null : 'The bank is short of ore';
      }
      if (a.option === 'knight') {
        const k = ctx.state.pieces[a.knight ?? ''];
        if (!k || k.owner !== a.player || !isKnight(k)) return 'Pick one of your knights';
        if (!commoditiesIn(ctx).includes(a.resource ?? '')) return 'Pick a commodity';
        return null;
      }
      return 'Pick one';
    },
    apply(ctx, a) {
      if (a.option === 'ore') {
        ctx.pay(a.player, { [a.resource as string]: 1 });
        ctx.grant(a.player, { ore: 3 });
        return;
      }
      ctx.remove(ctx.state.pieces[a.knight as string] as Piece);
      const get: Cards = {};
      for (const c of [a.resource as string, 'bread'])
        if (ctx.bankHas({ [c]: (get[c] ?? 0) + 1 })) get[c] = (get[c] ?? 0) + 1;
      if (Object.keys(get).length) ctx.grant(a.player, get);
      ctx.emit({ type: 'knightRemoved', player: a.player, got: get });
    },
  },
  stardust: {
    deck: 'magic',
    count: 2,
    options: resourceChoices,
    check: (ctx, a) =>
      isResource(a.resource ?? '') && ctx.bankHas({ crystal: 1, [a.resource as string]: 1 })
        ? null
        : 'The bank is short of those',
    apply(ctx, a) {
      ctx.grant(a.player, { crystal: 1, [a.resource as string]: 1 });
    },
  },
  unicornMagic: {
    deck: 'magic',
    count: 1,
    when: 'roll',
    options: (ctx) => [...new Set(eventFaces(ctx))].map((face) => ({ face })),
    check: (ctx, a) => (eventFaces(ctx).includes(a.face as never) ? null : 'Pick a face'),
    apply(ctx, a) {
      ckData(ctx).forcedEvent = a.face as ReturnType<typeof eventFaces>[number];
    },
  },
  riverNaiad: {
    deck: 'magic',
    count: 2,
    check: (ctx) => (naiadGrain(ctx).length ? null : 'There is no grain hex with a number'),
    apply(ctx) {
      ctx.setPhase({ id: 'riverNaiad', returnTo: MAIN });
    },
  },
  dragonLair: {
    deck: 'magic',
    count: 1,
    options: (ctx) => lairHexes(ctx).map((hex) => ({ option: hex })),
    check(ctx, a) {
      if (dragonGone(ctx)) return 'The dragon was slain';
      return lairHexes(ctx).includes(a.option as HexId) ? null : 'Pick an ore hex';
    },
    apply(ctx, a) {
      landDragon(ctx, a.option as HexId, true);
      ctx.emit({ type: 'dragonLair', player: a.player, hex: a.option });
    },
  },
  magicRitual: {
    deck: 'magic',
    count: 2,
    check: (ctx, a) =>
      others(ctx, a.player).some((s) => progressCount(ctx, s) > 0)
        ? null
        : 'Nobody else has a progress card',
    apply(ctx, a) {
      const owed: Record<number, number> = {};
      for (const s of others(ctx, a.player)) if (progressCount(ctx, s) > 0) owed[s] = 1;
      ctx.setPhase({ id: 'magicRitual', owed, by: a.player, pool: [], returnTo: MAIN });
    },
  },
  magicForest: {
    deck: 'magic',
    count: 1,
    options: () => [{ option: 'collect' }, { option: 'crystal' }],
    check(ctx, a) {
      if (a.option === 'collect')
        return forestSettlements(ctx, a.player) > 0
          ? null
          : 'None of your settlements is by a forest';
      if (a.option === 'crystal') {
        if (!ctx.has(a.player, { lumber: 2 })) return 'You need 2 lumber';
        return ctx.bankHas({ crystal: 1 }) ? null : 'The bank has no crystal';
      }
      return 'Pick one';
    },
    apply(ctx, a) {
      if (a.option === 'crystal') {
        ctx.pay(a.player, { lumber: 2 });
        ctx.grant(a.player, { crystal: 1 });
        return;
      }
      const n = Math.min(forestSettlements(ctx, a.player), ctx.state.bank.lumber ?? 0);
      if (n > 0) ctx.grant(a.player, { lumber: n });
    },
  },

  // ---- Religion ----
  almsgiving: {
    deck: 'religion',
    count: 1,
    check: (ctx, a) => (Object.keys(almsOwed(ctx, a.player)).length ? null : 'Nobody owes alms'),
    apply(ctx, a) {
      ctx.setPhase({
        id: 'discard',
        owed: almsOwed(ctx, a.player),
        returnTo: 'main',
        skipRobber: true,
      });
    },
  },
  bookBurning: {
    deck: 'religion',
    count: 1,
    check: (ctx, a) =>
      others(ctx, a.player).some((s) => progressCount(ctx, s) > 0)
        ? null
        : 'Nobody else has a progress card',
    apply(ctx, a) {
      const owed: Record<number, number> = {};
      for (const s of others(ctx, a.player)) if (progressCount(ctx, s) > 0) owed[s] = 1;
      ctx.setPhase({ id: 'progressDiscard', owed, reason: 'bookBurning', returnTo: MAIN });
    },
  },
  dogma: takeFromEach('science'),
  witchBurning: takeFromEach('magic'),
  lent: {
    deck: 'religion',
    count: 1,
    when: 'beforeOrAfter',
    options: (ctx, seat) => others(ctx, seat).map((target) => ({ target })),
    check: (ctx, a) =>
      pickTarget(ctx, a) ?? (dragonData(ctx).lent ? 'Someone is already under Lent' : null),
    apply(ctx, a) {
      dragonData(ctx).lent = { target: a.target as number, by: a.player, turn: null, paid: false };
    },
  },
  churchTax: {
    deck: 'religion',
    count: 4,
    check: (ctx, a) =>
      others(ctx, a.player).some((s) => ctx.handSize(s, false) > 0) ? null : 'Nobody has cards',
    apply(ctx, a) {
      askGifts(ctx, a.player, others(ctx, a.player), 'churchTax');
    },
  },
  crusader: {
    deck: 'religion',
    count: 2,
    check: (ctx, a) => (ctx.supplyLeft(a.player, 'knight1') > 0 ? null : 'No basic knights left'),
    apply(ctx) {
      ctx.setPhase({ id: 'placeDeserter', knightType: 'knight1', active: true, returnTo: MAIN });
    },
  },
  missionary: {
    deck: 'religion',
    count: 1,
    options(ctx, seat) {
      const cards = [...new Set(heldIn(ctx, seat, 'religion'))].filter((c) => c !== 'missionary');
      return others(ctx, seat).flatMap((target) => cards.map((resource) => ({ target, resource })));
    },
    check(ctx, a) {
      const e = pickTarget(ctx, a);
      if (e) return e;
      const held = heldIn(ctx, a.player, 'religion');
      const copies = held.filter((c) => c === a.resource).length;
      const need = a.resource === 'missionary' ? 2 : 1;
      return copies >= need ? null : 'Pick a Religion card you hold';
    },
    apply(ctx, a) {
      const target = a.target as number;
      const card = a.resource as string;
      const mine = ctx.player(a.player).held.religion ?? [];
      mine.splice(
        mine.findIndex((h) => h.card === card),
        1,
      );
      giveProgress(ctx, target, 'religion', card);
      let lost = 0;
      for (const deck of ['science', 'magic'] as Track[])
        for (const c of heldIn(ctx, target, deck)) {
          returnHeld(ctx, target, deck, c);
          lost += 1;
        }
      ctx.emit({ type: 'missionary', player: a.player, target, lost });
    },
  },
  reformation: {
    deck: 'religion',
    count: 1,
    options: () => [{ option: 'mine' }, { option: 'others' }],
    check(ctx, a) {
      if (a.option === 'mine')
        return progressCount(ctx, a.player) > 1 ? null : 'You have no other progress cards';
      if (a.option === 'others')
        return others(ctx, a.player).some((s) => progressCount(ctx, s) > 0)
          ? null
          : 'Nobody else has a progress card';
      return 'Pick one';
    },
    apply(ctx, a) {
      const seats = a.option === 'mine' ? [a.player] : others(ctx, a.player);
      for (const s of seats) {
        const had = progressHeld(ctx, s);
        for (const h of had) returnHeld(ctx, s, h.deck, h.card);
        for (const h of had) drawProgress(ctx, s, h.deck);
      }
    },
  },
  badOmen: {
    deck: 'religion',
    count: 1,
    options: (ctx, seat) => others(ctx, seat).map((target) => ({ target })),
    check(ctx, a) {
      const e = pickTarget(ctx, a);
      if (e) return e;
      const lv = levels(ctx, a.target as number);
      if (Math.max(lv.magic, lv.science) <= lv.religion)
        return 'Pick a player further on in Magic or Science than in Religion';
      return knightsOf(ctx, a.target as number).some(isActive)
        ? null
        : 'That player has no active knights';
    },
    apply(ctx, a) {
      for (const k of knightsOf(ctx, a.target as number)) {
        k.props.active = false;
        delete k.props.activatedTurn;
      }
      ctx.emit({ type: 'knightsDeactivated', player: a.player, target: a.target });
    },
  },
  banishment: {
    deck: 'religion',
    count: 2,
    check: (ctx) =>
      banishable(ctx).length || robberToDesert(ctx) ? null : 'There is nothing to banish',
    apply(ctx, a) {
      for (const p of banishable(ctx)) ctx.remove(p);
      const to = robberToDesert(ctx);
      const r = robber(ctx);
      if (to && r) ctx.move(r, { kind: 'hex', id: to });
      ctx.emit({ type: 'banishment', player: a.player });
    },
  },
  indulgence: {
    deck: 'religion',
    count: 2,
    when: 'indulgence',
    options: () => REROLLS.map((option) => ({ option })),
    check: (_ctx, a) => (REROLLS.includes(a.option ?? '') ? null : 'Pick the dice to throw again'),
    apply(ctx, a) {
      playIndulgence(ctx, a.player, a.option as string);
    },
  },
  refuge: {
    deck: 'religion',
    count: 2,
    when: 'beforeOrAfter',
    check: (ctx, a) =>
      ckData(ctx).refuge?.includes(a.player) ? 'Your cities are already safe' : null,
    apply(ctx, a) {
      (ckData(ctx).refuge ??= []).push(a.player);
    },
  },

  // ---- Wealth ----
  landDeed: {
    deck: 'wealth',
    count: 1,
    options: (ctx, seat) => deedSpots(ctx, seat).map((option) => ({ option })),
    check: (ctx, a) => deedCheck(ctx, a.player, a.option),
    apply(ctx, a) {
      placeDeed(ctx, a.player, a.option as CornerId);
    },
  },
  goldSmith: {
    deck: 'wealth',
    count: 1,
    options: (ctx) => [...RESOURCES, ...commoditiesIn(ctx)].map((resource) => ({ resource })),
    check: (ctx, a) =>
      ctx.registry.cardTypes[a.resource ?? ''] && ctx.bankHas({ [a.resource as string]: 1 })
        ? null
        : 'The bank has none of that',
    apply(ctx, a) {
      ctx.grant(a.player, { [a.resource as string]: 1 });
    },
  },
  honorParade: {
    deck: 'wealth',
    count: 1,
    check: (ctx) =>
      Object.values(ctx.state.pieces).some((p) => isKnight(p) && !isActive(p) && !isAway(p))
        ? null
        : 'Every knight is already active',
    apply(ctx, a) {
      const owners = new Set<number>();
      for (const p of Object.values(ctx.state.pieces)) {
        if (!isKnight(p) || isActive(p) || isAway(p) || p.owner === null) continue;
        p.props.active = true;
        p.props.activatedTurn = ctx.state.turn.number;
        owners.add(p.owner);
      }
      ctx.emit({ type: 'honorParade', player: a.player });
      askGifts(
        ctx,
        a.player,
        [...owners].filter((s) => s !== a.player),
        'honorParade',
      );
    },
  },
  ...Object.fromEntries(
    Object.entries(EXCHANGES).map(([card, ex]) => [
      card,
      {
        deck: 'wealth',
        count: 2,
        check: (ctx: Ctx, a: Play) =>
          (cardData(ctx).exchanges ?? []).some(
            (e) =>
              e.seat === a.player &&
              e.turn === ctx.state.turn.number &&
              e.get === ex.get &&
              e.give === ex.give,
          )
            ? 'Already in use this turn'
            : null,
        apply(ctx: Ctx, a: Play) {
          const d = cardData(ctx);
          d.exchanges = (d.exchanges ?? []).filter((e) => e.turn === ctx.state.turn.number);
          d.exchanges.push({ seat: a.player, turn: ctx.state.turn.number, ...ex });
        },
      } satisfies CardDef,
    ]),
  ),
  mercenaries: {
    deck: 'wealth',
    count: 2,
    check: (ctx) => (ckData(ctx).barbarian > 0 ? null : 'The ship is at the start'),
    apply(ctx) {
      ckData(ctx).barbarian = 0;
      ctx.emit({ type: 'barbariansAdvance', at: 0, of: barbarianTrack(ctx) });
    },
  },
  espionage: {
    deck: 'wealth',
    count: 1,
    check: (ctx) =>
      activeTracks(ctx).some((t) => (ctx.state.decks[t]?.length ?? 0) > 0)
        ? null
        : 'The decks are empty',
    apply(ctx, a) {
      const tops = activeTracks(ctx)
        .filter((t) => (ctx.state.decks[t]?.length ?? 0) > 0)
        .map((t) => ctx.state.decks[t]![0] as string);
      ckData(ctx).peek = { seat: a.player, target: a.player, progress: tops };
      ctx.setPhase({ id: 'espionage', returnTo: MAIN });
    },
  },
  intimidation: {
    deck: 'wealth',
    count: 2,
    when: 'discard',
    apply(ctx, a) {
      const ph = ctx.state.phase;
      const owed = { ...(ph.owed as Record<number, number>) };
      delete owed[a.player];
      ctx.emit({ type: 'intimidation', player: a.player });
      if (Object.keys(owed).length) ctx.setPhase({ ...ph, owed });
      else ctx.setPhase({ id: 'moveRobber', returnTo: ph.returnTo });
    },
  },
};

function takeFromEach(deck: Track): CardDef {
  return {
    deck: 'religion',
    count: 1,
    check: (ctx, a) =>
      others(ctx, a.player).some((s) => heldIn(ctx, s, deck).length > 0)
        ? null
        : `Nobody else has a ${deck} card`,
    apply(ctx, a) {
      const pool: { card: string; deck: Track }[] = [];
      for (const s of others(ctx, a.player)) {
        const held = heldIn(ctx, s, deck);
        if (!held.length) continue;
        const card = held[ctx.rng.int(0, held.length - 1)] as string;
        const list = ctx.player(s).held[deck] ?? [];
        list.splice(
          list.findIndex((h) => h.card === card),
          1,
        );
        pool.push({ card, deck });
        ctx.emit({ type: 'progressTaken', player: a.player, from: s, deck });
      }
      keepOne(ctx, a.player, pool);
    },
  };
}

function gwpBuildings(ctx: Ctx, seat: number): { citadel?: unknown; diocese?: unknown } {
  const d = ctx.state.data[MODULE_ID] as
    { buildings?: Record<number, { citadel?: unknown; diocese?: unknown }> } | undefined;
  return d?.buildings?.[seat] ?? {};
}

function forestSettlements(ctx: Ctx, seat: number): number {
  return ctx
    .piecesOf(seat, 'settlement')
    .filter(
      (p) =>
        p.at.kind === 'corner' &&
        (ctx.geometry.cornerHexes.get(p.at.id) ?? []).some(
          (h) => ctx.registry.hexTypes[ctx.state.hexes[h]?.type ?? '']?.produces === 'lumber',
        ),
    ).length;
}

function almsOwed(ctx: Ctx, seat: number): Record<number, number> {
  const mine = ctx.vp(seat);
  const owed: Record<number, number> = {};
  for (const s of others(ctx, seat)) {
    if (ctx.vp(s) <= mine) continue;
    const n = Math.min(progressCount(ctx, s), ctx.handSize(s));
    if (n > 0) owed[s] = n;
  }
  return owed;
}

const NEUTRAL_TYPES = ['merchant', 'duke', 'scholar', 'wizard', 'inquisitor', 'envoy'];

function banishable(ctx: Ctx): Piece[] {
  return Object.values(ctx.state.pieces).filter((p) => NEUTRAL_TYPES.includes(p.type));
}

function robberToDesert(ctx: Ctx): HexId | null {
  const at = robber(ctx)?.at;
  const d = deserts(ctx);
  if (!d.length || (at?.kind === 'hex' && d.includes(at.id))) return null;
  return d[0] as HexId;
}

/** Ore hexes the Dragon Lair can take. */
function lairHexes(ctx: Ctx): HexId[] {
  return Object.values(ctx.state.hexes)
    .filter((h) => !h.hidden && ctx.registry.hexTypes[h.type]?.produces === 'ore')
    .map((h) => h.id);
}

export function naiadGrain(ctx: Ctx): HexId[] {
  return Object.values(ctx.state.hexes)
    .filter(
      (h) =>
        !h.hidden && h.token !== undefined && ctx.registry.hexTypes[h.type]?.produces === 'grain',
    )
    .map((h) => h.id);
}

function numberedHexes(ctx: Ctx): HexId[] {
  return Object.values(ctx.state.hexes)
    .filter((h) => !h.hidden && h.token !== undefined)
    .map((h) => h.id);
}

export function isGwpCard(card: unknown): boolean {
  return typeof card === 'string' && card in CARDS;
}

/** Card counts each deck gains. */
export function deckCards(deck: string): Record<string, number> {
  return Object.fromEntries(
    Object.entries(CARDS)
      .filter(([, d]) => d.deck === deck)
      .map(([c, d]) => [c, d.count]),
  );
}

// ---- Playing ----

function timing(ctx: Ctx, a: Play, def: CardDef): string | null {
  const ph = ctx.state.phase;
  if (def.when === 'indulgence') return indulgenceTiming(ctx, a.player);
  if (ph.id === 'indulgence') return 'Not while a roll waits for an Indulgence';
  if (def.when === 'discard') {
    const owed = (ph.owed as Record<number, number> | undefined)?.[a.player];
    if (ph.id !== 'discard' || !owed || ph.skipRobber)
      return 'Play this when a 7 makes you discard';
    return null;
  }
  if (a.player !== ctx.active) return 'Not your turn';
  const when = def.when ?? 'main';
  if (when === 'roll' && ph.id !== 'roll') return 'Play this before you roll';
  if (when === 'main' && ph.id !== 'main') return 'Progress cards are played after rolling';
  if (when === 'beforeOrAfter' && ph.id !== 'roll' && ph.id !== 'main') return 'Not now';
  return null;
}

function checkCard(ctx: Ctx, a: Play): string | null {
  const def = CARDS[a.card] as CardDef;
  if (!holdsProgress(ctx, a.player, a.card)) return 'You do not hold that card';
  return timing(ctx, a, def) ?? def.check?.(ctx, a) ?? null;
}

/** Adds the new cards to playProgress (also playable during a discard, for Intimidation). */
export function wrapCards(prev: ActionDef): ActionDef {
  return {
    ...prev,
    phases: [...(prev.phases ?? []), 'discard', 'indulgence'],
    check(ctx, a) {
      if (isGwpCard(a.card)) return checkCard(ctx, a as Play);
      if (ctx.state.phase.id === 'indulgence') return 'Not while a roll waits for an Indulgence';
      return prev.check(ctx, a);
    },
    apply(ctx, a) {
      if (!isGwpCard(a.card)) return prev.apply(ctx, a);
      const def = CARDS[a.card as string] as CardDef;
      spendProgress(ctx, a.player, a.card as string);
      def.apply(ctx, a as Play);
    },
    enumerate(ctx, player) {
      const ph = ctx.state.phase.id;
      const out =
        ph === 'discard' || ph === 'indulgence'
          ? []
          : (prev.enumerate?.(ctx, player) ?? []).filter((a) => !isGwpCard(a.card));
      const seen = new Set<string>();
      for (const { card } of progressHeld(ctx, player)) {
        if (seen.has(card) || !isGwpCard(card)) continue;
        seen.add(card);
        const def = CARDS[card] as CardDef;
        for (const o of def.options?.(ctx, player) ?? [{}])
          out.push({ type: 'playProgress', player, card, ...o } as Action);
      }
      return out;
    },
  };
}

// ---- Steps after playing a card ----

const back = (ctx: Ctx) => ctx.setPhase(ctx.state.phase.returnTo as Phase);

/** Brothel: the target pays 1 grain, bread or beer, or their knights stand down. */
const brothelAnswer: ActionDef = {
  phases: ['brothel'],
  check(ctx, a) {
    const ph = ctx.state.phase;
    if (!(ph.owed as Record<number, number>)[a.player]) return 'Not you';
    if (a.pay === null || a.pay === undefined) return null;
    if (a.pay === 'beer') return beerOf(ctx, a.player) >= 1 ? null : 'You have no Beer';
    if (a.pay !== 'grain' && a.pay !== 'bread') return 'Pay grain, bread or Beer';
    return ctx.has(a.player, { [a.pay as string]: 1 }) ? null : `You have no ${a.pay as string}`;
  },
  apply(ctx, a) {
    const ph = ctx.state.phase;
    const by = ph.by as number;
    if (a.pay === 'beer') {
      addBeerTo(ctx, a.player, -1);
      addBeerTo(ctx, by, 1);
    } else if (typeof a.pay === 'string') ctx.transfer(a.player, by, { [a.pay]: 1 });
    else
      for (const k of knightsOf(ctx, a.player)) {
        k.props.active = false;
        delete k.props.activatedTurn;
      }
    ctx.emit({ type: 'brothel', player: a.player, to: by, paid: a.pay ?? null });
    back(ctx);
  },
  enumerate(ctx, player) {
    if (!(ctx.state.phase.owed as Record<number, number>)[player]) return [];
    return [null, 'grain', 'bread', 'beer'].map((pay) => ({ type: 'brothelAnswer', player, pay }));
  },
};

/** Summoning: remove the chosen player's open road or ship, or inactive knight. */
const summonRemove: ActionDef = {
  phases: ['summoning'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    const list = summonTargets(ctx, ctx.state.phase.target as number);
    return list.some((t) => (a.edge ? t.edge === a.edge : t.knight === a.knight))
      ? null
      : 'Pick an open road or ship, or an inactive knight';
  },
  apply(ctx, a) {
    const target = ctx.state.phase.target as number;
    const piece = a.edge
      ? ctx
          .piecesAt({ kind: 'edge', id: a.edge as EdgeId })
          .find((p) => p.owner === target && !!ctx.registry.pieceTypes[p.type]?.route)
      : ctx.state.pieces[a.knight as string];
    if (piece) {
      ctx.remove(piece);
      ctx.emit({ type: 'summoned', player: a.player, owner: target, piece: piece.type });
    }
    back(ctx);
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return summonTargets(ctx, ctx.state.phase.target as number).map((t) => ({
      type: 'summonRemove',
      player,
      ...t,
    }));
  },
};

/** River Naiad: a grain hex, then any other numbered hex; their numbers swap. */
const naiadHex: ActionDef = {
  phases: ['riverNaiad'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    const first = ctx.state.phase.first as HexId | undefined;
    if (!first) return naiadGrain(ctx).includes(a.hex as HexId) ? null : 'Pick a grain hex';
    if (a.hex === first) return 'Pick a different hex';
    return numberedHexes(ctx).includes(a.hex as HexId) ? null : 'Pick a hex with a number';
  },
  apply(ctx, a) {
    const ph = ctx.state.phase;
    const first = ph.first as HexId | undefined;
    if (!first) {
      ctx.setPhase({ ...ph, first: a.hex });
      return;
    }
    const x = ctx.state.hexes[first];
    const y = ctx.state.hexes[a.hex as HexId];
    if (x && y) {
      const t = x.token;
      x.token = y.token as number;
      y.token = t as number;
      ctx.emit({ type: 'numbersSwapped', player: a.player, hexes: [first, a.hex] });
    }
    back(ctx);
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    const first = ctx.state.phase.first as HexId | undefined;
    const list = first ? numberedHexes(ctx).filter((h) => h !== first) : naiadGrain(ctx);
    return list.map((hex) => ({ type: 'naiadHex', player, hex }));
  },
};

/** Magic Ritual: everyone else hands over a progress card of their choice. */
const ritualGive: ActionDef = {
  phases: ['magicRitual'],
  check(ctx, a) {
    if (!(ctx.state.phase.owed as Record<number, number>)[a.player]) return 'You owe nothing';
    const held = ctx.player(a.player).held[a.deck as string] ?? [];
    return held.some((h) => h.card === a.card) ? null : 'Pick a card you hold';
  },
  apply(ctx, a) {
    const ph = ctx.state.phase;
    const held = ctx.player(a.player).held[a.deck as string] ?? [];
    held.splice(
      held.findIndex((h) => h.card === a.card),
      1,
    );
    const pool = [
      ...(ph.pool as { card: string; deck: Track }[]),
      { card: a.card as string, deck: a.deck as Track },
    ];
    const owed = { ...(ph.owed as Record<number, number>) };
    delete owed[a.player];
    ctx.emit({ type: 'progressGiven', player: a.player, to: ph.by, deck: a.deck });
    if (Object.keys(owed).length) {
      ctx.setPhase({ ...ph, owed, pool });
      return;
    }
    ctx.setPhase(ph.returnTo as Phase);
    keepOne(ctx, ph.by as number, pool);
  },
  enumerate(ctx, player) {
    if (!(ctx.state.phase.owed as Record<number, number>)[player]) return [];
    const seen = new Set<string>();
    return progressHeld(ctx, player)
      .filter((h) => !seen.has(h.card) && seen.add(h.card))
      .map((h) => ({ type: 'ritualGive', player, deck: h.deck, card: h.card }));
  },
};

/** Keep one card from a pool; the rest go under their decks. */
const keepProgress: ActionDef = {
  phases: ['keepProgress'],
  check(ctx, a) {
    const ph = ctx.state.phase;
    if (a.player !== ph.by) return 'Not you';
    const pool = ph.pool as { card: string }[];
    return Number.isInteger(a.index) && pool[a.index as number] ? null : 'Pick a card';
  },
  apply(ctx, a) {
    const ph = ctx.state.phase;
    const pool = ph.pool as { card: string; deck: Track }[];
    pool.forEach((p, i) => {
      if (i === a.index) giveProgress(ctx, a.player, p.deck, p.card);
      else (ctx.state.decks[p.deck] ??= []).push(p.card);
    });
    back(ctx);
  },
  enumerate(ctx, player) {
    const ph = ctx.state.phase;
    if (player !== ph.by) return [];
    return (ph.pool as unknown[]).map((_, index) => ({ type: 'keepProgress', player, index }));
  },
};

/** Espionage: take the top card of one deck. */
const espionageTake: ActionDef = {
  phases: ['espionage'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    return activeTracks(ctx).includes(a.deck as Track) &&
      (ctx.state.decks[a.deck as string]?.length ?? 0) > 0
      ? null
      : 'Pick a deck';
  },
  apply(ctx, a) {
    ckData(ctx).peek = null;
    drawProgress(ctx, a.player, a.deck as Track);
    back(ctx);
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return activeTracks(ctx)
      .filter((t) => (ctx.state.decks[t]?.length ?? 0) > 0)
      .map((deck) => ({ type: 'espionageTake', player, deck, card: ctx.state.decks[deck]![0] }));
  },
};

export const cardActions: Record<string, ActionDef> = {
  brothelAnswer,
  summonRemove,
  naiadHex,
  ritualGive,
  keepProgress,
  espionageTake,
};

// Beer lives in the module's data; these avoid a loop with index.ts.
function beerOf(ctx: Ctx, seat: number): number {
  const d = ctx.state.data[MODULE_ID] as { beer?: Record<number, number> } | undefined;
  return d?.beer?.[seat] ?? 0;
}

function addBeerTo(ctx: Ctx, seat: number, n: number): void {
  const d = ctx.data<{ beer?: Record<number, number> }>(MODULE_ID);
  d.beer ??= {};
  d.beer[seat] = Math.max(0, (d.beer[seat] ?? 0) + n);
}
