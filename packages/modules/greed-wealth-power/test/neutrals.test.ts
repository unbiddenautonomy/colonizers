import { describe, expect, it } from 'vitest';
import type { Action, CornerId, Ctx, GameState, HexId } from '@colonizers/engine';
import { produce } from '@colonizers/module-base';
import { hasAbility, knightStrength, levels } from '@colonizers/module-cities-knights';
import { greedWealthPowerModule, heroes, neutralHexes, neutralPiece } from '../src/index.ts';
import { act, ctxOf, edit, game, lib, main, placeCity } from './helpers.ts';

function hold(state: GameState, seat: number, deck: string, card: string): GameState {
  return edit(state, (ctx) => {
    (ctx.player(seat).held[deck] ??= []).push({ card, acquiredTurn: 0 });
  });
}

function play(state: GameState, seat: number, card: string, extra: Partial<Action> = {}) {
  return act(state, { type: 'playProgress', player: seat, card, ...extra });
}

/** Rolls `total` without the robber in the way, and runs the module's after-action step. */
function roll(state: GameState, total: number, keepRobber = false): GameState {
  return edit(state, (ctx) => {
    if (!keepRobber) for (const r of ctx.piecesOfType('robber')) ctx.remove(r);
    produce(ctx, total);
    greedWealthPowerModule.hooks?.afterAction?.(ctx, { type: 'roll', player: ctx.active });
  });
}

/** Two corners of one hex, not next to each other. */
function twoCorners(ctx: Ctx, hex: HexId): [CornerId, CornerId] {
  const cs = ctx.geometry.hexCorners.get(hex) ?? [];
  return [cs[0] as CornerId, cs[2] as CornerId];
}

const vp = (s: GameState, seat: number) => ctxOf(s).vp(seat);

