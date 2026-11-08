import { describe, expect, it } from 'vitest';
import { applyEvents, initialRoomState, reduce, type RollEvent } from './roomClient.ts';

const ev = (seq: number): RollEvent => ({ seq, name: 'A', dice: [1, 2], total: 3, at: seq });

describe('room client state', () => {
  it('takes the snapshot on first welcome', () => {
    const { state } = reduce(initialRoomState, {
      type: 'welcome',
      roomId: 'r',
      seq: 2,
      history: [ev(1), ev(2)],
      online: 3,
    });
    expect(state.seq).toBe(2);
    expect(state.events).toHaveLength(2);
    expect(state.status).toBe('open');
    expect(state.online).toBe(3);
  });

  it('ignores duplicate events', () => {
    const s1 = applyEvents(initialRoomState, [ev(1), ev(2)]).state;
    const s2 = applyEvents(s1, [ev(2)]).state;
    expect(s2.events).toHaveLength(2);
  });

  it('reports a gap when events are missing', () => {
    const s1 = applyEvents(initialRoomState, [ev(1)]).state;
    const { state, gap } = applyEvents(s1, [ev(3)]);
    expect(gap).toBe(true);
    expect(state.seq).toBe(1);
  });

  it('catches up after a reconnect', () => {
    const s1 = applyEvents(initialRoomState, [ev(1)]).state;
    const { state, gap } = reduce(s1, {
      type: 'welcome',
      roomId: 'r',
      seq: 3,
      history: [ev(1), ev(2), ev(3)],
      online: 1,
    });
    expect(gap).toBe(false);
    expect(state.seq).toBe(3);
  });
});
