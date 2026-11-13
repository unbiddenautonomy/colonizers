import type {
  Action,
  ActionDef,
  Cards,
  CornerId,
  Ctx,
  GameEvent,
  HexId,
  HexState,
  Piece,
} from '@colonizers/engine';
import {
  drawProgress,
  gateOpen,
  progressOverLimit,
  TERRAIN_COMMODITY,
  TRACK_COMMODITY,
  type Track,
} from '@colonizers/module-cities-knights';
import {
  builtWonders,
  sitesFor,
  stageItem,
  wonderBlocked,
  type WonderData,
} from '@colonizers/module-world-wonders';
import {
  addGift,
  addPicks,
  civData,
  civOf,
  civView,
  classOf,
  MODULE_ID,
  plays,
  playsLater,
  raiseTrack,
} from './core.ts';
import { offerHarvest } from './gifts.ts';

/** Civilisation abilities worked out from what happens in the game. */

const VP_TO_UNLOCK = 10;

/** Terrain whose production a civilisation may swap for any card, and when. */
const ANY_CARD: { civ: string; terrain: string; later: boolean }[] = [
  { civ: 'amazon', terrain: 'forest', later: false },
  { civ: 'kongo', terrain: 'pasture', later: true },
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

function rollEffects(ctx: Ctx): void {
  for (const r of rolled(ctx)) {
    if (r.total === 7) civData(ctx).firstSeven = true;
    const dice = (r.dice ?? {}) as Record<string, unknown>;
    const seat = r.player as number;
    // Persia: the barbarian ship on your own roll.
    if (
      (dice.event === 'ship' || dice.event === 'wild') &&
      seat === ctx.active &&
      playsLater(ctx, seat, 'persia')
    )
      addPicks(ctx, seat, 1, 'Achaemenid Legacy');
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
    civData(ctx).unlocked[p.seat] = true;
    ctx.emit({ type: 'civUnlocked', player: p.seat, civ: c.id });
    if (c.id === 'mali') {
      const gold = Math.min(2, ctx.state.bank.gold ?? 0);
      if (gold > 0) ctx.grant(p.seat, { gold });
      raiseTrack(ctx, p.seat, 'wealth');
    }
  }
}

export function civEffects(ctx: Ctx): void {
  if (!civView(ctx).revealed) return;
  rollEffects(ctx);
  anyCardSwaps(ctx);
  joseon(ctx);
  newBuildings(ctx);
  permafrost(ctx);
  unlocks(ctx);
}

// ---- Reducers ----

export function civCost(ctx: Ctx, item: string, seat: number, value: Cards): Cards {
  // Kongo: settlements cost one card less, the one you lack if any.
  if (item === 'settlement' && plays(ctx, seat, 'kongo')) {
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
