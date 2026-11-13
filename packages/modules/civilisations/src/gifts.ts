import type { Action, ActionDef, CornerId, Ctx, EdgeId, HexId } from '@colonizers/engine';
import { canPlaceRoad, canPlaceSettlement, RESOURCES } from '@colonizers/module-base';
import { canPlaceShip, islandOf } from '@colonizers/module-seafarers';
import {
  activeTracks,
  canPlaceKnight,
  citiesOf,
  commoditiesIn,
  drawProgress,
  isActiveTrack,
  levels,
  MAX_LEVEL,
  rivalMetropolis,
  TERRAIN_COMMODITY,
  type Track,
} from '@colonizers/module-cities-knights';
import {
  action,
  civData,
  civView,
  giftsOf,
  isCoastalCorner,
  isInlandCorner,
  isLandHex,
  isSeaHex,
  lowerTrack,
  markOnce,
  notOver,
  onlyActive,
  picksOf,
  playsLater,
  progressCheck,
  raiseTrack,
  takeGift,
  usedOnce,
  type Gift,
  type SettleWhere,
} from './core.ts';

/**
 * Gifts and choices the civilisations hand out, taken when the player likes:
 * free roads and knights, Republic harvests, Egypt's free improvement,
 * resources of your choice, "any card" swaps and the calendar swaps.
 */

const giftIndex = (ctx: Ctx, seat: number, kind: Gift['kind']) =>
  giftsOf(ctx, seat).findIndex((g) => g.kind === kind);

// ---- Free road or ship ----

const hasShips = (ctx: Ctx) => !!ctx.registry.pieceTypes.ship;

type RouteGift = Extract<Gift, { kind: 'route' }>;

function routeType(ctx: Ctx, seat: number, edge: EdgeId, gift: RouteGift): 'road' | 'ship' | null {
  if (gift.only !== 'ship' && canPlaceRoad(ctx, seat, edge) === null) return 'road';
  if (gift.only !== 'road' && hasShips(ctx) && canPlaceShip(ctx, seat, edge) === null)
    return 'ship';
  return null;
}

/** The route gift a free road or ship on this edge would use: road-only first, then either, then ship-only. */
function routeGift(
  ctx: Ctx,
  seat: number,
  edge: EdgeId,
): { i: number; piece: 'road' | 'ship' } | null {
  const gifts = giftsOf(ctx, seat)
    .map((g, i) => ({ g, i }))
    .filter((x): x is { g: RouteGift; i: number } => x.g.kind === 'route');
  const rank = (g: RouteGift) => (g.only === 'road' ? 0 : g.only === undefined ? 1 : 2);
  for (const { g, i } of gifts.sort((x, y) => rank(x.g) - rank(y.g))) {
    const piece = routeType(ctx, seat, edge, g);
    if (piece) return { i, piece };
  }
  return null;
}

/** What the player's route gifts are, for the screen: "road", "ship" or "route". */
export function routeKinds(ctx: Ctx, seat: number): ('road' | 'ship' | 'route')[] {
  return giftsOf(ctx, seat).flatMap((g) =>
    g.kind === 'route' ? [g.only ?? (hasShips(ctx) ? 'route' : 'road')] : [],
  );
}

const civRoute = action<{ edge: EdgeId }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (giftIndex(ctx, a.player, 'route') < 0) return 'You have no free road';
    return routeGift(ctx, a.player, a.edge) ? null : 'You can not build there';
  },
  apply(ctx, a) {
    const { i, piece } = routeGift(ctx, a.player, a.edge)!;
    takeGift(ctx, a.player, i);
    ctx.place(piece, a.player, { kind: 'edge', id: a.edge });
    ctx.emit({ type: 'built', player: a.player, piece, at: a.edge, free: true });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || giftIndex(ctx, player, 'route') < 0) return [];
    return ctx.geometry.edges
      .filter((edge) => routeGift(ctx, player, edge))
      .map((edge) => ({ type: 'civRoute', player, edge }));
  },
});

// ---- Free settlement ----

