import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from './playerColors.ts';
import { THEMES } from './themes.tsx';

/** CIE L*a*b* of a #rrggbb colour (D65). */
function lab(hex: string): [number, number, number] {
  const lin = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lin(1), lin(3), lin(5)];
  const f = (v: number) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const distance = (a: string, b: string) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]!));

describe('player colours', () => {
  it.each(Object.entries(PLAYER_COLORS))(
    'the %s set has eight colours, all well apart',
    (_, set) => {
      expect(set).toHaveLength(8);
      for (let i = 0; i < set.length; i++)
        for (let j = i + 1; j < set.length; j++)
          expect(distance(set[i]!, set[j]!)).toBeGreaterThan(20);
    },
  );

  it('every board but Clean has a set of its own', () => {
    const own = THEMES.filter((t) => t.id !== 'clean' && t.players[0]!.color === '#d55e00');
    expect(own.map((t) => t.id)).toEqual([]);
  });
});
