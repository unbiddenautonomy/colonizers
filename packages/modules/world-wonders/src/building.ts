import type { Action, ActionDef, Cards, CornerId, Ctx, EdgeId, HexId } from '@colonizers/engine';
import { connectsAt, RESOURCES } from '@colonizers/module-base';
import {
  action,
  BLOCKERS,
  builtWonders,
  hasStage,
  markUsed,
  MODULE_ID,
  usedThisTurn,
  wonderData,
  type WonderData,
} from './core.ts';

/**
 * Wonder abilities about building and the special cards:
 *
 * - **Pyramids I** (Osiris): a robber, pirate or dragon the owner moves onto a
 *   wonder's hex stops that wonder's abilities (see `silenced`).
 * - **Lighthouse I** (Navigational Fire): once a turn, the ship after a paid
 *   one is free.
 * - **Taj Mahal I** (Yamuna River): pay for a road with a ship's price, or for
 *   a ship with a road's.
 * - **Machu Picchu I** (Alpaca Breeding): activate a knight for 1 wool, and
 *   pay for a road with 2 wool.
 * - **Taj Mahal III** (Eight Levels of Paradise): at the end of your turn,
 *   take back one resource you spent buying something that turn.
 * - **Cristo Redentor I** (Teleférico): your roads reach straight across
 *   mountains, to the far corner.
 * - **Colosseum I** (Centumviral Court): tie the holder of Longest Road or
 *   Largest Army and the card is yours.
 */

const NAV_FIRE = 'navFire';

// ---- Prices ----

/** Lighthouse I, Taj Mahal I and Machu Picchu I. */
export function wonderPrice(ctx: Ctx, item: string, seat: number, value: Cards): Cards {
  if (item === 'ship' && freeShipNow(ctx, seat)) return {};
  const alts: Cards[] = [];
  if (hasStage(ctx, seat, 'taj', 1)) {
    if (item === 'road') alts.push(ctx.registry.costs.ship ?? { lumber: 1, wool: 1 });
    if (item === 'ship') alts.push(ctx.registry.costs.road ?? { brick: 1, lumber: 1 });
  }
  if (hasStage(ctx, seat, 'machuPicchu', 1)) {
    if (item === 'road') alts.push({ wool: 2 });
    if (item === 'activate') alts.push({ wool: 1 });
  }
  // The usual price when you can pay it, else the first other price you can.
  if (!alts.length || ctx.has(seat, value)) return value;
  return alts.find((c) => ctx.has(seat, c)) ?? value;
}

function freeShipNow(ctx: Ctx, seat: number): boolean {
  const d = ctx.state.data[MODULE_ID] as WonderData | undefined;
  return d?.freeShip?.[seat] === ctx.state.turn.number && hasStage(ctx, seat, 'lighthouse', 1);
}

/** After a ship is bought: the next one is free, once a turn. */
function navigationalFire(ctx: Ctx, a: Action): void {
  if (a.type !== 'buildShip' || !hasStage(ctx, a.player, 'lighthouse', 1)) return;
  const d = wonderData(ctx);
  d.freeShip ??= {};
  if (d.freeShip[a.player] === ctx.state.turn.number) {
    delete d.freeShip[a.player];
    ctx.emit({ type: 'wonderFreeShip', player: a.player });
  } else if (!usedThisTurn(ctx, a.player, NAV_FIRE)) {
    markUsed(ctx, a.player, NAV_FIRE);
    d.freeShip[a.player] = ctx.state.turn.number;
  }
}

// ---- Taj Mahal III ----

/** Actions that buy something, whose price Taj Mahal III gives part of back. */
export const BUYS = [
  'buildRoad',
  'buildShip',
  'buildSettlement',
  'buildCity',
  'buyDevCard',
  'buildKnight',
  'activateKnight',
  'promoteKnight',
  'buildWall',
  'improveCity',
  'buildWonder',
];

