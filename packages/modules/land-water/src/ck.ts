import type { Action, ActionDef, Ctx, GameModule, Piece } from '@colonizers/engine';
import {
  ckData,
  hasAbility,
  rewrapRoll,
  holdsProgress,
  spendProgress,
  TERRAIN_COMMODITY,
} from '@colonizers/module-cities-knights';
import { baseData } from '@colonizers/module-base';
import {
  buildFreeVehicle,
  chaseBlock,
  chaseOptions,
  chaseVehicle,
  freeVehicleOptions,
  roadBuildingCheck,
  speedUp,
} from './index.ts';
import { isActive, KNIGHT_MOVES, vehiclesOf } from './rules.ts';

/**
 * Land & Water with Cities & Knights:
 *
 * - No knight pieces. The base game's knight cards (the only development
 *   cards left) are bought and played as in Land & Water, even on the turn
 *   they're bought. Played knights defend against the barbarians (1 each,
 *   never turned passive), win Defender of Catan cards and count for the
 *   Largest Army; a tie goes to the player with a Fortress.
 * - A train collects a commodity in place of its resource when the player
 *   has another train in a field of the same kind. Two trains in one field
 *   never collect two commodities.
 * - The Aqueduct and fishing both pay.
 * - The barbarian ship sets sail only on the third time it is rolled.
 * - Warlord and Smith give a free knight card; the Deserter takes one of a
 *   rival's played knights; Intrigue chases a rival's vehicle; the Diplomat
 *   saves two steps; Road Building builds a free vehicle.
 * - Everyone starts with a settlement and a city. Plays to 14.
 */

export const LW_CK_ID = 'landwater-ck';
/** Ship rolls before the barbarians set sail. */
export const SHIP_ROLLS_BEFORE_SAILING = 2;
const KNIGHT_PIECES = 'There are no knight pieces in Land & Water: play knight cards instead';

interface LwCkData {
  shipRolls: number;
}

const lwCk = (ctx: Ctx): LwCkData => {
  const d = ctx.data<Partial<LwCkData>>(LW_CK_ID);
  d.shipRolls ??= 0;
  return d as LwCkData;
};

const knightsPlayed = (ctx: Ctx, seat: number) => ctx.player(seat).played.knight ?? 0;
const fortress = (ctx: Ctx, seat: number) => hasAbility(ctx, seat, 'politics');

/** The Largest Army goes to the most played knights (3 or more); a tie to a Fortress. */
function updateArmy(ctx: Ctx): void {
  const data = baseData(ctx);
  const min = ctx.setting<number>('largestArmyMin') ?? 3;
  const holder = data.largestArmy;
  const counts = ctx.state.players.map((p) => knightsPlayed(ctx, p.seat));
  const max = Math.max(...counts);
  let next = holder;
  if (max < min) next = holder !== null && (counts[holder] ?? 0) >= min ? holder : null;
  else if (holder === null || (counts[holder] ?? 0) < max) {
    const leaders = counts.flatMap((n, seat) => (n === max ? [seat] : []));
    const strong = leaders.filter((s) => fortress(ctx, s));
    if (leaders.length === 1) next = leaders[0] as number;
    else if (strong.length === 1) next = strong[0] as number;
  } else if (!fortress(ctx, holder)) {
    // Level with the holder: a Fortress takes it, unless more than one has one.
    const strong = counts.flatMap((n, seat) =>
      n === max && seat !== holder && fortress(ctx, seat) ? [seat] : [],
    );
    if (strong.length === 1) next = strong[0] as number;
  }
  if (next !== holder) {
    data.largestArmy = next;
    ctx.emit({ type: 'award', award: 'largestArmy', from: holder, to: next, knights: max });
  }
}

const refuseKnights = (prev: ActionDef): ActionDef => ({
  ...prev,
  check: () => KNIGHT_PIECES,
  enumerate: () => [],
});