/** Can a free settlement of this kind go on this corner? */
export function settleBlock(
  ctx: Ctx,
  seat: number,
  corner: CornerId,
  where: SettleWhere,
): string | null {
  const err = canPlaceSettlement(ctx, seat, corner, where !== 'island');
  if (err) return err;
  if (where === 'inland' && !isInlandCorner(ctx, corner))
    return 'Pick a corner with land all round';
  if (where === 'coastal' && !isCoastalCorner(ctx, corner)) return 'Pick a corner on the coast';
  if (where === 'island') {
    const isle = islandOf(ctx, corner);
    if (!isle) return 'Pick a corner on land';
    const mine = ctx
      .piecesOf(seat)
      .some(
        (p) =>
          p.at.kind === 'corner' &&
          !!ctx.registry.pieceTypes[p.type]?.building &&
          islandOf(ctx, p.at.id) === isle,
      );
    if (mine) return 'Pick an island where you have no building';
  }
  return null;
}

const settleGifts = (ctx: Ctx, seat: number) =>
  giftsOf(ctx, seat)
    .map((g, i) => ({ g, i }))
    .filter(
      (x): x is { g: Extract<Gift, { kind: 'settlement' }>; i: number } =>
        x.g.kind === 'settlement',
    );

const civSettle = action<{ corner: CornerId }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    const gifts = settleGifts(ctx, a.player);
    if (!gifts.length) return 'You have no free settlement';
    let last: string | null = null;
    for (const { g } of gifts) {
      last = settleBlock(ctx, a.player, a.corner, g.where);
      if (!last) return null;
    }
    return last;
  },
  apply(ctx, a) {
    const gift = settleGifts(ctx, a.player).find(
      ({ g }) => !settleBlock(ctx, a.player, a.corner, g.where),
    )!;
    takeGift(ctx, a.player, gift.i);
    ctx.place('settlement', a.player, { kind: 'corner', id: a.corner });
    ctx.emit({ type: 'built', player: a.player, piece: 'settlement', at: a.corner, free: true });
  },
  enumerate(ctx, player) {
    const gifts = settleGifts(ctx, player);
    if (player !== ctx.active || !gifts.length) return [];
    return ctx.geometry.corners
      .filter((c) => gifts.some(({ g }) => !settleBlock(ctx, player, c, g.where)))
      .map((corner) => ({ type: 'civSettle', player, corner }));
  },
});

// ---- Gran Colombia's harbor ----

/** Edges a harbor can stand on: between land and sea. */
export function coastEdges(ctx: Ctx): EdgeId[] {
  return ctx.geometry.edges.filter((e) => {
    const hexes = ctx.geometry.edgeHexes.get(e) ?? [];
    return hexes.some((h) => isLandHex(ctx, h)) && hexes.some((h) => isSeaHex(ctx, h));
  });
}

const civHarbor = action<{ from: EdgeId; to: EdgeId }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (giftIndex(ctx, a.player, 'harbor') < 0) return 'You have no harbor to move';
    if (!ctx.state.harbors.some((h) => h.edge === a.from)) return 'Pick a harbor';
    if (a.from === a.to || !coastEdges(ctx).includes(a.to)) return 'Pick a place on the coast';
    return null;
  },
  apply(ctx, a) {
    takeGift(ctx, a.player, giftIndex(ctx, a.player, 'harbor'));
    const moving = ctx.state.harbors.find((h) => h.edge === a.from)!;
    const there = ctx.state.harbors.find((h) => h.edge === a.to);
    if (there) there.edge = a.from;
    moving.edge = a.to;
    ctx.emit({ type: 'civHarbor', player: a.player, from: a.from, to: a.to, swapped: !!there });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || giftIndex(ctx, player, 'harbor') < 0) return [];
    const coast = coastEdges(ctx);
    return ctx.state.harbors.flatMap((h) =>
      coast
        .filter((e) => e !== h.edge)
        .map((to) => ({ type: 'civHarbor', player, from: h.edge, to })),
    );
  },
});

// ---- China's Silk Road ----

