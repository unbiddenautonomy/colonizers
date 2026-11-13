import {
  cardsTotal,
  isCards,
  type Action,
  type ActionDef,
  type Cards,
  type CornerId,
  type Ctx,
  type EdgeId,
  type HexId,
  type Phase,
  type Piece,
} from '@colonizers/engine';
import {
  canPlaceRoad,
  RESOURCES,
  robber,
  robberHexes,
  stealCandidates,
  stealFrom,
} from '@colonizers/module-base';
import { KNIGHT_TYPES, VP_PROGRESS, isCommodity, type Track } from './constants.ts';
import {
  action,
  cornerOf,
  onlyActive,
  owes,
  phase,
  pushAway,
  settle,
  wallBlock,
  type OwedPhase,
} from './actions.ts';
import {
  activeTracks,
  canPlaceKnight,
  ckData,
  commoditiesIn,
  hexesNear,
  isActive,
  isKnight,
  knightAt,
  knightLevel,
  knightsOf,
  merchant,
  progressHeld,
  promote,
  promoteBlock,
  startRoll,
  isAway,
} from './rules.ts';

const MAIN: Phase = { id: 'main' };

const isResource = (c: string) => (RESOURCES as readonly string[]).includes(c);
const isTradeCard = (c: string) => isResource(c) || isCommodity(c);

// ---- Shared checks ----

/** Index in the player's held cards of a playable copy, or null. */
function findCard(ctx: Ctx, seat: number, card: string): { deck: Track; index: number } | null {
  const p = ctx.player(seat);
  for (const deck of activeTracks(ctx)) {
    const index = (p.held[deck] ?? []).findIndex((h) => h.card === card);
    if (index >= 0) return { deck, index };
  }
  return null;
}

/** Does the player hold a copy of this progress card? */
export function holdsProgress(ctx: Ctx, seat: number, card: string): boolean {
  return findCard(ctx, seat, card) !== null;
}

/** Plays a progress card from the player's hand: it goes back under its deck. */
export function spendProgress(ctx: Ctx, seat: number, card: string): void {
  useCard(ctx, seat, card);
}

function useCard(ctx: Ctx, seat: number, card: string): void {
  const found = findCard(ctx, seat, card);
  if (!found) return;
  const p = ctx.player(seat);
  p.held[found.deck]?.splice(found.index, 1);
  p.played[card] = (p.played[card] ?? 0) + 1;
  // Played progress cards go back under their deck.
  (ctx.state.decks[found.deck] ??= []).push(card);
  ctx.emit({ type: 'playedProgress', player: seat, card, deck: found.deck });
}

function opponents(ctx: Ctx, seat: number): number[] {
  return ctx.state.players.map((p) => p.seat).filter((s) => s !== seat);
}

/** Hexes whose number the Inventor may move: not 2, 12, 6 or 8. */
function inventorHexes(ctx: Ctx): HexId[] {
  return (Object.keys(ctx.state.hexes) as HexId[]).filter((h) => {
    const hex = ctx.state.hexes[h];
    return (
      !!hex &&
      !hex.hidden &&
      hex.token !== undefined &&
      hex.props?.noInventor !== true &&
      ![2, 12, 6, 8].includes(hex.token)
    );
  });
}

function settlementsOf(ctx: Ctx, seat: number): Piece[] {
  return ctx.piecesOf(seat, 'settlement');
}

function merchantHexes(ctx: Ctx, seat: number): HexId[] {
  return [...hexesNear(ctx, seat)].filter((h) => {
    const hex = ctx.state.hexes[h];
    return !!hex && !hex.hidden && !!ctx.registry.hexTypes[hex.type]?.produces;
  });
}

/** Roads with one end that touches nothing else of their owner's. */
function openRoads(ctx: Ctx): Piece[] {
  return openRoutes(ctx, 'road');
}

/** Route pieces of a type (roads, ships) with one end that touches nothing else of their owner's. */
export function openRoutes(ctx: Ctx, type: string): Piece[] {
  return ctx.piecesOfType(type).filter((r) => {
    if (r.at.kind !== 'edge' || r.owner === null) return false;
    const owner = r.owner;
    const edge = r.at.id;
    return (ctx.geometry.edgeCorners.get(edge) ?? []).some((c) => {
      if (ctx.buildingAt(c)?.owner === owner) return false;
      if (knightAt(ctx, c)?.owner === owner) return false;
      const others = (ctx.geometry.cornerEdges.get(c) ?? []).filter((e) => e !== edge);
      return !others.some((e) =>
        ctx
          .piecesAt({ kind: 'edge', id: e })
          .some((p) => p.owner === owner && !!ctx.registry.pieceTypes[p.type]?.route),
      );
    });
  });
}

