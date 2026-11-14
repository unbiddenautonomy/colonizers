import { describe, expect, it } from 'vitest';
import {
  Ctx,
  ModuleLibrary,
  type Action,
  type CornerId,
  type EdgeId,
  type GameState,
  type Piece,
} from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { citiesKnightsModule } from '@colonizers/module-cities-knights';
import { generateBoard } from '@colonizers/maps';
import { ARMY, soldiersModule } from '../src/index.ts';

const lib = new ModuleLibrary([baseModule, citiesKnightsModule, soldiersModule]);

function game(seed = 'soldiers-ck'): GameState {
  const board = generateBoard({ seed, players: 4, mode: 'classic' });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C', 'D'],
    modules: ['base', 'cities-knights', 'soldiers'],
    map: board.map,
    settings: { vpTarget: 16 },
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

function mainPhase(s = game()): GameState {
  return edit(s, (ctx) => {
    ctx.state.turn = { number: 1, player: 0, round: 0 };
    ctx.setPhase({ id: 'main' });
  });
}

/** Corners at least three apart, so buildings and armies don't touch. */
function spread(ctx: Ctx, n: number): CornerId[] {
  const out: CornerId[] = [];
  for (const c of ctx.geometry.corners) {
    if (!ctx.isLandCorner(c)) continue;
    const near = new Set<CornerId>([c]);
    for (const x of ctx.geometry.cornerNeighbours.get(c) ?? []) {
      near.add(x);
      for (const y of ctx.geometry.cornerNeighbours.get(x) ?? []) near.add(y);
    }
    if (out.some((o) => near.has(o))) continue;
    out.push(c);
    if (out.length === n) break;
  }
  return out;
}

function hold(ctx: Ctx, seat: number, deck: string, card: string) {
  (ctx.player(seat).held[deck] ??= []).push({ card, acquiredTurn: 0 });
}

const armies = (s: GameState, seat: number) =>
  Object.values(s.pieces).filter((p) => p.type === ARMY && p.owner === seat);

describe('Cities & Knights progress cards with units', () => {
  it('Warlord musters a free infantry', () => {
    let corner = '' as CornerId;
    let s = edit(mainPhase(), (ctx) => {
      [corner] = spread(ctx, 1) as [CornerId];
      ctx.place('settlement', 0, { kind: 'corner', id: corner });
      hold(ctx, 0, 'politics', 'warlord');
    });
    s = act(s, { type: 'playProgress', player: 0, card: 'warlord' });
    expect(s.phase.id).toBe('freeUnit');
    s = act(s, { type: 'placeFreeUnit', player: 0, corner });
    expect(s.phase.id).toBe('main');
    expect(armies(s, 0).map((a) => a.props.infantry)).toEqual([1]);
  });

  it('Smith steps a unit up a level, or musters an infantry', () => {
    let corner = '' as CornerId;
    let s = edit(mainPhase(), (ctx) => {
      [corner] = spread(ctx, 1) as [CornerId];
      ctx.place('settlement', 0, { kind: 'corner', id: corner });
      ctx.place(ARMY, 0, { kind: 'corner', id: corner }, { infantry: 2 });
      hold(ctx, 0, 'science', 'smith');
      hold(ctx, 0, 'science', 'smith');
    });
    const army = armies(s, 0)[0] as Piece;
    s = act(s, { type: 'playProgress', player: 0, card: 'smith' });
    expect(() => act(s, { type: 'smithPromote', player: 0, knight: army.id })).toThrow(/units/);
    s = act(s, { type: 'stepUpUnit', player: 0, army: army.id, unit: 'infantry' });
    expect(s.phase.id).toBe('main');
    expect(s.pieces[army.id]?.props).toMatchObject({ infantry: 1, cavalry: 1 });
    s = act(s, { type: 'playProgress', player: 0, card: 'smith' });
    s = act(s, { type: 'placeFreeUnit', player: 0, corner });
    expect(s.pieces[army.id]?.props).toMatchObject({ infantry: 2, cavalry: 1 });
  });

  it('Intrigue takes a rival infantry off your road', () => {
    let corner = '' as CornerId;
    let s = edit(mainPhase(), (ctx) => {
      [corner] = spread(ctx, 1) as [CornerId];
      const edge = (ctx.geometry.cornerEdges.get(corner) ?? [])[0] as EdgeId;
      ctx.place('road', 0, { kind: 'edge', id: edge });
      ctx.place(ARMY, 1, { kind: 'corner', id: corner }, { infantry: 1 });
      hold(ctx, 0, 'politics', 'intrigue');
    });
    const victim = armies(s, 1)[0] as Piece;
    s = act(s, { type: 'playProgress', player: 0, card: 'intrigue' });
    expect(s.phase.id).toBe('intrigue');
    s = act(s, { type: 'intrigueUnit', player: 0, army: victim.id });
    expect(s.pieces[victim.id]).toBeUndefined();
    expect(s.phase.id).toBe('main');
  });

  it('Deserter: the rival picks the unit, and it joins you at the same level', () => {
    let mine = '' as CornerId;
    let theirs = '' as CornerId;
    let s = edit(mainPhase(), (ctx) => {
      [mine, theirs] = spread(ctx, 2) as [CornerId, CornerId];
      ctx.place('settlement', 0, { kind: 'corner', id: mine });
      ctx.place(ARMY, 1, { kind: 'corner', id: theirs }, { infantry: 1, cavalry: 1 });
      hold(ctx, 0, 'politics', 'deserter');
    });
    const army = armies(s, 1)[0] as Piece;
    s = act(s, { type: 'playProgress', player: 0, card: 'deserter', target: 1 });
    expect(s.phase.id).toBe('desertKnight');
    expect(lib.legalActions(s, 1).map((a) => a.unit)).toEqual(['infantry', 'cavalry']);
    s = act(s, { type: 'desertUnit', player: 1, army: army.id, unit: 'cavalry' });
    expect(s.phase).toMatchObject({ id: 'placeDeserterUnit', unit: 'cavalry' });
    s = act(s, { type: 'placeFreeUnit', player: 0, corner: mine });
    expect(armies(s, 0)[0]?.props).toMatchObject({ cavalry: 1 });
    expect(s.pieces[army.id]?.props).toMatchObject({ infantry: 1, cavalry: 0 });
    expect(s.phase.id).toBe('main');
  });

  it('Engineer builds a free Soldiers & Armies wall', () => {
    let corner = '' as CornerId;
    let s = edit(mainPhase(), (ctx) => {
      [corner] = spread(ctx, 1) as [CornerId];
      ctx.place('city', 0, { kind: 'corner', id: corner }, { walls: 2 });
      hold(ctx, 0, 'science', 'engineer');
    });
    s = act(s, { type: 'playProgress', player: 0, card: 'engineer' });
    s = act(s, { type: 'placeFreeWall', player: 0, corner });
    expect(ctxOf(s).buildingAt(corner)?.props.walls).toBe(3);
    expect(ctxOf(s).buildingAt(corner)?.props.wall).toBeUndefined();
  });

  it('keeps the cards in hand when they have nothing to act on', () => {
    const s = edit(mainPhase(), (ctx) => {
      hold(ctx, 0, 'politics', 'intrigue');
      hold(ctx, 0, 'politics', 'deserter');
      hold(ctx, 0, 'science', 'engineer');
    });
    expect(() => act(s, { type: 'playProgress', player: 0, card: 'intrigue' })).toThrow(/rival/);
    expect(() => act(s, { type: 'playProgress', player: 0, card: 'deserter', target: 1 })).toThrow(
      /no units/,
    );
    expect(() => act(s, { type: 'playProgress', player: 0, card: 'engineer' })).toThrow(/city/);
  });
});
