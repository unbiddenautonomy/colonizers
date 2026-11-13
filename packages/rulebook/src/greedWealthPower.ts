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
  card(
    'kontor',
    'trade',
    'Kontor',
    'Use one of another player’s harbors as your own for the rest of the game.',
  ),
  card(
    'tradingPost',
    'trade',
    'Trading Post',
    'Name a resource: if you build a settlement or city on a harbor this turn, you get one of it back.',
  ),
  card(
    'brothel',
    'politics',
    'Brothel',
    'Pick a player with more points. They pay you 1 grain, bread or Beer, or all their knights stand down.',
  ),
  card(
    'tournament',
    'politics',
    'Tournament',
    'Pay 1 wool and 1 ore to promote a strong knight to mighty, even without Politics level 3.',
  ),
  card(
    'secretSociety',
    'science',
    'Secret Society',
    'Before or after rolling: use another player’s level 3 ability until your turn ends.',
  ),
  card(
    'astrolabe',
    'science',
    'Astrolabe',
    'Build a Citadel or Diocese this turn for 1 brick, or (if you have one) take 1 paper.',
  ),
  card(
    'summoning',
    'magic',
    'Summoning',
    'Remove another player’s open road or ship, or one of their inactive knights.',
  ),
  card(
    'ghostShip',
    'magic',
    'Ghost Ship',
    'Take 1 random card from each player for every open shipping lane they have.',
  ),
  card('witchsNight', 'magic', 'Witch’s Night', 'Take 1 random card from each other player.'),
  card(
    'willOWisp',
    'magic',
    'Will-o’-Wisp',
    'Before rolling: this roll, forests make ore, hills grain, pastures lumber, fields wool and mountains brick.',
  ),
  card(
    'magicCurrent',
    'magic',
    'Magic Current',
    'Move the barbarian ship 2 spaces forward (not onto Catan) or back.',
  ),
  card(
    'ravenFlight',
    'magic',
    'Raven Flight',
    'Send the robber to the desert, or make every other player discard 1 grain.',
  ),
  card(
    'stoneCircle',
    'magic',
    'Stone Circle',
    'Trade 1 resource for 3 ore, or remove one of your knights for 1 commodity of your choice and 1 bread.',
  ),
  card(
    'stardust',
    'magic',
    'Stardust',
    'Take 1 crystal and 1 resource of your choice from the bank.',
  ),
  card(
    'unicornMagic',
    'magic',
    'Unicorn Magic',
    'Before rolling: choose what the event die shows. The other dice roll as usual.',
  ),
  card(
    'riverNaiad',
    'magic',
    'River Naiad',
    'Swap the number on a grain hex with any other number on the board.',
  ),
  card(
    'magicRitual',
    'magic',
    'Magic Ritual',
    'Everyone else gives you a progress card of their choice. Keep one; the rest go under their decks.',
  ),
  card(
    'magicForest',
    'magic',
    'Magic Forest',
    'Take 1 lumber for each of your settlements by a forest, or trade 2 lumber for 1 crystal.',
  ),
  card(
    'almsgiving',
    'religion',
    'Almsgiving',
    'Each player with more points discards 1 card for every progress card they hold.',
  ),
  card(
    'bookBurning',
    'religion',
    'Book Burning',
    'Every other player puts one progress card of their choice back under its deck.',
  ),
  card(
    'dogma',
    'religion',
    'Dogma',
    'Take a random Science card from each player. Keep one; the rest go under the deck.',
  ),
  card(
    'witchBurning',
    'religion',
    'Witch Burning',
    'Take a random Magic card from each player. Keep one; the rest go under the deck.',
  ),
  card(
    'churchTax',
    'religion',
    'Church Tax',
    'Every other player gives you 1 card of their choice.',
  ),
  card('crusader', 'religion', 'Crusader', 'Place a basic knight for free, already active.'),
  card(
    'missionary',
    'religion',
    'Missionary',
    'Give a player one of your Religion cards. They lose all their Science and Magic cards.',
  ),
  card(
    'reformation',
    'religion',
    'Reformation',
    'Swap all your progress cards for new ones from the same decks, or make everyone else do it.',
  ),
  card(
    'badOmen',
    'religion',
    'Bad Omen',
    'A player further on in Magic or Science than in Religion: all their knights stand down.',
  ),
  card(
    'banishment',
    'religion',
    'Banishment',
    'Take every neutral piece off the board and send the robber to the desert.',
  ),
  card(
    'refuge',
    'religion',
    'Refuge',
    'Before or after rolling: your cities can’t be lost in the next barbarian attack.',
  ),
  card(
    'goldSmith',
    'wealth',
    'Gold Smith',
    'Take 1 resource or commodity of your choice from the bank.',
  ),
  card(
    'honorParade',
    'wealth',
    'Honor Parade',
    'Activate every knight. Each other player who had a knight activated gives you 1 card of their choice.',
  ),
  card(
    'brickworks',
    'wealth',
    'Brickworks',
    'For the rest of your turn, trade 2 brick for 1 crystal with the bank.',
  ),
  card(
    'leasedLand',
    'wealth',
    'Leased Land',
    'For the rest of your turn, trade 2 wool for 1 cloth with the bank.',
  ),
  card(
    'publisher',
    'wealth',
    'Publisher',
    'For the rest of your turn, trade 2 lumber for 1 paper with the bank.',
  ),
  card(
    'coinHouse',
    'wealth',
    'Coin House',
    'For the rest of your turn, trade 2 ore for 1 coin with the bank.',
  ),
  card(
    'bakery',
    'wealth',
    'Bakery',
    'For the rest of your turn, trade 2 grain for 1 bread with the bank.',
  ),
  card(
    'goldExchange',
    'wealth',
    'Gold Exchange',
    'For the rest of your turn, trade 2 of any one resource for 1 gold with the bank.',
  ),
  card(
    'mercenaries',
    'wealth',
    'Mercenaries',
    'Send the barbarian ship back to the start of its track.',
  ),
  card(
    'espionage',
    'wealth',
    'Espionage',
    'Look at the top card of every progress deck and take one.',
  ),
  card(
    'intimidation',
    'wealth',
    'Intimidation',
    'When a 7 makes you discard, play this instead and keep your cards.',
  ),
  card(
    'alliance',
    'politics',
    'Alliance',
    'Before or after rolling: pick another player’s active knight. In the next attack it defends for you.',
  ),
  card(
    'dragonLair',
    'magic',
    'Dragon Lair',
    'Put the dragon on an ore hex and take its number away, until a mighty knight drives the dragon out.',
  ),
  card(
    'lent',
    'religion',
    'Lent',
    'Pick a player. On their next turn they can’t build until they pay 1 wool and 1 grain.',
  ),
  card('hansaLeague', 'trade', 'Hansa League', '1 victory point, scored as soon as you draw it.'),
  card('airship', 'magic', 'Airship', '1 victory point, scored as soon as you draw it.'),
  card('relic', 'religion', 'Relic', '1 victory point, scored as soon as you draw it.'),
  card(
    'belovedPrince',
    'wealth',
    'Beloved Prince',
    '1 victory point, scored as soon as you draw it.',
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
      note: 'On a gold field or a river hex beside your city. Your cities on gold fields and river hexes make Gold.',
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
    alliance: { name: 'Alliance', icon: '🤝' },
    dragonLair: { name: 'Dragon Lair', icon: '🐲' },
    lent: { name: 'Lent', icon: '🐟' },
    damsel: { name: 'Damsel', icon: '👸' },
    gwpDragon: { name: 'Dragon', icon: '🐉' },
    dragonSlayer: { name: 'Dragon Slayer', icon: '🗡️' },
    kontor: { name: 'Kontor', icon: '🏪' },
    tradingPost: { name: 'Trading Post', icon: '🏷️' },
    brothel: { name: 'Brothel', icon: '🏮' },
    tournament: { name: 'Tournament', icon: '🏇' },
    secretSociety: { name: 'Secret Society', icon: '🕯️' },
    astrolabe: { name: 'Astrolabe', icon: '🧭' },
    summoning: { name: 'Summoning', icon: '🌀' },
    ghostShip: { name: 'Ghost Ship', icon: '👻' },
    witchsNight: { name: 'Witch’s Night', icon: '🧹' },
    willOWisp: { name: 'Will-o’-Wisp', icon: '✨' },
    magicCurrent: { name: 'Magic Current', icon: '🌊' },
    ravenFlight: { name: 'Raven Flight', icon: '🐦‍⬛' },
    stoneCircle: { name: 'Stone Circle', icon: '🪨' },
    stardust: { name: 'Stardust', icon: '🌟' },
    unicornMagic: { name: 'Unicorn Magic', icon: '🦄' },
    riverNaiad: { name: 'River Naiad', icon: '🧜' },
    magicRitual: { name: 'Magic Ritual', icon: '🔮' },
    magicForest: { name: 'Magic Forest', icon: '🌲' },
    almsgiving: { name: 'Almsgiving', icon: '🪙' },
    bookBurning: { name: 'Book Burning', icon: '🔥' },
    dogma: { name: 'Dogma', icon: '📕' },
    witchBurning: { name: 'Witch Burning', icon: '🕯️' },
    churchTax: { name: 'Church Tax', icon: '💰' },
    crusader: { name: 'Crusader', icon: '🛡️' },
    missionary: { name: 'Missionary', icon: '✝️' },
    reformation: { name: 'Reformation', icon: '📜' },
    badOmen: { name: 'Bad Omen', icon: '🌑' },
    banishment: { name: 'Banishment', icon: '🚫' },
    refuge: { name: 'Refuge', icon: '⛪' },
    goldSmith: { name: 'Gold Smith', icon: '💍' },
    honorParade: { name: 'Honor Parade', icon: '🎺' },
    brickworks: { name: 'Brickworks', icon: '🧱' },
    leasedLand: { name: 'Leased Land', icon: '🐑' },
    publisher: { name: 'Publisher', icon: '📰' },
    coinHouse: { name: 'Coin House', icon: '🏦' },
    bakery: { name: 'Bakery', icon: '🥖' },
    goldExchange: { name: 'Gold Exchange', icon: '⚖️' },
    mercenaries: { name: 'Mercenaries', icon: '⚔️' },
    espionage: { name: 'Espionage', icon: '🕵️' },
    intimidation: { name: 'Intimidation', icon: '😠' },
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

The new commodities only come from cities next to a special building (see Special buildings), but you can always trade for them and build any track with them. Each deck has **26 progress cards**: the five new **neutral pieces** (see Neutral pieces) and the other new cards are listed in the card glossary. A few cards are played at a different moment than printed: **Refuge** is played on your turn ahead of the attack, and **Magic Current** can't push the ship onto Catan. **Alliance** and **Lent** are also played on your own turn, ahead of time. Indulgence and Land Deed come in a later update.

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
| 🗿 Monument | 1 ore, 1 brick | a gold field or a river hex | your cities on gold fields make 1 Gold + 1 resource of your choice, and your cities on river hexes make 1 Gold + the hex's resource |
| 🌾 Silo | 1 brick, 1 lumber | a grain hex | your cities on grain make 1 more grain |

- A **Citadel** can also go in a **settlement**: it costs 3 ore, 2 grain and 2 brick, and the settlement becomes a city.
- A city can have a Citadel or a Diocese, not both. A city can have only one building on each hex it touches.
- When the barbarians knock a city back to a settlement, its buildings come off and can be built again beside another city.`,
    },
    {
      id: 'gwp-river',
      module: 'greed-wealth-power',
      section: 'rules',
      title: 'The river',
      summary:
        'An optional river of four hexes that gives Gold to Monument owners, with or without Seafarers.',
      tags: ['river', 'swampland', 'swamp', 'monument', 'gold'],
      body: `Switch on **The river** under Greed, Wealth & Power when you set up the game. It brings Gold to games without Seafarers' gold fields, and it works alongside them too.

- **Setting up:** the desert becomes the 🐸 **swampland**, and one ore, one brick and one wool hex become **river hexes**. River hexes keep their terrain and number. The swampland has no number and the robber starts there. The river is laid in one line where the board allows it.
- **Building:** roads cross the river freely. A **Monument** can stand on a river hex (not the swampland) as well as on a gold field.
- **Production:** until you have a Monument, river hexes produce as normal. Once you have one, anywhere, each of your cities on a river hex makes **1 of the hex's resource + 1 Gold**. On the ore river that's ore and Gold instead of ore and coin, and on the brick river it's brick and Gold instead of 2 brick.
- **Citadel on the brick river:** a city whose own Citadel stands on the brick river hex keeps making brick and Crystal there.
- The **Scholar** and **Envoy** take Gold from a river hex once their owner has a Monument.`,
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
        'festival',
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
**Beer festivals** 🍻

On your turn you can spend Beer on a festival for another player. It lasts until your next production roll is worked out, and you can only have one going at a time.

| Festival | Beer | That player... |
|---|---|---|
| Road or ship | 2 | can't build roads (or ships) |
| Knight | 3 | can't build new knights (or can't activate knights) |
| Settlement | 4 | gets nothing from their settlements |
| City | 5 | can't build city improvements |

**Raven Flight** can break up a festival.`,
    },
    {
      id: 'gwp-dragon',
      module: 'greed-wealth-power',
      section: 'rules',
      title: 'The Damsel and the dragon',
      summary: 'Doubles bring the Damsel; after the first attack a 7 can move the dragon.',
      tags: ['damsel', 'dragon', 'dragon slayer', 'lair', 'doubles', 'seven', 'wizard'],
      body: `**The Damsel** 👸

When the two number dice show the same face, the player who rolled puts the Damsel on any land hex (or moves her there), once the roll is worked out.

- Cities beside her don't count for the barbarians and can't be lost to them.
- Knights beside her can be activated, but can't act or defend, and they stay active after an attack.
- Nobody can build a road, ship, settlement or city beside her. Progress cards still can.
- The robber can't steal on her hex.
- She leaves after every barbarian attack, and when the dragon or a neutral piece (merchant included) lands on her hex.

**The dragon** 🐉

The dragon starts off the board. After the first barbarian attack, whoever rolls a 7 may move the dragon instead of the robber, or take it off the board.

- It goes on a land hex beside at least one knight, and switches off the basic and strong knights next to it.
- Its hex makes nothing, except for the player whose Wizard stands there too.
- A **strong** knight beside it (active, like any knight action) chases it off the board, and so does the Wizard landing on its hex.
- A **mighty** knight (or a hero) slays it: it's gone for good, and that player takes **Dragon Slayer** 🗡️, worth **2 points**.
- **Dragon Lair** puts it on an ore hex and takes the number away. Only a mighty knight can drive it out, and the number comes back.`,
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
- The **Damsel** and the **dragon** are neutral too, but score nothing: see The Damsel and the dragon.
- **Hero of Catan** 🦸: the first time one of your knights reaches strength **4** (a mighty knight beside your Duke), you take a Hero of Catan card worth **1 point**. You keep it even when the Duke moves on. There are five, one per player.`,
    },
  ],
};
