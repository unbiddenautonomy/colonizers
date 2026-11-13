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
import { generateTdaBoard, TDA_SCENARIOS } from '@colonizers/maps';
import { chooseAction, newMemory, type BotConfig, type BotMemory } from '@colonizers/bots';
import {
  buildingBlocked,
  dragonsAttacking,
  roadBlocked,
  slayableHexes,
  spreadDragons,
  tdaData,
  TOTAL_DRAGONS,
  treasureDeck,
  TREASURE_SET,
  treasuresDragonsModule,
} from '../src/index.ts';

const lib = new ModuleLibrary([
  baseModule,
  seafarersModule,
  treasuresDragonsModule,
  variantsModule,
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

function game(scenario: string, players = 4, seed = 'tda'): GameState {
  const b = generateTdaBoard({ seed, players, scenario });
  return lib.createGame({
    seed,
    players: Array.from({ length: players }, (_, i) => `P${i}`),
    modules: [...b.modules, 'variants'],
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
  });
});

describe('Bots', () => {
  for (const scenario of TDA_SCENARIOS) {
    it(`play ${scenario.name} without getting stuck`, () => {
      const players = 3;
      let s = game(scenario.id, players, `bot-${scenario.id}`);
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
