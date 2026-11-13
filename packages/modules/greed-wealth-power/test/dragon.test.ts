import { describe, expect, it } from 'vitest';
import type { Action, CornerId, GameState, HexId } from '@colonizers/engine';
import { produce } from '@colonizers/module-base';
import { barbarianStrength, ckData, strength } from '@colonizers/module-cities-knights';
import { damselPiece, dragonData, dragonPiece } from '../src/dragon.ts';
import { greedWealthPowerModule } from '../src/index.ts';
import { act, ctxOf, edit, lib, main, placeCity } from './helpers.ts';

function hold(state: GameState, seat: number, deck: string, card: string): GameState {
  return edit(state, (ctx) => {
    (ctx.player(seat).held[deck] ??= []).push({ card, acquiredTurn: 0 });
  });
}

/** A knight of `type` for `seat` on a free corner of `hex`. */
function knightOn(state: GameState, seat: number, hex: HexId, type: string, n = 0) {
  let id = '';
  const next = edit(state, (ctx) => {
    const free = (ctx.geometry.hexCorners.get(hex) ?? []).filter(
      (c) => !ctx.piecesAt({ kind: 'corner', id: c }).length,
    );
    id = ctx.place(type, seat, { kind: 'corner', id: free[n] as CornerId }, { active: true }).id;
  });
  return { state: next, id };
}

const landHex = (s: GameState) =>
  Object.values(s.hexes).find((h) => h.type !== 'desert' && h.token !== undefined)!.id;

describe('The Damsel', () => {
  it('comes out on doubles, shelters cities and knights, and blocks building', () => {
    const placed = placeCity(main(), 0, 'grain');
    let s = edit(placed.state, (ctx) => {
      ctx.state.data.base = {
        ...(ctx.state.data.base as object),
        lastRoll: { dice: { red: 3, yellow: 3 }, total: 6 },
      };
      produce(ctx, 6);
      greedWealthPowerModule.hooks?.afterAction?.(ctx, { type: 'roll', player: 0 });
    });
    expect(s.phase.id).toBe('placeDamsel');
    const before = barbarianStrength(ctxOf(s));
    s = act(s, { type: 'placeDamsel', player: 0, hex: placed.hex });
    expect(s.phase.id).toBe('main');
    const ctx = ctxOf(s);
    expect(barbarianStrength(ctx)).toBe(before - 1);
    expect(ckData(ctx).sheltered).toContain(placed.corner);
    // No roads beside her.
    const edge = [...(ctx.geometry.cornerEdges.get(placed.corner) ?? [])].find((e) =>
      (ctx.geometry.edgeCorners.get(e) ?? []).every((c) =>
        (ctx.geometry.hexCorners.get(placed.hex) ?? []).includes(c),
      ),
    )!;
    s = edit(s, (c) => c.grant(0, { lumber: 1, brick: 1 }));
    expect(lib.check(s, { type: 'buildRoad', player: 0, edge })).toMatch(/Damsel/);
  });

  it('leaves after a barbarian attack', () => {
    const placed = placeCity(main(), 0, 'grain');
    let s = edit(placed.state, (ctx) => {
      const d = ctx.place('damsel', null, { kind: 'hex', id: placed.hex });
      d.props.attacks = 0;
      ckData(ctx).barbarian = 6;
      ctx.state.settings.ckEventFaces = ['ship'];
      ctx.setPhase({ id: 'roll' });
    });
    s = act(s, { type: 'roll', player: 0 });
    // Others may still pick a city to lose; she leaves once that's done.
    for (let i = 0; i < 10 && s.phase.id !== 'main'; i++) {
      const seat = lib.waitingOn(s)[0]!;
      s = act(s, lib.legalActions(s, seat)[0] as Action);
    }
    // Her city is safe.
    expect(ctxOf(s).buildingAt(placed.corner)?.type).toBe('city');
    expect(damselPiece(ctxOf(s))).toBeUndefined();
  });
});

