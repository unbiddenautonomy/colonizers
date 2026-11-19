import {
  cardsTotal,
  isCards,
  rule,
  type Action,
  type ActionDef,
  type CornerId,
  type Ctx,
  type EdgeId,
  type HexId,
  type Phase,
} from '@colonizers/engine';
import { DEV_CARDS, RESOURCES } from './constants.ts';
import {
  baseData,
  canPlaceRoad,
  canPlaceSettlement,
  freeRouteSpot,
  isResource,
  legalRoadEdges,
  playerData,
  produce,
  robber,
  robberHexes,
  setupRounds,
  setupSeat,
  startNextTurn,
  stealCandidates,
  stealFrom,
  updateLargestArmy,
  type TradeOffer,
} from './rules.ts';

type A<T> = Action & T;

const onlyActive = (ctx: Ctx, a: Action): string | null =>
  a.player === ctx.active ? null : 'Not your turn';

function phaseData<T>(ctx: Ctx): T {
  return ctx.state.phase as unknown as T;
}

/** Defines an action with typed payload. */
function action<T>(def: ActionDef<A<T>>): ActionDef {
  return def as unknown as ActionDef;
}

const knownResource = (c: string) => isResource(c);

// ---- Setup ----

interface SetupPhase {
  id: 'setup';
  index: number;
  step: 'settlement' | 'road';
  settlement?: CornerId;
}

const placeSetupSettlement = action<{ corner: CornerId }>({
  phases: ['setup'],
  check(ctx, a) {
    const ph = phaseData<SetupPhase>(ctx);
    if (ph.step !== 'settlement') return 'Place a road first';
    if (a.player !== ctx.active) return 'Not your turn';
    return canPlaceSettlement(ctx, a.player, a.corner, false);
  },
  apply(ctx, a) {
    const ph = phaseData<SetupPhase>(ctx);
    ctx.place('settlement', a.player, { kind: 'corner', id: a.corner });
    ctx.emit({ type: 'built', player: a.player, piece: 'settlement', at: a.corner });
    // Second settlement collects starting resources.
    if (ph.index >= ctx.playerCount || ctx.setting<boolean>('startingResourcesBothRounds')) {
      const got: Record<string, number> = {};
      for (const h of ctx.geometry.cornerHexes.get(a.corner) ?? []) {
        const hex = ctx.state.hexes[h];
        const res = hex && !hex.hidden ? ctx.registry.hexTypes[hex.type]?.produces : undefined;
        if (res && (ctx.state.bank[res] ?? 0) > (got[res] ?? 0)) got[res] = (got[res] ?? 0) + 1;
      }
      ctx.grant(a.player, got);
      ctx.emit({ type: 'startingResources', player: a.player, cards: got });
    }
    ctx.setPhase({ id: 'setup', index: ph.index, step: 'road', settlement: a.corner });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return ctx.geometry.corners.map((corner) => ({ type: 'placeSetupSettlement', player, corner }));
  },
});

const placeSetupRoad = action<{ edge: EdgeId }>({
  phases: ['setup'],
  check(ctx, a) {
    const ph = phaseData<SetupPhase>(ctx);
    if (ph.step !== 'road') return 'Place a settlement first';
    if (a.player !== ctx.active) return 'Not your turn';
    const corners = ctx.geometry.edgeCorners.get(a.edge);
    if (!corners || !ph.settlement || !corners.includes(ph.settlement)) {
      return 'The road must touch the settlement you just placed';
    }
    return canPlaceRoad(ctx, a.player, a.edge);
  },
  apply(ctx, a) {
    const ph = phaseData<SetupPhase>(ctx);
    ctx.place('road', a.player, { kind: 'edge', id: a.edge });
    ctx.emit({ type: 'built', player: a.player, piece: 'road', at: a.edge });
    const next = ph.index + 1;
    if (next >= ctx.playerCount * setupRounds(ctx)) {
      ctx.state.turn = { number: 1, player: 0, round: 0 };
      ctx.setPhase({ id: 'roll' });
      ctx.emit({ type: 'turnStarted', player: 0, turn: 1 });
      ctx.hook('turnStarted');
    } else {
      ctx.state.turn.player = setupSeat(ctx, next);
      ctx.setPhase({ id: 'setup', index: next, step: 'settlement' });
    }
  },
  enumerate(ctx, player) {
    const ph = phaseData<SetupPhase>(ctx);
    if (player !== ctx.active || !ph.settlement) return [];
    return (ctx.geometry.cornerEdges.get(ph.settlement) ?? []).map((edge) => ({
      type: 'placeSetupRoad',
      player,
      edge,
    }));
  },
});

