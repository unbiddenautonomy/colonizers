import { describe, expect, it } from 'vitest';
import type { CornerId, Ctx, EdgeId, GameState, HexId } from '@colonizers/engine';
import {
  attack,
  barbarianStrength,
  citiesOf,
  ckData,
  isActive,
  isSheltered,
  levels,
  progressHeld,
  setMetropolis,
} from '@colonizers/module-cities-knights';
import { buildingsOf } from '@colonizers/module-greed-wealth-power';
import { act, ctxOf, edit, finishSetup, game, lib, main, pick, rng } from './helpers.ts';
import { addGift, civView, giftsOf, unionLeader } from '../src/index.ts';
import { startColony } from '../src/part4.ts';

/** Civilisations part 4: Spain, Britain, Nordic, Poland, Cuba, the Ottomans and the Aztecs. */

const OTHERS = ['kongo', 'morocco', 'mali'];

const start = (civ: string) => finishSetup(pick(game(), [civ, ...OTHERS]));

const unlock = (s: GameState, seat = 0) =>
  edit(s, (ctx) => {
    (ctx.state.data.civilisations as { unlocked: Record<number, boolean> }).unlocked[seat] = true;
  });

const legal = (s: GameState, seat: number, type: string) =>
  lib.legalActions(s, seat).filter((a) => a.type === type);

const cityCount = (s: GameState, seat: number) => citiesOf(ctxOf(s), seat).length;

/** Free land corners away from everyone. */
function freeCorners(ctx: Ctx, n: number, coastal?: boolean): CornerId[] {
  const out: CornerId[] = [];
  for (const c of ctx.geometry.corners) {
    if (out.length >= n) break;
    if (!ctx.isLandCorner(c) || ctx.piecesAt({ kind: 'corner', id: c }).length) continue;
    const near = ctx.geometry.cornerNeighbours.get(c) ?? [];
    if (near.some((x) => ctx.buildingAt(x) || out.includes(x))) continue;
    const hexes = ctx.geometry.cornerHexes.get(c) ?? [];
    const sea = hexes.length < 3 || hexes.some((h) => ctx.state.hexes[h]?.type === 'sea');
    if (coastal !== undefined && sea !== coastal) continue;
    out.push(c);
  }
  return out;
}