describe('Neutral pieces', () => {
  it('adds each piece’s card to its deck', () => {
    const decks = game().decks;
    const count = (deck: string, card: string) =>
      (decks[deck] ?? []).filter((c) => c === card).length;
    expect(count('politics', 'duke')).toBe(4);
    expect(count('science', 'scholar')).toBe(4);
    expect(count('magic', 'wizard')).toBe(5);
    expect(count('religion', 'inquisitor')).toBe(5);
    expect(count('wealth', 'envoy')).toBe(5);
    // Cities & Knights' own cards stay.
    expect(decks.politics?.length).toBeGreaterThan(18);
  });

  it('Duke: +1 for your knights, -1 for others, a Hero of Catan for a level-4 knight', () => {
    let s = hold(main(), 0, 'politics', 'duke');
    const hex = Object.values(s.hexes).find((h) => h.type !== 'desert' && h.token)!.id;
    let mine = '';
    let theirs = '';
    s = edit(s, (ctx) => {
      const [a, b] = twoCorners(ctx, hex);
      for (const c of [a, b])
        for (const p of ctx.piecesAt({ kind: 'corner', id: c })) ctx.remove(p);
      mine = ctx.place('knight3', 0, { kind: 'corner', id: a }, { active: true }).id;
      theirs = ctx.place('knight1', 1, { kind: 'corner', id: b }, { active: true }).id;
    });
    const before = vp(s, 0);
    s = play(s, 0, 'duke');
    expect(s.phase.id).toBe('placeNeutral');
    s = act(s, { type: 'placeNeutral', player: 0, hex });
    expect(s.phase.id).toBe('main');
    const ctx = ctxOf(s);
    expect(knightStrength(ctx, s.pieces[mine]!)).toBe(4);
    expect(knightStrength(ctx, s.pieces[theirs]!)).toBe(0);
    expect(heroes(ctx)).toEqual([0]);
    expect(vp(s, 0)).toBe(before + 2);

    // Player 1 takes the Duke away: the hero card stays, the Duke's point goes.
    s = edit(s, (c) => c.setPhase({ id: 'main' }));
    s = edit(s, (c) => {
      c.state.turn.player = 1;
    });
    s = hold(s, 1, 'politics', 'duke');
    s = play(s, 1, 'duke');
    const elsewhere = neutralHexes(ctxOf(s), 1, 'duke').find((h) => h !== hex)!;
    s = act(s, { type: 'placeNeutral', player: 1, hex: elsewhere });
    expect(neutralPiece(ctxOf(s), 'duke')?.owner).toBe(1);
    expect(knightStrength(ctxOf(s), s.pieces[mine]!)).toBe(3);
    expect(vp(s, 0)).toBe(before + 1);
  });

  it('Scholar: one more card when its hex produces, beside your own city', () => {
    const placed = placeCity(main(), 0, 'ore');
    let s = hold(placed.state, 0, 'science', 'scholar');
    expect(neutralHexes(ctxOf(s), 0, 'scholar')).toContain(placed.hex);
    s = play(s, 0, 'scholar');
    s = act(s, { type: 'placeNeutral', player: 0, hex: placed.hex });
    const token = s.hexes[placed.hex]!.token as number;
    const before = { ...s.players[0]!.hand };
    s = roll(s, token);
    const hand = s.players[0]!.hand;
    // The city alone gives 1 ore and 1 coin; the Scholar adds a coin.
    expect((hand.coin ?? 0) - (before.coin ?? 0)).toBeGreaterThanOrEqual(2);
  });

  it('Envoy: a card from a hex beside another player’s city', () => {
    const placed = placeCity(main(), 1, 'grain');
    let s = hold(placed.state, 0, 'wealth', 'envoy');
    expect(neutralHexes(ctxOf(s), 0, 'envoy')).toContain(placed.hex);
    expect(neutralHexes(ctxOf(s), 1, 'envoy')).not.toContain(placed.hex);
    s = play(s, 0, 'envoy');
    s = act(s, { type: 'placeNeutral', player: 0, hex: placed.hex });
    const token = s.hexes[placed.hex]!.token as number;
    const before = s.players[0]!.hand.grain ?? 0;
    s = roll(s, token);
    expect((s.players[0]!.hand.grain ?? 0) - before).toBeGreaterThanOrEqual(1);
  });

  it('Wizard: the robber does not stop your production on its hex', () => {
    const placed = placeCity(main(), 0, 'lumber');
    let s = hold(placed.state, 0, 'magic', 'wizard');
    s = play(s, 0, 'wizard');
    s = act(s, { type: 'placeNeutral', player: 0, hex: placed.hex });
    s = edit(s, (ctx) => {
      const r = ctx.piecesOfType('robber')[0]!;
      ctx.move(r, { kind: 'hex', id: placed.hex });
    });
    const token = s.hexes[placed.hex]!.token as number;
    const before = s.players[0]!.hand.lumber ?? 0;
    s = roll(s, token, true);
    expect((s.players[0]!.hand.lumber ?? 0) - before).toBeGreaterThanOrEqual(1);
  });

  it('Inquisitor: the target loses level 3 abilities, and it chases the Scholar away', () => {
    const placed = placeCity(main(), 1, 'brick');
    let s = edit(placed.state, (ctx) => {
      const lv = levels(ctx, 1);
      lv.magic = 3;
    });
    expect(hasAbility(ctxOf(s), 1, 'magic')).toBe(true);
    // Player 1's Scholar sits on the hex first.
    s = edit(s, (ctx) => {
      ctx.place('scholar', 1, { kind: 'hex', id: placed.hex });
    });
    s = hold(s, 0, 'religion', 'inquisitor');
    expect(lib.check(s, { type: 'playProgress', player: 0, card: 'inquisitor' })).toMatch(
      /another player/,
    );
    s = play(s, 0, 'inquisitor', { target: 1 });
    s = act(s, { type: 'placeNeutral', player: 0, hex: placed.hex });
    const ctx = ctxOf(s);
    expect(hasAbility(ctx, 1, 'magic')).toBe(false);
    expect(neutralPiece(ctx, 'scholar')).toBeUndefined();
    expect(neutralPiece(ctx, 'inquisitor')?.props.target).toBe(1);
  });

  it('keeps the Inquisitor away from a city with a Citadel', () => {
    const placed = placeCity(main(), 1, 'brick');
    let s = edit(placed.state, (ctx) => {
      ctx.grant(1, { ore: 1, brick: 2 });
      ctx.state.turn.player = 1;
    });
    s = act(s, {
      type: 'buildGwp',
      player: 1,
      building: 'citadel',
      corner: placed.corner,
      hex: placed.hex,
    });
    expect(neutralHexes(ctxOf(s), 0, 'inquisitor', 1)).not.toContain(placed.hex);
  });
});