/** Rival knights standing on a corner one of the player's roads touches. */
function intrigueTargets(ctx: Ctx, seat: number): Piece[] {
  return ctx.state.players
    .filter((p) => p.seat !== seat)
    .flatMap((p) => knightsOf(ctx, p.seat))
    .filter((k) => !isAway(k))
    .filter((k) =>
      (ctx.geometry.cornerEdges.get(cornerOf(k)) ?? []).some((e) =>
        ctx
          .piecesAt({ kind: 'edge', id: e })
          .some((p) => p.owner === seat && ctx.registry.pieceTypes[p.type]?.route === 'land'),
      ),
    );
}

function promotable(ctx: Ctx, seat: number): Piece[] {
  return knightsOf(ctx, seat).filter((k) => promoteBlock(ctx, seat, k) === null);
}

function freeRouteSpot(ctx: Ctx, seat: number): boolean {
  for (const type of ['placeFreeRoad', 'placeFreeShip']) {
    const def = ctx.registry.actions[type];
    if (!def) continue;
    for (const edge of ctx.geometry.edges)
      if (def.check(ctx, { type, player: seat, edge }) === null) return true;
  }
  return false;
}

function deserterLevel(ctx: Ctx, seat: number, level: number): string | null {
  for (let l = level; l >= 1; l--) {
    const t = KNIGHT_TYPES[l - 1] as string;
    if (ctx.supplyLeft(seat, t) > 0) return t;
  }
  return null;
}

function knightCorners(ctx: Ctx, seat: number): CornerId[] {
  const corners = new Set<CornerId>();
  for (const p of ctx.piecesOf(seat))
    if (p.at.kind === 'edge')
      for (const c of ctx.geometry.edgeCorners.get(p.at.id) ?? []) corners.add(c);
  return [...corners].filter((c) => canPlaceKnight(ctx, seat, c) === null);
}

function collect(ctx: Ctx, seat: number, terrain: string, card: string): number {
  let n = 0;
  for (const h of hexesNear(ctx, seat)) if (ctx.state.hexes[h]?.type === terrain) n += 2;
  return Math.min(n, ctx.state.bank[card] ?? 0);
}

// ---- Playing a card ----

interface Play {
  card: string;
  target?: number;
  resource?: string;
  red?: number;
  yellow?: number;
}

function checkPlay(ctx: Ctx, a: Action & Play): string | null {
  const err = onlyActive(ctx, a);
  if (err) return err;
  if ((VP_PROGRESS as readonly string[]).includes(a.card)) return 'That card scores by itself';
  if (!findCard(ctx, a.player, a.card)) return 'You do not hold that card';
  const ph = ctx.state.phase.id;
  if (a.card === 'alchemist') {
    if (ph !== 'roll') return 'Play the Alchemist instead of rolling';
    const ok = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 6;
    if (!ok(a.red) || !ok(a.yellow)) return 'Pick both dice';
    return null;
  }
  if (ph !== 'main') return 'Progress cards are played after rolling';
  const seat = a.player;
  const target = a.target;
  const pickTarget = () => {
    if (!Number.isInteger(target) || target === seat || !ctx.state.players[target as number])
      return 'Pick another player';
    return null;
  };
  switch (a.card) {
    case 'crane':
      return null;
    case 'engineer':
      return ctx.piecesOf(seat, 'city').some((c) => wallBlock(ctx, seat, cornerOf(c)) === null)
        ? null
        : 'You have no city that can take a wall';
    case 'inventor':
      return inventorHexes(ctx).length >= 2 ? null : 'There are no numbers to swap';
    case 'irrigation':
    case 'mining':
      return null;
    case 'medicine':
      if (!settlementsOf(ctx, seat).length) return 'You have no settlement to upgrade';
      if (ctx.supplyLeft(seat, 'city') <= 0) return 'No cities left';
      return ctx.has(seat, { ore: 2, grain: 1 }) ? null : 'Medicine needs 2 ore and 1 grain';
    case 'roadBuilding':
      return freeRouteSpot(ctx, seat) ? null : 'There is nowhere to build a road';
    case 'smith':
      return promotable(ctx, seat).length ? null : 'You have no knight to promote';
    case 'commercialHarbor':
      return RESOURCES.some((r) => (ctx.player(seat).hand[r] ?? 0) > 0)
        ? null
        : 'You need a resource to offer';
    case 'masterMerchant': {
      const e = pickTarget();
      if (e) return e;
      if (ctx.vp(target as number) <= ctx.vp(seat))
        return 'Pick a player with more points than you';
      return ctx.handSize(target as number, false) > 0 ? null : 'That player has no cards';
    }
    case 'merchant':
      return merchantHexes(ctx, seat).length ? null : 'There is no hex for the merchant';
    case 'merchantFleet':
      return typeof a.resource === 'string' && isTradeCard(a.resource) ? null : 'Pick a card';
    case 'resourceMonopoly':
      return typeof a.resource === 'string' && isResource(a.resource) ? null : 'Pick a resource';
    case 'tradeMonopoly':
      return typeof a.resource === 'string' && isCommodity(a.resource) ? null : 'Pick a commodity';
    case 'bishop':
      return ckData(ctx).robberActive
        ? null
        : 'The robber is not in play until the barbarians attack';
    case 'deserter': {
      const e = pickTarget();
      if (e) return e;
      return knightsOf(ctx, target as number).some((k) => !isAway(k))
        ? null
        : 'That player has no knights at home';
    }
    case 'diplomat':
      return openRoads(ctx).length ? null : 'There is no open road';
    case 'intrigue':
      return intrigueTargets(ctx, seat).length ? null : 'No rival knight stands on your roads';
    case 'saboteur':
    case 'warlord':
    case 'wedding':
      return null;
    case 'spy': {
      const e = pickTarget();
      if (e) return e;
      const n = activeTracks(ctx).reduce(
        (s, t) => s + (ctx.player(target as number).held[t]?.length ?? 0),
        0,
      );
      return n > 0 ? null : 'That player has no progress cards';
    }
    default:
      return 'That card can not be played';
  }
}

