import type { CardGlossaryEntry, RulebookModule } from './types.ts';

const M = 'church';

function card(id: string, name: string, text: string): CardGlossaryEntry {
  return { id, module: M, deck: 'religion', name, text };
}

const CARDS: CardGlossaryEntry[] = [
  card(
    'superstition',
    'Superstition',
    'Pick a player who is further along in Science (or Magic) than in Religion. All their knights stand down.',
  ),
  card(
    'indulgence',
    'Indulgence',
    'Right after any roll, before it is worked out: throw one or more of the dice again. The new throw stands.',
  ),
  card(
    'bookBurning',
    'Book Burning',
    'Everyone who holds a progress card, you too, puts one of their choice back under its deck.',
  ),
  card(
    'dogma',
    'Dogma',
    'Take a random Science card from each other player who has one. Keep one; the rest go back under the Science deck.',
  ),
  card(
    'witchBurning',
    'Witch Burning',
    'Only with Witches, Wizards & Dragons. Take a random Magic card from each other player who has one. Keep one; the rest go back under the Magic deck.',
  ),
  card(
    'exile',
    'Exile',
    'The robber, the pirate, the merchant and the Inquisitor leave the board. The robber comes back the next time it has to move.',
  ),
  card(
    'lent',
    'Lent',
    'Before or after your roll. Pick a player: they may not build anything until they have paid a grain and a wool into the bank. Only one player keeps Lent at a time.',
  ),
  card(
    'inquisitor',
    'Inquisitor',
    'Put the Inquisitor on any city (not a Citadel), or move it there. Its owner loses all their level 3 abilities while it stays.',
  ),
  card(
    'anathema',
    'Anathema',
    'Pick a player and Science (or Magic). Name three resources their buildings can make. Until they have paid you those, that track is shut: no improvements, no cards from its deck, and no level 3 ability.',
  ),
  card('churchTax', 'Church Tax', 'Every other player gives you one resource of their choice.'),
  card(
    'crusader',
    'Crusader',
    'Place a basic knight, already active, on a free corner along your roads.',
  ),
  card(
    'reformation',
    'Reformation',
    'Either swap all your other progress cards for new ones from the same decks, or make every other player swap all of theirs.',
  ),
  card('census', 'Census', 'Every other player discards a card for each progress card they hold.'),
  card(
    'refuge',
    'Refuge',
    'Before or after your roll. Your cities are safe from the next barbarian attack.',
  ),
];

export const churchRules: RulebookModule = {
  module: M,
  name: 'Church, Faith & Reformation',
  cards: CARDS,
  items: {
    diocese: {
      name: 'Diocese',
      note: 'One of your cities, once a game (a settlement pays for the city as well). 1 point; its city makes Bread in place of a second grain; opens Religion.',
    },
  },
  names: {
    diocese: { name: 'Diocese', icon: '⛪' },
    superstition: { name: 'Superstition', icon: '🐈‍⬛' },
    exile: { name: 'Exile', icon: '🚪' },
    anathema: { name: 'Anathema', icon: '⛔' },
    census: { name: 'Census', icon: '📋' },
    joker: { name: 'Joker', icon: '🃏' },
  },
  pages: [
    {
      id: 'church',
      module: M,
      section: 'map',
      title: 'Church, Faith & Reformation',
      summary: 'A Religion track, Dioceses, Bread, Beer, festivals and a 15-point game.',
      tags: ['church', 'faith', 'reformation', 'religion', 'kgr', 'bread', 'beer', 'joker'],
      body: `A fan expansion for Cities & Knights, played on its own (not with Greed, Wealth & Power, which has its own Religion track).

- A fourth improvement track, **Religion**, paid for with **Bread**. Its level 3, the Abbey, brews Beer.
- Each player may make one city a **Diocese**. Only a Diocese opens Religion.
- **Beer** buys **festivals** that shut down a rival's piece for a round.
- The event die has ten faces: five ships, a gate for each of the four tracks, and a **joker**.
- You may hold five progress cards. Owning the Science metropolis stops your Religion at level 3, and owning the Religion metropolis stops your Science at level 3.

The first to {setting:vpTarget} points wins.`,
    },
    {
      id: 'church-diocese',
      module: M,
      section: 'rules',
      title: 'The Diocese and Bread',
      summary: 'One city per player becomes a Diocese: a point, Bread, and the Religion track.',
      tags: ['diocese', 'bread', 'religion', 'cathedral'],
      body: `Once a game you may turn one of your cities into a **Diocese** for 1 grain, 1 brick and 1 lumber. You can also turn a settlement straight into one by paying for the city as well.

- A Diocese is worth **1 point**.
- When its city collects from a grain field, it takes 1 grain and 1 **Bread** instead of 2 grain.
- You need a Diocese to improve Religion or draw Religion cards. Without one, a Religion gate gives you nothing.

If your Diocese's city is lost to the barbarians, the Diocese goes with it and you may found a new one later.`,
    },
    {
      id: 'church-beer',
      module: M,
      section: 'rules',
      title: 'Beer and festivals',
      summary: 'The Abbey brews Beer; Beer buys festivals that stop a rival piece for a round.',
      tags: ['beer', 'abbey', 'festival', 'party'],
      body: `At Religion level 3 (the **Abbey**), you brew 1 **Beer** whenever a roll brings you nothing. If you have the Aqueduct too, you pick a resource or a Beer instead.

The bank takes Beer for any card at 4:1 (3:1 with a 3:1 harbor), but it never sells Beer.

On your turn you may hold one **festival**: put a chip on a rival's piece and pay Beer for it.

- Road or ship: 2 Beer. It no longer counts for the longest route, and its owner can not build on from it.
- Knight: 3 Beer. It has no strength and can not act.
- Settlement: 4 Beer. City: 5 Beer (not a metropolis). It produces nothing and its points do not count.

The festival ends when your next turn begins.`,
    },
    {
      id: 'church-dice',
      module: M,
      section: 'rules',
      title: 'The ten-sided event die',
      summary: 'Five ships, four gates and a joker.',
      tags: ['joker', 'event die', 'gate', 'ship'],
      body: `This expansion's event die has ten faces: five barbarian ships, a gate for each of Science, Trade, Politics and Religion, and a **joker**.

When the joker comes up, the player who rolled picks which gate opens. Everyone then draws from that deck as usual, if their improvements reach the red die.`,
    },
    {
      id: 'church-cards',
      module: M,
      section: 'cards',
      title: 'Religion cards',
      summary: 'Seventeen cards that bless you and trouble everyone else.',
      tags: ['religion', 'progress', 'lent', 'anathema', 'inquisitor', 'census'],
      body: `The Religion deck has seventeen cards (eighteen with Witches, Wizards & Dragons). You need a Diocese to draw them.

- **Lent** and **Anathema** leave a player owing cards. They pay on their own turn, a card at a time, from the buttons under their build options.
- The **Inquisitor** stays on its city until another Inquisitor card moves it, or Exile sends it away.

See the card list for every card.`,
    },
  ],
};