// ---- Rolling and the robber ----

const roll = action<object>({
  phases: ['roll'],
  check: onlyActive,
  apply(ctx, a) {
    const result = ctx.rollDice();
    ctx.state.data.base = { ...baseData(ctx), lastRoll: result };
    ctx.emit({ type: 'rolled', player: a.player, ...result });
    if (result.total === 7) {
      startSeven(ctx);
    } else {
      produce(ctx, result.total);
      ctx.setPhase({ id: 'main' });
    }
  },
  enumerate: (ctx, player) => (player === ctx.active ? [{ type: 'roll', player }] : []),
});

/** Discards for big hands, then the roller moves the robber. Exported for expansions. */
export function startSeven(ctx: Ctx): void {
  const owed: Record<number, number> = {};
  for (const p of ctx.state.players) {
    const limit = ctx.reduce('handLimit', p.seat, ctx.setting<number>('discardLimit') ?? 7);
    const size = ctx.handSize(p.seat);
    if (size > limit) owed[p.seat] = Math.floor(size / 2);
  }
  if (Object.keys(owed).length) {
    ctx.setPhase({ id: 'discard', owed, returnTo: 'main' });
  } else {
    ctx.setPhase({ id: 'moveRobber', returnTo: 'main' });
  }
}

interface DiscardPhase {
  id: 'discard';
  owed: Record<number, number>;
  returnTo: string;
}

const discard = action<{ cards: Record<string, number> }>({
  phases: ['discard'],
  check(ctx, a) {
    const owed = phaseData<DiscardPhase>(ctx).owed[a.player];
    if (!owed) return 'You do not need to discard';
    if (!isCards(a.cards, (c) => !!ctx.registry.cardTypes[c]?.countsForHandLimit))
      return 'Invalid cards';
    if (cardsTotal(a.cards) !== owed) return `Discard exactly ${owed} cards`;
    if (!ctx.has(a.player, a.cards)) return 'You do not have those cards';
    return null;
  },
  apply(ctx, a) {
    const ph = phaseData<DiscardPhase>(ctx);
    ctx.pay(a.player, a.cards);
    ctx.emit({ type: 'discarded', player: a.player, cards: a.cards });
    const owed = { ...ph.owed };
    delete owed[a.player];
    if (Object.keys(owed).length) ctx.setPhase({ ...ph, owed });
    else ctx.setPhase({ id: 'moveRobber', returnTo: ph.returnTo });
  },
  enumerate(ctx, player) {
    const owed = phaseData<DiscardPhase>(ctx).owed[player];
    if (!owed) return [];
    // Suggest discarding from the largest piles first. Bots pick their own.
    const hand = { ...ctx.player(player).hand };
    const cards: Record<string, number> = {};
    for (let i = 0; i < owed; i++) {
      const top = Object.entries(hand)
        .filter(([k, n]) => n > 0 && ctx.registry.cardTypes[k]?.countsForHandLimit)
        .sort((x, y) => y[1] - x[1])[0];
      // A browser sees another player's hand only as a count of hidden cards,
      // so there is nothing to suggest for them.
      if (!top) return [];
      hand[top[0]] = top[1] - 1;
      cards[top[0]] = (cards[top[0]] ?? 0) + 1;
    }
    return [{ type: 'discard', player, cards }];
  },
});