function applyPlay(ctx: Ctx, a: Action & Play): void {
  const seat = a.player;
  const d = ckData(ctx);
  useCard(ctx, seat, a.card);
  const turn = ctx.state.turn.number;
  switch (a.card) {
    case 'alchemist':
      d.alchemist = { red: a.red as number, yellow: a.yellow as number };
      startRoll(ctx, seat);
      return;
    case 'crane':
      d.craneTurn[seat] = turn;
      return;
    case 'engineer':
      ctx.setPhase({ id: 'freeWall', returnTo: MAIN });
      return;
    case 'inventor':
      ctx.setPhase({ id: 'inventor', returnTo: MAIN });
      return;
    case 'irrigation':
    case 'mining': {
      const [terrain, card] = a.card === 'irrigation' ? ['fields', 'grain'] : ['mountains', 'ore'];
      const n = collect(ctx, seat, terrain as string, card as string);
      if (n > 0) ctx.grant(seat, { [card as string]: n });
      ctx.emit({
        type: 'progressGain',
        player: seat,
        card: a.card,
        cards: { [card as string]: n },
      });
      return;
    }
    case 'medicine':
      ctx.setPhase({ id: 'medicine', returnTo: MAIN });
      return;
    case 'roadBuilding': {
      const left =
        ctx.supplyLeft(seat, 'road') +
        (ctx.registry.pieceTypes.ship ? ctx.supplyLeft(seat, 'ship') : 0);
      ctx.setPhase({ id: 'roadBuilding', remaining: Math.min(2, left), returnTo: 'main' });
      return;
    }
    case 'smith':
      ctx.setPhase({ id: 'smith', remaining: 2, returnTo: MAIN });
      return;
    case 'commercialHarbor': {
      const left = opponents(ctx, seat).filter((s) =>
        commoditiesIn(ctx).some((c) => (ctx.player(s).hand[c] ?? 0) > 0),
      );
      if (!left.length) {
        ctx.emit({ type: 'progressGain', player: seat, card: a.card, cards: {} });
        return;
      }
      ctx.setPhase({ id: 'commercialHarbor', left, returnTo: MAIN });
      return;
    }
    case 'masterMerchant': {
      const target = a.target as number;
      const hand = Object.fromEntries(
        Object.entries(ctx.player(target).hand).filter(([, n]) => n > 0),
      );
      d.peek = { seat, target, hand };
      ctx.setPhase({
        id: 'masterMerchant',
        target,
        take: Math.min(2, cardsTotal(hand)),
        returnTo: MAIN,
      });
      return;
    }
    case 'merchant':
      ctx.setPhase({ id: 'placeMerchant', returnTo: MAIN });
      return;
    case 'merchantFleet':
      d.fleet = { seat, card: a.resource as string, turn };
      return;
    case 'resourceMonopoly':
    case 'tradeMonopoly': {
      const each = a.card === 'resourceMonopoly' ? 2 : 1;
      const card = a.resource as string;
      let taken = 0;
      for (const s of opponents(ctx, seat)) {
        const n = Math.min(each, ctx.player(s).hand[card] ?? 0);
        if (n > 0) {
          ctx.transfer(s, seat, { [card]: n });
          taken += n;
        }
      }
      ctx.emit({ type: 'monopoly', player: seat, resource: card, taken });
      return;
    }
    case 'bishop':
      ctx.setPhase({ id: 'bishop', returnTo: MAIN });
      return;
    case 'deserter':
      ctx.setPhase({
        id: 'desertKnight',
        owed: { [a.target as number]: 1 },
        by: seat,
        returnTo: MAIN,
      });
      return;
    case 'diplomat':
      ctx.setPhase({ id: 'diplomat', returnTo: MAIN });
      return;
    case 'intrigue':
      ctx.setPhase({ id: 'intrigue', returnTo: MAIN });
      return;
    case 'saboteur': {
      const mine = ctx.vp(seat);
      const owed: Record<number, number> = {};
      for (const s of opponents(ctx, seat)) {
        const n = Math.floor(ctx.handSize(s) / 2);
        if (ctx.vp(s) >= mine && n > 0) owed[s] = n;
      }
      if (Object.keys(owed).length)
        ctx.setPhase({ id: 'discard', owed, returnTo: 'main', skipRobber: true });
      return;
    }
    case 'spy': {
      const target = a.target as number;
      const progress = progressHeld(ctx, target).map((c) => c.card);
      d.peek = { seat, target, progress };
      ctx.setPhase({ id: 'spy', target, returnTo: MAIN });
      return;
    }
    case 'warlord':
      for (const k of knightsOf(ctx, seat))
        if (!isActive(k)) {
          k.props.active = true;
          k.props.activatedTurn = turn;
        }
      ctx.emit({ type: 'progressGain', player: seat, card: a.card, cards: {} });
      return;
    case 'wedding': {
      const mine = ctx.vp(seat);
      const owed: Record<number, number> = {};
      for (const s of opponents(ctx, seat)) {
        const n = Math.min(2, ctx.handSize(s, false));
        if (ctx.vp(s) > mine && n > 0) owed[s] = n;
      }
      if (Object.keys(owed).length) ctx.setPhase({ id: 'wedding', owed, by: seat, returnTo: MAIN });
      return;
    }
  }
}

