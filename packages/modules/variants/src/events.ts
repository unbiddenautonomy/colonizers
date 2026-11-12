import type { ActionDef, Ctx, EdgeId, Phase, Piece } from '@colonizers/engine';
import { baseData, publicVp, RESOURCES, robber, stealFrom } from '@colonizers/module-base';

/**
 * Event cards: a deck of 36 cards replaces the dice. Each card has a number
 * (spread like two dice) and many have an event, resolved as the card is
 * turned. When only 5 cards are left, the deck is shuffled again, so you
 * can't count on the last few.
 */

export type EventId =
  | 'prospers'
  | 'robberAttacks'
  | 'epidemic'
  | 'earthquake'
  | 'goodNeighbors'
  | 'tournament'
  | 'tradeAdvantage'
  | 'calmSeas'
  | 'robberFlees'
  | 'neighborlyAssistance'
  | 'conflict'
  | 'plentifulYear';

export interface EventCard {
  total: number;
  event: EventId;
}

/** The deck: which event goes with which number. */
export const EVENT_DECK: readonly EventCard[] = [
  ...[7, 7, 7, 7, 7, 7].map((total) => ({ total, event: 'robberAttacks' as const })),
  { total: 6, event: 'epidemic' },
  { total: 8, event: 'epidemic' },
  { total: 6, event: 'earthquake' },
  { total: 6, event: 'goodNeighbors' },
  { total: 5, event: 'tournament' },
  { total: 5, event: 'tradeAdvantage' },
  { total: 9, event: 'calmSeas' },
  { total: 12, event: 'calmSeas' },
  { total: 4, event: 'robberFlees' },
  { total: 4, event: 'robberFlees' },
  { total: 10, event: 'neighborlyAssistance' },
  { total: 11, event: 'neighborlyAssistance' },
  { total: 3, event: 'conflict' },
  { total: 2, event: 'plentifulYear' },
  ...[3, 4, 5, 5, 6, 6, 8, 8, 8, 8, 9, 9, 9, 10, 10, 11].map((total) => ({
    total,
    event: 'prospers' as const,
  })),
];

/** Shuffle again when this many cards are left. */
export const EVENT_RESHUFFLE_AT = 5;

/** Events that ask players to choose something. */
export const PICK_EVENTS: readonly EventId[] = [
  'earthquake',
  'goodNeighbors',
  'tournament',
  'tradeAdvantage',
  'calmSeas',
  'neighborlyAssistance',
  'conflict',
  'plentifulYear',
];

export interface EventData {
  /** Cards still to turn, drawn from the end. */
  eventDeck: EventCard[];
  /** For everyone's screens: how many cards are left. */
  eventsLeft: number;
  /** The card turned this turn. */
  lastEvent: EventCard | null;
  /** Cities pay only 1 card this roll. */
  epidemic: boolean;
}

export function eventData(ctx: Ctx): EventData {
  return ctx.state.data.variants as unknown as EventData;
}

