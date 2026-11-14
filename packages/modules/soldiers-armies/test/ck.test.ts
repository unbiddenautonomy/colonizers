import { describe, expect, it } from 'vitest';
import {
  Ctx,
  ModuleLibrary,
  type Action,
  type CornerId,
  type GameState,
  type HexId,
  type Piece,
} from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { citiesKnightsModule, ckData } from '@colonizers/module-cities-knights';
import { generateBoard } from '@colonizers/maps';
import { ARMY, freeSteps, loseMetropolis, soldiersModule } from '../src/index.ts';

const lib = new ModuleLibrary([baseModule, citiesKnightsModule, soldiersModule]);

function game(seed = 'soldiers-ck'): GameState {
  const board = generateBoard({ seed, players: 4, mode: 'classic' });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C', 'D'],
    modules: ['base', 'cities-knights', 'soldiers'],
    map: board.map,
    settings: { vpTarget: 16 },
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

function mainPhase(s = game()): GameState {
  return edit(s, (ctx) => {
    ctx.state.turn = { number: 1, player: 0, round: 0 };
    ctx.setPhase({ id: 'main' });
  });
}

/** Corners at least three apart, so buildings and armies don't touch. */
function spread(ctx: Ctx, n: number): CornerId[] {
  const out: CornerId[] = [];
  for (const c of ctx.geometry.corners) {
    if (!ctx.isLandCorner(c)) continue;
    const near = new Set<CornerId>([c]);
    for (const x of ctx.geometry.cornerNeighbours.get(c) ?? []) {
      near.add(x);
      for (const y of ctx.geometry.cornerNeighbours.get(x) ?? []) near.add(y);
    }
    if (out.some((o) => near.has(o))) continue;
    out.push(c);
    if (out.length === n) break;
  }
  return out;
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

describe('Soldiers & Armies with Cities & Knights', () => {
  it('has units instead of knights, and its own walls', () => {
    let corner = '' as CornerId;
    let s = edit(mainPhase(), (ctx) => {
      [corner] = spread(ctx, 1) as [CornerId];
      ctx.place('city', 0, { kind: 'corner', id: corner });
      ctx.grant(0, { wool: 2, ore: 2, brick: 5 });
    });
    expect(() => act(s, { type: 'buildKnight', player: 0, corner })).toThrow(/instead of knights/);
    expect(() => act(s, { type: 'buildWall', player: 0, corner })).toThrow(/three a city/);
    s = act(s, { type: 'buildCityWall', player: 0, corner });
    expect(ctxOf(s).buildingAt(corner)?.props.walls).toBe(1);
  });

  it('counts units against the barbarians: infantry 1, cavalry 2, artillery 3', () => {
    const s = edit(mainPhase(), (ctx) => {
      const [a] = spread(ctx, 1) as [CornerId];
      ctx.place(ARMY, 0, { kind: 'corner', id: a }, { infantry: 2, cavalry: 1, artillery: 1 });
    });
    expect(ctxOf(s).reduce('defense', 0, 0)).toBe(7);
    expect(ctxOf(s).reduce('defense', 1, 0)).toBe(0);
  });

  it('lets the barbarians besiege a city of each weakest player, once', () => {
    let corners: CornerId[] = [];
    const s = edit(mainPhase(), (ctx) => {
      corners = spread(ctx, 3);
      ctx.place('city', 0, { kind: 'corner', id: corners[0] as CornerId });
      ctx.place('city', 1, { kind: 'corner', id: corners[1] as CornerId });
      ctx.place(ARMY, 1, { kind: 'corner', id: corners[2] as CornerId }, { infantry: 1 });
    });
    const next = structuredClone(s);
    const ctx = ctxOf(next);
    expect(ctx.reduce('barbarianLosses', false, [0, 1])).toEqual([]);
    const sieges = ctx.events.filter((e) => e.type === 'barbarianSiege');
    expect(sieges.map((e) => e.player)).toEqual([0]);
    const fell = sieges[0]?.fell === true;
    expect(ctx.buildingAt(corners[0] as CornerId)?.type).toBe(fell ? 'settlement' : 'city');
    expect(ctx.buildingAt(corners[1] as CornerId)?.type).toBe('city');
  });

  it('passes a beaten metropolis on, and drops its owner back to level 3', () => {
    let corners: CornerId[] = [];
    let s = edit(mainPhase(), (ctx) => {
      corners = spread(ctx, 2);
      const m = ctx.place('city', 0, { kind: 'corner', id: corners[0] as CornerId });
      ctx.place('city', 1, { kind: 'corner', id: corners[1] as CornerId });
      m.props.metropolis = 'politics';
      const d = ckData(ctx);
      d.metropolis.politics = { seat: 0, corner: corners[0] as CornerId };
      d.levels[0] = { ...d.levels[0], science: 0, trade: 0, politics: 5 } as never;
      d.levels[1] = { ...d.levels[1], science: 0, trade: 0, politics: 4 } as never;
      ctx.place(ARMY, 0, { kind: 'corner', id: corners[0] as CornerId }, { infantry: 1 });
    });
    // The Politics metropolis marches five corners free.
    expect(freeSteps(ctxOf(s), Object.values(s.pieces).find((p) => p.type === ARMY) as Piece)).toBe(
      5,
    );
    s = edit(s, (ctx) => loseMetropolis(ctx, ctx.buildingAt(corners[0] as CornerId) as Piece));
    const ctx = ctxOf(s);
    expect(ckData(ctx).metropolis.politics?.seat).toBe(1);
    expect(ctx.buildingAt(corners[1] as CornerId)?.props.metropolis).toBe('politics');
    expect(ctx.buildingAt(corners[0] as CornerId)?.props.metropolis).toBeUndefined();
    expect(ckData(ctx).levels[0]?.politics).toBe(3);
  });

  it('fights a rival merchant like the robber', () => {
    let hex = '' as HexId;
    let s = edit(mainPhase(), (ctx) => {
      const [c] = spread(ctx, 1) as [CornerId];
      hex = (ctx.geometry.cornerHexes.get(c) ?? []).find((h) => ctx.isLand(h)) as HexId;
      ctx.place('merchant', 1, { kind: 'hex', id: hex });
      ctx.place(ARMY, 0, { kind: 'corner', id: c }, { artillery: 1 });
      ctx.grant(0, { brick: 1, ore: 2 });
      ctx.setPhase({ id: 'campaign' });
    });
    const army = Object.values(s.pieces).find((p) => p.type === ARMY) as Piece;
    s = act(s, { type: 'attackMerchant', player: 0, army: army.id });
    expect(['relocateMerchant', 'merchantToll']).toContain(s.phase.id);
    if (s.phase.id === 'merchantToll') {
      const pay = lib.legalActions(s, 0).find((a) => a.type === 'payMerchantToll') as Action;
      s = act(s, pay);
      const got = Object.values(s.players[1]?.hand ?? {}).reduce((a, b) => a + b, 0);
      expect(got).toBe(2);
    } else {
      const to = lib.legalActions(s, 0).find((a) => a.type === 'relocateMerchant') as Action;
      s = act(s, to);
      expect(Object.values(s.pieces).find((p) => p.type === 'merchant')?.at).toEqual({
        kind: 'hex',
        id: to.hex,
      });
    }
    expect(s.phase.id).toBe('campaign');
    expect(() => act(s, { type: 'attackMerchant', player: 0, army: army.id })).toThrow(/this turn/);
  });

  it('plays out random games to a winner', () => {
    for (const seed of [1, 2]) {
      const rand = rng(seed);
      let s = game(`ck-random-${seed}`);
      for (let i = 0; i < 12000 && s.winner === null; i++) {
        const seat = lib.waitingOn(s)[0];
        expect(seat, `${s.phase.id} at step ${i}`).toBeDefined();
        const options = lib.legalActions(s, seat as number).filter((a) => a.type !== 'capitulate');
        const pick =
          options.find((a) => a.type === 'buildSettlement' || a.type === 'buildCity') ??
          options.find((a) => a.type === 'improveCity') ??
          options.find((a) => a.type === 'attack' || a.type === 'battleRoll') ??
          (rand() < 0.3 ? options.find((a) => a.type === 'buyUnit') : undefined) ??
          options[Math.floor(rand() * options.length)];
        s = act(s, pick as Action);
      }
      const c = ctxOf(s);
      expect(
        s.winner,
        `seed ${seed}: ${s.turn.number} turns, vp ${s.players.map((p) => c.vp(p.seat))}`,
      ).not.toBeNull();
    }
  }, 90_000);
});