const NEEDS_TARGET = ['masterMerchant', 'deserter', 'spy'];

const playProgress = action<Play>({
  phases: ['roll', 'main'],
  check: checkPlay,
  apply: applyPlay,
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    const out: Action[] = [];
    const seen = new Set<string>();
    for (const { card } of progressHeld(ctx, player)) {
      if (seen.has(card)) continue;
      seen.add(card);
      if (card === 'alchemist') {
        if (ctx.state.phase.id !== 'roll') continue;
        for (let red = 1; red <= 6; red++)
          for (let yellow = 1; yellow <= 6; yellow++)
            out.push({ type: 'playProgress', player, card, red, yellow });
      } else if (NEEDS_TARGET.includes(card)) {
        for (const target of opponents(ctx, player))
          out.push({ type: 'playProgress', player, card, target });
      } else if (card === 'resourceMonopoly') {
        for (const r of RESOURCES) out.push({ type: 'playProgress', player, card, resource: r });
      } else if (card === 'tradeMonopoly') {
        for (const r of commoditiesIn(ctx))
          out.push({ type: 'playProgress', player, card, resource: r });
      } else if (card === 'merchantFleet') {
        for (const r of [...RESOURCES, ...commoditiesIn(ctx)])
          out.push({ type: 'playProgress', player, card, resource: r });
      } else {
        out.push({ type: 'playProgress', player, card });
      }
    }
    return out;
  },
});

// ---- Steps after playing a card ----

interface Step extends Phase {
  returnTo: Phase;
}

const back = (ctx: Ctx) => ctx.setPhase(phase<Step>(ctx).returnTo);

