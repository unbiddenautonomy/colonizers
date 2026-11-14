import { describe, expect, it } from 'vitest';
import { Ctx, ModuleLibrary, type Action, type GameState } from '@colonizers/engine';
import { baseModule, bankRatio } from '@colonizers/module-base';
import { citiesKnightsModule, levels } from '@colonizers/module-cities-knights';
import { greedWealthPowerModule } from '@colonizers/module-greed-wealth-power';
import { worldWondersModule } from '@colonizers/module-world-wonders';
import { civilisationsModule } from '@colonizers/module-civilisations';
import { generateBoard } from '@colonizers/maps';
import { investorsData, investorsModule } from '../src/index.ts';

const lib = new ModuleLibrary([
  baseModule,
  citiesKnightsModule,
  investorsModule,
  greedWealthPowerModule,
  worldWondersModule,
  civilisationsModule,
]);

const ctxOf = (s: GameState) => new Ctx(s, lib.registry(s.modules));
const act = (s: GameState, a: Action) => lib.apply(s, a).state;

function edit(state: GameState, fn: (ctx: Ctx) => void): GameState {
  const next = structuredClone(state);
  const ctx = ctxOf(next);
  fn(ctx);
  ctx.commit();
  return next;
}

function game(modules: string[], seed: string, vpTarget: number): GameState {
  const board = generateBoard({ seed, players: 4, mode: 'classic' });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C', 'D'],
    modules: ['base', ...modules],
    map: board.map,
    settings: { vpTarget },
    fixedSeats: true,
  }).state;
}

function setup(s: GameState): GameState {
  for (let i = 0; i < 300 && s.phase.id !== 'roll' && s.phase.id !== 'main'; i++) {
    const seat = lib.waitingOn(s)[0] as number;
    s = act(s, lib.legalActions(s, seat)[0] as Action);
  }
  return s;
}

describe('Investors & Speculators with Greed, Wealth & Power', () => {
  it('takes 3 off for the Magic Kitchen and 2 off for the Marketplace', () => {
    const s = edit(
      setup(game(['cities-knights', 'investors', 'greed-wealth-power'], 'inv-gwp', 18)),
      (ctx) => {
        ctx.state.turn = { number: 5, player: 0, round: 2 };
        ctx.setPhase({ id: 'main' });
        investorsData(ctx).rates.ore = 6;
        investorsData(ctx).rates.wool = 5;
        levels(ctx, 0).magic = 3;
        levels(ctx, 0).wealth = 3;
      },
    );
    const c = ctxOf(s);
    const off = (give: string) => 4 - c.reduce('tradeRatio', 0, give, 4);
    expect(bankRatio(c, 0, 'brick', 'ore')).toBe(Math.max(1, 6 - off('brick') - 3));
    expect(bankRatio(c, 0, 'grain', 'wool')).toBe(Math.max(1, 5 - off('grain') - 2));
  });
});

describe('Investors & Speculators with the big fan expansions, in random games', () => {
  const FINANCE = ['borrowCard', 'saveCard', 'buildOnLoan', 'buyDerivative'];
  const games: [string, () => GameState][] = [
    ['World Wonders', () => game(['investors', 'world-wonders'], 'inv-ww', 10)],
    [
      'World Wonders and Cities & Knights',
      () => game(['cities-knights', 'investors', 'world-wonders'], 'inv-ww-ck', 13),
    ],
    [
      'Greed, Wealth & Power',
      () => game(['cities-knights', 'investors', 'greed-wealth-power'], 'inv-gwp-r', 18),
    ],
    [
      'Civilisations',
      () =>
        game(['cities-knights', 'investors', 'greed-wealth-power', 'civilisations'], 'inv-civ', 20),
    ],
  ];
  for (const [name, make] of games)
    it(`plays ${name} without getting stuck`, () => {
      let x = 53;
      const rand = () => {
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        return (x >>> 0) / 4294967296;
      };
      let s = make();
      for (let i = 0; i < 5000 && s.winner === null; i++) {
        const seat = lib.waitingOn(s)[0];
        expect(seat, `${s.phase.id} at step ${i}`).toBeDefined();
        const options = lib.legalActions(s, seat as number);
        expect(options.length, `${s.phase.id} at step ${i}`).toBeGreaterThan(0);
        const rest = options.filter((a) => !FINANCE.includes(a.type));
        const pick =
          options.find((a) => ['buildSettlement', 'buildCity', 'repayLoan'].includes(a.type)) ??
          (rand() < 0.1 ? options.find((a) => FINANCE.includes(a.type)) : undefined) ??
          rest[Math.floor(rand() * rest.length)] ??
          options[0];
        s = act(s, pick as Action);
      }
      expect(s.turn.number).toBeGreaterThan(15);
    }, 90_000);
});