const OURS = ['warlord', 'smith', 'deserter', 'intrigue', 'diplomat', 'roadBuilding'];

function progressCheck(ctx: Ctx, a: Action): string | null {
  if (a.player !== ctx.active) return 'Not your turn';
  if (!holdsProgress(ctx, a.player, a.card as string)) return 'You do not hold that card';
  if (ctx.state.phase.id !== 'main') return 'Progress cards are played after rolling';
  switch (a.card) {
    case 'warlord':
    case 'smith':
      return (ctx.state.decks.dev?.length ?? 0) > 0 ? null : 'There are no knight cards left';
    case 'deserter': {
      const t = a.target as number;
      if (!Number.isInteger(t) || t === a.player || !ctx.state.players[t])
        return 'Pick another player';
      return knightsPlayed(ctx, t) > 0 ? null : 'That player has played no knights';
    }
    case 'intrigue':
      return chaseBlock(ctx, a.player, a.target, a.to);
    case 'diplomat':
      return null;
    case 'roadBuilding':
      return roadBuildingCheck(ctx, a);
  }
  return null;
}

function progressApply(ctx: Ctx, a: Action): void {
  const seat = a.player;
  spendProgress(ctx, seat, a.card as string);
  switch (a.card) {
    case 'warlord':
    case 'smith': {
      const card = ctx.drawCard('dev');
      if (card) {
        (ctx.player(seat).held.dev ??= []).push({ card, acquiredTurn: ctx.state.turn.number });
        ctx.emit({ type: 'boughtDevCard', player: seat, free: true, visibleTo: [seat] });
      }
      return;
    }
    case 'deserter': {
      const t = a.target as number;
      const them = ctx.player(t).played;
      them.knight = (them.knight ?? 0) - 1;
      const me = ctx.player(seat).played;
      me.knight = (me.knight ?? 0) + 1;
      ctx.emit({ type: 'knightCardDeserted', player: seat, from: t });
      return;
    }
    case 'intrigue':
      chaseVehicle(ctx, seat, a.target as string, a.to);
      return;
    case 'diplomat':
      speedUp(ctx, seat, KNIGHT_MOVES);
      return;
    case 'roadBuilding':
      buildFreeVehicle(ctx, seat, a);
  }
}

const wrapProgress = (prev: ActionDef): ActionDef => ({
  ...prev,
  check: (ctx, a) => (OURS.includes(a.card as string) ? progressCheck(ctx, a) : prev.check(ctx, a)),
  apply(ctx, a) {
    if (OURS.includes(a.card as string)) progressApply(ctx, a);
    else prev.apply(ctx, a);
  },
  enumerate(ctx, player) {
    const out = (prev.enumerate?.(ctx, player) ?? []).filter(
      (x) => !OURS.includes(x.card as string),
    );
    if (player !== ctx.active) return out;
    const play = (card: string, more: Record<string, unknown> = {}) =>
      holdsProgress(ctx, player, card) && out.push({ type: 'playProgress', player, card, ...more });
    for (const card of ['warlord', 'smith', 'diplomat']) play(card);
    for (const p of ctx.state.players) if (p.seat !== player) play('deserter', { target: p.seat });
    for (const c of chaseOptions(ctx, player)) play('intrigue', c);
    for (const f of freeVehicleOptions(ctx, player)) play('roadBuilding', f);
    return out;
  },
});

/** Under Cities & Knights a knight card is ready the turn it's bought. */
const wrapPlayDev = (prev: ActionDef): ActionDef => ({
  ...prev,
  check(ctx, a) {
    if (a.card !== 'knight') return 'Only knight cards are played in Land & Water';
    if ((a.use ?? 'robber') === 'robber' && !ckData(ctx).robberActive)
      return 'The robber is not in play until the barbarians attack';
    return withFreshKnight(ctx, a.player, () => prev.check(ctx, a));
  },
  apply(ctx, a) {
    withFreshKnight(ctx, a.player, () => prev.apply(ctx, a));
  },
});