interface RobberPhase {
  id: 'moveRobber';
  returnTo: string;
}

const moveRobber = action<{ hex: HexId }>({
  phases: ['moveRobber'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    if (!robberHexes(ctx).includes(a.hex)) return 'The robber can not go there';
    return null;
  },
  apply(ctx, a) {
    const ph = phaseData<RobberPhase>(ctx);
    const r = robber(ctx);
    if (r) ctx.move(r, { kind: 'hex', id: a.hex });
    else ctx.place('robber', null, { kind: 'hex', id: a.hex });
    ctx.emit({ type: 'robberMoved', player: a.player, hex: a.hex });
    const candidates = stealCandidates(ctx, a.hex, a.player);
    if (candidates.length === 0) ctx.setPhase({ id: ph.returnTo });
    else if (candidates.length === 1) {
      stealFrom(ctx, a.player, candidates[0] as number);
      ctx.setPhase({ id: ph.returnTo });
    } else ctx.setPhase({ id: 'steal', hex: a.hex, candidates, returnTo: ph.returnTo });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return robberHexes(ctx).map((hex) => ({ type: 'moveRobber', player, hex }));
  },
});

interface StealPhase {
  id: 'steal';
  candidates: number[];
  returnTo: string;
}

const steal = action<{ from: number }>({
  phases: ['steal'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    if (!phaseData<StealPhase>(ctx).candidates.includes(a.from))
      return 'You can not steal from that player';
    return null;
  },
  apply(ctx, a) {
    stealFrom(ctx, a.player, a.from);
    ctx.setPhase({ id: phaseData<StealPhase>(ctx).returnTo });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return phaseData<StealPhase>(ctx).candidates.map((from) => ({ type: 'steal', player, from }));
  },
});

// ---- Building ----

function canAfford(ctx: Ctx, seat: number, item: string): string | null {
  return ctx.has(seat, ctx.cost(item, seat)) ? null : `You can not afford a ${item}`;
}

const buildRoad = action<{ edge: EdgeId }>({
  phases: ['main'],
  check(ctx, a) {
    return (
      onlyActive(ctx, a) ?? canAfford(ctx, a.player, 'road') ?? canPlaceRoad(ctx, a.player, a.edge)
    );
  },
  apply(ctx, a) {
    ctx.pay(a.player, ctx.cost('road', a.player));
    ctx.place('road', a.player, { kind: 'edge', id: a.edge });
    ctx.emit({ type: 'built', player: a.player, piece: 'road', at: a.edge });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || !ctx.has(player, ctx.cost('road', player))) return [];
    return legalRoadEdges(ctx, player).map((edge) => ({ type: 'buildRoad', player, edge }));
  },
});

const buildSettlement = action<{ corner: CornerId }>({
  phases: ['main'],
  check(ctx, a) {
    return (
      onlyActive(ctx, a) ??
      canAfford(ctx, a.player, 'settlement') ??
      canPlaceSettlement(ctx, a.player, a.corner, true)
    );
  },
  apply(ctx, a) {
    ctx.pay(a.player, ctx.cost('settlement', a.player));
    ctx.place('settlement', a.player, { kind: 'corner', id: a.corner });
    ctx.emit({ type: 'built', player: a.player, piece: 'settlement', at: a.corner });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || !ctx.has(player, ctx.cost('settlement', player))) return [];
    return ctx.geometry.corners.map((corner) => ({ type: 'buildSettlement', player, corner }));
  },
});

