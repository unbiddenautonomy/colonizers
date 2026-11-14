import { describe, expect, it } from 'vitest';
import {
  Ctx,
  ModuleLibrary,
  type Action,
  type CornerId,
  type GameState,
  type HexId,
  type Piece,
} from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { citiesKnightsModule, ckData, strength } from '@colonizers/module-cities-knights';
import { variantsModule } from '@colonizers/module-variants';
import { generateBoard } from '@colonizers/maps';
import { landWaterCkModule, landWaterModule, lwData, vehiclesOf } from '../src/index.ts';

const lib = new ModuleLibrary([
  baseModule,
  landWaterModule,
  variantsModule,
  citiesKnightsModule,
  landWaterCkModule,
]);
const ctxOf = (s: GameState) => new Ctx(s, lib.registry(s.modules));
const act = (s: GameState, a: Action) => lib.apply(s, a).state;

function edit(state: GameState, fn: (ctx: Ctx) => void): GameState {
  const next = structuredClone(state);
  const ctx = ctxOf(next);
  fn(ctx);
  ctx.commit();
  return next;
}

function game(seed = 'lwck'): GameState {
  const board = generateBoard({ seed, players: 4, mode: 'classic' });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C', 'D'],
    modules: ['base', 'landwater', 'variants', 'cities-knights', 'landwater-ck'],
    map: board.map,
    settings: { vpTarget: 14 },
    fixedSeats: true,
  }).state;
}

function setup(s: GameState): GameState {
  for (let i = 0; i < 300 && s.phase.id !== 'roll'; i++) {
    const seat = lib.waitingOn(s)[0] as number;
    s = act(s, lib.legalActions(s, seat)[0] as Action);
  }
  return s;
}

const mainTurn = (s: GameState, fn: (ctx: Ctx) => void = () => {}) =>
  edit(s, (ctx) => {
    ctx.state.turn = { number: 5, player: 0, round: 2 };
    ctx.setPhase({ id: 'main' });
    for (const p of ctx.state.players)
      for (const [c, n] of Object.entries({ ...p.hand })) if (n) ctx.pay(p.seat, { [c]: n });
    fn(ctx);
  });

