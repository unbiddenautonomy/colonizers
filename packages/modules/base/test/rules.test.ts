import { describe, expect, it } from 'vitest';
import {
  buildGeometry,
  RuleError,
  type CornerId,
  type EdgeId,
  type HexId,
} from '@colonizers/engine';
import { baseData } from '../src/index.ts';
import {
  act,
  allResources,
  ctxOf,
  edgesFrom,
  edit,
  endOfPath,
  giveCards,
  landHexes,
  lib,
  newGame,
  quickSetup,
  rollTo,
} from './helpers.ts';

/** A land corner touching three land hexes, far from the given buildings. */
function innerCorner(state: ReturnType<typeof newGame>, avoid: CornerId[] = []): CornerId {
  const ctx = ctxOf(state);
  const c = ctx.geometry.corners.find(
    (corner) =>
      (ctx.geometry.cornerHexes.get(corner) ?? []).filter((h) => ctx.isLand(h)).length === 3 &&
      !ctx.buildingAt(corner) &&
      avoid.every(
        (a) => a !== corner && !(ctx.geometry.cornerNeighbours.get(a) ?? []).includes(corner),
      ),
  );
  if (!c) throw new Error('No inner corner');
  return c;
}

describe('board', () => {
  it('has 54 corners and 72 edges on the 19 land hexes', () => {
    const s = newGame();
    const ctx = ctxOf(s);
    expect(landHexes(s)).toHaveLength(19);
    expect(ctx.geometry.corners.filter((c) => ctx.isLandCorner(c))).toHaveLength(54);
    expect(ctx.geometry.edges.filter((e) => ctx.isLandEdge(e))).toHaveLength(72);
  });

  it('gives shared corners and edges one id from every side', () => {
    const g = buildGeometry(['h:0,0', 'h:1,0', 'h:0,1'] as HexId[]);
    // Three hexes meeting at a point share exactly one corner.
    const shared = g.corners.filter((c) => (g.cornerHexes.get(c) ?? []).length === 3);
    expect(shared).toHaveLength(1);
    // Two neighbours share exactly one edge.
    const e = g.edges.filter((x) => {
      const hs = g.edgeHexes.get(x) ?? [];
      return hs.includes('h:0,0') && hs.includes('h:1,0');
    });
    expect(e).toHaveLength(1);
    for (const c of g.corners) expect(g.cornerNeighbours.get(c)?.length).toBeLessThanOrEqual(3);
  });

  it('places tokens on every land hex except the desert, with the robber on the desert', () => {
    const s = newGame();
    const land = Object.values(s.hexes).filter((h) => h.type !== 'sea');
    for (const h of land) {
      if (h.type === 'desert') expect(h.token).toBeUndefined();
      else expect(h.token).toBeGreaterThan(1);
    }
    const desert = land.find((h) => h.type === 'desert');
    const r = Object.values(s.pieces).find((p) => p.type === 'robber');
    expect(r?.at).toEqual({ kind: 'hex', id: desert?.id });
    expect(s.harbors).toHaveLength(9);
  });
});

describe('setup', () => {
  it('goes in snake order and pays for the second settlement only', () => {
    let s = newGame('setup', 3);
    const order: number[] = [];
    while (s.phase.id === 'setup') {
      if ((s.phase as { step: string }).step === 'settlement') order.push(s.turn.player);
      const [a] = lib.legalActions(s, s.turn.player);
      s = act(s, a!);
    }
    expect(order).toEqual([0, 1, 2, 2, 1, 0]);
    expect(s.phase.id).toBe('roll');
    expect(s.turn.player).toBe(0);
    const ctx = ctxOf(s);
    for (const p of s.players) {
      const second = ctx.piecesOf(p.seat, 'settlement')[1]!;
      const producing = (
        ctx.geometry.cornerHexes.get((second.at as { id: CornerId }).id) ?? []
      ).filter((h) => ctx.registry.hexTypes[s.hexes[h]!.type]?.produces);
      expect(ctx.handSize(p.seat)).toBe(producing.length);
    }
  });

  it('enforces the distance rule', () => {
    let s = newGame();
    const corner = innerCorner(s);
    s = act(s, { type: 'placeSetupSettlement', player: 0, corner });
    const edge = ctxOf(s).geometry.cornerEdges.get(corner)![0]!;
    s = act(s, { type: 'placeSetupRoad', player: 0, edge });
    const neighbour = ctxOf(s).geometry.cornerNeighbours.get(corner)![0]!;
    expect(lib.check(s, { type: 'placeSetupSettlement', player: 1, corner: neighbour })).toMatch(
      /Too close/,
    );
    expect(lib.check(s, { type: 'placeSetupSettlement', player: 1, corner })).toMatch(/taken/);
  });

  it('rejects actions out of turn and leaves state untouched', () => {
    const s = newGame();
    const corner = innerCorner(s);
    const before = structuredClone(s);
    expect(() => act(s, { type: 'placeSetupSettlement', player: 2, corner })).toThrow(RuleError);
    expect(s).toEqual(before);
  });
});

