import { describe, expect, it } from 'vitest';
import { Ctx, ModuleLibrary, type Action, type GameState } from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { seafarersModule } from '@colonizers/module-seafarers';
import { citiesKnightsModule } from '@colonizers/module-cities-knights';
import { generateBoard } from '@colonizers/maps';
import { chooseAction, newMemory, type BotConfig, type BotMemory } from '@colonizers/bots';
import { partnerOf, variantsModule } from '../src/index.ts';

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
