import { describe, expect, it } from 'vitest';
import { firstFamily, fontUrl, served } from './fonts.ts';
import { LOOKS } from './looks.tsx';
import { THEMES } from './themes.tsx';

describe('the fonts a look needs', () => {
  it('reads the first family out of a stack', () => {
    expect(firstFamily("'Playfair Display', Georgia, serif")).toBe('Playfair Display');
    expect(firstFamily('Inter, system-ui, sans-serif')).toBe('Inter');
  });

  it('asks only for the families in the stacks given', () => {
    const url = fontUrl(["'DM Serif Display', Georgia, serif", 'Inter, system-ui, sans-serif']);
    expect(url).toBe(
      'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@400;500;600;700&display=swap',
    );
  });

  it('asks for a family once, however many places name it', () => {
    const url = fontUrl(['Inter, sans-serif', 'Inter, system-ui', undefined]);
    expect(url).toBe(
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    );
  });

  it('serves the fonts every look and board asks for', () => {
    const missing = LOOKS.filter((l) => !served(l.tokens.heading) || !served(l.tokens.body)).map(
      (l) => l.id,
    );
    expect(missing).toEqual([]);
    const boards = THEMES.filter((t) => t.tokenFont && !served(t.tokenFont)).map((t) => t.id);
    expect(boards).toEqual([]);
  });

  it('asks for nothing when the look uses the device’s own fonts', () => {
    expect(fontUrl(['system-ui, sans-serif', undefined])).toBeNull();
  });
});
