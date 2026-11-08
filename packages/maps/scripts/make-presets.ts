/**
 * Builds the preset map files from fixed seeds and writes them to presets/.
 * Run with `pnpm --filter @colonizers/maps presets`. The seeds were picked so
 * every preset gets an A grade; change a seed to redesign a preset.
 */
import { writeFileSync } from 'node:fs';
import { generateBoard } from '../src/generate.ts';
import type { MapFile } from '../src/mapfile.ts';

const presets: {
  file: string;
  seed: string;
  players: number;
  meta: Omit<MapFile, 'hexes' | 'harbors' | 'pieces'>;
}[] = [
  {
    file: 'starter.json',
    seed: process.env.STARTER_SEED ?? 'starter',
    players: 4,
    meta: {
      id: 'starter',
      name: 'Starter',
      description: 'A fixed, balanced board for learning. Every resource is easy to reach.',
      players: { min: 2, max: 4 },
      modules: ['base'],
    },
  },
  {
    file: 'classic-5-6.json',
    seed: process.env.FIVE_SIX_SEED ?? 'classic-5-6',
    players: 6,
    meta: {
      id: 'classic-5-6',
      name: 'Classic 5–6',
      description: 'The bigger 30-hex board for 5 or 6 players.',
      players: { min: 5, max: 6 },
      modules: ['base'],
    },
  },
  {
    file: 'big-7-8.json',
    seed: process.env.SEVEN_EIGHT_SEED ?? 'big-7-8',
    players: 8,
    meta: {
      id: 'big-7-8',
      name: 'Big 7–8',
      description: 'Our 37-hex board for 7 or 8 players.',
      players: { min: 7, max: 8 },
      modules: ['base'],
    },
  },
];

for (const p of presets) {
  // Try seeds until the board earns an A grade, so presets are always fair.
  let board = generateBoard({
    seed: p.seed,
    players: p.players,
    mode: 'balanced',
    iterations: 4000,
  });
  for (let k = 1; board.report.grade !== 'A' && k < 200; k++) {
    board = generateBoard({
      seed: `${p.seed}-${k}`,
      players: p.players,
      mode: 'balanced',
      iterations: 4000,
    });
  }
  const file: MapFile = { ...p.meta, ...board.map, harbors: board.map.harbors ?? [] };
  writeFileSync(
    new URL(`../presets/${p.file}`, import.meta.url),
    `${JSON.stringify(file, null, 2)}\n`,
  );
  console.log(
    p.file,
    'seed',
    board.seed,
    'grade',
    board.report.grade,
    'spots',
    board.report.startingSpots.join(' '),
  );
}
