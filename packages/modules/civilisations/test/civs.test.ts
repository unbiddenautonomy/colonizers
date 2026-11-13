import { describe, expect, it } from 'vitest';
import { type CornerId, type HexId } from '@colonizers/engine';
import { ckData, levels } from '@colonizers/module-cities-knights';
import { builtWonders } from '@colonizers/module-world-wonders';
import { act, ctxOf, edit, finishSetup, game, lib, main, pick } from './helpers.ts';
import { CIVS, civOf, giftsOf, picksOf, polarHexes, READY_CIVS, swapsOf } from '../src/index.ts';

const START = ['kongo', 'morocco', 'mali', 'judea'];

describe('Picking civilisations', () => {
  it('deals each player tiles of ready civilisations, hidden until all have picked', () => {
    const s = game();
    expect(s.phase.id).toBe('civPick');
    const d = s.data.civilisations as { dealt: Record<number, string[]> };
    const all = Object.values(d.dealt).flat();
    expect(all).toHaveLength(12);
    expect(new Set(all).size).toBe(12);
    for (const c of all) expect(READY_CIVS).toContain(c);
    // Nobody sees another player's tiles.
    const view = lib.view(s, 1).data.civilisations as { dealt: Record<number, string[]> };
    expect(Object.keys(view.dealt)).toEqual(['1']);
    let t = act(s, { type: 'pickCiv', player: 0, civ: d.dealt[0]![0]! });
    expect(civOf(ctxOf(t), 0)).toBeNull();
    for (const seat of [1, 2, 3])
      t = act(t, { type: 'pickCiv', player: seat, civ: d.dealt[seat]![1]! });
    expect(civOf(ctxOf(t), 0)?.id).toBe(d.dealt[0]![0]);
  });

  it('hands out start cards and pieces', () => {
    const s = pick(game(), START);
    expect(s.players[0]!.hand).toMatchObject({ grain: 2, wool: 1 });
    expect(s.players[2]!.hand).toMatchObject({ wool: 2, paper: 2 });
    expect(picksOf(ctxOf(s), 1)).toBe(2);
    expect(s.players[3]!.held.magic).toHaveLength(2);
    // Judea's Wizard goes on a hex of their choice before the placements.
    expect(s.phase.id).toBe('civNeutral');
    const t = act(
      s,
      lib.legalActions(s, 3).find((a) => a.type === 'civNeutral')!,
    );
    expect(ctxOf(t).piecesOfType('wizard')[0]?.owner).toBe(3);
    expect(t.phase.id).toBe('setup');
    expect(CIVS).toHaveLength(40);
  });

  it('gives a Warlord a strong knight, and Mali a road, once the placements are over', () => {
    let s = finishSetup(pick(game(), START));
    expect(giftsOf(ctxOf(s), 0)).toEqual([{ kind: 'knight' }]);
    expect(giftsOf(ctxOf(s), 2)).toEqual([{ kind: 'route' }]);
    s = main(s, 0);
    const k = lib.legalActions(s, 0).find((a) => a.type === 'civKnight')!;
    s = act(s, k);
    const knight = ctxOf(s).piecesAt({ kind: 'corner', id: k.corner as CornerId })[0]!;
    expect(knight.type).toBe('knight2');
    expect(knight.props.active).toBe(true);
  });
});

