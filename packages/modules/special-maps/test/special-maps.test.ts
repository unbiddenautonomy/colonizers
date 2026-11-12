import { describe, expect, it } from 'vitest';
import { Ctx, ModuleLibrary, Rng, type Action, type GameState } from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { seafarersModule } from '@colonizers/module-seafarers';
import { generateSpecialBoard, SPECIAL_MAPS } from '@colonizers/maps';
import { chooseAction, newMemory, type BotConfig, type BotMemory } from '@colonizers/bots';
import { specialMapsModule } from '../src/index.ts';

const lib = new ModuleLibrary([baseModule, seafarersModule, specialMapsModule]);

function rng(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function game(map: string, players: number, seed = 'sm'): GameState {
  const b = generateSpecialBoard({ seed, players, map });
  return lib.createGame({
    seed,
    players: Array.from({ length: players }, (_, i) => `P${i}`),
    modules: b.modules,
    map: b.map,
    settings: { vpTarget: 10, ...b.settings },
    fixedSeats: true,
  }).state;
}

function play(s: GameState, players: number, seed: number, max = 8000): GameState {
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
      s = lib.apply(s, a).state;
      acted = true;
      break;
    }
    if (!acted) clock += 20_000;
  }
  return s;
}

describe('Special maps', () => {
  for (const spec of SPECIAL_MAPS) {
    const players = Math.min(4, spec.players.max);
    it(`bots finish a ${players}-player game on ${spec.name}`, () => {
      const s = play(game(spec.id, players), players, 7);
      expect(s.winner).not.toBeNull();
    }, 120_000);
  }

  it('a volcano erupts on its number: a settlement is lost, a city drops a level', () => {
    let s = game('volcano', 4);
    const rand = rng(1);
    while (s.phase.id === 'setup') {
      const seat = lib.waitingOn(s)[0]!;
      const o = lib.legalActions(s, seat);
      s = lib.apply(s, o[Math.floor(rand() * o.length)]!).state;
    }
    const volcano = Object.values(s.hexes).find((h) => h.type === 'volcano')!;
    // Put a city and settlements around the volcano.
    const base = structuredClone(s);
    const ctx = new Ctx(base, lib.registry(base.modules));
    const corners = ctx.geometry.hexCorners.get(volcano.id)!;
    for (const c of corners) {
      const b = ctx.buildingAt(c);
      if (b) ctx.remove(b);
    }
    ctx.place('city', 0, { kind: 'corner', id: corners[0]! });
    ctx.place('settlement', 1, { kind: 'corner', id: corners[3]! });
    ctx.commit();
    let erupted: { face: number; hit: string | null } | null = null;
    for (let k = 0; k < 4000 && !erupted?.hit; k++) {
      const t = structuredClone(base);
      t.rng = Rng.fromSeed(`roll${k}`).getState();
      const r = lib.apply(t, { type: 'roll', player: t.turn.player } as Action);
      const e = r.events.find((x) => x.type === 'eruption');
      if (!e) continue;
      erupted = e as unknown as { face: number; hit: string | null };
      if (erupted.face === 1) {
        const at = Object.values(r.state.pieces).find(
          (p) => p.at.kind === 'corner' && p.at.id === corners[0],
        );
        expect(at?.type).toBe('settlement');
        expect(at?.owner).toBe(0);
      }
      if (erupted.face === 4) {
        expect(
          Object.values(r.state.pieces).some(
            (p) => p.at.kind === 'corner' && p.at.id === corners[3],
          ),
        ).toBe(false);
      }
    }
    expect(erupted?.hit).toBeTruthy();
  });

  it('keeps the robber off lakes', () => {
    const s = game('lakes', 4);
    const ctx = new Ctx(s, lib.registry(s.modules));
    const lake = Object.values(s.hexes).find((h) => h.type === 'lake')!;
    expect(ctx.isLand(lake.id)).toBe(false);
    expect(lib.registry(s.modules).hexTypes.lake!.robber).toBe(false);
  });
});
