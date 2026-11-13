import { describe, expect, it } from 'vitest';
import {
  stateFromView,
  type Action,
  type CornerId,
  type HexId,
  type Piece,
} from '@colonizers/engine';
import { produce } from '@colonizers/module-base';
import { ckData, levels } from '@colonizers/module-cities-knights';
import { beerOf, beerRatio, buildingsOf, gwpData, NEUTRALS } from '../src/index.ts';
import {
  lib,
  game,
  seaGame,
  ctxOf,
  edit,
  act,
  rng,
  finishSetup,
  main,
  cornerBy,
  placeCity,
  improve,
  grant,
} from './helpers.ts';

describe('Greed, Wealth & Power setup', () => {
  it('adds three tracks, three commodities, a 12-sided die, 18 points and 5 progress cards', () => {
    const s = game();
    const ctx = ctxOf(s);
    expect(ctx.setting<string[]>('ckTracks')).toEqual([
      'science',
      'trade',
      'politics',
      'magic',
      'religion',
      'wealth',
    ]);
    expect(ctx.setting<string[]>('ckEventFaces')).toHaveLength(12);
    expect(ctx.setting<number>('progressLimit')).toBe(5);
    expect(ctx.vpTarget()).toBe(18);
    for (const c of ['crystal', 'bread', 'gold']) expect(s.bank[c]).toBe(12);
  });

  it('improves the new tracks with their commodities and awards their metropolises', () => {
    let s = main();
    s = grant(s, 0, { crystal: 10 });
    for (let i = 0; i < 4; i++) s = act(s, { type: 'improveCity', player: 0, track: 'magic' });
    const ctx = ctxOf(s);
    expect(levels(ctx, 0).magic).toBe(4);
    expect(ckData(ctx).metropolis.magic?.seat).toBe(0);
    expect(s.players[0]!.hand.crystal).toBe(0);
  });

  it('stops Science and Religion at level 3 once you own the Magic metropolis', () => {
    let s = placeCity(main(), 0, 'grain').state;
    s = grant(s, 0, { crystal: 10, paper: 10, bread: 10, gold: 10 });
    for (let i = 0; i < 4; i++) s = improve(s, 0, 'magic');
    for (let i = 0; i < 3; i++) s = improve(s, 0, 'science');
    expect(lib.check(s, { type: 'improveCity', player: 0, track: 'science' })).toMatch(
      /magic metropolis/,
    );
    // Wealth isn't one of the three, so it can still grow past 3.
    for (let i = 0; i < 4; i++) s = improve(s, 0, 'wealth');
    expect(levels(ctxOf(s), 0).wealth).toBe(4);
  });
});

