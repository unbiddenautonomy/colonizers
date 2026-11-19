import type { Action, ActionDef, Cards, CornerId, Ctx, GameEvent, HexId } from '@colonizers/engine';
import { distanceRuleOk, RESOURCES } from '@colonizers/module-base';
import { islands, islandOf } from '@colonizers/module-seafarers';
import {
  citiesOf,
  cityAtRisk,
  commoditiesIn,
  drawProgress,
  gateOpen,
  isActive,
  isActiveTrack,
  knightAt,
  knightLevel,
  pillage,
  TERRAIN_COMMODITY,
  TRACK_COMMODITY,
  type Track,
} from '@colonizers/module-cities-knights';
import {
  addBeer,
  beerOf,
  buildBlock,
  buildingsOf,
  FESTIVALS,
} from '@colonizers/module-greed-wealth-power';
import { ROAMING } from '@colonizers/module-world-wonders';
import {
  action,
  addGift,
  civData,
  civView,
  giftsOf,
  markUse,
  onlyActive,
  owes,
  plays,
  playsLater,
  progressCheck,
  seatOf,
  takeGift,
  usedCount,
  type Gift,
} from './core.ts';

/**
 * Civilisations part 3: starting buildings, knights, welfare and revenge.
 * Khmer, Rome, Babylon, India, Maya, Ethiopia, Japan, Zulu, Prussia, America
 * and Papua.
 */

// ---- Free buildings (Khmer, Rome, Maya) ----

type BuildingGift = Extract<Gift, { kind: 'building' }>;

const buildingGifts = (ctx: Ctx, seat: number) =>
  giftsOf(ctx, seat)
    .map((g, i) => ({ g, i }))
    .filter((x): x is { g: BuildingGift; i: number } => x.g.kind === 'building');

/** Can this free building go here? The usual rules, without the price. */
export function freeBuildingBlock(
  ctx: Ctx,
  seat: number,
  building: string,
  corner: CornerId,
  hex: HexId,
): string | null {
  if (!buildingGifts(ctx, seat).some(({ g }) => (g.options as string[]).includes(building)))
    return 'You have no free building of that kind';
  if (ctx.buildingAt(corner)?.type !== 'city') return 'It goes beside one of your cities';
  const err = buildBlock(ctx, seat, building as 'citadel', corner, hex);
  return err?.startsWith('You can not afford') ? null : err;
}

const civBuilding = action<{ building: 'citadel' | 'diocese'; corner: CornerId; hex: HexId }>({
  phases: ['main'],
  check(ctx, a) {
    return onlyActive(ctx, a) ?? freeBuildingBlock(ctx, a.player, a.building, a.corner, a.hex);
  },
  apply(ctx, a) {
    const gift = buildingGifts(ctx, a.player).find(({ g }) => g.options.includes(a.building))!;
    takeGift(ctx, a.player, gift.i);
    buildingsOf(ctx, a.player)[a.building] = { corner: a.corner, hex: a.hex };
    ctx.emit({
      type: 'gwpBuilt',
      player: a.player,
      building: a.building,
      at: a.corner,
      hex: a.hex,
      free: true,
    });
  },
  enumerate(ctx, player) {
    const gifts = buildingGifts(ctx, player);
    if (player !== ctx.active || !gifts.length) return [];
    const kinds = [...new Set(gifts.flatMap(({ g }) => g.options))];
    const out: Action[] = [];
    for (const city of citiesOf(ctx, player)) {
      if (city.at.kind !== 'corner') continue;
      const corner = city.at.id;
      for (const hex of ctx.geometry.cornerHexes.get(corner) ?? [])
        for (const building of kinds)
          if (!freeBuildingBlock(ctx, player, building, corner, hex))
            out.push({ type: 'civBuilding', player, building, corner, hex });
    }
    return out;
  },
});

// ---- Rome: All Roads lead to Rome ----