const buildCity = action<{ corner: CornerId }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a) ?? canAfford(ctx, a.player, 'city');
    if (err) return err;
    const b = ctx.buildingAt(a.corner);
    if (!b || b.type !== 'settlement' || b.owner !== a.player)
      return 'Cities replace one of your settlements';
    if (ctx.supplyLeft(a.player, 'city') <= 0) return 'No cities left';
    return null;
  },
  apply(ctx, a) {
    ctx.pay(a.player, ctx.cost('city', a.player));
    ctx.upgrade(ctx.buildingAt(a.corner) as NonNullable<ReturnType<Ctx['buildingAt']>>, 'city');
    ctx.emit({ type: 'built', player: a.player, piece: 'city', at: a.corner });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return ctx
      .piecesOf(player, 'settlement')
      .map((p) => ({ type: 'buildCity', player, corner: (p.at as { id: CornerId }).id }));
  },
});

// ---- Development cards ----

const buyDevCard = action<object>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a) ?? canAfford(ctx, a.player, 'devCard');
    if (err) return err;
    return ctx.state.decks.dev?.length ? null : 'No development cards left';
  },
  apply(ctx, a) {
    ctx.pay(a.player, ctx.cost('devCard', a.player));
    const card = ctx.drawCard('dev') as string;
    const p = ctx.player(a.player);
    (p.held.dev ??= []).push({ card, acquiredTurn: ctx.state.turn.number });
    ctx.emit({
      type: 'boughtDevCard',
      player: a.player,
      card,
      visibleTo: [a.player],
      redacted: { player: a.player },
    });
  },
  enumerate: (ctx, player) => (player === ctx.active ? [{ type: 'buyDevCard', player }] : []),
});

type PlayDev =
  | { card: 'knight' }
  | { card: 'roadBuilding' }
  | { card: 'yearOfPlenty'; resources: [string, string] }
  | { card: 'monopoly'; resource: string };

/** Index of a playable copy of a development card, or -1. */
function playableIndex(ctx: Ctx, seat: number, card: string): number {
  return (ctx.player(seat).held.dev ?? []).findIndex(
    (h) => h.card === card && h.acquiredTurn < ctx.state.turn.number,
  );
}

const playDevCard = action<PlayDev>({
  phases: ['roll', 'main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (
      !(DEV_CARDS as readonly string[]).includes(a.card) ||
      a.card === ('victoryPoint' as string)
    ) {
      return 'That card can not be played';
    }
    if (ctx.state.phase.id === 'roll' && a.card !== 'knight')
      return 'Only a knight can be played before rolling';
    if (playerData(ctx, a.player).devPlayedTurn === ctx.state.turn.number) {
      return 'You already played a development card this turn';
    }
    if (playableIndex(ctx, a.player, a.card) < 0) return 'You have no playable card of that kind';
    if (a.card === 'yearOfPlenty') {
      if (
        !Array.isArray(a.resources) ||
        a.resources.length !== 2 ||
        !a.resources.every(knownResource)
      ) {
        return 'Pick two resources';
      }
      const want: Record<string, number> = {};
      for (const r of a.resources) want[r] = (want[r] ?? 0) + 1;
      if (!ctx.bankHas(want)) return 'The bank does not have those resources';
    }
    if (a.card === 'monopoly' && !knownResource(a.resource)) return 'Pick a resource';
    if (a.card === 'roadBuilding' && !freeRouteSpot(ctx, a.player)) {
      // Ask the free-road move itself, so a scenario that refuses every edge
      // can't start a step with no legal move in it.
      if (ctx.supplyLeft(a.player, 'road') <= 0) return 'No roads left';
      return 'There is nowhere to build a road';
    }
    return null;
  },
  apply(ctx, a) {
    const p = ctx.player(a.player);
    const dev = p.held.dev ?? [];
    dev.splice(playableIndex(ctx, a.player, a.card), 1);
    p.played[a.card] = (p.played[a.card] ?? 0) + 1;
    playerData(ctx, a.player).devPlayedTurn = ctx.state.turn.number;
    const returnTo = ctx.state.phase.id;
    ctx.emit({ type: 'playedDevCard', player: a.player, card: a.card });

    switch (a.card) {
      case 'knight':
        updateLargestArmy(ctx, a.player);
        ctx.setPhase({ id: 'moveRobber', returnTo });
        break;
      case 'roadBuilding':
        ctx.setPhase({
          id: 'roadBuilding',
          remaining: Math.min(2, ctx.supplyLeft(a.player, 'road')),
          returnTo,
        });
        break;
      case 'yearOfPlenty': {
        const want: Record<string, number> = {};
        for (const r of a.resources) want[r] = (want[r] ?? 0) + 1;
        ctx.grant(a.player, want);
        ctx.emit({ type: 'yearOfPlenty', player: a.player, cards: want });
        break;
      }
      case 'monopoly': {
        let taken = 0;
        for (const other of ctx.state.players) {
          if (other.seat === a.player) continue;
          const n = other.hand[a.resource] ?? 0;
          if (n > 0) {
            ctx.transfer(other.seat, a.player, { [a.resource]: n });
            taken += n;
          }
        }
        ctx.emit({ type: 'monopoly', player: a.player, resource: a.resource, taken });
        break;
      }
    }
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    const out: Action[] = [{ type: 'playDevCard', player, card: 'knight' }];
    out.push({ type: 'playDevCard', player, card: 'roadBuilding' });
    for (const r of RESOURCES)
      out.push({ type: 'playDevCard', player, card: 'monopoly', resource: r });
    RESOURCES.forEach((r1, i) =>
      RESOURCES.slice(i).forEach((r2) =>
        out.push({ type: 'playDevCard', player, card: 'yearOfPlenty', resources: [r1, r2] }),
      ),
    );
    return out;
  },
});

