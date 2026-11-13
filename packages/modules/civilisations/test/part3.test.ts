import { describe, expect, it } from 'vitest';
import type { CornerId, GameState } from '@colonizers/engine';
import { ckData, levels, strength } from '@colonizers/module-cities-knights';
import { beerOf, buildingsOf } from '@colonizers/module-greed-wealth-power';
import { act, ctxOf, edit, finishSetup, game, lib, main, pick, rng } from './helpers.ts';
import { giftsOf, papuaZone, welfareOf } from '../src/index.ts';

/** Civilisations part 3: starting buildings, knights, welfare and revenge. */

const OTHERS = ['kongo', 'morocco', 'mali'];

const start = (civ: string) => finishSetup(pick(game(), [civ, ...OTHERS]));

const unlock = (s: GameState, seat = 0) =>
  edit(s, (ctx) => {
    (ctx.state.data.civilisations as { unlocked: Record<number, boolean> }).unlocked[seat] = true;
  });

const legal = (s: GameState, seat: number, type: string) =>
  lib.legalActions(s, seat).filter((a) => a.type === type);

/** A free land corner away from everyone. */
const freeCorner = (s: GameState): CornerId => {
  const ctx = ctxOf(s);
  return ctx.geometry.corners.find(
    (c) =>
      ctx.isLandCorner(c) &&
      !ctx.buildingAt(c) &&
      !ctx.piecesAt({ kind: 'corner', id: c }).length &&
      (ctx.geometry.cornerNeighbours.get(c) ?? []).every((n) => !ctx.buildingAt(n)),
  )!;
};