describe('Land & Water with Cities & Knights', () => {
  it('starts with a settlement and a city, no roads, and only knights in the deck', () => {
    const s = setup(game());
    const c = ctxOf(s);
    expect(s.phase.id).toBe('roll');
    for (const p of s.players) {
      expect(c.piecesOf(p.seat, 'settlement')).toHaveLength(1);
      expect(c.piecesOf(p.seat, 'city')).toHaveLength(1);
      expect(c.piecesOf(p.seat, 'road')).toHaveLength(0);
    }
    expect(new Set(s.decks.dev)).toEqual(new Set(['knight']));
  });

  it('buys a knight card and plays it at once; played knights defend', () => {
    let s = mainTurn(setup(game()), (ctx) => ctx.grant(0, { wool: 1, grain: 1, ore: 1 }));
    expect(lib.legalActions(s, 0).some((a) => a.type === 'buildKnight')).toBe(false);
    s = act(s, { type: 'buyDevCard', player: 0 });
    expect(s.players[0]?.held.dev?.[0]?.card).toBe('knight');
    // Not the robber yet: it waits for the barbarians.
    expect(() =>
      act(s, { type: 'playDevCard', player: 0, card: 'knight', use: 'robber' } as Action),
    ).toThrow(/barbarians/);
    s = act(s, { type: 'playDevCard', player: 0, card: 'knight', use: 'move' } as Action);
    expect(s.players[0]?.played.knight).toBe(1);
    expect(lwData(ctxOf(s)).boost.points).toBe(2);
    expect(strength(ctxOf(s), 0)).toBe(1);
  });

  it('keeps the barbarian ship in port until it has been rolled three times', () => {
    let s = setup(game('lwck-ship'));
    let ships = 0;
    for (let i = 0; i < 400 && ships < 3; i++) {
      s = edit(s, (ctx) => {
        ctx.state.turn.player = 0;
        ctx.setPhase({ id: 'roll' });
      });
      const r = lib.apply(s, { type: 'roll', player: 0 });
      const face = r.events.find((e) => e.type === 'eventDie')?.face;
      if (face === 'ship') {
        ships++;
        expect(ckData(ctxOf(r.state)).barbarian).toBe(ships < 3 ? 0 : 1);
      }
      s = edit(r.state, (ctx) => {
        // Start the next throw from a clean phase.
        ctx.setPhase({ id: 'main' });
      });
    }
    expect(ships).toBe(3);
  });

  it('gives a train a commodity when another train stands in a field of the same kind', () => {
    let forests: HexId[] = [];
    const s = mainTurn(setup(game('lwck-forest')), (ctx) => {
      forests = (Object.keys(ctx.state.hexes) as HexId[]).filter(
        (h) => ctx.state.hexes[h]?.type === 'forest',
      );
      for (const h of [forests[0], forests[1], forests[0]]) {
        const corner = ctx.geometry.hexCorners.get(h as HexId)?.[0] as CornerId;
        const t = ctx.place('train', 0, { kind: 'corner', id: corner });
        ctx.move(t, { kind: 'hex', id: h as HexId });
      }
    });
    const c = ctxOf(s);
    const trains = vehiclesOf(c, 0);
    const yieldOf = (t: Piece) =>
      c.reduce('hexYield', c.state.hexes[(t.at as { id: HexId }).id]!, t, { lumber: 1 });
    // Two in the first forest: one paper and one lumber, never two papers.
    expect(yieldOf(trains[0] as Piece)).toEqual({ lumber: 0, paper: 1 });
    expect(yieldOf(trains[2] as Piece)).toEqual({ lumber: 1 });
    expect(yieldOf(trains[1] as Piece)).toEqual({ lumber: 0, paper: 1 });
  });

  it('turns the progress cards to vehicles and knight cards', () => {
    let s = mainTurn(setup(game('lwck-progress')), (ctx) => {
      ctx.player(0).held.politics = [
        { card: 'warlord', acquiredTurn: 1 },
        { card: 'deserter', acquiredTurn: 1 },
        { card: 'diplomat', acquiredTurn: 1 },
      ];
      ctx.player(0).held.science = [{ card: 'roadBuilding', acquiredTurn: 1 }];
      ctx.player(2).played.knight = 2;
    });
    s = act(s, { type: 'playProgress', player: 0, card: 'warlord' } as Action);
    expect(s.players[0]?.held.dev?.map((h) => h.card)).toEqual(['knight']);
    s = act(s, { type: 'playProgress', player: 0, card: 'deserter', target: 2 } as Action);
    expect(s.players[0]?.played.knight).toBe(1);
    expect(s.players[2]?.played.knight).toBe(1);
    const corner = (ctxOf(s).piecesOf(0, 'city')[0]?.at as { id: CornerId }).id;
    s = act(s, {
      type: 'playProgress',
      player: 0,
      card: 'roadBuilding',
      vehicle: 'train',
      corner,
    } as Action);
    expect(vehiclesOf(ctxOf(s), 0)).toHaveLength(1);
    s = act(s, { type: 'playProgress', player: 0, card: 'diplomat' } as Action);
    expect(lwData(ctxOf(s)).boost.points).toBe(2);
  });

  it('gives a tied Largest Army to the player with a Fortress', () => {
    let s = mainTurn(setup(game('lwck-army')), (ctx) => {
      ctx.player(0).played.knight = 3;
      ctx.player(1).played.knight = 3;
    });
    s = act(s, { type: 'endTurn', player: 0 });
    expect((s.data.base as { largestArmy: number | null }).largestArmy).toBeNull();
    s = edit(s, (ctx) => {
      ckData(ctx).levels[1] = { science: 0, trade: 0, politics: 3 } as never;
    });
    s = edit(s, (ctx) => ctx.setPhase({ id: 'main' }));
    s = act(s, { type: 'endTurn', player: 1 });
    expect((s.data.base as { largestArmy: number | null }).largestArmy).toBe(1);
  });
});

describe('Land & Water with Cities & Knights, in a random game', () => {
  function rng(seed: number): () => number {
    let x = seed >>> 0 || 1;
    return () => {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      return (x >>> 0) / 4294967296;
    };
  }
  it('plays without getting stuck', () => {
    const rand = rng(29);
    let s = game('lwck-random');
    let attacks = 0;
    for (let i = 0; i < 8000 && s.winner === null; i++) {
      const seat = lib.waitingOn(s)[0];
      expect(seat, `${s.phase.id} at step ${i}`).toBeDefined();
      const options = lib.legalActions(s, seat as number);
      expect(options.length, `${s.phase.id} at step ${i}`).toBeGreaterThan(0);
      const pick =
        options.find((a) => ['buildSettlement', 'buildCity'].includes(a.type)) ??
        options.find((a) => a.type === 'buildVehicle' && rand() < 0.5) ??
        options.find((a) => a.type === 'activateVehicle') ??
        (rand() < 0.6 ? options.find((a) => a.type === 'moveVehicle') : undefined) ??
        options[Math.floor(rand() * options.length)];
      const r = lib.apply(s, pick as Action);
      if (r.events.some((e) => e.type === 'barbarianAttack')) attacks++;
      s = r.state;
    }
    expect(s.turn.number).toBeGreaterThan(20);
    expect(attacks).toBeGreaterThan(0);
  }, 90_000);
});
