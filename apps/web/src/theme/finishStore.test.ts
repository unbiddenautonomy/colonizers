import { describe, expect, it } from 'vitest';
import { dragonTint, FINISHES, pieceFinish, setDragonColour, setFinish } from './finishStore.ts';

describe('piece finish', () => {
  it('offers the three finishes and starts on Enamel', () => {
    expect(FINISHES.map((f) => f.id)).toEqual(['enamel', 'glow', 'lounge']);
    expect(pieceFinish()).toBe('enamel');
  });

  it('keeps the pick', () => {
    setFinish('lounge');
    expect(pieceFinish()).toBe('lounge');
    setFinish('enamel');
  });

  it('shades dragons by strength, gold unless emerald is picked', () => {
    expect([1, 2, 3].map((t) => dragonTint(t))).toEqual(['#f6dc8a', '#d29d2c', '#8a5a1e']);
    setDragonColour('emerald');
    expect(dragonTint(3)).toBe('#0f5a33');
    setDragonColour('gold');
  });
});
