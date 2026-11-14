import type { Action, ActionDef, Cards, Ctx, HexId, Piece } from '@colonizers/engine';
import {
  ARMY,
  BARBARIAN_DIE,
  MERCHANT_DIE,
  MERCHANT_TOLL,
  NUKE,
  UNIT_STRENGTH,
} from './constants.ts';
import {
  armyDie,
  buildingDie,
  cornerOf,
  setTurnFlag,
  turnFlag,
  unitsOf,
  wallsOf,
  type CkView,
} from './rules.ts';

/**
 * Soldiers & Armies with Cities & Knights:
 *
 * - There are no knights: units take their place against the barbarians
 *   (infantry 1, cavalry 2, artillery 3, a nuke 4), and for Defender of Catan.
 * - When the barbarians win, the players with the least strength each lose a
 *   fight for one of their cities: the barbarians roll a d12 against the
 *   city's die and walls, once. Win, and the city becomes a settlement.
 * - A metropolis defends with a d20. Beaten down to a city, its owner drops
 *   back to level 3 on that track and the metropolis may pass to a rival.
 * - The merchant can be attacked like the robber; its owner defends with a d10.
 * - The Politics metropolis marches its owner's armies five corners free.
 * - The Soldiers & Armies walls replace Cities & Knights' walls.
 */

export const withCk = (ctx: Ctx) => ctx.state.modules.includes('cities-knights');

const ck = (ctx: Ctx) => (ctx.state.data['cities-knights'] ?? {}) as CkView;

function action<T>(def: ActionDef<Action & T>): ActionDef {
  return def as unknown as ActionDef;
}

/** A player's strength in units against the barbarians. */
export function unitStrength(ctx: Ctx, seat: number): number {
  let n = ctx.piecesOf(seat, NUKE).length * UNIT_STRENGTH.nuke;
  for (const a of ctx.piecesOf(seat, ARMY)) {
    const u = unitsOf(a);
    n +=
      u.infantry * UNIT_STRENGTH.infantry +
      u.cavalry * UNIT_STRENGTH.cavalry +
      u.artillery * UNIT_STRENGTH.artillery;
  }
  return n;
}

/** The order of play, starting after `seat`. */
function after(ctx: Ctx, seat: number): number[] {
  const n = ctx.playerCount;
  return Array.from({ length: n - 1 }, (_, i) => (seat + 1 + i) % n);
}

/**
 * A metropolis beaten down to a city: its owner drops back to level 3 on the
 * track, and the metropolis goes to whoever is furthest along it (the first
 * in order of play on a tie), if they have a city to put it on.
 */
export function loseMetropolis(ctx: Ctx, city: Piece): void {
  const track = city.props.metropolis as string;
  const owner = city.owner as number;
  delete city.props.metropolis;
  const d = ck(ctx);
  if (d.metropolis) delete d.metropolis[track];
  const lv = d.levels?.[String(owner)];
  if (lv && (lv[track] ?? 0) > 3) lv[track] = 3;
  ctx.emit({ type: 'metropolisLost', player: owner, track });
  const level = (s: number) => d.levels?.[String(s)]?.[track] ?? 0;
  const best = Math.max(0, ...after(ctx, owner).map(level));
  if (best < 4) return;
  for (const s of after(ctx, owner)) {
    if (level(s) !== best) continue;
    const home = ctx.piecesOf(s, 'city').find((c) => typeof c.props.metropolis !== 'string');
    if (!home || home.at.kind !== 'corner') continue;
    home.props.metropolis = track;
    d.metropolis = { ...d.metropolis, [track]: { seat: s, corner: home.at.id } };
    ctx.emit({ type: 'metropolis', player: s, track, from: owner, at: home.at.id });
    return;
  }
}

/** Chance the barbarians' d12 beats this city (a tie holds). */
function fallChance(b: Piece): number {
  const dD = buildingDie(b);
  const w = wallsOf(b);
  let wins = 0;
  for (let a = 1; a <= BARBARIAN_DIE; a++) wins += Math.max(0, Math.min(dD, a - w - 1));
  return wins / (BARBARIAN_DIE * dD);
}