interface RoadBuildingPhase {
  id: 'roadBuilding';
  remaining: number;
  returnTo: string;
}

const placeFreeRoad = action<{ edge: EdgeId }>({
  phases: ['roadBuilding'],
  check(ctx, a) {
    return onlyActive(ctx, a) ?? canPlaceRoad(ctx, a.player, a.edge);
  },
  apply(ctx, a) {
    const ph = phaseData<RoadBuildingPhase>(ctx);
    ctx.place('road', a.player, { kind: 'edge', id: a.edge });
    ctx.emit({ type: 'built', player: a.player, piece: 'road', at: a.edge, free: true });
    const remaining = ph.remaining - 1;
    if (remaining > 0 && freeRouteSpot(ctx, a.player)) ctx.setPhase({ ...ph, remaining });
    else ctx.setPhase({ id: ph.returnTo });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return legalRoadEdges(ctx, player).map((edge) => ({ type: 'placeFreeRoad', player, edge }));
  },
});

// ---- Trading ----

/** How many of `give` the bank wants for one `get`. */
export function bankRatio(ctx: Ctx, seat: number, give: string, get: string): number {
  return ctx.reduce('swapRatio', seat, give, get, ctx.reduce('tradeRatio', seat, give, 4));
}

const bankTrade = action<{ give: string; get: string }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (!ctx.registry.cardTypes[a.give] || !ctx.registry.cardTypes[a.get]) return 'Unknown card';
    if (!isResource(a.give) && ctx.registry.cardTypes[a.give]?.category !== 'commodity')
      return 'Can not trade that';
    if (a.give === a.get) return 'Pick a different card to receive';
    const ratio = bankRatio(ctx, a.player, a.give, a.get);
    if (!ctx.has(a.player, { [a.give]: ratio })) return `You need ${ratio} ${a.give}`;
    if (!ctx.bankHas({ [a.get]: 1 })) return 'The bank has none left';
    return null;
  },
  apply(ctx, a) {
    const ratio = bankRatio(ctx, a.player, a.give, a.get);
    ctx.pay(a.player, { [a.give]: ratio });
    ctx.grant(a.player, { [a.get]: 1 });
    ctx.emit({
      type: 'bankTrade',
      player: a.player,
      gave: { [a.give]: ratio },
      got: { [a.get]: 1 },
    });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return RESOURCES.flatMap((give) =>
      RESOURCES.filter((g) => g !== give).map((get) => ({ type: 'bankTrade', player, give, get })),
    );
  },
});

