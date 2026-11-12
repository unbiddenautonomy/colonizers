import { describe, expect, it } from 'vitest';
import { library } from '../game/library.ts';
import { cleanTheme } from './clean.ts';
import { cardColor, THEMES, themeById } from './themes.tsx';

describe('themes', () => {
  const registry = library.registry([
    'base',
    'seafarers',
    'special-maps',
    'variants',
    'cities-knights',
  ]);
  const hexTypes = Object.keys(registry.hexTypes).filter((t) => t !== 'sea');

  it('has unique ids and falls back to Clean', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
    expect(themeById('nope')).toBe(cleanTheme);
  });

  for (const theme of THEMES) {
    it(`${theme.name} has art for every hex, seat and card`, () => {
      for (const t of hexTypes) expect(theme.terrain[t], `${theme.id} ${t}`).toBeTruthy();
      expect(theme.players).toHaveLength(8);
      expect(new Set(theme.players.map((p) => p.color)).size).toBe(8);
      for (const c of Object.keys(registry.cardTypes).filter((c) => !c.startsWith('?')))
        expect(cardColor(theme, c)).toMatch(/^#/);
      for (const key of theme.patterned ?? [])
        expect(key === 'sea' || hexTypes.includes(key), key).toBe(true);
    });
  }
});
