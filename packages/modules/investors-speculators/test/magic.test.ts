import { describe, expect, it } from 'vitest';
import { Ctx, ModuleLibrary, type Action, type GameState } from '@colonizers/engine';
import { baseModule, bankRatio } from '@colonizers/module-base';
import { citiesKnightsModule, levels } from '@colonizers/module-cities-knights';
import { churchModule } from '@colonizers/module-church';
import { witchesModule } from '@colonizers/module-witches';
import { generateBoard } from '@colonizers/maps';
import { investorsData, investorsModule, isTradable, rateOf, sevenCounts } from '../src/index.ts';

const lib = new ModuleLibrary([
  baseModule,
  citiesKnightsModule,
  investorsModule,
  witchesModule,
  churchModule,
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

function game(seed = 'inv-magic'): GameState {
  const board = generateBoard({ seed, players: 4, mode: 'classic' });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C', 'D'],
    modules: ['base', 'cities-knights', 'investors', 'witches', 'church'],
    map: board.map,
    settings: { vpTarget: 15 },
    fixedSeats: true,
  }).state;
}

function setup(s: GameState): GameState {
  for (let i = 0; i < 300 && s.phase.id === 'setup'; i++) {
    const seat = lib.waitingOn(s)[0] as number;
    s = act(s, lib.legalActions(s, seat)[0] as Action);
  }
  return s;
}

const mainTurn = (s: GameState, fn: (ctx: Ctx) => void = () => {}) =>
  edit(s, (ctx) => {
    ctx.state.turn = { number: 5, player: 0, round: 2 };
    ctx.setPhase({ id: 'main' });
    for (const p of ctx.state.players)
      for (const [c, n] of Object.entries({ ...p.hand })) if (n) ctx.pay(p.seat, { [c]: n });
    fn(ctx);
  });

describe('Investors & Speculators with Witches and Church', () => {
  it('prices Crystal 2 above brick and Bread 1 above grain, and counts them on a 7', () => {
    const s = mainTurn(setup(game()), (ctx) => {
      const r = investorsData(ctx).rates;
      r.brick = 4;
      r.grain = 5;
      investorsData(ctx).seven = { discarded: { '1': { crystal: 2, bread: 1 } } };
    });
    const c = ctxOf(s);
    expect(isTradable(c, 'crystal')).toBe(true);
    expect(isTradable(c, 'bread')).toBe(true);
    expect(rateOf(c, 'crystal')).toBe(6);
    expect(rateOf(c, 'bread')).toBe(6);
    expect(sevenCounts(c)).toMatchObject({ brick: 2, grain: 1 });
  });

  it('sells Crystal without a Citadel, and takes Beer at the rate of the card it buys', () => {
    let s = mainTurn(setup(game()), (ctx) => {
      investorsData(ctx).rates.brick = 3;
      investorsData(ctx).rates.ore = 2;
      ctx.grant(0, { wool: 5, beer: 2 });
    });
    const c = ctxOf(s);
    expect(bankRatio(c, 0, 'wool', 'crystal')).toBeLessThanOrEqual(5);
    s = act(s, { type: 'bankTrade', player: 0, give: 'wool', get: 'crystal' });
    expect(s.players[0]?.hand.crystal).toBe(1);
    expect(bankRatio(ctxOf(s), 0, 'beer', 'ore')).toBeLessThanOrEqual(2);
    expect(() => act(s, { type: 'bankTrade', player: 0, give: 'grain', get: 'beer' })).toThrow();
  });

  it('takes 3 off the rate with the Magic Kitchen, never better than 1:1', () => {
    const s = mainTurn(setup(game()), (ctx) => {
      investorsData(ctx).rates.ore = 6;
      investorsData(ctx).rates.wool = 2;
      levels(ctx, 0).magic = 3;
    });
    const c = ctxOf(s);
    const off = 4 - c.reduce('tradeRatio', 0, 'brick', 4);
    expect(bankRatio(c, 0, 'brick', 'ore')).toBe(Math.max(1, 6 - off - 3));
    expect(bankRatio(c, 0, 'brick', 'wool')).toBe(1);
  });

  it('plays out a random game without getting stuck', () => {
    let x = 41;
    const rand = () => {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      return (x >>> 0) / 4294967296;
    };
    const FINANCE = ['borrowCard', 'saveCard', 'buildOnLoan', 'buyDerivative'];
    let s = game('inv-magic-random');
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
  }, 60_000);
});
