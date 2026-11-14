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
import { seafarersModule } from '@colonizers/module-seafarers';
import { variantsModule } from '@colonizers/module-variants';
import { generateBoard, generateSeaBoard } from '@colonizers/maps';
import { harborHex, landWaterModule, lwData, vehiclesOf } from '../src/index.ts';

const lib = new ModuleLibrary([baseModule, seafarersModule, landWaterModule, variantsModule]);
const ctxOf = (s: GameState) => new Ctx(s, lib.registry(s.modules));
const act = (s: GameState, a: Action) => lib.apply(s, a).state;

function edit(state: GameState, fn: (ctx: Ctx) => void): GameState {
  const next = structuredClone(state);
  const ctx = ctxOf(next);
  fn(ctx);
  ctx.commit();
  return next;
}

function baseGame(seed = 'lw'): GameState {
  const board = generateBoard({ seed, players: 4, mode: 'classic' });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C', 'D'],
    modules: ['base', 'landwater'],
    map: board.map,
    settings: { vpTarget: 12 },
    fixedSeats: true,
  }).state;
}

function seaGame(seed = 'lw-sea', scenario = 'new-shores'): GameState {
  const b = generateSeaBoard({ seed, players: 4, scenario });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C', 'D'],
    modules: ['base', 'seafarers', 'landwater'],
    map: b.map,
    settings: { ...b.settings, vpTarget: Number(b.settings.vpTarget) + 2 },
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

/** Player 0's main phase with empty hands. */
const mainTurn = (s: GameState, fn: (ctx: Ctx) => void = () => {}) =>
  edit(s, (ctx) => {
    ctx.state.turn = { number: 5, player: 0, round: 2 };
    ctx.setPhase({ id: 'main' });
    for (const p of ctx.state.players)
      for (const [c, n] of Object.entries({ ...p.hand })) if (n) ctx.pay(p.seat, { [c]: n });
    fn(ctx);
  });

const firstSettlement = (s: GameState, seat = 0) =>
  (ctxOf(s).piecesOf(seat, 'settlement')[0]?.at as { id: CornerId }).id;

const lastTotal = (s: GameState) =>
  (s.data.base as { lastRoll?: { total: number } }).lastRoll?.total;

/** Rolls for player 0 until the total comes up. */
function rollFor(s: GameState, total: number): GameState {
  s = edit(s, (ctx) => ctx.setPhase({ id: 'roll' }));
  for (let i = 0; i < 500; i++) {
    const next = act(s, { type: 'roll', player: 0 });
    if (lastTotal(next) === total) return next;
    s = edit(s, (ctx) => {
      ctx.rng.int(1, 6);
    });
  }
  throw new Error(`No ${total}`);
}

const vehicle = (s: GameState, seat: number, type: string) =>
  vehiclesOf(ctxOf(s), seat).find((v) => v.type === type) as Piece;

describe('Land & Water', () => {
  it('starts with two settlements each and no roads', () => {
    const s = setup(baseGame());
    const c = ctxOf(s);
    expect(s.phase.id).toBe('roll');
    for (const p of s.players) {
      expect(c.piecesOf(p.seat, 'settlement')).toHaveLength(2);
      expect(c.piecesOf(p.seat, 'road')).toHaveLength(0);
    }
    const main = mainTurn(s, (ctx) => ctx.grant(0, { brick: 1, lumber: 1 }));
    expect(lib.legalActions(main, 0).some((a) => a.type === 'buildRoad')).toBe(false);
  });

  it('builds a train, moves it into a field, and collects that field', () => {
    let s = mainTurn(setup(baseGame()), (ctx) => ctx.grant(0, { ore: 1, brick: 1, grain: 2 }));
    const corner = firstSettlement(s);
    s = act(s, { type: 'buildVehicle', player: 0, vehicle: 'train', corner } as Action);
    const train = vehicle(s, 0, 'train');
    expect(train.at).toEqual({ kind: 'corner', id: corner });
    expect(s.players[0]?.hand).toMatchObject({ grain: 1, ore: 0 });
    // Into a field with a number token, for free.
    const c = ctxOf(s);
    const hex = (c.geometry.cornerHexes.get(corner) ?? []).find(
      (h) => c.state.hexes[h]?.token && c.registry.hexTypes[c.state.hexes[h]?.type ?? '']?.produces,
    ) as HexId;
    s = act(s, {
      type: 'moveVehicle',
      player: 0,
      piece: train.id,
      to: { kind: 'hex', id: hex },
    } as Action);
    expect(s.players[0]?.hand.grain).toBe(1);
    // The second step costs a grain, and building is over for the turn.
    const out = (ctxOf(s).geometry.hexCorners.get(hex) ?? []).find((x) => x !== corner) as CornerId;
    s = act(s, {
      type: 'moveVehicle',
      player: 0,
      piece: train.id,
      to: { kind: 'corner', id: out },
    } as Action);
    expect(s.players[0]?.hand.grain).toBe(0);
    expect(() =>
      act(s, { type: 'buildVehicle', player: 0, vehicle: 'train', corner } as Action),
    ).toThrow(/building is over/);
    // Back into the field next turn, then a roll of its number pays the train.
    s = edit(s, (ctx) => {
      ctx.state.turn.number += 4;
    });
    s = act(s, {
      type: 'moveVehicle',
      player: 0,
      piece: train.id,
      to: { kind: 'hex', id: hex },
    } as Action);
    const token = s.hexes[hex]?.token as number;
    const res = ctxOf(s).registry.hexTypes[s.hexes[hex]?.type ?? '']?.produces as string;
    const before = s.players[0]?.hand[res] ?? 0;
    s = edit(s, (ctx) => {
      // Keep the robber off the field.
      const r = ctx.piecesOfType('robber')[0];
      const other = Object.keys(ctx.state.hexes).find(
        (h) => h !== hex && ctx.isLand(h as HexId),
      ) as HexId;
      if (r) ctx.move(r, { kind: 'hex', id: other });
    });
    s = rollFor(s, token);
    expect((s.players[0]?.hand[res] ?? 0) - before).toBeGreaterThanOrEqual(1);
  });

  it('settles where a vehicle stands, which turns it passive until paid for', () => {
    let s = mainTurn(setup(baseGame()), (ctx) => ctx.grant(0, { ore: 1, brick: 1, grain: 1 }));
    const corner = firstSettlement(s);
    s = act(s, { type: 'buildVehicle', player: 0, vehicle: 'train', corner } as Action);
    const train = vehicle(s, 0, 'train');
    // Find a free corner two steps away, and put the train there.
    const c = ctxOf(s);
    let target: CornerId | undefined;
    for (const h of c.geometry.cornerHexes.get(corner) ?? [])
      for (const x of c.geometry.hexCorners.get(h) ?? [])
        if (
          !target &&
          c.isLandCorner(x) &&
          !c.buildingAt(x) &&
          (c.geometry.cornerNeighbours.get(x) ?? []).every((n) => !c.buildingAt(n))
        )
          target = x;
    expect(target).toBeDefined();
    s = edit(s, (ctx) => {
      ctx.move(ctx.state.pieces[train.id] as Piece, { kind: 'corner', id: target as CornerId });
      ctx.grant(0, { brick: 1, lumber: 1, wool: 1, grain: 1 });
    });
    expect(() =>
      act(s, { type: 'buildSettlement', player: 0, corner: corner } as Action),
    ).toThrow();
    s = act(s, { type: 'buildSettlement', player: 0, corner: target } as Action);
    expect(ctxOf(s).buildingAt(target as CornerId)?.owner).toBe(0);
    expect(s.pieces[train.id]?.props.passive).toBe(true);
    expect(() =>
      act(s, {
        type: 'moveVehicle',
        player: 0,
        piece: train.id,
        to: { kind: 'hex', id: 'x' },
      } as Action),
    ).toThrow(/passive/);
    s = edit(s, (ctx) => ctx.grant(0, { grain: 1 }));
    s = act(s, { type: 'activateVehicle', player: 0, piece: train.id } as Action);
    expect(s.pieces[train.id]?.props.passive).toBeUndefined();
    expect(s.players[0]?.hand.grain).toBe(0);
  });

  it('fishes for a player who got nothing, and trades at a harbor with a ship in front', () => {
    let s = mainTurn(setup(baseGame('lw-fish')));
    const c = ctxOf(s);
    // A ship on a free sea field that isn't a harbor, for player 1.
    const harbors = new Set(c.state.harbors.map((h) => harborHex(c, h.edge)));
    const sea = (Object.keys(s.hexes) as HexId[]).find(
      (h) => c.isSea(h) && !harbors.has(h),
    ) as HexId;
    const harbor = c.state.harbors.find((h) => h.resource !== 'any');
    expect(harbor).toBeDefined();
    const front = harborHex(c, harbor?.edge as string) as HexId;
    s = edit(s, (ctx) => {
      const corner = ctx.geometry.hexCorners.get(sea)?.[0] as CornerId;
      const p = ctx.place('ferry', 1, { kind: 'corner', id: corner });
      ctx.move(p, { kind: 'hex', id: sea });
      const q = ctx.place('ferry', 0, { kind: 'corner', id: corner });
      ctx.move(q, { kind: 'hex', id: front });
    });
    // Player 0's ship gives the harbor's 2:1.
    const res = harbor?.resource as string;
    const t = edit(s, (ctx) => ctx.grant(0, { [res]: 2 }));
    const traded = act(t, {
      type: 'bankTrade',
      player: 0,
      give: res,
      get: res === 'ore' ? 'wool' : 'ore',
    } as Action);
    expect(traded.players[0]?.hand[res]).toBe(0);
    // A roll where player 1 gets nothing: they pick a resource for the fish.
    for (const total of [2, 3, 4, 5, 6, 8, 9, 10, 11, 12]) {
      const r = rollFor(s, total);
      if (r.phase.id === 'lwPick' && (r.phase.owed as Record<string, number>)[1]) {
        const after = act(r, { type: 'pickResources', player: 1, cards: { ore: 1 } } as Action);
        expect(after.players[1]?.hand.ore).toBe((r.players[1]?.hand.ore ?? 0) + 1);
        return;
      }
    }
    throw new Error('Player 1 never fished');
  });

  it('lets a knight chase a rival train out of its field', () => {
    let s = mainTurn(setup(baseGame('lw-knight')));
    const c = ctxOf(s);
    const land = (Object.keys(s.hexes) as HexId[]).filter(
      (h) => c.isLand(h) && c.state.hexes[h]?.type !== 'desert',
    );
    const hex = land.find((h) =>
      (c.geometry.hexNeighbours.get(h) ?? []).some(
        (n) => c.isLand(n) && n !== h && !c.piecesAt({ kind: 'hex', id: n }).length,
      ),
    ) as HexId;
    s = edit(s, (ctx) => {
      const r = ctx.piecesOfType('robber')[0];
      if (r)
        ctx.move(r, {
          kind: 'hex',
          id: land.find(
            (h) => h !== hex && !(ctx.geometry.hexNeighbours.get(hex) ?? []).includes(h),
          ) as HexId,
        });
      const corner = ctx.geometry.hexCorners.get(hex)?.[0] as CornerId;
      const t = ctx.place('train', 1, { kind: 'corner', id: corner });
      ctx.move(t, { kind: 'hex', id: hex });
      ctx.player(0).held.dev = [{ card: 'knight', acquiredTurn: 1 }];
    });
    const train = vehicle(s, 1, 'train');
    const options = lib
      .legalActions(s, 0)
      .filter((a) => a.type === 'playDevCard' && a.use === 'chase' && a.target === train.id);
    expect(options.length).toBeGreaterThan(0);
    s = act(s, options[0] as Action);
    expect(s.pieces[train.id]?.at).toEqual({ kind: 'hex', id: options[0]?.to });
    expect(s.phase.id).toBe('main');
    expect(s.players[0]?.played.knight).toBe(1);
  });

  it('builds a free train with Road Building, and gives Most Vehicles to the first with 3', () => {
    let s = mainTurn(setup(baseGame('lw-rb')), (ctx) => {
      ctx.player(0).held.dev = [{ card: 'roadBuilding', acquiredTurn: 1 }];
      ctx.grant(0, { ore: 2, brick: 2, grain: 2 });
    });
    const corners = ctxOf(s)
      .piecesOf(0, 'settlement')
      .map((p) => (p.at as { id: CornerId }).id);
    s = act(s, {
      type: 'playDevCard',
      player: 0,
      card: 'roadBuilding',
      vehicle: 'train',
      corner: corners[0],
    } as Action);
    expect(vehiclesOf(ctxOf(s), 0)).toHaveLength(1);
    expect(s.players[0]?.hand.ore).toBe(2);
    s = act(s, { type: 'buildVehicle', player: 0, vehicle: 'train', corner: corners[1] } as Action);
    expect(lwData(ctxOf(s)).mostVehicles).toBeNull();
    const vp = ctxOf(s).vp(0);
    s = edit(s, (ctx) => {
      ctx.place('train', 0, {
        kind: 'corner',
        id: ctx.geometry.corners.find(
          (x) => !ctx.piecesAt({ kind: 'corner', id: x }).length,
        ) as CornerId,
      });
    });
    s = act(s, { type: 'endTurn', player: 0 });
    expect(lwData(ctxOf(s)).mostVehicles).toBe(0);
    expect(ctxOf(s).vp(0)).toBe(vp + 2);
  });
});

describe('Land & Water, in random games', () => {
  function rng(seed: number): () => number {
    let x = seed >>> 0 || 1;
    return () => {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      return (x >>> 0) / 4294967296;
    };
  }
  const games: [string, () => GameState][] = [
    ['the base game', () => baseGame('lw-random')],
    ['New Shores', () => seaGame('lw-random-sea', 'new-shores')],
    ['Four Islands', () => seaGame('lw-random-four', 'four-islands')],
    [
      'five players with the Special Building Phase',
      () => {
        const board = generateBoard({ seed: 'lw-five', players: 5, mode: 'classic' });
        return lib.createGame({
          seed: 'lw-five',
          players: ['A', 'B', 'C', 'D', 'E'],
          modules: ['base', 'landwater', 'variants'],
          map: board.map,
          settings: { vpTarget: 12, turnMode: 'specialBuild' },
          fixedSeats: true,
        }).state;
      },
    ],
  ];
  for (const [name, make] of games)
    it(`plays ${name} without getting stuck`, () => {
      const rand = rng(17);
      let s = make();
      let settled = 0;
      for (let i = 0; i < 6000 && s.winner === null; i++) {
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
        if (pick?.type === 'buildSettlement' && s.phase.id === 'main') settled++;
        s = act(s, pick as Action);
      }
      expect(s.turn.number).toBeGreaterThan(20);
      expect(settled).toBeGreaterThan(0);
    }, 60_000);
});
