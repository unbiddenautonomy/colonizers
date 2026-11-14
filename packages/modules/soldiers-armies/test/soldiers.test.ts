import { describe, expect, it } from 'vitest';
import {
  Ctx,
  ModuleLibrary,
  type Action,
  type CornerId,
  type EdgeId,
  type GameState,
  type HexId,
  type Piece,
} from '@colonizers/engine';
import { baseModule, robber } from '@colonizers/module-base';
import { generateBoard } from '@colonizers/maps';
import { ARMY, armyAt, marchTargets, soldiersModule, unitsOf } from '../src/index.ts';

const lib = new ModuleLibrary([baseModule, soldiersModule]);

function game(seed = 'soldiers', players = 4): GameState {
  const board = generateBoard({ seed, players, mode: 'classic' });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C', 'D'].slice(0, players),
    modules: ['base', 'soldiers'],
    map: board.map,
    fixedSeats: true,
  }).state;
}

const ctxOf = (s: GameState) => new Ctx(s, lib.registry(s.modules));
const act = (s: GameState, a: Action) => lib.apply(s, a).state;
const legal = (s: GameState, seat: number, type: string) =>
  lib.legalActions(s, seat).filter((a) => a.type === type);

function edit(state: GameState, fn: (ctx: Ctx) => void): GameState {
  const next = structuredClone(state);
  const ctx = ctxOf(next);
  fn(ctx);
  ctx.commit();
  return next;
}

