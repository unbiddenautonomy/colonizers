import { describe, expect, it } from 'vitest';
import { Ctx, ModuleLibrary, type Action, type GameState } from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { goldPrice, tbData, tradersBarbariansModule } from '@colonizers/module-traders-barbarians';
import { soldiersModule } from '@colonizers/module-soldiers-armies';
import { variantsModule } from '@colonizers/module-variants';
import { generateBoard, generateTbBoard } from '@colonizers/maps';
import { investorsData, investorsModule, loansOf } from '../src/index.ts';

const lib = new ModuleLibrary([
  baseModule,
  tradersBarbariansModule,
  variantsModule,
  soldiersModule,
  investorsModule,
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

function tbGame(scenario: string, seed = 'inv-tb'): GameState {
  const b = generateTbBoard({ seed, players: 4, scenario });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C', 'D'],
    modules: [...b.modules, 'variants', 'investors'],
    map: b.map,
    settings: { vpTarget: 10, ...b.settings },
    fixedSeats: true,
  }).state;
}

function soldiersGame(seed = 'inv-end'): GameState {
  const board = generateBoard({ seed, players: 4, mode: 'classic' });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C', 'D'],
    modules: ['base', 'soldiers', 'investors'],
    map: board.map,
    settings: { vpTarget: 13 },
    fixedSeats: true,
  }).state;
}

const handSize = (s: GameState, seat: number) =>
  Object.values(s.players[seat]?.hand ?? {}).reduce((a, b) => a + (b ?? 0), 0);

const lastTotal = (s: GameState) =>
  (s.data.base as { lastRoll?: { total: number } }).lastRoll?.total;

/** Throw for player 0 until a 7 comes up. */
function rollSeven(s: GameState): GameState {
  s = edit(s, (ctx) => ctx.setPhase({ id: 'roll' }));
  for (let i = 0; i < 300; i++) {
    const next = act(s, { type: 'roll', player: 0 });
    if (lastTotal(next) === 7) return next;
    s = edit(s, (ctx) => {
      ctx.rng.int(1, 6);
    });
  }
  throw new Error('No 7');
}

describe('Investors & Speculators with Traders & Barbarians', () => {
  it('prices gold by the market on the rivers', () => {
    let s = mainTurn(setup(tbGame('rivers')), (ctx) => {
      const r = investorsData(ctx).rates;
      r.ore = 5;
      r.grain = 2;
      tbData(ctx).gold[0] = 3;
    });
    const c = ctxOf(s);
    expect(goldPrice(c, 0, 'ore')).toBe(3);
    expect(goldPrice(c, 0, 'grain')).toBe(1);
    expect(goldPrice(c, 0, 'wool')).toBe(2);
    s = act(s, { type: 'buyWithGold', player: 0, resource: 'grain' } as Action);
    expect(() => act(s, { type: 'buyWithGold', player: 0, resource: 'ore' } as Action)).toThrow(
      /3 gold/,
    );
    expect(tbData(ctxOf(s)).gold[0]).toBe(2);
  });

  it('moves a barbarian on a 7 for the traders without taking a card, then sets the rates', () => {
    let s = mainTurn(setup(tbGame('traders')), (ctx) => {
      for (const p of ctx.state.players) ctx.grant(p.seat, { wool: 1 });
    });
    s = rollSeven(s);
    // Traders & Barbarians turns the robber's move into a barbarian's.
    expect(s.phase.id, JSON.stringify(s.phase)).toBe('tbBarbarian');
    const move = lib.legalActions(s, 0).find((a) => a.type === 'moveEdgeBarbarian');
    expect(s.phase.steal).toBe(false);
    s = act(s, move as Action);
    expect([0, 1, 2, 3].map((seat) => handSize(s, seat))).toEqual([1, 1, 1, 1]);
    expect(s.phase.id).toBe('sevenShow');
  });

  it('sets the rates on a 7 against the barbarians, where there is no robber', () => {
    let s = mainTurn(setup(tbGame('barbarians')), (ctx) => {
      ctx.grant(0, { wool: 1 });
    });
    s = rollSeven(s);
    // Discards first, if anyone holds too much; then the exchange.
    for (let i = 0; i < 10 && s.phase.id === 'discard'; i++) {
      const seat = lib.waitingOn(s)[0] as number;
      s = act(s, lib.legalActions(s, seat)[0] as Action);
    }
    expect(s.phase.id).toBe('sevenShow');
  });
});

