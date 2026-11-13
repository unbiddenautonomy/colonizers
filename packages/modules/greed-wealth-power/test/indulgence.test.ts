import { describe, expect, it } from 'vitest';
import type { CornerId, EdgeId, GameState } from '@colonizers/engine';
import { distanceRuleOk } from '@colonizers/module-base';
import { act, ctxOf, edit, lib, main } from './helpers.ts';

function hold(state: GameState, seat: number, deck: string, card: string): GameState {
  return edit(state, (ctx) => {
    (ctx.player(seat).held[deck] ??= []).push({ card, acquiredTurn: 0 });
  });
}

const rollPhase = (s: GameState) => edit(s, (ctx) => ctx.setPhase({ id: 'roll' }));

const lastRoll = (s: GameState) =>
  (s.data.base as { lastRoll?: { dice: Record<string, number | string> } }).lastRoll?.dice;

describe('Indulgence', () => {
  it('holds the roll for whoever holds one, and the roll stands if they pass', () => {
    let s = rollPhase(hold(main(), 2, 'religion', 'indulgence'));
    s = act(s, { type: 'roll', player: 0 });
    expect(s.phase.id).toBe('indulgence');
    expect(lib.waitingOn(s)).toEqual([2]);
    // Nothing else can happen while the roll waits.
    expect(lib.legalActions(s, 0)).toEqual([]);
    const held = s.phase.roll as { red: number; yellow: number; event: string };
    s = act(s, { type: 'passIndulgence', player: 2 });
    expect(s.phase.id).not.toBe('indulgence');
    expect(lastRoll(s)).toMatchObject({ red: held.red, yellow: held.yellow, event: held.event });
    // The card is still in hand for another roll.
    expect(s.players[2]!.held.religion?.some((c) => c.card === 'indulgence')).toBe(true);
  });

  it('re-rolls only the dice picked, and the second throw is final', () => {
    let s = rollPhase(hold(main(), 1, 'religion', 'indulgence'));
    s = act(s, { type: 'roll', player: 0 });
    const held = s.phase.roll as { red: number; yellow: number; event: string };
    const options = lib.legalActions(s, 1).filter((a) => a.type === 'playProgress');
    expect(options).toHaveLength(7);
    s = act(s, { type: 'playProgress', player: 1, card: 'indulgence', option: 'red+yellow' });
    expect(s.phase.id).not.toBe('indulgence');
    expect(lastRoll(s)?.event).toBe(held.event);
    expect(s.players[1]!.held.religion?.some((c) => c.card === 'indulgence')).toBe(false);
  });

  it('lets the roll straight through when nobody holds one', () => {
    let s = rollPhase(main());
    s = act(s, { type: 'roll', player: 0 });
    expect(s.phase.id).not.toBe('indulgence');
  });
});

describe('Land Deed', () => {
  /** An empty spot that keeps the distance rule, with a road of seat 0 leading to it. */
  function withSpot(state: GameState): { state: GameState; corner: CornerId; edge: EdgeId } {
    let corner = '' as CornerId;
    let edge = '' as EdgeId;
    const next = edit(state, (ctx) => {
      for (const c of ctx.geometry.corners) {
        if (!ctx.isLandCorner(c) || ctx.piecesAt({ kind: 'corner', id: c }).length) continue;
        if (!distanceRuleOk(ctx, c)) continue;
        const e = (ctx.geometry.cornerEdges.get(c) ?? []).find(
          (x) => !ctx.piecesAt({ kind: 'edge', id: x }).length,
        );
        if (!e) continue;
        ctx.place('road', 0, { kind: 'edge', id: e });
        corner = c;
        edge = e;
        return;
      }
    });
    return { state: next, corner, edge };
  }

  it('reserves a spot, adds to the hand limit, and comes back with the next settlement', () => {
    const spot = withSpot(hold(main(), 0, 'wealth', 'landDeed'));
    let s = spot.state;
    const limit = (st: GameState, seat: number) => ctxOf(st).reduce('handLimit', seat, 7);
    expect(limit(s, 0)).toBe(7);
    s = act(s, { type: 'playProgress', player: 0, card: 'landDeed', option: spot.corner });
    expect(limit(s, 0)).toBe(9);
    // Player 1 can't settle there, even with a road to it.
    const ctx = ctxOf(s);
    const other = (ctx.geometry.cornerEdges.get(spot.corner) ?? []).find(
      (e) => e !== spot.edge && !ctx.piecesAt({ kind: 'edge', id: e }).length,
    )!;
    s = edit(s, (c) => {
      c.place('road', 1, { kind: 'edge', id: other });
      c.state.turn.player = 1;
      c.grant(1, { lumber: 1, brick: 1, wool: 1, grain: 1 });
    });
    expect(lib.check(s, { type: 'buildSettlement', player: 1, corner: spot.corner })).toMatch(
      /Land Deed/,
    );
    // Its owner settles there, and the deed's wall comes back.
    s = edit(s, (c) => {
      c.state.turn.player = 0;
      c.grant(0, { lumber: 1, brick: 1, wool: 1, grain: 1 });
    });
    s = act(s, { type: 'buildSettlement', player: 0, corner: spot.corner });
    expect(limit(s, 0)).toBe(7);
  });
});
