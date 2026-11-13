import { describe, expect, it } from 'vitest';
import type { Ctx, CornerId, GameState, HexId } from '@colonizers/engine';
import { produce } from '@colonizers/module-base';
import { isRiver, isSwampland, riverHexes } from '../src/index.ts';
import { act, ctxOf, edit, finishSetup, game, lib, main } from './helpers.ts';

const riverMain = (seed = 'gwp') =>
  edit(finishSetup(game(seed, { gwpRiver: true })), (ctx) => ctx.setPhase({ id: 'main' }));

/** A free corner of `hex` with no building next door. */
function cornerOn(ctx: Ctx, hex: HexId): CornerId {
  for (const corner of ctx.geometry.hexCorners.get(hex) ?? []) {
    if (ctx.piecesAt({ kind: 'corner', id: corner }).length) continue;
    const near = ctx.geometry.cornerNeighbours.get(corner) ?? [];
    if (near.some((c) => ctx.buildingAt(c))) continue;
    return corner;
  }
  throw new Error(`No free corner on ${hex}`);
}

function riverOf(s: GameState, type: string): HexId {
  return Object.values(s.hexes).find((h) => h.type === type && isRiver(h))!.id;
}

/** A city for seat 0 on a river hex of `type`, with nothing else on the board producing. */
function cityOnRiver(s: GameState, type: string) {
  const hex = riverOf(s, type);
  let corner = '' as CornerId;
  const state = edit(s, (ctx) => {
    corner = cornerOn(ctx, hex);
    ctx.place('city', 0, { kind: 'corner', id: corner });
    for (const r of ctx.piecesOfType('robber')) ctx.remove(r);
  });
  return { state, hex, corner };
}

function rollHex(s: GameState, hex: HexId): GameState {
  return edit(s, (ctx) => produce(ctx, s.hexes[hex]!.token as number));
}

describe('The river', () => {
  it('turns the desert into the swampland and one ore, brick and wool hex into river', () => {
    const s = game('gwp', { gwpRiver: true });
    const ctx = ctxOf(s);
    const swamp = Object.values(s.hexes).filter(isSwampland);
    expect(swamp).toHaveLength(1);
    expect(swamp[0]!.type).toBe('desert');
    expect(ctx.piecesOfType('robber')[0]?.at).toEqual({ kind: 'hex', id: swamp[0]!.id });
    const river = Object.values(s.hexes).filter(isRiver);
    expect(river.map((h) => h.type).sort()).toEqual(['hills', 'mountains', 'pasture']);
    expect(river.every((h) => h.token !== undefined)).toBe(true);
    expect(riverHexes(ctx)).toHaveLength(4);
    // The river hangs together where the board allows it.
    const path = riverHexes(ctx);
    const joined = path
      .slice(1)
      .filter((h, i) => (ctx.geometry.hexNeighbours.get(path[i]!) ?? []).includes(h)).length;
    expect(joined).toBeGreaterThanOrEqual(2);
  });

  it('is off unless switched on', () => {
    const s = game('gwp');
    expect(Object.values(s.hexes).some((h) => isRiver(h) || isSwampland(h))).toBe(false);
  });

  it('takes a Monument, after which river cities make Gold instead of their commodity', () => {
    const { state, hex, corner } = cityOnRiver(riverMain(), 'mountains');
    // Before the Monument: ore and coin, as usual.
    let s = rollHex(state, hex);
    expect(s.players[0]!.hand).toMatchObject({ ore: 1, coin: 1 });
    expect(s.players[0]!.hand.gold ?? 0).toBe(0);
    s = edit(s, (ctx) => ctx.grant(0, { ore: 1, brick: 1 }));
    s = act(s, { type: 'buildGwp', player: 0, building: 'monument', corner, hex });
    const before = { ...s.players[0]!.hand };
    s = rollHex(s, hex);
    const hand = s.players[0]!.hand;
    expect((hand.ore ?? 0) - (before.ore ?? 0)).toBe(1);
    expect((hand.gold ?? 0) - (before.gold ?? 0)).toBe(1);
    expect((hand.coin ?? 0) - (before.coin ?? 0)).toBe(0);
  });

  it('a city on the brick river makes brick and Gold once there is a Monument', () => {
    const wool = cityOnRiver(riverMain(), 'pasture');
    let s = edit(wool.state, (ctx) => ctx.grant(0, { ore: 1, brick: 1 }));
    s = act(s, {
      type: 'buildGwp',
      player: 0,
      building: 'monument',
      corner: wool.corner,
      hex: wool.hex,
    });
    const brick = cityOnRiver(s, 'hills');
    const before = { ...brick.state.players[0]!.hand };
    s = rollHex(brick.state, brick.hex);
    const hand = s.players[0]!.hand;
    expect((hand.brick ?? 0) - (before.brick ?? 0)).toBe(1);
    expect((hand.gold ?? 0) - (before.gold ?? 0)).toBeGreaterThanOrEqual(1);
  });

  it('the swampland and ordinary hexes do not take a Monument', () => {
    const s = riverMain();
    const ctx = ctxOf(s);
    const swamp = Object.values(s.hexes).find(isSwampland)!;
    const corner = cornerOn(ctx, swamp.id);
    const t = edit(s, (c) => {
      c.place('city', 0, { kind: 'corner', id: corner });
      c.grant(0, { ore: 1, brick: 1 });
    });
    expect(
      lib.check(t, { type: 'buildGwp', player: 0, building: 'monument', corner, hex: swamp.id }),
    ).toMatch(/gold field or a river hex/);
    // Without the river there is nowhere for a Monument on a land board.
    const plain = main();
    expect(
      lib
        .legalActions(
          edit(plain, (c) => c.grant(0, { ore: 5, brick: 5 })),
          0,
        )
        .some((a) => a.type === 'buildGwp' && a.building === 'monument'),
    ).toBe(false);
  });
});