function shuffled(ctx: Ctx): EventCard[] {
  const deck = EVENT_DECK.map((c) => ({ ...c }));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = ctx.rng.int(0, i);
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

/** Turns the next event card. Runs the events that need no choices straight away. */
export function turnEventCard(ctx: Ctx): EventCard {
  const d = eventData(ctx);
  if ((d.eventDeck?.length ?? 0) <= EVENT_RESHUFFLE_AT) {
    d.eventDeck = shuffled(ctx);
    ctx.emit({ type: 'eventDeckShuffled' });
  }
  const card = d.eventDeck.pop()!;
  d.eventsLeft = d.eventDeck.length;
  d.lastEvent = card;
  ctx.emit({ type: 'eventCard', event: card.event, total: card.total });
  if (card.event === 'epidemic') d.epidemic = true;
  if (card.event === 'robberFlees') robberFlees(ctx);
  return card;
}

function robberFlees(ctx: Ctx): void {
  const r = robber(ctx);
  const desert = Object.values(ctx.state.hexes).find((h) => h.type === 'desert' && !h.hidden);
  if (!r || (desert && r.at.kind === 'hex' && r.at.id === desert.id)) return;
  if (desert) ctx.move(r, { kind: 'hex', id: desert.id });
  else ctx.remove(r);
}

// ---- Events with choices ----

export interface EventPickPhase extends Phase {
  id: 'eventPick';
  event: EventId;
  owed: Record<number, number>;
  returnTo: Phase;
}

const hasResources = (ctx: Ctx, seat: number) =>
  RESOURCES.some((r) => (ctx.player(seat).hand[r] ?? 0) > 0);
const bankHasAny = (ctx: Ctx) => RESOURCES.some((r) => (ctx.state.bank[r] ?? 0) > 0);

function leaders(values: number[], min = 1): number[] {
  const max = Math.max(...values);
  if (max < min) return [];
  return values.flatMap((v, s) => (v === max ? [s] : []));
}

/** Harbors a player has a building on. */
function harborCount(ctx: Ctx, seat: number): number {
  return ctx.harborsOf(seat).length;
}

/** Roads a player can choose for the earthquake to damage. */
function intactRoads(ctx: Ctx, seat: number): Piece[] {
  return ctx.piecesOf(seat, 'road').filter((p) => !p.props.damaged);
}

/** Players who, for this event, have something to choose. */
function whoPicks(ctx: Ctx, event: EventId): number[] {
  const seats = ctx.state.players.map((p) => p.seat);
  const n = seats.length;
  switch (event) {
    case 'earthquake':
      return seats.filter((s) => intactRoads(ctx, s).length > 0);
    case 'goodNeighbors':
      return seats.filter((s) => hasResources(ctx, s));
    case 'plentifulYear':
      return bankHasAny(ctx) ? seats : [];
    case 'tournament':
      return bankHasAny(ctx) ? leaders(seats.map((s) => ctx.player(s).played.knight ?? 0)) : [];
    case 'calmSeas':
      return bankHasAny(ctx) ? leaders(seats.map((s) => harborCount(ctx, s))) : [];
    case 'neighborlyAssistance': {
      const vp = seats.map((s) => publicVp(ctx, s));
      const top = leaders(vp, -Infinity);
      if (top.length === n) return [];
      return top.filter((s) => hasResources(ctx, s));
    }
    case 'tradeAdvantage': {
      const holder = baseData(ctx).longestRoad;
      const who =
        holder ??
        (() => {
          const l = leaders(seats.map((s) => ctx.piecesOf(s, 'road').length));
          return l.length === 1 ? l[0]! : null;
        })();
      return who !== null && seats.some((s) => s !== who && hasResources(ctx, s)) ? [who] : [];
    }
    case 'conflict': {
      const l = leaders(seats.map((s) => ctx.player(s).played.knight ?? 0));
      return l.length === 1 && seats.some((s) => s !== l[0] && hasResources(ctx, s)) ? l : [];
    }
    default:
      return [];
  }
}

/** After the roll: open the choices for this card's event, if anyone has one. */
export function startEventPicks(ctx: Ctx): void {
  const card = eventData(ctx).lastEvent;
  if (!card || !PICK_EVENTS.includes(card.event)) return;
  const seats = whoPicks(ctx, card.event);
  if (!seats.length) {
    ctx.emit({ type: 'eventNoEffect', event: card.event });
    return;
  }
  ctx.setPhase({
    id: 'eventPick',
    event: card.event,
    owed: Object.fromEntries(seats.map((s) => [s, 1])),
    returnTo: ctx.state.phase,
  } satisfies EventPickPhase);
}

/** The player to the left: next in turn order. */
const leftOf = (ctx: Ctx, seat: number) => (seat + 1) % ctx.playerCount;

export const eventPick: ActionDef = {
  phases: ['eventPick'],
  check(ctx, a) {
    const ph = ctx.state.phase as EventPickPhase;
    if (!ph.owed[a.player]) return 'You have nothing to choose for this event';
    const r = a.resource as string;
    const isRes = (RESOURCES as readonly string[]).includes(r);
    switch (ph.event) {
      case 'earthquake': {
        const edge = a.edge as EdgeId;
        return intactRoads(ctx, a.player).some((p) => (p.at as { id: EdgeId }).id === edge)
          ? null
          : 'Pick one of your roads';
      }
      case 'goodNeighbors':
        return isRes && ctx.has(a.player, { [r]: 1 }) ? null : 'Pick a resource you have';
      case 'plentifulYear':
      case 'tournament':
      case 'calmSeas':
        return isRes && ctx.bankHas({ [r]: 1 }) ? null : 'Pick a resource the bank has';
      case 'neighborlyAssistance': {
        if (!isRes || !ctx.has(a.player, { [r]: 1 })) return 'Pick a resource you have';
        const to = a.to as number;
        if (typeof to !== 'number' || !ctx.state.players[to]) return 'Pick who gets it';
        return publicVp(ctx, to) < publicVp(ctx, a.player)
          ? null
          : 'Give it to a player with fewer points';
      }
      case 'tradeAdvantage':
      case 'conflict': {
        const from = a.from as number;
        if (typeof from !== 'number' || from === a.player || !ctx.state.players[from])
          return 'Pick a player';
        // Hand size, not resources: other hands are hidden in a player's view.
        return ctx.handSize(from, false) > 0 ? null : 'They have no cards';
      }
      default:
        return 'Nothing to choose';
    }
  },
  apply(ctx, a) {
    const ph = ctx.state.phase as EventPickPhase;
    const r = a.resource as string;
    switch (ph.event) {
      case 'earthquake': {
        const road = intactRoads(ctx, a.player).find(
          (p) => (p.at as { id: EdgeId }).id === a.edge,
        )!;
        road.props = { ...road.props, damaged: true };
        ctx.emit({ type: 'roadDamaged', player: a.player, edge: a.edge });
        break;
      }
      case 'goodNeighbors': {
        const to = leftOf(ctx, a.player);
        ctx.transfer(a.player, to, { [r]: 1 });
        ctx.emit({ type: 'gifted', from: a.player, to, cards: { [r]: 1 } });
        break;
      }
      case 'plentifulYear':
      case 'tournament':
      case 'calmSeas':
        ctx.grant(a.player, { [r]: 1 });
        ctx.emit({ type: 'eventGain', player: a.player, event: ph.event, cards: { [r]: 1 } });
        break;
      case 'neighborlyAssistance':
        ctx.transfer(a.player, a.to as number, { [r]: 1 });
        ctx.emit({ type: 'gifted', from: a.player, to: a.to, cards: { [r]: 1 } });
        break;
      case 'tradeAdvantage':
      case 'conflict':
        stealOneResource(ctx, a.player, a.from as number);
        break;
    }
    const owed = { ...ph.owed };
    delete owed[a.player];
    if (Object.keys(owed).length) ctx.setPhase({ ...ph, owed });
    else ctx.setPhase(ph.returnTo);
  },
  enumerate(ctx, player) {
    const ph = ctx.state.phase as EventPickPhase;
    if (!ph.owed?.[player]) return [];
    const others = ctx.state.players.filter((p) => p.seat !== player).map((p) => p.seat);
    switch (ph.event) {
      case 'earthquake':
        return intactRoads(ctx, player).map((p) => ({
          type: 'eventPick',
          player,
          edge: (p.at as { id: EdgeId }).id,
        }));
      case 'neighborlyAssistance':
        return others.flatMap((to) =>
          RESOURCES.map((resource) => ({ type: 'eventPick', player, to, resource })),
        );
      case 'tradeAdvantage':
      case 'conflict':
        return others.map((from) => ({ type: 'eventPick', player, from }));
      default:
        return RESOURCES.map((resource) => ({ type: 'eventPick', player, resource }));
    }
  },
};

/** A random resource (not other cards) from a player. */
function stealOneResource(ctx: Ctx, thief: number, victim: number): void {
  const hand = ctx.player(victim).hand;
  const pool = RESOURCES.flatMap((r) => Array<string>(hand[r] ?? 0).fill(r));
  if (!pool.length) return stealFrom(ctx, thief, victim);
  const card = pool[ctx.rng.int(0, pool.length - 1)]!;
  ctx.transfer(victim, thief, { [card]: 1 });
  ctx.emit({
    type: 'stole',
    thief,
    victim,
    card,
    visibleTo: [thief, victim],
    redacted: { thief, victim },
  });
}

// ---- Earthquake damage ----

export function damagedRoads(ctx: Ctx, seat?: number): Piece[] {
  return ctx
    .piecesOfType('road')
    .filter((p) => p.props.damaged && (seat === undefined || p.owner === seat));
}

/** Wraps road building: no new roads while you have a damaged one. */
export function quakeRoad(prev: ActionDef): ActionDef {
  return {
    ...prev,
    check(ctx, a) {
      if (damagedRoads(ctx, a.player).length) return 'Repair your damaged road first';
      return prev.check(ctx, a);
    },
  };
}

/** Wraps settlement building: not next to a damaged road. */
export function quakeSettlement(prev: ActionDef): ActionDef {
  return {
    ...prev,
    check(ctx, a) {
      const corner = a.corner as string;
      const near = damagedRoads(ctx).some((p) =>
        (ctx.geometry.edgeCorners.get((p.at as { id: EdgeId }).id) ?? []).includes(corner as never),
      );
      if (near) return 'Settlements can not be built next to a damaged road';
      return prev.check(ctx, a);
    },
  };
}

export const repairRoad: ActionDef = {
  phases: ['main'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    const road = damagedRoads(ctx, a.player).find((p) => (p.at as { id: EdgeId }).id === a.edge);
    if (!road) return 'Pick one of your damaged roads';
    return ctx.has(a.player, ctx.cost('road', a.player))
      ? null
      : 'A repair costs 1 brick and 1 lumber';
  },
  apply(ctx, a) {
    ctx.pay(a.player, ctx.cost('road', a.player));
    const road = damagedRoads(ctx, a.player).find((p) => (p.at as { id: EdgeId }).id === a.edge)!;
    const props = { ...road.props };
    delete props.damaged;
    road.props = props;
    ctx.emit({ type: 'roadRepaired', player: a.player, edge: a.edge });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return damagedRoads(ctx, player).map((p) => ({
      type: 'repairRoad',
      player,
      edge: (p.at as { id: EdgeId }).id,
    }));
  },
};
