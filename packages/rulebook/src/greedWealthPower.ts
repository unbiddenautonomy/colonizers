import type { CardGlossaryEntry, RulebookModule } from './types.ts';

const M = 'greed-wealth-power';

function card(id: string, deck: string, name: string, text: string): CardGlossaryEntry {
  return { id, module: M, deck, name, text };
}

const CARDS: CardGlossaryEntry[] = [
  card(
    'duke',
    'politics',
    'Duke',
    'Put the Duke on any land hex. Your knights on its corners are 1 stronger, everyone else’s 1 weaker. Worth 1 point while it is yours.',
  ),
  card(
    'scholar',
    'science',
    'Scholar',
    'Put the Scholar on a hex beside one of your cities. Take 1 more card when that hex produces. Worth 1 point while it is yours.',
  ),
  card(
    'wizard',
    'magic',
    'Wizard',
    'Put the Wizard on a hex beside your settlement or city. The robber does not stop your production there. Worth 1 point while it is yours.',
  ),
  card(
    'inquisitor',
    'religion',
    'Inquisitor',
    'Put the Inquisitor beside another player’s settlement or city (not one with a Citadel). That player loses every level 3 ability. Worth 1 point while it is yours.',
  ),
  card(
    'envoy',
    'wealth',
    'Envoy',
    'Put the Envoy on a hex beside another player’s city. Take 1 card when that hex produces. Worth 1 point while it is yours.',
  ),
];

export const greedWealthPowerRules: RulebookModule = {
  module: 'greed-wealth-power',
  name: 'Greed, Wealth & Power',
  cards: CARDS,
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
    duke: { name: 'Duke', icon: '🎖️' },
    scholar: { name: 'Scholar', icon: '📜' },
    wizard: { name: 'Wizard', icon: '🧙' },
    inquisitor: { name: 'Inquisitor', icon: '⚖️' },
    envoy: { name: 'Envoy', icon: '💼' },
    heroOfCatan: { name: 'Hero of Catan', icon: '🦸' },
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

The new commodities only come from cities next to a special building (see Special buildings), but you can always trade for them and build any track with them. The five new **neutral pieces** come with progress cards in the decks (see Neutral pieces); the other new progress cards come in a later update.

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
    {
      id: 'gwp-neutrals',
      module: 'greed-wealth-power',
      section: 'rules',
      title: 'Neutral pieces',
      summary: 'Duke, Scholar, Wizard, Inquisitor and Envoy: 1 point each while you control them.',
      tags: [
        'neutral',
        'duke',
        'scholar',
        'wizard',
        'inquisitor',
        'envoy',
        'hero',
        'hero of catan',
        'merchant',
      ],
      body: `Like the merchant, each track now has a neutral piece, put on the board by a progress card of the same name. Whoever played its card last controls it and scores **1 point** for it. Playing the card while the piece is out takes it over and moves it.

| Piece | Deck | Goes on | While it is yours |
|---|---|---|---|
| 🎖️ Duke | Politics | any land hex | your knights on its corners are 1 stronger; everyone else's are 1 weaker |
| 📜 Scholar | Science | a hex beside your city | 1 more card when that hex produces |
| 🧙 Wizard | Magic | a hex beside your settlement or city | the robber does not stop your production there |
| ⚖️ Inquisitor | Religion | a hex beside another player's settlement or city | that player has no level 3 abilities |
| 💼 Envoy | Wealth | a hex beside another player's city | 1 card when that hex produces |

- The **Scholar**, **Wizard** and **Inquisitor** chase each other away: put one on a hex with another and the other leaves the board.
- The **Inquisitor** can't go beside a city with a Citadel. You choose the player when you play the card.
- The **Scholar** and **Envoy** card is the hex's commodity when you can take it (Crystal, Bread and Gold need your Citadel, Diocese or Monument), otherwise its resource. The robber stops it, unless the Wizard protects you there.
- **Duke**: a knight next to a rival's Duke can drop to strength 0. It can still act, but adds nothing against the barbarians and any knight can push it away.
- **Hero of Catan** 🦸: the first time one of your knights reaches strength **4** (a mighty knight beside your Duke), you take a Hero of Catan card worth **1 point**. You keep it even when the Duke moves on. There are five, one per player.`,
    },
  ],
};
