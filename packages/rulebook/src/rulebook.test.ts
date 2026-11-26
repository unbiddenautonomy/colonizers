import { describe, expect, it } from 'vitest';
import {
  allCards,
  cardGroups,
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

  it('groups the cards by expansion and shows each one once', () => {
    const groups = cardGroups(RULEBOOKS);
    const ids = groups.flatMap((g) => g.cards.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
    // Every card is still there: 116 entries, 13 of them a second listing.
    expect(ids.length).toBe(new Set(allCards(RULEBOOKS).map((c) => c.id)).size);
    expect(groups.every((g) => g.cards.length > 0 && g.name.length > 0)).toBe(true);
    // One deck of one expansion per group.
    expect(new Set(groups.map((g) => `${g.module}/${g.deck}`)).size).toBe(groups.length);
  });

  it('says when a card belongs to two expansions', () => {
    const groups = cardGroups(RULEBOOKS);
    const road = groups.flatMap((g) => g.cards).find((c) => c.id === 'roadBuilding');
    expect(road?.alsoIn).toEqual(['Cities & Knights']);
    const indulgence = groups.flatMap((g) => g.cards).find((c) => c.id === 'indulgence');
    expect(indulgence?.alsoIn).toEqual(['Church, Faith & Reformation']);
  });

  it('keeps a shared card under the expansion in play', () => {
    const [group] = cardGroups(rulebookFor(['base', 'church']));
    expect(group?.name).toBe('Base game');
    const church = cardGroups(rulebookFor(['base', 'church'])).find((g) => g.module === 'church');
    expect(church?.cards.some((c) => c.id === 'indulgence')).toBe(true);
  });

  it('names cards with icons', () => {
    expect(nameOf('ore')).toEqual({ name: 'Ore', icon: '🪨' });
    expect(nameOf('mystery').name).toBe('mystery');
  });
});
