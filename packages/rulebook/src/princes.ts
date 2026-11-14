import type { RulebookModule } from './types.ts';

const M = 'princes';

export const princesRules: RulebookModule = {
  module: M,
  name: 'Princes & Explorers',
  cards: [],
  items: {
    robberMove: {
      name: 'Move the robber',
      note: 'One to three fields, as on a 7, and you take a card from anyone.',
    },
  },
  names: {
    prince: { name: 'Prince', icon: '🤴' },
  },
  pages: [
    {
      id: 'princes',
      module: M,
      section: 'map',
      title: 'Princes & Explorers',
      summary: 'Four princes and the robber decide what each building is worth. 14 points.',
      tags: ['princes', 'explorers', 'fürsten', 'forscher', 'siedlerinsel', 'robber'],
      body: `A fan expansion for the base game from the SiedlerInsel site. Points depend on where you build: next to a prince a building is worth more, next to the robber it is worth nothing.

- **Four princes** start on the desert, the 2, the 12 and a 3 or 11.
- Each settlement you build **moves a prince** one field.
- A settlement at a prince lets your **explorers** swap two numbers.
- The **robber** no longer stops production. It takes points away instead.
- There are no development cards, no Largest Army and no Special Building Phase. With five or six players you may keep ten cards on a 7.

The first to {setting:vpTarget} points wins. Points can be lost again as the princes and the robber move.`,
    },
    {
      id: 'princes-princes',
      module: M,
      section: 'rules',
      title: 'The princes',
      summary: 'Buildings next to a prince score more, and roads there count double.',
      tags: ['prince', 'points', 'longest road', 'move'],
      body: `Every settlement or city next to a prince's field scores **1 point more** for each prince it touches: a settlement between two prince fields is worth 3.

A road along a prince's field counts **double** for the longest road, and **triple** between two prince fields.

Whenever you build a settlement (not in the first placements), you **move one prince** one field, in any direction:

- not across another player's road (your own are fine),
- not onto another prince or the robber.

If no prince can move, none does.`,
    },
    {
      id: 'princes-explorers',
      module: M,
      section: 'rules',
      title: 'The explorers',
      summary: 'Build at a prince to swap two neighbouring numbers.',
      tags: ['explorers', 'numbers', 'swap', 'tokens'],
      body: `When the settlement you build touches a prince's field, after moving a prince you may **swap two neighbouring numbers**:

- you have a settlement or city at one of the two fields,
- neither field has a prince or the robber on it,
- no other player's road lies between them.

You may also leave the numbers as they are.`,
    },
    {
      id: 'princes-robber',
      module: M,
      section: 'rules',
      title: 'The robber, renewed',
      summary: 'It takes points, not production, and walks one to three fields.',
      tags: ['robber', 'seven', '7', 'steal', 'desert'],
      body: `The robber starts **off the board**. The first player to settle at the desert (even in the first placements) puts it on any field but a prince's. If a 7 comes first, the roller brings it in.

- Buildings next to the robber score **nothing**, princes or not. Roads next to it drop out of the longest road, which can split a road in two.
- It **doesn't stop production**.
- On a 7 the roller moves it **one to three fields**, turning as they like, but not across another player's road or a prince, and not back to where it began. If it is boxed in, it stays.
- The mover then takes a card from **any player**, wherever they build.
- On your turn you can also pay **1 ore, 1 wool and 1 grain** to move it the same way.`,
    },
  ],
};
