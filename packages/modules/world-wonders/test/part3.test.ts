import { describe, expect, it } from 'vitest';
import type { CornerId, Ctx, EdgeId, GameState, HexId } from '@colonizers/engine';
import { generateBoard } from '@colonizers/maps';
import {
  cityAtRisk,
  ckData,
  displaceTargets,
  shielded,
  strength,
} from '@colonizers/module-cities-knights';
import { hasStage, huntOf, refundOf, wallChoices } from '../src/index.ts';
import { updateWall } from '../src/knights.ts';
import { act, blank, ctxOf, edit, lib, own } from './helpers.ts';

/** Main phase on seat 0's turn with Seafarers, no players' pieces on the board. */
function blankSea(seed = 'ww3'): GameState {
  const board = generateBoard({ seed, players: 4, mode: 'classic' });
  const s = lib.createGame({
    seed,
    players: ['A', 'B', 'C', 'D'],
    modules: ['base', 'seafarers', 'world-wonders'],
    map: board.map,
    settings: { vpTarget: 10 },
    fixedSeats: true,
  }).state;
  return edit(s, (ctx) => {
    for (const p of Object.values(ctx.state.pieces)) if (p.owner !== null) ctx.remove(p);
    ctx.setPhase({ id: 'main' });
  });
}

const hand = (s: GameState, seat: number, cards: Record<string, number>) =>
  edit(s, (ctx) => {
    const p = ctx.player(seat);
    for (const c of Object.keys(p.hand)) {
      ctx.state.bank[c] = (ctx.state.bank[c] ?? 0) + (p.hand[c] ?? 0);
      p.hand[c] = 0;
    }
    ctx.grant(seat, cards);
  });

const total = (s: GameState, seat: number) =>
  Object.values(s.players[seat]!.hand).reduce((a, b) => a + b, 0);

const isLandHex = (ctx: Ctx, h: HexId) => {
  const x = ctx.state.hexes[h];
  return !!x && ctx.registry.hexTypes[x.type]?.terrain === 'land';
};

/** A land hex all of whose neighbours are land. */
const inland = (ctx: Ctx) =>
  ctx.geometry.hexes.filter(
    (h) =>
      isLandHex(ctx, h) &&
      (ctx.geometry.hexNeighbours.get(h) ?? []).every((n) => isLandHex(ctx, n)),
  );

/** A coastal corner: touching both land and sea. */
function coastCorner(ctx: Ctx): CornerId {
  return ctx.geometry.corners.find((c) => {
    const hs = ctx.geometry.cornerHexes.get(c) ?? [];
    return (
      hs.some((h) => isLandHex(ctx, h)) && hs.some((h) => !isLandHex(ctx, h) && ctx.state.hexes[h])
    );
  })!;
}

/** A simple path of `n` land edges from a corner. */
function path(ctx: Ctx, from: CornerId, n: number, avoid = new Set<CornerId>()): EdgeId[] {
  const out: EdgeId[] = [];
  const seen = new Set<CornerId>([from, ...avoid]);
  let at = from;
  while (out.length < n) {
    const next = (ctx.geometry.cornerEdges.get(at) ?? [])
      .filter((e) => ctx.isLandEdge(e))
      .map((e) => ({ e, to: ctx.geometry.edgeCorners.get(e)!.find((c) => c !== at)! }))
      .find((x) => !seen.has(x.to));
    if (!next) throw new Error('No path');
    out.push(next.e);
    seen.add(next.to);
    at = next.to;
  }
  return out;
}

