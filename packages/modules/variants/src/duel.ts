import {
  cardsTotal,
  isCards,
  type Action,
  type ActionDef,
  type CornerId,
  type Ctx,
  type EdgeId,
  type HexId,
  type Phase,
} from '@colonizers/engine';
import { distanceRuleOk, publicVp, RESOURCES } from '@colonizers/module-base';

/**
 * Duel rules for two players (our version of the two-player variant from
 * Traders & Barbarians), switched on with the `twoPlayer` setting:
 *
 * - Two neutral builders, white and black, start with 2 settlements and a
 *   road each on good spots. Their pieces produce and score nothing, but
 *   block like anyone's.
 * - When you build a road, you also build a free road for a neutral builder
 *   of your choice. When you build a settlement, you build a free neutral
 *   settlement on one of its roads, or a neutral road if there is no room.
 * - You roll twice each turn and both rolls pay. A second roll equal to
 *   the first is rolled again.
 * - Trade tokens: a settlement on the coast earns 1, one next to the desert
 *   1 more, and each knight you play 1. On your turn, spend them to take 2
 *   random resources from your opponent and give back 2 of your choice, or
 *   to send the robber home to the desert. Each costs 1 token, or 2 while
 *   you have more points showing than your opponent.
 */

export const NEUTRALS = [0, 1] as const;
export const NEUTRAL_NAMES = ['White', 'Black'];
export const NEUTRAL_SUPPLY = { road: 15, settlement: 5 };

export interface DuelData {
  /** The turn the rolls below belong to. */
  turn: number;
  rolls: number;
  first: number | null;
  /** The turn has been sent back to the dice for its second roll. */
  again: boolean;
  tokens: Record<number, number>;
}

/** Duel rules are on: two players, and not with Cities & Knights or Explorers & Pirates. */
export function duelOn(ctx: Ctx): boolean {
  const mods = ctx.state.modules;
  return (
    !!ctx.setting<boolean>('twoPlayer') &&
    ctx.playerCount === 2 &&
    !mods.includes('cities-knights') &&
    !mods.includes('explorers-pirates')
  );
}

export function duelData(ctx: Ctx): DuelData {
  const v = (ctx.state.data.variants ??= {}) as { duel?: DuelData };
  v.duel ??= { turn: -1, rolls: 0, first: null, again: false, tokens: {} };
  return v.duel;
}

export function tokensOf(ctx: Ctx, seat: number): number {
  return duelData(ctx).tokens[seat] ?? 0;
}

/** What a token move costs: 1, or 2 while you lead on points showing. */
export function tokenCost(ctx: Ctx, seat: number): number {
  const other = 1 - seat;
  return publicVp(ctx, seat) > publicVp(ctx, other) ? 2 : 1;
}

// ---- Neutral builders ----

const isNeutral = (p: { owner: number | null; props: Record<string, unknown> }, n: number) =>
  p.owner === null && p.props.neutral === n;

function neutralPieces(ctx: Ctx, n: number, type: string) {
  return ctx.piecesOfType(type).filter((p) => isNeutral(p, n));
}

/** A neutral builder reaches this corner: its own building, or its road with no one else's building. */
function neutralAt(ctx: Ctx, n: number, corner: CornerId): boolean {
  const b = ctx.buildingAt(corner);
  if (b) return isNeutral(b, n);
  return (ctx.geometry.cornerEdges.get(corner) ?? []).some((e) =>
    ctx.piecesAt({ kind: 'edge', id: e }).some((p) => p.type === 'road' && isNeutral(p, n)),
  );
}

export function neutralRoadOk(ctx: Ctx, n: number, edge: EdgeId): boolean {
  if (neutralPieces(ctx, n, 'road').length >= NEUTRAL_SUPPLY.road) return false;
  if (!ctx.isLandEdge(edge) || ctx.piecesAt({ kind: 'edge', id: edge }).length) return false;
  return (ctx.geometry.edgeCorners.get(edge) ?? []).some((c) => neutralAt(ctx, n, c));
}

export function neutralSettlementOk(ctx: Ctx, n: number, corner: CornerId): boolean {
  if (neutralPieces(ctx, n, 'settlement').length >= NEUTRAL_SUPPLY.settlement) return false;
  if (!ctx.isLandCorner(corner) || ctx.piecesAt({ kind: 'corner', id: corner }).length)
    return false;
  if (!distanceRuleOk(ctx, corner)) return false;
  return (ctx.geometry.cornerEdges.get(corner) ?? []).some((e) =>
    ctx.piecesAt({ kind: 'edge', id: e }).some((p) => p.type === 'road' && isNeutral(p, n)),
  );
}

