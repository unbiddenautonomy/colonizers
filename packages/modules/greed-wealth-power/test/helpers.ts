import {
  Ctx,
  ModuleLibrary,
  type Action,
  type CornerId,
  type GameState,
  type HexId,
} from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { seafarersModule } from '@colonizers/module-seafarers';
import { citiesKnightsModule } from '@colonizers/module-cities-knights';
import { generateBoard, generateSeaBoard } from '@colonizers/maps';
import { greedWealthPowerModule } from '../src/index.ts';

/** Shared setup for the Greed, Wealth & Power tests. */
export const lib = new ModuleLibrary([
  baseModule,
  seafarersModule,
  citiesKnightsModule,
  greedWealthPowerModule,
]);

export function game(seed = 'gwp', settings: Record<string, unknown> = {}): GameState {
  const board = generateBoard({ seed, players: 4, mode: 'classic' });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C', 'D'],
    modules: ['base', 'cities-knights', 'greed-wealth-power'],
    map: board.map,
    settings: { vpTarget: 18, ...settings },
    fixedSeats: true,
  }).state;
}

export function seaGame(seed = 'gwp-sea'): GameState {
  const board = generateSeaBoard({ seed, players: 4, scenario: 'new-shores' });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C', 'D'],
    modules: ['base', 'seafarers', 'cities-knights', 'greed-wealth-power'],
    map: board.map,
    settings: { ...board.settings, vpTarget: 18 },
    fixedSeats: true,
  }).state;
}

export const ctxOf = (s: GameState) => new Ctx(s, lib.registry(s.modules));

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

export function rng(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

export function finishSetup(state: GameState): GameState {
  let s = state;
  const rand = rng(3);
  while (s.phase.id === 'setup' || s.phase.id === 'pickGold') {
    const seat = lib.waitingOn(s)[0] as number;
    const options = lib.legalActions(s, seat);
    s = act(s, options[Math.floor(rand() * options.length)] as Action);
  }
  return s;
}

/** A playing game in the main phase on seat 0's turn, with the board cleared of buildings. */
export function main(seed = 'gwp'): GameState {
  return edit(finishSetup(game(seed)), (ctx) => {
    ctx.setPhase({ id: 'main' });
  });
}

/** A free land corner touching a hex that produces `card`, with no building next door. */
export function cornerBy(
  ctx: Ctx,
  card: string,
  avoid: HexId[] = [],
): { corner: CornerId; hex: HexId } {
  for (const hex of Object.values(ctx.state.hexes)) {
    if (avoid.includes(hex.id)) continue;
    const ok =
      card === 'gold' ? hex.type === 'gold' : ctx.registry.hexTypes[hex.type]?.produces === card;
    if (!ok || hex.token === undefined) continue;
    for (const corner of ctx.geometry.hexCorners.get(hex.id) ?? []) {
      if (ctx.piecesAt({ kind: 'corner', id: corner }).length) continue;
      const near = (ctx.geometry.cornerEdges.get(corner) ?? []).flatMap(
        (e) => ctx.geometry.edgeCorners.get(e) ?? [],
      );
      if (near.some((c) => ctx.buildingAt(c))) continue;
      return { corner, hex: hex.id };
    }
  }
  throw new Error(`No corner by ${card}`);
}

export function placeCity(
  state: GameState,
  seat: number,
  card: string,
): {
  state: GameState;
  corner: CornerId;
  hex: HexId;
} {
  let found = { corner: '' as CornerId, hex: '' as HexId };
  const next = edit(state, (ctx) => {
    found = cornerBy(ctx, card);
    ctx.place('city', seat, { kind: 'corner', id: found.corner });
  });
  return { state: next, ...found };
}

/** Improves a track, placing the metropolis on the first free city if it asks. */
export function improve(state: GameState, seat: number, track: string): GameState {
  let s = act(state, { type: 'improveCity', player: seat, track });
  if (s.phase.id === 'placeMetropolis') s = act(s, lib.legalActions(s, seat)[0] as Action);
  return s;
}

export const grant = (state: GameState, seat: number, cards: Record<string, number>) =>
  edit(state, (ctx) => ctx.grant(seat, cards));
