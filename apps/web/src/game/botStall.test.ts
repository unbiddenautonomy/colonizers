import { describe, expect, it } from 'vitest';
import { generateBoard } from '@colonizers/maps';
import { chooseAction, newMemory, type BotConfig, type BotMemory } from '@colonizers/bots';
import { library } from './library.ts';

/**
 * A game of bots must never arrive somewhere the rules are waiting on a seat
 * whose bot then does nothing: the screen would ask the same question every
 * two thirds of a second for ever and the game would look frozen. This drives
 * the same loop the game screen runs, with no pauses, and fails the moment a
 * tick passes with seats able to act and nothing applied.
 */
function play(seed: string, modules: string[], players: number, configs: BotConfig[]) {
  const map = generateBoard({ seed, players }).map;
  let { state } = library.createGame({
    seed,
    players: Array.from({ length: players }, (_, i) => `P${i}`),
    modules,
    map,
    fixedSeats: true,
  });
  const memory = new Map<number, BotMemory>();
  let x = 1;
  for (const c of seed) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  const rand = () => (x = (x * 1103515245 + 12345) >>> 0) / 4294967296;

  for (let tick = 0; tick < 40000; tick++) {
    if (state.winner !== null) return { ok: true as const };
    const waiting = library.waitingOn(state);
    if (!waiting.length) return { ok: false as const, why: 'nobody can act' };
    const why: string[] = [];
    let moved = false;
    for (const seat of waiting) {
      if (!memory.has(seat)) memory.set(seat, newMemory());
      const a = chooseAction(
        library,
        state,
        seat,
        configs[seat % configs.length]!,
        memory.get(seat),
        {
          budgetMs: 200,
          rand,
        },
      );
      if (!a) {
        why.push(`seat ${seat} chose nothing`);
        continue;
      }
      const err = library.check(state, a);
      if (err !== null) {
        why.push(`seat ${seat}: ${a.type} refused (${err})`);
        continue;
      }
      state = library.apply(state, a).state;
      moved = true;
      break;
    }
    if (!moved)
      return {
        ok: false as const,
        why: `${why.join('; ')} — phase ${state.phase.id}, turn ${state.turn.player}`,
      };
  }
  return { ok: false as const, why: 'no winner after 40000 moves' };
}

describe('a game of bots always has a move', () => {
  const LEVELS = ['easy', 'medium', 'hard'] as const;
  const STYLES = ['balanced', 'builder', 'city', 'army', 'trader'] as const;
  const RUNS: [string, string[], number][] = [
    ['s1', ['base'], 4],
    ['s2', ['base'], 6],
    ['s3', ['base', 'seafarers'], 4],
    ['s4', ['base', 'cities-knights'], 4],
    ['s5', ['base', 'traders-barbarians'], 3],
    ['s6', ['base', 'strategist'], 4],
  ];
  RUNS.forEach(([seed, modules, players], n) => {
    it(`${modules.join(' + ')}, ${players} seats`, () => {
      const configs = Array.from({ length: players }, (_, s) => ({
        level: LEVELS[(n + s) % LEVELS.length]!,
        style: STYLES[(n + s * 2) % STYLES.length]!,
      }));
      const r = play(seed, modules, players, configs);
      expect(r.ok ? 'played to the end' : r.why).toBe('played to the end');
    }, 120_000);
  });
});
