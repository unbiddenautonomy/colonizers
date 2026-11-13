import type {
  Action,
  ActionDef,
  Cards,
  CornerId,
  Ctx,
  EdgeId,
  GameEvent,
  HexId,
  HexState,
  Piece,
} from '@colonizers/engine';
import { RESOURCES } from '@colonizers/module-base';
import { islandOf } from '@colonizers/module-seafarers';
import {
  ckData,
  drawProgress,
  gateOpen,
  isActiveTrack,
  progressOverLimit,
  rollEventDie,
  TERRAIN_COMMODITY,
  TRACK_COMMODITY,
  wildDecks,
  type Track,
} from '@colonizers/module-cities-knights';
import {
  builtWonders,
  sitesFor,
  stageItem,
  wonderBlocked,
  type WonderData,
} from '@colonizers/module-world-wonders';
import { khaganSpoils, startMuscovy } from './board.ts';
import {
  addGift,
  addPicks,
  civData,
  civOf,
  civView,
  classOf,
  markOnce,
  MODULE_ID,
  plays,
  playsLater,
  progressCheck,
  raiseTrack,
  touchesTerrain,
  usedOnce,
} from './core.ts';
import { addAnyPick, dropDeadProgress, offerHarvest } from './gifts.ts';
import { americaCity, part3Effects, prussiaBeer } from './part3.ts';
import { shipGift } from './setup.ts';

/** Civilisation abilities worked out from what happens in the game. */

const VP_TO_UNLOCK = 10;

/** Terrain whose production a civilisation may swap for any card, and when. */
const ANY_CARD: { civ: string; terrain: string; later: boolean }[] = [
  { civ: 'amazon', terrain: 'forest', later: false },
  { civ: 'kongo', terrain: 'pasture', later: true },
  { civ: 'australia', terrain: 'hills', later: false },
  { civ: 'zulu', terrain: 'fields', later: true },
  { civ: 'papua', terrain: 'mountains', later: true },
];

/** The resource that matches each track's commodity (Korea). */
export const TRACK_RESOURCE: Partial<Record<Track, string>> = {
  science: 'lumber',
  trade: 'wool',
  politics: 'ore',
  magic: 'brick',
  religion: 'grain',
};

/** The commodity that matches each resource (Morocco's Trade Gate). */
export const RESOURCE_COMMODITY: Record<string, string> = {
  lumber: 'paper',
  wool: 'cloth',
  ore: 'coin',
  brick: 'crystal',
  grain: 'bread',
};

function rolled(ctx: Ctx): GameEvent[] {
  return ctx.events.filter((e) => e.type === 'rolled');
}

/** "Any card" swaps from this roll: the cards each player got from their terrain. */
function anyCardSwaps(ctx: Ctx): void {
  const rolls = rolled(ctx);
  if (!rolls.length) return;
  const d = civData(ctx);
  d.swaps = {};
  for (const r of rolls) {
    const total = r.total as number;
    for (const { civ, terrain, later } of ANY_CARD) {
      const seat = Object.keys(d.civ)
        .map(Number)
        .find((s) => d.civ[s] === civ);
      if (seat === undefined || !(later ? playsLater(ctx, seat, civ) : plays(ctx, seat, civ)))
        continue;
      const cards = new Set<string>();
      for (const h of ctx.geometry.hexes) {
        const hex = ctx.state.hexes[h];
        if (!hex || hex.type !== terrain || hex.token !== total) continue;
        for (const c of ctx.geometry.hexCorners.get(h) ?? []) {
          const b = ctx.buildingAt(c);
          if (!b || b.owner !== seat) continue;
          const robbed = ctx.piecesAt({ kind: 'hex', id: h }).some((p) => p.type === 'robber');
          if (ctx.reduce('hexBlocked', hex, b, robbed)) continue;
          const res = ctx.registry.hexTypes[hex.type]?.produces;
          if (res) cards.add(res);
          const com = TERRAIN_COMMODITY[hex.type];
          if (b.type === 'city' && com) cards.add(com);
        }
      }
      if (cards.size) {
        d.swaps[seat] = [...cards];
        ctx.emit({ type: 'civSwapReady', player: seat, cards: [...cards] });
      }
    }
  }
}