describe('Wonder prices', () => {
  it('Lighthouse I: once a turn, the ship after a paid one is free', () => {
    let s = own(blankSea(), { lighthouse: { stages: 1 } });
    s = edit(s, (ctx) => {
      ctx.place('settlement', 0, { kind: 'corner', id: coastCorner(ctx) });
    });
    s = hand(s, 0, { lumber: 3, wool: 3 });
    const ship = () => lib.legalActions(s, 0).find((a) => a.type === 'buildShip')!;
    s = act(s, ship());
    expect(total(s, 0)).toBe(4);
    expect(ctxOf(s).cost('ship', 0)).toEqual({});
    s = act(s, ship());
    expect(total(s, 0)).toBe(4);
    s = act(s, ship());
    expect(total(s, 0)).toBe(2);
  });

  it('Taj Mahal I and Machu Picchu I offer other prices when the usual one is out of reach', () => {
    let s = own(blankSea(), { taj: { stages: 1 } });
    s = hand(s, 0, { lumber: 1, wool: 1 });
    expect(ctxOf(s).cost('road', 0)).toEqual({ lumber: 1, wool: 1 });
    s = hand(s, 0, { brick: 1, lumber: 1 });
    expect(ctxOf(s).cost('road', 0)).toEqual({ brick: 1, lumber: 1 });
    expect(ctxOf(s).cost('ship', 0)).toEqual({ brick: 1, lumber: 1 });
    let m = own(blank('m', {}, true), { machuPicchu: { stages: 1 } });
    m = hand(m, 0, { wool: 2 });
    expect(ctxOf(m).cost('road', 0)).toEqual({ wool: 2 });
    expect(ctxOf(m).cost('activate', 0)).toEqual({ wool: 1 });
    m = hand(m, 0, { grain: 1, wool: 1 });
    expect(ctxOf(m).cost('activate', 0)).toEqual({ grain: 1 });
  });

  it('Taj Mahal III: take back one resource you spent, at the end of your turn', () => {
    let s = own(blank(), { taj: { stages: 3 } });
    s = edit(s, (ctx) => {
      ctx.place('settlement', 0, { kind: 'corner', id: ctx.geometry.corners[40]! });
    });
    s = hand(s, 0, { brick: 1, lumber: 1 });
    s = act(
      s,
      lib.legalActions(s, 0).find((a) => a.type === 'buildRoad')!,
    );
    expect(total(s, 0)).toBe(0);
    s = act(s, { type: 'endTurn', player: 0 });
    expect(refundOf(ctxOf(s), 0).sort()).toEqual(['brick', 'lumber']);
    expect(lib.check(s, { type: 'wonderRefund', player: 0, card: 'ore' })).not.toBeNull();
    s = act(s, { type: 'wonderRefund', player: 0, card: 'brick' });
    expect(s.players[0]!.hand.brick).toBe(1);
    expect(refundOf(ctxOf(s), 0)).toEqual([]);
  });
});