function neutralRoads(ctx: Ctx, player: number): Action[] {
  return NEUTRALS.flatMap((neutral) =>
    ctx.geometry.edges
      .filter((edge) => neutralRoadOk(ctx, neutral, edge))
      .map((edge) => ({ type: 'neutralRoad', player, neutral, edge })),
  );
}

function neutralSettlements(ctx: Ctx, player: number): Action[] {
  return NEUTRALS.flatMap((neutral) =>
    ctx.geometry.corners
      .filter((corner) => neutralSettlementOk(ctx, neutral, corner))
      .map((corner) => ({ type: 'neutralSettlement', player, neutral, corner })),
  );
}

interface NeutralPhase extends Phase {
  id: 'neutralBuild';
  piece: 'road' | 'settlement';
  player: number;
  resume: Phase;
}

/** After you build, the neutral builders get the same piece (a road if a settlement won't fit). */
function startNeutral(ctx: Ctx, built: 'road' | 'settlement', player: number): void {
  if (ctx.state.winner !== null) return;
  let piece = built;
  if (piece === 'settlement' && !neutralSettlements(ctx, player).length) piece = 'road';
  if (piece === 'road' && !neutralRoads(ctx, player).length) return;
  ctx.setPhase({ id: 'neutralBuild', piece, player, resume: ctx.state.phase });
}

const neutralRoad: ActionDef = {
  phases: ['neutralBuild'],
  check(ctx, a) {
    const ph = ctx.state.phase as NeutralPhase;
    if (a.player !== ph.player) return 'Not your neutral build';
    if (ph.piece !== 'road') return 'Build a neutral settlement';
    if (!NEUTRALS.includes(a.neutral as 0 | 1)) return 'Pick a neutral builder';
    return neutralRoadOk(ctx, a.neutral as number, a.edge as EdgeId)
      ? null
      : 'The neutral road must join that builder’s road or settlement';
  },
  apply(ctx, a) {
    const ph = ctx.state.phase as NeutralPhase;
    ctx.place('road', null, { kind: 'edge', id: a.edge as EdgeId }, { neutral: a.neutral });
    ctx.emit({ type: 'neutralBuilt', player: a.player, neutral: a.neutral, piece: 'road' });
    ctx.setPhase(ph.resume);
  },
  enumerate(ctx, player) {
    const ph = ctx.state.phase as NeutralPhase;
    return ph.player === player && ph.piece === 'road' ? neutralRoads(ctx, player) : [];
  },
};

const neutralSettlement: ActionDef = {
  phases: ['neutralBuild'],
  check(ctx, a) {
    const ph = ctx.state.phase as NeutralPhase;
    if (a.player !== ph.player) return 'Not your neutral build';
    if (ph.piece !== 'settlement') return 'Build a neutral road';
    if (!NEUTRALS.includes(a.neutral as 0 | 1)) return 'Pick a neutral builder';
    return neutralSettlementOk(ctx, a.neutral as number, a.corner as CornerId)
      ? null
      : 'The neutral settlement must go on that builder’s road, two corners from any other';
  },
  apply(ctx, a) {
    const ph = ctx.state.phase as NeutralPhase;
    ctx.place(
      'settlement',
      null,
      { kind: 'corner', id: a.corner as CornerId },
      { neutral: a.neutral },
    );
    ctx.emit({ type: 'neutralBuilt', player: a.player, neutral: a.neutral, piece: 'settlement' });
    ctx.setPhase(ph.resume);
  },
  enumerate(ctx, player) {
    const ph = ctx.state.phase as NeutralPhase;
    return ph.player === player && ph.piece === 'settlement' ? neutralSettlements(ctx, player) : [];
  },
};

/** Puts the neutral builders' starting settlements and roads on good spots. */
export function placeNeutrals(ctx: Ctx): void {
  const pips = (t?: number) => (t ? 6 - Math.abs(7 - t) : 0);
  const value = (c: CornerId) =>
    (ctx.geometry.cornerHexes.get(c) ?? []).reduce(
      (s, h) => s + pips(ctx.state.hexes[h]?.token),
      0,
    );
  for (let round = 0; round < 2; round++)
    for (const n of NEUTRALS) {
      const spots = ctx.geometry.corners
        .filter((c) => ctx.isLandCorner(c) && distanceRuleOk(ctx, c) && value(c) >= 5)
        .sort((a, b) => value(b) - value(a) || (a < b ? -1 : 1));
      // A good spot, but not always the best: pick among the top few.
      const pick = spots[ctx.rng.int(0, Math.min(spots.length, 6) - 1)];
      if (!pick) return;
      ctx.place('settlement', null, { kind: 'corner', id: pick }, { neutral: n });
      const edges = (ctx.geometry.cornerEdges.get(pick) ?? []).filter(
        (e) => ctx.isLandEdge(e) && !ctx.piecesAt({ kind: 'edge', id: e }).length,
      );
      const edge = edges[ctx.rng.int(0, edges.length - 1)];
      if (edge) ctx.place('road', null, { kind: 'edge', id: edge }, { neutral: n });
    }
}