/** Ends an optional step (Smith, Commercial Harbor, Spy, a deserter with nowhere to stand). */
const ckDone = action<object>({
  phases: ['smith', 'commercialHarbor', 'spy', 'placeDeserter'],
  check: (ctx, a) =>
    onlyActive(ctx, a) ?? (harborWaiting(ctx) ? 'Wait for them to pick a commodity' : null),
  apply(ctx) {
    ckData(ctx).peek = null;
    back(ctx);
  },
  enumerate: (ctx, player) =>
    player === ctx.active && !harborWaiting(ctx) ? [{ type: 'ckDone', player }] : [],
});

const placeFreeWall = action<{ corner: CornerId }>({
  phases: ['freeWall'],
  check: (ctx, a) => onlyActive(ctx, a) ?? wallBlock(ctx, a.player, a.corner),
  apply(ctx, a) {
    (ctx.buildingAt(a.corner) as Piece).props.wall = true;
    ctx.emit({ type: 'built', player: a.player, piece: 'wall', at: a.corner, free: true });
    back(ctx);
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return ctx
      .piecesOf(player, 'city')
      .map((c) => ({ type: 'placeFreeWall', player, corner: cornerOf(c) }));
  },
});

const inventorPick = action<{ hex: HexId }>({
  phases: ['inventor'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (!inventorHexes(ctx).includes(a.hex)) return 'Pick a number other than 2, 12, 6 or 8';
    if (ctx.state.phase.first === a.hex) return 'Pick a different number';
    return null;
  },
  apply(ctx, a) {
    const ph = phase<Step & { first?: HexId }>(ctx);
    if (!ph.first) {
      ctx.setPhase({ ...ph, first: a.hex });
      return;
    }
    const x = ctx.state.hexes[ph.first];
    const y = ctx.state.hexes[a.hex];
    if (x && y) {
      const t = x.token;
      x.token = y.token as number;
      y.token = t as number;
      ctx.emit({ type: 'numbersSwapped', player: a.player, hexes: [ph.first, a.hex] });
    }
    ctx.setPhase(ph.returnTo);
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return inventorHexes(ctx)
      .filter((h) => h !== ctx.state.phase.first)
      .map((hex) => ({ type: 'inventorPick', player, hex }));
  },
});

const medicineCity = action<{ corner: CornerId }>({
  phases: ['medicine'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    const b = ctx.buildingAt(a.corner);
    if (!b || b.type !== 'settlement' || b.owner !== a.player)
      return 'Pick one of your settlements';
    if (!ctx.has(a.player, { ore: 2, grain: 1 })) return 'Medicine needs 2 ore and 1 grain';
    return null;
  },
  apply(ctx, a) {
    ctx.pay(a.player, { ore: 2, grain: 1 });
    ctx.upgrade(ctx.buildingAt(a.corner) as Piece, 'city');
    ctx.emit({ type: 'built', player: a.player, piece: 'city', at: a.corner });
    back(ctx);
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return settlementsOf(ctx, player).map((s) => ({
      type: 'medicineCity',
      player,
      corner: cornerOf(s),
    }));
  },
});

const smithPromote = action<{ knight: string }>({
  phases: ['smith'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    const k = typeof a.knight === 'string' ? ctx.state.pieces[a.knight] : undefined;
    return promoteBlock(ctx, a.player, k);
  },
  apply(ctx, a) {
    const ph = phase<Step & { remaining: number }>(ctx);
    const n = promote(ctx, ctx.state.pieces[a.knight] as Piece);
    ctx.emit({
      type: 'knightPromoted',
      player: a.player,
      at: cornerOf(n),
      level: knightLevel(n),
      free: true,
    });
    const remaining = ph.remaining - 1;
    if (remaining > 0 && promotable(ctx, a.player).length) ctx.setPhase({ ...ph, remaining });
    else ctx.setPhase(ph.returnTo);
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return promotable(ctx, player).map((k) => ({ type: 'smithPromote', player, knight: k.id }));
  },
});

interface HarborPhase extends Step {
  left: number[];
  /** The opponent who has been given a resource and now picks a commodity. */
  pending?: number;
  owed?: Record<number, number>;
}

const harborWaiting = (ctx: Ctx) => ctx.state.phase.pending !== undefined;
const hasCommodity = (ctx: Ctx, seat: number) =>
  commoditiesIn(ctx).some((c) => (ctx.player(seat).hand[c] ?? 0) > 0);