describe('Wonder routes and cards', () => {
  it('Cristo Redentor I: roads reach across mountains', () => {
    let far = '' as CornerId;
    let s = own(blank(), { cristo: { stages: 1 } });
    s = edit(s, (ctx) => {
      const mountain = inland(ctx).find((h) => ctx.state.hexes[h]!.type === 'mountains')!;
      const cs = ctx.geometry.hexCorners.get(mountain)!;
      ctx.place('settlement', 0, { kind: 'corner', id: cs[0]! });
      far = cs[3]!;
    });
    s = hand(s, 0, { brick: 1, lumber: 1 });
    const across = (st: GameState) =>
      lib.legalActions(st, 0).filter(
        (a) =>
          a.type === 'buildRoad' &&
          ctxOf(st)
            .geometry.edgeCorners.get(a.edge as EdgeId)!
            .includes(far),
      );
    expect(across(s).length).toBeGreaterThan(0);
    const without = own(s, { cristo: { owner: 1, stages: 1 } });
    expect(across(without)).toEqual([]);
  });

  it('Colosseum I: tie the holder of Longest Road and it is yours', () => {
    let s = own(blank(), { colosseum: { stages: 1 } });
    let last = '' as CornerId;
    s = edit(s, (ctx) => {
      const corners = ctx.geometry.corners.filter((c) => ctx.isLandCorner(c));
      const a = corners[0]!;
      const roadsA = path(ctx, a, 5);
      ctx.place('settlement', 1, { kind: 'corner', id: a });
      for (const e of roadsA) ctx.place('road', 1, { kind: 'edge', id: e });
      const used = new Set<CornerId>(roadsA.flatMap((e) => ctx.geometry.edgeCorners.get(e)!));
      const b = corners.find(
        (c) =>
          !used.has(c) &&
          (ctx.geometry.cornerEdges.get(c) ?? []).every((e) =>
            ctx.geometry.edgeCorners.get(e)!.every((x) => !used.has(x)),
          ),
      )!;
      const roadsB = path(ctx, b, 4, used);
      ctx.place('settlement', 0, { kind: 'corner', id: b });
      for (const e of roadsB) ctx.place('road', 0, { kind: 'edge', id: e });
      last = ctx.geometry.edgeCorners
        .get(roadsB[3]!)!
        .find((c) => !ctx.geometry.edgeCorners.get(roadsB[2]!)!.includes(c))!;
      (ctx.state.data.base as { longestRoad: number | null }).longestRoad = 1;
    });
    s = hand(s, 0, { brick: 3, lumber: 3 });
    const grow = lib.legalActions(s, 0).filter(
      (a) =>
        a.type === 'buildRoad' &&
        ctxOf(s)
          .geometry.edgeCorners.get(a.edge as EdgeId)!
          .includes(last),
    );
    const after = grow.map((a) => act(s, a)).find((t) => ctxOf(t).longestRoute(0) === 5)!;
    expect(after).toBeDefined();
    expect((after.data.base as { longestRoad: number }).longestRoad).toBe(0);
  });

  it('Artemis III: look at the next card too and keep one', () => {
    let s = own(blank(), { artemis: { stages: 3 } });
    s = hand(s, 0, { wool: 2, grain: 2, ore: 2 });
    const [first, second] = s.decks.dev!;
    s = act(s, { type: 'buyDevCard', player: 0 });
    const h = huntOf(ctxOf(s), 0)!;
    expect(h).toMatchObject({ card: first, alt: second });
    // Nobody else sees the two cards.
    const seen = lib.view(s, 1).data['world-wonders'] as { hunt: { card: string } };
    expect(seen.hunt.card).toBe('');
    s = act(s, { type: 'wonderHunt', player: 0, swap: true });
    expect(s.players[0]!.held.dev!.map((c) => c.card)).toEqual([second]);
    expect(s.decks.dev!.at(-1)).toBe(first);
    // Once a round.
    s = act(s, { type: 'buyDevCard', player: 0 });
    expect(huntOf(ctxOf(s), 0)).toBeNull();
  });
});

