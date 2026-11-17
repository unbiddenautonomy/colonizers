import { describe, expect, it } from 'vitest';
import {
  Ctx,
  ModuleLibrary,
  stateFromView,
  type Action,
  type CornerId,
  type EdgeId,
  type GameState,
  type HexId,
} from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { seafarersModule } from '@colonizers/module-seafarers';
import { variantsModule } from '@colonizers/module-variants';
import { citiesKnightsModule } from '@colonizers/module-cities-knights';
import { specialMapsModule } from '@colonizers/module-special-maps';
import { generateTdaBoard, TDA_SCENARIOS } from '@colonizers/maps';
import { chooseAction, newMemory, type BotConfig, type BotMemory } from '@colonizers/bots';
import {
  buildingBlocked,
  dragonsAttacking,
  roadBlocked,
  slayableHexes,
  dragonRelief,
  spreadDragons,
  tdaData,
  TOTAL_DRAGONS,
  treasureDeck,
  TREASURE_SET,
  treasuresDragonsModule,
  crossTargets,
  enchantedCorner,
  roamTargets,
  DRAGONS_TO_WIN,
  canalHexes,
  canalLeft,
  canalShipProblem,
  smallIslandCorner,
} from '../src/index.ts';

const lib = new ModuleLibrary([
  baseModule,
  seafarersModule,
  specialMapsModule,
  treasuresDragonsModule,
  variantsModule,
  citiesKnightsModule,
]);

