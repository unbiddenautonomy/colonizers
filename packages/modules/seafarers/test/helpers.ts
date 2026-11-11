import { Ctx, ModuleLibrary, stateFromView, type Action, type GameState } from '@colonizers/engine';
import { baseModule, RESOURCES } from '@colonizers/module-base';
import { generateSeaBoard } from '@colonizers/maps';
import { seafarersModule } from '../src/index.ts';

export const lib = new ModuleLibrary([baseModule, seafarersModule]);

export function seaGame(scenario = 'new-shores', players = 4, seed = 'test'): GameState {
  const board = generateSeaBoard({ seed, players, scenario });
  return lib.createGame({
    seed,
    players: Array.from({ length: players }, (_, i) => `P${i}`),
    modules: ['base', 'seafarers'],
    map: board.map,
    settings: board.settings,
    fixedSeats: true,
  }).state;
}

export function ctxOf(state: GameState): Ctx {
  return new Ctx(state, lib.registry(state.modules));
}

export function edit(state: GameState, fn: (ctx: Ctx) => void): GameState {
  const next = structuredClone(state);
  const ctx = ctxOf(next);
  fn(ctx);
  ctx.commit();
  return next;
}

export function act(state: GameState, action: Action): GameState {
  return lib.apply(state, action).state;
}

const WEIGHTS: Record<string, number> = {
  buildCity: 60,
  buildSettlement: 60,
  buildShip: 14,
  buildRoad: 8,
  buyDevCard: 10,
  placeFreeRoad: 10,
  placeFreeShip: 10,
  playDevCard: 4,
  moveShip: 2,
  bankTrade: 3,
  respondTrade: 2,
  confirmTrade: 20,
  offerTrade: 0.2,
  cancelTrade: 1,
  endTurn: 1,
};

export function pickAction(actions: Action[], rand: () => number): Action {
  const weights = actions.map((a) => WEIGHTS[a.type] ?? 1);
  let r = rand() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < actions.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return actions[i]!;
  }
  return actions[actions.length - 1]!;
}

export function rng(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

export function checkInvariants(state: GameState): void {
  const n = state.players.length;
  const ctx = ctxOf(state);
  for (const r of RESOURCES) {
    const def = lib.registry(state.modules).cardTypes[r]!;
    const total = (state.bank[r] ?? 0) + state.players.reduce((s, p) => s + (p.hand[r] ?? 0), 0);
    if (total !== def.bank(n)) throw new Error(`${r} total ${total}`);
  }
  for (const p of state.players) {
    if (ctx.piecesOf(p.seat, 'ship').length > 15) throw new Error('Too many ships');
    for (const ship of ctx.piecesOf(p.seat, 'ship')) {
      if (ship.at.kind !== 'edge' || !ctx.isSeaEdge(ship.at.id)) throw new Error('Ship on land');
    }
  }
  const edges = Object.values(state.pieces).filter((p) => p.at.kind === 'edge');
  if (new Set(edges.map((p) => (p.at as { id: string }).id)).size !== edges.length)
    throw new Error('Two pieces on one edge');
}

/** Plays a random game; checks that the browser's legal moves match the server's on the way. */
export function simulate(
  initial: GameState,
  seed: number,
  maxActions = 6000,
  compareViews = false,
): { state: GameState; actions: Action[] } {
  let s = initial;
  const rand = rng(seed);
  const actions: Action[] = [];
  for (let i = 0; i < maxActions && s.winner === null; i++) {
    const waiting = lib.waitingOn(s);
    if (!waiting.length) throw new Error(`Nobody can act in ${s.phase.id}`);
    const seat = waiting[Math.floor(rand() * waiting.length)]!;
    const options = lib.legalActions(s, seat);
    if (compareViews && i % 7 === 0) {
      const key = (a: Action) => JSON.stringify(a, Object.keys(a).sort());
      const mine = lib
        .legalActions(stateFromView(lib.view(s, seat)), seat)
        .filter((a) => a.type !== 'confirmTrade')
        .map(key)
        .sort();
      const real = options
        .filter((a) => a.type !== 'confirmTrade')
        .map(key)
        .sort();
      if (JSON.stringify(mine) !== JSON.stringify(real))
        throw new Error(`View moves differ at ${i} in ${s.phase.id}`);
    }
    const a = pickAction(options, rand);
    s = lib.apply(s, a).state;
    actions.push(a);
    checkInvariants(s);
  }
  return { state: s, actions };
}