describe('turns, production and the robber', () => {
  it('pays 1 per settlement and 2 per city, and nothing under the robber', () => {
    let s = quickSetup(newGame('prod'));
    const ctx = ctxOf(s);
    const hex = Object.values(s.hexes).find((h) => h.token === 8)!;
    const corner = ctx.geometry.hexCorners
      .get(hex.id)!
      .find(
        (c) =>
          !ctx.buildingAt(c) &&
          ctx.geometry.cornerNeighbours.get(c)!.every((n) => !ctx.buildingAt(n)),
      )!;
    s = edit(s, (c) => {
      c.place('city', 1, { kind: 'corner', id: corner });
      for (const p of c.state.players)
        for (const k of Object.keys(p.hand)) c.pay(p.seat, { [k]: p.hand[k]! });
    });
    const res = ctxOf(s).registry.hexTypes[hex.type]!.produces!;
    const { state: after } = rollTo(s, 8);
    expect(after.players[1]!.hand[res]).toBeGreaterThanOrEqual(2);

    // With only that city on the board, the robber on the hex stops it paying.
    const lone = edit(s, (c) => {
      for (const p of Object.values(c.state.pieces))
        if (p.type !== 'robber' && p.at.kind === 'corner' && p.at.id !== corner) c.remove(p);
      c.move(c.piecesOfType('robber')[0]!, { kind: 'hex', id: hex.id });
    });
    const { state: after2 } = rollTo(lone, 8);
    expect(after2.players[1]!.hand[res] ?? 0).toBe(0);
  });

  it('applies the bank shortage rule', () => {
    let s = quickSetup(newGame('short'));
    const hex = Object.values(s.hexes).find((h) => h.token === 6)!;
    const res = ctxOf(s).registry.hexTypes[hex.type]!.produces!;
    const corners = ctxOf(s).geometry.hexCorners.get(hex.id)!;
    s = edit(s, (c) => {
      for (const p of Object.values(c.state.pieces)) if (p.type !== 'robber') c.remove(p);
      c.place('city', 0, { kind: 'corner', id: corners[0]! });
      c.place('city', 1, { kind: 'corner', id: corners[2]! });
      for (const p of c.state.players)
        for (const k of Object.keys(p.hand)) c.pay(p.seat, { [k]: p.hand[k]! });
      // Leave only 3 in the bank: 4 are owed to two players.
      c.grant(2, { [res]: c.state.bank[res]! - 3 });
    });
    const { state: after, events } = rollTo(s, 6);
    expect(after.players[0]!.hand[res] ?? 0).toBe(0);
    expect(after.players[1]!.hand[res] ?? 0).toBe(0);
    expect(events.find((e) => e.type === 'production')).toMatchObject({ shortages: [res] });
  });

  it('on a 7, big hands discard half and the roller moves the robber and steals', () => {
    let s = quickSetup(newGame('seven'));
    s = giveCards(s, 1, { brick: 4, lumber: 5 });
    const size1 = ctxOf(s).handSize(1);
    let { state } = rollTo(s, 7);
    // The discard box tells the player what caused it.
    expect(state.phase).toMatchObject({ id: 'discard', why: 'seven' });
    const owed = (state.phase as unknown as { owed: Record<number, number> }).owed;
    expect(owed[1]).toBe(Math.floor(size1 / 2));
    expect(lib.check(state, { type: 'moveRobber', player: 0, hex: landHexes(state)[0]! })).toMatch(
      /during discard/,
    );
    for (const seat of Object.keys(owed).map(Number)) {
      const [d] = lib.legalActions(state, seat).filter((a) => a.type === 'discard');
      state = act(state, d!);
    }
    expect(state.phase.id).toBe('moveRobber');
    const ctx = ctxOf(state);
    const target = landHexes(state).find((h) =>
      ctx.geometry.hexCorners.get(h)!.some((c) => {
        const b = ctx.buildingAt(c);
        return b && b.owner !== 0 && ctx.handSize(b.owner!) > 0;
      }),
    )!;
    const before = ctxOf(state).handSize(0, false);
    state = act(state, { type: 'moveRobber', player: 0, hex: target });
    if (state.phase.id === 'steal') {
      const [st] = lib.legalActions(state, 0);
      state = act(state, st!);
    }
    expect(state.phase.id).toBe('main');
    expect(ctxOf(state).handSize(0, false)).toBe(before + 1);
    expect(lib.check(state, { type: 'moveRobber', player: 0, hex: target })).not.toBeNull();
  });
});