/** What Rome pays to annex a building: what it would cost to build. */
export function annexPrice(ctx: Ctx, seat: number, type: string): Cards {
  const out: Cards = { ...ctx.cost('settlement', seat) };
  if (type === 'city')
    for (const [c, n] of Object.entries(ctx.cost('city', seat))) out[c] = (out[c] ?? 0) + n;
  return out;
}

export function annexTargets(ctx: Ctx, seat: number): CornerId[] {
  return ctx.geometry.corners.filter((c) => {
    const b = ctx.buildingAt(c);
    if (!b || b.owner === null || b.owner === seat || b.props.metropolis) return false;
    if (b.type !== 'settlement' && b.type !== 'city') return false;
    if (ctx.supplyLeft(seat, b.type) <= 0) return false;
    const touches = (ctx.geometry.cornerEdges.get(c) ?? []).some((e) =>
      ctx.piecesAt({ kind: 'edge', id: e }).some((p) => p.owner === seat && p.type === 'road'),
    );
    return touches && ctx.has(seat, annexPrice(ctx, seat, b.type));
  });
}

const civAnnex = action<{ corner: CornerId }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (!playsLater(ctx, a.player, 'rome')) return 'Only Rome, from 10 points';
    if (usedCount(ctx, a.player, 'annex') >= 2) return 'Twice a game';
    return annexTargets(ctx, a.player).includes(a.corner)
      ? null
      : "Pick a rival's settlement or city by your roads that you can pay for";
  },
  apply(ctx, a) {
    markUse(ctx, a.player, 'annex');
    const b = ctx.buildingAt(a.corner)!;
    const victim = b.owner as number;
    ctx.transfer(a.player, victim, annexPrice(ctx, a.player, b.type));
    const type = b.type;
    ctx.remove(b);
    ctx.place(type, a.player, { kind: 'corner', id: a.corner });
    ctx.emit({ type: 'civAnnex', player: a.player, victim, at: a.corner, piece: type });
  },
  enumerate(ctx, player) {
    if (
      player !== ctx.active ||
      !playsLater(ctx, player, 'rome') ||
      usedCount(ctx, player, 'annex') >= 2
    )
      return [];
    return annexTargets(ctx, player).map((corner) => ({ type: 'civAnnex', player, corner }));
  },
});

// ---- Babylon: Code of Hammurabi ----

/** Events that harm someone, and the field naming who. */
const HARM: Record<string, string> = {
  stole: 'victim',
  knightDisplaced: 'victim',
  tookCards: 'from',
  spied: 'from',
  progressTaken: 'from',
  festival: 'target',
  missionary: 'target',
  knightsDeactivated: 'target',
  summoned: 'owner',
  civSpoils: 'from',
  civRevolution: 'victim',
  civCalendar: 'target',
  civAnnex: 'victim',
  civHarakiri: 'victim',
  civCurse: 'target',
};

const harmer = (e: GameEvent): number | null => {
  const by = (e.player ?? e.thief) as number | undefined;
  return typeof by === 'number' ? by : null;
};

/** Babylon may strike back at whoever harmed them. */
function hammurabi(ctx: Ctx): void {
  const babylon = seatOf(ctx, 'babylon');
  if (babylon === null || !playsLater(ctx, babylon, 'babylon')) return;
  const struck = new Set<number>();
  for (const e of ctx.events) {
    const field = HARM[e.type];
    if (!field || e[field] !== babylon) continue;
    const by = harmer(e);
    if (by === null || by === babylon || struck.has(by)) continue;
    struck.add(by);
    addGift(ctx, babylon, { kind: 'revenge', target: by });
    ctx.emit({ type: 'civRevengeReady', player: babylon, target: by });
  }
}

/** A road, ship (edge) or inactive basic knight (corner) of the target. */
export function revengeTargets(ctx: Ctx, target: number): string[] {
  return ctx.piecesOf(target).flatMap((p) => {
    if (p.at.kind === 'edge' && ctx.registry.pieceTypes[p.type]?.route) return [p.at.id];
    if (p.at.kind === 'corner' && p.type === 'knight1' && !isActive(p)) return [p.at.id];
    return [];
  });
}

