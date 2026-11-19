import { describe, expect, it } from 'vitest';
import {
  Ctx,
  ModuleLibrary,
  Rng,
  type GameModule,
  type GameState,
  type Phase,
} from '@colonizers/engine';
import { baseModule, randomBaseMap } from '../src/index.ts';

/**
 * A scenario that refuses every free road, the way a few real ones can once
 * the board fills up. Without the guards it starts a Road Building step that
 * nobody can play in, and the game stops for good.
 */
const fussy: GameModule = {
  id: 'fussy',
  name: 'Fussy',
  requires: ['base'],
  wrapActions: {
    placeFreeRoad: (prev) => ({
      ...prev,
      check: () => 'Not on this board',
      enumerate: () => [],
    }),
  },
};

const lib = new ModuleLibrary([baseModule, fussy]);

function game(): GameState {
  const seed = 'rescue';
  let s = lib.createGame({
    seed,
    players: ['P0', 'P1', 'P2'],
    modules: ['base', 'fussy'],
    map: randomBaseMap(Rng.fromSeed(`map-${seed}`)),
    fixedSeats: true,
  }).state;
  while (s.phase.id === 'setup') {
    const [a] = lib.legalActions(s, s.turn.player);
    if (!a) throw new Error('No setup action');
    s = lib.apply(s, a).state;
  }
  return s;
}

/** Changes a copy of the state directly, for setting up test positions. */
function edit(state: GameState, fn: (ctx: Ctx) => void): GameState {
  const next = structuredClone(state);
  const ctx = new Ctx(next, lib.registry(next.modules));
  fn(ctx);
  ctx.commit();
  return next;
}

describe('dead ends', () => {
  it('refuses Road Building when there is nowhere to put a road', () => {
    const s = edit(game(), (c) => {
      c.player(0).held.dev = [{ card: 'roadBuilding', acquiredTurn: 0 }];
      c.state.turn.number = 3;
      c.state.phase = { id: 'main' };
    });
    expect(lib.check(s, { type: 'playDevCard', player: 0, card: 'roadBuilding' })).toBe(
      'There is nowhere to build a road',
    );
    expect(
      lib.legalActions(s, 0).some((a) => a.type === 'playDevCard' && a.card === 'roadBuilding'),
    ).toBe(false);
  });

  it('skips a step nobody can play in, and says so in the log', () => {
    const s = edit(game(), (c) => {
      c.state.phase = { id: 'roadBuilding', remaining: 2, returnTo: 'main' } as Phase;
    });
    expect(lib.stuck(s)).toBe(true);
    expect(lib.waitingOn(s)).toEqual([]);

    const rescue = { type: 'skipStep', player: s.turn.player };
    expect(lib.check(s, rescue)).toBeNull();
    const { state: after, events } = lib.apply(s, rescue);
    expect(after.phase.id).toBe('main');
    expect(lib.stuck(after)).toBe(false);
    expect(events.some((e) => e.type === 'stepSkipped' && e.step === 'roadBuilding')).toBe(true);
  });

  it('does not skip a step someone can still play in', () => {
    const s = game();
    expect(lib.stuck(s)).toBe(false);
    expect(lib.check(s, { type: 'skipStep', player: s.turn.player })).toBe(
      'Someone can still move',
    );
  });

  it('never skips the setup', () => {
    const start = lib.createGame({
      seed: 'rescue',
      players: ['P0', 'P1', 'P2'],
      modules: ['base', 'fussy'],
      map: randomBaseMap(Rng.fromSeed('map-rescue')),
      fixedSeats: true,
    }).state;
    expect(lib.check(start, { type: 'skipStep', player: start.turn.player })).toBe(
      'Can not skip setup',
    );
  });
});
