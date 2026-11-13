import { baseRules } from './base.ts';
import { seafarersRules } from './seafarers.ts';
import { citiesKnightsRules } from './citiesKnights.ts';
import { specialMapsRules } from './specialMaps.ts';
import { variantsRules } from './variants.ts';
import { tradersBarbariansRules } from './tradersBarbarians.ts';
import { treasuresDragonsRules } from './treasuresDragons.ts';
import { explorersPiratesRules } from './explorersPirates.ts';
import { greedWealthPowerRules } from './greedWealthPower.ts';
import { worldWondersRules } from './worldWonders.ts';
import { civilisationsRules } from './civilisations.ts';
import { churchRules } from './church.ts';
import type { CardGlossaryEntry, RulebookModule, RulePage } from './types.ts';

export type { CardGlossaryEntry, RulebookModule, RulePage } from './types.ts';

/** Every module's rulebook. Expansions add theirs here. */
export const RULEBOOKS: RulebookModule[] = [
  baseRules,
  seafarersRules,
  citiesKnightsRules,
  specialMapsRules,
  tradersBarbariansRules,
  treasuresDragonsRules,
  explorersPiratesRules,
  greedWealthPowerRules,
  churchRules,
  worldWondersRules,
  civilisationsRules,
  variantsRules,
];

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
  [/diocese/i, 'church-diocese'],
  [/festival|beer/i, 'church-beer'],
  [/^lent|anathema/i, 'church-cards'],
  [/wonder|^to start the /i, 'wonders'],
  [/citadel|diocese|monument|silo|brick hex|grain hex|gold field/i, 'gwp-buildings'],
  [/beer/i, 'gwp-abilities'],
  [/duke|scholar|wizard|inquisitor|envoy/i, 'gwp-neutrals'],
  [/damsel|dragon goes|lair/i, 'gwp-dragon'],
  [/metropolis, so/i, 'gwp'],
  [
    /harbor settlement|settler|extra sails|no moves left|can not reach there|ashore|gold buys/i,
    'ep-ships',
  ],
  [/explore the fog/i, 'ep-explore'],
  [/spice|no room aboard/i, 'ep-goods'],
  [/pirate ship|pirate lair|crew|chase the pirate|beside the pirate/i, 'pirate-lairs'],
  [/neutral|trade token|robber is already home|desert for the robber/i, 'duel'],
  [/no cities in Explorers|no development cards in Explorers/i, 'explorers-pirates'],
  [/enchanted|ferr|crosses where/i, 'enchanted-land'],
  [/gold river|small islands|off the lake|do not branch/i, 'great-canal'],
  [/dragon/i, 'desert-dragons'],
  [/no pirate in this scenario/i, 'treasures-dragons'],
  [/progress card|alchemist|scores by itself/i, 'progress-cards'],
  [/metropolis/i, 'metropolis'],
  [/improvement|track is complete|need \d+ (paper|cloth|coin)/i, 'improvements'],
  [/city wall/i, 'walls'],
  [/robber is not in play/i, 'ck-vs-base'],
  [/activated this turn|push away|chase|move along|next to the robber/i, 'knight-actions'],
  [/friendly robber/i, 'house-rules'],
  [/gift/i, 'house-rules'],
  [/wait for your turn to build|not your turn to build/i, 'special-build'],
  [/pirate/i, 'pirate'],
  [/ship|sail/i, 'ships'],
  [/fish|old boot/i, 'fishermen'],
  [/bridge|river|with gold|\d+ gold/i, 'rivers'],
  [/gold/i, 'gold'],
  [/home island/i, 'islands'],
  [/too close/i, 'distance-rule'],
  [/connect/i, 'building'],
  [/afford|not enough/i, 'building'],
  [/development card|playable|before rolling/i, 'dev-cards'],
  [/knight/i, 'knights'],
  [/robber|steal/i, 'robber'],
  [/discard/i, 'robber'],
  [/trade|offer|harbor|need \d/i, 'trading'],
];

/** The page for a rule-check message, among the pages of the game's modules when given. */
export function pageForError(message: string, modules?: readonly string[]): string | null {
  const pages = modules
    ? new Set(rulebookFor(modules).flatMap((b) => b.pages.map((p) => p.id)))
    : null;
  return ERROR_PAGES.find(([re, id]) => re.test(message) && (!pages || pages.has(id)))?.[1] ?? null;
}