function rng(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function game(scenario: string, players = 4, seed = 'tda', ck = false): GameState {
  const b = generateTdaBoard({ seed, players, scenario });
  return lib.createGame({
    seed,
    players: Array.from({ length: players }, (_, i) => `P${i}`),
    // The app's load order: Cities & Knights before this module when it is in the game.
    modules:
      ck || TDA_SCENARIOS.find((x) => x.id === scenario)?.citiesKnights === 'needs'
        ? [...b.modules.slice(0, -1), 'variants', 'cities-knights', 'treasures-dragons']
        : [...b.modules, 'variants'],
    map: b.map,
    settings: { vpTarget: 10, ...b.settings },
    fixedSeats: true,
  }).state;
}

const ctxOf = (s: GameState) => new Ctx(s, lib.registry(s.modules));
const act = (s: GameState, a: Action) => lib.apply(s, a).state;

function edit(s: GameState, fn: (c: Ctx) => void): GameState {
  const t = structuredClone(s);
  const c = ctxOf(t);
  fn(c);
  c.commit();
  return t;
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

const WEIGHTS: Record<string, number> = {
  buildCity: 60,
  buildSettlement: 50,
  buildShip: 14,
  buildRoad: 10,
  placeFreeRoad: 10,
  placeFreeShip: 10,
  buyDevCard: 10,
  playDevCard: 6,
  bankTrade: 3,
  moveShip: 0.5,
  offerTrade: 0.1,
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

function simulate(s: GameState, seed: number, max = 6000) {
  const rand = rng(seed);
  const seen = new Set<string>();
  const events = new Set<string>();
  for (let i = 0; i < max && s.winner === null; i++) {
    const waiting = lib.waitingOn(s);
    if (!waiting.length) throw new Error(`Nobody can act in ${JSON.stringify(s.phase)}`);
    const seat = waiting[Math.floor(rand() * waiting.length)]!;
    const options = lib.legalActions(s, seat);
    if (i % 9 === 0) {
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
    seen.add(a.type);
    const r = lib.apply(s, a);
    for (const e of r.events) events.add(e.type);
    s = r.state;
  }
  return { state: s, seen, events };
}

describe('Treasures, Dragons & Adventurers boards', () => {
  for (const scenario of TDA_SCENARIOS) {
    for (const players of [3, 4, 5, 6]) {
      it(`${scenario.name} builds for ${players} players`, () => {
        const s = game(scenario.id, players, `b${players}`);
        const c = ctxOf(s);
        const chests = c.piecesOfType('treasure');
        if (scenario.id === 'desert-dragons') {
          expect(chests).toHaveLength(0);
          expect(Object.values(s.hexes).filter((h) => h.type === 'desert')).toHaveLength(3);
          expect(c.piecesOfType('robber')).toHaveLength(0);
          expect(c.piecesOfType('pirate')).toHaveLength(0);
        } else if (scenario.id === 'enchanted-land') {
          expect(chests).toHaveLength(0);
          const dragons = c.piecesOfType('dragon');
          expect(dragons.length).toBeGreaterThanOrEqual(8);
          expect(Object.values(s.hexes).some((h) => h.props?.enchanted)).toBe(true);
          for (const d of dragons)
            expect(enchantedCorner(c, (d.at as { id: CornerId }).id)).toBe(true);
          expect(c.piecesOfType('pirate')).toHaveLength(0);
        } else if (scenario.id === 'great-canal') {
          // Its board has its own tests below.
          expect(chests).toHaveLength(0);
        } else if (scenario.id === 'greater-catan') {
          expect(chests).toHaveLength(0);
          expect(tdaData(c).supply).toHaveLength(players <= 3 ? 4 : players === 4 ? 5 : 6);
          const home = new Set(s.settings.setupHexes as string[]);
          const bare = Object.values(s.hexes).filter(
            (h) => !home.has(h.id) && h.type !== 'sea' && h.type !== 'desert',
          );
          expect(bare.length).toBeGreaterThan(0);
          for (const h of bare) expect(h.token).toBeUndefined();
          expect(c.supplyLeft(0, 'city')).toBe(8);
        } else {
          expect(chests.length).toBeGreaterThanOrEqual(10);
          // Chests never touch the home island.
          for (const t of chests) {
            const hs = c.geometry.cornerHexes.get((t.at as { id: CornerId }).id) ?? [];
            expect(hs.length).toBe(3);
          }
          expect(tdaData(c).deck).toHaveLength(chests.length + tdaData(c).stack);
          expect(Object.values(s.hexes).some((h) => h.hidden)).toBe(true);
        }
        if (scenario.id === 'into-the-unknown') expect(c.piecesOfType('pirate')).toHaveLength(0);
      });
    }
  }

  it('makes treasure decks in the set proportions', () => {
    const d = treasureDeck(20);
    expect(d).toHaveLength(20);
    for (const [k, n] of Object.entries(TREASURE_SET))
      expect(d.filter((x) => x === k)).toHaveLength(n);
    expect(treasureDeck(25)).toHaveLength(25);
  });
});

describe('Treasure chests', () => {
  it('opens a chest when a road or ship is built next to it', () => {
    let s = finishSetup(game('treasure-islands', 4, 'chest'));
    const c0 = ctxOf(s);
    const chest = c0
      .piecesOfType('treasure')
      .find((t) =>
        (c0.geometry.cornerEdges.get((t.at as { id: CornerId }).id) ?? []).some((e) =>
          c0.isSeaEdge(e),
        ),
      )!;
    const corner = (chest.at as { id: CornerId }).id;
    const edge = (c0.geometry.cornerEdges.get(corner) ?? []).find((e) => c0.isSeaEdge(e))!;
    // Give the active player a ship at the far end so the new one connects.
    const [a, b] = c0.geometry.edgeCorners.get(edge)!;
    const far = a === corner ? b : a;
    const before = tdaData(c0).deck.length;
    s = edit(s, (c) => {
      c.state.phase = { id: 'main' };
      const seat = c.active;
      c.place('settlement', seat, { kind: 'corner', id: far });
      c.grant(seat, { lumber: 1, wool: 1 });
    });
    const seat = s.turn.player;
    s = act(s, { type: 'buildShip', player: seat, edge });
    const c = ctxOf(s);
    expect(c.piecesOfType('treasure').some((t) => t.id === chest.id)).toBe(false);
    expect(tdaData(c).deck).toHaveLength(before - 1);
    expect(tdaData(c).found[seat]).toBe(1);
  });

  it('with Cities & Knights, a development card treasure is a progress card of your choice', () => {
    const b = generateTdaBoard({ seed: 'ckchest', players: 4, scenario: 'treasure-islands' });
    let s = lib.createGame({
      seed: 'ckchest',
      players: ['P0', 'P1', 'P2', 'P3'],
      modules: [...b.modules.slice(0, -1), 'variants', 'cities-knights', 'treasures-dragons'],
      map: b.map,
      settings: { vpTarget: 13, ...b.settings },
      fixedSeats: true,
    }).state;
    s = finishSetup(s);
    const c0 = ctxOf(s);
    const chest = c0
      .piecesOfType('treasure')
      .find((t) =>
        (c0.geometry.cornerEdges.get((t.at as { id: CornerId }).id) ?? []).some((e) =>
          c0.isSeaEdge(e),
        ),
      )!;
    const corner = (chest.at as { id: CornerId }).id;
    const edge = (c0.geometry.cornerEdges.get(corner) ?? []).find((e) => c0.isSeaEdge(e))!;
    const [a, b2] = c0.geometry.edgeCorners.get(edge)!;
    const far = a === corner ? b2 : a;
    s = edit(s, (c) => {
      c.state.phase = { id: 'main' };
      c.place('settlement', c.active, { kind: 'corner', id: far });
      c.grant(c.active, { lumber: 1, wool: 1 });
      tdaData(c).deck.unshift('devCard');
    });
    const seat = s.turn.player;
    s = act(s, { type: 'buildShip', player: seat, edge });
    expect(s.phase.id).toBe('treasureProgress');
    const options = lib.legalActions(s, seat).filter((x) => x.type === 'treasureProgress');
    expect(options.map((x) => x.deck).sort()).toEqual(['politics', 'science', 'trade']);
    s = act(s, { type: 'treasureProgress', player: seat, deck: 'trade' });
    // (A gold field found in the fog may ask for a pick next.)
    expect(['main', 'pickGold']).toContain(s.phase.id);
    expect(s.players[seat]!.held.trade ?? []).toHaveLength(1);
    // 14 + Cities & Knights' 3 with the target this game was given.
    expect(ctxOf(s).vpTarget()).toBe(13 + 4);
  });

  it('keeps the treasures face down in the view', () => {
    const s = game('treasure-islands', 4, 'view');
    const v = stateFromView(lib.view(s, 0));
    const d = v.data['treasures-dragons'] as { deck: string[] };
    expect(new Set(d.deck)).toEqual(new Set(['anyOne']));
  });

  for (const scenario of ['treasure-islands', 'into-the-unknown']) {
    it(`${scenario}: random play opens chests and finishes cleanly`, () => {
      const found = new Set<string>();
      const built = new Set<string>();
      for (const seed of [11, 12, 13]) {
        const { seen, events, state } = simulate(
          finishSetup(game(scenario, 4, `sim${seed}`)),
          seed,
        );
        for (const e of events) found.add(e);
        for (const a of seen) built.add(a);
        expect(state.phase.id).not.toBe('setup');
        if (found.has('treasure')) break;
      }
      expect(found.has('treasure')).toBe(true);
      expect(built.has('buildShip')).toBe(true);
    }, 60_000);
  }
});

describe('Greater Catan', () => {
  /** A bare hex, an edge touching it, and the corner at the edge's other end. */
  function bareSpot(s: GameState) {
    const c = ctxOf(s);
    const home = new Set(s.settings.setupHexes as string[]);
    for (const h of Object.values(s.hexes)) {
      if (home.has(h.id) || h.token !== undefined || h.type === 'sea' || h.type === 'desert')
        continue;
      for (const corner of c.geometry.hexCorners.get(h.id) ?? [])
        for (const e of c.geometry.cornerEdges.get(corner) ?? []) {
          if (!c.isSeaEdge(e)) continue;
          const [a, b] = c.geometry.edgeCorners.get(e)!;
          const far = a === corner ? b : a;
          if (c.piecesAt({ kind: 'corner', id: far }).length) continue;
          return { hex: h.id, edge: e, far };
        }
    }
    throw new Error('no bare hex');
  }

  it('numbers a new hex from the pile, then from the home island', () => {
    let s = finishSetup(game('greater-catan', 4, 'gc'));
    const spot = bareSpot(s);
    s = edit(s, (c) => {
      c.state.phase = { id: 'main' };
      for (const p of c.piecesOfType('pirate')) c.remove(p);
      c.place('settlement', c.active, { kind: 'corner', id: spot.far });
      c.grant(c.active, { lumber: 2, wool: 2 });
    });
    const seat = s.turn.player;
    const pile = tdaData(ctxOf(s)).supply.length;
    s = act(s, { type: 'buildShip', player: seat, edge: spot.edge });
    expect(s.hexes[spot.hex]!.token).toBeGreaterThan(0);
    expect(tdaData(ctxOf(s)).supply.length).toBeLessThan(pile);
    expect(s.phase.id).toBe('main');

    // With the pile empty, the builder moves a number over from home.
    let t = finishSetup(game('greater-catan', 4, 'gc2'));
    const spot2 = bareSpot(t);
    t = edit(t, (c) => {
      c.state.phase = { id: 'main' };
      tdaData(c).supply = [];
      for (const p of c.piecesOfType('pirate')) c.remove(p);
      c.place('settlement', c.active, { kind: 'corner', id: spot2.far });
      c.grant(c.active, { lumber: 1, wool: 1 });
    });
    const me = t.turn.player;
    t = act(t, { type: 'buildShip', player: me, edge: spot2.edge });
    expect(t.phase.id).toBe('moveToken');
    const options = lib.legalActions(t, me).filter((a) => a.type === 'takeToken');
    expect(options.length).toBeGreaterThan(0);
    const from = options[0]!.hex as HexId;
    const token = t.hexes[from]!.token;
    const target = t.phase.hex as HexId;
    t = act(t, options[0]!);
    expect(t.hexes[target]!.token).toBe(token);
    expect(t.hexes[from]!.token).toBeUndefined();
    // A second bare hex on the same ship may ask again.
    expect(['main', 'moveToken']).toContain(t.phase.id);
  });

  it('random play keeps numbering new islands', () => {
    const { events, state } = simulate(finishSetup(game('greater-catan', 3, 'gsim')), 4, 4000);
    expect(events.has('tokenPlaced')).toBe(true);
    expect(state.phase.id).not.toBe('setup');
  }, 60_000);
});

describe('Desert dragons', () => {
  it('wakes dragons with each new building, evenly over the deserts', () => {
    let s = finishSetup(game('desert-dragons', 4, 'wake'));
    const c0 = ctxOf(s);
    expect(tdaData(c0).awake).toBe(0);
    const spot = c0.geometry.corners.find(
      (k) =>
        c0.isLandCorner(k) &&
        !c0.buildingAt(k) &&
        (c0.geometry.cornerNeighbours.get(k) ?? []).every((n) => !c0.buildingAt(n)),
    )!;
    s = edit(s, (c) => {
      c.state.phase = { id: 'main' };
      c.place('settlement', c.active, { kind: 'corner', id: spot });
    });
    const d = tdaData(ctxOf(s));
    expect(d.awake).toBe(2);
    expect(Object.values(d.dragons).sort()).toEqual([1, 1]);
  });

  it('spreads from the deserts on a roll, and a Knight drives one out', () => {
    let s = finishSetup(game('desert-dragons', 4, 'spread'));
    // Wake them all, then roll a number next to a desert.
    s = edit(s, (c) => {
      const d = tdaData(c);
      const deserts = Object.values(c.state.hexes).filter((h) => h.type === 'desert');
      deserts.forEach((h, i) => (d.dragons[h.id] = i === 0 ? 8 : 5));
      d.awake = TOTAL_DRAGONS;
    });
    const c0 = ctxOf(s);
    expect(dragonsAttacking(c0)).toBe(true);
    const desert = Object.values(s.hexes).find((h) => h.type === 'desert')!;
    const target = (c0.geometry.hexNeighbours.get(desert.id) ?? [])
      .map((h) => s.hexes[h]!)
      .find((h) => h.token && h.token !== 7)!;
    const rolled = edit(s, (c) => spreadDragons(c, target.token!));
    const c1 = ctxOf(rolled);
    expect(tdaData(c1).dragons[target.id]).toBe(1);
    expect(slayableHexes(c1)).toContain(target.id);
    // Total dragons stay 18 while they spread.
    expect(Object.values(tdaData(c1).dragons).reduce((a, b) => a + b, 0)).toBe(TOTAL_DRAGONS);

    // A Knight card clears it for good.
    let k = edit(rolled, (c) => {
      c.state.phase = { id: 'main' };
      (c.player(c.active).held.dev ??= []).push({ card: 'knight', acquiredTurn: -5 });
    });
    const seat = k.turn.player;
    k = act(k, { type: 'playDevCard', player: seat, card: 'knight' });
    expect(k.phase.id).toBe('slayDragon');
    k = act(k, { type: 'slayDragon', player: seat, hex: target.id });
    const c2 = ctxOf(k);
    expect(tdaData(c2).dragons[target.id]).toBeUndefined();
    expect(tdaData(c2).slain[seat]).toBe(1);
    expect(k.phase.id).toBe('main');
  });

  it('blocks production, roads between dragons and towns ringed by dragons', () => {
    let s = finishSetup(game('desert-dragons', 4, 'block'));
    const c0 = ctxOf(s);
    const seat = 0;
    const own = c0.piecesOf(seat).find((p) => p.type === 'settlement')!;
    const corner = (own.at as { id: CornerId }).id;
    const ring = c0.geometry.cornerHexes.get(corner) ?? [];
    const before = c0.vp(seat);
    s = edit(s, (c) => {
      for (const h of ring) tdaData(c).dragons[h] = 1;
    });
    const c = ctxOf(s);
    const allLand = ring.every((h) => c.isLand(h));
    if (allLand) {
      expect(buildingBlocked(c, corner)).toBe(true);
      expect(c.vp(seat)).toBe(before - 1);
    }
    const edge = (c.geometry.cornerEdges.get(corner) ?? []).find((e) =>
      (c.geometry.edgeHexes.get(e) ?? []).every((h) => ring.includes(h as HexId)),
    ) as EdgeId | undefined;
    if (edge && (c.geometry.edgeHexes.get(edge) ?? []).length === 2)
      expect(roadBlocked(c, edge)).toBe(true);
  });

  it('dragon relief: a blocked field pays 1 random resource instead', () => {
    let s = finishSetup(game('desert-dragons', 4, 'relief'));
    const c0 = ctxOf(s);
    const own = c0.piecesOf(0).find((p) => p.type === 'settlement')!;
    const hex = (c0.geometry.cornerHexes.get((own.at as { id: CornerId }).id) ?? [])
      .map((h) => s.hexes[h]!)
      .find((h) => h.token && h.token !== 7 && h.type !== 'desert')!;
    s = edit(s, (c) => {
      for (const p of c.state.players) p.hand = {};
      tdaData(c).dragons[hex.id] = 1;
    });
    const after = edit(s, (c) => {
      dragonRelief(c, hex.token!);
      expect(c.events.some((e) => e.type === 'dragonRelief')).toBe(true);
    });
    const got = Object.values(after.players[0]!.hand).reduce((a, n) => a + n, 0);
    expect(got).toBe(1);
  });

  it('a 7 lets the roller steal from anyone, with no robber', () => {
    let s = finishSetup(game('desert-dragons', 4, 'seven'));
    const seat = s.turn.player;
    const victim = (seat + 1) % 4;
    s = edit(s, (c) => {
      for (const p of c.state.players) p.hand = {};
      c.grant(victim, { ore: 8 });
      c.state.phase = { id: 'discard', owed: { [victim]: 4 }, returnTo: 'main' };
    });
    s = act(s, { type: 'discard', player: victim, cards: { ore: 4 } });
    // Only one player holds cards, so the steal happens at once.
    expect(s.phase.id).toBe('main');
    expect(s.players[seat]!.hand.ore).toBe(1);
    expect(ctxOf(s).piecesOfType('robber')).toHaveLength(0);
  });

  it('random play wakes the dragons and finishes cleanly', () => {
    const { events, state } = simulate(finishSetup(game('desert-dragons', 3, 'dsim')), 5);
    expect(events.has('dragonsWake')).toBe(true);
    expect(state.phase.id).not.toBe('moveRobber');
  }, 60_000);
});

describe('Enchanted Land', () => {
  const setupKnight = (s: GameState, at: CornerId, props: Record<string, unknown>) =>
    edit(s, (c) => {
      c.state.phase = { id: 'main' };
      c.place('knight1', c.active, { kind: 'corner', id: at }, { activatedTurn: -1, ...props });
    });

  it('beats a weak dragon with any knight, and loses to a mighty one', () => {
    const s = finishSetup(game('enchanted-land', 4, 'el'));
    const c = ctxOf(s);
    const weak = c.piecesOfType('dragon').find((d) => d.props.tier === 1)!;
    const strong = c.piecesOfType('dragon').find((d) => d.props.tier === 3)!;
    let t = setupKnight(s, (weak.at as { id: CornerId }).id, { active: true, away: true });
    const seat = t.turn.player;
    const before = ctxOf(t).vp(seat);
    const k = ctxOf(t).piecesOf(seat, 'knight1')[0]!;
    t = act(t, { type: 'fightDragon', player: seat, knight: k.id });
    expect(
      ctxOf(t)
        .piecesOfType('dragon')
        .some((d) => d.id === weak.id),
    ).toBe(false);
    expect(tdaData(ctxOf(t)).slain[seat]).toBe(1);
    expect(ctxOf(t).vp(seat)).toBe(before + 1);

    let u = setupKnight(s, (strong.at as { id: CornerId }).id, { active: true, away: true });
    const k2 = ctxOf(u).piecesOf(u.turn.player, 'knight1')[0]!;
    u = act(u, { type: 'fightDragon', player: u.turn.player, knight: k2.id });
    expect(
      ctxOf(u)
        .piecesOfType('dragon')
        .some((d) => d.id === strong.id),
    ).toBe(true);
    expect(u.pieces[k2.id]!.props.active).toBe(false);
  });

  it('wins the game with the sixth dragon', () => {
    const s = finishSetup(game('enchanted-land', 4, 'el6'));
    const weak = ctxOf(s).piecesOfType('dragon')[0]!;
    let t = setupKnight(s, (weak.at as { id: CornerId }).id, { active: true, away: true });
    const seat = t.turn.player;
    t = edit(t, (c) => {
      tdaData(c).slain[seat] = DRAGONS_TO_WIN - 1;
      c.state.pieces[weak.id]!.props.tier = 1;
    });
    const k = ctxOf(t).piecesOf(seat, 'knight1')[0]!;
    t = act(t, { type: 'fightDragon', player: seat, knight: k.id });
    expect(t.winner).toBe(seat);
  });

  it('roams up to 3 corners inland, and crosses where ships reach the coast', () => {
    const s = finishSetup(game('enchanted-land', 4, 'elr'));
    const c = ctxOf(s);
    const inland = c.geometry.corners.find(
      (k) =>
        enchantedCorner(c, k) &&
        (c.geometry.cornerHexes.get(k) ?? []).length === 3 &&
        (c.geometry.cornerHexes.get(k) ?? []).every((h) => c.isLand(h)) &&
        c.piecesAt({ kind: 'corner', id: k }).length === 0,
    )!;
    const t = setupKnight(s, inland, { active: true, away: true });
    const k = ctxOf(t).piecesOf(t.turn.player, 'knight1')[0]!;
    const targets = roamTargets(ctxOf(t), k);
    expect(targets.length).toBeGreaterThan(0);
    const ct = ctxOf(t);
    for (const x of targets)
      expect((ct.geometry.cornerHexes.get(x) ?? []).every((h) => ct.isLand(h))).toBe(true);

    // Crossing: a knight at one end of a ship that touches a free coastal corner.
    const coast = c.geometry.corners.find(
      (k) =>
        enchantedCorner(c, k) &&
        (c.geometry.cornerHexes.get(k) ?? []).some((h) => c.isSea(h)) &&
        c.piecesAt({ kind: 'corner', id: k }).length === 0 &&
        (c.geometry.cornerEdges.get(k) ?? []).some((e) => c.isSeaEdge(e)),
    )!;
    const edge = (c.geometry.cornerEdges.get(coast) ?? []).find((e) => c.isSeaEdge(e))!;
    const [a, b] = c.geometry.edgeCorners.get(edge)!;
    const other = a === coast ? b : a;
    let x = edit(s, (cc) => {
      cc.state.phase = { id: 'main' };
      for (const p of cc.piecesAt({ kind: 'corner', id: other })) cc.remove(p);
      cc.place('ship', cc.active, { kind: 'edge', id: edge });
      cc.place(
        'knight1',
        cc.active,
        { kind: 'corner', id: other },
        { active: true, activatedTurn: -1 },
      );
    });
    const seat = x.turn.player;
    const kn = ctxOf(x).piecesOf(seat, 'knight1')[0]!;
    expect(crossTargets(ctxOf(x), kn)).toContain(coast);
    x = act(x, { type: 'crossKnight', player: seat, knight: kn.id, to: coast });
    expect(x.pieces[kn.id]!.props.away).toBe(true);
    expect(tdaData(ctxOf(x)).crossed[seat]).toBe(true);
  });

  it('keeps roads off the enchanted land', () => {
    const s = edit(finishSetup(game('enchanted-land', 4, 'elb')), (c) => {
      c.state.phase = { id: 'main' };
    });
    const c = ctxOf(s);
    const seat = s.turn.player;
    const edge = c.geometry.edges.find(
      (e) =>
        c.isLandEdge(e) &&
        (c.geometry.edgeHexes.get(e) ?? []).some((h) => s.hexes[h]?.props?.enchanted),
    )!;
    expect(lib.check(s, { type: 'buildRoad', player: seat, edge })).toMatch(/no roads/i);
  });
});

describe('Into the Unknown', () => {
  it('gives everyone a third starting settlement, last-placer first, with resources', () => {
    for (const n of [3, 4, 5, 6]) {
      for (const seed of [1, 2, 3]) {
        let s = game('into-the-unknown', n, `itu${n}-${seed}`);
        expect(s.settings.setupRounds).toBe(3);
        const order: number[] = [];
        const rand = rng(seed);
        while (s.phase.id === 'setup') {
          const seat = lib.waitingOn(s)[0]!;
          const o = lib.legalActions(s, seat);
          expect(o.length).toBeGreaterThan(0);
          const a = o[Math.floor(rand() * o.length)]!;
          if (a.type === 'placeSetupSettlement') order.push(seat);
          s = act(s, a);
        }
        const seats = Array.from({ length: n }, (_, i) => i);
        expect(order).toEqual([...seats, ...[...seats].reverse(), ...seats]);
        const c = ctxOf(s);
        for (const seat of seats) expect(c.piecesOf(seat, 'settlement')).toHaveLength(3);
      }
    }
  }, 60_000);
});

describe('The Great Canal', () => {
  const placeKnight = (s: GameState, seat: number, at: CornerId, props: Record<string, unknown>) =>
    edit(s, (c) => {
      c.state.phase = { id: 'main' };
      c.place('knight1', seat, { kind: 'corner', id: at }, { activatedTurn: -1, ...props });
    });
  const free = (c: Ctx, k: CornerId) => c.piecesAt({ kind: 'corner', id: k }).length === 0;
  /** Two free corners of a hex that aren't next to each other. */
  const twoCorners = (c: Ctx, h: HexId): [CornerId, CornerId] => {
    const cs = (c.geometry.hexCorners.get(h) ?? []).filter((k) => free(c, k));
    for (const a of cs)
      for (const b of cs)
        if (a < b && !(c.geometry.cornerNeighbours.get(a) ?? []).includes(b)) return [a, b];
    throw new Error('no free corners');
  };

  it('lays out a lake, a winding canal, a dry basin and its farmland', () => {
    for (const n of [3, 4, 5, 6]) {
      const s = game('great-canal', n, `gc${n}`);
      const c = ctxOf(s);
      const canal = canalHexes(c);
      expect(canal.length).toBeGreaterThanOrEqual(5);
      expect(canal.every((h) => h.props?.canal === 'dig')).toBe(true);
      const hexes = Object.values(s.hexes);
      expect(hexes.filter((h) => h.type === 'lake')).toHaveLength(1);
      const basin = hexes.find((h) => h.props?.basin)!;
      expect(basin.type).toBe('desert');
      expect(c.piecesOfType('robber')[0]!.at).toEqual({ kind: 'hex', id: basin.id });
      expect(c.piecesOfType('pirate')).toHaveLength(0);
      const farms = hexes.filter((h) => h.props?.farmland);
      expect(farms.length).toBeGreaterThan(0);
      for (const f of farms) {
        expect(f.type).toBe('fields');
        expect(c.geometry.hexNeighbours.get(basin.id)).toContain(f.id);
      }
      expect(hexes.filter((h) => h.props?.goldRiver).length).toBe(2);
      expect(s.modules).toContain('cities-knights');
    }
  });

  it('keeps the farmland dry until the basin floods', () => {
    const s = finishSetup(game('great-canal', 4, 'gcf'));
    const c = ctxOf(s);
    const farm = Object.values(s.hexes).find((h) => h.props?.farmland)!;
    const piece = c.piecesOfType('settlement')[0]!;
    expect(c.reduce('hexYield', farm, piece, { grain: 1 })).toEqual({});
    const t = edit(s, (x) => (tdaData(x).flooded = true));
    expect(ctxOf(t).reduce('hexYield', farm, piece, { grain: 1 })).toEqual({ grain: 1 });
  });

  it('digs a stretch when a second knight beside it is activated', () => {
    const s = finishSetup(game('great-canal', 4, 'gcd'));
    const seat = s.turn.player;
    const hex = canalHexes(ctxOf(s))[2]!;
    const [a, b] = twoCorners(ctxOf(s), hex.id);
    let t = placeKnight(s, seat, a, { active: true });
    t = placeKnight(t, seat, b, { active: false });
    t = edit(t, (c) => c.grant(seat, { grain: 1 }));
    const before = ctxOf(t).vp(seat);
    const k = Object.values(t.pieces).find((p) => (p.at as { id?: string }).id === b)!;
    t = act(t, { type: 'activateKnight', player: seat, knight: k.id });
    expect(t.hexes[hex.id]!.props?.canal).toBe('dug');
    expect(tdaData(ctxOf(t)).chips[seat]).toBe(2);
    expect(ctxOf(t).vp(seat)).toBe(before + 2);
    // The knights stay active.
    expect(t.pieces[k.id]!.props.active).toBe(true);
  });

  it('splits the chips between two players', () => {
    const s = finishSetup(game('great-canal', 4, 'gcs'));
    const seat = s.turn.player;
    const other = (seat + 1) % 4;
    const hex = canalHexes(ctxOf(s))[1]!;
    const [a, b] = twoCorners(ctxOf(s), hex.id);
    let t = placeKnight(s, other, a, { active: true });
    t = placeKnight(t, seat, b, { active: false });
    t = edit(t, (c) => c.grant(seat, { grain: 1 }));
    const k = Object.values(t.pieces).find((p) => (p.at as { id?: string }).id === b)!;
    t = act(t, { type: 'activateKnight', player: seat, knight: k.id });
    expect(tdaData(ctxOf(t)).chips[seat]).toBe(1);
    expect(tdaData(ctxOf(t)).chips[other]).toBe(1);
  });

  it('floods the basin when the second-last stretch is dug', () => {
    const s = finishSetup(game('great-canal', 4, 'gcw'));
    const seat = s.turn.player;
    const canal = canalHexes(ctxOf(s));
    let t = edit(s, (c) => {
      for (const h of canal.slice(2)) c.state.hexes[h.id]!.props = { ...h.props, canal: 'dug' };
    });
    expect(canalLeft(ctxOf(t))).toBe(2);
    const [a, b] = twoCorners(ctxOf(t), canal[0]!.id);
    t = placeKnight(t, seat, a, { active: true });
    t = placeKnight(t, seat, b, { active: false });
    t = edit(t, (c) => c.grant(seat, { grain: 1 }));
    const k = Object.values(t.pieces).find((p) => (p.at as { id?: string }).id === b)!;
    t = act(t, { type: 'activateKnight', player: seat, knight: k.id });
    const c = ctxOf(t);
    expect(tdaData(c).flooded).toBe(true);
    expect(canalHexes(c).every((h) => h.props?.canal === 'water')).toBe(true);
    expect(Object.values(t.hexes).find((h) => h.props?.basin)!.type).toBe('lake');
    // Only the stretch dug here paid out; the last one's chips left the game.
    expect(tdaData(c).chips[seat]).toBe(2);
    const farm = Object.values(t.hexes).find((h) => h.props?.farmland)!;
    const piece = c.piecesOfType('settlement')[0]!;
    expect(c.reduce('hexYield', farm, piece, { grain: 1 })).toEqual({ grain: 1 });
  });

  it('raises knights on the small islands only by gold rivers and harbors', () => {
    const s = finishSetup(game('great-canal', 4, 'gck'));
    const seat = s.turn.player;
    const c0 = ctxOf(s);
    const gold = Object.values(s.hexes).find((h) => h.props?.goldRiver)!;
    const spot = (c0.geometry.hexCorners.get(gold.id) ?? []).find(
      (k) => smallIslandCorner(c0, k) && free(c0, k),
    )!;
    // A ship of ours touching the gold river corner.
    const edge = (c0.geometry.cornerEdges.get(spot) ?? []).find((e) =>
      (c0.geometry.edgeHexes.get(e) ?? []).some((h) => s.hexes[h]?.type === 'sea'),
    ) as EdgeId;
    let t = edit(s, (c) => {
      c.state.phase = { id: 'main' };
      c.place('ship', seat, { kind: 'edge', id: edge });
      c.grant(seat, { wool: 2, ore: 2 });
    });
    t = act(t, { type: 'buildKnight', player: seat, corner: spot });
    const k = Object.values(t.pieces).find((p) => (p.at as { id?: string }).id === spot)!;
    expect(k.type).toBe('knight1');
    expect(k.props.away).toBe(true);

    // Elsewhere on a small island: no.
    const c = ctxOf(t);
    const plain = c.geometry.corners.find(
      (x) =>
        smallIslandCorner(c, x) &&
        !(c.geometry.cornerHexes.get(x) ?? []).some((h) => t.hexes[h]?.props?.goldRiver) &&
        !t.harbors.some((h) =>
          (c.geometry.edgeCorners.get(h.edge) ?? ([] as CornerId[])).includes(x),
        ),
    )!;
    const plainEdge = (c.geometry.cornerEdges.get(plain) ?? [])[0]!;
    const u = edit(t, (x) => x.place('ship', seat, { kind: 'edge', id: plainEdge }));
    expect(() => act(u, { type: 'buildKnight', player: seat, corner: plain })).toThrow(
      /gold river or a harbor/,
    );
    expect(() => act(u, { type: 'buildSettlement', player: seat, corner: plain })).toThrow();
  });

  it('pans gold on an 8 for knights by a gold river', () => {
    const s = finishSetup(game('great-canal', 4, 'gcg'));
    const seat = s.turn.player;
    const c0 = ctxOf(s);
    const gold = Object.values(s.hexes).find((h) => h.props?.goldRiver)!;
    const spot = (c0.geometry.hexCorners.get(gold.id) ?? []).find((k) => free(c0, k))!;
    let t = edit(s, (c) => {
      c.state.phase = { id: 'roll' };
      c.place('knight1', seat, { kind: 'corner', id: spot }, { away: true });
      const d = c.state.data['cities-knights'] as { alchemist: unknown; forcedRoll: unknown };
      d.forcedRoll = null;
      d.alchemist = { red: 4, yellow: 4 };
    });
    t = act(t, { type: 'roll', player: seat });
    for (let i = 0; i < 10 && t.phase.id !== 'pickGold' && t.phase.id !== 'main'; i++)
      t = act(t, lib.legalActions(t, lib.waitingOn(t)[0]!)[0]!);
    expect(t.phase.id).toBe('pickGold');
    expect((t.phase.owed as Record<number, number>)[seat]).toBeGreaterThanOrEqual(1);
  });

  it('trades at a small island harbor through a knight', () => {
    const s = finishSetup(game('great-canal', 4, 'gct'));
    const seat = s.turn.player;
    const c0 = ctxOf(s);
    const harbor = s.harbors.find((h) =>
      (c0.geometry.edgeCorners.get(h.edge) ?? []).some((k) => smallIslandCorner(c0, k)),
    );
    expect(harbor).toBeDefined();
    if (!harbor) return;
    const card = harbor.resource === 'any' ? 'brick' : harbor.resource;
    const corner = (c0.geometry.edgeCorners.get(harbor.edge) ?? []).find((k) => free(c0, k))!;
    const before = c0.reduce('tradeRatio', seat, card, 4);
    const t = edit(s, (c) =>
      c.place('knight1', seat, { kind: 'corner', id: corner }, { away: true }),
    );
    expect(ctxOf(t).reduce('tradeRatio', seat, card, 4)).toBe(Math.min(before, harbor.ratio));
    expect(harbor.ratio).toBeLessThan(4);
  });

  it('keeps ships off the lake and shipping lines from branching', () => {
    const s = finishSetup(game('great-canal', 4, 'gcb'));
    const seat = s.turn.player;
    const c = ctxOf(s);
    const lake = Object.values(s.hexes).find((h) => h.type === 'lake')!;
    const lakeEdge = c.geometry.edges.find((e) =>
      (c.geometry.edgeHexes.get(e) ?? []).includes(lake.id),
    )!;
    expect(canalShipProblem(c, seat, lakeEdge)).toMatch(/lake/);
    // A sea corner with no buildings, and three sea edges around it.
    const corner = c.geometry.corners.find((k) => {
      const es = c.geometry.cornerEdges.get(k) ?? [];
      return (
        es.length === 3 &&
        es.every((e) =>
          (c.geometry.edgeHexes.get(e) ?? []).every((h) => s.hexes[h]?.type === 'sea'),
        )
      );
    })!;
    const [e1, e2, e3] = c.geometry.cornerEdges.get(corner)!;
    const t = edit(s, (x) => {
      x.place('ship', seat, { kind: 'edge', id: e1! });
      x.place('ship', seat, { kind: 'edge', id: e2! });
    });
    expect(canalShipProblem(ctxOf(t), seat, e3!)).toMatch(/branch/);
  });
});

describe('Bots', () => {
  const runs = TDA_SCENARIOS.flatMap((scenario) =>
    scenario.citiesKnights === 'optional'
      ? [
          { scenario, ck: false },
          { scenario, ck: true },
        ]
      : [{ scenario, ck: false }],
  );
  for (const { scenario, ck } of runs) {
    it(`play ${scenario.name}${ck ? ' with Cities & Knights' : ''} without getting stuck`, () => {
      const players = 3;
      let s = game(scenario.id, players, `bot-${scenario.id}`, ck);
      const bot: BotConfig = { level: 'medium', style: 'balanced' };
      const rand = rng(3);
      const memory: BotMemory[] = Array.from({ length: players }, () => newMemory());
      let clock = 0;
      for (let i = 0; i < 1500 && s.winner === null; i++) {
        clock += 1000;
        const waiting = lib.waitingOn(s);
        expect(waiting.length).toBeGreaterThan(0);
        let acted = false;
        for (const seat of waiting) {
          const a = chooseAction(lib, s, seat, bot, memory[seat]!, {
            rand,
            now: clock,
            budgetMs: 100,
          });
          if (!a) continue;
          s = act(s, a);
          acted = true;
          break;
        }
        if (!acted) clock += 20_000;
      }
      expect(s.phase.id).not.toBe('setup');
    }, 60_000);
  }
});