describe('Civilisations part 4', () => {
  it('Spain: the Inquisitor on a hex of their choice and two Religion cards', () => {
    const s = start('spain');
    const ctx = ctxOf(s);
    expect(ctx.piecesOfType('inquisitor')[0]?.owner).toBe(0);
    expect(progressHeld(ctx, 0).filter((h) => h.deck === 'religion')).toHaveLength(2);
  });

  it('Spain: from 10 points, plays a civilisation from the Americas, drawing again once', () => {
    let s = unlock(main(start('spain')));
    s = edit(s, (ctx) => startColony(ctx, 0));
    expect(s.phase.id).toBe('civColony');
    const first = s.phase.options as string[];
    expect(first).toHaveLength(1);
    s = act(s, { type: 'civColony', player: 0, civ: 'redraw' });
    const second = s.phase.options as string[];
    expect(second[0]).not.toBe(first[0]);
    expect(legal(s, 0, 'civColony').some((a) => a.civ === 'redraw')).toBe(false);
    s = act(s, { type: 'civColony', player: 0, civ: second[0] });
    expect(civView(ctxOf(s)).civ?.[0]).toBe(second[0]);
    expect(['granColombia', 'maya', 'inca', 'aztec', 'cuba']).toContain(second[0]);
    expect(['main', 'civNeutral', 'progressDiscard']).toContain(s.phase.id);
  });

  it('Britain: the barbarians can not take their cities; from 10 points, a new civilisation', () => {
    let s = main(start('britain'));
    s = edit(s, (ctx) => attack(ctx));
    expect(cityCount(s, 0)).toBe(1);
    expect(ckData(ctxOf(s)).pendingLoss).not.toContain(0);
    expect([1, 2, 3].some((p) => cityCount(s, p) === 0)).toBe(true);

    s = unlock(main(start('britain')));
    s = edit(s, (ctx) => startColony(ctx, 0));
    const options = s.phase.options as string[];
    expect(options).toHaveLength(3);
    for (const c of options) expect(['britain', 'spain', ...OTHERS]).not.toContain(c);
    s = act(s, { type: 'civColony', player: 0, civ: options[1] });
    expect(civView(ctxOf(s)).civ?.[0]).toBe(options[1]);
  });

  it('Nordic: their knights join the barbarians and their cities do not count', () => {
    let s = main(start('nordic'));
    const plain = (ctx: Ctx) =>
      [1, 2, 3].reduce(
        (n, p) => n + citiesOf(ctx, p).filter((c) => !isSheltered(ctx, c)).length,
        0,
      );
    expect(barbarianStrength(ctxOf(s))).toBe(plain(ctxOf(s)));
    const knight = legal(s, 0, 'civKnight')[0]!;
    s = act(s, knight);
    expect(barbarianStrength(ctxOf(s))).toBe(plain(ctxOf(s)) + 2);
  });

  it('Nordic: when Catan wins they lose a city', () => {
    let s = main(start('nordic'));
    s = edit(s, (ctx) => {
      const c = freeCorners(ctx, 1)[0]!;
      const k = ctx.place('knight3', 1, { kind: 'corner', id: c });
      k.props.active = true;
      attack(ctx);
    });
    expect(cityCount(s, 0)).toBe(0);
  });

  it("Nordic: Thor's Hammer wins with the barbarians, for a point, leaving the knights be", () => {
    let s = unlock(main(start('nordic')));
    s = act(s, legal(s, 0, 'civKnight')[0]!);
    const vp = ctxOf(s).vp(0);
    s = act(s, { type: 'civThor', player: 0 });
    const ctx = ctxOf(s);
    expect(ctx.vp(0)).toBe(vp + 1);
    expect(cityCount(s, 0)).toBe(1);
    for (const p of [1, 2, 3]) expect(cityCount(s, p)).toBe(0);
    expect(
      ctx
        .piecesOf(0)
        .filter((p) => p.type.startsWith('knight'))
        .every(isActive),
    ).toBe(true);
    expect(legal(s, 0, 'civThor')).toHaveLength(0);
  });

  it('Poland: moving the robber lets the hussars destroy a road and build one free', () => {
    let s = main(start('poland'));
    let hex = '' as HexId;
    let edge = '' as EdgeId;
    s = edit(s, (ctx) => {
      const road = ctx.piecesOf(1, 'road')[0]!;
      edge = (road.at as { id: EdgeId }).id;
      hex = ctx.geometry.hexes.find(
        (h) =>
          ctx.state.hexes[h]?.type !== 'sea' &&
          ctx.state.hexes[h]?.type !== 'desert' &&
          ctx.geometry.hexEdges.get(h)!.includes(edge) &&
          !ctx.piecesAt({ kind: 'hex', id: h }).length,
      )!;
      ckData(ctx).robberActive = true;
      ctx.setPhase({ id: 'moveRobber', returnTo: 'main' });
    });
    s = act(s, { type: 'moveRobber', player: 0, hex });
    s = main(s);
    expect(giftsOf(ctxOf(s), 0)).toContainEqual({ kind: 'hussar', hex });
    s = act(s, { type: 'civHussar', player: 0, at: edge });
    expect(ctxOf(s).piecesAt({ kind: 'edge', id: edge })).toHaveLength(0);
    expect(giftsOf(ctxOf(s), 0)).toContainEqual({ kind: 'route', only: 'road' });
  });

  it('Poland: the union shares the leader’s production for a round', () => {
    let s = unlock(main(start('poland')));
    const leader = unionLeader(ctxOf(s), 0)!;
    s = act(s, { type: 'civUnion', player: 0 });
    expect(civView(ctxOf(s)).union?.leader).toBe(leader);
    let shared = 0;
    let produced = 0;
    for (let i = 0; i < 40 && s.turn.number < civView(ctxOf(s)).union!.until; i++) {
      const seat = lib.waitingOn(s)[0]!;
      const options = lib.legalActions(s, seat);
      const a =
        options.find((x) => x.type === 'roll') ??
        options.find((x) => x.type === 'endTurn') ??
        options[0]!;
      const r = lib.apply(s, a);
      for (const e of r.events) {
        const got = (e.received as Record<number, unknown> | undefined)?.[leader];
        if (e.type === 'production' && got && Object.keys(got).length) produced++;
        if (e.type === 'civUnionShare' && e.cards) shared++;
      }
      s = r.state;
    }
    expect(produced).toBeGreaterThan(0);
    expect(shared).toBe(produced);
  });

  it('Cuba: settlements by the sea bring progress cards and commodities', () => {
    let s = main(start('cuba'));
    s = edit(s, (ctx) => {
      addGift(ctx, 0, { kind: 'settlement', where: 'free' });
      addGift(ctx, 0, { kind: 'settlement', where: 'free' });
    });
    const [a, b] = freeCorners(ctxOf(s), 2, true);
    s = act(s, { type: 'civSettle', player: 0, corner: a });
    const kinds = () => giftsOf(ctxOf(s), 0).map((g) => g.kind);
    expect(kinds().filter((k) => k === 'commodity')).toHaveLength(2);
    expect(kinds().filter((k) => k === 'progress')).toHaveLength(2);
    s = act(s, { type: 'civSettle', player: 0, corner: b });
    expect(kinds().filter((k) => k === 'commodity')).toHaveLength(3);
    s = act(s, legal(s, 0, 'civCommodity')[0]!);
    expect(kinds().filter((k) => k === 'commodity')).toHaveLength(2);
  });

  it('Cuba: the first rival to reach the winning points hands over their metropolis', () => {
    let s = unlock(main(start('cuba')));
    s = edit(s, (ctx) => {
      levels(ctx, 1).science = 4;
      setMetropolis(ctx, 1, 'science', citiesOf(ctx, 1)[0]!);
      (ctx.state.data.civilisations as { raids?: Record<number, number> }).raids = { 1: 30 };
    });
    s = act(s, { type: 'endTurn', player: 0 });
    const ctx = ctxOf(s);
    expect(ckData(ctx).metropolis.science?.seat).toBe(0);
    expect(levels(ctx, 1).science).toBe(levels(ctx, 0).science);
  });

  it('Ottoman: a Citadel, a wall and a Politics card; from 10 points, the Bombard', () => {
    let s = main(start('ottoman'));
    const ctx = ctxOf(s);
    expect(giftsOf(ctx, 0)).toContainEqual({ kind: 'building', options: ['citadel'] });
    expect(citiesOf(ctx, 0)[0]?.props.wall).toBe(true);
    expect(progressHeld(ctx, 0).filter((h) => h.deck === 'politics')).toHaveLength(1);
    const build = legal(s, 0, 'civBuilding');
    if (build.length) {
      s = act(s, build[0]!);
      expect(buildingsOf(ctxOf(s), 0).citadel).toBeTruthy();
    }
    s = unlock(s);
    expect(legal(s, 0, 'civBombard')).toHaveLength(0);
    s = edit(s, (c) => (ckData(c).barbarian = 4));
    s = act(s, { type: 'civBombard', player: 0 });
    expect(ckData(ctxOf(s)).barbarian).toBe(0);
    expect(ckData(ctxOf(s)).robberActive).toBe(true);
    expect(legal(s, 0, 'civBombard')).toHaveLength(0);
  });

  it('Aztec: the capital takes from one hex; with five settlements, a free city', () => {
    let s = main(start('aztec'));
    const before = { ...ctxOf(s).player(0).hand };
    const take = legal(s, 0, 'civCapital');
    expect(take.length).toBeGreaterThan(0);
    s = act(s, take[0]!);
    const after = ctxOf(s).player(0).hand;
    const gained = Object.keys(after).reduce((n, c) => n + (after[c]! - (before[c] ?? 0)), 0);
    expect(gained).toBeGreaterThanOrEqual(2);
    expect(legal(s, 0, 'civCapital')).toHaveLength(0);

    s = unlock(s);
    s = edit(s, (ctx) => {
      const n = ctx.supplyLeft(0, 'settlement');
      for (const c of freeCorners(ctx, n)) ctx.place('settlement', 0, { kind: 'corner', id: c });
    });
    s = act(s, { type: 'endTurn', player: 0 });
    s = main(s);
    expect(giftsOf(ctxOf(s), 0).filter((g) => g.kind === 'progress')).toHaveLength(3);
    const up = legal(s, 0, 'civUpgrade');
    expect(up.length).toBeGreaterThan(0);
    s = act(s, up[0]!);
    expect(cityCount(s, 0)).toBe(2);
  });
});

