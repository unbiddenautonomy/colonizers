import { describe, expect, it } from 'vitest';
import { DEFAULT_CUSTOM_DICE, parseCustomDice } from './Dice.tsx';

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
