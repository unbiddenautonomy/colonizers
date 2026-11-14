import { describe, expect, it } from 'vitest';
import {
  Ctx,
  ModuleLibrary,
  type Action,
  type CornerId,
  type EdgeId,
  type GameState,
} from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { seafarersModule } from '@colonizers/module-seafarers';
import { generateSeaBoard } from '@colonizers/maps';
import { ARMY, marchTargets, soldiersModule } from '../src/index.ts';

const lib = new ModuleLibrary([baseModule, seafarersModule, soldiersModule]);

function game(seed = 'soldiers-sea'): GameState {
  const b = generateSeaBoard({ seed, players: 4, scenario: 'new-shores' });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C', 'D'],
    modules: ['base', 'seafarers', 'soldiers'],
    map: b.map,
    settings: { ...b.settings, vpTarget: Number(b.settings.vpTarget) + 3 },
    fixedSeats: true,
  }).state;
}

const ctxOf = (s: GameState) => new Ctx(s, lib.registry(s.modules));
const act = (s: GameState, a: Action) => lib.apply(s, a).state;

function rng(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

describe('Soldiers & Armies with Seafarers', () => {
  it('marches across the sea on anyone’s ships, but not without them', () => {
    const s = structuredClone(game());
    const ctx = ctxOf(s);
    // A coastal corner with a sea edge leading out of it.
    const sea = ctx.geometry.edges.find((e) => ctx.isSeaEdge(e) && !ctx.isLandEdge(e)) as EdgeId;
    const [a, b] = ctx.geometry.edgeCorners.get(sea) as [CornerId, CornerId];
    s.turn = { number: 1, player: 0, round: 0 };
    const army = ctx.place(ARMY, 0, { kind: 'corner', id: a }, { infantry: 1 });
    ctx.setPhase({ id: 'campaign' });
    ctx.commit();
    expect(marchTargets(ctxOf(s), army, 1).has(b)).toBe(false);
    const c2 = ctxOf(s);
    c2.place('ship', 2, { kind: 'edge', id: sea });
    c2.commit();
    expect(marchTargets(ctxOf(s), s.pieces[army.id]!, 1).has(b)).toBe(true);
  });

  it('plays out random games to a winner', () => {
    for (const seed of [1, 2]) {
      const rand = rng(seed);
      let s = game(`sea-random-${seed}`);
      for (let i = 0; i < 12000 && s.winner === null; i++) {
        const seat = lib.waitingOn(s)[0];
        expect(seat, `${s.phase.id} at step ${i}`).toBeDefined();
        const options = lib.legalActions(s, seat as number).filter((a) => a.type !== 'capitulate');
        const pick =
          options.find((a) => a.type === 'buildSettlement' || a.type === 'buildCity') ??
          options.find((a) => a.type === 'attack' || a.type === 'battleRoll') ??
          (rand() < 0.3 ? options.find((a) => a.type === 'buyUnit') : undefined) ??
          options[Math.floor(rand() * options.length)];
        s = act(s, pick as Action);
      }
      const c = ctxOf(s);
      expect(
        s.winner,
        `seed ${seed}: ${s.turn.number} turns, ${s.phase.id}, vp ${s.players.map((p) => c.vp(p.seat))} of ${c.vpTarget()}`,
      ).not.toBeNull();
    }
  }, 60_000);
});
