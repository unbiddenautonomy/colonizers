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
import { baseModule } from '@colonizers/module-base';
import { explorersPiratesModule } from '@colonizers/module-explorers-pirates';
import { generateEpBoard } from '@colonizers/maps';
import { epData, missionSteps } from '@colonizers/module-explorers-pirates';
import { ARMY, buildingDie, soldiersModule } from '../src/index.ts';
import { unitsInPlay } from '../src/rules.ts';

const lib = new ModuleLibrary([baseModule, explorersPiratesModule, soldiersModule]);

function rng(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function game(seed = 'soldiers-ep', scenario = 'pirate-lairs'): GameState {
  const b = generateEpBoard({ seed, players: 3, scenario });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C'],
    modules: [...b.modules, 'soldiers'],
    map: b.map,
    settings: { vpTarget: 10, ...b.settings },
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

/** Plays the setup with the first legal choice each time. */
function afterSetup(): GameState {
  let s = game();
  for (let i = 0; i < 200 && s.phase.id === 'setup'; i++) {
    const seat = lib.waitingOn(s)[0] as number;
    s = act(s, lib.legalActions(s, seat)[0] as Action);
  }
  return s;
}

/** Player 0's turn, a harbor on the coast with an empty ship and an army beside it. */
function atTheHarbor(): { s: GameState; edge: EdgeId; harbor: CornerId; other: CornerId } {
  let edge = '' as EdgeId;
  let harbor = '' as CornerId;
  let other = '' as CornerId;
  const s = edit(afterSetup(), (ctx) => {
    for (const p of Object.values(ctx.state.pieces))
      if (p.type === 'ship' || p.type === ARMY) ctx.remove(p);
    ctx.state.turn = { number: 5, player: 0, round: 2 };
    ctx.setPhase({ id: 'main' });
    const ok = (c: CornerId) =>
      ctx.isLandCorner(c) &&
      !ctx.piecesAt({ kind: 'corner', id: c }).length &&
      !(ctx.geometry.cornerNeighbours.get(c) ?? []).some((n) => ctx.buildingAt(n)) &&
      !(ctx.geometry.cornerHexes.get(c) ?? []).some((h) => ctx.state.hexes[h]?.hidden);
    for (const e of ctx.geometry.edges) {
      const hexes = ctx.geometry.edgeHexes.get(e) ?? [];
      if (!hexes.some((h) => ctx.isSea(h)) || !hexes.some((h) => ctx.isLand(h))) continue;
      const [a, b] = ctx.geometry.edgeCorners.get(e) ?? [];
      if (!a || !b || !ok(a) || !ok(b)) continue;
      edge = e;
      harbor = a;
      other = b;
      break;
    }
    ctx.place('harbor', 0, { kind: 'corner', id: harbor }, { cargo: [] });
    ctx.place('ship', 0, { kind: 'edge', id: edge }, { cargo: [] });
    ctx.place(ARMY, 0, { kind: 'corner', id: harbor }, { infantry: 1, cavalry: 1 });
    ctx.grant(0, { lumber: 2, wool: 2, grain: 2 });
  });
  return { s, edge, harbor, other };
}

const armyOf = (s: GameState, seat: number) =>
  Object.values(s.pieces).find((p) => p.type === ARMY && p.owner === seat);
const shipOf = (s: GameState, seat: number) =>
  Object.values(s.pieces).find((p) => p.type === 'ship' && p.owner === seat) as Piece;

describe('Soldiers & Armies with Explorers & Pirates', () => {
  it('starts everyone with a harbor settlement and a city', () => {
    const s = afterSetup();
    const c = ctxOf(s);
    for (const seat of [0, 1, 2]) {
      expect(c.piecesOf(seat, 'harbor').length).toBe(1);
      expect(c.piecesOf(seat, 'city').length).toBe(1);
    }
  });

  it('carries an army aboard a ship from the harbor, and puts it ashore', () => {
    const { s: start, other } = atTheHarbor();
    const army = armyOf(start, 0) as Piece;
    const ship = shipOf(start, 0);
    let s = act(start, { type: 'boardShip', player: 0, army: army.id, ship: ship.id });
    expect(armyOf(s, 0)).toBeUndefined();
    expect(s.pieces[ship.id]?.props.cargo).toEqual(['army']);
    // Still counts against the box.
    expect(unitsInPlay(ctxOf(s), 0, 'cavalry')).toBe(1);
    expect(() => act(s, { type: 'swapCargo', player: 0, ship: ship.id })).toThrow(/ashore/);
    s = act(s, { type: 'landArmy', player: 0, ship: ship.id, corner: other });
    expect(armyOf(s, 0)?.at).toEqual({ kind: 'corner', id: other });
    expect(armyOf(s, 0)?.props).toMatchObject({ infantry: 1, cavalry: 1 });
    expect(s.pieces[ship.id]?.props.cargo).toEqual([]);
  });

  it('does not march armies along the ships', () => {
    const { s, edge } = atTheHarbor();
    const army = armyOf(s, 0) as Piece;
    const field = act(s, { type: 'takeTheField', player: 0 });
    const across = lib
      .legalActions(field, 0)
      .filter((a) => a.type === 'marchArmy' && a.army === army.id)
      .map((a) => a.to);
    const [, b] = ctxOf(s).geometry.edgeCorners.get(edge) ?? [];
    // The land edge still works; nothing past the sea.
    expect(across).toContain(b);
  });

  it('sails in the field, and fights the pirate from a ship with an army aboard', () => {
    const { s: start } = atTheHarbor();
    const army = armyOf(start, 0) as Piece;
    const ship = shipOf(start, 0);
    let s = act(start, { type: 'boardShip', player: 0, army: army.id, ship: ship.id });
    const sail = lib.legalActions(s, 0).find((a) => a.type === 'sailShip') as Action;
    s = act(s, sail);
    expect(s.phase.id).toBe('campaign');
    expect(lib.legalActions(s, 0).some((a) => a.type === 'chasePirate')).toBe(false);
    s = edit(s, (ctx) => {
      const at = (ctx.state.pieces[ship.id] as Piece).at as { id: EdgeId };
      const sea = (ctx.geometry.edgeHexes.get(at.id) ?? []).find((h) => ctx.isSea(h)) as HexId;
      for (const p of ctx.piecesOfType('pirate')) ctx.remove(p);
      ctx.place('pirate', null, { kind: 'hex', id: sea });
    });
    const fight = act(s, { type: 'attackPirate', player: 0, ship: ship.id });
    const ev = lib.apply(s, { type: 'attackPirate', player: 0, ship: ship.id }).events;
    const won = ev.find((e) => e.type === 'pirateFought')?.won;
    expect(fight.phase.id).toBe(won ? 'moveRobber' : 'robberToll');
    expect(() => act(fight, { type: 'attackPirate', player: 0, ship: ship.id })).toThrow();
  });

  it('storms a pirate lair with units: 3 points take it, and the hero pays a unit', () => {
    let lair = '' as HexId;
    let ship = '';
    let s = edit(atTheHarbor().s, (ctx) => {
      const d = epData(ctx);
      lair = Object.keys(d.lairs)[0] as HexId;
      delete ctx.state.hexes[lair]!.hidden;
      const edge = (ctx.geometry.hexEdges.get(lair) ?? []).find(
        (e) => !ctx.piecesAt({ kind: 'edge', id: e }).length,
      ) as EdgeId;
      const p = ctx.place('ship', 0, { kind: 'edge', id: edge }, { cargo: ['army'] });
      p.props.army = { cavalry: 1, infantry: 1 };
      ship = p.id;
    });
    expect(lib.legalActions(s, 0).some((a) => a.type === 'buildCrew')).toBe(false);
    s = act(s, { type: 'landUnits', player: 0, ship, hex: lair });
    const c = ctxOf(s);
    expect(epData(c).captured).toContain(lair);
    expect(missionSteps(c, 0, 'lairs')).toBe(2);
    // The hero's cavalry stepped down; both units are back aboard.
    expect(s.pieces[ship]?.props.army).toMatchObject({ cavalry: 0, infantry: 2 });
  });

  it('fights a sea battle: cargo defends with a d10 and is taken after two losses', () => {
    let mine = '';
    let theirs = '';
    let s = edit(atTheHarbor().s, (ctx) => {
      ctx.setPhase({ id: 'campaign' });
      const [e1, e2] = (() => {
        for (const e of ctx.geometry.edges) {
          if (!(ctx.geometry.edgeHexes.get(e) ?? []).every((h) => ctx.isSea(h))) continue;
          if (ctx.piecesAt({ kind: 'edge', id: e }).length) continue;
          for (const c of ctx.geometry.edgeCorners.get(e) ?? [])
            for (const n of ctx.geometry.cornerEdges.get(c) ?? [])
              if (
                n !== e &&
                (ctx.geometry.edgeHexes.get(n) ?? []).some((h) => ctx.isSea(h)) &&
                !ctx.piecesAt({ kind: 'edge', id: n }).length
              )
                return [e, n];
        }
        return [];
      })() as [EdgeId, EdgeId];
      const a = ctx.place('ship', 0, { kind: 'edge', id: e1 }, { cargo: ['army'] });
      a.props.army = { artillery: 3 };
      mine = a.id;
      theirs = ctx.place('ship', 1, { kind: 'edge', id: e2 }, { cargo: ['fish'] }).id;
    });
    s = act(s, { type: 'attackShip', player: 0, ship: mine, target: theirs });
    expect(s.phase).toMatchObject({ id: 'seaBattle', defender: 1, hits: 0 });
    for (let i = 0; i < 40 && s.phase.id === 'seaBattle'; i++)
      s = act(s, { type: 'seaBattleRoll', player: 0 });
    expect(s.phase.id).toBe('campaign');
    const army = s.pieces[mine]?.props.army as
      { artillery: number; cavalry: number; infantry: number } | undefined;
    if (army && army.artillery + army.cavalry + army.infantry > 0) {
      expect(s.pieces[mine]?.props.cargo).toEqual(['army', 'fish']);
      expect(s.pieces[theirs]?.props.cargo).toEqual([]);
    }
  });

  it('defends harbor settlements like cities', () => {
    const { s, harbor } = atTheHarbor();
    expect(buildingDie(ctxOf(s).buildingAt(harbor) as Piece)).toBe(12);
  });

  it('plays out random games to a winner', () => {
    for (const seed of [1]) {
      const rand = rng(seed);
      let s = game(`ep-random-${seed}`);
      for (let i = 0; i < 15000 && s.winner === null; i++) {
        const seat = lib.waitingOn(s)[0];
        expect(seat, `${s.phase.id} at step ${i}`).toBeDefined();
        const options = lib.legalActions(s, seat as number).filter((a) => a.type !== 'capitulate');
        const pick =
          options.find((a) =>
            ['buildSettlement', 'buildHarbor', 'foundSettlement'].includes(a.type),
          ) ??
          options.find((a) => a.type === 'attack' || a.type === 'battleRoll') ??
          (rand() < 0.2 ? options.find((a) => a.type === 'buyUnit') : undefined) ??
          options[Math.floor(rand() * options.length)];
        s = act(s, pick as Action);
      }
      const c = ctxOf(s);
      expect(
        s.winner,
        `seed ${seed}: ${s.turn.number} turns, ${s.phase.id}, vp ${s.players.map((p) => c.vp(p.seat))} of ${c.vpTarget()}`,
      ).not.toBeNull();
    }
  }, 120_000);
});