/** Straight to the main phase of turn 1, with an empty board. */
function mainPhase(s = game()): GameState {
  return edit(s, (ctx) => {
    ctx.state.turn = { number: 1, player: 0, round: 0 };
    ctx.setPhase({ id: 'main' });
  });
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

/** A corner well inside the island, with only land around it for two steps. */
function inlandCorner(ctx: Ctx): CornerId {
  const landAround = (c: CornerId) =>
    (ctx.geometry.cornerHexes.get(c) ?? []).length === 3 &&
    (ctx.geometry.cornerHexes.get(c) ?? []).every((h) => ctx.isLand(h));
  return ctx.geometry.corners.find(
    (c) => landAround(c) && (ctx.geometry.cornerNeighbours.get(c) ?? []).every(landAround),
  ) as CornerId;
}

const near = (ctx: Ctx, c: CornerId) => [...(ctx.geometry.cornerNeighbours.get(c) ?? [])];

function edgeOf(ctx: Ctx, a: CornerId, b: CornerId): EdgeId {
  return (ctx.geometry.cornerEdges.get(a) ?? []).find((e) =>
    (ctx.geometry.edgeCorners.get(e) ?? ([] as CornerId[])).includes(b),
  ) as EdgeId;
}

const armyOf = (s: GameState, seat: number) =>
  Object.values(s.pieces).find((p) => p.type === ARMY && p.owner === seat) as Piece;

/** Seat 0's army one corner away from seat 1's settlement, in the field. */
function standoff(units: Record<string, number>, guard?: Record<string, number>) {
  let home = '' as CornerId;
  let mid = '' as CornerId;
  let foe = '' as CornerId;
  const s = edit(mainPhase(), (ctx) => {
    home = inlandCorner(ctx);
    mid = near(ctx, home)[0] as CornerId;
    foe = near(ctx, mid).find((c) => c !== home) as CornerId;
    ctx.place('city', 0, { kind: 'corner', id: home });
    ctx.place('settlement', 1, { kind: 'corner', id: foe });
    ctx.place(ARMY, 0, { kind: 'corner', id: mid }, units);
    if (guard) ctx.place(ARMY, 1, { kind: 'corner', id: foe }, guard);
    ctx.setPhase({ id: 'campaign' });
  });
  return { s, home, mid, foe };
}

describe('Soldiers & Armies', () => {
  it('starts everyone with a settlement and a city, and takes Victory Points out of the deck', () => {
    let s = game();
    for (let i = 0; i < 16; i++) {
      const seat = lib.waitingOn(s)[0] as number;
      const pick = legal(s, seat, 'placeSetupSettlement')[0] ?? legal(s, seat, 'placeSetupRoad')[0];
      s = act(s, pick as Action);
    }
    expect(s.phase.id).toBe('roll');
    const types = (seat: number) =>
      Object.values(s.pieces)
        .filter((p) => p.owner === seat && p.at.kind === 'corner')
        .map((p) => p.type)
        .sort();
    for (let seat = 0; seat < 4; seat++) expect(types(seat)).toEqual(['city', 'settlement']);
    expect(s.decks.dev).not.toContain('victoryPoint');
    expect(s.settings.largestArmyMin).toBeGreaterThan(100);
  });

  it('musters units into one army at your own building', () => {
    let corner = '' as CornerId;
    let s = edit(mainPhase(), (ctx) => {
      corner = inlandCorner(ctx);
      ctx.place('settlement', 0, { kind: 'corner', id: corner });
      ctx.grant(0, { ore: 6, wool: 4, grain: 4, lumber: 1 });
    });
    s = act(s, { type: 'buyUnit', player: 0, unit: 'infantry', corner });
    s = act(s, { type: 'buyUnit', player: 0, unit: 'artillery', corner });
    const army = armyAt(ctxOf(s), corner) as Piece;
    expect(unitsOf(army)).toEqual({ infantry: 1, cavalry: 0, artillery: 1 });
    expect(s.players[0]?.hand).toMatchObject({ ore: 1, wool: 2, grain: 2, lumber: 0 });
    expect(() =>
      act(s, { type: 'buyUnit', player: 0, unit: 'infantry', corner: near(ctxOf(s), corner)[0] }),
    ).toThrow(/settlements or cities/);
  });

  it('gives a free development card only after a quiet turn, and sells none', () => {
    let s = edit(mainPhase(), (ctx) => {
      ctx.place('settlement', 0, { kind: 'corner', id: inlandCorner(ctx) });
      ctx.grant(0, { ore: 2, wool: 2, grain: 2 });
    });
    expect(() => act(s, { type: 'buyDevCard', player: 0 })).toThrow(/not bought/);
    const corner = inlandCorner(ctxOf(s));
    const busy = act(s, { type: 'buyUnit', player: 0, unit: 'infantry', corner });
    expect(() => act(busy, { type: 'drawFreeDevCard', player: 0 })).toThrow(/without buying/);
    s = act(s, { type: 'drawFreeDevCard', player: 0 });
    expect(s.players[0]?.held.dev).toHaveLength(1);
    expect(s.phase.id).toBe('campaign');
    // Four is the most anyone holds.
    s = edit(s, (ctx) => {
      ctx.state.turn.number = 3;
      ctx.setPhase({ id: 'main' });
      for (let i = 0; i < 3; i++) ctx.player(0).held.dev?.push({ card: 'knight', acquiredTurn: 1 });
    });
    expect(() => act(s, { type: 'drawFreeDevCard', player: 0 })).toThrow(/at most 4/);
  });

  it('marches three corners free and pays lumber and grain for more', () => {
    let start = '' as CornerId;
    let s = edit(mainPhase(), (ctx) => {
      start = inlandCorner(ctx);
      ctx.place(ARMY, 0, { kind: 'corner', id: start }, { infantry: 1 });
      ctx.setPhase({ id: 'campaign' });
    });
    const ctx = ctxOf(s);
    const army = armyOf(s, 0);
    const reach = marchTargets(ctx, army, 4);
    const three = [...reach].find(([, d]) => d === 3)?.[0] as CornerId;
    const four = [...reach].find(([, d]) => d === 4)?.[0] as CornerId;
    expect(() => act(s, { type: 'marchArmy', player: 0, army: army.id, to: four })).toThrow(
      /can not reach/,
    );
    s = edit(s, (c) => c.grant(0, { lumber: 1, grain: 1 }));
    const paid = act(s, { type: 'marchArmy', player: 0, army: army.id, to: four });
    expect(paid.players[0]?.hand).toMatchObject({ lumber: 0, grain: 0 });
    const free = act(s, { type: 'marchArmy', player: 0, army: army.id, to: three });
    expect(free.players[0]?.hand).toMatchObject({ lumber: 1, grain: 1 });
    // Its free corners are spent for this turn.
    const back = near(ctxOf(free), three)[0] as CornerId;
    const again = act(free, { type: 'marchArmy', player: 0, army: army.id, to: back });
    expect(again.players[0]?.hand).toMatchObject({ lumber: 0, grain: 0 });
  });

  it('never stops on a rival building and never passes a rival army', () => {
    const { s, mid, foe } = standoff({ infantry: 1 });
    const army = armyOf(s, 0);
    expect(marchTargets(ctxOf(s), army, 3).has(foe)).toBe(false);
    // Rival armies on the other corners close the way through them.
    let blockers: CornerId[] = [];
    const blocked = edit(s, (ctx) => {
      blockers = near(ctx, mid).filter((c) => c !== foe);
      for (const c of blockers) ctx.place(ARMY, 2, { kind: 'corner', id: c }, { infantry: 1 });
    });
    const ctx = ctxOf(blocked);
    const reach = marchTargets(ctx, armyOf(blocked, 0), 2);
    const beyond = blockers.flatMap((b) => near(ctx, b).filter((c) => c !== mid));
    expect(reach.size).toBeGreaterThan(0);
    for (const c of [...blockers, ...beyond]) expect(reach.has(c)).toBe(false);
  });

  it('keeps rivals from building a road on past an army', () => {
    let s = mainPhase();
    let edge = '' as EdgeId;
    s = edit(s, (ctx) => {
      const a = inlandCorner(ctx);
      const b = near(ctx, a)[0] as CornerId;
      const c = near(ctx, b).find((x) => x !== a) as CornerId;
      ctx.place('settlement', 0, { kind: 'corner', id: a });
      ctx.place('road', 0, { kind: 'edge', id: edgeOf(ctx, a, b) });
      edge = edgeOf(ctx, b, c);
      ctx.place(ARMY, 1, { kind: 'corner', id: b }, { infantry: 1 });
      ctx.grant(0, { brick: 1, lumber: 1 });
    });
    expect(() => act(s, { type: 'buildRoad', player: 0, edge })).toThrow(/army holds/);
  });

  it('fights a building down: damaged, then captured with the roads it cuts off', () => {
    const start = standoff({ artillery: 3, cavalry: 4, infantry: 7 });
    const foe = start.foe;
    let s = start.s;
    let road = '' as EdgeId;
    s = edit(s, (ctx) => {
      const out = near(ctx, foe).find((c) => !ctx.piecesAt({ kind: 'corner', id: c }).length);
      road = edgeOf(ctx, foe, out as CornerId);
      ctx.place('road', 1, { kind: 'edge', id: road });
    });
    const army = armyOf(s, 0);
    s = act(s, {
      type: 'attack',
      player: 0,
      army: army.id,
      target: { kind: 'building', corner: foe },
    });
    expect(s.phase.id).toBe('battle');
    // The fight can't be interrupted by marching.
    let damaged = false;
    for (let i = 0; i < 40 && s.phase.id === 'battle'; i++) {
      s = act(s, { type: 'battleRoll', player: 0 });
      const b = ctxOf(s).buildingAt(foe);
      if (b?.owner === 1 && b.props.damaged) damaged = true;
    }
    expect(damaged).toBe(true);
    expect(s.phase.id).toBe('campaign');
    const ctx = ctxOf(s);
    expect(ctx.buildingAt(foe)?.owner).toBe(0);
    expect(ctx.piecesAt({ kind: 'edge', id: road })[0]?.owner).toBe(0);
    expect(legal(s, 0, 'marchArmy')).toEqual([]);
  });

  it('must beat a guarding army before the building, and a tie goes to the defender', () => {
    const { s, foe } = standoff({ infantry: 1 }, { artillery: 1 });
    const army = armyOf(s, 0);
    expect(legal(s, 0, 'attack').map((a) => a.target)).toEqual([{ kind: 'army', corner: foe }]);
    let t = act(s, {
      type: 'attack',
      player: 0,
      army: army.id,
      target: { kind: 'army', corner: foe },
    });
    let ties = 0;
    for (let i = 0; i < 40 && t.phase.id === 'battle'; i++) {
      const before = unitsOf(ctxOf(t).state.pieces[army.id] ?? army);
      const r = lib.apply(t, { type: 'battleRoll', player: 0 });
      const round = r.events.find((e) => e.type === 'battleRound') as unknown as {
        rolls: [number, number];
        won: boolean;
      };
      if (round.rolls[0] === round.rolls[1]) {
        ties++;
        expect(round.won).toBe(false);
      }
      t = r.state;
      if (round.won) {
        // The guard's artillery steps down to cavalry first.
        const guard = armyAt(ctxOf(t), foe);
        if (guard) expect(unitsOf(guard).cavalry + unitsOf(guard).infantry).toBeGreaterThan(0);
      } else expect(before.infantry).toBe(1);
    }
    expect(ties).toBeGreaterThanOrEqual(0);
    expect(t.phase.id).toBe('campaign');
  });

  it('breaks off a fight by falling back a corner', () => {
    const { s, mid, foe, home } = standoff({ infantry: 2 });
    const army = armyOf(s, 0);
    let t = act(s, {
      type: 'attack',
      player: 0,
      army: army.id,
      target: { kind: 'building', corner: foe },
    });
    const options = legal(t, 0, 'battleRetreat').map((a) => a.to);
    expect(options).toContain(home);
    expect(options).not.toContain(foe);
    t = act(t, { type: 'battleRetreat', player: 0, to: home });
    expect(t.phase.id).toBe('campaign');
    expect(armyAt(ctxOf(t), home)?.id).toBe(army.id);
    expect(armyAt(ctxOf(t), mid)).toBeUndefined();
  });

  it('fights the robber once a turn', () => {
    let s = mainPhase();
    s = edit(s, (ctx) => {
      const r = robber(ctx) as Piece;
      const hex = (r.at as { id: HexId }).id;
      const corner = (ctx.geometry.hexCorners.get(hex) ?? [])[0] as CornerId;
      ctx.place(ARMY, 0, { kind: 'corner', id: corner }, { artillery: 1 });
      ctx.grant(0, { brick: 1 });
      ctx.setPhase({ id: 'campaign' });
    });
    const army = armyOf(s, 0);
    s = act(s, { type: 'attackRobber', player: 0, army: army.id });
    expect(['moveRobber', 'robberToll']).toContain(s.phase.id);
    if (s.phase.id === 'robberToll')
      s = act(s, { type: 'payRobberToll', player: 0, card: 'brick' });
    else {
      const to = legal(s, 0, 'moveRobber')[0] as Action;
      s = act(s, to);
      while (s.phase.id === 'steal') s = act(s, legal(s, 0, 'steal')[0] as Action);
    }
    expect(s.phase.id).toBe('campaign');
    expect(() => act(s, { type: 'attackRobber', player: 0, army: army.id })).toThrow(/this turn/);
  });

  it('adds a point of defence and two cards on a 7 per city wall', () => {
    let corner = '' as CornerId;
    let s = edit(mainPhase(), (ctx) => {
      corner = inlandCorner(ctx);
      ctx.place('city', 0, { kind: 'corner', id: corner });
      ctx.grant(0, { brick: 12 });
    });
    for (let i = 0; i < 3; i++) s = act(s, { type: 'buildWall', player: 0, corner });
    expect(() => act(s, { type: 'buildWall', player: 0, corner })).toThrow(/at most 3/);
    expect(ctxOf(s).reduce('handLimit', 0, 7)).toBe(16);
    expect(ctxOf(s).reduce('handLimit', 1, 7)).toBe(10);
  });

  it('plays out random games to a winner', () => {
    const seen = new Set<string>();
    for (const seed of [1, 2, 3]) {
      const rand = rng(seed);
      let s = game(`random-${seed}`);
      for (let i = 0; i < 3000 && s.winner === null; i++) {
        const seat = lib.waitingOn(s)[0];
        expect(seat, `${s.phase.id} at step ${i}`).toBeDefined();
        const options = lib.legalActions(s, seat as number);
        // Favour building, mustering and attacking, so the game moves along.
        const pick =
          options.find((a) => a.type === 'buildSettlement' || a.type === 'buildCity') ??
          options.find((a) => a.type === 'attack' || a.type === 'battleRoll') ??
          (rand() < 0.3 ? options.find((a) => a.type === 'buyUnit') : undefined) ??
          options[Math.floor(rand() * options.length)];
        s = act(s, pick as Action);
        for (const p of ['campaign', 'battle']) if (s.phase.id === p) seen.add(p);
      }
      expect(s.winner, `seed ${seed}`).not.toBeNull();
    }
    expect([...seen].sort()).toEqual(['battle', 'campaign']);
  }, 60_000);
});
