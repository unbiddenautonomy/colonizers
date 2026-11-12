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
import { baseModule, produce } from '@colonizers/module-base';
import { variantsModule, harbormasterOf } from '@colonizers/module-variants';
import { generateTbBoard, TB_SCENARIOS } from '@colonizers/maps';
import { chooseAction, newMemory, type BotConfig, type BotMemory } from '@colonizers/bots';
import {
  barbariansOn,
  castleHex,
  coastalHexes,
  camelEdges,
  camelOptions,
  knightMoves,
  knightStartEdges,
  prisonersOf,
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
  moveTbKnight: 0.3,
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
      else if (scenario.id === 'rivers')
        for (const t of ['buildBridge', 'buyWithGold']) expect(seen).toContain(t);
      else if (scenario.id === 'caravans') expect(seen).toContain('camelBid');
      else for (const t of ['placeTbKnight', 'moveTbKnight']) expect(seen).toContain(t);
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

describe('Caravans', () => {
  it('starts three caravans at the oasis in the middle', () => {
    const s = game('caravans');
    const oasis = Object.values(s.hexes).find((h) => h.type === 'oasis')!;
    expect([oasis.q, oasis.r]).toEqual([0, 0]);
    const c = ctxOf(s);
    expect(tbData(c).caravans).toHaveLength(3);
    expect(camelOptions(c).length).toBeGreaterThanOrEqual(3);
    expect(c.vpTarget()).toBe(12);
  });

  it('votes on a camel after a round with a new settlement; the most votes win', () => {
    let s = finishSetup(game('caravans'));
    // Jump to the last player's turn with a settlement built this round.
    s = edit(s, (c) => {
      c.state.turn.player = 3;
      c.setPhase({ id: 'main' });
      tbData(c).builtThisRound = true;
      for (const p of c.state.players) p.hand = { wool: 2, grain: 2 };
    });
    s = act(s, { type: 'endTurn', player: 3 });
    expect(s.phase.id).toBe('camelVote');
    expect(lib.waitingOn(s)).toEqual([0]);
    const [a, b] = camelOptions(ctxOf(s)) as [EdgeId, EdgeId];
    s = act(s, { type: 'camelBid', player: 0, edge: a, wool: 0, grain: 0 });
    s = act(s, { type: 'camelBid', player: 1, edge: b, wool: 1, grain: 1 });
    s = act(s, { type: 'camelBid', player: 2, edge: a, wool: 1, grain: 0 });
    s = act(s, { type: 'camelBid', player: 3, edge: b, wool: 0, grain: 0 });
    expect(s.phase.id).toBe('roll');
    expect([...camelEdges(ctxOf(s))]).toEqual([b]);
    expect(s.players[1]!.hand).toEqual({ wool: 1, grain: 1 });
  });

  it('a tie goes the way the first voter chose', () => {
    let s = finishSetup(game('caravans'));
    s = edit(s, (c) => {
      c.state.turn.player = 3;
      c.setPhase({ id: 'main' });
      tbData(c).builtThisRound = true;
    });
    s = act(s, { type: 'endTurn', player: 3 });
    const [a, b] = camelOptions(ctxOf(s)) as [EdgeId, EdgeId];
    s = act(s, { type: 'camelBid', player: 0, edge: b, wool: 0, grain: 0 });
    for (const p of [1, 2, 3])
      s = act(s, { type: 'camelBid', player: p, edge: a, wool: 0, grain: 0 });
    expect([...camelEdges(ctxOf(s))]).toEqual([b]);
  });

  it('roads under camels count double, and a building between two camels scores a point', () => {
    let s = finishSetup(game('caravans'));
    const c0 = ctxOf(s);
    const head = tbData(c0).caravans[0]!.corners[0]!;
    const [e1, e2] = (c0.geometry.cornerEdges.get(head) ?? []).filter((e) => c0.isLandEdge(e));
    s = edit(s, (c) => {
      for (const p of Object.values(c.state.pieces)) if (p.owner !== null) c.remove(p);
      c.place('settlement', 0, { kind: 'corner', id: head });
      c.place('road', 0, { kind: 'edge', id: e1! });
      c.place('road', 0, { kind: 'edge', id: e2! });
    });
    const before = ctxOf(s);
    expect(before.longestRoute(0)).toBe(2);
    const vp = before.vp(0);
    s = edit(s, (c) => {
      tbData(c).camels = [e1!, e2!];
    });
    expect(ctxOf(s).longestRoute(0)).toBe(4);
    expect(ctxOf(s).vp(0)).toBe(vp + 1);
  });
});

describe('Barbarian Attack', () => {
  it('a castle in the middle, no robber, and barbarians on the coastal 2 and 12', () => {
    const s = game('barbarians');
    const c = ctxOf(s);
    expect(castleHex(c)).toBe('h:0,0');
    expect(c.piecesOfType('robber')).toHaveLength(0);
    const coast = coastalHexes(c);
    for (const h of Object.values(s.hexes))
      if (h.token === 2 || h.token === 12) {
        expect(coast).toContain(h.id);
        expect(barbariansOn(c, h.id)).toBe(1);
      }
    expect(knightStartEdges(c)).toHaveLength(6);
  });

  it('the second starting settlement is a city', () => {
    const s = finishSetup(game('barbarians'));
    for (const p of s.players) {
      const c = ctxOf(s);
      expect(c.piecesOf(p.seat, 'city')).toHaveLength(1);
      expect(c.piecesOf(p.seat, 'settlement')).toHaveLength(1);
    }
  });

  it('barbarians land after a settlement is built', () => {
    let s = finishSetup(game('barbarians'));
    const seat = s.turn.player;
    const c0 = ctxOf(s);
    const edge = c0.geometry.edges.find((e) =>
      (c0.geometry.edgeHexes.get(e) ?? []).every((h) => c0.isLand(h)),
    )!;
    const corner = c0.geometry.edgeCorners.get(edge)![0];
    s = edit(s, (c) => {
      for (const p of Object.values(c.state.pieces)) if (p.owner !== null) c.remove(p);
      c.place('road', seat, { kind: 'edge', id: edge });
      c.setPhase({ id: 'main' });
      c.player(seat).hand = { brick: 1, lumber: 1, wool: 1, grain: 1 };
    });
    const before = Object.values(tbData(ctxOf(s)).barbarians).reduce((a, b) => a + b, 0);
    const r = lib.apply(s, { type: 'buildSettlement', player: seat, corner });
    const landed = r.events.find((e) => e.type === 'barbariansLanded')!;
    expect(r.events.findIndex((e) => e.type === 'built')).toBeLessThan(r.events.indexOf(landed));
    expect((landed.numbers as number[]).length).toBe(3);
    expect(landed.numbers).not.toContain(7);
    const after = Object.values(tbData(ctxOf(r.state)).barbarians).reduce((a, b) => a + b, 0);
    expect(after).toBe(before + (landed.hexes as string[]).length);
  });

  it('a held hex produces nothing, blocks building and cuts off buildings', () => {
    let s = finishSetup(game('barbarians'));
    const c0 = ctxOf(s);
    const hex = coastalHexes(c0).find((h) => s.hexes[h]!.token && s.hexes[h]!.type !== 'desert')!;
    const outer = c0.geometry.hexCorners
      .get(hex)!
      .find(
        (c) => (c0.geometry.cornerHexes.get(c) ?? []).filter((h) => c0.isLand(h)).length === 1,
      )!;
    s = edit(s, (c) => {
      for (const p of Object.values(c.state.pieces)) if (p.owner !== null) c.remove(p);
      c.place('settlement', 0, { kind: 'corner', id: outer });
      c.setPhase({ id: 'main' });
      c.state.turn.player = 0;
      c.player(0).hand = { brick: 2, lumber: 2 };
    });
    const vp = ctxOf(s).vp(0);
    expect(lib.legalActions(s, 0).some((a) => a.type === 'buildRoad')).toBe(true);
    s = edit(s, (c) => {
      tbData(c).barbarians[hex] = 3;
    });
    expect(ctxOf(s).vp(0)).toBe(vp - 1);
    const nextTo = new Set(ctxOf(s).geometry.cornerEdges.get(outer));
    expect(
      lib.legalActions(s, 0).some((a) => a.type === 'buildRoad' && nextTo.has(a.edge as EdgeId)),
    ).toBe(false);
    const token = s.hexes[hex]!.token!;
    const count = (x: GameState) => Object.values(x.players[0]!.hand).reduce((a, b) => a + b, 0);
    expect(count(edit(s, (c) => produce(c, token)))).toBe(count(s));
    const free = edit(s, (c) => {
      tbData(c).barbarians[hex] = 2;
    });
    expect(count(edit(free, (c) => produce(c, token)))).toBe(count(s) + 1);
  });

  it('a Knight card sends out a knight; knights move 3 steps, or 5 for a grain', () => {
    let s = finishSetup(game('barbarians'));
    const seat = s.turn.player;
    s = edit(s, (c) => {
      c.setPhase({ id: 'main' });
      (c.player(seat).held.dev ??= []).push({ card: 'knight', acquiredTurn: 0 });
      c.player(seat).hand = { grain: 1 };
    });
    s = act(s, { type: 'playDevCard', player: seat, card: 'knight' });
    expect(s.phase.id).toBe('tbKnight');
    const start = knightStartEdges(ctxOf(s))[0]!;
    s = act(s, { type: 'placeTbKnight', player: seat, edge: start });
    expect(s.phase.id).toBe('main');
    expect(s.data.base?.largestArmy ?? null).toBeNull();
    const c = ctxOf(s);
    const knight = tbData(c).knights[0]!;
    const moves = knightMoves(c, knight);
    const far = [...moves].find(([, n]) => n === 5)![0];
    const near = [...moves].find(([, n]) => n === 2)![0];
    const castle = new Set(c.geometry.hexEdges.get(castleHex(c)!));
    for (const e of moves.keys()) expect(castle.has(e)).toBe(false);
    const paid = act(s, { type: 'moveTbKnight', player: seat, knight: knight.id, to: far });
    expect(paid.players[seat]!.hand.grain ?? 0).toBe(0);
    const free = act(s, { type: 'moveTbKnight', player: seat, knight: knight.id, to: near });
    expect(free.players[seat]!.hand.grain).toBe(1);
    expect(() =>
      act(free, { type: 'moveTbKnight', player: seat, knight: knight.id, to: start }),
    ).toThrow();
  });

  it('knights that outnumber barbarians capture them at the end of the turn', () => {
    let s = finishSetup(game('barbarians'));
    const c0 = ctxOf(s);
    const hex = coastalHexes(c0)[0]!;
    const edges = c0.geometry.hexEdges.get(hex)!;
    s = edit(s, (c) => {
      c.setPhase({ id: 'main' });
      c.state.turn.player = 0;
      const d = tbData(c);
      d.barbarians = { [hex]: 2 };
      d.knights = [
        { id: 'k0', owner: 0, edge: edges[0]! },
        { id: 'k1', owner: 0, edge: edges[1]! },
        { id: 'k2', owner: 1, edge: edges[2]! },
      ];
    });
    const r = lib.apply(s, { type: 'endTurn', player: 0 });
    const c = ctxOf(r.state);
    expect(barbariansOn(c, hex)).toBe(0);
    expect(prisonersOf(c, 0)).toBe(1);
    expect(prisonersOf(c, 1)).toBe(1);
    const fight = r.events.find((e) => e.type === 'barbariansDefeated')!;
    const lost = (fight.lost as number[]).length;
    expect(tbData(c).knights).toHaveLength(3 - lost);
    expect(goldOf(c, 0) + goldOf(c, 1)).toBe(3 * lost);
  });

  it('too few knights do not fight; two prisoners are a point', () => {
    let s = finishSetup(game('barbarians'));
    const c0 = ctxOf(s);
    const hex = coastalHexes(c0)[0]!;
    const edges = c0.geometry.hexEdges.get(hex)!;
    s = edit(s, (c) => {
      c.setPhase({ id: 'main' });
      c.state.turn.player = 0;
      const d = tbData(c);
      d.barbarians = { [hex]: 2 };
      d.knights = [
        { id: 'k0', owner: 0, edge: edges[0]! },
        { id: 'k1', owner: 1, edge: edges[1]! },
      ];
    });
    const vp = ctxOf(s).vp(2);
    s = act(s, { type: 'endTurn', player: 0 });
    expect(barbariansOn(ctxOf(s), hex)).toBe(2);
    s = edit(s, (c) => {
      tbData(c).prisoners[2] = 3;
    });
    expect(ctxOf(s).vp(2)).toBe(vp + 1);
  });
});