/** Commercial Harbor, step 1: hand one resource to an opponent. */
const harborSwap = action<{ with: number; give: string }>({
  phases: ['commercialHarbor'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (harborWaiting(ctx)) return 'Wait for them to pick a commodity';
    const left = ctx.state.phase.left as number[];
    if (!left.includes(a.with)) return 'Pick a player you have not traded with';
    if (typeof a.give !== 'string' || !isResource(a.give)) return 'Offer a resource';
    if (!ctx.has(a.player, { [a.give]: 1 })) return 'You do not have that resource';
    return null;
  },
  apply(ctx, a) {
    const ph = phase<HarborPhase>(ctx);
    ctx.transfer(a.player, a.with, { [a.give]: 1 });
    ctx.emit({
      type: 'harborGave',
      player: a.player,
      with: a.with,
      gave: { [a.give]: 1 },
      visibleTo: [a.player, a.with],
      redacted: { player: a.player, with: a.with },
    });
    ctx.setPhase({
      ...ph,
      left: ph.left.filter((s) => s !== a.with),
      pending: a.with,
      owed: { [a.with]: 1 },
      step: `give-${a.with}`,
    });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || harborWaiting(ctx)) return [];
    // Only the public list: the active player cannot see who holds what.
    const left = ctx.state.phase.left as number[];
    return left.flatMap((w) =>
      RESOURCES.filter((give) => ctx.has(player, { [give]: 1 })).map((give) => ({
        type: 'harborSwap',
        player,
        with: w,
        give,
      })),
    );
  },
});

/** Commercial Harbor, step 2: the opponent picks which commodity to give back. */
const harborGive = action<{ commodity: string }>({
  phases: ['commercialHarbor'],
  check(ctx, a) {
    if (ctx.state.phase.pending !== a.player) return 'Nobody asked you for a commodity';
    if (!commoditiesIn(ctx).includes(a.commodity)) return 'Pick a commodity';
    if (!ctx.has(a.player, { [a.commodity]: 1 })) return 'You do not have that commodity';
    return null;
  },
  apply(ctx, a) {
    const ph = phase<HarborPhase>(ctx);
    const to = ctx.active;
    ctx.transfer(a.player, to, { [a.commodity]: 1 });
    ctx.emit({
      type: 'harborSwap',
      player: to,
      with: a.player,
      got: { [a.commodity]: 1 },
      visibleTo: [to, a.player],
      redacted: { player: to, with: a.player },
    });
    const left = ph.left.filter((s) => hasCommodity(ctx, s));
    const canGive = RESOURCES.some((r) => (ctx.player(to).hand[r] ?? 0) > 0);
    if (left.length && canGive)
      ctx.setPhase({ id: 'commercialHarbor', left, returnTo: ph.returnTo });
    else ctx.setPhase(ph.returnTo);
  },
  enumerate(ctx, player) {
    if (ctx.state.phase.pending !== player) return [];
    return commoditiesIn(ctx)
      .filter((c) => ctx.has(player, { [c]: 1 }))
      .map((commodity) => ({
        type: 'harborGive',
        player,
        commodity,
      }));
  },
});

const takeCards = action<{ cards: Cards }>({
  phases: ['masterMerchant'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    const peek = ckData(ctx).peek;
    if (!peek?.hand) return 'Nothing to take';
    if (!isCards(a.cards, (c) => !!ctx.registry.cardTypes[c])) return 'Pick cards';
    const take = ctx.state.phase.take as number;
    if (cardsTotal(a.cards) !== take) return `Take ${take} cards`;
    const hand = peek.hand;
    if (Object.entries(a.cards).some(([c, n]) => (hand[c] ?? 0) < n))
      return 'They do not have those';
    return null;
  },
  apply(ctx, a) {
    const ph = phase<Step & { target: number }>(ctx);
    const cards = Object.fromEntries(Object.entries(a.cards).filter(([, n]) => n > 0));
    ctx.transfer(ph.target, a.player, cards);
    ctx.emit({
      type: 'tookCards',
      player: a.player,
      from: ph.target,
      cards,
      visibleTo: [a.player, ph.target],
      redacted: { player: a.player, from: ph.target, count: cardsTotal(cards) },
    });
    ckData(ctx).peek = null;
    ctx.setPhase(ph.returnTo);
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    const hand = ckData(ctx).peek?.hand;
    if (!hand) return [];
    const take = ctx.state.phase.take as number;
    const kinds = Object.keys(hand).filter((c) => (hand[c] ?? 0) > 0);
    const out: Action[] = [];
    if (take === 1)
      for (const c of kinds) out.push({ type: 'takeCards', player, cards: { [c]: 1 } });
    else
      kinds.forEach((c1, i) =>
        kinds.slice(i).forEach((c2) =>
          out.push({
            type: 'takeCards',
            player,
            cards: c1 === c2 ? { [c1]: 2 } : { [c1]: 1, [c2]: 1 },
          }),
        ),
      );
    return out;
  },
});

