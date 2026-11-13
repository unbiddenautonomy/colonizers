import { describe, expect, it } from 'vitest';
import type { GameState, HexId } from '@colonizers/engine';
import { bayHexes, picksOf, rerollChoices } from '../src/index.ts';
import { act, blank, ctxOf, edit, game, lastRoll, lib, own, rollAs } from './helpers.ts';

const rollPhase = (s: GameState) => edit(s, (ctx) => ctx.setPhase({ id: 'roll' }));
describe('Wonders and the dice', () => {
  it('Colosseum III holds the roll: throw again once a turn, or keep it', () => {
    let s = rollPhase(own(blank(), { colosseum: { stages: 3 } }));
    s = act(s, { type: 'roll', player: 0 });
    expect(s.phase.id).toBe('wonderRoll');
    const held = s.phase.held as { a: number; b: number };
    expect(lastRoll(s).total).toBe(held.a + held.b);
    const kept = act(s, { type: 'keepRoll', player: 0 });
    expect(kept.phase.id).not.toBe('wonderRoll');
    expect(lastRoll(kept).dice).toMatchObject({ white1: held.a, white2: held.b });
    s = act(s, { type: 'wonderReroll', player: 0, use: 'titus' });
    expect(s.phase.id).not.toBe('wonderRoll');
    // Once a turn: a second roll this turn goes straight through.
    s = act(rollPhase(s), { type: 'roll', player: 0 });
    expect(s.phase.id).not.toBe('wonderRoll');
  });

  it('Machu Picchu III offers a throw again only on doubles', () => {
    const s = own(blank(), { machuPicchu: { stages: 3 } });
    const ctx = ctxOf(s);
    expect(rerollChoices(ctx, 0, { a: 3, b: 4 })).toEqual([]);
    expect(rerollChoices(ctx, 0, { a: 3, b: 3 })).toEqual(['machu:a', 'machu:b', 'machu:both']);
    // Rolling for real: the roll is held exactly when it comes up doubles.
    for (let i = 0; i < 40; i++) {
      const t = act(rollPhase(own(blank(`m${i}`), { machuPicchu: { stages: 3 } })), {
        type: 'roll',
        player: 0,
      });
      const d = lastRoll(t).dice;
      expect(t.phase.id === 'wonderRoll').toBe(d.white1 === d.white2);
    }
  });

  it('holds the red and yellow dice with Cities & Knights', () => {
    let s = rollPhase(own(blank('wwck', {}, true), { colosseum: { stages: 3 } }));
    s = act(s, { type: 'roll', player: 0 });
    expect(s.phase.id).toBe('wonderRoll');
    const held = s.phase.held as { a: number; b: number };
    s = act(s, { type: 'keepRoll', player: 0 });
    expect(lastRoll(s).dice).toMatchObject({ red: held.a, yellow: held.b });
    expect(typeof lastRoll(s).dice.event).toBe('string');
  });

  it('Chichen Itza I gives a resource of your choice on 1 and 2', () => {
    let s = own(blank(), { chichenItza: { owner: 1, stages: 1 } });
    s = rollAs(s, 0, 1, 2);
    expect(picksOf(ctxOf(s), 1)).toBe(1);
    expect(lib.legalActions(s, 1).filter((a) => a.type === 'wonderPick')).toHaveLength(5);
    s = act(s, { type: 'wonderPick', player: 1, card: 'ore' });
    expect(s.players[1]!.hand.ore).toBe(1);
    expect(picksOf(ctxOf(s), 1)).toBe(0);
    s = rollAs(rollPhase(s), 0, 2, 4);
    expect(picksOf(ctxOf(s), 1)).toBe(0);
  });
});