function validTradeCards(ctx: Ctx, cards: unknown): cards is Record<string, number> {
  return (
    isCards(cards, (c) => !!ctx.registry.cardTypes[c]) &&
    cardsTotal(cards as Record<string, number>) > 0
  );
}

const offerTrade = action<{
  give: Record<string, number>;
  get: Record<string, number>;
  to?: number[];
}>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (!validTradeCards(ctx, a.give) || !validTradeCards(ctx, a.get))
      return 'Offer at least one card each way';
    if (Object.keys(a.give).some((c) => (a.give[c] ?? 0) > 0 && (a.get[c] ?? 0) > 0)) {
      return 'Can not give and get the same card';
    }
    if (!ctx.has(a.player, a.give)) return 'You do not have those cards';
    if (a.to !== undefined) {
      if (!Array.isArray(a.to) || a.to.length === 0) return 'Pick who the offer is for';
      if (a.to.some((s) => s === a.player || !ctx.state.players[s])) return 'Invalid player';
    }
    return null;
  },
  apply(ctx, a) {
    const offer: TradeOffer = {
      id: ctx.state.seq,
      from: a.player,
      give: a.give,
      get: a.get,
      to: a.to ?? null,
      responses: {},
    };
    baseData(ctx).trade = offer;
    ctx.emit({ type: 'tradeOffered', offer });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || baseData(ctx).trade) return [];
    // A small sample of 1-for-1 offers; real players and bots build their own.
    const hand = ctx.player(player).hand;
    const out: Action[] = [];
    for (const give of RESOURCES) {
      if ((hand[give] ?? 0) < 1) continue;
      for (const get of RESOURCES)
        if (get !== give)
          out.push({ type: 'offerTrade', player, give: { [give]: 1 }, get: { [get]: 1 } });
    }
    return out;
  },
});

function openOffer(ctx: Ctx): TradeOffer | null {
  return baseData(ctx).trade;
}

const respondTrade = action<{ offer: number; accept: boolean }>({
  phases: ['main'],
  check(ctx, a) {
    const offer = openOffer(ctx);
    if (!offer || offer.id !== a.offer) return 'That offer is no longer open';
    if (a.player === offer.from) return 'You made this offer';
    if (offer.to && !offer.to.includes(a.player)) return 'The offer is not for you';
    if (a.accept && !ctx.has(a.player, offer.get)) return 'You do not have the cards asked for';
    return null;
  },
  apply(ctx, a) {
    const offer = openOffer(ctx) as TradeOffer;
    offer.responses[a.player] = a.accept ? 'accept' : 'decline';
    ctx.emit({ type: 'tradeResponse', player: a.player, offer: offer.id, accept: a.accept });
  },
  enumerate(ctx, player) {
    const offer = openOffer(ctx);
    if (!offer || offer.from === player || offer.responses[player]) return [];
    return [
      { type: 'respondTrade', player, offer: offer.id, accept: true },
      { type: 'respondTrade', player, offer: offer.id, accept: false },
    ];
  },
});