describe('Wonders with Cities & Knights', () => {
  it('Colossus I and Zeus I add to your strength against the barbarians', () => {
    let s = blank('ck', {}, true);
    s = edit(s, (ctx) => {
      const coast = coastCorner(ctx);
      const inner = inland(ctx)[0]!;
      const cs = ctx.geometry.hexCorners.get(inner)!;
      ctx.place('knight1', 0, { kind: 'corner', id: coast }, { active: true });
      ctx.place('knight2', 0, { kind: 'corner', id: cs[0]! }, { active: false });
      ctx.place('knight3', 0, { kind: 'corner', id: cs[2]! }, { active: false });
      ctx.place('knight1', 0, { kind: 'corner', id: cs[4]! }, { active: false });
    });
    expect(strength(ctxOf(s), 0)).toBe(1);
    expect(strength(ctxOf(own(s, { colossus: { stages: 1 } })), 0)).toBe(2);
    expect(strength(ctxOf(own(s, { zeus: { stages: 1 } })), 0)).toBe(6);
  });

  it('Zeus III: buy a progress card with a resource and its commodity', () => {
    let s = own(blank('ck', {}, true), { zeus: { stages: 3 } });
    s = hand(s, 0, { lumber: 1, paper: 1 });
    expect(lib.check(s, { type: 'wonderOffering', player: 0, track: 'trade' })).not.toBeNull();
    s = act(s, { type: 'wonderOffering', player: 0, track: 'science' });
    expect(total(s, 0)).toBe(0);
    const held = s.players[0]!.held.science?.length ?? 0;
    const scored = Object.values(s.players[0]!.played).reduce((a, b) => a + b, 0);
    expect(held + scored).toBe(1);
  });

  it('Great Wall I: knights and cities on the wall are safe', () => {
    let s = own(blank('ck', {}, true), { greatWall: { stages: 1 } });
    let city = '' as CornerId;
    let mine = '' as CornerId;
    let theirs = '' as CornerId;
    s = edit(s, (ctx) => {
      const a = inland(ctx)[0]!;
      const b = (ctx.geometry.hexNeighbours.get(a) ?? []).find((h) => isLandHex(ctx, h))!;
      const ea = ctx.geometry.hexEdges.get(a)!;
      const eb = ctx.geometry.hexEdges.get(b)!;
      for (const e of [...ea, ...eb])
        if (!(ea.includes(e) && eb.includes(e))) ctx.place('road', 0, { kind: 'edge', id: e });
      const ring = ctx.geometry.hexCorners
        .get(a)!
        .filter((c) => !ctx.geometry.hexCorners.get(b)!.includes(c));
      city = ring[0]!;
      mine = ring[1]!;
      ctx.place('city', 0, { kind: 'corner', id: city });
      ctx.place('knight1', 0, { kind: 'corner', id: mine }, { active: true });
      // A strong rival knight right beside ours, on a road of its own.
      const out = (ctx.geometry.cornerEdges.get(mine) ?? []).find(
        (e) => !ctx.state.pieces[ctx.piecesAt({ kind: 'edge', id: e })[0]?.id ?? ''],
      )!;
      theirs = ctx.geometry.edgeCorners.get(out)!.find((c) => c !== mine)!;
      ctx.place('road', 1, { kind: 'edge', id: out });
      ctx.place('knight3', 1, { kind: 'corner', id: theirs }, { active: true });
      updateWall(ctx);
    });
    const ctx = ctxOf(s);
    const knight = ctx.piecesAt({ kind: 'corner', id: mine })[0]!;
    const rival = ctx.piecesAt({ kind: 'corner', id: theirs })[0]!;
    expect(shielded(ctx, knight)).toBe(true);
    expect(displaceTargets(ctx, rival)).not.toContain(mine);
    expect(cityAtRisk(ctx, 0)).toEqual([]);
    const plain = edit(s, (c) => {
      (c.state.data['world-wonders'] as { wall?: unknown }).wall = undefined;
    });
    expect(cityAtRisk(ctxOf(plain), 0)).toHaveLength(1);
  });

  it('Great Wall III: the barbarian ship moves two spaces or none', () => {
    const start = (steps: number) => {
      let s = own(blank('ck', {}, true), { greatWall: { stages: 3 } });
      s = edit(s, (ctx) => {
        ckData(ctx).forcedEvent = 'ship';
        ctx.setPhase({ id: 'roll' });
      });
      s = act(s, { type: 'roll', player: 0 });
      expect(s.phase.id).toBe('wonderRoll');
      expect(wallChoices(ctxOf(s), 0, s.phase.held as { a: number; b: number })).toEqual([0, 2]);
      s = act(s, { type: 'wonderWall', player: 0, steps });
      expect(s.phase.id).not.toBe('wonderRoll');
      return ckData(ctxOf(s)).barbarian;
    };
    expect(start(2)).toBe(2);
    expect(start(0)).toBe(0);
  });
});

describe('Pyramids I', () => {
  it("silences a wonder when the Pyramids' owner moves the robber onto it", () => {
    let s = own(blank(), {
      pyramids: { owner: 1, stages: 1 },
      lighthouse: { owner: 0, stages: 3, hex: 'h:0,0' as HexId },
    });
    s = edit(s, (ctx) => {
      ctx.state.turn.player = 1;
      ctx.setPhase({ id: 'moveRobber', returnTo: 'main' });
    });
    s = act(s, { type: 'moveRobber', player: 1, hex: 'h:0,0' as HexId });
    expect(hasStage(ctxOf(s), 0, 'lighthouse', 3)).toBe(false);
    s = edit(s, (ctx) => {
      ctx.state.turn.player = 0;
      ctx.setPhase({ id: 'moveRobber', returnTo: 'main' });
    });
    const away = lib.legalActions(s, 0).find((a) => a.type === 'moveRobber')!;
    s = act(s, away);
    expect(hasStage(ctxOf(s), 0, 'lighthouse', 3)).toBe(true);
  });
});