/** Korea: each progress card drawn brings its track's resource, the second in a round its commodity. */
function joseon(ctx: Ctx): void {
  for (const e of ctx.events) {
    if (e.type !== 'progressDrawn' || !plays(ctx, e.player as number, 'korea')) continue;
    const seat = e.player as number;
    const track = e.deck as Track;
    const d = civData(ctx);
    const key = `${seat}:${track}`;
    const round = ctx.state.turn.round;
    const second = (d.korea ??= {})[key] === round;
    d.korea[key] = round;
    const card = second ? TRACK_COMMODITY[track] : TRACK_RESOURCE[track];
    if (!card) {
      addPicks(ctx, seat, 1, 'Joseon Dynasty');
      continue;
    }
    if (!ctx.bankHas({ [card]: 1 })) continue;
    ctx.grant(seat, { [card]: 1 });
    ctx.emit({ type: 'civGain', player: seat, card, why: 'Joseon Dynasty' });
  }
}

/** New buildings: Republic harvests, the Dutch free road, Egypt's free improvement. */
function newBuildings(ctx: Ctx): void {
  if (!civView(ctx).started) return;
  for (const e of ctx.events) {
    if (e.type !== 'built' || (e.piece !== 'settlement' && e.piece !== 'city')) continue;
    const seat = e.player as number;
    const city = e.piece === 'city';
    if (classOf(ctx, seat) === 'republic') offerHarvest(ctx, seat, e.at as CornerId, city);
    if (!city && plays(ctx, seat, 'netherlands')) addGift(ctx, seat, { kind: 'route' });
    if (city && plays(ctx, seat, 'egypt')) addGift(ctx, seat, { kind: 'improve' });
  }
}

const robberAwake = (ctx: Ctx) => ckData(ctx).robberActive === true;

function rollEffects(ctx: Ctx): void {
  let drew = false;
  for (const r of rolled(ctx)) {
    if (r.total === 7) civData(ctx).firstSeven = true;
    const dice = (r.dice ?? {}) as Record<string, unknown>;
    const seat = r.player as number;
    if (seat !== ctx.active) continue;
    const event = dice.event as string | undefined;
    const red = dice.red as number;
    // Persia: the barbarian ship on your own roll.
    if ((event === 'ship' || event === 'wild') && playsLater(ctx, seat, 'persia'))
      addPicks(ctx, seat, 1, 'Achaemenid Legacy');
    // Austria: a gate brings its card, whatever your level.
    if (
      isActiveTrack(ctx, event) &&
      plays(ctx, seat, 'austria') &&
      !gateOpen(ctx, seat, event, red) &&
      drawProgress(ctx, seat, event)
    ) {
      drew = true;
      ctx.emit({ type: 'civVienna', player: seat, deck: event });
    }
    // Maori: a gate brings any card of your choice.
    if (isActiveTrack(ctx, event) && plays(ctx, seat, 'maori'))
      addAnyPick(ctx, seat, 'Haka Ceremony');
    // Mongolia: the robber moves on a 3 or 11 too.
    if ((r.total === 3 || r.total === 11) && plays(ctx, seat, 'mongolia') && robberAwake(ctx))
      civData(ctx).khagan = ctx.state.turn.number;
    // Gran Colombia: the red and event dice again, for an extra card.
    if (playsLater(ctx, seat, 'granColombia') && elDorado(ctx, seat)) drew = true;
  }
  if (drew) progressCheck(ctx);
}

function elDorado(ctx: Ctx, seat: number): boolean {
  const red = ctx.rng.int(1, 6);
  const event = rollEventDie(ctx);
  let deck: Track | null = null;
  if (isActiveTrack(ctx, event) && gateOpen(ctx, seat, event, red)) deck = event;
  else if (event === 'wild') deck = wildDecks(ctx, seat, red)[0] ?? null;
  const got = !!deck && drawProgress(ctx, seat, deck);
  ctx.emit({ type: 'civElDorado', player: seat, red, event, deck: got ? deck : null });
  return got;
}

/** Mongolia takes a progress card too when robbing with the robber. */
function khagan(ctx: Ctx, action: Action | undefined): void {
  if (!action) return;
  const placed =
    action.type === 'steal' ||
    ctx.events.some((e) => e.type === 'robberMoved' && e.player === action.player);
  if (!placed) return;
  for (const e of ctx.events)
    if (e.type === 'stole' && plays(ctx, e.thief as number, 'mongolia'))
      khaganSpoils(ctx, e.victim as number, e.thief as number);
}

