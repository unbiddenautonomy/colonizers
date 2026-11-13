import { describe, expect, it } from 'vitest';
import type { CornerId, Ctx, EdgeId, GameState, HexId } from '@colonizers/engine';
import { produce } from '@colonizers/module-base';
import { act, blank, ctxOf, edit, game, lib } from './helpers.ts';
import { closedLoop, wonderPoints, wonderSites, WONDER_IDS, WONDERS } from '../src/index.ts';

const nextTurn = (s: GameState) =>
  edit(s, (ctx) => {
    ctx.state.turn.number += 1;
  });

/** Settles `count` corners touching hexes that produce `card`, keeping the distance rule. */
function settleBy(ctx: Ctx, seat: number, card: string, count: number, type = 'settlement') {
  let placed = 0;
  for (const hex of Object.values(ctx.state.hexes)) {
    if (ctx.registry.hexTypes[hex.type]?.produces !== card && hex.type !== card) continue;
    for (const c of ctx.geometry.hexCorners.get(hex.id) ?? []) {
      if (placed >= count) return;
      if (ctx.buildingAt(c)) continue;
      if ((ctx.geometry.cornerNeighbours.get(c) ?? []).some((n) => ctx.buildingAt(n))) continue;
      ctx.place(type, seat, { kind: 'corner', id: c });
      placed++;
    }
  }
  if (placed < count) throw new Error(`Only ${placed} by ${card}`);
}

const pay = (s: GameState, seat: number, cards: Record<string, number>) =>
  edit(s, (ctx) => ctx.grant(seat, cards));

/** Builds every stage of a wonder for seat 0, a turn apart. */
function finish(s: GameState, id: (typeof WONDER_IDS)[number], hex: HexId): GameState {
  for (let i = 0; i < 4; i++) {
    s = pay(s, 0, WONDERS[id].stages[i]!.cost);
    s = act(s, { type: 'buildWonder', player: 0, wonder: id, ...(i ? {} : { hex }) });
    s = nextTurn(s);
  }
  return s;
}

