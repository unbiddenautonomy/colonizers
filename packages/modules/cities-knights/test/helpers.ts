import { Ctx, ModuleLibrary, stateFromView, type Action, type GameState } from '@colonizers/engine';
import { baseModule, RESOURCES } from '@colonizers/module-base';
import { seafarersModule } from '@colonizers/module-seafarers';
import { generateBoard, generateSeaBoard } from '@colonizers/maps';
import { citiesKnightsModule, COMMODITIES, KNIGHT_TYPES } from '../src/index.ts';

export const lib = new ModuleLibrary([baseModule, seafarersModule, citiesKnightsModule]);

export function ckGame(players = 4, seed = 'test'): GameState {
  const board = generateBoard({ seed, players, mode: 'classic' });
  return lib.createGame({
    seed,
    players: Array.from({ length: players }, (_, i) => `P${i}`),
    modules: ['base', 'cities-knights'],
    map: board.map,
    fixedSeats: true,
  }).state;
}

export function ckSeaGame(scenario = 'new-shores', players = 4, seed = 'test'): GameState {
  const board = generateSeaBoard({ seed, players, scenario });
  return lib.createGame({
    seed,
    players: Array.from({ length: players }, (_, i) => `P${i}`),
    modules: ['base', 'seafarers', 'cities-knights'],
    map: board.map,
    settings: { ...board.settings, vpTarget: Number(board.settings.vpTarget) + 3 },
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

/** Plays the setup round by taking the first legal placement each time. */
export function finishSetup(state: GameState, seed = 1): GameState {
  let s = state;
  const rand = rng(seed);
  while (s.phase.id === 'setup' || s.phase.id === 'pickGold') {
    const seat = lib.waitingOn(s)[0] as number;
    const options = lib.legalActions(s, seat);
    s = act(s, options[Math.floor(rand() * options.length)] as Action);
  }
  return s;
}

const WEIGHTS: Record<string, number> = {
  buildCity: 60,
  buildSettlement: 60,
  improveCity: 40,
  buildShip: 10,
  buildRoad: 8,
  buildKnight: 12,
  activateKnight: 12,
  promoteKnight: 6,
  moveKnight: 1,
  displaceKnight: 4,
  chaseRobber: 3,
  buildWall: 4,
  playProgress: 6,
  placeFreeRoad: 10,
  placeFreeShip: 10,
  moveShip: 1,
  bankTrade: 3,
  respondTrade: 2,
  confirmTrade: 20,
  offerTrade: 0.2,
  cancelTrade: 1,
  ckDone: 0.5,
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
  const reg = lib.registry(state.modules);
  const ctx = ctxOf(state);
  for (const c of [...RESOURCES, ...COMMODITIES]) {
    const total = (state.bank[c] ?? 0) + state.players.reduce((s, p) => s + (p.hand[c] ?? 0), 0);
    if (total !== reg.cardTypes[c]!.bank(n)) throw new Error(`${c} total ${total}`);
    if ((state.bank[c] ?? 0) < 0) throw new Error(`Negative bank ${c}`);
  }
  for (const p of state.players) {
    for (const t of KNIGHT_TYPES)
      if (ctx.piecesOf(p.seat, t).length > 2) throw new Error(`Too many ${t}`);
    const walls = ctx.piecesOf(p.seat, 'city').filter((c) => c.props.wall).length;
    if (walls > 3) throw new Error('Too many walls');
    for (const [card, k] of Object.entries(p.hand)) if (k < 0) throw new Error(`Negative ${card}`);
    const progress = ['science', 'trade', 'politics'].reduce(
      (s, t) => s + (p.held[t]?.length ?? 0),
      0,
    );
    if (progress > 4) throw new Error('Too many progress cards');
  }
  const corners = Object.values(state.pieces).filter((p) => p.at.kind === 'corner');
  if (new Set(corners.map((p) => (p.at as { id: string }).id)).size !== corners.length)
    throw new Error('Two pieces on one corner');
  const edges = Object.values(state.pieces).filter((p) => p.at.kind === 'edge');
  if (new Set(edges.map((p) => (p.at as { id: string }).id)).size !== edges.length)
    throw new Error('Two pieces on one edge');
  const d = state.data['cities-knights'] as {
    metropolis: Record<string, { seat: number; corner: string }>;
  };
  for (const [track, m] of Object.entries(d.metropolis ?? {})) {
    const b = Object.values(state.pieces).find(
      (p) => p.at.kind === 'corner' && p.at.id === m.corner,
    );
    if (!b || b.type !== 'city' || b.props.metropolis !== track || b.owner !== m.seat)
      throw new Error(`Metropolis ${track} is not on its city`);
  }
}

/** Plays a random game; checks the browser's legal moves match the server's on the way. */
export function simulate(
  initial: GameState,
  seed: number,
  maxActions = 8000,
  compareViews = false,
): { state: GameState; actions: Action[]; seen: Set<string> } {
  let s = initial;
  const rand = rng(seed);
  const actions: Action[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < maxActions && s.winner === null; i++) {
    const waiting = lib.waitingOn(s);
    if (!waiting.length) throw new Error(`Nobody can act in ${JSON.stringify(s.phase)}`);
    const seat = waiting[Math.floor(rand() * waiting.length)]!;
    const options = lib.legalActions(s, seat);
    if (compareViews && i % 5 === 0) {
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
        throw new Error(
          `View moves differ at ${i} in ${s.phase.id}: ${mine.filter((m) => !real.includes(m)).slice(0, 3)} / ${real.filter((m) => !mine.includes(m)).slice(0, 3)}`,
        );
    }
    const a = pickAction(options, rand);
    seen.add(a.type === 'playProgress' ? `progress:${a.card as string}` : a.type);
    s = lib.apply(s, a).state;
    actions.push(a);
    checkInvariants(s);
  }
  return { state: s, actions, seen };
}
