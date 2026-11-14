import { describe, expect, it } from 'vitest';
import { Ctx, ModuleLibrary, type Action, type CornerId, type GameState } from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { seafarersModule } from '@colonizers/module-seafarers';
import {
  activeTracks,
  citiesKnightsModule,
  citiesOf,
  eventFaces,
  levels,
} from '@colonizers/module-cities-knights';
import { churchModule } from '@colonizers/module-church';
import { generateBoard } from '@colonizers/maps';
import { witchesModule } from '../src/index.ts';

const lib = new ModuleLibrary([
  baseModule,
  seafarersModule,
  citiesKnightsModule,
  churchModule,
  witchesModule,
]);

function game(seed = 'witches', modules = ['base', 'cities-knights', 'witches']): GameState {
  const board = generateBoard({ seed, players: 4, mode: 'classic' });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C', 'D'],
    modules,
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

function rng(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function finishSetup(state: GameState): GameState {
  let s = state;
  const rand = rng(3);
  while (s.phase.id === 'setup') {
    const seat = lib.waitingOn(s)[0]!;
    const options = lib.legalActions(s, seat);
    s = act(s, options[Math.floor(rand() * options.length)]!);
  }
  return s;
}

const main = (s: GameState, seat = 0) =>
  edit(s, (ctx) => {
    ctx.state.turn.player = seat;
    ctx.setPhase({ id: 'main' });
  });

const give = (s: GameState, seat: number, cards: Record<string, number>) =>
  edit(s, (ctx) => ctx.grant(seat, cards));

const legal = (s: GameState, seat: number, type: string) =>
  lib.legalActions(s, seat).filter((a) => a.type === type);

const cityOf = (s: GameState, seat: number): CornerId =>
  (citiesOf(ctxOf(s), seat)[0]!.at as { id: CornerId }).id;

const start = (modules?: string[]) => main(finishSetup(game('witches', modules)));

describe('Witches, Wizards & Dragons', () => {
  it('adds Magic and a ten-sided die; with Church, five tracks and twelve sides', () => {
    const alone = ctxOf(game());
    expect(activeTracks(alone)).toEqual(['science', 'trade', 'politics', 'magic']);
    expect(eventFaces(alone)).toHaveLength(10);
    const both = ctxOf(game('both', ['base', 'cities-knights', 'church', 'witches']));
    expect(activeTracks(both)).toEqual(['science', 'trade', 'politics', 'magic', 'religion']);
    const faces = eventFaces(both);
    expect(faces).toHaveLength(12);
    expect(faces.filter((f) => f === 'ship')).toHaveLength(6);
    expect(faces).toContain('joker');
    // Witch Burning joins the Religion deck.
    expect(both.state.decks.religion).toHaveLength(18);
    expect(both.state.decks.religion).toContain('witchBurning');
  });

  it('a Citadel opens Magic, is worth a point and turns a brick into Crystal', () => {
    let s = give(start(), 0, { ore: 1, brick: 2, crystal: 3 });
    expect(legal(s, 0, 'improveCity').some((a) => a.track === 'magic')).toBe(false);
    const vp = ctxOf(s).vp(0);
    const corner = cityOf(s, 0);
    s = act(s, { type: 'buildCitySeat', player: 0, seat: 'citadel', corner });
    expect(ctxOf(s).vp(0)).toBe(vp + 1);
    expect(legal(s, 0, 'buildCitySeat')).toHaveLength(0);
    expect(legal(s, 0, 'improveCity').some((a) => a.track === 'magic')).toBe(true);
    const ctx = ctxOf(s);
    const city = ctx.buildingAt(corner)!;
    const hills = Object.values(ctx.state.hexes).find((h) => h.type === 'hills')!;
    expect(ctx.reduce('hexYield', hills, city, { brick: 2 })).toEqual({ brick: 1, crystal: 1 });
  });

  it('a settlement goes straight to a Citadel for 3 ore, 2 grain and 2 brick', () => {
    let s = give(start(), 0, { ore: 3, grain: 2, brick: 2 });
    const town = ctxOf(s).piecesOf(0, 'settlement')[0];
    if (!town) return;
    const corner = (town.at as { id: CornerId }).id;
    const before = { ...ctxOf(s).player(0).hand };
    s = act(s, { type: 'buildCitySeat', player: 0, seat: 'citadel', corner });
    const ctx = ctxOf(s);
    expect(ctx.buildingAt(corner)!.type).toBe('city');
    const paid = (r: string) => (before[r] ?? 0) - (ctx.player(0).hand[r] ?? 0);
    expect([paid('ore'), paid('grain'), paid('brick')]).toEqual([3, 2, 2]);
  });

  it('a city is a Diocese or a Citadel, not both', () => {
    let s = give(start(['base', 'cities-knights', 'church', 'witches']), 0, {
      ore: 1,
      brick: 3,
      grain: 1,
      lumber: 1,
    });
    const corner = cityOf(s, 0);
    s = act(s, { type: 'buildCitySeat', player: 0, seat: 'diocese', corner });
    expect(() => act(s, { type: 'buildCitySeat', player: 0, seat: 'citadel', corner })).toThrow(
      /already a Diocese/,
    );
  });

  it('the Magic Kitchen swaps brick 1:1 for other resources on your turn', () => {
    let s = edit(give(start(), 0, { brick: 2 }), (ctx) => (levels(ctx, 0).magic = 3));
    s = act(s, { type: 'bankTrade', player: 0, give: 'brick', get: 'ore' });
    expect(ctxOf(s).player(0).hand.brick).toBe(1);
    expect(() => act(s, { type: 'bankTrade', player: 0, give: 'brick', get: 'crystal' })).toThrow();
  });

  it('level 4 in Science stops Magic at level 3', () => {
    let s = edit(start(), (ctx) => {
      levels(ctx, 0).science = 4;
      levels(ctx, 0).magic = 3;
    });
    const corner = cityOf(s, 0);
    s = give(s, 0, { ore: 1, brick: 2, crystal: 4 });
    s = act(s, { type: 'buildCitySeat', player: 0, seat: 'citadel', corner });
    expect(() => act(s, { type: 'improveCity', player: 0, track: 'magic' })).toThrow(
      /level 4 in science/,
    );
  });
});

describe('Witches, Wizards & Dragons, played at random', () => {
  for (const [seed, modules] of [
    ['hzd-a', ['base', 'cities-knights', 'witches']],
    ['hzd-b', ['base', 'cities-knights', 'church', 'witches']],
  ] as const)
    it(`never gets stuck (${seed})`, () => {
      let s = finishSetup(game(seed, [...modules]));
      const rand = rng(seed.length * 7 + seed.charCodeAt(4));
      const seen = new Set<string>();
      for (let i = 0; i < 3000 && s.winner === null; i++) {
        const seats = lib.waitingOn(s);
        expect(seats.length).toBeGreaterThan(0);
        const options = seats.flatMap((seat) => lib.legalActions(s, seat));
        expect(options.length).toBeGreaterThan(0);
        const pool = options.filter((a) => !a.type.endsWith('Trade') && a.type !== 'offerTrade');
        const from = pool.length ? pool : options;
        if (options.some((o) => o.type === 'buildCitySeat' && o.seat === 'citadel'))
          seen.add('could:citadel');
        const a = from[Math.floor(rand() * from.length)]!;
        seen.add(a.type === 'buildCitySeat' ? `seat:${a.seat as string}` : a.type);
        s = act(s, a);
      }
      expect(seen.has('could:citadel')).toBe(true);
    }, 120_000);
});
