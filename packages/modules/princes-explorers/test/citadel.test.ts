import { describe, expect, it } from 'vitest';
import {
  Ctx,
  ModuleLibrary,
  type Action,
  type CornerId,
  type EdgeId,
  type GameState,
  type HexId,
} from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { generateBoard } from '@colonizers/maps';
import {
  CITADEL_MAX,
  citadelSpots,
  nothingLeftToBuild,
  princeHexes,
  princesModule,
} from '../src/index.ts';

const lib = new ModuleLibrary([baseModule, princesModule]);

function game(seed = 'citadel'): GameState {
  const board = generateBoard({ seed, players: 4, mode: 'classic' });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C', 'D'],
    modules: ['base', 'princes'],
    map: board.map,
    fixedSeats: true,
  }).state;
}

const ctxOf = (s: GameState) => new Ctx(s, lib.registry(s.modules));
const act = (s: GameState, a: Action) => lib.apply(s, a).state;
const legal = (s: GameState, type: string) => lib.legalActions(s, 0).filter((a) => a.type === type);

function edit(state: GameState, fn: (ctx: Ctx) => void): GameState {
  const next = structuredClone(state);
  const ctx = ctxOf(next);
  fn(ctx);
  ctx.commit();
  return next;
}

/**
 * Turn 1, main phase, with every one of player 0's buildings and roads on the board: four cities
 * and five settlements on corners away from the princes, fifteen roads.
 */
function outOfPieces(roads = 15): GameState {
  return edit(game(), (ctx) => {
    ctx.state.turn = { number: 1, player: 0, round: 0 };
    ctx.setPhase({ id: 'main' });
    // A far target, so the points can be counted without the game ending.
    ctx.state.settings.vpTarget = 30;
    const pr = princeHexes(ctx);
    const quiet = ctx.geometry.corners.filter(
      (c) =>
        ctx.isLandCorner(c) &&
        (ctx.geometry.cornerHexes.get(c) ?? []).every((h: HexId) => !pr.has(h)),
    );
    quiet.slice(0, 4).forEach((c) => ctx.place('city', 0, { kind: 'corner', id: c }));
    quiet.slice(4, 9).forEach((c) => ctx.place('settlement', 0, { kind: 'corner', id: c }));
    ctx.geometry.edges
      .filter((e: EdgeId) => ctx.isLandEdge(e))
      .slice(0, roads)
      .forEach((e) => ctx.place('road', 0, { kind: 'edge', id: e }));
  });
}

const cities = (s: GameState): CornerId[] =>
  Object.values(s.pieces)
    .filter((p) => p.owner === 0 && p.type === 'city' && p.at.kind === 'corner')
    .map((p) => (p.at as { id: CornerId }).id);

describe('Princes & Explorers: the citadel, for a dead end', () => {
  it('stays shut while there is something left to build', () => {
    // Two roads still in the box, and room for them.
    const s = outOfPieces(13);
    expect(nothingLeftToBuild(ctxOf(s), 0)).toBe(false);
    expect(citadelSpots(ctxOf(s), 0)).toEqual([]);
    expect(legal(s, 'buildCitadel')).toEqual([]);
  });

  it('opens with every piece on the board, for a point more per citadel', () => {
    let s = outOfPieces();
    expect(nothingLeftToBuild(ctxOf(s), 0)).toBe(true);
    expect(citadelSpots(ctxOf(s), 0)).toHaveLength(4);
    // Not without the cards.
    expect(legal(s, 'buildCitadel')).toEqual([]);
    s = edit(s, (ctx) => ctx.grant(0, { ore: 6, grain: 4, wool: 2 }));
    const [a, b, c] = cities(s);
    s = act(s, { type: 'buildCitadel', player: 0, corner: a });
    // The same game without the citadel (the longest road was settled by the action too).
    const plain = (st: GameState) =>
      edit(st, (ctx) => {
        for (const p of Object.values(ctx.state.pieces)) delete p.props.citadel;
      });
    const before = ctxOf(plain(s)).vp(0);
    expect(ctxOf(s).vp(0)).toBe(before + 1);
    expect(s.players[0]!.hand).toMatchObject({ ore: 3, grain: 2, wool: 1 });
    // Not twice on one city.
    expect(lib.check(s, { type: 'buildCitadel', player: 0, corner: a })).toBeTruthy();
    s = act(s, { type: 'buildCitadel', player: 0, corner: b });
    expect(ctxOf(s).vp(0)).toBe(before + 2);
    // Two at most.
    expect(CITADEL_MAX).toBe(2);
    s = edit(s, (ctx) => ctx.grant(0, { ore: 3, grain: 2, wool: 1 }));
    expect(lib.check(s, { type: 'buildCitadel', player: 0, corner: c })).toBeTruthy();
    expect(citadelSpots(ctxOf(s), 0)).toEqual([]);
  });

  it('scores nothing next to the robber, like its city', () => {
    let s = outOfPieces();
    s = edit(s, (ctx) => ctx.grant(0, { ore: 3, grain: 2, wool: 1 }));
    const [a] = cities(s);
    s = act(s, { type: 'buildCitadel', player: 0, corner: a });
    const withCitadel = ctxOf(s).vp(0);
    s = edit(s, (ctx) => {
      const hex = (ctx.geometry.cornerHexes.get(a as CornerId) ?? []).find((h) =>
        ctx.isLand(h),
      ) as HexId;
      ctx.place('robber', null, { kind: 'hex', id: hex });
    });
    // The city's 2 and the citadel's 1 are gone (other buildings may touch that field too).
    expect(ctxOf(s).vp(0)).toBeLessThanOrEqual(withCitadel - 3);
  });
});
