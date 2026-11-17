import { describe, expect, it } from 'vitest';
import { ModuleLibrary, type Action, type GameConfig } from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { seafarersModule } from '@colonizers/module-seafarers';
import { citiesKnightsModule } from '@colonizers/module-cities-knights';
import { generateBoard } from '@colonizers/maps';
import { chooseAction, newMemory } from '@colonizers/bots';
import {
  ACHIEVEMENTS,
  analyzeGame,
  careerStats,
  earnedAchievements,
  type PlayedGame,
  type SeatStats,
} from '../src/index.ts';

const lib = new ModuleLibrary([baseModule, seafarersModule, citiesKnightsModule]);

function rng(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

/** Bots play a base game; returns its config and every move. */
function botGame(seed: string): { config: GameConfig; actions: Action[] } {
  const config: GameConfig = {
    seed,
    players: ['A', 'B', 'C'],
    modules: ['base'],
    map: generateBoard({ seed, players: 3, mode: 'classic' }).map,
    settings: { vpTarget: 10 },
    fixedSeats: true,
  };
  let s = lib.createGame(config).state;
  const actions: Action[] = [];
  const memory = [newMemory(), newMemory(), newMemory()];
  const rand = rng(7);
  let clock = 0;
  for (let i = 0; i < 4000 && s.winner === null; i++) {
    clock += 1000;
    let acted = false;
    for (const seat of lib.waitingOn(s)) {
      const a = chooseAction(lib, s, seat, { level: 'medium', style: 'balanced' }, memory[seat]!, {
        rand,
        now: clock,
      });
      if (!a) continue;
      s = lib.apply(s, a).state;
      actions.push(a);
      acted = true;
      break;
    }
    if (!acted) clock += 20_000;
  }
  return { config, actions };
}

function stats(patch: Partial<SeatStats> = {}): SeatStats {
  return {
    seat: 0,
    vp: 10,
    won: true,
    gained: { ore: 3 },
    produced: 20,
    expected: 20,
    built: {},
    devCards: 0,
    knights: 0,
    monopolyBest: 0,
    longestRoad: 5,
    islands: 0,
    defender: 0,
    trades: 0,
    steals: 0,
    robbed: 0,
    discarded: 0,
    turns: 10,
    ...patch,
  };
}

function played(patch: Partial<PlayedGame> = {}): PlayedGame {
  return {
    gameId: 'g',
    ended: 0,
    map: 'random:classic',
    modules: ['base'],
    players: 4,
    seat: 0,
    won: false,
    vp: 6,
    turns: 40,
    stats: stats({ won: patch.won ?? false }),
    botLevels: [],
    ...patch,
  };
}

describe('analyzeGame', () => {
  it('works out what every seat did in a real game', () => {
    const { config, actions } = botGame('stats-1');
    const a = analyzeGame(lib, config, actions);
    expect(a.winner).not.toBeNull();
    expect(a.seats).toHaveLength(3);
    const winner = a.seats[a.winner!]!;
    expect(winner.won).toBe(true);
    expect(winner.vp).toBeGreaterThanOrEqual(10);
    // Everyone placed two settlements and two roads at the start.
    for (const s of a.seats) {
      expect(s.built.settlement ?? 0).toBeGreaterThanOrEqual(2);
      expect(s.built.road ?? 0).toBeGreaterThanOrEqual(2);
      expect(s.turns).toBeGreaterThan(0);
      expect(s.expected).toBeGreaterThan(0);
    }
    const rolls = a.dice.reduce((x, y) => x + y, 0);
    expect(rolls).toBeGreaterThan(10);
    expect(a.dice[0]).toBe(0);
    // Same moves, same answer.
    expect(analyzeGame(lib, config, actions)).toEqual(a);
  });
});

describe('achievements', () => {
  it('have unique ids', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('unlock at the game that earned them', () => {
    const games = [
      played({ gameId: 'a' }),
      played({ gameId: 'b', won: true, seat: 3, botLevels: ['hard'] }),
      played({ gameId: 'c', won: true, stats: stats({ gained: {}, longestRoad: 12 }) }),
      played({ gameId: 'd', won: true, players: 8 }),
    ];
    const got = Object.fromEntries(earnedAchievements(games).map((e) => [e.id, e.game.gameId]));
    expect(got).toMatchObject({
      'first-win': 'b',
      'last-seat': 'b',
      'beat-hard': 'b',
      'no-ore': 'c',
      'long-road': 'c',
      'hat-trick': 'd',
      'full-house': 'd',
    });
    expect(got.regular).toBeUndefined();
  });

  it('back-fill career ones across old games', () => {
    const games = Array.from({ length: 10 }, (_, i) =>
      played({ gameId: `g${i}`, stats: stats({ defender: i % 4 === 0 ? 1 : 0 }) }),
    );
    const got = Object.fromEntries(earnedAchievements(games).map((e) => [e.id, e.game.gameId]));
    expect(got.regular).toBe('g9');
    expect(got.shield).toBe('g8');
  });

  it('skip achievements that need saved moves for games without them', () => {
    const got = earnedAchievements([played({ won: true, stats: null })]).map((e) => e.id);
    expect(got).toEqual(['first-win']);
  });
});

describe('careerStats', () => {
  it('totals wins by seat and map, and the dice luck', () => {
    const c = careerStats([
      played({ seat: 0, won: true, vp: 10, turns: 30 }),
      played({
        seat: 1,
        vp: 7,
        map: 'special:volcano',
        stats: stats({ produced: 10, expected: 15 }),
      }),
      played({ seat: 0, vp: null, stats: null }),
    ]);
    expect(c.games).toBe(3);
    expect(c.wins).toBe(1);
    expect(c.averageVp).toBe(8.5);
    expect(c.bySeat).toEqual([
      { seat: 0, games: 2, wins: 1 },
      { seat: 1, games: 1, wins: 0 },
    ]);
    expect(c.byMap[0]).toEqual({ map: 'random:classic', games: 2, wins: 1 });
    expect(c.diceLuck).toEqual({ produced: 30, expected: 35 });
    expect(c.favoriteResource).toBe('ore');
    expect(c.records.fastestWin).toBe(30);
  });

  it('keeps records across many games', () => {
    const c = careerStats([
      played({ won: true, vp: 10, turns: 40, stats: stats({ longestRoad: 6, knights: 1 }) }),
      played({ won: true, vp: 12, turns: 28, stats: stats({ longestRoad: 9, knights: 4 }) }),
      played({ vp: 8, turns: 50, stats: stats({ longestRoad: 7, knights: 2 }) }),
    ]);
    expect(c.records).toEqual({ mostVp: 12, fastestWin: 28, longestRoad: 9, mostKnights: 4 });
  });
});
