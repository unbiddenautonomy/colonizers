import { describe, expect, it } from 'vitest';
import {
  Ctx,
  ModuleLibrary,
  Rng,
  stateFromView,
  type Action,
  type CornerId,
  type EdgeId,
  type GameState,
} from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { variantsModule, harbormasterOf } from '@colonizers/module-variants';
import { generateTbBoard, TB_SCENARIOS } from '@colonizers/maps';
import { chooseAction, newMemory, type BotConfig, type BotMemory } from '@colonizers/bots';
import {
  fishPayment,
  fishTotal,
  goldOf,
  goldStanding,
  riverEdges,
  tbData,
  tradersBarbariansModule,
} from '../src/index.ts';

const lib = new ModuleLibrary([baseModule, tradersBarbariansModule, variantsModule]);

function rng(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function game(
  scenario: string,
  players = 4,
  seed = 'tb',
  extra: Record<string, unknown> = {},
): GameState {
  const b = generateTbBoard({ seed, players, scenario });
  return lib.createGame({
    seed,
    players: Array.from({ length: players }, (_, i) => `P${i}`),
    modules: [...b.modules, 'variants'],
    map: b.map,
    settings: { vpTarget: 10, ...b.settings, ...extra },
    fixedSeats: true,
  }).state;
}

const ctxOf = (s: GameState) => new Ctx(s, lib.registry(s.modules));

function edit(s: GameState, fn: (c: Ctx) => void): GameState {
  const t = structuredClone(s);
  const c = ctxOf(t);
  fn(c);
  c.commit();
  return t;
}

function act(s: GameState, a: Action): GameState {
  return lib.apply(s, a).state;
}

const WEIGHTS: Record<string, number> = {
  buildCity: 60,
  buildSettlement: 50,
  buildBridge: 20,
  buyDevCard: 12,
  buildRoad: 8,
  placeFreeRoad: 10,
  spendFish: 2,
  buyWithGold: 6,
  passBoot: 3,
  playDevCard: 4,
  bankTrade: 2,
  offerTrade: 0.2,
  respondTrade: 2,
  cancelTrade: 1,
  endTurn: 1,
};

function pick(options: Action[], rand: () => number): Action {
  const w = options.map((a) => WEIGHTS[a.type] ?? 1);
  let r = rand() * w.reduce((s, x) => s + x, 0);
  for (let i = 0; i < options.length; i++) {
    r -= w[i]!;
    if (r <= 0) return options[i]!;
  }
  return options[options.length - 1]!;
}

function finishSetup(s: GameState, seed = 1): GameState {
  const rand = rng(seed);
  while (s.phase.id === 'setup') {
    const seat = lib.waitingOn(s)[0]!;
    const o = lib.legalActions(s, seat);
    s = act(s, o[Math.floor(rand() * o.length)]!);
  }
  return s;
}

function simulate(s: GameState, seed: number, max = 8000) {
  const rand = rng(seed);
  const seen = new Set<string>();
  for (let i = 0; i < max && s.winner === null; i++) {
    const waiting = lib.waitingOn(s);
    if (!waiting.length) throw new Error(`Nobody can act in ${JSON.stringify(s.phase)}`);
    const seat = waiting[Math.floor(rand() * waiting.length)]!;
    const options = lib.legalActions(s, seat);
    if (i % 7 === 0) {
      const key = (a: Action) => JSON.stringify(a, Object.keys(a).sort());
      const fromView = lib
        .legalActions(stateFromView(lib.view(s, seat)), seat)
        .filter((a) => a.type !== 'confirmTrade')
        .map(key)
        .sort();
      const real = options
        .filter((a) => a.type !== 'confirmTrade')
        .map(key)
        .sort();
      expect(fromView).toEqual(real);
    }
    const a = pick(options, rand);
    seen.add(a.type === 'spendFish' ? `fish:${a.use as string}` : a.type);
    s = act(s, a);
    const d = tbData(ctxOf(s));
    for (const t of Object.values(d.fish)) expect(t.length).toBeLessThanOrEqual(7);
  }
  return { state: s, seen };
}

function botGame(s: GameState, players: number, seed: number, max = 6000): GameState {
  const bot: BotConfig = { level: 'medium', style: 'balanced' };
  const rand = rng(seed);
  const memory: BotMemory[] = Array.from({ length: players }, () => newMemory());
  let clock = 0;
  for (let i = 0; i < max && s.winner === null; i++) {
    clock += 1000;
    const waiting = lib.waitingOn(s);
    if (!waiting.length) throw new Error(`Nobody can act in ${s.phase.id}`);
    let acted = false;
    for (const seat of waiting) {
      const a = chooseAction(lib, s, seat, bot, memory[seat]!, { rand, now: clock, budgetMs: 200 });
      if (!a) continue;
      s = act(s, a);
      acted = true;
      break;
    }
    if (!acted) clock += 20_000;
  }
  return s;
}

describe('Traders & Barbarians boards', () => {
  for (const players of [3, 4, 6]) {
    it(`Fishermen for ${players}: fishing grounds on the coast and a lake for the desert`, () => {
      const s = game('fishermen', players);
      const c = ctxOf(s);
      const shoals = Object.values(s.hexes).filter((h) => h.type === 'shoal');
      expect(shoals.length).toBe(players >= 5 ? 8 : 6);
      for (const h of shoals) {
        expect(h.token).toBeGreaterThan(0);
        const landNext = (c.geometry.hexNeighbours.get(h.id) ?? []).filter((n) => c.isLand(n));
        expect(landNext.length).toBeGreaterThan(0);
      }
      const lakes = Object.values(s.hexes).filter((h) => h.type === 'fishingLake');
      expect(lakes.length).toBeGreaterThan(0);
      expect(lakes.flatMap((h) => h.props?.tokens as number[]).sort()).toEqual(
        expect.arrayContaining([2, 12]),
      );
      expect(Object.values(s.hexes).some((h) => h.type === 'desert')).toBe(false);
      expect(c.piecesOfType('robber')).toHaveLength(0);
      expect(tbData(c).pile).toHaveLength(30);
    });

    it(`Rivers for ${players}: rivers run inland from the coast`, () => {
      const s = game('rivers', players);
      const c = ctxOf(s);
      const edges = [...riverEdges(c)];
      expect(edges.length).toBe(players >= 5 ? 14 : 9);
      for (const e of edges)
        expect((c.geometry.edgeHexes.get(e) ?? []).every((h) => c.isLand(h))).toBe(true);
      expect(Object.values(s.hexes).filter((h) => h.type === 'swamp').length).toBeGreaterThan(1);
    });
  }
});

describe('Traders & Barbarians random games', () => {
  for (const scenario of TB_SCENARIOS) {
    it(`${scenario.name}: random games finish, and moves match what players can see`, () => {
      let finished = 0;
      const seen = new Set<string>();
      for (let g = 0; g < 3; g++) {
        const r = simulate(game(scenario.id, 4, `rand-${g}`), g + 1);
        r.seen.forEach((x) => seen.add(x));
        if (r.state.winner !== null) finished++;
      }
      expect(finished).toBeGreaterThanOrEqual(2);
      if (scenario.id === 'fishermen')
        for (const t of ['fish:bank', 'fish:robber', 'fish:road']) expect(seen).toContain(t);
      else for (const t of ['buildBridge', 'buyWithGold']) expect(seen).toContain(t);
    }, 120_000);

    it(`${scenario.name}: bots finish a game`, () => {
      const s = botGame(game(scenario.id, 4, 'bots'), 4, 3);
      expect(s.winner).not.toBeNull();
    }, 120_000);
  }

  it('a 6-player Rivers game with the Special Building Phase finishes', () => {
    const r = simulate(game('rivers', 6, 'sbp', { turnMode: 'specialBuild' }), 4, 12000);
    expect(r.state.winner).not.toBeNull();
  }, 120_000);
});

describe('Fishermen', () => {
  it('pays for favours with the fewest fish that cover the cost', () => {
    expect(fishPayment([3, 1, 2], 2)).toEqual([2]);
    expect(fishPayment([3, 3], 4)).toEqual([0, 1]);
    expect(fishPayment([1, 1], 3)).toBeNull();
    expect(fishPayment([1, 3, 1, 1], 3)).toEqual([1]);
  });

  it('catches fish when a fishing ground rolls, and spends them', () => {
    let s = finishSetup(game('fishermen'));
    const shoal = Object.values(s.hexes).find((h) => h.type === 'shoal')!;
    const seat = s.turn.player;
    s = edit(s, (c) => {
      const corner = c.geometry.hexCorners
        .get(shoal.id)!
        .find((x) => c.isLandCorner(x) && !c.buildingAt(x))!;
      for (const n of c.geometry.cornerNeighbours.get(corner) ?? []) {
        const b = c.buildingAt(n);
        if (b) c.remove(b);
      }
      c.place('city', seat, { kind: 'corner', id: corner });
      tbData(c).fish[seat] = [];
      tbData(c).pile = [2, 1, 3, 3];
    });
    // Find a seed whose roll matches the shoal.
    let rolled: GameState | null = null;
    for (let k = 0; k < 400 && !rolled; k++) {
      const t = structuredClone(s);
      t.rng = Rng.fromSeed(`roll${k}`).getState();
      const r = act(t, { type: 'roll', player: seat });
      const last = (r.data.base as { lastRoll: { total: number } }).lastRoll.total;
      if (last === shoal.token) rolled = r;
    }
    expect(rolled).not.toBeNull();
    s = rolled!;
    expect(tbData(ctxOf(s)).fish[seat]).toEqual([3, 3]);
    s = act(s, { type: 'spendFish', player: seat, use: 'bank', resource: 'ore' });
    expect(fishTotal(ctxOf(s), seat)).toBe(0);
    expect(s.players[seat]!.hand.ore).toBeGreaterThanOrEqual(1);
  });

  it('the old boot costs a point and can go to someone with as many points', () => {
    let s = finishSetup(game('fishermen'));
    const seat = s.turn.player;
    const other = (seat + 1) % 4;
    s = edit(s, (c) => {
      tbData(c).boot = seat;
      c.setPhase({ id: 'main' });
    });
    const before = ctxOf(s).vp(seat);
    expect(before).toBe(1);
    expect(lib.legalActions(s, seat).filter((a) => a.type === 'passBoot')).toHaveLength(3);
    s = act(s, { type: 'passBoot', player: seat, to: other });
    expect(tbData(ctxOf(s)).boot).toBe(other);
    expect(ctxOf(s).vp(seat)).toBe(2);
  });

  it('two fish take the robber off the board', () => {
    let s = finishSetup(game('fishermen'));
    const seat = s.turn.player;
    s = edit(s, (c) => {
      const land = Object.values(c.state.hexes).find((h) => h.type === 'forest')!;
      c.place('robber', null, { kind: 'hex', id: land.id });
      tbData(c).fish[seat] = [2];
    });
    s = act(s, { type: 'spendFish', player: seat, use: 'robber' });
    expect(ctxOf(s).piecesOfType('robber')).toHaveLength(0);
    expect(lib.legalActions(s, seat).some((a) => a.use === 'robber')).toBe(false);
  });

  it('hides fish token values from other players', () => {
    let s = finishSetup(game('fishermen'));
    s = edit(s, (c) => {
      tbData(c).fish[0] = [3, 2];
    });
    const v = lib.view(s, 1);
    const d = v.data['traders-barbarians'] as { fish: Record<number, number[]> };
    expect(d.fish[0]).toEqual([0, 0]);
    expect((lib.view(s, 0).data['traders-barbarians'] as typeof d).fish[0]).toEqual([3, 2]);
  });
});

describe('Rivers', () => {
  function riverSetup() {
    const s = finishSetup(game('rivers'));
    const c = ctxOf(s);
    const edge = [...riverEdges(c)][0]!;
    return { s, edge };
  }

  it('ordinary roads can not cross a river; bridges can, and pay 3 gold', () => {
    const setup = riverSetup();
    const edge = setup.edge;
    let s = setup.s;
    const seat = s.turn.player;
    const [a] = ctxOf(s).geometry.edgeCorners.get(edge)! as [CornerId, CornerId];
    s = edit(s, (c) => {
      for (const n of [a, ...(c.geometry.cornerNeighbours.get(a) ?? [])]) {
        const b = c.buildingAt(n);
        if (b) c.remove(b);
      }
      c.place('settlement', seat, { kind: 'corner', id: a });
      c.player(seat).hand = { brick: 3, lumber: 2 };
      c.setPhase({ id: 'main' });
    });
    const gold = goldOf(ctxOf(s), seat);
    expect(lib.check(s, { type: 'buildRoad', player: seat, edge })).toBeTruthy();
    s = act(s, { type: 'buildBridge', player: seat, edge });
    expect(goldOf(ctxOf(s), seat)).toBe(gold + 3);
    expect(ctxOf(s).longestRoute(seat)).toBeGreaterThanOrEqual(1);
    expect(s.players[seat]!.hand).toMatchObject({ brick: 1, lumber: 1 });
  });

  it('gold buys resources twice a turn; richest gets a point, poorest lose two', () => {
    let { s } = riverSetup();
    const seat = s.turn.player;
    s = edit(s, (c) => {
      const d = tbData(c);
      for (const p of c.state.players) d.gold[p.seat] = 1;
      d.gold[seat] = 8;
      d.gold[(seat + 1) % 4] = 0;
      c.setPhase({ id: 'main' });
    });
    const c0 = ctxOf(s);
    expect(goldStanding(c0)).toEqual({ richest: seat, poorest: [(seat + 1) % 4] });
    const vp = c0.vp(seat);
    s = act(s, { type: 'buyWithGold', player: seat, resource: 'ore' });
    s = act(s, { type: 'buyWithGold', player: seat, resource: 'ore' });
    expect(lib.check(s, { type: 'buyWithGold', player: seat, resource: 'ore' })).toMatch(/2 times/);
    expect(goldOf(ctxOf(s), seat)).toBe(4);
    expect(ctxOf(s).vp(seat)).toBe(vp);
  });

  it('a road along the river pays 1 gold', () => {
    const setup = riverSetup();
    const edge = setup.edge;
    let s = setup.s;
    const seat = s.turn.player;
    const c = ctxOf(s);
    const [a] = c.geometry.edgeCorners.get(edge)! as [CornerId, CornerId];
    const side = (c.geometry.cornerEdges.get(a) ?? []).find(
      (e) => !riverEdges(c).has(e) && c.isLandEdge(e),
    ) as EdgeId;
    s = edit(s, (x) => {
      for (const n of [a, ...(x.geometry.cornerNeighbours.get(a) ?? [])]) {
        const b = x.buildingAt(n);
        if (b) x.remove(b);
      }
      for (const p of x.piecesAt({ kind: 'edge', id: side })) x.remove(p);
      x.place('settlement', seat, { kind: 'corner', id: a });
      x.player(seat).hand = { brick: 1, lumber: 1 };
      x.setPhase({ id: 'main' });
    });
    const gold = goldOf(ctxOf(s), seat);
    s = act(s, { type: 'buildRoad', player: seat, edge: side });
    expect(goldOf(ctxOf(s), seat)).toBe(gold + 1);
  });
});

describe('Harbormaster', () => {
  it('goes to the first player with 3 points on harbors, worth 2 points', () => {
    let s = finishSetup(game('rivers', 4, 'hm', { harbormaster: true }));
    const seat = s.turn.player;
    s = edit(s, (c) => {
      const corners = c.state.harbors.map((h) => c.geometry.edgeCorners.get(h.edge)![0]);
      for (const b of Object.values(c.state.pieces))
        if (b.type === 'settlement' || b.type === 'city') c.remove(b);
      c.place('city', seat, { kind: 'corner', id: corners[0]! });
      c.place('settlement', seat, { kind: 'corner', id: corners[2]! });
      c.setPhase({ id: 'main' });
    });
    const before = ctxOf(s).vp(seat);
    s = act(s, { type: 'endTurn', player: seat });
    expect(harbormasterOf(ctxOf(s))).toBe(seat);
    expect(ctxOf(s).vp(seat)).toBe(before + 2);
  });
});