describe('Civilisations part 4, played at random', () => {
  const groups = [
    ['spain', 'britain', 'nordic', 'poland'],
    ['cuba', 'ottoman', 'aztec', 'nordic'],
    ['poland', 'aztec', 'britain', 'cuba'],
  ];
  for (const civs of groups)
    it(`never gets stuck with ${civs.join(', ')}`, () => {
      let s = finishSetup(pick(game(civs[0], true), civs));
      s = edit(s, (ctx) => {
        const d = ctx.state.data.civilisations as { unlocked: Record<number, boolean> };
        for (let seat = 0; seat < 4; seat++) d.unlocked[seat] = true;
        startColony(ctx, civs.indexOf('britain') >= 0 ? civs.indexOf('britain') : 0);
      });
      const rand = rng(civs.length * 13 + civs[1]!.length);
      const seen = new Set<string>();
      for (let i = 0; i < 2500 && s.winner === null; i++) {
        const seats = lib.waitingOn(s);
        expect(seats.length).toBeGreaterThan(0);
        const options = seats.flatMap((seat) => lib.legalActions(s, seat));
        expect(options.length).toBeGreaterThan(0);
        const pool = options.filter((a) => !a.type.endsWith('Trade') && a.type !== 'offerTrade');
        const from = pool.length ? pool : options;
        const a = from[Math.floor(rand() * from.length)]!;
        if (a.type.startsWith('civ')) seen.add(a.type);
        s = act(s, a);
      }
      expect(seen.size).toBeGreaterThan(0);
    }, 60_000);
});
