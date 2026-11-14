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
import { seafarersModule, islands } from '@colonizers/module-seafarers';
import { generateSeaBoard } from '@colonizers/maps';
import { princeHexes, princeMoves, princesModule, robberTargets } from '../src/index.ts';

const lib = new ModuleLibrary([baseModule, seafarersModule, princesModule]);

function game(seed = 'princes-sea'): GameState {
  const b = generateSeaBoard({ seed, players: 4, scenario: 'new-shores' });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C', 'D'],
    modules: ['base', 'seafarers', 'princes'],
    map: b.map,
    settings: { ...b.settings },
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

/** Shortest chain of sea edges between two corners, by breadth-first search. */
function seaPath(ctx: Ctx, from: CornerId, to: CornerId): EdgeId[] | null {
  const prev = new Map<CornerId, [CornerId, EdgeId] | null>([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const c = queue.shift() as CornerId;
    if (c === to) break;
    for (const e of ctx.geometry.cornerEdges.get(c) ?? []) {
      if (!ctx.isSeaEdge(e) && !(ctx.geometry.edgeHexes.get(e) ?? []).some((h) => ctx.isSea(h)))
        continue;
      const n = ctx.geometry.edgeCorners.get(e)!.find((x) => x !== c)!;
      if (prev.has(n)) continue;
      prev.set(n, [c, e]);
      queue.push(n);
    }
  }
  if (!prev.has(to)) return null;
  const out: EdgeId[] = [];
  for (let c = to; prev.get(c); c = prev.get(c)![0]) out.push(prev.get(c)![1]);
  return out;
}

describe('Princes & Explorers with Seafarers', () => {
  it('starts the princes on the home island, apart, with no robber', () => {
    const s = game();
    const ctx = ctxOf(s);
    const home = s.settings.setupHexes as HexId[];
    const at = [...princeHexes(ctx)];
    expect(at).toHaveLength(4);
    for (const h of at) expect(home).toContain(h);
    expect(robber(ctx)).toBeUndefined();
  });

  it('brings the robber in on the first 7, on a settled field only', () => {
    let s = edit(game(), (ctx) => {
      ctx.state.turn = { number: 1, player: 0, round: 0 };
      ctx.setPhase({ id: 'moveRobber', returnTo: 'main' });
      const h = (ctx.state.settings.setupHexes as HexId[]).find((x) => !princeHexes(ctx).has(x))!;
      ctx.place('settlement', 1, { kind: 'corner', id: ctx.geometry.hexCorners.get(h)![0]! });
    });
    const ctx = ctxOf(s);
    const targets = robberTargets(ctx, 0);
    expect(targets.length).toBeGreaterThan(0);
    for (const h of targets)
      expect(ctx.geometry.hexCorners.get(h)!.some((c) => !!ctx.buildingAt(c))).toBe(true);
    s = act(s, lib.legalActions(s, 0).find((a) => a.type === 'moveRobber') as Action);
    expect(robber(ctxOf(s))).toBeDefined();
  });

  it('lets a prince cross the sea along a closed ship line', () => {
    let s = game();
    let target = '' as HexId;
    let from = '' as HexId;
    s = edit(s, (ctx) => {
      // Reveal the board so both islands are known.
      for (const h of Object.values(ctx.state.hexes)) delete h.hidden;
      const isles = islands(ctx).sort((a, b) => b.length - a.length);
      const [a, b] = isles as [HexId[], HexId[]];
      // A coastal corner on each island.
      const coast = (isle: HexId[]) =>
        isle
          .flatMap((h) => [...(ctx.geometry.hexCorners.get(h) ?? [])])
          .find((c) => (ctx.geometry.cornerHexes.get(c) ?? []).some((h) => ctx.isSea(h)))!;
      const ca = coast(a);
      const cb = coast(b);
      const path = seaPath(ctx, ca, cb)!;
      ctx.place('settlement', 0, { kind: 'corner', id: ca });
      ctx.place('settlement', 0, { kind: 'corner', id: cb });
      for (const e of path) ctx.place('ship', 0, { kind: 'edge', id: e });
      from = ctx.geometry.cornerHexes.get(ca)!.find((h) => ctx.isLand(h))!;
      target = ctx.geometry.cornerHexes.get(cb)!.find((h) => ctx.isLand(h))!;
      // One prince where the line starts; the rest far from the far end.
      const ps = ctx.piecesOfType('prince');
      ctx.move(ps[0]!, { kind: 'hex', id: from });
      const rest = a.filter((h) => h !== from).slice(-3);
      for (const [i, p] of ps.slice(1).entries()) ctx.move(p, { kind: 'hex', id: rest[i]! });
    });
    const ctx = ctxOf(s);
    const prince = ctx.piecesOfType('prince').find((p) => p.at.kind === 'hex' && p.at.id === from)!;
    const moves = princeMoves(ctx, 0).filter((m) => m.prince === prince.id);
    expect(moves.map((m) => m.hex)).toContain(target);
    // Another player can't use player 0's ships.
    expect(princeMoves(ctx, 1).some((m) => m.prince === prince.id && m.hex === target)).toBe(false);
  });

  it('plays out random games to a winner', () => {
    for (const seed of [1, 2]) {
      const rand = rng(seed);
      let s = game(`sea-${seed}`);
      for (let i = 0; i < 3000 && s.winner === null; i++) {
        const seat = lib.waitingOn(s)[0];
        expect(seat, `${s.phase.id} at step ${i}`).toBeDefined();
        const options = lib.legalActions(s, seat as number);
        const pick =
          options.find((a) => a.type === 'buildSettlement' || a.type === 'buildCity') ??
          options[Math.floor(rand() * options.length)];
        s = act(s, pick as Action);
      }
      expect(s.winner, `seed ${seed}`).not.toBeNull();
    }
  });
});