describe('The special buildings', () => {
  it('builds a Citadel beside a city on a brick hex, which then makes Crystal', () => {
    const placed = placeCity(main(), 0, 'brick');
    let s = grant(placed.state, 0, { ore: 1, brick: 2 });
    s = act(s, {
      type: 'buildGwp',
      player: 0,
      building: 'citadel',
      corner: placed.corner,
      hex: placed.hex,
    });
    expect(buildingsOf(ctxOf(s), 0).citadel).toEqual({ corner: placed.corner, hex: placed.hex });
    const before = { ...s.players[0]!.hand };
    const token = s.hexes[placed.hex]!.token as number;
    s = edit(s, (ctx) => {
      for (const r of ctx.piecesOfType('robber')) ctx.remove(r);
      produce(ctx, token);
    });
    const hand = s.players[0]!.hand;
    expect((hand.crystal ?? 0) - (before.crystal ?? 0)).toBeGreaterThanOrEqual(1);
  });

  it('turns a settlement into a city when a Citadel is built in it', () => {
    let s = main();
    let corner = '' as CornerId;
    let hex = '' as HexId;
    s = edit(s, (ctx) => {
      ({ corner, hex } = cornerBy(ctx, 'brick'));
      ctx.place('settlement', 0, { kind: 'corner', id: corner });
    });
    expect(lib.check(s, { type: 'buildGwp', player: 0, building: 'citadel', corner, hex })).toMatch(
      /afford/,
    );
    s = grant(s, 0, { ore: 3, grain: 2, brick: 2 });
    s = act(s, { type: 'buildGwp', player: 0, building: 'citadel', corner, hex });
    expect(ctxOf(s).buildingAt(corner)?.type).toBe('city');
  });

  it('makes Bread with a Diocese and one more grain with a Silo', () => {
    const placed = placeCity(main(), 0, 'grain');
    let s = grant(placed.state, 0, { brick: 2, lumber: 2, grain: 1 });
    s = act(s, {
      type: 'buildGwp',
      player: 0,
      building: 'diocese',
      corner: placed.corner,
      hex: placed.hex,
    });
    // Only one building per hex for the same city.
    expect(
      lib.check(s, {
        type: 'buildGwp',
        player: 0,
        building: 'silo',
        corner: placed.corner,
        hex: placed.hex,
      }),
    ).toMatch(/already has a building/);
    const before = { ...s.players[0]!.hand };
    const token = s.hexes[placed.hex]!.token as number;
    s = edit(s, (ctx) => {
      for (const r of ctx.piecesOfType('robber')) ctx.remove(r);
      produce(ctx, token);
    });
    const hand = s.players[0]!.hand;
    expect((hand.bread ?? 0) - (before.bread ?? 0)).toBeGreaterThanOrEqual(1);
  });

  it("refuses a Diocese in a city with a Citadel, and buildings that don't fit the hex", () => {
    const placed = placeCity(main(), 0, 'brick');
    let s = grant(placed.state, 0, { ore: 1, brick: 3, lumber: 1, grain: 1 });
    expect(
      lib.check(s, {
        type: 'buildGwp',
        player: 0,
        building: 'diocese',
        corner: placed.corner,
        hex: placed.hex,
      }),
    ).toMatch(/grain hex/);
    s = act(s, {
      type: 'buildGwp',
      player: 0,
      building: 'citadel',
      corner: placed.corner,
      hex: placed.hex,
    });
    expect(
      lib.check(s, {
        type: 'buildGwp',
        player: 0,
        building: 'citadel',
        corner: placed.corner,
        hex: placed.hex,
      }),
    ).toMatch(/already built/);
  });

  it('loses the building when its city is knocked back to a settlement', () => {
    const placed = placeCity(main(), 0, 'grain');
    let s = grant(placed.state, 0, { brick: 1, lumber: 1 });
    s = act(s, {
      type: 'buildGwp',
      player: 0,
      building: 'silo',
      corner: placed.corner,
      hex: placed.hex,
    });
    s = edit(s, (ctx) => {
      ctx.upgrade(ctx.buildingAt(placed.corner) as Piece, 'settlement');
    });
    s = act(s, { type: 'endTurn', player: 0 });
    expect(buildingsOf(ctxOf(s), 0).silo).toBeUndefined();
  });

  it('turns one gold-field pick into a Gold commodity with a Monument', () => {
    let s = edit(finishSetup(seaGame()), (ctx) => ctx.setPhase({ id: 'main' }));
    const placed = placeCity(s, 0, 'gold');
    s = grant(placed.state, 0, { ore: 1, brick: 1 });
    s = act(s, {
      type: 'buildGwp',
      player: 0,
      building: 'monument',
      corner: placed.corner,
      hex: placed.hex,
    });
    const token = s.hexes[placed.hex]!.token as number;
    edit(s, (ctx) => {
      for (const r of ctx.piecesOfType('robber')) ctx.remove(r);
      const sea = ctx.data<{ pendingGold: Record<number, number> }>('seafarers');
      sea.pendingGold = {};
      const gold = ctx.state.players[0]!.hand.gold ?? 0;
      produce(ctx, token);
      expect((ctx.state.players[0]!.hand.gold ?? 0) - gold).toBe(1);
      expect(sea.pendingGold[0]).toBe(1);
    });
  });
});

