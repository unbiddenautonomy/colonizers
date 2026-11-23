import { describe, expect, it } from 'vitest';
import { FINISHES, pieceFinish, setFinish } from './finishStore.ts';

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
});