describe('The dragon', () => {
  it('moves on a 7 instead of the robber, stops its hex, and switches off weak knights', () => {
    const placed = placeCity(main(), 0, 'ore');
    const k = knightOn(placed.state, 1, placed.hex, 'knight2');
    let s = edit(k.state, (ctx) => {
      ckData(ctx).robberActive = true;
      ctx.setPhase({ id: 'moveRobber', returnTo: 'main' });
    });
    expect(lib.legalActions(s, 0).some((a) => a.type === 'moveDragon')).toBe(true);
    s = act(s, { type: 'moveDragon', player: 0, hex: placed.hex });
    expect(s.phase.id).toBe('main');
    expect(s.pieces[k.id]!.props.active).toBe(false);
    const before = s.players[0]!.hand.ore ?? 0;
    s = edit(s, (ctx) => {
      for (const r of ctx.piecesOfType('robber')) ctx.remove(r);
      produce(ctx, s.hexes[placed.hex]!.token as number);
    });
    expect(s.players[0]!.hand.ore ?? 0).toBe(before);
  });

  it('a strong knight chases it off; a mighty knight slays it for 2 points', () => {
    const hex = landHex(main());
    let a = knightOn(main(), 0, hex, 'knight2');
    let s = edit(a.state, (ctx) => {
      ctx.place('gwpDragon', null, { kind: 'hex', id: hex });
      ctx.state.turn.number += 1;
    });
    s = act(s, { type: 'chaseDragon', player: 0, knight: a.id });
    expect(dragonPiece(ctxOf(s))).toBeUndefined();
    expect(dragonData(ctxOf(s)).slayer ?? null).toBeNull();

    a = knightOn(main(), 0, hex, 'knight3');
    s = edit(a.state, (ctx) => {
      ctx.place('gwpDragon', null, { kind: 'hex', id: hex });
      ctx.state.turn.number += 1;
    });
    const vp = ctxOf(s).vp(0);
    s = act(s, { type: 'chaseDragon', player: 0, knight: a.id });
    expect(dragonData(ctxOf(s)).slayer).toBe(0);
    expect(ctxOf(s).vp(0)).toBe(vp + 2);
    // Slain for good: no more moving it.
    s = edit(s, (ctx) => ctx.setPhase({ id: 'moveRobber', returnTo: 'main' }));
    expect(lib.legalActions(s, 0).some((x) => x.type === 'moveDragon')).toBe(false);
  });

  it('Dragon Lair takes an ore hex’s number until a mighty knight drives it out', () => {
    let s = hold(main(), 0, 'magic', 'dragonLair');
    const ore = Object.values(s.hexes).find((h) => h.type === 'mountains' && h.token)!;
    const token = ore.token;
    s = act(s, { type: 'playProgress', player: 0, card: 'dragonLair', option: ore.id });
    expect(s.hexes[ore.id]!.token).toBeUndefined();
    const strong = knightOn(s, 0, ore.id, 'knight2');
    s = edit(strong.state, (ctx) => {
      ctx.state.turn.number += 1;
    });
    expect(lib.check(s, { type: 'chaseDragon', player: 0, knight: strong.id })).toMatch(/lair/);
    const mighty = knightOn(s, 0, ore.id, 'knight3', 1);
    s = edit(mighty.state, (ctx) => {
      ctx.state.turn.number += 1;
    });
    s = act(s, { type: 'chaseDragon', player: 0, knight: mighty.id });
    expect(s.hexes[ore.id]!.token).toBe(token);
  });
});

describe('Alliance and Lent', () => {
  it('Alliance lends another player’s knight for the next attack', () => {
    const hex = landHex(main());
    const k = knightOn(hold(main(), 0, 'politics', 'alliance'), 1, hex, 'knight2');
    let s = k.state;
    expect(strength(ctxOf(s), 0)).toBe(0);
    s = act(s, { type: 'playProgress', player: 0, card: 'alliance', knight: k.id });
    expect(strength(ctxOf(s), 0)).toBe(2);
    expect(strength(ctxOf(s), 1)).toBe(0);
  });

  it('Lent stops the target building on their next turn until they pay', () => {
    let s = hold(main(), 0, 'religion', 'lent');
    s = act(s, { type: 'playProgress', player: 0, card: 'lent', target: 1 });
    s = act(s, { type: 'endTurn', player: 0 });
    s = edit(s, (ctx) => {
      ctx.setPhase({ id: 'main' });
      ctx.grant(1, { lumber: 1, brick: 1, wool: 1, grain: 1 });
    });
    const road = lib.legalActions(s, 1).find((a) => a.type === 'buildRoad');
    expect(road).toBeUndefined();
    s = act(s, { type: 'payLent', player: 1 } as Action);
    expect(lib.legalActions(s, 1).some((a) => a.type === 'buildRoad')).toBe(true);
  });
});
