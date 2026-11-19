import { describe, expect, it } from 'vitest';
import { heldMoveNow, moveToHold } from './heldMove.ts';

const roll = { type: 'act' as const, action: { type: 'roll', player: 0 } };

describe('a move made while offline', () => {
  it('is held, with the move count it was made at', () => {
    expect(moveToHold(roll, 7)).toEqual({ msg: roll, seq: 7 });
  });

  it('is not held before the game has started', () => {
    expect(moveToHold(roll, undefined)).toBeNull();
  });

  it('leaves anything but a move to the player', () => {
    expect(moveToHold({ type: 'chat', text: 'hi' }, 7)).toBeNull();
    expect(moveToHold({ type: 'start' }, 7)).toBeNull();
  });

  it('waits until a fresh snapshot is in', () => {
    expect(heldMoveNow({ msg: roll, seq: 7 }, undefined)).toBe('wait');
    expect(heldMoveNow(null, 7)).toBe('wait');
  });

  it('is sent when the game is where it was left', () => {
    expect(heldMoveNow({ msg: roll, seq: 7 }, 7)).toBe('send');
  });

  it('is dropped once the game has moved on without it', () => {
    expect(heldMoveNow({ msg: roll, seq: 7 }, 8)).toBe('drop');
  });
});