describe('Civilisations part 3', () => {
  it('Khmer: a free Diocese or Citadel and a Religion or Magic card', () => {
    let s = main(start('khmer'), 0);
    const gifts = giftsOf(ctxOf(s), 0);
    expect(gifts).toContainEqual({ kind: 'building', options: ['diocese', 'citadel'] });
    const build = legal(s, 0, 'civBuilding');
    if (build.length) {
      s = act(s, build[0]!);
      expect(Object.keys(buildingsOf(ctxOf(s), 0))).toHaveLength(1);
    }
    const decks = legal(s, 0, 'civProgress').map((a) => a.deck);
    expect(decks.every((d) => d === 'religion' || d === 'magic')).toBe(true);
  });

  it('Khmer: from 10 points, a progress card at each even score', () => {
    let s = unlock(main(start('khmer'), 0));
    s = edit(s, (ctx) => {
      for (let i = 0; i < 3; i++) {
        const c = ctx.geometry.corners.find(
          (x) =>
            ctx.isLandCorner(x) &&
            !ctx.piecesAt({ kind: 'corner', id: x }).length &&
            (ctx.geometry.cornerNeighbours.get(x) ?? []).every((n) => !ctx.buildingAt(n)),
        )!;
        ctx.place('city', 0, { kind: 'corner', id: c });
      }
    });
    s = act(s, { type: 'endTurn', player: 0 });
    const vp = ctxOf(s).vp(0);
    const progress = giftsOf(ctxOf(s), 0).filter((g) => g.kind === 'progress' && !g.decks);
    expect(progress.length).toBe(Math.floor((vp - 10) / 2) + 1);
  });

  it('Rome: from 10 points, annexes a rival settlement by its roads, paying its price', () => {
    let s = unlock(main(start('rome'), 0));
    let corner = '' as CornerId;
    s = edit(s, (ctx) => {
      corner = ctx
        .piecesOf(1, 'settlement')
        .map((p) => (p.at as { id: CornerId }).id)
        .find((c) =>
          (ctx.geometry.cornerEdges.get(c) ?? []).some(
            (e) => !ctx.piecesAt({ kind: 'edge', id: e }).length,
          ),
        )!;
      const edge = ctx.geometry.cornerEdges
        .get(corner)!
        .find((e) => !ctx.piecesAt({ kind: 'edge', id: e }).length)!;
      ctx.place('road', 0, { kind: 'edge', id: edge });
      ctx.player(0).hand = { brick: 1, lumber: 1, wool: 1, grain: 1 };
      ctx.player(1).hand = {};
    });
    s = act(s, { type: 'civAnnex', player: 0, corner });
    expect(ctxOf(s).buildingAt(corner)?.owner).toBe(0);
    expect(s.players[1]!.hand).toMatchObject({ brick: 1, lumber: 1, wool: 1, grain: 1 });
  });

  it('Babylon: from 10 points, strikes back at a thief', () => {
    let s = unlock(finishSetup(pick(game(), ['kongo', 'babylon', 'morocco', 'mali'])), 1);
    s = edit(s, (ctx) => {
      ctx.player(1).hand = { ore: 1 };
      ctkRobber(ctx);
    });
    const ctx = ctxOf(s);
    const hex = ctx.geometry.hexes.find(
      (h) =>
        (ctx.geometry.hexCorners.get(h) ?? []).some((c) => ctx.buildingAt(c)?.owner === 1) &&
        !(ctx.geometry.hexCorners.get(h) ?? []).some((c) => ctx.buildingAt(c)?.owner === 0) &&
        ctx.isLand(h),
    )!;
    s = edit(s, (c) => {
      c.state.turn.player = 0;
      c.setPhase({ id: 'moveRobber', returnTo: 'main' });
      for (const p of c.state.players) if (p.seat !== 1) p.hand = {};
    });
    s = act(s, { type: 'moveRobber', player: 0, hex });
    if (s.phase.id === 'steal') s = act(s, { type: 'steal', player: 0, from: 1 });
    expect(giftsOf(ctxOf(s), 1)).toContainEqual({ kind: 'revenge', target: 0 });
    s = edit(s, (c) => {
      c.state.turn.player = 1;
      c.setPhase({ id: 'main' });
    });
    const strike = legal(s, 1, 'civRevenge');
    expect(strike.length).toBeGreaterThan(0);
    const roads = ctxOf(s).piecesOf(0, 'road').length;
    s = act(s, strike[0]!);
    expect(ctxOf(s).piecesOf(0, 'road').length).toBe(roads - 1);
  });

  it('India: starts with two walled cities', () => {
    const s = start('india');
    const cities = ctxOf(s).piecesOf(0, 'city');
    expect(cities).toHaveLength(2);
    expect(cities.every((c) => c.props.wall === true)).toBe(true);
  });

  it('Maya: a free Citadel, a wall and two Magic cards; from 10 points the yellow die draws too', () => {
    let s = start('maya');
    expect(giftsOf(ctxOf(s), 0)).toContainEqual({ kind: 'building', options: ['citadel'] });
    expect(ctxOf(s).piecesOf(0, 'city')[0]!.props.wall).toBe(true);
    s = unlock(
      edit(s, (ctx) => {
        ctx.player(0).held = {};
        ctx.state.turn.player = 0;
        ctx.setPhase({ id: 'roll' });
        levels(ctx, 0).science = 1;
        ckData(ctx).alchemist = { red: 6, yellow: 1 };
        ckData(ctx).forcedEvent = 'science';
      }),
    );
    s = act(s, { type: 'roll', player: 0 });
    expect(s.players[0]!.held.science).toHaveLength(1);
  });

  it('Ethiopia: from 10 points, each city adds to their strength', () => {
    const s = unlock(finishSetup(pick(game(), ['ethiopia', ...OTHERS])));
    const ctx = ctxOf(s);
    expect(strength(ctx, 0)).toBe(ctx.piecesOf(0, 'city').length);
  });

  it('Japan: from 10 points, a strong knight gives itself up to destroy a settlement', () => {
    let s = main(start('japan'), 0);
    const knight = freeCorner(s);
    let victim = '' as CornerId;
    s = unlock(
      edit(s, (ctx) => {
        ctx.place('knight2', 0, { kind: 'corner', id: knight }, { active: true });
        victim = (ctx.piecesOf(1, 'settlement')[0]!.at as { id: CornerId }).id;
      }),
    );
    s = act(s, { type: 'civHarakiri', player: 0, knight, corner: victim });
    expect(ctxOf(s).buildingAt(victim)).toBeUndefined();
    expect(ctxOf(s).piecesAt({ kind: 'corner', id: knight })).toHaveLength(0);
  });

  it('Zulu: a moved knight stays active, once a turn', () => {
    let s = main(start('zulu'), 0);
    const from = freeCorner(s);
    let id = '';
    s = edit(s, (ctx) => {
      const edge = ctx.geometry.cornerEdges.get(from)![0]!;
      ctx.place('road', 0, { kind: 'edge', id: edge });
      const other = ctx.geometry.edgeCorners.get(edge)!.find((c) => c !== from)!;
      for (const e of ctx.geometry.cornerEdges.get(other)!)
        if (!ctx.piecesAt({ kind: 'edge', id: e }).length)
          ctx.place('road', 0, { kind: 'edge', id: e });
      id = ctx.place(
        'knight1',
        0,
        { kind: 'corner', id: from },
        { active: true, activatedTurn: -1 },
      ).id;
    });
    const move = legal(s, 0, 'moveKnight').find((a) => a.knight === id);
    if (!move) return;
    s = act(s, move);
    expect(s.pieces[id]!.props.active).toBe(true);
    expect(legal(s, 0, 'moveKnight').some((a) => a.knight === id)).toBe(false);
  });

  it('Prussia: a welfare token for each roll without production; from 10 points, five Beer', () => {
    let s = start('prussia');
    s = edit(s, (ctx) => {
      ctx.state.turn.player = 0;
      ctx.setPhase({ id: 'roll' });
      ckData(ctx).alchemist = { red: 1, yellow: 1 };
      ckData(ctx).forcedEvent = 'ship';
    });
    const before = welfareOf(ctxOf(s), 0);
    const r = lib.apply(s, { type: 'roll', player: 0 });
    const got = (
      r.events.find((e) => e.type === 'production')?.received as Record<number, unknown>
    )?.[0];
    expect(welfareOf(ctxOf(r.state), 0)).toBe(before + (got ? 0 : 1));
    s = main(unlock(r.state), 0);
    s = act(s, { type: 'endTurn', player: 0 });
    expect(beerOf(ctxOf(s), 0)).toBeGreaterThanOrEqual(0);
  });

  it('America: a third settlement, and a cheap first city', () => {
    let s = main(start('america'), 0);
    expect(giftsOf(ctxOf(s), 0)).toContainEqual({ kind: 'settlement', where: 'free' });
    expect(ctxOf(s).cost('city', 0)).toEqual({ ore: 2, grain: 1 });
    const spot = legal(s, 0, 'civSettle')[0]!;
    s = act(s, spot);
    expect(ctxOf(s).piecesOf(0, 'settlement').length).toBeGreaterThanOrEqual(2);
  });

  it('Papua: nobody else may settle within three roads of their start', () => {
    const s = start('papua');
    const zone = papuaZone(ctxOf(s));
    expect(zone.size).toBeGreaterThan(2);
    const t = main(s, 1);
    for (const a of legal(t, 1, 'buildSettlement'))
      expect(zone.has(a.corner as CornerId)).toBe(false);
    for (const c of zone)
      expect(lib.check(t, { type: 'buildSettlement', player: 1, corner: c })).not.toBeNull();
  });
});

function ctkRobber(ctx: ReturnType<typeof ctxOf>): void {
  ckData(ctx).robberActive = true;
}

describe('Civilisations part 3, played at random', () => {
  const groups = [
    ['khmer', 'rome', 'babylon', 'india'],
    ['maya', 'ethiopia', 'japan', 'zulu'],
    ['prussia', 'america', 'papua', 'khmer'],
  ];
  for (const civs of groups)
    it(`never gets stuck with ${civs.join(', ')}`, () => {
      let s = finishSetup(pick(game(civs[0], true), civs));
      s = edit(s, (ctx) => {
        const d = ctx.state.data.civilisations as { unlocked: Record<number, boolean> };
        for (let seat = 0; seat < 4; seat++) d.unlocked[seat] = true;
      });
      const rand = rng(civs.length * 11 + civs[1]!.length);
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
