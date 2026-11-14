import { describe, expect, it } from 'vitest';
import {
  Ctx,
  ModuleLibrary,
  type Action,
  type CornerId,
  type GameState,
  type HexId,
} from '@colonizers/engine';
import { baseModule, robber } from '@colonizers/module-base';
import { generateBoard } from '@colonizers/maps';
import {
  advanceBank,
  investorsData,
  investorsModule,
  keepChoices,
  loansOf,
  marketRatio,
  upChoices,
} from '../src/index.ts';
import { investorsDice } from '../src/market.ts';

const lib = new ModuleLibrary([baseModule, investorsModule]);

function game(seed = 'investors'): GameState {
  const board = generateBoard({ seed, players: 4, mode: 'classic' });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C', 'D'],
    modules: ['base', 'investors'],
    map: board.map,
    fixedSeats: true,
  }).state;
}

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

/** Player 0's main turn, with empty hands all round. */
function mainTurn(fn: (ctx: Ctx) => void = () => {}): GameState {
  return edit(game(), (ctx) => {
    ctx.state.turn = { number: 5, player: 0, round: 1 };
    for (const p of ctx.state.players) {
      const hand = { ...p.hand };
      for (const [c, n] of Object.entries(hand)) if (n) ctx.pay(p.seat, { [c]: n });
    }
    ctx.setPhase({ id: 'main' });
    fn(ctx);
  });
}