describe('World Wonders', () => {
  it('has fourteen wonders, each worth 3 points when finished', () => {
    expect(WONDER_IDS).toHaveLength(14);
    for (const id of WONDER_IDS) expect(WONDERS[id].stages.reduce((n, st) => n + st.vp, 0)).toBe(3);
  });

  it('starts a wonder once its requirement is met, one stage a turn', () => {
    let s = blank();
    expect(wonderSites(ctxOf(s), 0, 'hangingGardens')).toEqual([]);
    expect(
      lib.legalActions(s, 0).some((a) => a.type === 'buildWonder' && a.wonder === 'hangingGardens'),
    ).toBe(false);
    s = edit(s, (ctx) => settleBy(ctx, 0, 'lumber', 4));
    const sites = wonderSites(ctxOf(s), 0, 'hangingGardens');
    expect(sites.length).toBeGreaterThan(0);
    for (const h of sites) expect(s.hexes[h]!.type).toBe('forest');
    const hex = sites[0]!;
    s = pay(s, 0, { grain: 1, lumber: 1, wool: 1, brick: 2, ore: 2 });
    s = act(s, { type: 'buildWonder', player: 0, wonder: 'hangingGardens', hex });
    expect(ctxOf(s).vp(0)).toBe(4);
    // Only one stage a turn.
    expect(lib.check(s, { type: 'buildWonder', player: 0, wonder: 'hangingGardens' })).toMatch(
      /this turn/,
    );
    s = nextTurn(s);
    s = act(s, { type: 'buildWonder', player: 0, wonder: 'hangingGardens' });
    expect(wonderPoints(ctxOf(s), 0)).toBe(1);
    // Nobody else can take it on.
    s = edit(s, (ctx) => {
      settleBy(ctx, 1, 'lumber', 4);
      ctx.state.turn.player = 1;
    });
    expect(lib.check(s, { type: 'buildWonder', player: 1, wonder: 'hangingGardens', hex })).toMatch(
      /owns/,
    );
  });

  it('stops while the robber stands on its hex', () => {
    let s = edit(blank(), (ctx) => settleBy(ctx, 0, 'lumber', 4));
    const hex = wonderSites(ctxOf(s), 0, 'hangingGardens')[0]!;
    s = pay(s, 0, { grain: 2, lumber: 2, wool: 2, brick: 2, ore: 2 });
    s = act(s, { type: 'buildWonder', player: 0, wonder: 'hangingGardens', hex });
    s = edit(nextTurn(s), (ctx) =>
      ctx.move(ctx.piecesOfType('robber')[0]!, { kind: 'hex', id: hex }),
    );
    expect(lib.check(s, { type: 'buildWonder', player: 0, wonder: 'hangingGardens' })).toMatch(
      /stands on/,
    );
  });

  it('needs a finished wonder to win, unless switched off', () => {
    let s = edit(blank('ww', { vpTarget: 3 }), (ctx) => settleBy(ctx, 0, 'lumber', 4));
    const hex = wonderSites(ctxOf(s), 0, 'hangingGardens')[0]!;
    // 4 points but no wonder: the game goes on.
    const trade = (st: GameState) =>
      act(pay(st, 0, { brick: 4 }), { type: 'bankTrade', player: 0, give: 'brick', get: 'ore' });
    s = trade(s);
    expect(s.winner).toBeNull();
    s = finish(s, 'hangingGardens', hex);
    expect(s.winner).toBe(0);

    let free = edit(blank('ww', { vpTarget: 3, wonderToWin: false }), (ctx) =>
      settleBy(ctx, 0, 'lumber', 4),
    );
    free = trade(free);
    expect(free.winner).toBe(0);
  });

  it('finds closed rings of roads', () => {
    let s = blank();
    const ctx = ctxOf(s);
    const inner = Object.values(s.hexes).find(
      (h) => (ctx.geometry.hexNeighbours.get(h.id) ?? []).length === 6,
    )!;
    const ringEdges = (hexes: HexId[]): EdgeId[] => {
      const count = new Map<EdgeId, number>();
      for (const h of hexes)
        for (const e of ctx.geometry.hexEdges.get(h) ?? []) count.set(e, (count.get(e) ?? 0) + 1);
      return [...count].filter(([, n]) => n === 1).map(([e]) => e);
    };
    s = edit(s, (c) => {
      for (const e of ringEdges([inner.id])) c.place('road', 0, { kind: 'edge', id: e });
    });
    expect(closedLoop(ctxOf(s), 0, 'land', 6)).toHaveLength(6);
    expect(wonderSites(ctxOf(s), 0, 'greatWall')).toEqual([]);
    const next = ctx.geometry.hexNeighbours.get(inner.id)![0]!;
    s = edit(blank(), (c) => {
      for (const e of ringEdges([inner.id, next])) c.place('road', 0, { kind: 'edge', id: e });
    });
    expect(closedLoop(ctxOf(s), 0, 'land', 9)).toHaveLength(10);
    expect(wonderSites(ctxOf(s), 0, 'greatWall')).toContain(inner.id);
  });

  it('Lighthouse and Colossus improve bank trades', () => {
    let s = blank();
    s = edit(s, (ctx) => {
      const d = ctx.data<Record<string, unknown>>('world-wonders');
      d.wonders = {
        lighthouse: { owner: 0, hex: 'x', stages: 3 },
        colossus: { owner: 0, hex: 'y', stages: 3 },
      };
      ctx.grant(0, { ore: 1, wool: 2 });
    });
    s = act(s, { type: 'bankTrade', player: 0, give: 'ore', get: 'grain' });
    s = act(s, { type: 'bankTrade', player: 0, give: 'wool', get: 'grain' });
    expect(s.players[0]!.hand).toMatchObject({ ore: 0, wool: 0, grain: 2 });
  });

  it('Petra echoes 2s on a 3, and swaps any number once a turn', () => {
    const petraGame = (seed: string) => {
      let two = '' as HexId;
      const st = edit(blank(seed), (ctx) => {
        const hex = Object.values(ctx.state.hexes).find((h) => h.token === 2)!;
        two = hex.id;
        ctx.place('city', 0, { kind: 'corner', id: ctx.geometry.hexCorners.get(hex.id)![0]! });
        ctx.data<Record<string, unknown>>('world-wonders').wonders = {
          petra: { owner: 0, hex: hex.id, stages: 1 },
        };
        for (const r of ctx.piecesOfType('robber')) ctx.remove(r);
        ctx.setPhase({ id: 'roll' });
      });
      return { st, two };
    };
    const total = (st: GameState) =>
      (st.data.base as { lastRoll?: { total: number } }).lastRoll?.total;
    let found = false;
    for (let i = 0; i < 300 && !found; i++) {
      const { st, two } = petraGame(`petra${i}`);
      const rolled = act(st, { type: 'roll', player: 0 });
      if (total(rolled) !== 3) continue;
      found = true;
      const card = ctxOf(st).registry.hexTypes[st.hexes[two]!.type]!.produces!;
      // The 2 produces as well as any 3 the city touches.
      const three = (
        ctxOf(st).geometry.cornerHexes.get(
          (ctxOf(st).piecesOfType('city')[0]!.at as { id: CornerId }).id,
        ) ?? []
      )
        .map((h) => st.hexes[h]!)
        .filter(
          (h) => h.token === 3 && ctxOf(st).registry.hexTypes[h.type]?.produces === card,
        ).length;
      expect((rolled.players[0]!.hand[card] ?? 0) - (st.players[0]!.hand[card] ?? 0)).toBe(
        2 + 2 * three,
      );
    }
    expect(found).toBe(true);

    let t = edit(blank(), (ctx) => {
      ctx.data<Record<string, unknown>>('world-wonders').wonders = {
        petra: { owner: 0, hex: 'x', stages: 3 },
      };
      ctx.grant(0, { wool: 3 });
    });
    t = act(t, {
      type: 'wonderTrade',
      player: 0,
      wonder: 'petra',
      give: 'wool',
      get: 'ore',
      count: 3,
    });
    expect(t.players[0]!.hand).toMatchObject({ wool: 0, ore: 3 });
    expect(
      lib.check(t, {
        type: 'wonderTrade',
        player: 0,
        wonder: 'petra',
        give: 'ore',
        get: 'wool',
        count: 1,
      }),
    ).toBe('Once a turn');
  });

  it('Pyramids III keep the robber from blocking you', () => {
    let s = blank();
    let hex = '' as HexId;
    s = edit(s, (ctx) => {
      const h = Object.values(ctx.state.hexes).find((x) => x.token === 6 || x.token === 8)!;
      hex = h.id;
      ctx.place('city', 0, { kind: 'corner', id: ctx.geometry.hexCorners.get(h.id)![0]! });
      ctx.move(ctx.piecesOfType('robber')[0]!, { kind: 'hex', id: h.id });
    });
    const roll = (st: GameState) => edit(st, (ctx) => produce(ctx, st.hexes[hex]!.token!));
    const count = (st: GameState) => Object.values(st.players[0]!.hand).reduce((a, b) => a + b, 0);
    expect(count(roll(s)) - count(s)).toBe(0);
    s = edit(s, (ctx) => {
      ctx.data<Record<string, unknown>>('world-wonders').wonders = {
        pyramids: { owner: 0, hex: 'x', stages: 3 },
      };
    });
    expect(count(roll(s)) - count(s)).toBe(2);
  });

  it('Hanging Gardens swap a lumber once a turn, and Chichen Itza makes a hex produce', () => {
    let s = edit(blank(), (ctx) => {
      ctx.data<Record<string, unknown>>('world-wonders').wonders = {
        hangingGardens: { owner: 0, hex: 'x', stages: 1 },
        chichenItza: { owner: 0, hex: 'y', stages: 3 },
      };
      ctx.grant(0, { lumber: 2, wool: 2 });
      for (const r of ctx.piecesOfType('robber')) ctx.remove(r);
    });
    s = act(s, {
      type: 'wonderTrade',
      player: 0,
      wonder: 'hangingGardens',
      give: 'lumber',
      get: 'ore',
    });
    expect(
      lib.check(s, {
        type: 'wonderTrade',
        player: 0,
        wonder: 'hangingGardens',
        give: 'lumber',
        get: 'ore',
      }),
    ).toBe('Once a turn');
    let hex = '' as HexId;
    let corner = '' as CornerId;
    s = edit(s, (ctx) => {
      const h = Object.values(ctx.state.hexes).find((x) => x.type === 'fields' && x.token)!;
      hex = h.id;
      corner = ctx.geometry.hexCorners.get(h.id)![0]!;
      ctx.place('settlement', 0, { kind: 'corner', id: corner });
    });
    const grain = s.players[0]!.hand.grain ?? 0;
    expect(lib.legalActions(s, 0).some((a) => a.type === 'wonderHarvest' && a.hex === hex)).toBe(
      true,
    );
    s = act(s, { type: 'wonderHarvest', player: 0, hex });
    expect((s.players[0]!.hand.grain ?? 0) - grain).toBe(1);
    expect(s.players[0]!.hand.wool ?? 0).toBe(0);
  });

  it('works alongside Cities & Knights', () => {
    const s = edit(game('ww', {}, true), (ctx) => {
      for (const p of Object.values(ctx.state.pieces)) if (p.owner !== null) ctx.remove(p);
      ctx.setPhase({ id: 'main' });
      for (const c of ctx.geometry.corners.slice(0, 1))
        ctx.place('knight3', 0, { kind: 'corner', id: c });
    });
    expect(wonderSites(ctxOf(s), 0, 'mausoleum')).toEqual([]);
    const two = edit(s, (ctx) => {
      const far = ctx.geometry.corners.find(
        (c) =>
          !ctx.piecesAt({ kind: 'corner', id: c }).length &&
          !(ctx.geometry.cornerNeighbours.get(c) ?? []).some(
            (n) => ctx.piecesAt({ kind: 'corner', id: n }).length,
          ),
      )!;
      ctx.place('knight3', 0, { kind: 'corner', id: far });
    });
    expect(wonderSites(ctxOf(two), 0, 'mausoleum').length).toBeGreaterThan(0);
  });
});