/** Notes the resources a Taj Mahal owner spends. */
export function wrapBuy(prev: ActionDef): ActionDef {
  return {
    ...prev,
    apply(ctx, a) {
      if (!hasStage(ctx, a.player, 'taj', 3)) return prev.apply(ctx, a);
      const before = { ...ctx.player(a.player).hand };
      prev.apply(ctx, a);
      const after = ctx.player(a.player).hand;
      const d = wonderData(ctx);
      d.spent ??= {};
      const turn = ctx.state.turn.number;
      const mine = d.spent[a.player]?.turn === turn ? d.spent[a.player]!.cards : {};
      for (const r of RESOURCES) {
        const n = (before[r] ?? 0) - (after[r] ?? 0);
        if (n > 0) mine[r] = (mine[r] ?? 0) + n;
      }
      d.spent[a.player] = { turn, cards: mine };
    },
  };
}

/** At the end of a turn, the Taj Mahal's owner may take one spent resource back. */
export function paradiseRefund(ctx: Ctx): void {
  const seat = ctx.state.turn.player;
  const d = ctx.state.data[MODULE_ID] as WonderData | undefined;
  const spent = d?.spent?.[seat];
  if (!d || !spent) return;
  delete d.spent![seat];
  if (spent.turn !== ctx.state.turn.number || !hasStage(ctx, seat, 'taj', 3)) return;
  const cards = Object.keys(spent.cards).filter((c) => (spent.cards[c] ?? 0) > 0);
  if (!cards.length) return;
  d.refund ??= {};
  d.refund[seat] = cards;
  ctx.emit({ type: 'wonderRefundOffered', player: seat, cards });
}

export function refundOf(ctx: Ctx, seat: number): string[] {
  return (ctx.state.data[MODULE_ID] as WonderData | undefined)?.refund?.[seat] ?? [];
}

const wonderRefund = action<{ card: string }>({
  check(ctx, a) {
    if (ctx.state.phase.id === 'gameOver') return 'The game is over';
    if (!refundOf(ctx, a.player).includes(a.card)) return 'Pick a resource you spent';
    if (!ctx.bankHas({ [a.card]: 1 })) return 'The bank has none left';
    return null;
  },
  apply(ctx, a) {
    delete wonderData(ctx).refund![a.player];
    ctx.grant(a.player, { [a.card]: 1 });
    ctx.emit({ type: 'wonderRefund', player: a.player, card: a.card });
  },
  enumerate: (ctx, player) =>
    refundOf(ctx, player).map((card) => ({ type: 'wonderRefund', player, card })),
});

// ---- Cristo Redentor I ----

const NOT_CONNECTED = 'Roads must connect to your road, settlement or city';

function isMountains(ctx: Ctx, hex: HexId): boolean {
  const h = ctx.state.hexes[hex];
  return (
    !!h &&
    !h.hidden &&
    (h.type === 'mountains' || ctx.registry.hexTypes[h.type]?.produces === 'ore')
  );
}

/**
 * Corners a player's roads reach across mountains: the far corner of a
 * mountains hex from one their roads already reach. Another player's
 * building there stops it, as it would a road.
 */
export function cableCorners(ctx: Ctx, seat: number): Set<CornerId> {
  const out = new Set<CornerId>();
  for (const h of ctx.geometry.hexes) {
    if (!isMountains(ctx, h)) continue;
    // Nobody rides the cable car while the robber or a dragon sits on the mountain.
    if (ctx.piecesAt({ kind: 'hex', id: h }).some((p) => BLOCKERS.includes(p.type))) continue;
    const cs = ctx.geometry.hexCorners.get(h) ?? [];
    for (let i = 0; i < cs.length; i++) {
      const from = cs[i] as CornerId;
      const to = cs[(i + 3) % 6] as CornerId;
      if (!connectsAt(ctx, seat, from, 'land')) continue;
      const b = ctx.buildingAt(to);
      if (b && b.owner !== seat) continue;
      if (!b && ctx.blocksRouteAt(to, seat)) continue;
      out.add(to);
    }
  }
  return out;
}

