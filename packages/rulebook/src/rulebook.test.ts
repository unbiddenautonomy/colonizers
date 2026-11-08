import { describe, expect, it } from 'vitest';
import {
  fillSettings,
  nameOf,
  pageForError,
  RULEBOOKS,
  rulebookFor,
  searchPages,
} from './index.ts';

describe('rulebook', () => {
  it('has unique page ids', () => {
    const ids = RULEBOOKS.flatMap((b) => b.pages.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('fills in the game settings', () => {
    expect(fillSettings('Reach {setting:vpTarget} points', { vpTarget: 12 })).toBe(
      'Reach 12 points',
    );
  });

  it('finds pages by search words', () => {
    const pages = rulebookFor(['base']).flatMap((b) => b.pages);
    expect(searchPages(pages, 'distance')[0]?.id).toBe('distance-rule');
    expect(searchPages(pages, 'harbor').map((p) => p.id)).toContain('trading');
  });

  it('links rule errors to pages', () => {
    expect(pageForError('Too close to another settlement or city')).toBe('distance-rule');
    expect(pageForError('Only a knight can be played before rolling')).toBe('dev-cards');
  });

  it('names cards with icons', () => {
    expect(nameOf('ore')).toEqual({ name: 'Ore', icon: '⛰️' });
    expect(nameOf('mystery').name).toBe('mystery');
  });
});
