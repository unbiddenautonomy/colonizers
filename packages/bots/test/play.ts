import { ModuleLibrary, type Action, type GameState } from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { seafarersModule } from '@colonizers/module-seafarers';
import { citiesKnightsModule } from '@colonizers/module-cities-knights';
import { greedWealthPowerModule } from '@colonizers/module-greed-wealth-power';
import { worldWondersModule } from '@colonizers/module-world-wonders';
import { civilisationsModule } from '@colonizers/module-civilisations';
import { churchModule } from '@colonizers/module-church';
import { witchesModule } from '@colonizers/module-witches';
import { princesModule } from '@colonizers/module-princes-explorers';
import { soldiersModule } from '@colonizers/module-soldiers-armies';
import { generateBoard, generateSeaBoard } from '@colonizers/maps';
import { chooseAction, newMemory, type BotConfig, type BotMemory } from '../src/index.ts';

export const lib = new ModuleLibrary([
  baseModule,
  seafarersModule,
  worldWondersModule,
  citiesKnightsModule,
  churchModule,
  witchesModule,
  greedWealthPowerModule,
  civilisationsModule,
  princesModule,
  soldiersModule,
]);

export function rng(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

export function game(
  seed: string,
  players: number,
  kind: 'base' | 'sea' | 'ck' | 'sea-ck' | 'gwp',
  settings: Record<string, unknown> = {},
  extra: string[] = [],
): GameState {
  const names = Array.from({ length: players }, (_, i) => `P${i}`);
  const ck = kind === 'ck' || kind === 'sea-ck' || kind === 'gwp';
  const gwp = kind === 'gwp';
  if (kind === 'sea' || kind === 'sea-ck') {
    const b = generateSeaBoard({ seed, players, scenario: 'new-shores' });
    return lib.createGame({
      seed,
      players: names,
      modules: ['base', 'seafarers', ...(ck ? ['cities-knights'] : []), ...extra],
      map: b.map,
      settings: {
        ...b.settings,
        vpTarget:
          Number(b.settings.vpTarget) +
          (ck ? 3 : 0) +
          (extra.includes('princes') ? 4 : 0) +
          (extra.includes('soldiers') ? 3 : 0),
        ...settings,
      },
      fixedSeats: true,
    }).state;
  }
  const b = generateBoard({ seed, players, mode: 'classic' });
  return lib.createGame({
    seed,
    players: names,
    modules: [
      'base',
      ...(ck ? ['cities-knights'] : []),
      ...(gwp ? ['greed-wealth-power'] : []),
      ...extra,
    ],
    map: b.map,
    settings: { vpTarget: gwp ? 18 : ck ? 13 : 10, ...settings },
    fixedSeats: true,
  }).state;
}

/** Plays bots against each other; returns the winner and how many moves it took. */
export function play(
  state: GameState,
  bots: BotConfig[],
  seed: number,
  maxActions = 6000,
): { winner: number | null; actions: number; state: GameState } {
  let s = state;
  const rand = rng(seed);
  const memory: BotMemory[] = bots.map(() => newMemory());
  let clock = 0;
  let i = 0;
  for (; i < maxActions && s.winner === null; i++) {
    clock += 1000;
    const waiting = lib.waitingOn(s);
    if (!waiting.length) throw new Error(`Nobody can act in ${s.phase.id}`);
    let acted = false;
    for (const seat of [...waiting].sort(() => rand() - 0.5)) {
      const a: Action | null = chooseAction(lib, s, seat, bots[seat]!, memory[seat]!, {
        rand,
        now: clock,
        budgetMs: 400,
      });
      if (!a) continue;
      s = lib.apply(s, a).state;
      acted = true;
      break;
    }
    if (!acted) clock += 20_000;
  }
  return { winner: s.winner, actions: i, state: s };
}
