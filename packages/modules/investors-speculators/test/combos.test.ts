import { describe, expect, it } from 'vitest';
import { Ctx, ModuleLibrary, type Action, type GameState, type HexId } from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { ckData, citiesKnightsModule, levels } from '@colonizers/module-cities-knights';
import { seafarersModule } from '@colonizers/module-seafarers';
import { generateBoard, generateSeaBoard } from '@colonizers/maps';
import { investorsData, investorsModule, marketRatio, sevenCounts } from '../src/index.ts';

const lib = new ModuleLibrary([baseModule, seafarersModule, investorsModule, citiesKnightsModule]);

const ctxOf = (s: GameState) => new Ctx(s, lib.registry(s.modules));
const act = (s: GameState, a: Action) => lib.apply(s, a).state;

function edit(state: GameState, fn: (ctx: Ctx) => void): GameState {
  const next = structuredClone(state);
  const ctx = ctxOf(next);
  fn(ctx);
  ctx.commit();
  return next;
}

function emptyHands(ctx: Ctx): void {
  for (const p of ctx.state.players)
    for (const [c, n] of Object.entries({ ...p.hand })) if (n) ctx.pay(p.seat, { [c]: n });
}

function ckGame(): GameState {
  const board = generateBoard({ seed: 'inv-ck', players: 4, mode: 'classic' });
  return lib.createGame({
    seed: 'inv-ck',
    players: ['A', 'B', 'C', 'D'],
    modules: ['base', 'investors', 'cities-knights'],
    map: board.map,
    settings: { vpTarget: 13 },
    fixedSeats: true,
  }).state;
}

function seaGame(): GameState {
  const b = generateSeaBoard({ seed: 'inv-sea', players: 4, scenario: 'new-shores' });
  return lib.createGame({
    seed: 'inv-sea',
    players: ['A', 'B', 'C', 'D'],
    modules: ['base', 'seafarers', 'investors'],
    map: b.map,
    settings: { ...b.settings },
    fixedSeats: true,
  }).state;
}

describe('Investors & Speculators with Cities & Knights', () => {
  it('trades commodities at their resource’s rate, and the trading house takes 2 off', () => {
    const s = edit(ckGame(), (ctx) => {
      ctx.state.turn = { number: 5, player: 0, round: 1 };
      ctx.setPhase({ id: 'main' });
      investorsData(ctx).rates.ore = 3;
      investorsData(ctx).rates.wool = 6;
    });
    const c = ctxOf(s);
    const off = (give: string) => 4 - c.reduce('tradeRatio', 0, give, 4);
    expect(marketRatio(c, 0, 'grain', 'coin')).toBe(Math.max(1, 3 - off('grain')));
    expect(marketRatio(c, 0, 'grain', 'cloth')).toBe(Math.max(1, 6 - off('grain')));
    const trading = edit(s, (ctx) => {
      levels(ctx, 0).trade = 3;
    });
    // With the trading house, commodities given count as a 2:1 harbor.
    expect(marketRatio(ctxOf(trading), 0, 'paper', 'cloth')).toBe(4);
    expect(marketRatio(ctxOf(trading), 0, 'paper', 'ore')).toBe(1);
  });

  it('sets the rates on a 7 even before the robber is in play, counting commodities', () => {
    let s = edit(ckGame(), (ctx) => {
      ctx.state.turn = { number: 5, player: 0, round: 1 };
      ctx.setPhase({ id: 'roll' });
      emptyHands(ctx);
      ctx.grant(0, { lumber: 1, paper: 2 });
      ctx.grant(1, { coin: 3 });
      ckData(ctx).alchemist = { red: 3, yellow: 4 };
      ckData(ctx).forcedEvent = 'science';
    });
    s = act(s, { type: 'roll', player: 0 });
    expect(s.phase.id).toBe('sevenShow');
    s = act(s, { type: 'sevenShow', player: 0, cards: { lumber: 1, paper: 2 } } as Action);
    const seen = sevenCounts(ctxOf(s));
    expect(seen.lumber).toBe(3);
    expect(seen.ore).toBe(3);
    expect(s.phase.id).toBe('sevenRates');
  });
});

describe('Investors & Speculators with Seafarers', () => {
  it('moves the pirate on a 7 without stealing, then sets the rates', () => {
    let s = edit(seaGame(), (ctx) => {
      ctx.state.turn = { number: 5, player: 0, round: 1 };
      emptyHands(ctx);
      ctx.grant(0, { ore: 1 });
      ctx.grant(1, { wool: 2 });
      investorsData(ctx).seven = { discarded: {} };
      ctx.setPhase({ id: 'moveRobber', returnTo: 'main' });
    });
    const sea = lib.legalActions(s, 0).find((a) => a.type === 'movePirate') as Action & {
      hex: HexId;
    };
    s = act(s, sea);
    expect(s.players[1]?.hand.wool).toBe(2);
    expect(s.phase.id).toBe('sevenShow');
  });
});

describe('Investors & Speculators in random games', () => {
  function rng(seed: number): () => number {
    let x = seed >>> 0 || 1;
    return () => {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      return (x >>> 0) / 4294967296;
    };
  }
  const FINANCE = ['borrowCard', 'saveCard', 'buildOnLoan', 'buyDerivative'];

  for (const [name, make] of [
    ['Cities & Knights', ckGame],
    ['Seafarers', seaGame],
  ] as const)
    it(`plays out a game with ${name} to a winner`, () => {
      const rand = rng(11);
      let s = make();
      let sevens = 0;
      for (let i = 0; i < 20000 && s.winner === null; i++) {
        const seat = lib.waitingOn(s)[0];
        expect(seat, `${s.phase.id} at step ${i}`).toBeDefined();
        const options = lib.legalActions(s, seat as number);
        const rest = options.filter((a) => !FINANCE.includes(a.type));
        const pick =
          options.find((a) =>
            ['buildSettlement', 'buildCity', 'buildShip', 'repayLoan'].includes(a.type),
          ) ??
          (rand() < 0.1 ? options.find((a) => FINANCE.includes(a.type)) : undefined) ??
          rest[Math.floor(rand() * rest.length)] ??
          options[0];
        if (pick?.type === 'sevenRates') sevens++;
        s = act(s, pick as Action);
      }
      const c = ctxOf(s);
      expect(
        s.winner,
        `${s.turn.number} turns, vp ${s.players.map((p) => c.vp(p.seat))}`,
      ).not.toBeNull();
      expect(sevens).toBeGreaterThan(0);
    }, 60_000);
});