/** Maasai: cities by mountains take a resource from another hex beside them. */
function kilimanjaro(ctx: Ctx): void {
  for (const e of ctx.events) {
    if (e.type !== 'production') continue;
    for (const p of ctx.state.players) {
      if (!playsLater(ctx, p.seat, 'maasai')) continue;
      for (const city of ctx.piecesOf(p.seat, 'city')) {
        if (city.at.kind !== 'corner') continue;
        const paid = (ctx.geometry.cornerHexes.get(city.at.id) ?? []).find((h) => {
          const hex = ctx.state.hexes[h];
          if (!hex || hex.type !== 'mountains' || hex.token !== e.total) return false;
          const robbed = ctx.piecesAt({ kind: 'hex', id: h }).some((x) => x.type === 'robber');
          return !ctx.reduce('hexBlocked', hex, city, robbed);
        });
        if (paid) offerHarvest(ctx, p.seat, city.at.id, false, paid);
      }
    }
  }
}

/** Maori: a city and a settlement on two different islands. */
function polynesia(ctx: Ctx): void {
  for (const p of ctx.state.players) {
    const seat = p.seat;
    if (!playsLater(ctx, seat, 'maori') || usedOnce(ctx, seat, 'polynesia')) continue;
    const isles = (type: string) =>
      new Set(
        ctx
          .piecesOf(seat, type)
          .flatMap((b) => (b.at.kind === 'corner' ? [islandOf(ctx, b.at.id)] : []))
          .filter((x): x is string => !!x),
      );
    const cities = isles('city');
    const towns = isles('settlement');
    if (![...cities].some((c) => [...towns].some((t) => t !== c))) continue;
    markOnce(ctx, seat, 'polynesia');
    ctx.emit({ type: 'civPolynesia', player: seat });
    for (let i = 0; i < 3; i++) addGift(ctx, seat, { kind: 'route', only: 'road' });
    for (let i = 0; i < 3; i++) addGift(ctx, seat, { kind: 'progress' });
  }
}

/** Inuit: wool and cloth don't count when working out a discard. */
function permafrost(ctx: Ctx): void {
  const ph = ctx.state.phase;
  if (ph.id !== 'discard' || !ctx.events.some((e) => e.type === 'phase' && e.to === 'discard'))
    return;
  const owed = ph.owed as Record<number, number> | undefined;
  if (!owed) return;
  for (const p of ctx.state.players) {
    if (owed[p.seat] === undefined || !plays(ctx, p.seat, 'inuit')) continue;
    const size = Object.entries(p.hand)
      .filter(([c]) => c !== 'wool' && c !== 'cloth')
      .reduce((s, [, n]) => s + n, 0);
    const limit = ctx.reduce('handLimit', p.seat, ctx.setting<number>('discardLimit') ?? 7);
    if (size > limit) owed[p.seat] = Math.floor(size / 2);
    else delete owed[p.seat];
  }
}

/** The first time a player reaches 10 points. */
function unlocks(ctx: Ctx): void {
  const d = civView(ctx);
  if (!d.revealed) return;
  for (const p of ctx.state.players) {
    const c = civOf(ctx, p.seat);
    if (!c || d.unlocked?.[p.seat] || ctx.vp(p.seat) < VP_TO_UNLOCK) continue;
    const seat = p.seat;
    civData(ctx).unlocked[seat] = true;
    ctx.emit({ type: 'civUnlocked', player: seat, civ: c.id });
    const gold = (n: number) => {
      const got = Math.min(n, ctx.state.bank.gold ?? 0);
      if (got > 0) ctx.grant(seat, { gold: got });
    };
    if (c.id === 'mali') {
      gold(2);
      raiseTrack(ctx, seat, 'wealth');
    }
    if (c.id === 'granColombia') gold(1);
    if (c.id === 'mongolia') {
      for (let i = 0; i < 4; i++) addGift(ctx, seat, { kind: 'route', only: 'road' });
      addGift(ctx, seat, { kind: 'settlement', where: 'inland' });
    }
    if (c.id === 'indonesia') {
      for (let i = 0; i < 4; i++) addGift(ctx, seat, shipGift(ctx));
      addGift(ctx, seat, { kind: 'settlement', where: 'coastal' });
    }
    if (c.id === 'australia') addGift(ctx, seat, { kind: 'settlement', where: 'island' });
    if (c.id === 'prussia') prussiaBeer(ctx, seat);
  }
}

export function civEffects(ctx: Ctx, action?: Action): void {
  if (!civView(ctx).revealed) return;
  rollEffects(ctx);
  anyCardSwaps(ctx);
  joseon(ctx);
  newBuildings(ctx);
  khagan(ctx, action);
  kilimanjaro(ctx);
  permafrost(ctx);
  unlocks(ctx);
  polynesia(ctx);
  part3Effects(ctx);
  startMuscovy(ctx);
  dropDeadProgress(ctx);
}

// ---- The Inca's Kingdom of Cuzco ----

const CUZCO = ['mountains', 'pasture'];