const civSilk = action<{ card: string }>({
  check(ctx, a) {
    const err = notOver(ctx);
    if (err) return err;
    if (giftIndex(ctx, a.player, 'silk') < 0) return 'You have no harbor to pick';
    return (RESOURCES as readonly string[]).includes(a.card) ? null : 'Pick a resource';
  },
  apply(ctx, a) {
    takeGift(ctx, a.player, giftIndex(ctx, a.player, 'silk'));
    (civData(ctx).silk ??= {})[a.player] = a.card;
    ctx.emit({ type: 'civSilk', player: a.player, card: a.card });
  },
  enumerate(ctx, player) {
    if (giftIndex(ctx, player, 'silk') < 0) return [];
    return RESOURCES.map((card) => ({ type: 'civSilk', player, card }));
  },
});

// ---- A progress card of your choice ----

const openDecks = (ctx: Ctx) => activeTracks(ctx).filter((t) => !!ctx.state.decks[t]?.length);

const civProgress = action<{ deck: Track }>({
  check(ctx, a) {
    const err = notOver(ctx);
    if (err) return err;
    if (giftIndex(ctx, a.player, 'progress') < 0) return 'You have no progress card to take';
    return openDecks(ctx).includes(a.deck) ? null : 'Pick a deck with cards in it';
  },
  apply(ctx, a) {
    takeGift(ctx, a.player, giftIndex(ctx, a.player, 'progress'));
    drawProgress(ctx, a.player, a.deck);
    progressCheck(ctx);
  },
  enumerate(ctx, player) {
    if (giftIndex(ctx, player, 'progress') < 0 || ctx.state.phase.id === 'progressDiscard')
      return [];
    return openDecks(ctx).map((deck) => ({ type: 'civProgress', player, deck }));
  },
});

// ---- Warlord's knight ----

const civKnight = action<{ corner: CornerId }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (giftIndex(ctx, a.player, 'knight') < 0) return 'You have no free knight';
    if (ctx.supplyLeft(a.player, 'knight2') <= 0) return 'No strong knights left';
    return canPlaceKnight(ctx, a.player, a.corner);
  },
  apply(ctx, a) {
    takeGift(ctx, a.player, giftIndex(ctx, a.player, 'knight'));
    ctx.place(
      'knight2',
      a.player,
      { kind: 'corner', id: a.corner },
      {
        active: true,
        activatedTurn: -1,
      },
    );
    ctx.emit({ type: 'built', player: a.player, piece: 'knight', at: a.corner, free: true });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || giftIndex(ctx, player, 'knight') < 0) return [];
    return ctx.geometry.corners
      .filter((c) => canPlaceKnight(ctx, player, c) === null)
      .map((corner) => ({ type: 'civKnight', player, corner }));
  },
});

// ---- Republic's harvest ----

/** The card a hex gives a new settlement (its resource) or city (its commodity). */
export function harvestCard(ctx: Ctx, hex: HexId, city: boolean): string | null {
  const h = ctx.state.hexes[hex];
  if (!h || h.hidden) return null;
  if (city) return TERRAIN_COMMODITY[h.type] ?? null;
  return ctx.registry.hexTypes[h.type]?.produces ?? null;
}

export function harvestHexes(ctx: Ctx, corner: CornerId, city: boolean, skip?: HexId): HexId[] {
  return (ctx.geometry.cornerHexes.get(corner) ?? []).filter((h) => {
    if (h === skip) return false;
    const card = harvestCard(ctx, h, city);
    return !!card && ctx.bankHas({ [card]: 1 });
  });
}

const harvestOf = (ctx: Ctx, seat: number) =>
  giftsOf(ctx, seat)
    .map((g, i) => ({ g, i }))
    .filter(
      (x): x is { g: Extract<Gift, { kind: 'harvest' }>; i: number } => x.g.kind === 'harvest',
    );

