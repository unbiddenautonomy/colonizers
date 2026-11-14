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
import { citiesKnightsModule, ckData, giveProgress } from '@colonizers/module-cities-knights';
import { generateBoard } from '@colonizers/maps';
import { princesModule, robberTargets } from '../src/index.ts';

const lib = new ModuleLibrary([baseModule, citiesKnightsModule, princesModule]);

function game(seed = 'princes-ck'): GameState {
  const board = generateBoard({ seed, players: 4, mode: 'classic' });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C', 'D'],
    modules: ['base', 'cities-knights', 'princes'],
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

const landHexes = (ctx: Ctx) =>
  (Object.keys(ctx.state.hexes) as HexId[]).filter((h) => ctx.isLand(h));

const inland = (ctx: Ctx) =>
  landHexes(ctx).find((h) =>
    (ctx.geometry.hexNeighbours.get(h) ?? []).every((n) => ctx.isLand(n)),
  ) as HexId;

/** Moves the princes away from a hex and its neighbours. */
function clearPrinces(ctx: Ctx, hex: HexId): void {
  const away = new Set<HexId>([hex, ...(ctx.geometry.hexNeighbours.get(hex) ?? [])]);
  const far = landHexes(ctx).filter((h) => !away.has(h));
  for (const [i, p] of ctx.piecesOfType('prince').entries())
    ctx.move(p, { kind: 'hex', id: far[i] as HexId });
}

/** Main phase of turn 1 with the robber on an inland hex and a knight by it. */
function board(): { s: GameState; hex: HexId; corner: CornerId } {
  let hex = '' as HexId;
  let corner = '' as CornerId;
  const s = edit(game(), (ctx) => {
    ctx.state.turn = { number: 1, player: 0, round: 0 };
    ctx.setPhase({ id: 'main' });
    hex = inland(ctx);
    clearPrinces(ctx, hex);
    ctx.place('robber', null, { kind: 'hex', id: hex });
    ckData(ctx).robberActive = true;
    corner = ctx.geometry.hexCorners.get(hex)![0]!;
  });
  return { s, hex, corner };
}

describe('Princes & Explorers with Cities & Knights', () => {
  it('scores nothing for a metropolis or a merchant at the robber', () => {
    const b = board();
    let s = b.s;
    const { hex, corner } = b;
    s = edit(s, (ctx) => {
      ctx.place('city', 0, { kind: 'corner', id: corner }, { metropolis: 'science' });
      ckData(ctx).metropolis.science = { seat: 0, corner };
      ctx.place('merchant', 0, { kind: 'hex', id: hex });
    });
    expect(ctxOf(s).vp(0)).toBe(0);
  });

  it('can’t buy a robber move or chase it with a knight', () => {
    const b = board();
    let s = b.s;
    const { corner } = b;
    s = edit(s, (ctx) => {
      ctx.grant(0, { ore: 1, wool: 1, grain: 1 });
      ctx.place('knight1', 0, { kind: 'corner', id: corner }, { active: true });
    });
    expect(lib.check(s, { type: 'buyRobberMove', player: 0 })).toMatch(/give up a knight/);
    const k = Object.values(s.pieces).find((p) => p.type === 'knight1')!;
    expect(lib.check(s, { type: 'chaseRobber', player: 0, knight: k.id })).toMatch(/give way/);
  });

  it('moves the robber when a knight gives way, three fields further for each', () => {
    const b = board();
    let s = b.s;
    const { corner } = b;
    let far = '' as CornerId;
    s = edit(s, (ctx) => {
      ctx.place('knight2', 0, { kind: 'corner', id: corner }, { active: true });
      far = ctx.geometry.corners.find(
        (c) => c !== corner && !ctx.geometry.cornerNeighbours.get(corner)!.includes(c),
      )!;
      ctx.place('knight1', 0, { kind: 'corner', id: far }, { active: false });
    });
    const strong = Object.values(s.pieces).find((p) => p.type === 'knight2')!;
    s = act(s, { type: 'knightRobberMove', player: 0, knight: strong.id });
    expect(s.phase).toMatchObject({ id: 'moveRobber', range: 3, walk: true });
    // It steps down and stays active.
    const stepped = Object.values(s.pieces).find(
      (p) => p.at.kind === 'corner' && p.at.id === corner,
    )!;
    expect(stepped.type).toBe('knight1');
    expect(stepped.props.active).toBe(true);
    const three = robberTargets(ctxOf(s), 0, 3).length;
    // A basic knight leaves the board to take it further.
    const basic = Object.values(s.pieces).find((p) => p.at.kind === 'corner' && p.at.id === far)!;
    s = act(s, { type: 'knightRobberMove', player: 0, knight: basic.id });
    expect(s.phase.range).toBe(6);
    expect(s.pieces[basic.id]).toBeUndefined();
    expect(robberTargets(ctxOf(s), 0, 6).length).toBeGreaterThan(three);
    s = act(s, lib.legalActions(s, 0).find((a) => a.type === 'moveRobber') as Action);
    expect(['main', 'steal']).toContain(s.phase.id);
  });

  it('lets the Bishop go six fields, or rob everyone', () => {
    const b = board();
    let s = b.s;
    s = edit(s, (ctx) => {
      giveProgress(ctx, 0, 'politics', 'bishop');
      for (const seat of [1, 2, 3]) ctx.grant(seat, { wool: 1 });
    });
    s = act(s, { type: 'playProgress', player: 0, card: 'bishop' });
    expect(s.phase.id).toBe('bishop');
    const moves = lib.legalActions(s, 0).filter((a) => a.type === 'bishopMove');
    expect(moves.length).toBe(robberTargets(ctxOf(s), 0, 6).length);
    expect(moves.length).toBeGreaterThan(robberTargets(ctxOf(s), 0, 3).length);
    s = act(s, { type: 'bishopRobAll', player: 0 });
    expect(s.phase.id).toBe('main');
    expect(s.players[0]!.hand.wool).toBe(3);
  });
});