/** The corner a settlement is being built on, while its price is worked out. */
let buildingAt: CornerId | null = null;

const cuzcoCorner = (ctx: Ctx, seat: number, corner: CornerId | null) =>
  !!corner &&
  plays(ctx, seat, 'inca') &&
  touchesTerrain(ctx, ctx.geometry.cornerHexes.get(corner) ?? [], CUZCO);

function at<T>(corner: CornerId | null, f: () => T): T {
  const was = buildingAt;
  buildingAt = corner;
  try {
    return f();
  } finally {
    buildingAt = was;
  }
}

export function wrapBuildSettlement(prev: ActionDef): ActionDef {
  return {
    ...prev,
    check: (ctx, a) => at(a.corner as CornerId, () => prev.check(ctx, a)),
    apply: (ctx, a) => at(a.corner as CornerId, () => prev.apply(ctx, a)),
    enumerate(ctx, player) {
      const out = prev.enumerate?.(ctx, player) ?? [];
      if (out.length || player !== ctx.active || !plays(ctx, player, 'inca')) return out;
      return ctx.geometry.corners
        .filter((corner) => cuzcoCorner(ctx, player, corner))
        .map((corner) => ({ type: 'buildSettlement', player, corner }))
        .filter((x) => at(x.corner, () => prev.check(ctx, x)) === null);
    },
  };
}

/** The Inca: a road you pay for by mountains or pasture brings a second, free. */
export function wrapBuildRoad(prev: ActionDef): ActionDef {
  return {
    ...prev,
    apply(ctx, a) {
      prev.apply(ctx, a);
      const edge = a.edge as EdgeId;
      if (
        plays(ctx, a.player, 'inca') &&
        touchesTerrain(ctx, ctx.geometry.edgeHexes.get(edge) ?? [], CUZCO)
      ) {
        addGift(ctx, a.player, { kind: 'route', only: 'road' });
        ctx.emit({ type: 'civCuzco', player: a.player });
      }
    },
  };
}

// ---- Reducers ----

export function civCost(ctx: Ctx, item: string, seat: number, cost: Cards): Cards {
  const value = americaCity(ctx, item, seat, cost);
  // Kongo, and the Inca by mountains or pasture: settlements cost one card
  // less, the one you lack if any.
  if (item === 'settlement' && (plays(ctx, seat, 'kongo') || cuzcoCorner(ctx, seat, buildingAt))) {
    const types = Object.keys(value).filter((c) => (value[c] ?? 0) > 0);
    const hand = ctx.player(seat).hand;
    const drop = types.find((c) => (hand[c] ?? 0) < (value[c] ?? 0)) ?? types[types.length - 1];
    if (drop) return { ...value, [drop]: (value[drop] ?? 0) - 1 };
  }
  // Monument: your wonder's first stage is free.
  const civ = civOf(ctx, seat);
  if (civ?.wonder && item === stageItem(civ.wonder.id, 1)) return {};
  return value;
}

/** Inuit's Polar Circle: the land hexes beside the northernmost row of sea. */
export function polarHexes(ctx: Ctx): Set<HexId> {
  const isSea = (h: HexId) => {
    const x = ctx.state.hexes[h];
    return !!x && ctx.registry.hexTypes[x.type]?.terrain === 'sea';
  };
  const seas = ctx.geometry.hexes.filter(isSea);
  const rowOf = (h: HexId) => Number(h.slice(2).split(',')[1]);
  const top = Math.min(...seas.map(rowOf));
  const out = new Set<HexId>();
  for (const s of seas.filter((h) => rowOf(h) === top))
    for (const n of ctx.geometry.hexNeighbours.get(s) ?? []) if (!isSea(n)) out.add(n);
  return out;
}

export function civYield(ctx: Ctx, hex: HexState, piece: Piece, value: Cards): Cards {
  const owner = piece.owner;
  if (owner === null) return value;
  let v = value;
  // Morocco: until the first 7, everyone else takes resources instead of commodities.
  const morocco = Object.entries(civView(ctx).civ ?? {}).find(([, c]) => c === 'morocco');
  if (
    morocco &&
    civView(ctx).revealed &&
    Number(morocco[0]) !== owner &&
    !civView(ctx).firstSeven
  ) {
    const com = TERRAIN_COMMODITY[hex.type];
    const res = ctx.registry.hexTypes[hex.type]?.produces;
    if (com && res && v[com]) {
      v = { ...v, [res]: (v[res] ?? 0) + (v[com] ?? 0) };
      delete v[com];
    }
  }
  // Inuit: one more card from hexes by the northernmost sea.
  if (playsLater(ctx, owner, 'inuit') && polarHexes(ctx).has(hex.id)) {
    const res = ctx.registry.hexTypes[hex.type]?.produces;
    if (res && Object.keys(v).length) v = { ...v, [res]: (v[res] ?? 0) + 1 };
  }
  return v;
}