const revengeGifts = (ctx: Ctx, seat: number) =>
  giftsOf(ctx, seat)
    .map((g, i) => ({ g, i }))
    .filter(
      (x): x is { g: Extract<Gift, { kind: 'revenge' }>; i: number } => x.g.kind === 'revenge',
    );

const civRevenge = action<{ at: string }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    const ok = revengeGifts(ctx, a.player).some(({ g }) =>
      revengeTargets(ctx, g.target).includes(a.at),
    );
    return ok ? null : 'Pick a road, ship or inactive basic knight of a player who harmed you';
  },
  apply(ctx, a) {
    const gift = revengeGifts(ctx, a.player).find(({ g }) =>
      revengeTargets(ctx, g.target).includes(a.at),
    )!;
    takeGift(ctx, a.player, gift.i);
    const kind = a.at.startsWith('e:') ? 'edge' : 'corner';
    const piece = ctx.piecesAt({ kind, id: a.at } as never).find((p) => p.owner === gift.g.target)!;
    ctx.remove(piece);
    ctx.emit({ type: 'civRevenge', player: a.player, target: gift.g.target, piece: piece.type });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    const at = new Set(revengeGifts(ctx, player).flatMap(({ g }) => revengeTargets(ctx, g.target)));
    return [...at].map((x) => ({ type: 'civRevenge', player, at: x }));
  },
});

// ---- Prussia: welfare ----

export const welfareOf = (ctx: Ctx, seat: number): number => civView(ctx).welfare?.[seat] ?? 0;

const welfarePrice = (card: string) => ((RESOURCES as readonly string[]).includes(card) ? 2 : 3);

const civWelfare = action<{ card: string }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (!plays(ctx, a.player, 'prussia')) return 'Only Prussia has welfare tokens';
    const cards = [...RESOURCES, ...commoditiesIn(ctx)] as string[];
    if (!cards.includes(a.card)) return 'Pick a resource or commodity';
    if (welfareOf(ctx, a.player) < welfarePrice(a.card))
      return `That takes ${welfarePrice(a.card)} welfare tokens`;
    return ctx.bankHas({ [a.card]: 1 }) ? null : 'The bank has none left';
  },
  apply(ctx, a) {
    const d = civData(ctx);
    (d.welfare ??= {})[a.player] = welfareOf(ctx, a.player) - welfarePrice(a.card);
    ctx.grant(a.player, { [a.card]: 1 });
    ctx.emit({ type: 'civWelfare', player: a.player, card: a.card });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || !plays(ctx, player, 'prussia')) return [];
    const n = welfareOf(ctx, player);
    if (n < 2) return [];
    return ([...RESOURCES, ...commoditiesIn(ctx)] as string[])
      .filter((card) => n >= welfarePrice(card) && ctx.bankHas({ [card]: 1 }))
      .map((card) => ({ type: 'civWelfare', player, card }));
  },
});

/** Prussia's festival discount: Settlement and City festivals 2 Beer less, others 1. */
const festivalDiscount = (kind: string) => (kind === 'settlements' || kind === 'cities' ? 2 : 1);

export function wrapFestival(prev: ActionDef): ActionDef {
  const cost = (a: Action) =>
    Math.max(
      0,
      (FESTIVALS[a.kind as keyof typeof FESTIVALS]?.cost ?? 0) - festivalDiscount(a.kind as string),
    );
  return {
    ...prev,
    check(ctx, a) {
      const err = prev.check(ctx, a);
      if (!err || !playsLater(ctx, a.player, 'prussia') || !err.endsWith('Beer')) return err;
      return beerOf(ctx, a.player) >= cost(a) ? null : `That festival costs you ${cost(a)} Beer`;
    },
    apply(ctx, a) {
      if (!playsLater(ctx, a.player, 'prussia')) return prev.apply(ctx, a);
      const before = beerOf(ctx, a.player);
      prev.apply(ctx, a);
      addBeer(ctx, a.player, before - cost(a) - beerOf(ctx, a.player));
    },
  };
}

