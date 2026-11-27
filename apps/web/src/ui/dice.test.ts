import { describe, expect, it } from 'vitest';
import { DEFAULT_CUSTOM_DICE, parseCustomDice, throwFrames } from './Dice.tsx';

describe('your own dice', () => {
  it('reads a design back, from text or an object', () => {
    const d = { ...DEFAULT_CUSTOM_DICE, body: '#AABBCC', style: 'symbols' as const };
    expect(parseCustomDice(JSON.stringify(d))).toEqual({ ...d, body: '#aabbcc' });
    expect(parseCustomDice(d)?.faces).toEqual(DEFAULT_CUSTOM_DICE.faces);
  });

  it('turns down designs that would break the dice', () => {
    const ok = DEFAULT_CUSTOM_DICE;
    expect(parseCustomDice(null)).toBeNull();
    expect(parseCustomDice('not json')).toBeNull();
    expect(parseCustomDice({ ...ok, body: 'red' })).toBeNull();
    expect(parseCustomDice({ ...ok, ink: '#12345' })).toBeNull();
    expect(parseCustomDice({ ...ok, style: 'stars' })).toBeNull();
    expect(parseCustomDice({ ...ok, faces: ['1', '2', '3'] })).toBeNull();
    expect(
      parseCustomDice({ ...ok, faces: ['a much too long face', '', '', '', '', ''] }),
    ).toBeNull();
    expect(parseCustomDice({ ...ok, faces: ['a\u0007', '', '', '', '', ''] })).toBeNull();
  });
});

describe('a throw', () => {
  const frames = throwFrames();

  it('runs from the start to the end, in order', () => {
    expect(frames[0]!.offset).toBe(0);
    expect(frames.at(-1)!.offset).toBe(1);
    for (let i = 1; i < frames.length; i++)
      expect(frames[i]!.offset).toBeGreaterThan(frames[i - 1]!.offset);
  });

  it('lands still, flat and showing', () => {
    const end = frames.at(-1)!;
    expect(end.travel).toBeCloseTo(1);
    expect(end.height).toBe(0);
    expect(end.settle).toBeCloseTo(0);
    expect(end.opacity).toBe(1);
  });

  it('slows down evenly: never faster later than earlier, and no sudden crawl', () => {
    const speeds = frames
      .slice(1)
      .map((f, i) => (f.travel - frames[i]!.travel) / (f.offset - frames[i]!.offset));
    for (let i = 1; i < speeds.length; i++)
      expect(speeds[i]!).toBeLessThanOrEqual(speeds[i - 1]! + 1e-9);
    // Halfway through it still moves at a fair part of its starting speed.
    const mid = speeds[Math.floor(speeds.length / 2)]!;
    expect(mid / speeds[0]!).toBeGreaterThan(0.35);
  });

  it('bounces lower each time and stays on the table after', () => {
    const peak = (a: number, b: number) =>
      Math.max(...frames.filter((f) => f.offset > a && f.offset < b).map((f) => f.height));
    expect(peak(0.24, 0.52)).toBeGreaterThan(peak(0.52, 0.68));
    expect(frames.filter((f) => f.offset >= 0.68).every((f) => f.height === 0)).toBe(true);
  });
});
