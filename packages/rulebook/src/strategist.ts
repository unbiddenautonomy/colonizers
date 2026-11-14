import type { RulebookModule } from './types.ts';

const M = 'strategist';

export const strategistRules: RulebookModule = {
  module: M,
  name: 'Strategist & Commander',
  cards: [
    {
      id: 'sfDuke',
      module: M,
      deck: 'politics',
      name: 'Duke',
      text: 'Put the Duke beside any knight on the board, or move it there. Beside your own knight it adds 1 strength (3 at most); beside a rival’s it takes 1 away (1 at least). It moves with its knight, and leaves when the knight does.',
    },
    {
      id: 'sfScholar',
      module: M,
      deck: 'science',
      name: 'Scholar',
      text: 'Put the Scholar at any settlement or city, or move it there. Until the barbarians next land, whatever that building produces, you get the same again.',
    },
  ],
  items: {},
  names: {
    sfDuke: { name: 'Duke', icon: '🎖️' },
    sfScholar: { name: 'Scholar', icon: '🎓' },
    junker: { name: 'Junker', icon: '🎩' },
  },
  pages: [
    {
      id: 'strategist',
      module: M,
      section: 'rules',
      title: 'Strategist & Commander',
      summary:
        'The Junker freezes a field and hides it from the barbarians; the Duke and the Scholar.',
      tags: [
        'strategist',
        'commander',
        'stratege',
        'feldherr',
        'junker',
        'duke',
        'herzog',
        'scholar',
        'gelehrter',
        'doubles',
      ],
      body: `A fan expansion for Cities & Knights that makes where your knights and cities stand matter as much as how many you have.

**The Junker.** When you roll doubles, you put the Junker on any land field once the roll is worked out, or move it there. Until the barbarians first reach Catan, it stays where it first landed. When they land it leaves the board, and the next doubles bring it back.

- **It freezes its field.** Nothing is built on the field's corners or paths (no roads, settlements, cities, walls, knights or promotions), no knight moves onto or off them, and the robber can't be moved there (it may leave). A knight there can still be activated, deactivated, and chase the robber from a neighbouring field. Progress cards still work there, and the field still produces.
- **It hides its field from the barbarians.** Knights and cities on its corners count for neither side when the barbarians land, and a city there can't be the one that's lost.

**The Duke** (5 politics cards) joins a knight: your own gets 1 stronger, a rival's 1 weaker.

**The Scholar** (5 science cards) joins a settlement or city: until the barbarians land, its owner gets whatever that building makes again.

**Holding the barbarians.** On your turn, deactivate one of your active strong or mighty knights to move the barbarian ship a step forward or back.

**Also.** Neutral pieces score no points, so the merchant is worth nothing. The Smith is a politics card here, not a science card.`,
    },
  ],
};