describe('Level 3 abilities and Beer', () => {
  it('trades brick 1:1 with Magic and any resource 2:1 with Wealth, but not for commodities', () => {
    let s = main();
    s = edit(s, (ctx) => {
      levels(ctx, 0).magic = 3;
      levels(ctx, 0).wealth = 3;
      ctx.grant(0, { brick: 1, wool: 2 });
    });
    const wool = s.players[0]!.hand.wool ?? 0;
    expect(lib.check(s, { type: 'bankTrade', player: 0, give: 'brick', get: 'paper' })).toMatch(
      /You need/,
    );
    s = act(s, { type: 'bankTrade', player: 0, give: 'brick', get: 'ore' });
    s = act(s, { type: 'bankTrade', player: 0, give: 'wool', get: 'grain' });
    expect(s.players[0]!.hand.wool ?? 0).toBe(wool - 2);
  });

  it('brews Beer with Religion level 3 when a roll brings nothing', () => {
    let s = main();
    s = edit(s, (ctx) => {
      levels(ctx, 1).religion = 3;
      for (const p of ctx.piecesOf(1)) if (p.at.kind === 'corner') ctx.remove(p);
      ctx.setPhase({ id: 'roll' });
    });
    // Roll until the roll isn't a 7.
    for (let i = 0; i < 20; i++) {
      const next = act(s, { type: 'roll', player: 0 });
      if (beerOf(ctxOf(next), 1) > 0) {
        s = next;
        break;
      }
      s = edit(s, (ctx) => ctx.rng.int(1, 6));
    }
    expect(beerOf(ctxOf(s), 1)).toBe(1);
  });

  it('spends Beer on commodities and on switching on any knight', () => {
    let s = main();
    let knight = '';
    s = edit(s, (ctx) => {
      gwpData(ctx).beer[0] = 5;
      const road = ctx.piecesOf(1, 'road')[0]!;
      if (road.at.kind !== 'edge') throw new Error('Road off an edge');
      const corner = (ctx.geometry.edgeCorners.get(road.at.id) ?? []).find(
        (c) => !ctx.piecesAt({ kind: 'corner', id: c }).length,
      )!;
      knight = ctx.place('knight1', 1, { kind: 'corner', id: corner }).id;
    });
    s = act(s, { type: 'beerKnight', player: 0, knight });
    expect(s.pieces[knight]!.props.active).toBe(true);
    expect(beerOf(ctxOf(s), 0)).toBe(4);
    expect(lib.check(s, { type: 'beerTrade', player: 0, get: 'ore' })).toMatch(/commodities/);
    const ratio = beerRatio(ctxOf(s), 0);
    s = act(s, { type: 'beerTrade', player: 0, get: 'crystal' });
    expect(beerOf(ctxOf(s), 0)).toBe(4 - ratio);
    expect(s.players[0]!.hand.crystal).toBe(1);
  });
});

describe('The 12-sided event die', () => {
  it('lets everyone pick a deck their levels open on a wild face', () => {
    let s = edit(main(), (ctx) => {
      ctx.state.settings.ckEventFaces = ['wild'];
      for (const p of ctx.state.players) levels(ctx, p.seat).trade = 5;
      ctx.setPhase({ id: 'roll' });
    });
    s = act(s, { type: 'roll', player: 0 });
    expect(s.phase.id).toBe('wildPick');
    expect(Object.keys(s.phase.owed as object)).toEqual(['0']);
    for (let seat = 0; seat < 4; seat++) {
      if (s.phase.id !== 'wildPick') break;
      expect(lib.check(s, { type: 'pickWildCard', player: seat, deck: 'science' })).toMatch(
        /do not open/,
      );
      s = act(s, { type: 'pickWildCard', player: seat, deck: 'trade' });
    }
    expect(s.phase.id).not.toBe('wildPick');
    for (const p of s.players) expect(p.held.trade?.length ?? 0).toBeGreaterThanOrEqual(1);
  });
});

describe('Random games', () => {
  it('plays thousands of random moves without breaking, and views stay consistent', () => {
    const neutrals = new Set<string>();
    for (const seed of [1, 2]) {
      let s = finishSetup(game(`gwp-sim-${seed}`));
      const rand = rng(seed);
      for (let i = 0; i < 2500 && s.winner === null; i++) {
        const waiting = lib.waitingOn(s);
        expect(waiting.length).toBeGreaterThan(0);
        const seat = waiting[Math.floor(rand() * waiting.length)]!;
        const options = lib.legalActions(s, seat);
        if (i % 50 === 0) {
          const mine = lib.legalActions(stateFromView(lib.view(s, seat)), seat);
          expect(mine.length).toBeGreaterThan(0);
        }
        // Lean toward building so the new rules come up.
        const prefer = options.filter((a) =>
          [
            'buildGwp',
            'improveCity',
            'buildCity',
            'beerTrade',
            'beerKnight',
            'playProgress',
            'placeNeutral',
          ].includes(a.type),
        );
        const pool = prefer.length && rand() < 0.6 ? prefer : options;
        s = act(s, pool[Math.floor(rand() * pool.length)] as Action);
        if (rand() < 0.02) s = grant(s, seat, { crystal: 1, bread: 1, gold: 1, brick: 1, ore: 1 });
        for (const p of Object.values(s.pieces))
          if ((NEUTRALS as readonly string[]).includes(p.type)) neutrals.add(p.type);
      }
      const d = gwpData(ctxOf(s));
      expect(d).toBeTruthy();
    }
    // Some neutral pieces came out along the way.
    expect(neutrals.size).toBeGreaterThan(0);
  }, 300_000);
});
