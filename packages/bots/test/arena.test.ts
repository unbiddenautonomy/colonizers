import { it } from 'vitest';
import { generateBoard } from '@colonizers/maps';
import { ModuleLibrary } from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { play } from './play.ts';
import type { BotConfig } from '../src/index.ts';

/** Bot-vs-bot match-ups, run by hand: ARENA=40 A=hard B=medium pnpm vitest run test/arena.test.ts */
declare const process: {
  env: Record<string, string | undefined>;
  stdout: { write(s: string): void };
};

const lib = new ModuleLibrary([baseModule]);
const N = Number(process.env.ARENA ?? 0);

it.skipIf(!N)(
  'arena',
  () => {
    const a: BotConfig = {
      level: (process.env.A ?? 'hard') as BotConfig['level'],
      style: 'balanced',
    };
    const b: BotConfig = {
      level: (process.env.B ?? 'medium') as BotConfig['level'],
      style: 'balanced',
    };
    let aw = 0,
      bw = 0,
      none = 0,
      rounds = 0;
    for (let g = 0; g < N; g++) {
      const seed = `arena${g}`;
      const board = generateBoard({ seed, players: 4, mode: 'classic' });
      const s = lib.createGame({
        seed,
        players: ['a', 'b', 'c', 'd'],
        modules: ['base'],
        map: board.map,
        settings: { vpTarget: 10 },
        fixedSeats: true,
      }).state;
      const bots = g % 2 ? [a, b, a, b] : [b, a, b, a];
      const r = play(s, bots, g + 1);
      rounds += r.state.turn.round;
      if (r.winner === null) none++;
      else if (bots[r.winner] === a) aw++;
      else bw++;
    }
    process.stdout.write(
      `A(${a.level}) ${aw}  B(${b.level}) ${bw}  unfinished ${none}  avg rounds ${(rounds / N).toFixed(1)}\n`,
    );
  },
  3_600_000,
);
