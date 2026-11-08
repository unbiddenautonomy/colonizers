import { Ctx, type Action, type GameState } from '@colonizers/engine';
import { RESOURCES, devDeck, bankPerResource, baseData } from '../src/index.ts';
import { lib } from './helpers.ts';

const WEIGHTS: Record<string, number> = {
  buildCity: 60,
  buildSettlement: 50,
  confirmTrade: 20,
  buyDevCard: 12,
  buildRoad: 8,
  placeFreeRoad: 10,
  playDevCard: 4,
  respondTrade: 2,
  bankTrade: 2,
  offerTrade: 0.3,
  cancelTrade: 1,
  endTurn: 1,
};

/** Picks a weighted random legal action, preferring builds, so random games finish. */
export function pickAction(actions: Action[], rand: () => number): Action {
  const weights = actions.map((a) => WEIGHTS[a.type] ?? 1);
  let r = rand() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < actions.length; i++) {
    r -= weights[i] as number;
    if (r <= 0) return actions[i] as Action;
  }
  return actions[actions.length - 1] as Action;
}

/** Checks rules that must always hold. Throws with a description if one breaks. */
export function checkInvariants(state: GameState): void {
  const ctx = new Ctx(state, lib.registry(state.modules));
  const n = state.players.length;
  for (const r of RESOURCES) {
    const total = (state.bank[r] ?? 0) + state.players.reduce((s, p) => s + (p.hand[r] ?? 0), 0);
    if (total !== bankPerResource(n)) throw new Error(`${r} total ${total}`);
    if ((state.bank[r] ?? 0) < 0) throw new Error(`Bank ${r} negative`);
    for (const p of state.players) if ((p.hand[r] ?? 0) < 0) throw new Error(`Hand ${r} negative`);
  }
  const deckTotal = Object.values(devDeck(n)).reduce((s, x) => s + x, 0);
  const devSeen =
    (state.decks.dev?.length ?? 0) +
    state.players.reduce(
      (s, p) => s + (p.held.dev?.length ?? 0) + Object.values(p.played).reduce((a, b) => a + b, 0),
      0,
    );
  if (devSeen !== deckTotal) throw new Error(`Dev cards ${devSeen} != ${deckTotal}`);

  const buildings = Object.values(state.pieces).filter(
    (p) => p.type === 'settlement' || p.type === 'city',
  );
  const occupied = new Set<string>();
  for (const b of buildings) {
    const c = (b.at as { id: never }).id;
    if (occupied.has(c)) throw new Error('Two buildings on one corner');
    occupied.add(c);
  }
  for (const b of buildings) {
    for (const nb of ctx.geometry.cornerNeighbours.get((b.at as { id: never }).id) ?? []) {
      if (occupied.has(nb)) throw new Error('Distance rule broken');
    }
  }
  const roads = Object.values(state.pieces).filter((p) => p.type === 'road');
  const roadEdges = new Set(roads.map((r) => (r.at as { id: string }).id));
  if (roadEdges.size !== roads.length) throw new Error('Two roads on one edge');
  for (const p of state.players) {
    if (ctx.piecesOf(p.seat, 'road').length > 15) throw new Error('Too many roads');
    if (ctx.piecesOf(p.seat, 'settlement').length > 5) throw new Error('Too many settlements');
    if (ctx.piecesOf(p.seat, 'city').length > 4) throw new Error('Too many cities');
  }
  const lr = baseData(ctx).longestRoad;
  if (lr !== null && ctx.longestRoute(lr) < 5) throw new Error('Longest road holder too short');
  const la = baseData(ctx).largestArmy;
  if (la !== null && (state.players[la]?.played.knight ?? 0) < 3)
    throw new Error('Largest army too small');
}

export interface SimResult {
  state: GameState;
  actions: Action[];
  turns: number;
}

export function simulate(
  initial: GameState,
  seed: number,
  maxActions = 20_000,
  check = true,
): SimResult {
  let s = initial;
  let x = seed >>> 0 || 1;
  const rand = () => {
    // xorshift32, separate from the game's own RNG.
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
  const actions: Action[] = [];
  for (let i = 0; i < maxActions && s.winner === null; i++) {
    const waiting = lib.waitingOn(s);
    if (waiting.length === 0) throw new Error(`Nobody can act in phase ${s.phase.id}`);
    const seat = waiting[Math.floor(rand() * waiting.length)] as number;
    const options = lib.legalActions(s, seat);
    const a = pickAction(options, rand);
    s = lib.apply(s, a).state;
    actions.push(a);
    if (check) checkInvariants(s);
  }
  return { state: s, actions, turns: s.turn.number };
}
