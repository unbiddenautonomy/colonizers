import { describe, expect, it } from 'vitest';
import type { GameState } from '@colonizers/engine';
import { produce } from '@colonizers/module-base';
import { festivals } from '../src/festival.ts';
import { addBeer, greedWealthPowerModule } from '../src/index.ts';
import { act, ctxOf, edit, lib, main, placeCity } from './helpers.ts';

const withBeer = (s: GameState, seat: number, n: number) => edit(s, (ctx) => addBeer(ctx, seat, n));

/** Rolls `total` (robber off) as `seat`'s turn, running the module's after-action step. */
function rollFor(s: GameState, seat: number, total: number): GameState {
  return edit(s, (ctx) => {
    ctx.state.turn.player = seat;
    ctx.state.turn.number += 1;
    for (const r of ctx.piecesOfType('robber')) ctx.remove(r);
    produce(ctx, total);
    greedWealthPowerModule.hooks?.afterAction?.(ctx, { type: 'roll', player: seat });
  });
}

describe('Beer festivals', () => {
  it('costs Beer, one at a time, and stops the target building roads', () => {
    let s = main();
    expect(lib.check(s, { type: 'startFestival', player: 0, kind: 'roads', target: 1 })).toMatch(
      /2 Beer/,
    );
    s = withBeer(s, 0, 5);
    s = act(s, { type: 'startFestival', player: 0, kind: 'roads', target: 1 });
    expect(ctxOf(s).state.data['greed-wealth-power']?.beer).toMatchObject({ 0: 3 });
    expect(lib.check(s, { type: 'startFestival', player: 0, kind: 'cities', target: 2 })).toMatch(
      /already/,
    );
    s = edit(s, (ctx) => {
      ctx.state.turn.player = 1;
      ctx.grant(1, { lumber: 2, brick: 2 });
    });
    expect(lib.legalActions(s, 1).some((a) => a.type === 'buildRoad')).toBe(false);
  });

  it('a settlement festival stops the target’s settlements producing, until the starter rolls again', () => {
    const placed = placeCity(main(), 1, 'grain');
    let s = edit(placed.state, (ctx) => {
      const b = ctx.buildingAt(placed.corner)!;
      ctx.upgrade(b, 'settlement');
      addBeer(ctx, 0, 4);
    });
    s = act(s, { type: 'startFestival', player: 0, kind: 'settlements', target: 1 });
    const token = s.hexes[placed.hex]!.token as number;
    let before = s.players[1]!.hand.grain ?? 0;
    s = rollFor(s, 1, token);
    expect(s.players[1]!.hand.grain ?? 0).toBe(before);
    // Player 0's next roll works out, then the festival is over.
    s = rollFor(s, 0, 2);
    expect(festivals(ctxOf(s))).toHaveLength(0);
    before = s.players[1]!.hand.grain ?? 0;
    s = rollFor(s, 1, token);
    expect(s.players[1]!.hand.grain ?? 0).toBeGreaterThan(before);
  });

  it('Raven Flight can stop a festival', () => {
    let s = withBeer(main(), 0, 5);
    s = act(s, { type: 'startFestival', player: 0, kind: 'cities', target: 1 });
    s = edit(s, (ctx) => {
      ctx.state.turn.player = 1;
      (ctx.player(1).held.magic ??= []).push({ card: 'ravenFlight', acquiredTurn: 0 });
    });
    s = act(s, { type: 'playProgress', player: 1, card: 'ravenFlight', option: 'festival' });
    expect(festivals(ctxOf(s))).toHaveLength(0);
  });
});
