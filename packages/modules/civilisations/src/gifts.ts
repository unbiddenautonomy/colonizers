import type { Action, ActionDef, CornerId, Ctx, EdgeId, HexId } from '@colonizers/engine';
import { canPlaceRoad, RESOURCES } from '@colonizers/module-base';
import { canPlaceShip } from '@colonizers/module-seafarers';
import {
  activeTracks,
  canPlaceKnight,
  citiesOf,
  commoditiesIn,
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
  lowerTrack,
  markOnce,
  notOver,
  onlyActive,
  picksOf,
  playsLater,
  raiseTrack,
  takeGift,
  usedOnce,
  type Gift,
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

function routeType(ctx: Ctx, seat: number, edge: EdgeId): 'road' | 'ship' | null {
  if (canPlaceRoad(ctx, seat, edge) === null) return 'road';
  if (hasShips(ctx) && canPlaceShip(ctx, seat, edge) === null) return 'ship';
  return null;
}

const civRoute = action<{ edge: EdgeId }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (giftIndex(ctx, a.player, 'route') < 0) return 'You have no free road';
    return routeType(ctx, a.player, a.edge) ? null : 'You can not build there';
  },
  apply(ctx, a) {
    takeGift(ctx, a.player, giftIndex(ctx, a.player, 'route'));
    const piece = routeType(ctx, a.player, a.edge)!;
    ctx.place(piece, a.player, { kind: 'edge', id: a.edge });
    ctx.emit({ type: 'built', player: a.player, piece, at: a.edge, free: true });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || giftIndex(ctx, player, 'route') < 0) return [];
    return ctx.geometry.edges
      .filter((edge) => routeType(ctx, player, edge))
      .map((edge) => ({ type: 'civRoute', player, edge }));
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

export function harvestHexes(ctx: Ctx, corner: CornerId, city: boolean): HexId[] {
  return (ctx.geometry.cornerHexes.get(corner) ?? []).filter((h) => {
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
    return harvestHexes(ctx, first.g.corner, first.g.city).includes(a.hex)
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
    return harvestHexes(ctx, first.g.corner, first.g.city).map((hex) => ({
      type: 'civHarvest',
      player,
      hex,
    }));
  },
});

/** A Republic's new building: a harvest, if any hex beside it has a card to give. */
export function offerHarvest(ctx: Ctx, seat: number, corner: CornerId, city: boolean): void {
  if (!harvestHexes(ctx, corner, city).length) return;
  (civData(ctx).gifts[seat] ??= []).push({ kind: 'harvest', corner, city });
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
  civHarvest,
  civImprove,
  civPick,
  civSwap,
  civCalendar,
};