const confirmTrade = action<{ offer: number; with: number }>({
  phases: ['main'],
  check(ctx, a) {
    const offer = openOffer(ctx);
    if (!offer || offer.id !== a.offer) return 'That offer is no longer open';
    if (a.player !== offer.from) return 'Only the player who made the offer can confirm it';
    if (offer.responses[a.with] !== 'accept') return 'That player has not accepted';
    if (!ctx.has(a.player, offer.give)) return 'You no longer have the cards you offered';
    if (!ctx.has(a.with, offer.get)) return 'They no longer have the cards';
    return null;
  },
  apply(ctx, a) {
    const offer = openOffer(ctx) as TradeOffer;
    ctx.transfer(a.player, a.with, offer.give);
    ctx.transfer(a.with, a.player, offer.get);
    baseData(ctx).trade = null;
    ctx.emit({ type: 'traded', from: a.player, to: a.with, gave: offer.give, got: offer.get });
  },
  enumerate(ctx, player) {
    const offer = openOffer(ctx);
    if (!offer || offer.from !== player) return [];
    return Object.entries(offer.responses)
      .filter(([, r]) => r === 'accept')
      .map(([seat]) => ({ type: 'confirmTrade', player, offer: offer.id, with: Number(seat) }));
  },
});

const cancelTrade = action<object>({
  phases: ['main'],
  check(ctx, a) {
    const offer = openOffer(ctx);
    if (!offer) return 'No open offer';
    return offer.from === a.player ? null : 'Not your offer';
  },
  apply(ctx) {
    baseData(ctx).trade = null;
    ctx.emit({ type: 'tradeCancelled' });
  },
  enumerate(ctx, player) {
    return openOffer(ctx)?.from === player ? [{ type: 'cancelTrade', player }] : [];
  },
});

const endTurn = action<object>({
  phases: ['main'],
  check: onlyActive,
  apply(ctx) {
    startNextTurn(ctx);
  },
  enumerate: (ctx, player) => (player === ctx.active ? [{ type: 'endTurn', player }] : []),
});

// ---- Rescue ----

/** Steps that are never skipped: the game would be left half set up. */
const NEVER_SKIP = ['start', 'setup', 'gameOver'];

/** Steps a dead-ended step could hand over to, best first. */
function waysOut(ctx: Ctx): Phase[] {
  const ph = ctx.state.phase;
  const back = ph.returnTo;
  const out: Phase[] = [];
  if (typeof back === 'string') out.push({ id: back });
  else if (back && typeof back === 'object' && typeof (back as Phase).id === 'string')
    out.push(structuredClone(back) as Phase);
  // The robber step is where a discard normally hands over to.
  if (ph.id === 'discard') out.push({ id: 'moveRobber', returnTo: back ?? 'main' });
  out.push({ id: 'main' }, { id: 'roll' });
  return out.filter((p) => p.id !== ph.id);
}

/**
 * The last resort when a step dead-ends: nobody can move and nobody has won,
 * which only happens through a bug in a scenario's own rules. It leaves the
 * step for one the table can play on from. The room and the game screen play
 * it by themselves, so a game is never lost to a freeze; it is recorded like
 * any other move, so replays and saved games stay right.
 */
const skipStep = action<object>({
  rescue: true,
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    if (NEVER_SKIP.includes(ctx.state.phase.id)) return `Can not skip ${ctx.state.phase.id}`;
    if (!ctx.stuck) return 'Someone can still move';
    return waysOut(ctx).some((p) => ctx.canActIn(p)) ? null : 'There is no step to go on to';
  },
  apply(ctx, a) {
    const from = ctx.state.phase;
    const to = waysOut(ctx).find((p) => ctx.canActIn(p));
    rule(to, 'There is no step to go on to');
    ctx.setPhase(to);
    ctx.emit({ type: 'stepSkipped', player: a.player, step: from.id });
  },
  enumerate: (ctx, player) => (player === ctx.active ? [{ type: 'skipStep', player }] : []),
});

export const baseActions: Record<string, ActionDef> = {
  placeSetupSettlement,
  placeSetupRoad,
  roll,
  discard,
  moveRobber,
  steal,
  buildRoad,
  buildSettlement,
  buildCity,
  buyDevCard,
  playDevCard,
  placeFreeRoad,
  bankTrade,
  offerTrade,
  respondTrade,
  confirmTrade,
  cancelTrade,
  endTurn,
  skipStep,
};
