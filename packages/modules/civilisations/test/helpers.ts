import { Ctx, ModuleLibrary, type Action, type GameState } from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { seafarersModule } from '@colonizers/module-seafarers';
import { citiesKnightsModule } from '@colonizers/module-cities-knights';
import { greedWealthPowerModule } from '@colonizers/module-greed-wealth-power';
import { worldWondersModule } from '@colonizers/module-world-wonders';
import { generateBoard } from '@colonizers/maps';
import { civilisationsModule } from '../src/index.ts';

/** Shared test helpers. */

export const lib = new ModuleLibrary([
  baseModule,
  seafarersModule,
  citiesKnightsModule,
  greedWealthPowerModule,
  worldWondersModule,
  civilisationsModule,
]);

export function game(seed = 'civ', wonders = false): GameState {
  const board = generateBoard({ seed, players: 4, mode: 'classic' });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C', 'D'],
    modules: [
      'base',
      'cities-knights',
      'greed-wealth-power',
      ...(wonders ? ['world-wonders'] : []),
      'civilisations',
    ],
    map: board.map,
    settings: { wonderToWin: false },
    fixedSeats: true,
  }).state;
}

export const ctxOf = (s: GameState) => new Ctx(s, lib.registry(s.modules));
export const act = (s: GameState, a: Action) => lib.apply(s, a).state;

export function edit(state: GameState, fn: (ctx: Ctx) => void): GameState {
  const next = structuredClone(state);
  const ctx = ctxOf(next);
  fn(ctx);
  ctx.commit();
  return next;
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

/** Deals these civilisations and picks them. */
export function pick(state: GameState, civs: string[]): GameState {
  let s = edit(state, (ctx) => {
    const d = ctx.state.data.civilisations as { dealt: Record<number, string[]> };
    civs.forEach((c, seat) => (d.dealt[seat] = [c]));
  });
  civs.forEach((civ, seat) => (s = act(s, { type: 'pickCiv', player: seat, civ })));
  return s;
}

/** Plays the starting placements (and any start choices) at random. */
export function finishSetup(state: GameState): GameState {
  let s = state;
  const rand = rng(3);
  const early = ['setup', 'pickGold', 'civNeutral', 'progressDiscard'];
  while (early.includes(s.phase.id)) {
    const options = lib
      .waitingOn(s)
      .flatMap((seat) => lib.legalActions(s, seat))
      .filter((a) => a.type !== 'civPick');
    s = act(s, options[Math.floor(rand() * options.length)]!);
  }
  return s;
}

export const main = (s: GameState, seat = 0) =>
  edit(s, (ctx) => {
    ctx.state.turn.player = seat;
    ctx.setPhase({ id: 'main' });
  });
