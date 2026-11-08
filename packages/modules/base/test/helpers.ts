import {
  Ctx,
  ModuleLibrary,
  Rng,
  type Action,
  type CornerId,
  type EdgeId,
  type GameState,
  type HexId,
  type MapSpec,
} from '@colonizers/engine';
import { baseModule, randomBaseMap, RESOURCES } from '../src/index.ts';

export const lib = new ModuleLibrary([baseModule]);

export function newGame(seed = 'test', players = 4, map?: MapSpec): GameState {
  return lib.createGame({
    seed,
    players: Array.from({ length: players }, (_, i) => `P${i}`),
    modules: ['base'],
    map: map ?? randomBaseMap(Rng.fromSeed(`map-${seed}`)),
    fixedSeats: true,
  }).state;
}

export function ctxOf(state: GameState): Ctx {
  return new Ctx(state, lib.registry(state.modules));
}

/** Changes a copy of the state directly, for setting up test positions. */
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

/** Plays the setup with the first legal spots, then returns the state at the first roll. */
export function quickSetup(state: GameState): GameState {
  let s = state;
  while (s.phase.id === 'setup') {
    const [a] = lib.legalActions(s, s.turn.player);
    if (!a) throw new Error('No setup action');
    s = act(s, a);
  }
  return s;
}

export function giveCards(
  state: GameState,
  seat: number,
  cards: Record<string, number>,
): GameState {
  return edit(state, (ctx) => ctx.grant(seat, cards));
}

export function allResources(n: number): Record<string, number> {
  return Object.fromEntries(RESOURCES.map((r) => [r, n]));
}

export function landHexes(state: GameState): HexId[] {
  const ctx = ctxOf(state);
  return (Object.keys(state.hexes) as HexId[]).filter((h) => ctx.isLand(h));
}

/** A path of corners/edges for building roads in tests. */
export function edgesFrom(state: GameState, start: CornerId, length: number): EdgeId[] {
  const ctx = ctxOf(state);
  const out: EdgeId[] = [];
  const seen = new Set<CornerId>([start]);
  let at = start;
  for (let i = 0; i < length; i++) {
    const next = (ctx.geometry.cornerEdges.get(at) ?? []).find((e) => {
      if (out.includes(e) || !ctx.isLandEdge(e)) return false;
      const [a, b] = ctx.geometry.edgeCorners.get(e) as [CornerId, CornerId];
      const other = a === at ? b : a;
      return !seen.has(other) && ctx.isLandCorner(other);
    });
    if (!next) throw new Error('Path blocked');
    out.push(next);
    const [a, b] = ctx.geometry.edgeCorners.get(next) as [CornerId, CornerId];
    at = a === at ? b : a;
    seen.add(at);
  }
  return out;
}

export function endOfPath(state: GameState, start: CornerId, edges: EdgeId[]): CornerId {
  const ctx = ctxOf(state);
  let at = start;
  for (const e of edges) {
    const [a, b] = ctx.geometry.edgeCorners.get(e) as [CornerId, CornerId];
    at = a === at ? b : a;
  }
  return at;
}
