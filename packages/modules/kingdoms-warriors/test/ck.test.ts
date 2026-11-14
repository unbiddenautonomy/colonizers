import { describe, expect, it } from 'vitest';
import { Ctx, ModuleLibrary, type Action, type CornerId, type GameState } from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { ckData, citiesKnightsModule } from '@colonizers/module-cities-knights';
import { generateBoard } from '@colonizers/maps';
import { armyOf, kingdomsModule, kwData } from '../src/index.ts';

const lib = new ModuleLibrary([baseModule, citiesKnightsModule, kingdomsModule]);
const ctxOf = (s: GameState) => new Ctx(s, lib.registry(s.modules));
const act = (s: GameState, a: Action) => lib.apply(s, a).state;

function game(seed = 'kingdoms-ck'): GameState {
  const board = generateBoard({ seed, players: 4, mode: 'classic' });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C', 'D'],
    modules: ['base', 'cities-knights', 'kingdoms'],
    map: board.map,
    settings: { vpTarget: 15 },
    fixedSeats: true,
  }).state;
}

function setup(s: GameState): GameState {
  for (let i = 0; i < 300 && s.phase.id === 'setup'; i++) {
    const seat = lib.waitingOn(s)[0] as number;
    s = act(s, lib.legalActions(s, seat)[0] as Action);
  }
  return s;
}

describe('Kingdoms & Warriors with Cities & Knights', () => {
  it('starts with the usual city and a free marker', () => {
    const c = ctxOf(setup(game()));
    for (const seat of [0, 1, 2, 3]) {
      expect(c.piecesOf(seat, 'city').length).toBe(1);
      expect(kwData(c).start[String(seat)]).toBe(true);
    }
  });

  it('counts active knights by strength and half the Defender cards', () => {
    const s = setup(game());
    const next = structuredClone(s);
    const ctx = ctxOf(next);
    const corner = ctx.geometry.corners.find(
      (x) => ctx.isLandCorner(x) && !ctx.piecesAt({ kind: 'corner', id: x }).length,
    ) as CornerId;
    ctx.place('knight2', 0, { kind: 'corner', id: corner }, { active: true });
    const other = ctx.geometry.corners.find(
      (x) => x !== corner && ctx.isLandCorner(x) && !ctx.piecesAt({ kind: 'corner', id: x }).length,
    ) as CornerId;
    ctx.place('knight1', 0, { kind: 'corner', id: other }, { active: false });
    ckData(ctx).defender[0] = 3;
    expect(armyOf(ctx, 0)).toBe(2 + 2);
  });

  it('plays a random game without getting stuck', () => {
    let x = 91;
    const rand = () => {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      return (x >>> 0) / 4294967296;
    };
    let s = game('kingdoms-ck-random');
    for (let i = 0; i < 6000 && s.winner === null; i++) {
      const seat = lib.waitingOn(s)[0];
      expect(seat, `${s.phase.id} at step ${i}`).toBeDefined();
      const options = lib.legalActions(s, seat as number);
      const pick =
        options.find((a) => ['buildSettlement', 'buildCity', 'placeFreeMarker'].includes(a.type)) ??
        (rand() < 0.5 ? options.find((a) => a.type === 'buyMarker') : undefined) ??
        options[Math.floor(rand() * options.length)];
      s = act(s, pick as Action);
    }
    expect(s.turn.number).toBeGreaterThan(20);
  }, 60_000);
});