describe('Wonders on a 7', () => {
  it('Pyramids II: each desert beside you gives a pick', () => {
    let s = own(blank(), { pyramids: { stages: 2 } });
    s = edit(s, (ctx) => {
      const desert = Object.values(ctx.state.hexes).find((h) => h.type === 'desert')!;
      ctx.place('settlement', 0, {
        kind: 'corner',
        id: ctx.geometry.hexCorners.get(desert.id)![0]!,
      });
    });
    s = rollAs(s, 0, 3, 4);
    expect(picksOf(ctxOf(s), 0)).toBe(1);
  });

  it('Cristo Redentor III: the bay produces for its owner', () => {
    let hex = '' as HexId;
    let card = '';
    let s = edit(blank(), (ctx) => {
      const isSea = (h: HexId) =>
        ctx.registry.hexTypes[ctx.state.hexes[h]!.type]?.terrain === 'sea';
      const h = Object.values(ctx.state.hexes).find(
        (x) =>
          x.token &&
          x.token !== 7 &&
          ctx.registry.hexTypes[x.type]?.produces &&
          (ctx.geometry.hexNeighbours.get(x.id) ?? []).some(isSea),
      )!;
      hex = h.id;
      card = ctx.registry.hexTypes[h.type]!.produces!;
      for (const r of ctx.piecesOfType('robber')) ctx.remove(r);
      const corner = ctx.geometry.hexCorners
        .get(h.id)!
        .find((c) => ctx.geometry.cornerHexes.get(c)!.some(isSea))!;
      ctx.place('city', 0, { kind: 'corner', id: corner });
    });
    s = own(s, { cristo: { hex, stages: 3 } });
    expect(bayHexes(ctxOf(s), 0, hex)[0]).toBe(hex);
    const before = s.players[0]!.hand[card] ?? 0;
    s = rollAs(s, 0, 3, 4);
    expect((s.players[0]!.hand[card] ?? 0) - before).toBeGreaterThanOrEqual(2);
  });

  it('Mausoleum I halves the discard; Mausoleum III moves the robber on a 6 or 8', () => {
    let s = own(blank(), { mausoleum: { stages: 3 } });
    s = edit(s, (ctx) => {
      ctx.grant(0, { brick: 5, ore: 5 });
      ctx.grant(1, { brick: 5, ore: 5 });
    });
    const sevened = rollAs(s, 0, 3, 4);
    expect(sevened.phase.id).toBe('discard');
    expect(sevened.phase.owed).toEqual({ 0: 2, 1: 5 });

    let t = rollAs(s, 0, 4, 4);
    expect(t.phase.id).toBe('main');
    expect(lib.check(t, { type: 'wonderSiege', player: 0 })).toBeNull();
    t = act(t, { type: 'wonderSiege', player: 0 });
    expect(t.phase.id).toBe('moveRobber');
    const u = rollAs(s, 0, 2, 3);
    expect(lib.check(u, { type: 'wonderSiege', player: 0 })).toMatch(/6 or 8/);
  });

  it('Hanging Gardens III draws a card when you move the robber', () => {
    let s = own(blank(), { hangingGardens: { stages: 3 } });
    s = edit(s, (ctx) => ctx.setPhase({ id: 'moveRobber', returnTo: 'main' }));
    const hex = lib.legalActions(s, 0).find((a) => a.type === 'moveRobber')!.hex;
    s = act(s, { type: 'moveRobber', player: 0, hex });
    expect(s.players[0]!.held.dev).toHaveLength(1);
  });

  it('Temple of Artemis I sweeps the merchant off after a 7', () => {
    let s = own(blank('wwck', {}, true), { artemis: { stages: 1 } });
    s = edit(s, (ctx) => {
      const h = Object.values(ctx.state.hexes).find((x) => x.token)!;
      ctx.place('merchant', 1, { kind: 'hex', id: h.id });
      (ctx.state.data['cities-knights'] as { robberActive: boolean }).robberActive = true;
    });
    const before = ctxOf(s).vp(1);
    s = rollAs(s, 0, 3, 4);
    // Work the 7 through to the main phase.
    for (let i = 0; i < 20 && s.phase.id !== 'main'; i++) {
      const seat = lib.waitingOn(s)[0]!;
      s = act(s, lib.legalActions(s, seat)[0]!);
    }
    expect(lib.check(s, { type: 'wonderSweep', player: 0 })).toBeNull();
    s = act(s, { type: 'wonderSweep', player: 0 });
    expect(ctxOf(s).piecesOfType('merchant')).toHaveLength(0);
    expect(ctxOf(s).vp(1)).toBe(before - 1);
    expect(game().modules).not.toContain('cities-knights');
  });
});
