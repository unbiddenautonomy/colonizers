/**
 * A rulebook page. Text is our own plain-language wording.
 *
 * Bodies use a tiny markup: blank lines split paragraphs, lines starting
 * with "- " are bullets, **bold** is bold, and {setting:key} is replaced with
 * the game's current value for that setting (e.g. the VP target).
 */
export interface RulePage {
  id: string;
  module: string;
  title: string;
  /** Short line shown in lists and search results. */
  summary: string;
  body: string;
  /** Extra words for search. */
  tags?: string[];
  section: 'rules' | 'cards' | 'map' | 'tips';
}

export interface CardGlossaryEntry {
  id: string;
  module: string;
  deck: string;
  name: string;
  text: string;
}

export interface RulebookModule {
  module: string;
  name: string;
  pages: RulePage[];
  cards: CardGlossaryEntry[];
  /** Friendly names for buildable items in the cost card. */
  items?: Record<string, { name: string; note: string }>;
  /** Friendly names and icons for cards and hexes. */
  names?: Record<string, { name: string; icon?: string }>;
}
