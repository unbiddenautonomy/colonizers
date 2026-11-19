import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chooseAction, newMemory, type BotConfig } from '@colonizers/bots';
import type { Action, GameConfig, GameState } from '@colonizers/engine';
import { generateBoard } from '@colonizers/maps';
import { library } from './library.ts';
import {
  clearLocalGames,
  loadLocalGames,
  localCareer,
  localPlayers,
  recordLocalGame,
} from './localStats.ts';
import type { SavedGame } from './useLocalGame.ts';

/** Plays a short game to the end with bots in every seat. */
function playOut(
  seed: string,
  players: string[],
): { config: GameConfig; actions: Action[]; state: GameState } {
  const config: GameConfig = {
    seed,
    players,
    modules: ['base'],
    map: generateBoard({ seed, players: players.length }).map,
    settings: { vpTarget: 5 },
    fixedSeats: true,
  };
  let state = library.createGame(config).state;
  const actions: Action[] = [];
  const bot: BotConfig = { level: 'medium', style: 'balanced' };
  const memory = players.map(() => newMemory());
  for (let i = 0; i < 5000 && state.winner === null; i++) {
    // A seat waiting on answers to its offer has nothing to do; ask the others.
    let a: Action | null = null;
    for (const seat of library.waitingOn(state)) {
      a = chooseAction(library, state, seat, bot, memory[seat]);
      if (a) break;
    }
    if (!a) break;
    state = library.apply(state, a).state;
    actions.push(a);
  }
  return { config, actions, state };
}

describe('stats for games on this device', () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
        removeItem: (k: string) => void data.delete(k),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps each finished game once and adds up stats by name', () => {
    const one = playOut('local-1', ['Ann', 'Ben', 'Robo']);
    expect(one.state.winner).not.toBeNull();
    const saved: SavedGame = {
      config: one.config,
      actions: one.actions,
      bots: { 2: { level: 'hard', style: 'balanced' } },
      mapKey: 'random:classic',
    };
    const record = recordLocalGame(saved, one.state)!;
    expect(record.seats.map((s) => [s.name, s.bot])).toEqual([
      ['Ann', null],
      ['Ben', null],
      ['Robo', 'hard'],
    ]);
    expect(record.seats.filter((s) => s.won)).toHaveLength(1);
    expect(record.seats.every((s) => s.stats !== null)).toBe(true);
    // Resuming the finished save doesn't count it again.
    expect(recordLocalGame(saved, one.state)).toBeNull();
    expect(loadLocalGames()).toHaveLength(1);

    const two = playOut('local-2', ['ann ', 'Cat']);
    recordLocalGame({ config: two.config, actions: two.actions }, two.state);

    const players = localPlayers(loadLocalGames());
    // Most games first; who won the one-game seats is incidental (it is the
    // next tie-break), so the rest are compared by name.
    expect(players[0]).toMatchObject({ name: 'Ann', games: 2 });
    expect(
      players
        .map((p) => [p.name, p.games])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual([
      ['Ann', 2],
      ['Ben', 1],
      ['Cat', 1],
    ]);
    const ann = localCareer(loadLocalGames(), 'Ann');
    expect(ann.career.games).toBe(2);
    expect(ann.career.byMap.map((m) => m.map).sort()).toEqual(['random:classic', 'unknown']);
    expect(ann.career.diceLuck?.produced).toBeGreaterThan(0);

    clearLocalGames();
    expect(loadLocalGames()).toEqual([]);
  });

  it('copes with storage being blocked', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
        removeItem: () => {
          throw new Error('blocked');
        },
      },
    });
    expect(loadLocalGames()).toEqual([]);
    expect(() => clearLocalGames()).not.toThrow();
  });
});