/**
 * The barbarians won: each player with the least strength (and a city) has
 * one city attacked, the one that risks the least. One roll each.
 */
export function barbarianSieges(ctx: Ctx, defended: boolean, value: number[]): number[] {
  if (!withCk(ctx) || defended) return value;
  const cities = (s: number) => ctx.piecesOf(s, 'city');
  const exposed = ctx.state.players.map((p) => p.seat).filter((s) => cities(s).length);
  if (!exposed.length) return [];
  const weakest = Math.min(...exposed.map((s) => unitStrength(ctx, s)));
  for (const s of exposed.filter((x) => unitStrength(ctx, x) === weakest)) {
    const risk = (c: Piece) => fallChance(c) * (typeof c.props.metropolis === 'string' ? 2 : 1);
    const city = [...cities(s)].sort((x, y) => risk(x) - risk(y))[0] as Piece;
    const rolls = [ctx.rng.int(1, BARBARIAN_DIE), ctx.rng.int(1, buildingDie(city))] as const;
    const fell = rolls[0] > rolls[1] + wallsOf(city);
    ctx.emit({
      type: 'barbarianSiege',
      player: s,
      at: cornerOf(city),
      dice: [BARBARIAN_DIE, buildingDie(city)],
      rolls,
      walls: wallsOf(city),
      fell,
    });
    if (!fell) continue;
    if (typeof city.props.metropolis === 'string') loseMetropolis(ctx, city);
    if (ctx.supplyLeft(s, 'settlement') > 0) {
      const settlement = ctx.upgrade(city, 'settlement');
      delete settlement.props.walls;
      delete settlement.props.damaged;
    } else ctx.remove(city);
    ctx.emit({ type: 'pillaged', player: s, at: cornerOf(city) });
  }
  // The sieges are done here, so Cities & Knights takes no city of its own.
  return [];
}

// ---- The merchant ----

function merchant(ctx: Ctx): Piece | undefined {
  return ctx.piecesOfType('merchant')[0];
}

function ownArmy(ctx: Ctx, seat: number, id: unknown): Piece | undefined {
  const p = typeof id === 'string' ? ctx.state.pieces[id] : undefined;
  return p && p.type === ARMY && p.owner === seat && p.at.kind === 'corner' ? p : undefined;
}

function nextToMerchant(ctx: Ctx, army: Piece): boolean {
  const m = merchant(ctx);
  const at = cornerOf(army);
  return (
    !!m && m.at.kind === 'hex' && !!at && (ctx.geometry.cornerHexes.get(at) ?? []).includes(m.at.id)
  );
}

/** Once a turn, an army next to a rival's merchant can attack it. */
const attackMerchant = action<{ army: string }>({
  phases: ['campaign'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    const army = ownArmy(ctx, a.player, a.army);
    if (!army) return 'That is not your army';
    const m = merchant(ctx);
    if (!m || m.owner === a.player || m.owner === null) return 'There is no rival merchant';
    if (turnFlag(ctx, 'merchantFought')) return 'You have fought the merchant this turn';
    return nextToMerchant(ctx, army) ? null : 'The army is not next to the merchant';
  },
  apply(ctx, a) {
    setTurnFlag(ctx, 'fought');
    setTurnFlag(ctx, 'merchantFought');
    const army = ownArmy(ctx, a.player, a.army) as Piece;
    const owner = merchant(ctx)?.owner as number;
    const dice = [armyDie(army), MERCHANT_DIE] as const;
    const rolls = [ctx.rng.int(1, dice[0]), ctx.rng.int(1, dice[1])] as const;
    const won = rolls[0] > rolls[1];
    ctx.emit({ type: 'merchantFought', player: a.player, defender: owner, dice, rolls, won });
    if (won) ctx.setPhase({ id: 'relocateMerchant' });
    else if (ctx.handSize(a.player) > 0) ctx.setPhase({ id: 'merchantToll', to: owner });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || !withCk(ctx)) return [];
    return ctx
      .piecesOf(player, ARMY)
      .map((army) => ({ type: 'attackMerchant', player, army: army.id }));
  },
});