// ---- Trade tokens ----

function earn(ctx: Ctx, seat: number, n: number, why: string): void {
  if (n <= 0) return;
  const d = duelData(ctx);
  d.tokens[seat] = (d.tokens[seat] ?? 0) + n;
  ctx.emit({ type: 'tokensEarned', player: seat, tokens: n, why });
}

function settlementTokens(ctx: Ctx, corner: CornerId): number {
  const hexes = ctx.geometry.cornerHexes.get(corner) ?? [];
  const coast = hexes.some((h) => !ctx.isLand(h));
  const desert = hexes.some((h) => ctx.state.hexes[h]?.type === 'desert');
  return (coast ? 1 : 0) + (desert ? 1 : 0);
}

function spend(ctx: Ctx, a: Action): string | null {
  if (!duelOn(ctx)) return 'Trade tokens are only in two-player duel games';
  if (a.player !== ctx.active) return 'Not your turn';
  const cost = tokenCost(ctx, a.player);
  return tokensOf(ctx, a.player) >= cost
    ? null
    : `You need ${cost} trade token${cost === 1 ? '' : 's'}`;
}

function pay(ctx: Ctx, seat: number): number {
  const cost = tokenCost(ctx, seat);
  duelData(ctx).tokens[seat] = tokensOf(ctx, seat) - cost;
  return cost;
}

interface GiveBackPhase extends Phase {
  id: 'giveBack';
  player: number;
  to: number;
  resume: Phase;
}

const forceTrade: ActionDef = {
  phases: ['main'],
  check(ctx, a) {
    const err = spend(ctx, a);
    if (err) return err;
    const other = 1 - a.player;
    return RESOURCES.some((r) => (ctx.player(other).hand[r] ?? 0) > 0)
      ? null
      : 'Your opponent has no resources';
  },
  apply(ctx, a) {
    const other = 1 - a.player;
    const tokens = pay(ctx, a.player);
    const took: Record<string, number> = {};
    for (let i = 0; i < 2; i++) {
      const hand = ctx.player(other).hand;
      const cards = RESOURCES.flatMap((r) => Array<string>(hand[r] ?? 0).fill(r));
      if (!cards.length) break;
      const card = cards[ctx.rng.int(0, cards.length - 1)]!;
      ctx.transfer(other, a.player, { [card]: 1 });
      took[card] = (took[card] ?? 0) + 1;
    }
    ctx.emit({
      type: 'forcedTrade',
      player: a.player,
      from: other,
      tokens,
      took,
      visibleTo: [a.player, other],
      redacted: { player: a.player, from: other, tokens, count: cardsTotal(took) },
    });
    ctx.setPhase({
      id: 'giveBack',
      player: a.player,
      to: other,
      count: cardsTotal(took),
      resume: ctx.state.phase,
    });
  },
  enumerate: (ctx, player) =>
    duelOn(ctx) && player === ctx.active ? [{ type: 'forceTrade', player }] : [],
};

const giveBack: ActionDef = {
  phases: ['giveBack'],
  check(ctx, a) {
    const ph = ctx.state.phase as GiveBackPhase & { count: number };
    if (a.player !== ph.player) return 'Not your trade';
    const cards = a.cards as Record<string, number>;
    if (!isCards(cards, (c) => (RESOURCES as readonly string[]).includes(c)))
      return 'Pick resources to give back';
    if (cardsTotal(cards) !== ph.count) return `Give back ${ph.count} resources`;
    if (!ctx.has(a.player, cards)) return 'You do not have those cards';
    return null;
  },
  apply(ctx, a) {
    const ph = ctx.state.phase as GiveBackPhase;
    ctx.transfer(a.player, ph.to, a.cards as Record<string, number>);
    ctx.emit({ type: 'gaveBack', player: a.player, to: ph.to, cards: a.cards });
    ctx.setPhase(ph.resume);
  },
  enumerate(ctx, player) {
    const ph = ctx.state.phase as GiveBackPhase & { count: number };
    if (ph.player !== player) return [];
    const hand = ctx.player(player).hand;
    const have = RESOURCES.filter((r) => (hand[r] ?? 0) > 0);
    const out: Action[] = [];
    if (ph.count === 1)
      for (const r of have) out.push({ type: 'giveBack', player, cards: { [r]: 1 } });
    else
      for (let i = 0; i < have.length; i++)
        for (let j = i; j < have.length; j++) {
          const a = have[i]!;
          const b = have[j]!;
          if (a === b && (hand[a] ?? 0) < 2) continue;
          out.push({
            type: 'giveBack',
            player,
            cards: a === b ? { [a]: 2 } : { [a]: 1, [b]: 1 },
          });
        }
    return out;
  },
};