// ---- Japan: Samurai Harakiri ----

/** Rival buildings a knight of this level may destroy. */
function harakiriVictims(ctx: Ctx, seat: number, level: number): CornerId[] {
  const type = level === 2 ? 'settlement' : 'city';
  return ctx.geometry.corners.filter((c) => {
    const b = ctx.buildingAt(c);
    return !!b && b.type === type && b.owner !== null && b.owner !== seat && !b.props.metropolis;
  });
}

export function harakiriOptions(ctx: Ctx, seat: number): { knight: CornerId; corner: CornerId }[] {
  const out: { knight: CornerId; corner: CornerId }[] = [];
  for (const k of ctx.piecesOf(seat)) {
    if (k.at.kind !== 'corner' || (k.type !== 'knight2' && k.type !== 'knight3')) continue;
    for (const corner of harakiriVictims(ctx, seat, knightLevel(k)))
      out.push({ knight: k.at.id, corner });
  }
  return out;
}

const civHarakiri = action<{ knight: CornerId; corner: CornerId }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (!playsLater(ctx, a.player, 'japan')) return 'Only Japan, from 10 points';
    if (usedCount(ctx, a.player, 'harakiri') >= 2) return 'Twice a game';
    return harakiriOptions(ctx, a.player).some(
      (o) => o.knight === a.knight && o.corner === a.corner,
    )
      ? null
      : 'A strong knight takes a settlement, a mighty one a city';
  },
  apply(ctx, a) {
    markUse(ctx, a.player, 'harakiri');
    const k = knightAt(ctx, a.knight)!;
    const b = ctx.buildingAt(a.corner)!;
    const victim = b.owner;
    ctx.remove(k);
    ctx.remove(b);
    ctx.emit({ type: 'civHarakiri', player: a.player, victim, piece: b.type, at: a.corner });
  },
  enumerate(ctx, player) {
    if (
      player !== ctx.active ||
      !playsLater(ctx, player, 'japan') ||
      usedCount(ctx, player, 'harakiri') >= 2
    )
      return [];
    return harakiriOptions(ctx, player).map((o) => ({ type: 'civHarakiri', player, ...o }));
  },
});

// ---- Zulu: Iklwa Spear ----

/** Roaming pieces on hexes beside an active basic Zulu knight. */
export function zuluTargets(ctx: Ctx, seat: number): HexId[] {
  const hexes = new Set<HexId>();
  for (const k of ctx.piecesOf(seat, 'knight1'))
    if (k.at.kind === 'corner' && isActive(k))
      for (const h of ctx.geometry.cornerHexes.get(k.at.id) ?? []) hexes.add(h);
  return [...hexes].filter((h) =>
    ctx.piecesAt({ kind: 'hex', id: h }).some((p) => ROAMING.includes(p.type) && p.owner !== seat),
  );
}

const civZulu = action<{ hex: HexId }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (!plays(ctx, a.player, 'zulu')) return 'Only the Zulu can do that';
    return zuluTargets(ctx, a.player).includes(a.hex)
      ? null
      : 'Pick a roaming piece beside one of your active basic knights';
  },
  apply(ctx, a) {
    const piece = ctx
      .piecesAt({ kind: 'hex', id: a.hex })
      .find((p) => ROAMING.includes(p.type) && p.owner !== a.player)!;
    const from = piece.owner;
    piece.owner = a.player;
    const k = ctx
      .piecesOf(a.player, 'knight1')
      .find(
        (x) =>
          x.at.kind === 'corner' &&
          isActive(x) &&
          (ctx.geometry.cornerHexes.get(x.at.id) ?? []).includes(a.hex),
      )!;
    k.props.active = false;
    ctx.emit({ type: 'civZulu', player: a.player, piece: piece.type, from, hex: a.hex });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || !plays(ctx, player, 'zulu')) return [];
    return zuluTargets(ctx, player).map((hex) => ({ type: 'civZulu', player, hex }));
  },
});

