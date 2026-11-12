import { describe, expect, it } from 'vitest';
import {
  type CornerId,
  type EdgeId,
  type GameState,
  type HexId,
  type Piece,
} from '@colonizers/engine';
import { SEA_SCENARIOS } from '@colonizers/maps';
import { canPlaceShip, islandOf, pirateEdges, seaData, shipIsOpen } from '../src/index.ts';
import { act, ctxOf, edit, lib, seaGame, simulate } from './helpers.ts';

/** A coastal corner on the home island with a free sea edge next to it. */
function coastalStart(state: GameState): { corner: CornerId; sea: EdgeId } {
  const ctx = ctxOf(state);
  const home = new Set(state.settings.setupHexes as HexId[]);
  const blocked = pirateEdges(ctx);
  for (const c of ctx.geometry.corners) {
    if (!(ctx.geometry.cornerHexes.get(c) ?? []).some((h) => home.has(h))) continue;
    if (!ctx.isLandCorner(c)) continue;
    const sea = (ctx.geometry.cornerEdges.get(c) ?? []).find(
      (e) => ctx.isSeaEdge(e) && !ctx.isLandEdge(e) && !blocked.has(e),
    );
    if (sea) return { corner: c, sea };
  }
  throw new Error('No coastal corner');
}

function withSettlement(state: GameState, seat: number, corner: CornerId): GameState {
  return edit(state, (ctx) => {
    ctx.place('settlement', seat, { kind: 'corner', id: corner });
  });
}

function startPlay(state: GameState): GameState {
  return edit(state, (ctx) => {
    ctx.state.turn = { number: 3, player: 0, round: 1 };
    ctx.setPhase({ id: 'main' });
  });
}

