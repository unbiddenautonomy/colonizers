import { describe, expect, it } from 'vitest';
import { wrapTab } from './focusTrap.ts';

describe('Tab inside a dialog', () => {
  it('moves on, and comes back round at the end', () => {
    expect(wrapTab(3, 0, false)).toBe(1);
    expect(wrapTab(3, 1, false)).toBe(2);
    expect(wrapTab(3, 2, false)).toBe(0);
  });

  it('moves back, and round the other way at the start', () => {
    expect(wrapTab(3, 2, true)).toBe(1);
    expect(wrapTab(3, 0, true)).toBe(2);
  });

  it('starts at the first thing when the focus is somewhere else', () => {
    expect(wrapTab(3, -1, false)).toBe(0);
    expect(wrapTab(3, -1, true)).toBe(2);
  });

  it('has nowhere to go in an empty dialog', () => {
    expect(wrapTab(0, -1, false)).toBe(-1);
  });
});