export function civSwapRatio(
  ctx: Ctx,
  seat: number,
  give: string,
  get: string,
  value: number,
): number {
  let v = value;
  if (playsLater(ctx, seat, 'morocco') && RESOURCE_COMMODITY[give] === get) v = Math.min(v, 2);
  if (playsLater(ctx, seat, 'egypt')) {
    const pair = [give, get].sort().join('+');
    if (pair === 'lumber+wool' || pair === 'cloth+paper') v = Math.min(v, 1);
  }
  // China: a 2:1 harbor of their choice.
  if (civView(ctx).silk?.[seat] === give) v = Math.min(v, 2);
  // Maasai: their scarcest resource 1:1 for other resources.
  if (
    plays(ctx, seat, 'maasai') &&
    civView(ctx).lake?.[seat] === give &&
    (RESOURCES as readonly string[]).includes(get)
  )
    v = Math.min(v, 1);
  return v;
}

// ---- Wrapped actions ----

/** Innovator: after a city improvement, the red die may bring that track's card. */
export function wrapImprove(prev: ActionDef): ActionDef {
  return {
    ...prev,
    apply(ctx, a) {
      prev.apply(ctx, a);
      if (classOf(ctx, a.player) !== 'innovator') return;
      const track = a.track as Track;
      const red = ctx.rng.int(1, 6);
      const lucky = gateOpen(ctx, a.player, track, red) && !!ctx.state.decks[track]?.length;
      ctx.emit({ type: 'civInnovation', player: a.player, track, red, lucky });
      if (!lucky) return;
      drawProgress(ctx, a.player, track);
      if (ctx.state.phase.id === 'progressDiscard') return;
      const owed = progressOverLimit(ctx);
      if (Object.keys(owed).length)
        ctx.setPhase({ id: 'progressDiscard', owed, returnTo: ctx.state.phase });
    },
  };
}

/** Monument: your wonder starts with a lower requirement. */
function monumentSites(ctx: Ctx, seat: number, wonder: string): HexId[] {
  const civ = civOf(ctx, seat);
  if (!civ?.wonder || civ.wonder.id !== wonder || builtWonders(ctx)[civ.wonder.id]) return [];
  return sitesFor(ctx, seat, civ.wonder.requirement);
}

export function wrapBuildWonder(prev: ActionDef): ActionDef {
  return {
    ...prev,
    check(ctx, a) {
      const err = prev.check(ctx, a);
      if (!err || a.player !== ctx.active || !a.hex) return err;
      const sites = monumentSites(ctx, a.player, a.wonder as string);
      if (!sites.includes(a.hex as HexId)) return err;
      const w = ctx.state.data['world-wonders'] as WonderData | undefined;
      if (w?.lastStage?.[a.player] === ctx.state.turn.number)
        return 'You have built a wonder stage this turn';
      if (wonderBlocked(ctx, a.hex as HexId)) return 'Move the robber off that hex first';
      return null;
    },
    enumerate(ctx, player) {
      const out = prev.enumerate?.(ctx, player) ?? [];
      const civ = civOf(ctx, player);
      if (player !== ctx.active || !civ?.wonder) return out;
      const have = new Set(out.map((x) => `${x.wonder}:${x.hex}`));
      for (const hex of monumentSites(ctx, player, civ.wonder.id))
        if (!have.has(`${civ.wonder.id}:${hex}`))
          out.push({ type: 'buildWonder', player, wonder: civ.wonder.id, hex });
      return out;
    },
  };
}

/** Inuit: wool and cloth can't be stolen. */
export function wrapSteal(prev: ActionDef): ActionDef {
  return {
    ...prev,
    apply(ctx, a: Action) {
      const victim = a.from as number;
      if (typeof victim !== 'number' || !plays(ctx, victim, 'inuit')) return prev.apply(ctx, a);
      const hand = ctx.player(victim).hand;
      const kept = { wool: hand.wool ?? 0, cloth: hand.cloth ?? 0 };
      hand.wool = 0;
      hand.cloth = 0;
      try {
        prev.apply(ctx, a);
      } finally {
        hand.wool = (hand.wool ?? 0) + kept.wool;
        hand.cloth = (hand.cloth ?? 0) + kept.cloth;
      }
    },
  };
}

export { MODULE_ID };