describe('building', () => {
  it('needs connected roads and enough cards, and blocks roads through opponents', () => {
    let s = quickSetup(newGame('build'));
    const ctx = ctxOf(s);
    const start = (ctx.piecesOf(0, 'settlement')[0]!.at as { id: CornerId }).id;
    const far = ctx.geometry.edges.find(
      (e) =>
        ctx.isLandEdge(e) &&
        ctx.geometry.edgeCorners
          .get(e)!
          .every(
            (c) =>
              !ctx.buildingAt(c) &&
              !ctx.geometry.cornerEdges
                .get(c)!
                .some((x) => ctx.piecesAt({ kind: 'edge', id: x }).length),
          ),
    )!;
    s = edit(s, (c) => c.setPhase({ id: 'main' }));
    expect(lib.check(s, { type: 'buildRoad', player: 0, edge: far })).toMatch(/afford/);
    s = giveCards(s, 0, allResources(5));
    expect(lib.check(s, { type: 'buildRoad', player: 0, edge: far })).toMatch(/connect/);
    void start;

    // An opponent settlement in the middle of a corner stops a road through it.
    const fresh = edit(newGame('block'), (c) => {
      c.state.turn = { number: 1, player: 0, round: 0 };
      c.setPhase({ id: 'main' });
    });
    const a = innerCorner(fresh);
    const [e1, e2] = edgesFrom(fresh, a, 2) as [EdgeId, EdgeId];
    const mid = endOfPath(fresh, a, [e1]);
    let t = edit(fresh, (c) => {
      c.place('settlement', 0, { kind: 'corner', id: a });
      c.place('road', 0, { kind: 'edge', id: e1 });
      c.place('settlement', 1, { kind: 'corner', id: mid });
    });
    t = giveCards(t, 0, allResources(5));
    expect(lib.check(t, { type: 'buildRoad', player: 0, edge: e2 })).toMatch(/connect/);
  });

  it('builds a settlement, upgrades it to a city, and counts VP', () => {
    let s = quickSetup(newGame('city'));
    s = edit(s, (c) => c.setPhase({ id: 'main' }));
    s = giveCards(s, 0, { grain: 2, ore: 3 });
    const corner = (ctxOf(s).piecesOf(0, 'settlement')[0]!.at as { id: CornerId }).id;
    const vpBefore = ctxOf(s).vp(0);
    s = act(s, { type: 'buildCity', player: 0, corner });
    expect(ctxOf(s).buildingAt(corner)?.type).toBe('city');
    expect(ctxOf(s).vp(0)).toBe(vpBefore + 1);
    expect(ctxOf(s).supplyLeft(0, 'settlement')).toBe(4);
  });
});