function desertHex(ctx: Ctx): HexId | undefined {
  return Object.values(ctx.state.hexes).find((h) => h.type === 'desert')?.id;
}

const robberHome: ActionDef = {
  phases: ['main'],
  check(ctx, a) {
    const err = spend(ctx, a);
    if (err) return err;
    const desert = desertHex(ctx);
    const robber = ctx.piecesOfType('robber')[0];
    if (!desert || !robber) return 'There is no desert for the robber to go home to';
    if (robber.at.kind === 'hex' && robber.at.id === desert) return 'The robber is already home';
    return null;
  },
  apply(ctx, a) {
    const tokens = pay(ctx, a.player);
    const desert = desertHex(ctx)!;
    ctx.move(ctx.piecesOfType('robber')[0]!, { kind: 'hex', id: desert });
    ctx.emit({ type: 'robberSentHome', player: a.player, tokens, hex: desert });
  },
  enumerate: (ctx, player) =>
    duelOn(ctx) && player === ctx.active ? [{ type: 'robberHome', player }] : [],
};

export const duelActions: Record<string, ActionDef> = {
  neutralRoad,
  neutralSettlement,
  forceTrade,
  giveBack,
  robberHome,
};

/** Wraps a build so the neutral builders follow it, and settlements earn tokens. */
export function duelBuild(piece: 'road' | 'settlement') {
  return (prev: ActionDef): ActionDef => ({
    ...prev,
    apply(ctx, a) {
      prev.apply(ctx, a);
      if (!duelOn(ctx)) return;
      if (piece === 'settlement')
        earn(ctx, a.player, settlementTokens(ctx, a.corner as CornerId), 'settlement');
      startNeutral(ctx, piece, a.player);
    },
  });
}

/** Two rolls a turn: counts them, and after the first sends the turn back to roll. */
export function duelRoll(prev: ActionDef): ActionDef {
  return {
    ...prev,
    apply(ctx, a) {
      if (!duelOn(ctx)) return prev.apply(ctx, a);
      const d = duelData(ctx);
      if (d.turn !== ctx.state.turn.number) {
        d.turn = ctx.state.turn.number;
        d.rolls = 0;
        d.first = null;
        d.again = false;
      }
      prev.apply(ctx, a);
      d.rolls++;
      const last = (ctx.state.data.base as { lastRoll?: { total: number } }).lastRoll;
      if (d.rolls === 1) d.first = last?.total ?? null;
    },
  };
}

/** A second roll may not repeat the first. */
export function duelReroll(ctx: Ctx, roll: () => [number, number]): [number, number] {
  let pair = roll();
  if (!duelOn(ctx)) return pair;
  const d = duelData(ctx);
  if (d.turn !== ctx.state.turn.number || d.rolls !== 1 || d.first === null) return pair;
  for (let i = 0; i < 50 && pair[0] + pair[1] === d.first; i++) pair = roll();
  return pair;
}

export function duelAfterAction(ctx: Ctx, a: Action): void {
  if (!duelOn(ctx)) return;
  if (a.type === 'playDevCard' && a.card === 'knight') earn(ctx, a.player, 1, 'knight');
  const d = duelData(ctx);
  // Back to the dice for the second roll, once the first (and any 7) is done.
  if (
    ctx.state.phase.id === 'main' &&
    d.turn === ctx.state.turn.number &&
    d.rolls === 1 &&
    !d.again
  ) {
    d.again = true;
    ctx.setPhase({ id: 'roll' });
    ctx.emit({ type: 'secondRoll', player: ctx.active });
  }
}

export function isDuelPhase(id: string): boolean {
  return id === 'neutralBuild' || id === 'giveBack';
}