/** Lets a road start from a corner across a mountain. */
export function wrapCableRoad(prev: ActionDef): ActionDef {
  return {
    ...prev,
    check(ctx, a) {
      const err = prev.check(ctx, a);
      if (err !== NOT_CONNECTED || !hasStage(ctx, a.player, 'cristo', 1)) return err;
      const corners = ctx.geometry.edgeCorners.get(a.edge as EdgeId) ?? [];
      const far = cableCorners(ctx, a.player);
      return corners.some((c) => far.has(c)) ? null : err;
    },
    enumerate(ctx, player) {
      const out = prev.enumerate?.(ctx, player) ?? [];
      if (!hasStage(ctx, player, 'cristo', 1)) return out;
      const seen = new Set(out.map((x) => x.edge));
      const sample = out[0] ?? { type: 'buildRoad', player };
      for (const c of cableCorners(ctx, player))
        for (const edge of ctx.geometry.cornerEdges.get(c) ?? [])
          if (!seen.has(edge)) {
            seen.add(edge);
            out.push({ ...sample, edge });
          }
      return out;
    },
  };
}

// ---- Colosseum I ----

const AWARD_EVENTS = new Set(['built', 'award', 'playedDevCard', 'wonderBuilt']);

/** The Colosseum's owner takes Longest Road or Largest Army on a tie. */
function centumviralCourt(ctx: Ctx): void {
  const w = builtWonders(ctx).colosseum;
  if (!w || !hasStage(ctx, w.owner, 'colosseum', 1)) return;
  if (!ctx.events.some((e) => AWARD_EVENTS.has(e.type))) return;
  const seat = w.owner;
  const base = ctx.state.data.base as
    { longestRoad?: number | null; largestArmy?: number | null } | undefined;
  if (!base) return;
  const road = base.longestRoad;
  if (road !== null && road !== undefined && road !== seat) {
    const mine = ctx.longestRoute(seat);
    const min = ctx.setting<number>('longestRoadMin') ?? 5;
    if (mine >= min && mine >= ctx.longestRoute(road)) {
      base.longestRoad = seat;
      ctx.emit({
        type: 'award',
        award: 'longestRoad',
        from: road,
        to: seat,
        length: mine,
        wonder: 'colosseum',
      });
    }
  }
  const army = base.largestArmy;
  if (army !== null && army !== undefined && army !== seat) {
    const mine = ctx.player(seat).played.knight ?? 0;
    const min = ctx.setting<number>('largestArmyMin') ?? 3;
    if (mine >= min && mine >= (ctx.player(army).played.knight ?? 0)) {
      base.largestArmy = seat;
      ctx.emit({
        type: 'award',
        award: 'largestArmy',
        from: army,
        to: seat,
        knights: mine,
        wonder: 'colosseum',
      });
    }
  }
}

// ---- Pyramids I ----

const MOVES: Record<string, string> = {
  robberMoved: 'robber',
  pirateMoved: 'pirate',
  dragonMoved: 'gwpDragon',
};

/** Remembers which blockers the Pyramids' owner last placed. */
function osiris(ctx: Ctx): void {
  const w = builtWonders(ctx).pyramids;
  for (const e of ctx.events) {
    const type = MOVES[e.type];
    if (!type) continue;
    const d = ctx.state.data[MODULE_ID] as WonderData | undefined;
    if (!w || !hasStage(ctx, w.owner, 'pyramids', 1) || e.player !== w.owner || !e.hex) {
      if (d?.osiris?.[type]) delete d.osiris[type];
      continue;
    }
    const data = wonderData(ctx);
    (data.osiris ??= {})[type] = e.hex as HexId;
  }
}

export function buildingEffects(ctx: Ctx, a: Action): void {
  osiris(ctx);
  navigationalFire(ctx, a);
  centumviralCourt(ctx);
}

export const buildingActions: Record<string, ActionDef> = { wonderRefund };