const merchantFields = (ctx: Ctx): HexId[] =>
  (Object.keys(ctx.state.hexes) as HexId[]).filter((h) => {
    const hex = ctx.state.hexes[h];
    return !!hex && !hex.hidden && !!ctx.registry.hexTypes[hex.type]?.produces;
  });

/** Beaten, the merchant goes wherever the winner likes. */
const relocateMerchant = action<{ hex: HexId }>({
  phases: ['relocateMerchant'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    const m = merchant(ctx);
    if (m?.at.kind === 'hex' && m.at.id === a.hex) return 'Move the merchant to another field';
    return merchantFields(ctx).includes(a.hex)
      ? null
      : 'The merchant goes on a field that produces';
  },
  apply(ctx, a) {
    const m = merchant(ctx);
    if (m) ctx.move(m, { kind: 'hex', id: a.hex });
    ctx.emit({ type: 'merchantRelocated', player: a.player, hex: a.hex });
    ctx.setPhase({ id: 'campaign' });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return merchantFields(ctx).map((hex) => ({ type: 'relocateMerchant', player, hex }));
  },
});

const handTotal = (ctx: Ctx, seat: number) => ctx.handSize(seat);

/** Beaten by the merchant: two cards to its owner. */
const payMerchantToll = action<{ cards: Cards }>({
  phases: ['merchantToll'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    const c = a.cards;
    if (!c || typeof c !== 'object') return 'Pick the cards to give';
    const ok = Object.entries(c).every(
      ([k, n]) =>
        ctx.registry.cardTypes[k]?.countsForHandLimit && Number.isInteger(n) && (n as number) >= 0,
    );
    const total = Object.values(c).reduce((s, n) => s + (n as number), 0);
    if (!ok || total !== Math.min(MERCHANT_TOLL, handTotal(ctx, a.player)))
      return `Give ${MERCHANT_TOLL} cards`;
    return ctx.has(a.player, c) ? null : 'You do not have those cards';
  },
  apply(ctx, a) {
    const to = ctx.state.phase.to as number;
    ctx.transfer(a.player, to, a.cards);
    ctx.emit({
      type: 'merchantToll',
      player: a.player,
      to,
      cards: a.cards,
      visibleTo: [a.player, to],
      redacted: { player: a.player, to },
    });
    ctx.setPhase({ id: 'campaign' });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    const hand = { ...ctx.player(player).hand };
    const cards: Record<string, number> = {};
    const owed = Math.min(MERCHANT_TOLL, handTotal(ctx, player));
    for (let i = 0; i < owed; i++) {
      const pile = Object.entries(hand)
        .filter(([k, n]) => n > 0 && ctx.registry.cardTypes[k]?.countsForHandLimit)
        .sort((x, y) => y[1] - x[1])[0];
      if (!pile) break;
      hand[pile[0]] = pile[1] - 1;
      cards[pile[0]] = (cards[pile[0]] ?? 0) + 1;
    }
    return [{ type: 'payMerchantToll', player, cards }];
  },
});

export const ckActions: Record<string, ActionDef> = {
  attackMerchant,
  relocateMerchant,
  payMerchantToll,
};

const noKnights = (prev: ActionDef): ActionDef => ({
  ...prev,
  check: () => 'Soldiers & Armies has units instead of knights',
  enumerate: () => [],
});

const ourWalls = (prev: ActionDef): ActionDef => ({
  ...prev,
  check: () => 'Build Soldiers & Armies walls: up to three a city',
  enumerate: () => [],
});

/** Cities & Knights actions that units and our walls replace. */
export const ckWraps: Record<string, (prev: ActionDef) => ActionDef> = {
  buildKnight: noKnights,
  activateKnight: noKnights,
  promoteKnight: noKnights,
  moveKnight: noKnights,
  displaceKnight: noKnights,
  relocateKnight: noKnights,
  chaseRobber: noKnights,
  buildWall: ourWalls,
};
