import { baseRules } from './base.ts';
import { seafarersRules } from './seafarers.ts';
import type { CardGlossaryEntry, RulebookModule, RulePage } from './types.ts';

export type { CardGlossaryEntry, RulebookModule, RulePage } from './types.ts';

/** Every module's rulebook. Expansions add theirs here. */
export const RULEBOOKS: RulebookModule[] = [baseRules, seafarersRules];

export function rulebookFor(modules: readonly string[]): RulebookModule[] {
  return RULEBOOKS.filter((r) => modules.includes(r.module));
}

/** Fills in {setting:key} with the game's values. */
export function fillSettings(text: string, settings: Record<string, unknown>): string {
  return text.replace(/\{setting:([a-zA-Z0-9_]+)\}/g, (_, key: string) =>
    String(settings[key] ?? key),
  );
}

export function searchPages(pages: RulePage[], query: string): RulePage[] {
  const q = query.trim().toLowerCase();
  if (!q) return pages;
  const words = q.split(/\s+/);
  return pages
    .map((p) => {
      const hay = `${p.title} ${p.summary} ${p.body} ${(p.tags ?? []).join(' ')}`.toLowerCase();
      const score = words.reduce(
        (s, w) => s + (hay.includes(w) ? 1 : 0) + (p.title.toLowerCase().includes(w) ? 2 : 0),
        0,
      );
      return { p, score };
    })
    .filter((x) => x.score >= words.length)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);
}

/** Display name and icon for a card, hex or item id. */
export function nameOf(
  id: string,
  books: RulebookModule[] = RULEBOOKS,
): { name: string; icon?: string } {
  for (const b of books) {
    const n = b.names?.[id];
    if (n) return n;
  }
  return { name: id };
}

export function allCards(books: RulebookModule[]): CardGlossaryEntry[] {
  return books.flatMap((b) => b.cards);
}

/**
 * Maps rule-check messages to the page that explains them, so a rejected
 * move can link straight to the rule.
 */
export const ERROR_PAGES: [RegExp, string][] = [
  [/pirate/i, 'pirate'],
  [/ship|sail/i, 'ships'],
  [/gold/i, 'gold'],
  [/home island/i, 'islands'],
  [/too close/i, 'distance-rule'],
  [/connect/i, 'building'],
  [/afford|not enough/i, 'building'],
  [/development card|playable|before rolling/i, 'dev-cards'],
  [/robber|steal/i, 'robber'],
  [/discard/i, 'robber'],
  [/trade|offer|harbor|need \d/i, 'trading'],
];

export function pageForError(message: string): string | null {
  return ERROR_PAGES.find(([re]) => re.test(message))?.[1] ?? null;
}
