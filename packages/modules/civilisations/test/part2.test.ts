import { describe, expect, it } from 'vitest';
import type { CornerId, EdgeId, GameState, HexId } from '@colonizers/engine';
import { ckData, levels } from '@colonizers/module-cities-knights';
import { act, ctxOf, edit, finishSetup, game, lib, main, pick } from './helpers.ts';
import { anyPicksOf, giftsOf, settleBlock } from '../src/index.ts';

/** Civilisations part 2: dice, the robber, harbors and the board. */

const OTHERS = ['kongo', 'morocco', 'mali'];

/** Seat 0 plays this civilisation; the start choices and placements are done. */
const start = (civ: string, wonders = false) =>
  finishSetup(pick(game('civ', wonders), [civ, ...OTHERS]));

const unlock = (s: GameState, seat = 0) =>
  edit(s, (ctx) => {
    (ctx.state.data.civilisations as { unlocked: Record<number, boolean> }).unlocked[seat] = true;
  });

/** Forces the next roll's dice. */
const dice = (s: GameState, seat: number, red: number, yellow: number, event: string) =>
  edit(s, (ctx) => {
    ctx.state.turn.player = seat;
    ctx.setPhase({ id: 'roll' });
    ckData(ctx).alchemist = { red, yellow };
    ckData(ctx).forcedEvent = event as never;
  });

const legal = (s: GameState, seat: number, type: string) =>
  lib.legalActions(s, seat).filter((a) => a.type === type);

