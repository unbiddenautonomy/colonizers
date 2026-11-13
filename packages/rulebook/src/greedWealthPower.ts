import type { RulebookModule } from './types.ts';

export const greedWealthPowerRules: RulebookModule = {
  module: 'greed-wealth-power',
  name: 'Greed, Wealth & Power',
  cards: [],
  items: {
    citadel: {
      name: 'Citadel',
      note: 'On a brick hex beside your city (or built in a settlement, which becomes a city). Your cities on brick make Crystal.',
    },
    diocese: {
      name: 'Diocese',
      note: 'On a grain hex beside your city. Your cities on grain make Bread.',
    },
    monument: {
      name: 'Monument',
      note: 'On a gold field beside your city. Your cities on gold fields make Gold.',
    },
    silo: {
      name: 'Silo',
      note: 'On a grain hex beside your city. Your cities on grain make 1 more grain.',
    },
  },
  names: {
    crystal: { name: 'Crystal', icon: '💎' },
    bread: { name: 'Bread', icon: '🍞' },
    gold: { name: 'Gold', icon: '🪙' },
    beer: { name: 'Beer', icon: '🍺' },
    magic: { name: 'Magic', icon: '🟣' },
    religion: { name: 'Religion', icon: '🔴' },
    wealth: { name: 'Wealth', icon: '🟠' },
    citadel: { name: 'Citadel', icon: '🏰' },
    diocese: { name: 'Diocese', icon: '⛪' },
    monument: { name: 'Monument', icon: '🗿' },
    silo: { name: 'Silo', icon: '🌾' },
    hansaLeague: { name: 'Hansa League', icon: '⭐' },
    airship: { name: 'Airship', icon: '⭐' },
    relic: { name: 'Relic', icon: '⭐' },
    belovedPrince: { name: 'Beloved Prince', icon: '⭐' },
  },
  pages: [
    {
      id: 'gwp',
      module: 'greed-wealth-power',
      section: 'map',
      title: 'Greed, Wealth & Power',
      summary: 'Three more improvement tracks, special buildings, Beer and an 18-point game.',
      tags: [
        'greed',
        'wealth',
        'power',
        'gwp',
        'magic',
        'religion',
        'crystal',
        'bread',
        'gold',
        'fan',
      ],
      body: `A fan-made expansion for Cities & Knights by lightningserpent, which brings together several older fan expansions. Everything from Cities & Knights still applies, with these changes:

- **{setting:vpTarget} points** win, and you may hold **5 progress cards**.
- Three more **city improvement** tracks, each with its own commodity and metropolis: **Magic** 🟣 (Crystal 💎), **Religion** 🔴 (Bread 🍞) and **Wealth** 🟠 (Gold 🪙). They cost 1 to 5 of their commodity, like the other tracks.
- You can own only **one** of the Science, Magic and Religion metropolises. Once you own one, the other two of those tracks stop at level 3.
- The event die has **12 faces**: 4 ships, 2 ships with a **wild gate**, and a gate for each of the six tracks. On a wild gate the barbarians move first, then everyone in turn draws one card from **any deck** their levels open for the red die.

The new commodities only come from cities next to a special building (see Special buildings), but you can always trade for them and build any track with them. Progress cards for the three new decks and the neutral pieces come in the next update.

The rules are lightningserpent's (GWP 1.0); we credit the authors of the expansions it builds on in the manual.`,
    },
    {
      id: 'gwp-buildings',
      module: 'greed-wealth-power',
      section: 'rules',
      title: 'Special buildings',
      summary: 'Citadel, Diocese, Monument and Silo: one of each, beside your cities.',
      tags: [
        'citadel',
        'diocese',
        'monument',
        'silo',
        'building',
        'crystal',
        'bread',
        'gold',
        'grain',
      ],
      body: `Each player has one of each building. Build one on a hex that touches one of your cities:

| Building | Cost | Goes on | Then |
|---|---|---|---|
| 🏰 Citadel | 1 ore, 2 brick | a brick hex | your cities on brick make 1 brick + 1 Crystal |
| ⛪ Diocese | 1 brick, 1 lumber, 1 grain | a grain hex | your cities on grain make 1 grain + 1 Bread |
| 🗿 Monument | 1 ore, 1 brick | a gold field | your cities on gold fields make 1 Gold + 1 resource of your choice |
| 🌾 Silo | 1 brick, 1 lumber | a grain hex | your cities on grain make 1 more grain |

- A **Citadel** can also go in a **settlement**: it costs 3 ore, 2 grain and 2 brick, and the settlement becomes a city.
- A city can have a Citadel or a Diocese, not both. A city can have only one building on each hex it touches.
- When the barbarians knock a city back to a settlement, its buildings come off and can be built again beside another city.`,
    },
    {
      id: 'gwp-abilities',
      module: 'greed-wealth-power',
      section: 'rules',
      title: 'Level 3 abilities and Beer',
      summary: 'Magic and Wealth trades, and Beer from Religion.',
      tags: [
        'level 3',
        'ability',
        'beer',
        'trade',
        'magic kitchen',
        'basilica',
        'marketplace',
        'knight',
      ],
      body: `**Level 3 abilities**

- **Magic** (Magic Kitchen): trade brick 1:1 for any other resource with the bank.
- **Religion** (Basilica): a roll (not a 7) that gives you nothing brews **1 Beer** 🍺. With Science level 3 too, you pick one: the Aqueduct resource or the Beer.
- **Wealth** (Marketplace): trade any resource 2:1 for another with the bank.

These trades are for resources only, not commodities.

**Beer** 🍺

- Beer is a token everyone can see. It isn't a card: it doesn't count when a 7 is rolled, and it can't be stolen.
- **1 Beer** activates any knight, yours or another player's.
- Beer buys **commodities** from the bank: 4 Beer for 1, 3 with a 3:1 harbor, 2 with Trade level 3.
- Beer festivals come in a later update.`,
    },
  ],
};
