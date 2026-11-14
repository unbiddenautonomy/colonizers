import { describe, expect, it } from 'vitest';
import {
  Ctx,
  ModuleLibrary,
  type Action,
  type CornerId,
  type GameState,
  type HexId,
} from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { princesModule } from '@colonizers/module-princes-explorers';
import { generateBoard } from '@colonizers/maps';
import { ARMY, soldiersData, soldiersModule } from '../src/index.ts';

const lib = new ModuleLibrary([baseModule, princesModule, soldiersModule]);

function game(seed = 'soldiers-princes'): GameState {
  const board = generateBoard({ seed, players: 4, mode: 'classic' });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C', 'D'],
    modules: ['base', 'princes', 'soldiers'],
    map: board.map,
    settings: { vpTarget: 14 },
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

/** Player 0's turn, the robber on a field away from the princes, armies on two corners. */
function setUp(): { s: GameState; armies: string[]; hex: HexId } {
  let hex = '' as HexId;
  const s = edit(game(), (ctx) => {
    ctx.state.turn = { number: 1, player: 0, round: 0 };
    ctx.setPhase({ id: 'main' });
    const princes = new Set(ctx.piecesOfType('prince').map((p) => (p.at as { id: HexId }).id));
    hex = (Object.keys(ctx.state.hexes) as HexId[]).find(
      (h) => ctx.isLand(h) && !princes.has(h),
    ) as HexId;
    ctx.place('robber', null, { kind: 'hex', id: hex });
    const corners = ctx.geometry.corners.filter((c) => ctx.isLandCorner(c));
    ctx.place(ARMY, 0, { kind: 'corner', id: corners[0] as CornerId }, { cavalry: 1 });
    ctx.place(ARMY, 0, { kind: 'corner', id: corners[20] as CornerId }, { infantry: 1 });
    ctx.grant(0, { ore: 1, wool: 1, grain: 1 });
  });
  const armies = Object.values(s.pieces)
    .filter((p) => p.type === ARMY)
    .map((p) => p.id);
  return { s, armies, hex };
}

describe('Soldiers & Armies with Princes & Explorers', () => {
  it('moves the robber by giving up units, not by buying it', () => {
    const { s: start, armies, hex } = setUp();
    const [cav, inf] = armies as [string, string];
    expect(() => act(start, { type: 'buyRobberMove', player: 0 })).toThrow(/army gives way/);
    let s = act(start, { type: 'unitRobberMove', player: 0, army: cav });
    expect(s.pieces[cav]?.props).toMatchObject({ cavalry: 0, infantry: 1 });
    expect(s.phase).toMatchObject({ id: 'moveRobber', range: 3, walk: true });
    s = act(s, { type: 'unitRobberMove', player: 0, army: inf });
    expect(s.pieces[inf]).toBeUndefined();
    expect(s.phase).toMatchObject({ range: 6 });
    const to = lib.legalActions(s, 0).find((a) => a.type === 'moveRobber' && a.hex !== hex);
    expect(to).toBeDefined();
    s = act(s, to as Action);
    const r = Object.values(s.pieces).find((p) => p.type === 'robber');
    expect(r?.at).toMatchObject({ kind: 'hex', id: to?.hex });
  });

  it('has no development cards and leaves the robber alone', () => {
    const { s } = setUp();
    expect(lib.legalActions(s, 0).some((a) => a.type === 'drawFreeDevCard')).toBe(false);
    expect(() => act(s, { type: 'drawFreeDevCard', player: 0 })).toThrow(/without development/);
    const field = edit(s, (ctx) => ctx.setPhase({ id: 'campaign' }));
    expect(lib.legalActions(field, 0).some((a) => a.type === 'attackRobber')).toBe(false);
  });

  it('is won on points only, never as the last one standing', () => {
    const { s: start, armies } = setUp();
    const s = edit(start, (ctx) => {
      soldiersData(ctx).out = { '1': { vp: 0 }, '2': { vp: 0 }, '3': { vp: 0 } };
    });
    const next = act(s, { type: 'unitRobberMove', player: 0, army: armies[0] });
    expect(next.winner).toBeNull();
  });

  it('plays out random games to a winner', () => {
    for (const seed of [1, 2]) {
      const rand = rng(seed);
      let s = game(`princes-random-${seed}`);
      for (let i = 0; i < 12000 && s.winner === null; i++) {
        const seat = lib.waitingOn(s)[0];
        expect(seat, `${s.phase.id} at step ${i}`).toBeDefined();
        const options = lib.legalActions(s, seat as number).filter((a) => a.type !== 'capitulate');
        const pick =
          options.find((a) => a.type === 'buildSettlement' || a.type === 'buildCity') ??
          options.find((a) => a.type === 'attack' || a.type === 'battleRoll') ??
          (rand() < 0.3 ? options.find((a) => a.type === 'buyUnit') : undefined) ??
          options[Math.floor(rand() * options.length)];
        s = act(s, pick as Action);
      }
      const c = ctxOf(s);
      expect(
        s.winner,
        `seed ${seed}: ${s.turn.number} turns, ${s.phase.id}, vp ${s.players.map((p) => c.vp(p.seat))} of ${c.vpTarget()}`,
      ).not.toBeNull();
    }
  }, 60_000);
});