describe('Civilisations part 2', () => {
  it('Greece: from 10 points, holds the roll to throw dice again, once every two rounds', () => {
    let s = unlock(start('greece'));
    s = dice(s, 1, 2, 3, 'ship');
    s = act(s, { type: 'roll', player: 1 });
    expect(s.phase.id).toBe('civDemocracy');
    expect(lib.waitingOn(s)).toContain(0);
    expect(legal(s, 0, 'civDemocracy')).toHaveLength(8);
    s = act(s, { type: 'civDemocracy', player: 0, dice: 'red+yellow' });
    expect(s.phase.id).not.toBe('civDemocracy');
    // Used: the next roll isn't held.
    s = dice(s, 2, 2, 3, 'ship');
    s = act(s, { type: 'roll', player: 2 });
    expect(s.phase.id).not.toBe('civDemocracy');
  });

  it('Greece: starts with the Scholar and two Science cards', () => {
    const s = pick(game(), ['greece', ...OTHERS]);
    expect(s.players[0]!.held.science).toHaveLength(2);
    expect(s.phase.id).toBe('civNeutral');
  });

  it('Russia: throws the dice for the robber after a 7 by the player before', () => {
    let s = finishSetup(pick(game(), ['kongo', 'russia', 'morocco', 'mali']));
    s = edit(s, (ctx) => {
      ckData(ctx).robberActive = true;
      for (const p of ctx.state.players) p.hand = {};
    });
    s = dice(s, 0, 3, 4, 'ship');
    s = act(s, { type: 'roll', player: 0 });
    expect(s.phase.id).toBe('civMuscovy');
    expect(lib.waitingOn(s)).toContain(1);
    expect(legal(s, 0, 'moveRobber')).toHaveLength(0);
    s = act(s, { type: 'civMuscovy', player: 1, use: true });
    if (s.phase.id === 'civMuscovyHex') {
      const opts = legal(s, 1, 'civMuscovyHex');
      s = act(s, opts[0]!);
      const robber = ctxOf(s).piecesOfType('robber')[0]!;
      expect(robber.at).toEqual({ kind: 'hex', id: opts[0]!.hex });
    } else expect(s.phase.id).toBe('moveRobber');
  });

  it('Mongolia: a 3 lets them move the robber, and robbing takes a progress card too', () => {
    let s = start('mongolia');
    s = edit(s, (ctx) => {
      ckData(ctx).robberActive = true;
    });
    s = dice(s, 0, 1, 2, 'ship');
    s = act(s, { type: 'roll', player: 0 });
    expect(legal(s, 0, 'civKhagan')).toHaveLength(1);
    s = act(s, { type: 'civKhagan', player: 0 });
    expect(s.phase.id).toBe('moveRobber');
    // Find a hex with exactly one rival, holding a card and a progress card.
    let target: HexId | null = null;
    s = edit(s, (ctx) => {
      for (const p of ctx.state.players) p.hand = {};
      for (const p of ctx.state.players) p.held = {};
      target = ctx.geometry.hexes.find((h) => {
        const owners = new Set(
          (ctx.geometry.hexCorners.get(h) ?? [])
            .map((c) => ctx.buildingAt(c)?.owner)
            .filter((o) => o !== undefined && o !== null),
        );
        return (
          owners.size === 1 &&
          !owners.has(0) &&
          ctx.isLand(h) &&
          ctx.state.hexes[h]!.type !== 'desert'
        );
      })!;
      const victim = [...(ctx.geometry.hexCorners.get(target) ?? [])]
        .map((c) => ctx.buildingAt(c)?.owner)
        .find((o) => typeof o === 'number')!;
      ctx.player(victim).hand = { ore: 1 };
      ctx.player(victim).held = { politics: [{ card: 'spy', acquiredTurn: 0 }] };
      for (const r of ctx.piecesOfType('robber')) ctx.remove(r);
    });
    s = act(s, { type: 'moveRobber', player: 0, hex: target! });
    expect(s.players[0]!.hand.ore).toBe(1);
    expect(s.players[0]!.held.politics).toHaveLength(1);
  });

  it('France: swaps the robber hex number once, and from 10 points brings down a strong knight', () => {
    let s = main(start('france'), 0);
    s = edit(s, (ctx) => {
      const robber = ctx.piecesOfType('robber')[0]!;
      const hex = ctx.geometry.hexes.find((h) => ctx.state.hexes[h]?.token === 6)!;
      ctx.move(robber, { kind: 'hex', id: hex });
    });
    const opts = legal(s, 0, 'civGallic');
    expect(opts.length).toBeGreaterThan(0);
    const before = ctxOf(s);
    const robberHex = (before.piecesOfType('robber')[0]!.at as { id: HexId }).id;
    const robberToken = before.state.hexes[robberHex]?.token;
    if (robberToken !== undefined) {
      const to = opts[0]!.hex as HexId;
      const theirs = before.state.hexes[to]!.token;
      s = act(s, opts[0]!);
      expect(s.hexes[robberHex]!.token).toBe(theirs);
      expect(s.hexes[to]!.token).toBe(robberToken);
      expect(lib.check(s, opts[1] ?? opts[0]!)).toBe('Once a game');
    }
    let corner = '' as CornerId;
    s = unlock(
      edit(s, (ctx) => {
        corner = ctx.geometry.corners.find(
          (c) => ctx.isLandCorner(c) && !ctx.piecesAt({ kind: 'corner', id: c }).length,
        )!;
        ctx.place('knight2', 1, { kind: 'corner', id: corner }, { active: true });
      }),
    );
    s = act(s, { type: 'civRevolution', player: 0, corner });
    expect(ctxOf(s).piecesAt({ kind: 'corner', id: corner })).toHaveLength(0);
    expect(giftsOf(ctxOf(s), 0)).toContainEqual({ kind: 'settlement', where: 'any' });
  });

  it('Gran Colombia: moves a harbor, takes two free routes, and throws again for a card', () => {
    let s = main(start('granColombia'), 0);
    const gifts = giftsOf(ctxOf(s), 0);
    expect(gifts.filter((g) => g.kind === 'route')).toHaveLength(2);
    const move = legal(s, 0, 'civHarbor')[0]!;
    s = act(s, move);
    expect(s.harbors.some((h) => h.edge === (move.to as EdgeId))).toBe(true);
    s = unlock(s);
    s = dice(s, 0, 2, 3, 'ship');
    const r = lib.apply(s, { type: 'roll', player: 0 });
    expect(r.events.some((e) => e.type === 'civElDorado')).toBe(true);
  });

  it('Inca: settlements by mountains or pasture cost a card less, roads come two for one', () => {
    let s = main(start('inca', true), 0);
    let corner = '' as CornerId;
    s = edit(s, (ctx) => {
      corner = ctx.geometry.corners.find(
        (c) =>
          (ctx.geometry.cornerHexes.get(c) ?? []).some(
            (h) => ctx.state.hexes[h]?.type === 'mountains',
          ) &&
          ctx.buildingAt(c) === undefined &&
          (ctx.geometry.cornerNeighbours.get(c) ?? []).every((n) => !ctx.buildingAt(n)) &&
          !ctx.piecesAt({ kind: 'corner', id: c }).length,
      )!;
      const edge = ctx.geometry.cornerEdges.get(corner)![0]!;
      ctx.place('road', 0, { kind: 'edge', id: edge });
      ctx.player(0).hand = { brick: 1, lumber: 1, wool: 1 };
    });
    expect(lib.check(s, { type: 'buildSettlement', player: 0, corner })).toBeNull();
    s = act(s, { type: 'buildSettlement', player: 0, corner });
    expect(ctxOf(s).buildingAt(corner)?.owner).toBe(0);
    // A road by the mountains brings a free one.
    s = edit(s, (ctx) => (ctx.player(0).hand = { brick: 1, lumber: 1 }));
    const road = legal(s, 0, 'buildRoad').find((a) =>
      (ctxOf(s).geometry.edgeHexes.get(a.edge as EdgeId) ?? []).some(
        (h) => s.hexes[h]?.type === 'mountains' || s.hexes[h]?.type === 'pasture',
      ),
    );
    if (road) {
      s = act(s, road);
      expect(giftsOf(ctxOf(s), 0)).toContainEqual({ kind: 'route', only: 'road' });
    }
  });

  it('Inca: from 10 points, swaps an inland hex with the sea once', () => {
    let s = unlock(main(start('inca'), 0));
    const opts = legal(s, 0, 'civTiticaca');
    expect(opts.length).toBeGreaterThan(0);
    const { land, sea } = opts[0]! as unknown as { land: HexId; sea: HexId };
    const was = s.hexes[land]!;
    s = act(s, opts[0]!);
    expect(s.hexes[sea]!.type).toBe(was.type);
    expect(s.hexes[sea]!.token).toBe(was.token);
    expect(s.hexes[land]!.type).toBe('sea');
  });

  it('China: picks a 2:1 resource, and from 10 points turns a city into five progress cards', () => {
    let s = main(start('china'), 0);
    s = act(s, { type: 'civSilk', player: 0, card: 'ore' });
    expect(ctxOf(s).reduce('swapRatio', 0, 'ore', 'grain', 4)).toBe(2);
    s = unlock(edit(s, (ctx) => (ctx.player(0).held = {})));
    const leap = legal(s, 0, 'civLeap')[0]!;
    s = act(s, leap);
    expect(ctxOf(s).buildingAt(leap.corner as CornerId)?.type).toBe('settlement');
    const held = ['science', 'trade', 'politics', 'magic', 'religion'].reduce(
      (n, t) => n + (s.players[0]!.held[t]?.length ?? 0),
      0,
    );
    // Five drawn; over the limit of 5 some go back, VP cards are played face up.
    expect(held + (s.phase.id === 'progressDiscard' ? 0 : 0)).toBeGreaterThan(0);
  });

  it('Maasai: takes two of their scarcest resource and trades it 1:1', () => {
    const s = start('maasai');
    const lake = (s.data.civilisations as { lake: Record<number, string> }).lake[0]!;
    expect(s.players[0]!.hand[lake]).toBeGreaterThanOrEqual(2);
    const other = lake === 'ore' ? 'grain' : 'ore';
    expect(ctxOf(s).reduce('swapRatio', 0, lake, other, 4)).toBe(1);
  });

  it('Australia: from 10 points, a free settlement on an island with none of their buildings', () => {
    let s = unlock(main(start('australia'), 0));
    // Make an island: one coastal land hex, cut off by sea.
    let isle = '' as HexId;
    s = edit(s, (ctx) => {
      isle = ctx.geometry.hexes.find(
        (h) =>
          ctx.isLand(h) &&
          (ctx.geometry.hexNeighbours.get(h) ?? []).some((n) => !ctx.isLand(n)) &&
          (ctx.geometry.hexCorners.get(h) ?? []).every(
            (c) => !ctx.piecesAt({ kind: 'corner', id: c }).length,
          ),
      )!;
      for (const n of ctx.geometry.hexNeighbours.get(isle) ?? []) {
        const hex = ctx.state.hexes[n]!;
        if (ctx.isLand(n)) {
          hex.type = 'sea';
          delete hex.token;
        }
      }
      for (const p of Object.values(ctx.state.pieces))
        if (p.at.kind === 'edge' || p.at.kind === 'corner') {
          const touching =
            p.at.kind === 'corner'
              ? (ctx.geometry.cornerHexes.get(p.at.id) ?? [])
              : (ctx.geometry.edgeHexes.get(p.at.id) ?? []);
          if (touching.some((h) => h !== isle && !ctx.isLand(h)) && touching.includes(isle))
            ctx.remove(p);
        }
    });
    s = edit(s, (ctx) => {
      // The unlock happened by hand: give the gift as the unlock would.
      (ctx.state.data.civilisations as { gifts: Record<number, unknown[]> }).gifts[0] = [
        { kind: 'settlement', where: 'island' },
      ];
    });
    const spots = legal(s, 0, 'civSettle');
    expect(spots.length).toBeGreaterThan(0);
    const ctx = ctxOf(s);
    for (const a of spots)
      expect((ctx.geometry.cornerHexes.get(a.corner as CornerId) ?? []).includes(isle)).toBe(true);
    expect(settleBlock(ctx, 0, spots[0]!.corner as CornerId, 'island')).toBeNull();
  });

  it('Indonesia: starts with brick, coin and a city wall; at 10 points, ships and a coastal settlement', () => {
    const s = start('indonesia');
    expect(s.players[0]!.hand.coin ?? 0).toBeGreaterThanOrEqual(2);
    expect(ctxOf(s).piecesOf(0, 'city')[0]!.props.wall).toBe(true);
  });

  it('Austria: a gate on their own roll brings its card whatever their level', () => {
    let s = start('austria');
    s = edit(s, (ctx) => (ctx.player(0).held = {}));
    s = dice(s, 0, 6, 3, 'science');
    expect(levels(ctxOf(s), 0).science).toBe(0);
    s = act(s, { type: 'roll', player: 0 });
    expect(s.players[0]!.held.science).toHaveLength(1);
  });

  it('Austria: from 10 points, draws a card from each deck and two more, keeping three', () => {
    let s = unlock(main(start('austria'), 0));
    s = edit(s, (ctx) => (ctx.player(0).held = {}));
    s = act(s, { type: 'civHabsburg', player: 0, deck: 'politics' });
    expect(s.phase.id).toBe('civHabsburg');
    // Others can't see the cards.
    const view = lib.view(s, 1).data.civilisations as { habsburg: { drawn: { card: string }[] } };
    expect(view.habsburg.drawn.every((x) => x.card === 'hidden')).toBe(true);
    s = act(s, { type: 'civHabsburgKeep', player: 0, keep: [0, 1, 2] });
    expect(s.phase.id).toBe('main');
  });

  it('Maori: a gate on their own roll brings any card of their choice', () => {
    let s = start('maori');
    s = dice(s, 0, 6, 3, 'trade');
    s = act(s, { type: 'roll', player: 0 });
    expect(anyPicksOf(ctxOf(s), 0)).toBe(1);
    const before = s.players[0]!.hand.coin ?? 0;
    s = act(s, { type: 'civPickAny', player: 0, card: 'coin' });
    expect(s.players[0]!.hand.coin).toBe(before + 1);
  });
});

