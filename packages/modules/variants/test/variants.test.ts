import { describe, expect, it } from 'vitest';
import { Ctx, ModuleLibrary, type Action, type GameState } from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { seafarersModule } from '@colonizers/module-seafarers';
import { citiesKnightsModule } from '@colonizers/module-cities-knights';
import { generateBoard } from '@colonizers/maps';
import { chooseAction, newMemory, type BotConfig, type BotMemory } from '@colonizers/bots';
import { stateFromView } from '@colonizers/engine';
import {
  damagedRoads,
  duelData,
  EVENT_DECK,
  eventData,
  partnerOf,
  tokensOf,
  variantsModule,
} from '../src/index.ts';

const lib = new ModuleLibrary([baseModule, seafarersModule, variantsModule, citiesKnightsModule]);

function rng(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function game(players: number, settings: Record<string, unknown>, seed = 'v'): GameState {
  const board = generateBoard({ seed, players, mode: 'classic' });
  return lib.createGame({
    seed,
    players: Array.from({ length: players }, (_, i) => `P${i}`),
    modules: ['base', 'variants'],
    map: board.map,
    settings: { vpTarget: 10, ...settings },
    fixedSeats: true,
  }).state;
}

function edit(state: GameState, fn: (ctx: Ctx) => void): GameState {
  const next = structuredClone(state);
  const ctx = new Ctx(next, lib.registry(next.modules));
  fn(ctx);
  ctx.commit();
  return next;
}

const act = (s: GameState, a: Action) => lib.apply(s, a).state;

function finishSetup(s: GameState): GameState {
  const rand = rng(3);
  while (s.phase.id === 'setup') {
    const seat = lib.waitingOn(s)[0]!;
    const options = lib.legalActions(s, seat);
    s = act(s, options[Math.floor(rand() * options.length)]!);
  }
  return s;
}

/** Rolls until the game is in the main phase without a 7 getting in the way. */
function toMain(s: GameState): GameState {
  for (let i = 0; i < 50 && s.phase.id !== 'main'; i++) {
    const seat = lib.waitingOn(s)[0]!;
    const options = lib.legalActions(s, seat);
    s = act(s, options.find((a) => a.type === 'roll') ?? options[0]!);
  }
  return s;
}

const rich = { brick: 2, lumber: 2, wool: 2, grain: 2, ore: 2 };

function play(s: GameState, bots: BotConfig[], seed: number, max = 8000) {
  const rand = rng(seed);
  const memory: BotMemory[] = bots.map(() => newMemory());
  let clock = 0;
  for (let i = 0; i < max && s.winner === null; i++) {
    clock += 1000;
    const waiting = lib.waitingOn(s);
    if (!waiting.length) throw new Error(`Nobody can act in ${s.phase.id}`);
    let acted = false;
    for (const seat of [...waiting].sort(() => rand() - 0.5)) {
      const a = chooseAction(lib, s, seat, bots[seat]!, memory[seat]!, {
        rand,
        now: clock,
        budgetMs: 200,
      });
      if (!a) continue;
      s = act(s, a);
      acted = true;
      break;
    }
    if (!acted) clock += 20_000;
    if (
      !acted &&
      !lib
        .waitingOn(s)
        .some((x) =>
          lib
            .legalActions(s, x)
            .some((a) => a.type === 'endTurn' || a.type === 'roll' || a.type === 'endSpecialBuild'),
        )
    )
      throw new Error(`Stuck in ${s.phase.id}`);
  }
  return s;
}

describe('Special Building Phase', () => {
  it('lets every other player build in order after a turn, then moves on', () => {
    let s = toMain(finishSetup(game(5, { turnMode: 'specialBuild' })));
    const active = s.turn.player;
    s = edit(s, (ctx) => {
      for (const p of ctx.state.players) ctx.grant(p.seat, rich);
    });
    s = act(s, { type: 'endTurn', player: active });
    const queue = [1, 2, 3, 4].map((k) => (active + k) % 5);
    expect(s.phase).toMatchObject({ id: 'specialBuild', queue });
    const first = queue[0]!;
    // Only the first in line may build, and only builds.
    expect(lib.legalActions(s, queue[1]!)).toEqual([]);
    const mine = lib.legalActions(s, first).map((a) => a.type);
    expect(mine).toContain('buildRoad');
    expect(mine).toContain('endSpecialBuild');
    expect(mine).not.toContain('bankTrade');
    expect(mine).not.toContain('playDevCard');
    const road = lib.legalActions(s, first).find((a) => a.type === 'buildRoad')!;
    s = act(s, road);
    expect(s.phase.id).toBe('specialBuild');
    expect(s.turn.player).toBe(active);
    for (const seat of queue) s = act(s, { type: 'endSpecialBuild', player: seat });
    expect(s.phase.id).toBe('roll');
    expect(s.turn.player).toBe(first);
  });

  it('five bots finish a game with it', () => {
    const m: BotConfig = { level: 'medium', style: 'balanced' };
    const s = play(game(5, { turnMode: 'specialBuild' }, 'sbp'), [m, m, m, m, m], 1);
    expect(s.winner).not.toBeNull();
  }, 120_000);
});

describe('Paired turns', () => {
  it('lets the partner build and trade with the bank during the turn', () => {
    let s = toMain(finishSetup(game(6, { turnMode: 'paired' })));
    s = edit(s, (ctx) => {
      for (const p of ctx.state.players) ctx.grant(p.seat, rich);
    });
    const active = s.turn.player;
    const partner = partnerOf(active, 6)!;
    expect(partner).toBe((active + 3) % 6);
    const theirs = lib.legalActions(s, partner).map((a) => a.type);
    expect(theirs).toContain('buildRoad');
    expect(theirs).toContain('bankTrade');
    expect(theirs).not.toContain('endTurn');
    expect(theirs).not.toContain('offerTrade');
    const other = (active + 1) % 6;
    expect(lib.legalActions(s, other).filter((a) => a.type.startsWith('build'))).toEqual([]);
    s = act(
      s,
      lib.legalActions(s, partner).find((a) => a.type === 'buildRoad')!,
    );
    expect(s.turn.player).toBe(active);
    expect(s.phase.id).toBe('main');
  });

  it('eight bots finish a game on the big board', () => {
    const m: BotConfig = { level: 'medium', style: 'balanced' };
    const s = play(game(8, { turnMode: 'paired' }, 'p8'), Array(8).fill(m), 2, 12000);
    expect(s.winner).not.toBeNull();
  }, 240_000);
});

describe('Options', () => {
  it('balanced dice deal every outcome once before reshuffling, and stay hidden', () => {
    let s = finishSetup(game(4, { balancedDice: true }));
    const seen = new Set<string>();
    for (let i = 0; i < 26; i++) {
      s = edit(s, (ctx) => {
        const r = ctx.rollDice();
        seen.add(JSON.stringify(r.dice));
      });
    }
    expect(seen.size).toBe(26);
    const view = lib.view(s, 0);
    expect((view.data.variants as { deck: unknown[] }).deck).toEqual([]);
  });

  it('a 7 does nothing during the quiet rounds', () => {
    let s = finishSetup(game(4, { balancedDice: true, robberFreeRounds: 2 }));
    s = edit(s, (ctx) => {
      ctx.state.data.variants = { deck: [[3, 4]], reshuffleAt: 0, left: 1 };
      ctx.grant(1, { ore: 9 });
    });
    s = act(s, { type: 'roll', player: s.turn.player });
    expect(s.phase.id).toBe('main');
  });

  it('the friendly robber spares players with 2 or fewer points', () => {
    let s = finishSetup(game(4, { friendlyRobber: true }));
    s = edit(s, (ctx) => ctx.setPhase({ id: 'moveRobber', returnTo: 'main' }));
    const mover = s.turn.player;
    const ctx = new Ctx(s, lib.registry(s.modules));
    const hexes = lib.legalActions(s, mover).map((a) => a.hex as string);
    // Everyone has 2 points after setup, so no hex next to another player is allowed.
    for (const h of hexes) {
      const owners = (ctx.geometry.hexCorners.get(h as never) ?? [])
        .map((c) => ctx.buildingAt(c)?.owner)
        .filter((o) => o !== undefined && o !== null && o !== mover);
      expect(owners).toEqual([]);
    }
    expect(hexes.length).toBeGreaterThan(0);
  });

  it('the robber goes home at the end of a turn it moved', () => {
    let s = toMain(finishSetup(game(4, { robberHome: true })));
    const at = (st: GameState) => Object.values(st.pieces).find((p) => p.type === 'robber')?.at;
    const home = at(s);
    expect(home?.kind).toBe('hex');
    s = edit(s, (ctx) => ctx.setPhase({ id: 'moveRobber', returnTo: 'main' }));
    const move = lib.legalActions(s, s.turn.player).find((a) => a.type === 'moveRobber')!;
    s = act(s, move);
    while (s.phase.id !== 'main') {
      const seat = lib.waitingOn(s)[0]!;
      s = act(s, lib.legalActions(s, seat)[0]!);
    }
    expect(at(s)).not.toEqual(home);
    s = act(s, { type: 'endTurn', player: s.turn.player });
    expect(at(s)).toEqual(home);
  });

  it('open trading lets anyone offer, one offer at a time', () => {
    let s = toMain(finishSetup(game(4, { openTrading: true })));
    const me = s.turn.player;
    const a = (me + 1) % 4;
    const b = (me + 2) % 4;
    s = edit(s, (ctx) => {
      ctx.grant(a, { wool: 1 });
      ctx.grant(b, { ore: 1 });
      ctx.grant(me, { grain: 1 });
    });
    expect(lib.legalActions(s, a).some((x) => x.type === 'offerTrade')).toBe(true);
    s = act(s, { type: 'offerTrade', player: a, give: { wool: 1 }, get: { ore: 1 } });
    expect(() =>
      act(s, { type: 'offerTrade', player: me, give: { grain: 1 }, get: { ore: 1 } }),
    ).toThrow();
    const id = (s.data.base as { trade: { id: number } }).trade.id;
    s = act(s, { type: 'respondTrade', player: b, offer: id, accept: true });
    const ore = s.players[a]!.hand.ore ?? 0;
    s = act(s, { type: 'confirmTrade', player: a, offer: id, with: b });
    expect(s.players[a]!.hand.ore).toBe(ore + 1);
    const off = toMain(finishSetup(game(4, {})));
    const other = (off.turn.player + 1) % 4;
    const rich2 = edit(off, (ctx) => ctx.grant(other, { wool: 1 }));
    expect(() =>
      act(rich2, { type: 'offerTrade', player: other, give: { wool: 1 }, get: { ore: 1 } }),
    ).toThrow();
  });

  it('gifts move cards on your own turn only', () => {
    let s = toMain(finishSetup(game(4, { gifting: true })));
    const me = s.turn.player;
    const to = (me + 1) % 4;
    s = edit(s, (ctx) => ctx.grant(me, { wool: 2 }));
    const before = s.players[to]!.hand.wool ?? 0;
    s = act(s, { type: 'giveCards', player: me, to, cards: { wool: 2 } });
    expect(s.players[to]!.hand.wool).toBe(before + 2);
    expect(() => act(s, { type: 'giveCards', player: to, to: me, cards: { wool: 1 } })).toThrow();
    const off = toMain(finishSetup(game(4, {})));
    expect(() =>
      act(off, {
        type: 'giveCards',
        player: off.turn.player,
        to: (off.turn.player + 1) % 4,
        cards: { wool: 1 },
      }),
    ).toThrow();
  });
});

describe('Event cards', () => {
  it('the deck has 36 cards spread like two dice', () => {
    expect(EVENT_DECK).toHaveLength(36);
    const count = (t: number) => EVENT_DECK.filter((c) => c.total === t).length;
    for (let t = 2; t <= 12; t++) expect(count(t)).toBe(6 - Math.abs(7 - t));
  });

  it('random games finish, every event comes up, and moves match what players can see', () => {
    const seen = new Set<string>();
    let finished = 0;
    for (let g = 0; g < 3; g++) {
      let s = game(4, { eventCards: true }, `ev-${g}`);
      const rand = rng(g + 5);
      for (let i = 0; i < 9000 && s.winner === null; i++) {
        const waiting = lib.waitingOn(s);
        if (!waiting.length) throw new Error(`Nobody can act in ${JSON.stringify(s.phase)}`);
        const seat = waiting[Math.floor(rand() * waiting.length)]!;
        const options = lib.legalActions(s, seat);
        if (i % 9 === 0) {
          const key = (a: Action) => JSON.stringify(a, Object.keys(a).sort());
          const mine = lib
            .legalActions(stateFromView(lib.view(s, seat)), seat)
            .filter((a) => a.type !== 'confirmTrade')
            .map(key)
            .sort();
          const real = options
            .filter((a) => a.type !== 'confirmTrade')
            .map(key)
            .sort();
          expect(mine).toEqual(real);
        }
        const weights = options.map((a) =>
          a.type === 'buildSettlement' || a.type === 'buildCity'
            ? 50
            : a.type === 'buildRoad' || a.type === 'repairRoad'
              ? 8
              : a.type === 'offerTrade'
                ? 0.2
                : 1,
        );
        let r = rand() * weights.reduce((x, y) => x + y, 0);
        let pick = options[options.length - 1]!;
        for (let k = 0; k < options.length; k++) {
          r -= weights[k]!;
          if (r <= 0) {
            pick = options[k]!;
            break;
          }
        }
        s = act(s, pick);
        const ev = eventData(new Ctx(s, lib.registry(s.modules))).lastEvent;
        if (ev) seen.add(ev.event);
      }
      if (s.winner !== null) finished++;
    }
    expect(finished).toBeGreaterThanOrEqual(2);
    expect(seen.size).toBe(12);
  }, 120_000);

  it('epidemic: cities pay only one card', () => {
    let s = finishSetup(game(4, { eventCards: true }));
    const seat = s.turn.player;
    let token = 0;
    s = edit(s, (ctx) => {
      const city = ctx.piecesOf(seat, 'settlement')[0]!;
      ctx.upgrade(city, 'city');
      const hex = ctx.geometry.cornerHexes
        .get((city.at as unknown as { id: never }).id)!
        .map((h) => ctx.state.hexes[h]!)
        .find((h) => h.token && h.token !== 7)!;
      token = hex.token!;
      for (const p of Object.values(ctx.state.pieces)) if (p.type === 'robber') ctx.remove(p);
    });
    const rollWith = (event: 'epidemic' | 'prospers') => {
      const t = edit(s, (ctx) => {
        eventData(ctx).eventDeck = [...EVENT_DECK.slice(0, 10), { total: token, event }];
      });
      const r = act(t, { type: 'roll', player: seat });
      return Object.values(r.players[seat]!.hand).reduce((x, y) => x + y, 0);
    };
    expect(rollWith('epidemic')).toBe(rollWith('prospers') - 1);
  });

  it('earthquake: everyone damages a road, no new roads until it is repaired', () => {
    let s = finishSetup(game(4, { eventCards: true }));
    const seat = s.turn.player;
    s = edit(s, (ctx) => {
      eventData(ctx).eventDeck = [...EVENT_DECK.slice(0, 10), { total: 6, event: 'earthquake' }];
    });
    s = act(s, { type: 'roll', player: seat });
    expect(s.phase.id).toBe('eventPick');
    for (const p of [0, 1, 2, 3]) s = act(s, lib.legalActions(s, p)[0]!);
    const ctx = new Ctx(s, lib.registry(s.modules));
    expect(damagedRoads(ctx)).toHaveLength(4);
    s = edit(s, (c) => {
      c.player(seat).hand = { brick: 3, lumber: 3 };
    });
    const road = lib.legalActions(s, seat).find((a) => a.type === 'buildRoad');
    expect(road).toBeUndefined();
    const fix = lib.legalActions(s, seat).find((a) => a.type === 'repairRoad')!;
    s = act(s, fix);
    expect(lib.legalActions(s, seat).some((a) => a.type === 'buildRoad')).toBe(true);
  });

  it('plentiful year: everyone takes a resource of their choice', () => {
    let s = finishSetup(game(4, { eventCards: true }));
    const seat = s.turn.player;
    s = edit(s, (ctx) => {
      eventData(ctx).eventDeck = [...EVENT_DECK.slice(0, 10), { total: 2, event: 'plentifulYear' }];
      for (const p of ctx.state.players) p.hand = {};
    });
    s = act(s, { type: 'roll', player: seat });
    expect(lib.waitingOn(s).sort()).toEqual([0, 1, 2, 3]);
    const before = s.players.map((p) => p.hand.ore ?? 0);
    for (const p of [0, 1, 2, 3]) s = act(s, { type: 'eventPick', player: p, resource: 'ore' });
    expect(s.phase.id).toBe('main');
    s.players.forEach((p, i) => expect(p.hand.ore).toBe(before[i]! + 1));
  });
});

describe('Two-player duel rules', () => {
  const neutrals = (s: GameState, type: string) =>
    Object.values(s.pieces).filter((p) => p.type === type && p.props.neutral !== undefined);

  it('start two neutral builders with 2 settlements and a road each', () => {
    const s = game(2, { twoPlayer: true }, 'duel');
    expect(neutrals(s, 'settlement')).toHaveLength(4);
    expect(neutrals(s, 'road')).toHaveLength(4);
    for (const n of [0, 1])
      expect(neutrals(s, 'settlement').filter((p) => p.props.neutral === n)).toHaveLength(2);
    // Not with three players.
    expect(neutrals(game(3, { twoPlayer: true }, 'duel'), 'settlement')).toHaveLength(0);
  });

  it('roll twice a turn, never the same total twice', () => {
    let s = finishSetup(game(2, { twoPlayer: true, robberFreeRounds: 99 }, 'duel'));
    for (let turn = 0; turn < 12; turn++) {
      const seat = s.turn.player;
      s = act(s, { type: 'roll', player: seat });
      const first = (s.data.base as { lastRoll: { total: number } }).lastRoll.total;
      expect(s.phase.id).toBe('roll');
      s = act(s, { type: 'roll', player: seat });
      const second = (s.data.base as { lastRoll: { total: number } }).lastRoll.total;
      expect(second).not.toBe(first);
      expect(s.phase.id).toBe('main');
      s = act(s, { type: 'endTurn', player: seat });
    }
  });

  it('make each road and settlement bring a free neutral one', () => {
    let s = toMain(finishSetup(game(2, { twoPlayer: true, robberFreeRounds: 99 }, 'duel')));
    s = toMain(s);
    const me = s.turn.player;
    s = edit(s, (c) => c.grant(me, rich));
    const road = lib.legalActions(s, me).find((a) => a.type === 'buildRoad')!;
    s = act(s, road);
    expect(s.phase.id).toBe('neutralBuild');
    const options = lib.legalActions(s, me);
    expect(options.every((a) => a.type === 'neutralRoad')).toBe(true);
    expect(lib.legalActions(s, 1 - me)).toEqual([]);
    const before = neutrals(s, 'road').length;
    s = act(s, options[0]!);
    expect(neutrals(s, 'road')).toHaveLength(before + 1);
    expect(s.phase.id).toBe('main');
  });

  it('block player roads at neutral settlements', () => {
    const s = game(2, { twoPlayer: true }, 'duel');
    const c = new Ctx(s, lib.registry(s.modules));
    const at = neutrals(s, 'settlement')[0]!.at;
    expect(at.kind === 'corner' && c.blocksRouteAt(at.id, 0)).toBe(true);
  });

  it('spend trade tokens on a forced trade or sending the robber home', () => {
    let s = toMain(finishSetup(game(2, { twoPlayer: true, robberFreeRounds: 99 }, 'duel')));
    s = toMain(s);
    const me = s.turn.player;
    const other = 1 - me;
    expect(lib.check(s, { type: 'forceTrade', player: me })).toMatch(/token/);
    s = edit(s, (c) => {
      duelData(c).tokens[me] = 3;
      c.player(other).hand = { ore: 2 };
      c.player(me).hand = { wool: 2 };
      // Move the robber off the desert.
      const robber = c.piecesOfType('robber')[0]!;
      const hex = Object.values(c.state.hexes).find((h) => h.type === 'fields')!;
      c.move(robber, { kind: 'hex', id: hex.id });
    });
    s = act(s, { type: 'forceTrade', player: me });
    expect(s.phase.id).toBe('giveBack');
    expect(s.players[me]!.hand).toMatchObject({ ore: 2, wool: 2 });
    expect(lib.check(s, { type: 'giveBack', player: me, cards: { wool: 1 } })).toMatch(/2/);
    s = act(s, { type: 'giveBack', player: me, cards: { wool: 2 } });
    expect(s.players[other]!.hand).toMatchObject({ wool: 2, ore: 0 });
    expect(s.phase.id).toBe('main');
    const left = tokensOf(new Ctx(s, lib.registry(s.modules)), me);
    expect(left).toBeLessThan(3);
    s = act(s, { type: 'robberHome', player: me });
    const robber = Object.values(s.pieces).find((p) => p.type === 'robber')!;
    expect(robber.at.kind === 'hex' && s.hexes[robber.at.id]!.type).toBe('desert');
  });

  it('two bots finish a duel', () => {
    const m: BotConfig = { level: 'medium', style: 'balanced' };
    const s = play(game(2, { twoPlayer: true }, 'duel-bots'), [m, m], 4);
    expect(s.winner).not.toBeNull();
    expect(neutrals(s, 'road').length).toBeGreaterThan(4);
  }, 120_000);
});