/** Zulu knights stay active when they move, once a turn each. */
export function wrapKnightMove(prev: ActionDef): ActionDef {
  return {
    ...prev,
    check(ctx, a) {
      const err = prev.check(ctx, a);
      if (err || !plays(ctx, a.player, 'zulu')) return err;
      const k = ctx.state.pieces[a.knight as string];
      return k?.props.zuluMoved === ctx.state.turn.number
        ? 'That knight has moved this turn'
        : null;
    },
    apply(ctx, a) {
      prev.apply(ctx, a);
      if (!plays(ctx, a.player, 'zulu')) return;
      const k = ctx.state.pieces[a.knight as string];
      if (!k) return;
      k.props.active = true;
      k.props.zuluMoved = ctx.state.turn.number;
    },
    enumerate(ctx, player) {
      const out = prev.enumerate?.(ctx, player) ?? [];
      if (!plays(ctx, player, 'zulu')) return out;
      return out.filter(
        (a) => ctx.state.pieces[a.knight as string]?.props.zuluMoved !== ctx.state.turn.number,
      );
    },
  };
}

// ---- America: Curse of the Medicine Man ----

/** After a lost attack, America may pick one more player to lose a city. */
function curseOnAttack(ctx: Ctx): void {
  const america = seatOf(ctx, 'america');
  if (america === null || !playsLater(ctx, america, 'america')) return;
  const e = ctx.events.find((x) => x.type === 'barbarianAttack' && x.defended === false);
  if (!e) return;
  const strengths = e.strengths as number[];
  if ((strengths[america] ?? 0) <= Math.min(...strengths)) return;
  const targets = curseTargets(ctx, america);
  if (!targets.length) return;
  ctx.setPhase({ id: 'civCurse', owed: { [america]: 1 }, returnTo: ctx.state.phase });
}

export function curseTargets(ctx: Ctx, america: number): number[] {
  return ctx.state.players
    .map((p) => p.seat)
    .filter((s) => s !== america && cityAtRisk(ctx, s).length > 0);
}

const civCurse = action<{ target: number | null }>({
  phases: ['civCurse'],
  check(ctx, a) {
    if (!owes(ctx, a.player)) return 'Not yours to choose';
    if (a.target === null) return null;
    return curseTargets(ctx, a.player).includes(a.target)
      ? null
      : 'Pick a player with a city at risk';
  },
  apply(ctx, a) {
    ctx.setPhase(ctx.state.phase.returnTo as never);
    if (a.target === null) return;
    const city = cityAtRisk(ctx, a.target)[0]!;
    ctx.emit({ type: 'civCurse', player: a.player, target: a.target });
    pillage(ctx, city);
  },
  enumerate(ctx, player) {
    if (!owes(ctx, player)) return [];
    return [
      ...curseTargets(ctx, player).map((target) => ({ type: 'civCurse', player, target })),
      { type: 'civCurse', player, target: null },
    ];
  },
});

// ---- Papua: Uncontacted Tribes ----

const PAPUA_DISTANCE = 3;

/** Corners within 3 roads of Papua's starting buildings. */
export function papuaZone(ctx: Ctx): Set<CornerId> {
  const papua = seatOf(ctx, 'papua');
  const zone = new Set<CornerId>();
  if (papua === null) return zone;
  const start =
    (civView(ctx).papua as CornerId[] | undefined) ??
    ctx
      .piecesOf(papua)
      .flatMap((p) =>
        p.at.kind === 'corner' && ctx.registry.pieceTypes[p.type]?.building ? [p.at.id] : [],
      );
  let ring = new Set<CornerId>(start);
  for (const c of ring) zone.add(c);
  for (let i = 0; i < PAPUA_DISTANCE; i++) {
    const next = new Set<CornerId>();
    for (const c of ring)
      for (const n of ctx.geometry.cornerNeighbours.get(c) ?? []) if (!zone.has(n)) next.add(n);
    for (const c of next) zone.add(c);
    ring = next;
  }
  return zone;
}

