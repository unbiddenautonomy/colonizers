import { describe, expect, it } from 'vitest';
import { nearestSpot, type Spot } from './nearest.ts';

const spots: Spot<string>[] = [
  { x: 0, y: 0, what: 'corner-a' },
  { x: 30, y: 0, what: 'road' },
  { x: 60, y: 0, what: 'corner-b' },
];

describe('a tap that lands on nothing', () => {
  it('takes the spot it was nearest', () => {
    expect(nearestSpot({ x: 4, y: 3 }, spots, 40)).toBe('corner-a');
    expect(nearestSpot({ x: 26, y: 8 }, spots, 40)).toBe('road');
    expect(nearestSpot({ x: 54, y: 0 }, spots, 40)).toBe('corner-b');
  });

  it('takes nothing when the nearest spot is too far to have been meant', () => {
    expect(nearestSpot({ x: 0, y: 200 }, spots, 40)).toBeNull();
    expect(nearestSpot({ x: 30, y: 41 }, spots, 40)).toBeNull();
    expect(nearestSpot({ x: 30, y: 39 }, spots, 40)).toBe('road');
  });

  it('takes nothing when there is nothing to build', () => {
    expect(nearestSpot({ x: 0, y: 0 }, [], 40)).toBeNull();
  });

  it('keeps the first of two spots the same distance away', () => {
    expect(nearestSpot({ x: 15, y: 0 }, spots, 40)).toBe('corner-a');
  });
});