describe('Seafarers rules', () => {
  it('builds ships next to the sea that connect to your settlement', () => {
    let s = seaGame();
    const { corner, sea } = coastalStart(s);
    s = startPlay(withSettlement(s, 0, corner));
    s = edit(s, (ctx) => ctx.grant(0, { lumber: 3, wool: 3 }));
    expect(lib.check(s, { type: 'buildShip', player: 0, edge: sea })).toBeNull();
    s = act(s, { type: 'buildShip', player: 0, edge: sea });
    const ctx = ctxOf(s);
    expect(ctx.piecesOf(0, 'ship')).toHaveLength(1);
    expect(ctx.player(0).hand).toMatchObject({ lumber: 2, wool: 2 });
    // A ship on a land-only edge is refused.
    const inland = ctx.geometry.edges.find((e) => ctx.isLandEdge(e) && !ctx.isSeaEdge(e))!;
    expect(canPlaceShip(ctx, 0, inland)).toMatch(/sea/);
  });

  it('only joins roads and ships at a settlement', () => {
    let s = seaGame();
    const { corner, sea } = coastalStart(s);
    s = startPlay(withSettlement(s, 0, corner));
    s = edit(s, (ctx) => {
      ctx.place('ship', 0, { kind: 'edge', id: sea });
    });
    const ctx = ctxOf(s);
    const [a, b] = ctx.geometry.edgeCorners.get(sea)!;
    const far = a === corner ? b : a;
    // From the ship's far end a road can't start (no building there).
    const roadEdge = (ctx.geometry.cornerEdges.get(far) ?? []).find(
      (e) => e !== sea && ctx.isLandEdge(e),
    );
    if (roadEdge) {
      s = edit(s, (c) => c.grant(0, { brick: 1, lumber: 1 }));
      expect(lib.check(s, { type: 'buildRoad', player: 0, edge: roadEdge })).toMatch(/connect/);
    }
  });

  it('moves only the ship at the open end, once per turn, not on the turn it was built', () => {
    let s = seaGame();
    const { corner, sea } = coastalStart(s);
    s = startPlay(withSettlement(s, 0, corner));
    s = edit(s, (ctx) => {
      ctx.state.turn.number = 1;
      ctx.place('ship', 0, { kind: 'edge', id: sea });
      ctx.state.turn.number = 3;
    });
    const ctx = ctxOf(s);
    const ship = ctx.piecesOf(0, 'ship')[0] as Piece;
    expect(shipIsOpen(ctx, ship)).toBe(true);
    const moves = lib.legalActions(s, 0).filter((a) => a.type === 'moveShip');
    expect(moves.length).toBeGreaterThan(0);
    s = act(s, moves[0]!);
    expect(lib.legalActions(s, 0).some((a) => a.type === 'moveShip')).toBe(false);
    expect(lib.check(s, { ...moves[0]!, to: sea })).toMatch(/already moved/);
  });

  it('lets the pirate block ships and rob ship owners', () => {
    let s = seaGame();
    const { corner, sea } = coastalStart(s);
    s = startPlay(withSettlement(s, 1, corner));
    s = edit(s, (ctx) => {
      ctx.place('ship', 1, { kind: 'edge', id: sea });
      ctx.grant(1, { ore: 2 });
    });
    const ctx = ctxOf(s);
    const seaHex = (ctx.geometry.edgeHexes.get(sea) ?? []).find((h) => ctx.isSea(h))!;
    s = edit(s, (c) => c.setPhase({ id: 'moveRobber', returnTo: 'main' }));
    s = act(s, { type: 'movePirate', player: 0, hex: seaHex });
    expect(s.players[0]!.hand.ore).toBe(1);
    expect(s.phase.id).toBe('main');
    // Nobody can build a ship on the pirate's edges.
    const blocked = ctxOf(s)
      .geometry.hexEdges.get(seaHex)!
      .find((e) => e !== sea)!;
    expect(canPlaceShip(ctxOf(s), 1, blocked)).toMatch(/pirate|connect|taken|sea/);
    expect(canPlaceShip(ctxOf(s), 1, blocked)).not.toBeNull();
  });

  it('pays gold as a choice', () => {
    let s = seaGame();
    const ctx0 = ctxOf(s);
    const gold = Object.values(s.hexes).find((h) => h.type === 'gold')!;
    const corner = ctx0.geometry.hexCorners.get(gold.id)![0]!;
    s = withSettlement(s, 2, corner);
    s = edit(s, (ctx) => {
      ctx.state.turn = { number: 3, player: 0, round: 1 };
      ctx.setPhase({ id: 'roll' });
    });
    // Find a seed position whose roll hits the gold number.
    let rolled = s;
    for (let i = 0; i < 200; i++) {
      const tryState = edit(s, (ctx) => {
        for (let k = 0; k < i; k++) ctx.rng.nextUint32();
      });
      const r = lib.apply(tryState, { type: 'roll', player: 0 });
      if ((r.state.data.base as { lastRoll: { total: number } }).lastRoll.total === gold.token) {
        rolled = r.state;
        break;
      }
    }
    expect(rolled.phase.id).toBe('pickGold');
    expect((rolled.phase.owed as Record<number, number>)[2]).toBe(1);
    expect(lib.check(rolled, { type: 'pickGold', player: 2, cards: { ore: 2 } })).toMatch(/Pick 1/);
    const after = act(rolled, { type: 'pickGold', player: 2, cards: { ore: 1 } });
    expect(after.players[2]!.hand.ore).toBe(1);
    expect(after.phase.id).toBe('main');
  });

  it('keeps setup on the home island', () => {
    const s = seaGame('new-shores');
    const ctx = ctxOf(s);
    const home = new Set(s.settings.setupHexes as HexId[]);
    const away = ctx.geometry.corners.find(
      (c) =>
        ctx.isLandCorner(c) && !(ctx.geometry.cornerHexes.get(c) ?? []).some((h) => home.has(h)),
    )!;
    expect(lib.check(s, { type: 'placeSetupSettlement', player: 0, corner: away })).toMatch(
      /home island/,
    );
  });

  it('gives the island bonus once per new island', () => {
    let s = startPlay(seaGame('new-shores'));
    const ctx = ctxOf(s);
    const home = new Set(s.settings.setupHexes as HexId[]);
    const homeCorner = ctx.geometry.corners.find((c) =>
      (ctx.geometry.cornerHexes.get(c) ?? []).every((h) => home.has(h)),
    )!;
    s = edit(s, (c) => {
      c.setPhase({ id: 'setup', index: 0, step: 'settlement' });
      c.place('settlement', 0, { kind: 'corner', id: homeCorner });
      c.setPhase({ id: 'main' });
    });
    const away = ctx.geometry.corners.filter(
      (c) =>
        ctx.isLandCorner(c) && !(ctx.geometry.cornerHexes.get(c) ?? []).some((h) => home.has(h)),
    );
    const first = away[0]!;
    const sameIsland = away.find(
      (c) =>
        islandOf(ctx, c) === islandOf(ctx, first) &&
        !(ctx.geometry.cornerNeighbours.get(first) ?? []).includes(c) &&
        c !== first,
    );
    const before = ctxOf(s).vp(0);
    s = edit(s, (c) => c.place('settlement', 0, { kind: 'corner', id: first }));
    expect(ctxOf(s).vp(0)).toBe(before + 1 + 2);
    if (sameIsland) {
      s = edit(s, (c) => c.place('settlement', 0, { kind: 'corner', id: sameIsland }));
      expect(ctxOf(s).vp(0)).toBe(before + 2 + 2);
    }
    expect(seaData(ctxOf(s)).bonusVp[0]).toBe(2);
  });

  it('turns over fog next to new ships and pays the explorer', () => {
    let s = seaGame('fog-islands', 4, 'fog');
    expect(Object.values(s.hexes).some((h) => h.hidden)).toBe(true);
    // The view hides what is under the fog.
    const hiddenHex = Object.values(s.hexes).find((h) => h.hidden)!;
    expect(lib.view(s, 0).hexes[hiddenHex.id]!.type).toBe('hidden');
    // Sail until something is revealed.
    const { corner, sea } = coastalStart(s);
    s = startPlay(withSettlement(s, 0, corner));
    s = edit(s, (c) => c.grant(0, { lumber: 10, wool: 10 }));
    let revealed = false;
    let edge: EdgeId | undefined = sea;
    for (let i = 0; i < 10 && edge && !revealed; i++) {
      const r = lib.apply(s, { type: 'buildShip', player: 0, edge });
      s = r.state;
      revealed = r.events.some((e) => e.type === 'revealed');
      if (s.phase.id === 'pickGold') s = act(s, { type: 'pickGold', player: 0, cards: { ore: 1 } });
      edge = lib.legalActions(s, 0).find((a) => a.type === 'buildShip')?.edge as EdgeId | undefined;
    }
    expect(revealed).toBe(true);
  });
});

describe('Seafarers full games', () => {
  for (const scenario of SEA_SCENARIOS) {
    for (const players of [3, 4]) {
      it(`${scenario.name}, ${players} players: random games finish with no rule errors`, () => {
        let finished = 0;
        for (let g = 0; g < 4; g++) {
          const { state } = simulate(
            seaGame(scenario.id, players, `${scenario.id}-${g}`),
            g + 7,
            6000,
            g === 0,
          );
          if (state.winner !== null) finished++;
        }
        expect(finished).toBeGreaterThanOrEqual(3);
      }, 180_000);
    }
  }

  it('replays exactly from seed and actions', () => {
    const initial = seaGame('fog-islands', 4, 'replay');
    const { state, actions } = simulate(initial, 3, 1500);
    let s = initial;
    for (const a of actions) s = lib.apply(s, a).state;
    expect(s).toEqual(state);
  }, 60_000);
});
