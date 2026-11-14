import { describe, expect, it } from 'vitest';
import { Ctx, ModuleLibrary, type Action, type CornerId, type GameState } from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { seafarersModule } from '@colonizers/module-seafarers';
import {
  activeTracks,
  citiesKnightsModule,
  ckData,
  citiesOf,
  drawProgress,
  eventFaces,
  hasAbility,
  levels,
  progressCount,
} from '@colonizers/module-cities-knights';
import { generateBoard } from '@colonizers/maps';
import { churchModule, churchView, festivalsOf } from '../src/index.ts';
import { brewBeer } from '../src/rules.ts';

const lib = new ModuleLibrary([baseModule, seafarersModule, citiesKnightsModule, churchModule]);

function game(seed = 'church'): GameState {
  const board = generateBoard({ seed, players: 4, mode: 'classic' });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C', 'D'],
    modules: ['base', 'cities-knights', 'church'],
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

const hold = (s: GameState, seat: number, card: string) =>
  edit(s, (ctx) => {
    (ctx.player(seat).held.religion ??= []).push({ card, acquiredTurn: -1 });
  });

const start = () => main(finishSetup(game()));

describe('Church, Faith & Reformation', () => {
  it('adds Religion, a ten-sided die with a joker, and seventeen Religion cards', () => {
    const ctx = ctxOf(game());
    expect(activeTracks(ctx)).toEqual(['science', 'trade', 'politics', 'religion']);
    expect(eventFaces(ctx)).toHaveLength(10);
    expect(eventFaces(ctx)).toContain('joker');
    expect(ctx.state.decks.religion).toHaveLength(17);
    expect(ctx.state.decks.religion).not.toContain('witchBurning');
  });

  it('a Diocese opens Religion, is worth a point and turns a grain into Bread', () => {
    let s = give(start(), 0, { grain: 1, brick: 1, lumber: 1, bread: 3 });
    expect(legal(s, 0, 'improveCity').some((a) => a.track === 'religion')).toBe(false);
    s = edit(s, (ctx) => expect(drawProgress(ctx, 0, 'religion')).toBe(false));
    const vp = ctxOf(s).vp(0);
    const corner = cityOf(s, 0);
    s = act(s, { type: 'buildCitySeat', player: 0, seat: 'diocese', corner });
    expect(ctxOf(s).vp(0)).toBe(vp + 1);
    expect(legal(s, 0, 'buildCitySeat')).toHaveLength(0);
    expect(legal(s, 0, 'improveCity').some((a) => a.track === 'religion')).toBe(true);
    const ctx = ctxOf(s);
    const city = ctx.buildingAt(corner)!;
    const fields = Object.values(ctx.state.hexes).find((h) => h.type === 'fields')!;
    expect(ctx.reduce('hexYield', fields, city, { grain: 2 })).toEqual({ grain: 1, bread: 1 });
  });

  it('the Abbey brews a Beer on a roll that brings nothing; the bank takes Beer 4:1 but never sells it', () => {
    let s = edit(start(), (ctx) => {
      levels(ctx, 1).religion = 3;
      ctx.emit({ type: 'production', total: 5, received: { 0: { grain: 1 } } });
      brewBeer(ctx);
    });
    expect(ctxOf(s).player(1).hand.beer).toBe(1);
    expect(ctxOf(s).player(0).hand.beer ?? 0).toBe(0);
    s = give(s, 0, { beer: 4 });
    const ore = ctxOf(s).player(0).hand.ore ?? 0;
    s = act(s, { type: 'bankTrade', player: 0, give: 'beer', get: 'ore' });
    expect(ctxOf(s).player(0).hand.ore).toBe(ore + 1);
    expect(() =>
      act(give(s, 0, { ore: 4 }), { type: 'bankTrade', player: 0, give: 'ore', get: 'beer' }),
    ).toThrow();
  });

  it('a festival shuts down a rival settlement until the host’s next turn', () => {
    let s = give(start(), 0, { beer: 4 });
    const ctx = ctxOf(s);
    const town = ctx.piecesOf(1, 'settlement')[0]!;
    const at = (town.at as { id: string }).id;
    const vp = ctx.vp(1);
    s = act(s, { type: 'holdFestival', player: 0, at });
    expect(ctxOf(s).vp(1)).toBe(vp - 1);
    expect(ctxOf(s).player(0).hand.beer ?? 0).toBe(0);
    expect(legal(s, 0, 'holdFestival')).toHaveLength(0);
    s = act(s, { type: 'endTurn', player: 0 });
    expect(festivalsOf(ctxOf(s))).toHaveLength(1);
    for (let seat = 1; seat < 4; seat++) {
      s = main(s, seat);
      s = act(s, { type: 'endTurn', player: seat });
    }
    expect(festivalsOf(ctxOf(s))).toHaveLength(0);
    expect(ctxOf(s).vp(1)).toBe(vp);
  });

  it('a joker lets the roller pick the gate', () => {
    let s = edit(finishSetup(game()), (ctx) => {
      ckData(ctx).forcedEvent = 'joker';
      ckData(ctx).alchemist = { red: 1, yellow: 3 };
    });
    s = act(s, { type: 'roll', player: s.turn.player });
    expect(s.phase.id).toBe('jokerPick');
    s = act(s, { type: 'pickJoker', player: s.turn.player, deck: 'trade' });
    expect(s.phase.id).not.toBe('jokerPick');
  });

  it('Lent stops building until a grain and a wool are paid', () => {
    let s = hold(start(), 0, 'lent');
    s = act(s, { type: 'playProgress', player: 0, card: 'lent', target: 1 });
    s = give(main(s, 1), 1, { lumber: 1, brick: 1, grain: 1, wool: 1 });
    expect(legal(s, 1, 'buildRoad')).toHaveLength(0);
    s = act(s, { type: 'churchPay', player: 1, debt: 'lent', card: 'grain' });
    expect(churchView(ctxOf(s)).lent).toBeTruthy();
    s = act(s, { type: 'churchPay', player: 1, debt: 'lent', card: 'wool' });
    expect(churchView(ctxOf(s)).lent).toBeNull();
  });

  it('Anathema shuts a Science track and its ability until paid', () => {
    let s = edit(hold(start(), 0, 'anathema'), (ctx) => (levels(ctx, 1).science = 3));
    const play = legal(s, 0, 'playProgress').find((a) => a.card === 'anathema' && a.target === 1)!;
    s = act(s, play);
    expect(hasAbility(ctxOf(s), 1, 'science')).toBe(false);
    const owed = play.cards as Record<string, number>;
    s = give(main(s, 1), 1, owed);
    for (const [card, n] of Object.entries(owed))
      for (let i = 0; i < n; i++)
        s = act(s, { type: 'churchPay', player: 1, debt: 'science', card });
    expect(hasAbility(ctxOf(s), 1, 'science')).toBe(true);
  });

  it('the Inquisitor takes away a city owner’s level 3 abilities', () => {
    let s = edit(hold(start(), 0, 'inquisitor'), (ctx) => (levels(ctx, 2).trade = 3));
    s = act(s, { type: 'playProgress', player: 0, card: 'inquisitor', option: cityOf(s, 2) });
    expect(hasAbility(ctxOf(s), 2, 'trade')).toBe(false);
  });

  it('Census makes others give up a card for each progress card they hold', () => {
    let s = give(hold(hold(start(), 1, 'refuge'), 0, 'census'), 1, { ore: 3 });
    s = act(s, { type: 'playProgress', player: 0, card: 'census' });
    expect(s.phase.id).toBe('discard');
    expect((s.phase.owed as Record<number, number>)[1]).toBe(progressCount(ctxOf(s), 1));
  });

  it('Exile sends the robber away', () => {
    let s = hold(start(), 0, 'exile');
    s = act(s, { type: 'playProgress', player: 0, card: 'exile' });
    expect(ctxOf(s).piecesOfType('robber')).toHaveLength(0);
  });
});

describe('Church, Faith & Reformation, played at random', () => {
  for (const seed of ['kgr-a', 'kgr-b', 'kgr-c'])
    it(`never gets stuck (${seed})`, () => {
      let s = finishSetup(game(seed));
      const rand = rng(seed.length * 7 + seed.charCodeAt(4));
      const seen = new Set<string>();
      for (let i = 0; i < 3000 && s.winner === null; i++) {
        const seats = lib.waitingOn(s);
        expect(seats.length).toBeGreaterThan(0);
        const options = seats.flatMap((seat) => lib.legalActions(s, seat));
        expect(options.length).toBeGreaterThan(0);
        const pool = options.filter((a) => !a.type.endsWith('Trade') && a.type !== 'offerTrade');
        const from = pool.length ? pool : options;
        const a = from[Math.floor(rand() * from.length)]!;
        seen.add(a.type === 'playProgress' ? `card:${a.card as string}` : a.type);
        s = act(s, a);
      }
      expect(seen.has('buildCitySeat') || seen.has('holdFestival') || s.winner !== null).toBe(true);
    }, 120_000);
});