const civHarvest = action<{ hex: HexId }>({
  check(ctx, a) {
    const err = notOver(ctx);
    if (err) return err;
    const first = harvestOf(ctx, a.player)[0];
    if (!first) return 'Nothing to take';
    return harvestHexes(ctx, first.g.corner, first.g.city, first.g.skip).includes(a.hex)
      ? null
      : 'Pick a hex beside your new building';
  },
  apply(ctx, a) {
    const first = harvestOf(ctx, a.player)[0]!;
    takeGift(ctx, a.player, first.i);
    const card = harvestCard(ctx, a.hex, first.g.city)!;
    ctx.grant(a.player, { [card]: 1 });
    ctx.emit({ type: 'civHarvest', player: a.player, card, hex: a.hex });
  },
  enumerate(ctx, player) {
    const first = harvestOf(ctx, player)[0];
    if (!first) return [];
    return harvestHexes(ctx, first.g.corner, first.g.city, first.g.skip).map((hex) => ({
      type: 'civHarvest',
      player,
      hex,
    }));
  },
});

/** A card from a hex beside a building, if any hex there has one to give. */
export function offerHarvest(
  ctx: Ctx,
  seat: number,
  corner: CornerId,
  city: boolean,
  skip?: HexId,
): void {
  if (!harvestHexes(ctx, corner, city, skip).length) return;
  (civData(ctx).gifts[seat] ??= []).push({
    kind: 'harvest',
    corner,
    city,
    ...(skip ? { skip } : {}),
  });
}

// ---- Egypt's free improvement ----

export function freeImproveBlock(ctx: Ctx, seat: number, track: Track): string | null {
  if (!isActiveTrack(ctx, track)) return 'Pick a track';
  const level = levels(ctx, seat)[track];
  if (level >= MAX_LEVEL) return 'That track is complete';
  if (!citiesOf(ctx, seat).length) return 'You need a city';
  if (rivalMetropolis(ctx, seat, track) && level >= 3) return 'That track stops at level 3';
  return null;
}

const civImprove = action<{ track: Track }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (giftIndex(ctx, a.player, 'improve') < 0) return 'You have no free improvement';
    return freeImproveBlock(ctx, a.player, a.track);
  },
  apply(ctx, a) {
    takeGift(ctx, a.player, giftIndex(ctx, a.player, 'improve'));
    raiseTrack(ctx, a.player, a.track);
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || giftIndex(ctx, player, 'improve') < 0) return [];
    return activeTracks(ctx).map((track) => ({ type: 'civImprove', player, track }));
  },
});

// ---- Resources of your choice ----

export const anyPicksOf = (ctx: Ctx, seat: number): number => civView(ctx).anyPicks?.[seat] ?? 0;

export function addAnyPick(ctx: Ctx, seat: number, why: string): void {
  const d = civData(ctx);
  (d.anyPicks ??= {})[seat] = anyPicksOf(ctx, seat) + 1;
  ctx.emit({ type: 'civPicks', player: seat, count: 1, why, any: true });
}

/** Any resource or commodity of your choice (Maori). */
const civPickAny = action<{ card: string }>({
  check(ctx, a) {
    const err = notOver(ctx);
    if (err) return err;
    if (anyPicksOf(ctx, a.player) < 1) return 'Nothing to pick';
    if (!anyCards(ctx).includes(a.card)) return 'Pick a resource or commodity';
    return ctx.bankHas({ [a.card]: 1 }) ? null : 'The bank has none left';
  },
  apply(ctx, a) {
    const d = civData(ctx);
    d.anyPicks![a.player] = anyPicksOf(ctx, a.player) - 1;
    ctx.grant(a.player, { [a.card]: 1 });
    ctx.emit({ type: 'civPick', player: a.player, card: a.card });
  },
  enumerate(ctx, player) {
    if (anyPicksOf(ctx, player) < 1) return [];
    return anyCards(ctx)
      .filter((card) => ctx.bankHas({ [card]: 1 }))
      .map((card) => ({ type: 'civPickAny', player, card }));
  },
});