describe('Civilisation abilities', () => {
  it('Kongo: settlements cost the card you lack less', () => {
    const s = finishSetup(pick(game(), START));
    const ctx = ctxOf(edit(s, (c) => (c.player(0).hand = { brick: 1, lumber: 1, wool: 1 })));
    expect(ctx.cost('settlement', 0)).toEqual({ brick: 1, lumber: 1, wool: 1, grain: 0 });
    expect(ctxOf(s).cost('settlement', 1)).toEqual({ brick: 1, lumber: 1, wool: 1, grain: 1 });
  });

  it('Republic: a new settlement takes a resource from a hex beside it', () => {
    let s = main(finishSetup(pick(game(), START)), 1);
    s = edit(s, (ctx) => {
      ctx.player(1).hand = { brick: 1, lumber: 1, wool: 1, grain: 1 };
    });
    const build = lib.legalActions(s, 1).find((a) => a.type === 'buildSettlement');
    if (!build) return;
    s = act(s, build);
    const take = lib.legalActions(s, 1).filter((a) => a.type === 'civHarvest');
    expect(take.length).toBeGreaterThan(0);
    const before = Object.values(s.players[1]!.hand).reduce((a, b) => a + b, 0);
    s = act(s, take[0]!);
    expect(Object.values(s.players[1]!.hand).reduce((a, b) => a + b, 0)).toBe(before + 1);
  });

  it('Innovator: raising a track throws the red die for its card', () => {
    let s = main(finishSetup(pick(game(), ['kongo', 'morocco', 'mali', 'judea'])), 2);
    s = edit(s, (ctx) => {
      ctx.player(2).hand = { paper: 5 };
      levels(ctx, 2).science = 4;
    });
    const r = lib.apply(s, { type: 'improveCity', player: 2, track: 'science' });
    const e = r.events.find((x) => x.type === 'civInnovation')!;
    expect(e).toBeDefined();
    // Level 5 opens the gate to any red die.
    expect(e.lucky).toBe(true);
    expect(r.state.players[2]!.held.science?.length ?? 0).toBeGreaterThan(0);
  });

  it('Korea: each progress card drawn brings its resource, the second its commodity', () => {
    let s = finishSetup(pick(game(), ['korea', 'morocco', 'mali', 'judea']));
    s = edit(s, (ctx) => {
      ctx.state.turn.player = 0;
      ctx.setPhase({ id: 'roll' });
      levels(ctx, 0).science = 5;
      ckData(ctx).forcedEvent = 'science';
      ctx.player(0).hand = {};
    });
    s = act(s, { type: 'roll', player: 0 });
    expect(s.players[0]!.hand.lumber ?? 0).toBeGreaterThan(0);
  });

  it('Amazon: forest production can be swapped for any card', () => {
    let s = finishSetup(pick(game(), ['amazon', 'morocco', 'mali', 'judea']));
    let token = 0;
    s = edit(s, (ctx) => {
      const forest = ctx.geometry.hexes.find((h) => {
        const x = ctx.state.hexes[h]!;
        return x.type === 'forest' && x.token && x.token !== 7;
      })!;
      token = ctx.state.hexes[forest]!.token!;
      ctx.place('settlement', 0, { kind: 'corner', id: ctx.geometry.hexCorners.get(forest)![0]! });
      for (const p of ctx.piecesOfType('robber')) ctx.remove(p);
      ctx.state.turn.player = 0;
      ctx.setPhase({ id: 'roll' });
      const red = Math.min(6, token - 1);
      ckData(ctx).alchemist = { red, yellow: token - red };
    });
    s = act(s, { type: 'roll', player: 0 });
    expect(swapsOf(ctxOf(s), 0)).toContain('lumber');
    s = act(s, { type: 'civSwap', player: 0, give: 'lumber', get: 'coin' });
    expect(s.players[0]!.hand.coin).toBeGreaterThan(0);
    expect(swapsOf(ctxOf(s), 0)).toEqual([]);
  });

  it('Morocco: until the first 7, other cities take resources instead of commodities', () => {
    const s = finishSetup(pick(game(), START));
    const ctx = ctxOf(s);
    const forest = ctx.geometry.hexes.find((h) => ctx.state.hexes[h]!.type === 'forest')!;
    const hex = ctx.state.hexes[forest]!;
    const city = { id: 'x', type: 'city', owner: 0, at: { kind: 'corner', id: 'c:0,0,N' } };
    const own = { ...city, owner: 1 };
    const got = ctx.reduce('hexYield', hex, city as never, { lumber: 2 });
    expect(got).toEqual({ lumber: 2 });
    expect(ctx.reduce('hexYield', hex, own as never, { lumber: 2 })).toEqual({
      lumber: 1,
      paper: 1,
    });
  });

  it('unlocks the second ability at 10 points: Mali takes gold and a Wealth level', () => {
    let s = main(finishSetup(pick(game(), START)), 2);
    s = edit(s, (ctx) => {
      for (const c of ctx.geometry.corners.filter((x) => ctx.isLandCorner(x)).slice(0, 60))
        if (!ctx.piecesAt({ kind: 'corner', id: c }).length) {
          if (ctx.supplyLeft(2, 'city') > 0) ctx.place('city', 2, { kind: 'corner', id: c });
          else if (ctx.supplyLeft(2, 'settlement') > 0)
            ctx.place('settlement', 2, { kind: 'corner', id: c });
        }
    });
    s = act(s, { type: 'endTurn', player: 2 });
    const d = s.data.civilisations as { unlocked: Record<number, boolean> };
    expect(d.unlocked[2]).toBe(true);
    expect(s.players[2]!.hand.gold).toBe(2);
    expect(levels(ctxOf(s), 2).wealth).toBe(1);
  });

  it('calendar swap: once a game, a rival drops a level and you rise one', () => {
    let s = main(finishSetup(pick(game(), ['korea', 'morocco', 'mali', 'judea'])), 0);
    s = edit(s, (ctx) => {
      (ctx.state.data.civilisations as { unlocked: Record<number, boolean> }).unlocked[0] = true;
      levels(ctx, 1).science = 2;
    });
    s = act(s, { type: 'civCalendar', player: 0, target: 1 });
    expect(levels(ctxOf(s), 1).science).toBe(1);
    expect(levels(ctxOf(s), 0).science).toBe(1);
    expect(lib.check(s, { type: 'civCalendar', player: 0, target: 2 })).toBe('Once a game');
  });

  it("Inuit's Polar Circle finds the hexes by the northernmost sea", () => {
    const s = finishSetup(pick(game(), ['inuit', 'morocco', 'mali', 'judea']));
    const polar = polarHexes(ctxOf(s));
    expect(polar.size).toBeGreaterThan(0);
  });

  it('Monument: Egypt starts the Pyramids with one city by the desert, the first stage free', () => {
    let s = main(finishSetup(pick(game('civ', true), ['egypt', 'morocco', 'mali', 'judea'])), 0);
    let desert = '' as HexId;
    s = edit(s, (ctx) => {
      desert = ctx.geometry.hexes.find((h) => ctx.state.hexes[h]!.type === 'desert')!;
      const free = ctx.geometry.hexCorners
        .get(desert)!
        .find((c) => !ctx.piecesAt({ kind: 'corner', id: c }).length)!;
      ctx.place('city', 0, { kind: 'corner', id: free });
      for (const p of ctx.piecesOfType('robber')) ctx.remove(p);
      ctx.player(0).hand = {};
    });
    s = act(s, { type: 'buildWonder', player: 0, wonder: 'pyramids', hex: desert });
    expect(builtWonders(ctxOf(s)).pyramids).toMatchObject({ owner: 0, stages: 1 });
    expect(
      lib.check(s, { type: 'buildWonder', player: 1, wonder: 'pyramids', hex: desert }),
    ).not.toBeNull();
  });
});