describe('development cards', () => {
  it('can not be played the turn they are bought, and only one per turn', () => {
    let s = quickSetup(newGame('dev'));
    s = edit(s, (c) => {
      c.setPhase({ id: 'main' });
      // Put two knights and a monopoly on top, keeping the deck's contents the same.
      const deck = [...c.state.decks.dev!];
      const top: string[] = [];
      for (const card of ['knight', 'knight', 'monopoly'])
        top.push(...deck.splice(deck.indexOf(card), 1));
      c.state.decks.dev = [...top, ...deck];
    });
    s = giveCards(s, 0, allResources(4));
    s = act(s, { type: 'buyDevCard', player: 0 });
    expect(lib.check(s, { type: 'playDevCard', player: 0, card: 'knight' })).toMatch(/no playable/);
    s = act(s, { type: 'buyDevCard', player: 0 });
    s = act(s, { type: 'buyDevCard', player: 0 });
    s = act(s, { type: 'endTurn', player: 0 });
    // Fast-forward to player 0's next turn.
    s = edit(s, (c) => {
      c.state.turn.player = 0;
      c.state.turn.number += 1;
      c.setPhase({ id: 'roll' });
    });
    // A knight may be played before rolling, but nothing else.
    expect(
      lib.check(s, { type: 'playDevCard', player: 0, card: 'monopoly', resource: 'ore' }),
    ).toMatch(/before rolling/);
    s = act(s, { type: 'playDevCard', player: 0, card: 'knight' });
    expect(s.phase).toMatchObject({ id: 'moveRobber', returnTo: 'roll' });
    const [mv] = lib.legalActions(s, 0);
    s = act(s, mv!);
    if (s.phase.id === 'steal') s = act(s, lib.legalActions(s, 0)[0]!);
    expect(s.phase.id).toBe('roll');
    s = edit(s, (c) => c.setPhase({ id: 'main' }));
    expect(lib.check(s, { type: 'playDevCard', player: 0, card: 'knight' })).toMatch(
      /already played/,
    );
  });

  it('gives Largest Army at 3 knights and only takes it with strictly more', () => {
    let s = quickSetup(newGame('army'));
    s = edit(s, (c) => {
      c.player(1).played.knight = 3;
      c.data<Record<string, unknown>>('base').largestArmy = 1;
      c.player(0).held.dev = [{ card: 'knight', acquiredTurn: 0 }];
      c.player(0).played.knight = 2;
      // Keep card totals right for the invariant checks elsewhere.
      c.state.decks.dev = c.state.decks.dev!.slice(6);
      c.setPhase({ id: 'main' });
    });
    s = act(s, { type: 'playDevCard', player: 0, card: 'knight' });
    expect(baseData(ctxOf(s)).largestArmy).toBe(1);
    s = edit(s, (c) => {
      c.player(0).played.knight = 3;
      c.player(0).held.dev = [{ card: 'knight', acquiredTurn: 0 }];
      c.player(0).data.devPlayedTurn = -1;
      c.setPhase({ id: 'main' });
    });
    s = act(s, { type: 'playDevCard', player: 0, card: 'knight' });
    expect(baseData(ctxOf(s)).largestArmy).toBe(0);
  });

  it('Monopoly takes every card of one resource from everyone', () => {
    let s = quickSetup(newGame('mono'));
    s = edit(s, (c) => {
      c.player(0).held.dev = [{ card: 'monopoly', acquiredTurn: 0 }];
      c.state.decks.dev = c.state.decks.dev!.slice(1);
      c.setPhase({ id: 'main' });
    });
    s = giveCards(s, 1, { ore: 3 });
    s = giveCards(s, 2, { ore: 2 });
    const mine = s.players[0]!.hand.ore ?? 0;
    const others =
      (s.players[1]!.hand.ore ?? 0) + (s.players[2]!.hand.ore ?? 0) + (s.players[3]!.hand.ore ?? 0);
    s = act(s, { type: 'playDevCard', player: 0, card: 'monopoly', resource: 'ore' });
    expect(s.players[0]!.hand.ore).toBe(mine + others);
    expect(s.players[1]!.hand.ore ?? 0).toBe(0);
  });
});

describe('Longest Road', () => {
  it('needs 5 segments, and a broken tie sets the card aside', () => {
    const base = edit(newGame('lr'), (c) => {
      c.state.turn = { number: 1, player: 0, round: 0 };
      c.setPhase({ id: 'main' });
    });
    const a = innerCorner(base);
    const path = edgesFrom(base, a, 6);
    let s = edit(base, (c) => {
      c.place('settlement', 0, { kind: 'corner', id: a });
      path.slice(0, 4).forEach((e) => c.place('road', 0, { kind: 'edge', id: e }));
    });
    s = giveCards(s, 0, allResources(5));
    s = act(s, { type: 'buildRoad', player: 0, edge: path[4]! });
    expect(baseData(ctxOf(s)).longestRoad).toBe(0);
    expect(ctxOf(s).longestRoute(0)).toBe(5);

    // An opponent settlement in the middle breaks it to 2 + 3, below 5.
    const mid = endOfPath(s, a, path.slice(0, 2));
    s = edit(s, (c) => c.place('settlement', 1, { kind: 'corner', id: mid }));
    expect(ctxOf(s).longestRoute(0)).toBe(3);
    s = act(s, { type: 'bankTrade', player: 0, give: 'ore', get: 'brick' });
    expect(baseData(ctxOf(s)).longestRoad).toBeNull();
  });
});