const civPick = action<{ card: string }>({
  check(ctx, a) {
    const err = notOver(ctx);
    if (err) return err;
    if (picksOf(ctx, a.player) < 1) return 'Nothing to pick';
    if (!(RESOURCES as readonly string[]).includes(a.card)) return 'Pick a resource';
    return ctx.bankHas({ [a.card]: 1 }) ? null : 'The bank has none left';
  },
  apply(ctx, a) {
    const d = civData(ctx);
    d.picks[a.player] = picksOf(ctx, a.player) - 1;
    ctx.grant(a.player, { [a.card]: 1 });
    ctx.emit({ type: 'civPick', player: a.player, card: a.card });
  },
  enumerate(ctx, player) {
    if (picksOf(ctx, player) < 1) return [];
    return RESOURCES.map((card) => ({ type: 'civPick', player, card }));
  },
});

// ---- "Any card" swaps ----

export const swapsOf = (ctx: Ctx, seat: number): string[] => civView(ctx).swaps?.[seat] ?? [];

const anyCards = (ctx: Ctx) => [...RESOURCES, ...commoditiesIn(ctx)];

const civSwap = action<{ give: string; get: string }>({
  check(ctx, a) {
    const err = notOver(ctx);
    if (err) return err;
    if (!swapsOf(ctx, a.player).includes(a.give)) return 'You can not swap that card now';
    if (!ctx.has(a.player, { [a.give]: 1 })) return `You have no ${a.give}`;
    if (a.get === a.give || !anyCards(ctx).includes(a.get)) return 'Pick another card';
    return ctx.bankHas({ [a.get]: 1 }) ? null : 'The bank has none left';
  },
  apply(ctx, a) {
    civData(ctx).swaps[a.player] = [];
    ctx.pay(a.player, { [a.give]: 1 });
    ctx.grant(a.player, { [a.get]: 1 });
    ctx.emit({ type: 'civSwap', player: a.player, gave: a.give, got: a.get });
  },
  enumerate(ctx, player) {
    const out: Action[] = [];
    for (const give of swapsOf(ctx, player))
      if (ctx.has(player, { [give]: 1 }))
        for (const get of anyCards(ctx))
          if (get !== give) out.push({ type: 'civSwap', player, give, get });
    return out;
  },
});

// ---- Calendar swaps ----

/** The track each civilisation's once-a-game calendar swap works on. */
export const CALENDAR: Record<string, Track> = {
  amazon: 'magic',
  korea: 'science',
  netherlands: 'trade',
  judea: 'religion',
  russia: 'politics',
};

export function calendarTrack(ctx: Ctx, seat: number): Track | null {
  for (const [civ, track] of Object.entries(CALENDAR))
    if (playsLater(ctx, seat, civ) && isActiveTrack(ctx, track)) return track;
  return null;
}

const civCalendar = action<{ target: number }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    const track = calendarTrack(ctx, a.player);
    if (!track) return 'Your civilisation has no calendar swap yet';
    if (usedOnce(ctx, a.player, 'calendar')) return 'Once a game';
    if (a.target === a.player || !ctx.state.players[a.target]) return 'Pick another player';
    if (levels(ctx, a.target)[track] < 1 && levels(ctx, a.player)[track] >= MAX_LEVEL)
      return 'That would change nothing';
    return null;
  },
  apply(ctx, a) {
    const track = calendarTrack(ctx, a.player)!;
    markOnce(ctx, a.player, 'calendar');
    ctx.emit({ type: 'civCalendar', player: a.player, target: a.target, track });
    lowerTrack(ctx, a.target, track);
    if (levels(ctx, a.player)[track] < MAX_LEVEL) raiseTrack(ctx, a.player, track);
  },
  enumerate(ctx, player) {
    if (!calendarTrack(ctx, player) || usedOnce(ctx, player, 'calendar')) return [];
    return ctx.state.players
      .filter((p) => p.seat !== player)
      .map((p) => ({ type: 'civCalendar', player, target: p.seat }));
  },
});

export const giftActions: Record<string, ActionDef> = {
  civRoute,
  civKnight,
  civSettle,
  civHarvest,
  civImprove,
  civHarbor,
  civSilk,
  civProgress,
  civPick,
  civPickAny,
  civSwap,
  civCalendar,
};