describe('Investors & Speculators with Soldiers & Armies, leaving the game', () => {
  it('pays back what it can before capitulating; the rest is bad debt on half the points', () => {
    let s = mainTurn(setup(soldiersGame()));
    s = act(s, { type: 'borrowCard', player: 0, card: 'ore', term: 3 } as Action);
    s = act(s, { type: 'borrowCard', player: 0, card: 'wool', term: 5 } as Action);
    // Ore back at 2 for a 3-turn loan; the wool loan can't be paid.
    s = edit(s, (ctx) => {
      ctx.grant(0, { ore: 1 });
      ctx.pay(0, { wool: 1 });
    });
    const vp = ctxOf(s).vp(0);
    s = act(s, { type: 'capitulate', player: 0, to: 1 } as Action);
    const d = investorsData(ctxOf(s));
    expect(loansOf(ctxOf(s), 0)).toEqual([]);
    expect(d.debt['0']).toBeGreaterThan(0);
    expect(ctxOf(s).vp(0)).toBe(Math.max(0, Math.ceil((vp - (d.debt['0'] ?? 0)) / 2)));
    expect(s.players[1]?.hand.ore ?? 0).toBe(0);
  });

  it('settles the last one standing, who wins only ahead of those who left', () => {
    let s = mainTurn(setup(soldiersGame('inv-last')));
    s = act(s, { type: 'borrowCard', player: 0, card: 'ore', term: 10 } as Action);
    s = edit(s, (ctx) => {
      ctx.pay(0, { ore: 1 });
      const out = (ctx.state.data.soldiers as { out?: Record<string, { vp: number }> }).out ?? {};
      out['1'] = { vp: 1 };
      out['2'] = { vp: 1 };
      (ctx.state.data.soldiers as { out?: unknown }).out = out;
      ctx.state.turn = { number: 6, player: 3, round: 2 };
    });
    const before = ctxOf(s).vp(0);
    s = act(s, { type: 'capitulate', player: 3, to: 0 } as Action);
    const c = ctxOf(s);
    expect(s.phase.id).toBe('gameOver');
    expect(loansOf(c, 0)).toEqual([]);
    expect(investorsData(c).debt['0']).toBe(3);
    // Player 3 left on half their points; player 0 lost points for the unpaid loan.
    const vps = s.players.map((p) => c.vp(p.seat));
    expect(vps[0]).toBeLessThan(before + 10);
    const best = Math.max(...vps);
    if ((vps[0] ?? 0) > Math.max(vps[1] ?? 0, vps[2] ?? 0, vps[3] ?? 0)) expect(s.winner).toBe(0);
    else expect(vps[s.winner as number]).toBe(best);
  });

  it('drops the loans of a player who is out', () => {
    let s = mainTurn(setup(soldiersGame('inv-drop')));
    s = act(s, { type: 'borrowCard', player: 0, card: 'ore', term: 5 } as Action);
    s = act(s, { type: 'saveCard', player: 0, card: 'ore', term: 3 } as Action);
    s = edit(s, (ctx) => {
      (ctx.state.data.soldiers as { out?: unknown }).out = { '0': { vp: 0 } };
      ctx.state.turn = { number: 6, player: 1, round: 2 };
    });
    s = act(s, { type: 'endTurn', player: 1 });
    const d = investorsData(ctxOf(s));
    expect(d.loans.filter((l) => l.seat === 0)).toEqual([]);
    expect(d.savings.filter((x) => x.seat === 0)).toEqual([]);
    expect(ctxOf(s).vp(0)).toBe(0);
  });
});

describe('Investors & Speculators on the Traders & Barbarians scenarios, in random games', () => {
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
  for (const scenario of ['fishermen', 'rivers', 'caravans', 'barbarians', 'traders'])
    it(`plays ${scenario} without getting stuck`, () => {
      const rand = rng(31);
      let s = tbGame(scenario, `inv-tb-${scenario}`);
      let sevens = 0;
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
        if (pick?.type === 'sevenRates') sevens++;
        s = act(s, pick as Action);
      }
      expect(s.turn.number).toBeGreaterThan(15);
      expect(sevens).toBeGreaterThan(0);
    }, 60_000);
});