const takeProgress = action<{ card: string }>({
  phases: ['spy'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    const peek = ckData(ctx).peek;
    if (!peek?.progress?.includes(a.card)) return 'They do not hold that card';
    return null;
  },
  apply(ctx, a) {
    const ph = phase<Step & { target: number }>(ctx);
    const victim = ctx.player(ph.target);
    for (const deck of activeTracks(ctx)) {
      const i = (victim.held[deck] ?? []).findIndex((h) => h.card === a.card);
      if (i < 0) continue;
      victim.held[deck]?.splice(i, 1);
      (ctx.player(a.player).held[deck] ??= []).push({
        card: a.card,
        acquiredTurn: ctx.state.turn.number,
      });
      ctx.emit({
        type: 'spied',
        player: a.player,
        from: ph.target,
        card: a.card,
        visibleTo: [a.player, ph.target],
        redacted: { player: a.player, from: ph.target },
      });
      break;
    }
    ckData(ctx).peek = null;
    ctx.setPhase(ph.returnTo);
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    const list = ckData(ctx).peek?.progress ?? [];
    return [...new Set(list)].map((card) => ({ type: 'takeProgress', player, card }));
  },
});

const merchantHex = action<{ hex: HexId }>({
  phases: ['placeMerchant'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    return merchantHexes(ctx, a.player).includes(a.hex)
      ? null
      : 'The merchant goes on a land hex next to your settlement or city';
  },
  apply(ctx, a) {
    const m = merchant(ctx);
    const from = m?.owner ?? null;
    if (m) {
      m.owner = a.player;
      ctx.move(m, { kind: 'hex', id: a.hex });
    } else ctx.place('merchant', a.player, { kind: 'hex', id: a.hex });
    ctx.emit({ type: 'merchantPlaced', player: a.player, hex: a.hex, from });
    back(ctx);
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return merchantHexes(ctx, player).map((hex) => ({ type: 'merchantHex', player, hex }));
  },
});

const bishopMove = action<{ hex: HexId }>({
  phases: ['bishop'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    return robberHexes(ctx).includes(a.hex) ? null : 'The robber can not go there';
  },
  apply(ctx, a) {
    const r = robber(ctx);
    if (r) ctx.move(r, { kind: 'hex', id: a.hex });
    else ctx.place('robber', null, { kind: 'hex', id: a.hex });
    ctx.emit({ type: 'robberMoved', player: a.player, hex: a.hex });
    for (const victim of stealCandidates(ctx, a.hex, a.player)) stealFrom(ctx, a.player, victim);
    back(ctx);
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return robberHexes(ctx).map((hex) => ({ type: 'bishopMove', player, hex }));
  },
});

const diplomatRemove = action<{ edge: EdgeId }>({
  phases: ['diplomat'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    return openRoads(ctx).some((r) => r.at.kind === 'edge' && r.at.id === a.edge)
      ? null
      : 'Pick a road with an open end';
  },
  apply(ctx, a) {
    const road = openRoads(ctx).find((r) => r.at.kind === 'edge' && r.at.id === a.edge) as Piece;
    const owner = road.owner as number;
    ctx.remove(road);
    ctx.emit({ type: 'roadRemoved', player: a.player, owner, at: a.edge });
    // Your own road can be put back somewhere else.
    if (owner === a.player) {
      const spot = ctx.geometry.edges.some(
        (e) => e !== a.edge && canPlaceRoad(ctx, a.player, e) === null,
      );
      if (spot) {
        ctx.setPhase({ id: 'roadBuilding', remaining: 1, returnTo: 'main' });
        return;
      }
    }
    back(ctx);
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return openRoads(ctx).map((r) => ({
      type: 'diplomatRemove',
      player,
      edge: (r.at as { id: EdgeId }).id,
    }));
  },
});

const intrigueKnight = action<{ knight: string }>({
  phases: ['intrigue'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    return intrigueTargets(ctx, a.player).some((k) => k.id === a.knight)
      ? null
      : 'Pick a rival knight on one of your roads';
  },
  apply(ctx, a) {
    const k = ctx.state.pieces[a.knight] as Piece;
    const from = cornerOf(k);
    ctx.emit({ type: 'knightDisplaced', player: a.player, victim: k.owner, from: null, at: from });
    pushAway(ctx, k, from, phase<Step>(ctx).returnTo);
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return intrigueTargets(ctx, player).map((k) => ({
      type: 'intrigueKnight',
      player,
      knight: k.id,
    }));
  },
});