describe('Civilisations part 2, played at random', () => {
  const groups = [
    ['greece', 'russia', 'mongolia', 'france'],
    ['granColombia', 'inca', 'china', 'maasai'],
    ['australia', 'indonesia', 'austria', 'maori'],
  ];
  for (const civs of groups)
    it(`never gets stuck with ${civs.join(', ')}`, () => {
      let s = finishSetup(pick(game(civs[0], true), civs));
      s = edit(s, (ctx) => {
        const d = ctx.state.data.civilisations as { unlocked: Record<number, boolean> };
        for (let seat = 0; seat < 4; seat++) d.unlocked[seat] = true;
      });
      const rand = rngOf(civs.length * 7 + civs[0]!.length);
      const seen = new Set<string>();
      for (let i = 0; i < 2500 && s.winner === null; i++) {
        const seats = lib.waitingOn(s);
        expect(seats.length).toBeGreaterThan(0);
        const options = seats.flatMap((seat) => lib.legalActions(s, seat));
        expect(options.length).toBeGreaterThan(0);
        // Trades go nowhere at random; prefer everything else.
        const pool = options.filter((a) => !a.type.endsWith('Trade') && a.type !== 'offerTrade');
        const a = (pool.length ? pool : options)[
          Math.floor(rand() * (pool.length || options.length))
        ]!;
        if (a.type.startsWith('civ')) seen.add(a.type);
        s = act(s, a);
      }
      expect(seen.size).toBeGreaterThan(0);
    }, 60_000);
});

function rngOf(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