/** The biggest island: Papua starts away from it, where there is more than one. */
function mainIsland(ctx: Ctx): string | null {
  const all = islands(ctx);
  if (all.length < 2) return null;
  return [...all].sort((x, y) => y.length - x.length)[0]?.[0] ?? null;
}

/** Whether Papua has anywhere off the main island to start. */
function startsAway(ctx: Ctx, main: string): boolean {
  // A scenario that pins the start to its home island leaves nowhere else.
  if ((ctx.setting<HexId[] | null>('setupHexes') ?? []).length) return false;
  return ctx.geometry.corners.some((c) => {
    const island = islandOf(ctx, c);
    return island !== null && island !== main && !ctx.buildingAt(c) && distanceRuleOk(ctx, c);
  });
}

export function papuaBlock(ctx: Ctx, seat: number, corner: CornerId): string | null {
  const papua = seatOf(ctx, 'papua');
  if (papua === null) return null;
  if (seat === papua) {
    if (ctx.state.phase.id !== 'setup') return null;
    const main = mainIsland(ctx);
    // Papua's own rule gives way when it would leave the player no starting
    // spot at all, which froze setup on the sea scenarios that start everyone
    // on one home island.
    if (!main || !startsAway(ctx, main)) return null;
    return islandOf(ctx, corner) === main ? 'Papua starts away from the main island' : null;
  }
  return papuaZone(ctx).has(corner) ? 'Too close to the Papuan tribes' : null;
}

/** Wraps an action placing a settlement on `a.corner` with Papua's rules. */
export function wrapPapua(prev: ActionDef): ActionDef {
  return {
    ...prev,
    check(ctx, a) {
      return prev.check(ctx, a) ?? papuaBlock(ctx, a.player, a.corner as CornerId);
    },
    enumerate(ctx, player) {
      const out = prev.enumerate?.(ctx, player) ?? [];
      if (seatOf(ctx, 'papua') === null) return out;
      return out.filter((a) => !papuaBlock(ctx, player, a.corner as CornerId));
    },
  };
}

// ---- Effects read from the game ----

/** The track whose cards match a hex's commodity (India). */
function hexTrack(ctx: Ctx, hex: HexId): Track | null {
  const com = TERRAIN_COMMODITY[ctx.state.hexes[hex]?.type ?? ''];
  const track = Object.entries(TRACK_COMMODITY).find(([, c]) => c === com)?.[0];
  return track && isActiveTrack(ctx, track) ? track : null;
}