describe('trading', () => {
  it('uses harbor ratios for bank trades', () => {
    let s = quickSetup(newGame('harbor'));
    s = edit(s, (c) => {
      c.setPhase({ id: 'main' });
      c.state.harbors = [
        {
          edge: c.geometry.cornerEdges.get(
            (c.piecesOf(0, 'settlement')[0]!.at as { id: CornerId }).id,
          )![0]!,
          resource: 'wool',
          ratio: 2,
        },
      ];
    });
    s = giveCards(s, 0, { wool: 2, ore: 3 });
    expect(lib.check(s, { type: 'bankTrade', player: 0, give: 'ore', get: 'grain' })).toMatch(
      /need 4/,
    );
    const wool = s.players[0]!.hand.wool!;
    s = act(s, { type: 'bankTrade', player: 0, give: 'wool', get: 'grain' });
    expect(s.players[0]!.hand.wool).toBe(wool - 2);
  });

  it('runs offer, accept and confirm between players', () => {
    let s = quickSetup(newGame('trade'));
    s = edit(s, (c) => {
      c.setPhase({ id: 'main' });
      for (const p of c.state.players)
        for (const k of Object.keys(p.hand)) c.pay(p.seat, { [k]: p.hand[k]! });
    });
    s = giveCards(s, 0, { brick: 2 });
    s = giveCards(s, 2, { ore: 1 });
    s = act(s, { type: 'offerTrade', player: 0, give: { brick: 2 }, get: { ore: 1 } });
    const offer = (baseData(ctxOf(s)).trade as { id: number }).id;
    expect(lib.check(s, { type: 'respondTrade', player: 1, offer, accept: true })).toMatch(
      /do not have/,
    );
    s = act(s, { type: 'respondTrade', player: 2, offer, accept: true });
    expect(lib.check(s, { type: 'confirmTrade', player: 0, offer, with: 1 })).toMatch(
      /not accepted/,
    );
    s = act(s, { type: 'confirmTrade', player: 0, offer, with: 2 });
    expect(s.players[0]!.hand).toMatchObject({ brick: 0, ore: 1 });
    expect(s.players[2]!.hand).toMatchObject({ brick: 2, ore: 0 });
    expect(baseData(ctxOf(s)).trade).toBeNull();
  });
});

describe('winning and hidden information', () => {
  it('wins only on your own turn', () => {
    let s = quickSetup(newGame('win'));
    s = edit(s, (c) => {
      c.setPhase({ id: 'main' });
      c.player(1).held.dev = Array.from({ length: 8 }, () => ({
        card: 'victoryPoint',
        acquiredTurn: 0,
      }));
      c.state.decks.dev = c.state.decks.dev!.slice(8);
    });
    expect(s.winner).toBeNull();
    s = act(s, { type: 'endTurn', player: 0 });
    // Player 1 now has 10 VP and wins as soon as anything happens on their turn.
    expect(s.winner).toBe(1);
    expect(s.phase.id).toBe('gameOver');
  });

  it('hides other hands, development cards and deck order in player views', () => {
    let s = quickSetup(newGame('view'));
    s = edit(s, (c) => {
      c.player(1).held.dev = [{ card: 'victoryPoint', acquiredTurn: 0 }];
      c.state.decks.dev = c.state.decks.dev!.slice(1);
    });
    const v = lib.view(s, 0);
    expect(v.players[1]!.hand).toEqual({});
    expect(v.players[1]!.held).toEqual({});
    expect(v.players[1]!.heldCount).toEqual({ dev: 1 });
    expect(v.players[1]!.handCount).toBe(ctxOf(s).handSize(1, false));
    expect(v.players[0]!.hand).toEqual(s.players[0]!.hand);
    expect(v.decks.dev).toBe(s.decks.dev!.length);
    expect('rng' in v && (v as { rng?: unknown }).rng).toBeFalsy();

    const events = [
      {
        type: 'stole',
        thief: 0,
        victim: 1,
        card: 'ore',
        visibleTo: [0, 1],
        redacted: { thief: 0, victim: 1 },
      },
    ];
    expect(lib.viewEvents(events, 2)).toEqual([{ type: 'stole', thief: 0, victim: 1 }]);
    expect(lib.viewEvents(events, 0)).toEqual([
      { type: 'stole', thief: 0, victim: 1, card: 'ore' },
    ]);
  });
});
