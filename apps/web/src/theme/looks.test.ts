import { describe, expect, it } from 'vitest';
import { AUTO, DEFAULT_LOOK, lookById, LOOKS } from './looks.tsx';

const lum = (hex: string) => {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

describe('looks', () => {
  it('starts new devices on Basic Clean, with its own board', () => {
    expect(DEFAULT_LOOK).toBe('clean-basic');
    expect(lookById(DEFAULT_LOOK, true).board).toBe('basic-clean');
    expect(lookById('nope', false).id).toBe('clean-basic');
    expect(lookById(AUTO, true).id).toBe('basicbench-dark');
  });

  it('has unique ids', () => {
    expect(new Set(LOOKS.map((l) => l.id)).size).toBe(LOOKS.length);
  });

  // Every text colour must read on every surface it can sit on (WCAG AA, 4.5:1).
  for (const look of LOOKS) {
    it(`${look.id} text is readable`, () => {
      const t = look.tokens;
      const bad: string[] = [];
      for (const fg of ['text', 'soft', 'muted', 'faint', 'accent'] as const) {
        for (const bg of ['card', 'sunk', 'raised', 'bg'] as const) {
          const r = ratio(t[fg], t[bg]);
          if (r < 4.5) bad.push(`${fg} on ${bg}: ${r.toFixed(2)}`);
        }
      }
      const r = ratio(t.accentText, t.accent);
      if (r < 4.5) bad.push(`accentText on accent: ${r.toFixed(2)}`);
      expect(bad).toEqual([]);
    });
  }
});