export function part3Effects(ctx: Ctx): void {
  const started = civView(ctx).started;
  for (const e of ctx.events) {
    const seat = e.player as number;
    // India: a progress card matching a hex beside each new building.
    if (
      started &&
      e.type === 'built' &&
      (e.piece === 'settlement' || e.piece === 'city') &&
      playsLater(ctx, seat, 'india')
    ) {
      const decks = [
        ...new Set(
          (ctx.geometry.cornerHexes.get(e.at as CornerId) ?? [])
            .map((h) => hexTrack(ctx, h))
            .filter((t): t is Track => !!t),
        ),
      ];
      if (decks.length) addGift(ctx, seat, { kind: 'progress', decks });
    }
    // America: the first city they build is cheaper; after it, prices are back.
    if (started && e.type === 'built' && e.piece === 'city' && plays(ctx, seat, 'america'))
      (civData(ctx).firstCity ??= {})[seat] = true;
    // Japan: each Defender of Catan brings a Politics card and a basic knight.
    if (e.type === 'defender' && plays(ctx, seat, 'japan')) {
      if (isActiveTrack(ctx, 'politics') && drawProgress(ctx, seat, 'politics')) progressCheck(ctx);
      addGift(ctx, seat, { kind: 'knight', level: 1 });
    }
    // Maya: the yellow die also counts for progress cards on their rolls.
    if (e.type === 'rolled' && seat === ctx.active && playsLater(ctx, seat, 'maya')) {
      const dice = (e.dice ?? {}) as Record<string, unknown>;
      const event = dice.event;
      if (isActiveTrack(ctx, event) && gateOpen(ctx, seat, event, dice.yellow as number)) {
        if (drawProgress(ctx, seat, event)) {
          ctx.emit({ type: 'civMaya', player: seat, deck: event });
          progressCheck(ctx);
        }
      }
    }
    // Prussia: a welfare token for each roll that brings them nothing.
    if (e.type === 'production' || (e.type === 'rolled' && e.total === 7)) {
      const prussia = seatOf(ctx, 'prussia');
      const got = (e.received as Record<number, unknown> | undefined)?.[prussia ?? -1];
      if (prussia !== null && !got) {
        const d = civData(ctx);
        (d.welfare ??= {})[prussia] = welfareOf(ctx, prussia) + 1;
      }
    }
  }
  hammurabi(ctx);
  curseOnAttack(ctx);
  khmerEvens(ctx);
}

/** Khmer: a progress card of their choice at each even score from 10. */
function khmerEvens(ctx: Ctx): void {
  const khmer = seatOf(ctx, 'khmer');
  if (khmer === null || !playsLater(ctx, khmer, 'khmer')) return;
  const d = civData(ctx);
  const vp = ctx.vp(khmer);
  let last = (d.evens ??= {})[khmer] ?? 8;
  while (last + 2 <= vp) {
    last += 2;
    addGift(ctx, khmer, { kind: 'progress' });
    ctx.emit({ type: 'civKhmer', player: khmer, points: last });
  }
  d.evens[khmer] = last;
}

/** Prussia, from 10 points: five Beer. */
export function prussiaBeer(ctx: Ctx, seat: number): void {
  addBeer(ctx, seat, 5);
}

/** America's first city: 2 ore and a grain. */
export function americaCity(ctx: Ctx, item: string, seat: number, value: Cards): Cards {
  if (item !== 'city' || !plays(ctx, seat, 'america') || !civView(ctx).started) return value;
  if (civView(ctx).firstCity?.[seat]) return value;
  return { ore: 2, grain: 1 };
}

/** Ethiopia, from 10 points: each city adds 1 to their strength against the barbarians. */
export function ethiopiaDefense(ctx: Ctx, seat: number, value: number): number {
  return playsLater(ctx, seat, 'ethiopia') ? value + citiesOf(ctx, seat).length : value;
}

/** Ethiopia: the first settlement also brings its starting cards. */
export function wrapSetupSettlement(prev: ActionDef): ActionDef {
  return {
    ...prev,
    apply(ctx, a) {
      const index = ctx.state.phase.index as number;
      prev.apply(ctx, a);
      if (!plays(ctx, a.player, 'ethiopia') || index >= ctx.playerCount) return;
      if (ctx.setting<boolean>('startingResourcesBothRounds')) return;
      const got: Cards = {};
      for (const h of ctx.geometry.cornerHexes.get(a.corner as CornerId) ?? []) {
        const hex = ctx.state.hexes[h];
        const res = hex && !hex.hidden ? ctx.registry.hexTypes[hex.type]?.produces : undefined;
        if (res && (ctx.state.bank[res] ?? 0) > (got[res] ?? 0)) got[res] = (got[res] ?? 0) + 1;
      }
      ctx.grant(a.player, got);
      ctx.emit({ type: 'startingResources', player: a.player, cards: got });
    },
  };
}

export const part3Actions: Record<string, ActionDef> = {
  civBuilding,
  civAnnex,
  civRevenge,
  civWelfare,
  civHarakiri,
  civZulu,
  civCurse,
};