/** Runs with a knight bought this turn counted as playable. */
function withFreshKnight<T>(ctx: Ctx, seat: number, fn: () => T): T {
  const held = ctx.state.players[seat]?.held.dev ?? [];
  const turn = ctx.state.turn.number;
  if (held.some((h) => h.card === 'knight' && h.acquiredTurn < turn)) return fn();
  const fresh = held.find((h) => h.card === 'knight');
  if (!fresh) return fn();
  const was = fresh.acquiredTurn;
  fresh.acquiredTurn = turn - 1;
  try {
    return fn();
  } finally {
    // Played, it's gone; otherwise it goes back to being new.
    if (held.includes(fresh)) fresh.acquiredTurn = was;
  }
}

/** A train's commodity: with another train in a field of the same kind, one per field. */
function trainCommodity(ctx: Ctx, hexType: string, hexId: string, v: Piece): boolean {
  if (v.owner === null) return false;
  const trains = vehiclesOf(ctx, v.owner).filter(
    (t) => t.type === 'train' && isActive(t) && t.at.kind === 'hex',
  );
  const kind = (t: Piece) => ctx.state.hexes[(t.at as { id: string }).id as never]?.type;
  if (!trains.some((t) => t.id !== v.id && kind(t) === hexType)) return false;
  const here = trains.filter((t) => (t.at as { id: string }).id === hexId);
  return here.sort((x, y) => Number(x.id.slice(1)) - Number(y.id.slice(1)))[0]?.id === v.id;
}

/** The barbarians wait for the third ship on the event die. */
const wrapRoll = (prev: ActionDef): ActionDef => ({
  ...prev,
  apply(ctx, a) {
    const d = ckData(ctx);
    const lw = lwCk(ctx);
    const waiting = lw.shipRolls < SHIP_ROLLS_BEFORE_SAILING;
    if (waiting && (d.shipSteps === null || d.shipSteps === undefined)) d.shipSteps = 0;
    prev.apply(ctx, a);
    const face = ctx.events.find((e) => e.type === 'eventDie')?.face;
    if (face === 'ship' || face === 'wild') {
      lw.shipRolls += 1;
      if (waiting) ctx.emit({ type: 'barbariansWait', rolls: lw.shipRolls });
    }
  },
});

export const landWaterCkModule: GameModule = {
  id: LW_CK_ID,
  name: 'Land & Water with Cities & Knights',
  requires: ['landwater', 'cities-knights'],
  wrapActions: {
    buildKnight: refuseKnights,
    activateKnight: refuseKnights,
    promoteKnight: refuseKnights,
    moveKnight: refuseKnights,
    displaceKnight: refuseKnights,
    relocateKnight: refuseKnights,
    chaseRobber: refuseKnights,
    playProgress: wrapProgress,
    playDevCard: wrapPlayDev,
    roll: (prev) => rewrapRoll(wrapRoll(prev), prev),
  },
  hooks: {
    init(ctx) {
      lwCk(ctx);
      // Only the knights stay in the development deck.
      ctx.state.decks.dev = (ctx.state.decks.dev ?? []).filter((c) => c === 'knight');
    },
    afterAction(ctx) {
      updateArmy(ctx);
    },
  },
  reducers: {
    defense(ctx, seat, value) {
      return value + knightsPlayed(ctx, seat);
    },
    hexYield(ctx, hex, piece, value) {
      if (piece.type !== 'train') return value;
      const commodity = TERRAIN_COMMODITY[hex.type];
      const res = ctx.registry.hexTypes[hex.type]?.produces;
      if (!commodity || !res || !value[res] || !trainCommodity(ctx, hex.type, hex.id, piece))
        return value;
      return { ...value, [res]: (value[res] ?? 0) - 1, [commodity]: 1 };
    },
  },
};
