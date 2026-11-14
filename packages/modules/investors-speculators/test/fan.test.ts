import { describe, expect, it } from 'vitest';
import { Ctx, ModuleLibrary, type Action, type CornerId, type GameState } from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { coastal, explorersPiratesModule, goldPrice } from '@colonizers/module-explorers-pirates';
import { princesModule } from '@colonizers/module-princes-explorers';
import { soldiersModule } from '@colonizers/module-soldiers-armies';
import { generateBoard, generateEpBoard } from '@colonizers/maps';
import { investorsData, investorsModule, loansOf } from '../src/index.ts';

const lib = new ModuleLibrary([
  baseModule,
  explorersPiratesModule,
  princesModule,
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

function rng(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function setup(s: GameState): GameState {
  for (let i = 0; i < 300 && s.phase.id === 'setup'; i++) {
    const seat = lib.waitingOn(s)[0] as number;
    s = act(s, lib.legalActions(s, seat)[0] as Action);
  }
  return s;
}

function epGame(seed = 'inv-ep'): GameState {
  const b = generateEpBoard({ seed, players: 3, scenario: 'pirate-lairs' });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C'],
    modules: [...b.modules, 'investors'],
    map: b.map,
    settings: { vpTarget: 10, ...b.settings },
    fixedSeats: true,
  }).state;
}

function baseGame(extra: string[], seed: string, vpTarget: number): GameState {
  const board = generateBoard({ seed, players: 4, mode: 'classic' });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C', 'D'],
    modules: ['base', ...extra, 'investors'],
    map: board.map,
    settings: { vpTarget },
    fixedSeats: true,
  }).state;
}

const mainTurn = (s: GameState, fn: (ctx: Ctx) => void = () => {}) =>
  edit(s, (ctx) => {
    ctx.state.turn = { number: 5, player: 0, round: 2 };
    ctx.setPhase({ id: 'main' });
    for (const p of ctx.state.players)
      for (const [c, n] of Object.entries({ ...p.hand })) if (n) ctx.pay(p.seat, { [c]: n });
    fn(ctx);
  });

describe('Investors & Speculators with Explorers & Pirates', () => {
  it('prices gold by the market: 3 for a dear resource, 1 for a cheap one', () => {
    const s = mainTurn(setup(epGame()), (ctx) => {
      const r = investorsData(ctx).rates;
      r.ore = 6;
      r.lumber = 4;
      r.grain = 2;
    });
    const c = ctxOf(s);
    expect(goldPrice(c, 0, 'ore')).toBe(3);
    expect(goldPrice(c, 0, 'lumber')).toBe(2);
    expect(goldPrice(c, 0, 'grain')).toBe(1);
    const gold = edit(s, (ctx) => ctx.grant(0, { gold: 1 }));
    const after = act(gold, { type: 'buyWithGold', player: 0, resource: 'grain' } as Action);
    expect(after.players[0]?.hand).toMatchObject({ gold: 0, grain: 1 });
  });

  it('takes a settler on a town loan, at its cost', () => {
    let s = mainTurn(setup(epGame()));
    const harbor = ctxOf(s).piecesOf(0, 'harbor')[0];
    expect(harbor).toBeDefined();
    const offered = lib
      .legalActions(s, 0)
      .filter((a) => a.type === 'buildOnLoan')
      .map((a) => (a as Action & { item: string }).item);
    expect(offered).toContain('settler');
    s = act(s, {
      type: 'buildOnLoan',
      player: 0,
      item: 'settler',
      at: harbor?.id,
      term: 5,
    } as Action);
    const loan = loansOf(ctxOf(s), 0)[0];
    expect(loan).toMatchObject({ card: 'settler', term: 5 });
    expect(loan?.held ?? 0).toBe(0);
    expect(Object.values(loan?.cost ?? {}).reduce((a, b) => a + (b ?? 0), 0)).toBeGreaterThan(0);
    expect(s.pieces[harbor?.id as string]?.props.cargo).toContain('settler');
  });

  it('takes a harbor settlement on a town loan, holding its extra point', () => {
    let corner = '' as CornerId;
    let s = mainTurn(setup(epGame()), (ctx) => {
      // A free coastal corner, with a settlement of player 0's on it.
      const near = (c: CornerId) => ctx.geometry.cornerNeighbours.get(c) ?? [];
      corner = ctx.geometry.corners.find(
        (c) => coastal(ctx, c) && !ctx.buildingAt(c) && !near(c).some((n) => ctx.buildingAt(n)),
      ) as CornerId;
      ctx.place('settlement', 0, { kind: 'corner', id: corner });
    });
    expect(corner).not.toBe('');
    const vp = ctxOf(s).vp(0);
    s = act(s, { type: 'buildOnLoan', player: 0, item: 'harbor', corner, term: 7 } as Action);
    expect(ctxOf(s).buildingAt(corner)?.type).toBe('harbor');
    const loan = loansOf(ctxOf(s), 0)[0];
    expect(loan).toMatchObject({ card: 'harbor', term: 7 });
    // A harbor settlement is worth a point more than the settlement it replaces: that point counts.
    expect(loan?.held ?? 0).toBe(0);
    expect(ctxOf(s).vp(0)).toBe(vp + 1);
  });
});

