import { describe, expect, it } from 'vitest';
import { library } from '../game/library.ts';
import {
  cardColor,
  DEFAULT_THEME,
  EXPANSION_THEMES,
  isExpansionGame,
  THEMES,
  themeById,
} from './themes.tsx';

describe('themes', () => {
  // T&B can't share a game with Seafarers, so gather hex types from both.
  const registries = [
    library.registry(['base', 'seafarers', 'special-maps', 'variants', 'cities-knights']),
    library.registry(['base', 'traders-barbarians']),
  ];
  const registry = {
    hexTypes: Object.assign({}, ...registries.map((r) => r.hexTypes)) as Record<string, unknown>,
    cardTypes: Object.assign({}, ...registries.map((r) => r.cardTypes)) as Record<string, unknown>,
  };
  // Shoals are drawn as sea.
  const hexTypes = Object.keys(registry.hexTypes).filter((t) => t !== 'sea' && t !== 'shoal');

  it('has unique ids and falls back to the default', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
    expect(themeById('nope')).toBe(DEFAULT_THEME);
    expect(DEFAULT_THEME.id).toBe('basic-clean');
  });

  it('keeps expansion games to the boards with art for every piece', () => {
    expect(isExpansionGame(['base'])).toBe(false);
    expect(isExpansionGame(['base', 'variants'])).toBe(false);
    expect(isExpansionGame(['base', 'seafarers'])).toBe(true);
    expect(isExpansionGame(['base', 'variants', 'cities-knights'])).toBe(true);
    for (const id of EXPANSION_THEMES) expect(themeById(id).id).toBe(id);
    expect(EXPANSION_THEMES).toContain(DEFAULT_THEME.id);
  });

  for (const theme of THEMES) {
    it(`${theme.name} has art for every hex, seat and card`, () => {
      for (const t of hexTypes) expect(theme.terrain[t], `${theme.id} ${t}`).toBeTruthy();
      expect(theme.players).toHaveLength(8);
      expect(new Set(theme.players.map((p) => p.color)).size).toBe(8);
      for (const c of Object.keys(registry.cardTypes).filter((c) => !c.startsWith('?')))
        expect(cardColor(theme, c)).toMatch(/^#/);
      for (const key of theme.patterned ?? [])
        expect(key === 'sea' || key === 'hidden' || hexTypes.includes(key), key).toBe(true);
    });
  }
});