describe('Investors & Speculators', () => {
  it('trades with the bank at the market rate, less a harbor', () => {
    let s = mainTurn((ctx) => {
      investorsData(ctx).rates.ore = 2;
      investorsData(ctx).rates.brick = 6;
      ctx.grant(0, { wool: 6 });
    });
    const c = ctxOf(s);
    const harbors = c.harborsOf(0).map((h) => h.resource);
    const off = harbors.includes('wool') ? 2 : harbors.includes('any') ? 1 : 0;
    expect(marketRatio(c, 0, 'wool', 'grain')).toBe(4 - off);
    expect(marketRatio(c, 0, 'wool', 'ore')).toBe(Math.max(1, 2 - off));
    expect(marketRatio(c, 0, 'wool', 'brick')).toBe(6 - off);
    s = act(s, { type: 'bankTrade', player: 0, give: 'wool', get: 'ore' });
    expect(s.players[0]?.hand.ore).toBe(1);
    expect(s.players[0]?.hand.wool).toBe(6 - Math.max(1, 2 - off));
  });

  it('throws a first-round 7 again', () => {
    const s = edit(game(), (ctx) => {
      ctx.state.turn = { number: 1, player: 0, round: 0 };
    });
    const c = ctxOf(s);
    for (let i = 0; i < 300; i++) expect(investorsDice(c).total).not.toBe(7);
  });

  it('sets the rates on a 7 instead of robbing', () => {
    let s = mainTurn((ctx) => {
      investorsData(ctx).seven = { discarded: { '2': { grain: 2 } } };
      ctx.setPhase({ id: 'moveRobber', returnTo: 'main' });
      ctx.grant(0, { ore: 3, wool: 1 });
      ctx.grant(1, { ore: 3 });
      ctx.grant(2, { grain: 1 });
    });
    const c0 = ctxOf(s);
    const at = robber(c0)?.at as { id: HexId };
    const hex = (Object.keys(s.hexes) as HexId[]).find((h) => c0.isLand(h) && h !== at.id) as HexId;
    s = act(s, { type: 'moveRobber', player: 0, hex });
    expect(s.phase.id).toBe('sevenShow');
    expect(() => act(s, { type: 'sevenShow', player: 0, cards: { ore: 1 } } as Action)).toThrow(
      /Show 3/,
    );
    s = act(s, { type: 'sevenShow', player: 0, cards: { ore: 3 } } as Action);
    expect(s.phase.id).toBe('sevenRates');
    // Ore was seen 6 times (3 shown, 3 drawn), grain 3 (1 drawn, 2 discarded).
    const c = ctxOf(s);
    expect(upChoices(c)).toEqual([['grain', 'ore']]);
    expect(() =>
      act(s, {
        type: 'sevenRates',
        player: 0,
        up: ['ore', 'wool'],
        down: ['lumber', 'brick'],
      } as Action),
    ).toThrow(/cheaper/);
    s = act(s, {
      type: 'sevenRates',
      player: 0,
      up: ['ore', 'grain'],
      down: ['lumber', 'brick'],
    } as Action);
    expect(investorsData(ctxOf(s)).rates).toMatchObject({
      ore: 3,
      grain: 3,
      lumber: 5,
      brick: 5,
      wool: 4,
    });
    expect(s.phase.id).toBe('sevenKeep');
    const keep = keepChoices(ctxOf(s));
    expect(keep).toContainEqual({ from: 1, card: 'ore', source: 'drawn' });
    expect(keep).toContainEqual({ from: 2, card: 'grain', source: 'discarded' });
    s = act(s, { type: 'sevenKeep', player: 0, from: 1, card: 'ore', source: 'drawn' } as Action);
    expect(s.players[0]?.hand.ore).toBe(4);
    expect(s.players[1]?.hand.ore).toBe(2);
    expect(s.phase.id).toBe('main');
    expect(investorsData(ctxOf(s)).seven).toBeNull();
  });

  it('pays savings back by the rate when they come due', () => {
    let s = mainTurn((ctx) => {
      ctx.grant(0, { ore: 2 });
      investorsData(ctx).rates.ore = 3;
    });
    s = act(s, { type: 'saveCard', player: 0, card: 'ore', term: 3 } as Action);
    s = act(s, { type: 'saveCard', player: 0, card: 'ore', term: 5 } as Action);
    expect(s.players[0]?.hand.ore ?? 0).toBe(0);
    s = edit(s, (ctx) => {
      for (let i = 0; i < 3; i++) advanceBank(ctx, 0);
    });
    expect(s.players[0]?.hand.ore).toBe(2);
    s = edit(s, (ctx) => {
      investorsData(ctx).rates.ore = 4;
      for (let i = 0; i < 2; i++) advanceBank(ctx, 0);
    });
    expect(s.players[0]?.hand.ore).toBe(4);
    expect(investorsData(ctxOf(s)).savings).toEqual([]);
  });

  it('lends cards, takes them back with interest, and limits finance actions', () => {
    let s = mainTurn((ctx) => ctx.grant(0, { wool: 1 }));
    s = act(s, { type: 'borrowCard', player: 0, card: 'ore', term: 3 } as Action);
    s = act(s, { type: 'borrowCard', player: 0, card: 'ore', term: 1 } as Action);
    expect(s.players[0]?.hand.ore).toBe(2);
    s = act(s, { type: 'borrowCard', player: 0, card: 'grain', term: 5 } as Action);
    s = act(s, { type: 'borrowCard', player: 0, card: 'brick', term: 5 } as Action);
    s = act(s, { type: 'borrowCard', player: 0, card: 'lumber', term: 5 } as Action);
    expect(() =>
      act(s, { type: 'borrowCard', player: 0, card: 'wool', term: 5 } as Action),
    ).toThrow(/5 finance actions/);
    const one = loansOf(ctxOf(s), 0).find((l) => l.term === 1);
    expect(() => act(s, { type: 'repayLoan', player: 0, loan: one?.id } as Action)).toThrow(
      /one card of any kind/,
    );
    s = act(s, { type: 'repayLoan', player: 0, loan: one?.id, extra: { wool: 1 } } as Action);
    expect(s.players[0]?.hand).toMatchObject({ ore: 1, wool: 0 });
    // A later turn: more ore needs the old ore loan paid first.
    s = edit(s, (ctx) => {
      ctx.state.turn.number = 9;
    });
    expect(() => act(s, { type: 'borrowCard', player: 0, card: 'ore', term: 3 } as Action)).toThrow(
      /Pay back/,
    );
  });

  it('turns an unpaid loan into bad debt and keeps a borrower from winning', () => {
    let s = mainTurn((ctx) => ctx.grant(0, { ore: 1 }));
    s = act(s, { type: 'borrowCard', player: 0, card: 'ore', term: 3 } as Action);
    const vp = ctxOf(s).vp(0);
    expect(ctxOf(s).reduce('canWin', 0, true)).toBe(false);
    s = edit(s, (ctx) => {
      for (let i = 0; i < 3; i++) advanceBank(ctx, 0);
    });
    expect(loansOf(ctxOf(s), 0)[0]?.left).toBe(0);
    s = act(s, { type: 'endTurn', player: 0 });
    const c = ctxOf(s);
    expect(loansOf(c, 0)).toEqual([]);
    expect(c.vp(0)).toBe(vp - 1);
    expect(c.reduce('canWin', 0, true)).toBe(true);
  });

  it('builds a city on a town loan and takes it back at one and a half', () => {
    let s = mainTurn((ctx) => {
      const c = ctx.geometry.corners.find((x) => ctx.isLandCorner(x)) as CornerId;
      ctx.place('settlement', 0, { kind: 'corner', id: c });
      ctx.grant(0, { ore: 5, grain: 4 });
    });
    const corner = (
      Object.values(s.pieces).find((p) => p.type === 'settlement')?.at as {
        id: CornerId;
      }
    ).id;
    s = act(s, { type: 'buildOnLoan', player: 0, item: 'city', corner, term: 3 } as Action);
    expect(ctxOf(s).buildingAt(corner as never)?.type).toBe('city');
    expect(s.players[0]?.hand).toMatchObject({ ore: 5, grain: 4 });
    const loan = loansOf(ctxOf(s), 0)[0];
    expect(loan).toMatchObject({ card: 'city', term: 3, penalty: 3, cost: { ore: 3, grain: 2 } });
    // Cards can still be borrowed this turn, not later while the town loan is open.
    s = act(s, { type: 'borrowCard', player: 0, card: 'wool', term: 3 } as Action);
    const later = edit(s, (ctx) => {
      ctx.state.turn.number = 9;
    });
    expect(() =>
      act(later, { type: 'borrowCard', player: 0, card: 'brick', term: 3 } as Action),
    ).toThrow(/town loans/);
    expect(() => act(s, { type: 'repayLoan', player: 0, loan: loan?.id } as Action)).toThrow(
      /2 cards from the cost/,
    );
    expect(() =>
      act(s, { type: 'repayLoan', player: 0, loan: loan?.id, extra: { wool: 2 } } as Action),
    ).toThrow(/2 cards from the cost/);
    s = act(s, {
      type: 'repayLoan',
      player: 0,
      loan: loan?.id,
      extra: { ore: 1, grain: 1 },
    } as Action);
    expect(s.players[0]?.hand).toMatchObject({ ore: 1, grain: 1 });
    expect(loansOf(ctxOf(s), 0).map((l) => l.card)).toEqual(['wool']);
  });

  it('pays derivatives when a loan is not paid back', () => {
    let s = mainTurn((ctx) => ctx.grant(1, { lumber: 4, brick: 4 }));
    s = act(s, { type: 'borrowCard', player: 0, card: 'ore', term: 5 } as Action);
    s = act(s, { type: 'borrowCard', player: 0, card: 'ore', term: 5 } as Action);
    s = act(s, { type: 'borrowCard', player: 0, card: 'grain', term: 3 } as Action);
    const group = loansOf(ctxOf(s), 0)[0]?.group as string;
    const short = loansOf(ctxOf(s), 0)[2]?.group as string;
    s = edit(s, (ctx) => {
      ctx.state.turn = { number: 6, player: 1, round: 1 };
      for (const c of ['ore', 'grain']) {
        const n = ctx.player(0).hand[c] ?? 0;
        if (n) ctx.pay(0, { [c]: n });
      }
    });
    expect(() =>
      act(s, { type: 'buyDerivative', player: 1, group: short, card: 'lumber' } as Action),
    ).toThrow(/safe from derivatives/);
    // Two loans of ore taken together: up to two derivatives on them.
    s = act(s, { type: 'buyDerivative', player: 1, group, card: 'lumber' } as Action);
    s = act(s, { type: 'buyDerivative', player: 1, group, card: 'brick' } as Action);
    expect(() =>
      act(s, { type: 'buyDerivative', player: 1, group, card: 'lumber' } as Action),
    ).toThrow(/already hold/);
    expect(s.players[1]?.hand).toMatchObject({ lumber: 2, brick: 2 });
    const vp0 = ctxOf(s).vp(0);
    const vp1 = ctxOf(s).vp(1);
    s = edit(s, (ctx) => {
      ctx.state.turn = { number: 30, player: 0, round: 7 };
      for (let i = 0; i < 5; i++) advanceBank(ctx, 0);
    });
    s = act(s, { type: 'endTurn', player: 0 });
    const c = ctxOf(s);
    // Both ore loans (2 each) and the grain loan (1) defaulted; each derivative paid 1.
    expect(c.vp(0)).toBe(vp0 - 5);
    expect(c.vp(1)).toBe(vp1 + 2);
    expect(investorsData(c).derivatives).toEqual([]);
  });

  it('plays out random games to a winner', () => {
    const FINANCE = ['borrowCard', 'saveCard', 'buildOnLoan', 'buyDerivative'];
    const rand = rng(7);
    let s = game('investors-random');
    for (let i = 0; i < 20000 && s.winner === null; i++) {
      const seat = lib.waitingOn(s)[0];
      expect(seat, `${s.phase.id} at step ${i}`).toBeDefined();
      const options = lib.legalActions(s, seat as number);
      const pick =
        options.find((a) => a.type === 'buildSettlement' || a.type === 'buildCity') ??
        options.find((a) => a.type === 'repayLoan') ??
        (rand() < 0.1 ? options.find((a) => FINANCE.includes(a.type)) : undefined) ??
        options.filter((a) => !FINANCE.includes(a.type))[
          Math.floor(rand() * options.filter((a) => !FINANCE.includes(a.type)).length)
        ] ??
        options[0];
      s = act(s, pick as Action);
    }
    const c = ctxOf(s);
    expect(
      s.winner,
      `${s.turn.number} turns, vp ${s.players.map((p) => c.vp(p.seat))}`,
    ).not.toBeNull();
  }, 60_000);
});