describe('Investors & Speculators with Soldiers & Armies', () => {
  it('musters cavalry on a town loan', () => {
    let s = mainTurn(setup(baseGame(['soldiers'], 'inv-soldiers', 13)));
    const corner = (ctxOf(s).piecesOf(0, 'settlement')[0]?.at as { id: CornerId }).id;
    const offered = lib
      .legalActions(s, 0)
      .filter((a) => a.type === 'buildOnLoan')
      .map((a) => (a as Action & { item: string }).item);
    expect(offered).toEqual(expect.arrayContaining(['cavalry', 'artillery']));
    s = act(s, { type: 'buildOnLoan', player: 0, item: 'cavalry', corner, term: 3 } as Action);
    const army = Object.values(s.pieces).find((p) => p.type === 'army' && p.owner === 0);
    expect(army?.props).toMatchObject({ cavalry: 1 });
    expect(loansOf(ctxOf(s), 0)[0]).toMatchObject({ card: 'cavalry', term: 3 });
    expect(loansOf(ctxOf(s), 0)[0]?.held ?? 0).toBe(0);
  });
});

describe('Investors & Speculators with Princes & Explorers', () => {
  it('moves the robber on a 7 without stealing, then shows cards', () => {
    let s = mainTurn(setup(baseGame(['princes'], 'inv-princes', 14)), (ctx) => {
      ctx.grant(0, { ore: 1 });
      ctx.grant(1, { wool: 2 });
      ctx.grant(2, { grain: 2 });
      ctx.grant(3, { brick: 2 });
      investorsData(ctx).seven = { discarded: {} };
      ctx.setPhase({ id: 'moveRobber', returnTo: 'main' });
    });
    const move = lib.legalActions(s, 0).find((a) => a.type === 'moveRobber');
    expect(move).toBeDefined();
    s = act(s, move as Action);
    expect(s.players.map((p) => Object.values(p.hand).reduce((a, b) => a + (b ?? 0), 0))).toEqual([
      1, 2, 2, 2,
    ]);
    expect(s.phase.id).toBe('sevenShow');
  });
});

describe('Investors & Speculators with the fan expansions, in random games', () => {
  const FINANCE = ['borrowCard', 'saveCard', 'buildOnLoan', 'buyDerivative'];
  const games: [string, () => GameState][] = [
    ['Explorers & Pirates', () => epGame('inv-ep-random')],
    ['Princes & Explorers', () => baseGame(['princes'], 'inv-princes-random', 14)],
    ['Soldiers & Armies', () => baseGame(['soldiers'], 'inv-soldiers-random', 13)],
    ['Princes and Soldiers', () => baseGame(['princes', 'soldiers'], 'inv-ps-random', 17)],
  ];
  for (const [name, make] of games)
    it(`plays out a game with ${name} without getting stuck`, () => {
      const rand = rng(23);
      let s = make();
      for (let i = 0; i < 6000 && s.winner === null; i++) {
        const seat = lib.waitingOn(s)[0];
        expect(seat, `${s.phase.id} at step ${i}`).toBeDefined();
        const options = lib.legalActions(s, seat as number);
        expect(options.length, `${s.phase.id} at step ${i}`).toBeGreaterThan(0);
        // Giving up the game to a rival is left out.
        const rest = options.filter((a) => !FINANCE.includes(a.type) && a.type !== 'capitulate');
        const pick =
          options.find((a) =>
            ['buildSettlement', 'buildCity', 'buildHarbor', 'repayLoan'].includes(a.type),
          ) ??
          (rand() < 0.1 ? options.find((a) => FINANCE.includes(a.type)) : undefined) ??
          rest[Math.floor(rand() * rest.length)] ??
          options[0];
        s = act(s, pick as Action);
      }
      expect(
        s.turn.number,
        `winner ${s.winner} vp ${s.players.map((p) => ctxOf(s).vp(p.seat))} ${s.phase.id}`,
      ).toBeGreaterThan(20);
    }, 60_000);
});
