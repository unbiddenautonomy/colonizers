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
import { baseModule, robber } from '@colonizers/module-base';
import { generateBoard } from '@colonizers/maps';
import { princeHexes, princeMoves, princesModule, robberTargets, swapPairs } from '../src/index.ts';

const lib = new ModuleLibrary([baseModule, princesModule]);

function game(seed = 'princes', players = 4): GameState {
  const board = generateBoard({ seed, players, mode: 'classic' });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, players),
    modules: ['base', 'princes'],
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

/** Straight to the main phase of turn 1, with an empty board. */
function mainPhase(s = game()): GameState {
  return edit(s, (ctx) => {
    ctx.state.turn = { number: 1, player: 0, round: 0 };
    ctx.setPhase({ id: 'main' });
  });
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

const landHexes = (ctx: Ctx) =>
  (Object.keys(ctx.state.hexes) as HexId[]).filter((h) => ctx.isLand(h));

/** A land hex whose six neighbours are all land. */
const inland = (ctx: Ctx) =>
  landHexes(ctx).find((h) =>
    (ctx.geometry.hexNeighbours.get(h) ?? []).every((n) => ctx.isLand(n)),
  ) as HexId;

const cornersOf = (ctx: Ctx, h: HexId) => [...(ctx.geometry.hexCorners.get(h) ?? [])];

function edgeBetween(ctx: Ctx, a: HexId, b: HexId): EdgeId {
  const theirs = new Set(ctx.geometry.hexEdges.get(b) ?? []);
  return (ctx.geometry.hexEdges.get(a) ?? []).find((e) => theirs.has(e)) as EdgeId;
}

/** Moves every prince off the given hexes, onto far land hexes. */
function clearPrinces(ctx: Ctx, keepAway: HexId[]): void {
  const away = new Set<HexId>(keepAway);
  for (const h of keepAway) for (const n of ctx.geometry.hexNeighbours.get(h) ?? []) away.add(n);
  const far = landHexes(ctx).filter((h) => !away.has(h));
  for (const [i, p] of ctx.piecesOfType('prince').entries())
    ctx.move(p, { kind: 'hex', id: far[i] as HexId });
}

describe('Princes & Explorers', () => {
  it('starts four princes on the desert and the least likely numbers, with no robber', () => {
    const ctx = ctxOf(game());
    const at = [...princeHexes(ctx)];
    expect(at).toHaveLength(4);
    const tokens = at.map((h) => ctx.state.hexes[h]?.token);
    expect(tokens).toContain(undefined); // the desert
    expect(tokens).toContain(2);
    expect(tokens).toContain(12);
    expect(tokens.some((t) => t === 3 || t === 11)).toBe(true);
    expect(robber(ctx)).toBeUndefined();
  });

  it('brings the robber in when someone first settles at the desert, even in setup', () => {
    const s0 = game();
    const ctx = ctxOf(s0);
    const desert = landHexes(ctx).find((h) => ctx.state.hexes[h]?.token === undefined) as HexId;
    const corner = cornersOf(ctx, desert)[0] as CornerId;
    let s = act(s0, { type: 'placeSetupSettlement', player: 0, corner });
    expect(s.phase.id).toBe('princesRobber');
    const options = lib.legalActions(s, 0);
    expect(options.length).toBeGreaterThan(0);
    // Not on a prince.
    const pr = princeHexes(ctxOf(s));
    for (const o of options) expect(pr.has(o.hex as HexId)).toBe(false);
    s = act(s, options[0] as Action);
    expect(s.phase.id).toBe('setup');
    expect(s.phase.step).toBe('road');
    expect(robber(ctxOf(s))).toBeDefined();
  });

  it('moves a prince after a settlement, but never across another player’s road', () => {
    let s = mainPhase();
    let hex = '' as HexId;
    let corner = '' as CornerId;
    s = edit(s, (ctx) => {
      hex = inland(ctx);
      clearPrinces(ctx, [hex]);
      const p = ctx.piecesOfType('prince')[0]!;
      ctx.move(p, { kind: 'hex', id: hex });
      // Wall the prince in with player 1's roads on all six sides but one.
      const ns = [...(ctx.geometry.hexNeighbours.get(hex) ?? [])];
      for (const n of ns.slice(1))
        ctx.place('road', 1, { kind: 'edge', id: edgeBetween(ctx, hex, n) });
      // Player 0's roads somewhere away from it all.
      corner = ctx.geometry.corners.find(
        (c) =>
          !(ctx.geometry.cornerHexes.get(c) ?? []).some((h) => h === hex || ns.includes(h)) &&
          (ctx.geometry.cornerHexes.get(c) ?? []).every((h) => ctx.isLand(h)),
      ) as CornerId;
      const e = ctx.geometry.cornerEdges.get(corner)![0]!;
      const other = ctx.geometry.edgeCorners.get(e)!.find((c) => c !== corner)!;
      ctx.place('road', 0, { kind: 'edge', id: e });
      ctx.place('road', 0, {
        kind: 'edge',
        id: ctx.geometry.cornerEdges.get(other)!.find((x) => x !== e)!,
      });
      ctx.grant(0, { lumber: 1, brick: 1, wool: 1, grain: 1 });
    });
    const ctx = ctxOf(s);
    const prince = ctx.piecesOfType('prince')[0]!;
    const moves = princeMoves(ctx, 0).filter((m) => m.prince === prince.id);
    const ns = [...(ctx.geometry.hexNeighbours.get(hex) ?? [])];
    // Only the open side, unless another prince stands there.
    expect(moves.every((m) => m.hex === ns[0])).toBe(true);
    // Player 1 may cross their own roads.
    expect(princeMoves(ctx, 1).filter((m) => m.prince === prince.id).length).toBeGreaterThan(1);
  });

  it('asks for a prince move after building a settlement, then explores at a prince', () => {
    let s = mainPhase();
    let target = '' as CornerId;
    s = edit(s, (ctx) => {
      const hex = inland(ctx);
      clearPrinces(ctx, [hex]);
      ctx.move(ctx.piecesOfType('prince')[0]!, { kind: 'hex', id: hex });
      const [a, b] = cornersOf(ctx, hex) as [CornerId, CornerId];
      // A road from a to b along the hex, then build at b's neighbour two steps away.
      const e = ctx.geometry.cornerEdges
        .get(a)!
        .find((x) => ctx.geometry.edgeCorners.get(x)!.includes(b))!;
      ctx.place('settlement', 0, { kind: 'corner', id: a });
      ctx.place('road', 0, { kind: 'edge', id: e });
      const c = cornersOf(ctx, hex).find(
        (x) =>
          x !== a &&
          x !== b &&
          ctx.geometry.cornerEdges
            .get(b)!
            .some((y) => ctx.geometry.edgeCorners.get(y)!.includes(x)),
      )!;
      const e2 = ctx.geometry.cornerEdges
        .get(b)!
        .find((y) => ctx.geometry.edgeCorners.get(y)!.includes(c))!;
      ctx.place('road', 0, { kind: 'edge', id: e2 });
      target = c;
      ctx.grant(0, { lumber: 1, brick: 1, wool: 1, grain: 1 });
    });
    s = act(s, { type: 'buildSettlement', player: 0, corner: target });
    expect(s.phase.id).toBe('princeMove');
    const moves = lib.legalActions(s, 0);
    expect(moves.every((m) => m.type === 'movePrince')).toBe(true);
    s = act(s, moves[0] as Action);
    if (swapPairs(ctxOf(s), 0).length) {
      expect(s.phase.id).toBe('explore');
      const swaps = lib.legalActions(s, 0).filter((a) => a.hexes);
      const [x, y] = swaps[0]!.hexes as [HexId, HexId];
      const before = [s.hexes[x]!.token, s.hexes[y]!.token];
      s = act(s, swaps[0] as Action);
      expect([s.hexes[x]!.token, s.hexes[y]!.token]).toEqual([before[1], before[0]]);
    }
    expect(s.phase.id).toBe('main');
  });

  it('scores a point more per prince, and nothing next to the robber', () => {
    let s = mainPhase();
    let corner = '' as CornerId;
    s = edit(s, (ctx) => {
      const hex = inland(ctx);
      clearPrinces(ctx, [hex]);
      corner = cornersOf(ctx, hex)[0] as CornerId;
      ctx.place('settlement', 0, { kind: 'corner', id: corner });
    });
    expect(ctxOf(s).vp(0)).toBe(1);
    // Two princes on two of the corner's hexes: 3 points.
    s = edit(s, (ctx) => {
      const [h1, h2] = ctx.geometry.cornerHexes.get(corner)! as HexId[];
      const [p1, p2] = ctx.piecesOfType('prince');
      ctx.move(p1!, { kind: 'hex', id: h1! });
      ctx.move(p2!, { kind: 'hex', id: h2! });
    });
    expect(ctxOf(s).vp(0)).toBe(3);
    // The robber on the third: nothing.
    s = edit(s, (ctx) => {
      const h3 = ctx.geometry.cornerHexes.get(corner)![2]!;
      ctx.place('robber', null, { kind: 'hex', id: h3 });
    });
    expect(ctxOf(s).vp(0)).toBe(0);
  });

  it('weights roads at princes and cuts them at the robber', () => {
    let s = mainPhase();
    let hex = '' as HexId;
    s = edit(s, (ctx) => {
      hex = inland(ctx);
      clearPrinces(ctx, [hex]);
      // Three roads around the hex, each touching it.
      for (const e of [...ctx.geometry.hexEdges.get(hex)!].slice(0, 3))
        ctx.place('road', 0, { kind: 'edge', id: e });
    });
    expect(ctxOf(s).longestRoute(0)).toBe(3);
    s = edit(s, (ctx) => ctx.move(ctx.piecesOfType('prince')[0]!, { kind: 'hex', id: hex }));
    expect(ctxOf(s).longestRoute(0)).toBe(6);
    s = edit(s, (ctx) => {
      ctx.move(ctx.piecesOfType('prince')[0]!, {
        kind: 'hex',
        id: landHexes(ctx).find(
          (h) =>
            !(ctx.geometry.hexNeighbours.get(hex) ?? []).includes(h) &&
            h !== hex &&
            !princeHexes(ctx).has(h),
        )!,
      });
      ctx.place('robber', null, { kind: 'hex', id: hex });
    });
    expect(ctxOf(s).longestRoute(0)).toBeLessThanOrEqual(0);
  });

  it('moves the robber one to three fields, around princes and other players’ roads', () => {
    let s = mainPhase();
    let hex = '' as HexId;
    s = edit(s, (ctx) => {
      hex = inland(ctx);
      clearPrinces(ctx, [hex]);
      ctx.place('robber', null, { kind: 'hex', id: hex });
    });
    const open = robberTargets(ctxOf(s), 0);
    expect(open).not.toContain(hex);
    for (const n of ctxOf(s).geometry.hexNeighbours.get(hex) ?? []) expect(open).toContain(n);
    // Wall it in with player 1's roads: player 0 can't move it, player 1 can.
    s = edit(s, (ctx) => {
      for (const n of ctx.geometry.hexNeighbours.get(hex) ?? [])
        ctx.place('road', 1, { kind: 'edge', id: edgeBetween(ctx, hex, n) });
    });
    expect(robberTargets(ctxOf(s), 0)).toEqual([]);
    expect(robberTargets(ctxOf(s), 1).length).toBeGreaterThan(0);
  });

  it('lets the robber’s mover pay to move it, and rob anyone', () => {
    let s = mainPhase();
    s = edit(s, (ctx) => {
      const hex = inland(ctx);
      clearPrinces(ctx, [hex]);
      ctx.place('robber', null, { kind: 'hex', id: hex });
      ctx.grant(3, { ore: 2 });
      ctx.grant(1, { wool: 1 });
      ctx.grant(0, { ore: 1, wool: 1, grain: 1 });
    });
    s = act(s, { type: 'buyRobberMove', player: 0 });
    expect(s.players[0]!.hand).toEqual({ ore: 0, wool: 0, grain: 0 });
    expect(s.phase.id).toBe('moveRobber');
    s = act(s, lib.legalActions(s, 0)[0] as Action);
    // Players 1 and 3 have cards, though neither has a building near the robber.
    expect(s.phase.id).toBe('steal');
    expect(s.phase.candidates).toEqual([1, 3]);
    s = act(s, { type: 'steal', player: 0, from: 3 });
    expect(ctxOf(s).handSize(3)).toBe(1);
    expect(ctxOf(s).handSize(0)).toBe(1);
  });

  it('keeps production going on the robber’s field', async () => {
    const { produce } = await import('@colonizers/module-base');
    let s = mainPhase();
    let hex = '' as HexId;
    s = edit(s, (ctx) => {
      hex = landHexes(ctx).find((h) => ctx.state.hexes[h]?.token === 8)!;
      clearPrinces(ctx, [hex]);
      ctx.place('settlement', 2, { kind: 'corner', id: cornersOf(ctx, hex)[0]! });
      ctx.place('robber', null, { kind: 'hex', id: hex });
    });
    s = edit(s, (ctx) => produce(ctx, 8));
    expect(ctxOf(s).handSize(2)).toBeGreaterThan(0);
  });

  it('has no development cards', () => {
    const s = edit(mainPhase(), (ctx) => ctx.grant(0, { ore: 1, wool: 1, grain: 1 }));
    expect(lib.check(s, { type: 'buyDevCard', player: 0 })).toMatch(/development cards/);
  });

  it('lets ten cards stay in hand on a 7 with five players', () => {
    const ctx = ctxOf(game('big', 5));
    expect(ctx.reduce('handLimit', 0, 7)).toBe(10);
    expect(ctxOf(game()).reduce('handLimit', 0, 7)).toBe(7);
  });

  it('plays out random games to a winner', () => {
    const seen = new Set<string>();
    for (const seed of [1, 2, 3]) {
      const rand = rng(seed);
      let s = game(`random-${seed}`);
      for (let i = 0; i < 1500 && s.winner === null; i++) {
        const seat = lib.waitingOn(s)[0];
        expect(seat, `${s.phase.id} at step ${i}`).toBeDefined();
        const options = lib.legalActions(s, seat as number);
        // Favour building and ending the turn, so the game moves along.
        const pick =
          options.find((a) => a.type === 'buildSettlement' || a.type === 'buildCity') ??
          options[Math.floor(rand() * options.length)];
        s = act(s, pick as Action);
        for (const p of ['princeMove', 'explore', 'princesRobber', 'steal'])
          if (s.phase.id === p) seen.add(p);
      }
      expect(s.winner, `seed ${seed}`).not.toBeNull();
    }
    expect([...seen].sort()).toEqual(['explore', 'princeMove', 'princesRobber', 'steal']);
  }, 60_000);
});
