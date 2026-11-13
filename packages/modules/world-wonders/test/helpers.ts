import { Ctx, ModuleLibrary, type Action, type GameState } from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { seafarersModule } from '@colonizers/module-seafarers';
import { citiesKnightsModule } from '@colonizers/module-cities-knights';
import { generateBoard } from '@colonizers/maps';
import { worldWondersModule, type Built, type WonderId } from '../src/index.ts';

export const lib = new ModuleLibrary([
  baseModule,
  seafarersModule,
  citiesKnightsModule,
  worldWondersModule,
]);

export function game(seed = 'ww', settings: Record<string, unknown> = {}, ck = false): GameState {
  const board = generateBoard({ seed, players: 4, mode: 'classic' });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C', 'D'],
    modules: ['base', ...(ck ? ['cities-knights'] : []), 'world-wonders'],
    map: board.map,
    settings: { vpTarget: 10, ...settings },
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

export const act = (s: GameState, a: Action) => lib.apply(s, a).state;

/** Main phase on seat 0's turn, with no players' pieces on the board (the robber stays). */
export function blank(seed = 'ww', settings: Record<string, unknown> = {}, ck = false): GameState {
  return edit(game(seed, settings, ck), (ctx) => {
    for (const p of Object.values(ctx.state.pieces)) if (p.owner !== null) ctx.remove(p);
    ctx.setPhase({ id: 'main' });
  });
}

/** Hands wonders to players, at the stages given. */
export function own(state: GameState, wonders: Partial<Record<WonderId, Partial<Built>>>) {
  return edit(state, (ctx) => {
    const d = ctx.data<{ wonders: Record<string, Built> }>('world-wonders');
    d.wonders ??= {};
    for (const [id, w] of Object.entries(wonders))
      d.wonders[id] = { owner: 0, hex: 'h:0,0' as Built['hex'], stages: 4, ...w } as Built;
  });
}

/**
 * Rolls these number dice for `seat`, through the Colosseum's held roll (the
 * seat is given the Colosseum's third stage if nobody owns it).
 */
export function rollAs(state: GameState, seat: number, a: number, b: number): GameState {
  const s = edit(state, (ctx) => {
    const d = ctx.data<{ wonders: Record<string, Built> }>('world-wonders');
    d.wonders ??= {};
    d.wonders.colosseum ??= { owner: seat, hex: 'h:0,0' as Built['hex'], stages: 3 };
    ctx.state.turn.player = seat;
    ctx.setPhase({ id: 'wonderRoll', roller: seat, held: { a, b }, returnTo: { id: 'roll' } });
  });
  return act(s, { type: 'keepRoll', player: seat });
}

export const lastRoll = (s: GameState) =>
  (s.data.base as { lastRoll: { dice: Record<string, number | string>; total: number } }).lastRoll;