interface DesertPhase extends OwedPhase {
  by: number;
  returnTo: Phase;
}

const desertKnight = action<{ knight: string }>({
  phases: ['desertKnight'],
  check(ctx, a) {
    if (!owes(ctx, a.player)) return 'You do not give up a knight';
    const k = typeof a.knight === 'string' ? ctx.state.pieces[a.knight] : undefined;
    if (!k || !isKnight(k) || k.owner !== a.player || k.at.kind !== 'corner')
      return 'Pick one of your knights';
    if (isAway(k)) return 'That knight is far away and can not desert';
    return null;
  },
  apply(ctx, a) {
    const ph = phase<DesertPhase>(ctx);
    const k = ctx.state.pieces[a.knight] as Piece;
    const level = knightLevel(k);
    const active = isActive(k);
    ctx.remove(k);
    ctx.emit({ type: 'knightDeserted', player: a.player, to: ph.by, level, at: cornerOf(k) });
    const type = deserterLevel(ctx, ph.by, level);
    if (type && knightCorners(ctx, ph.by).length) {
      ctx.setPhase({ id: 'placeDeserter', knightType: type, active, returnTo: ph.returnTo });
    } else ctx.setPhase(ph.returnTo);
  },
  enumerate(ctx, player) {
    if (!owes(ctx, player)) return [];
    return knightsOf(ctx, player)
      .filter((k) => !isAway(k))
      .map((k) => ({ type: 'desertKnight', player, knight: k.id }));
  },
});

const placeDeserterKnight = action<{ corner: CornerId }>({
  phases: ['placeDeserter'],
  check: (ctx, a) => onlyActive(ctx, a) ?? canPlaceKnight(ctx, a.player, a.corner),
  apply(ctx, a) {
    const ph = phase<Step & { knightType: string; active: boolean }>(ctx);
    ctx.place(ph.knightType, a.player, { kind: 'corner', id: a.corner }, { active: ph.active });
    ctx.emit({ type: 'built', player: a.player, piece: 'knight', at: a.corner, free: true });
    ctx.setPhase(ph.returnTo);
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return knightCorners(ctx, player).map((corner) => ({
      type: 'placeDeserterKnight',
      player,
      corner,
    }));
  },
});

const giveGift = action<{ cards: Cards }>({
  phases: ['wedding'],
  check(ctx, a) {
    const owed = (ctx.state.phase.owed as Record<number, number>)[a.player];
    if (!owed) return 'You do not owe a gift';
    if (!isCards(a.cards, (c) => !!ctx.registry.cardTypes[c])) return 'Pick cards';
    if (cardsTotal(a.cards) !== owed) return `Give exactly ${owed} cards`;
    if (!ctx.has(a.player, a.cards)) return 'You do not have those cards';
    return null;
  },
  apply(ctx, a) {
    const ph = phase<DesertPhase>(ctx);
    const cards = Object.fromEntries(Object.entries(a.cards).filter(([, n]) => n > 0));
    ctx.transfer(a.player, ph.by, cards);
    ctx.emit({ type: 'gift', player: a.player, to: ph.by, cards });
    if (settle(ctx, a.player)) ctx.setPhase(ph.returnTo);
  },
  enumerate(ctx, player) {
    const owed = (ctx.state.phase.owed as Record<number, number>)?.[player];
    if (!owed) return [];
    // Suggest the largest piles; players pick their own.
    const hand = { ...ctx.player(player).hand };
    const cards: Cards = {};
    for (let i = 0; i < owed; i++) {
      const top = Object.entries(hand)
        .filter(([c, n]) => n > 0 && !!ctx.registry.cardTypes[c])
        .sort((x, y) => y[1] - x[1])[0];
      if (!top) break;
      hand[top[0]] = (hand[top[0]] ?? 0) - 1;
      cards[top[0]] = (cards[top[0]] ?? 0) + 1;
    }
    return [{ type: 'giveGift', player, cards }];
  },
});

export const progressActions: Record<string, ActionDef> = {
  playProgress,
  ckDone,
  placeFreeWall,
  inventorPick,
  medicineCity,
  smithPromote,
  harborSwap,
  harborGive,
  takeCards,
  takeProgress,
  merchantHex,
  bishopMove,
  diplomatRemove,
  intrigueKnight,
  desertKnight,
  placeDeserterKnight,
  giveGift,
};

export { owes };
