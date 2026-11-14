import type { CardGlossaryEntry, RulebookModule } from './types.ts';

const M = 'witches';

function card(id: string, name: string, text: string): CardGlossaryEntry {
  return { id, module: M, deck: 'magic', name, text };
}

const CARDS: CardGlossaryEntry[] = [
  card(
    'lightning',
    'Lightning',
    'Turn any field into desert. Its number stays where it is and can still be swapped.',
  ),
  card(
    'greatDragon',
    'Great Dragon',
    'Take the top city improvement of one track from a rival and build it yourself. You need the level just below theirs, and a finished metropolis (level 5) is safe. The metropolis moves with level 4.',
  ),
  card('starFavor', 'Star Favor', 'Swap any two numbers, even 6 and 8 or 2 and 12.'),
  card(
    'witchSpell',
    'Witch’s Spell',
    'All knights of one player stand down, and they can’t switch any on until three turns have passed.',
  ),
  card(
    'smallDragon',
    'Small Dragon',
    'When a 7 makes you discard, play it to keep four cards more than usual. Not your turn needed.',
  ),
  card(
    'magicFortune',
    'Magic Fortune',
    'Your next settlement this turn costs two of its cards less (you pick which two).',
  ),
  card(
    'magicMove',
    'Magic Move',
    'Move one of your settlements or cities (with its wall, metropolis, Diocese or Citadel) to a free spot on your roads that keeps the distance rule.',
  ),
  card(
    'magicCurrent',
    'Magic Current',
    'Move the barbarian ship two steps forward or back. Forward can bring it in at once.',
  ),
  card(
    'unicornDance',
    'Unicorn Dance',
    'Before you roll: pick what the event die shows. Then roll the other dice (or use an Alchemist).',
  ),
  card(
    'enchantedLand',
    'Enchanted Land',
    'Swap any two land fields, numbers and all. The robber and other figures stay where they are.',
  ),
  card('whiteMagic', 'White Magic', '1 point, shown as soon as you draw it.'),
  card('natureSpell', 'Nature Spell', 'Take any three resources (not commodities).'),
  card(
    'wizard',
    'Wizard',
    'Put the Wizard at one of your settlements or cities (not a Diocese), or move it there. The robber can’t stop it producing or take cards through it. Whoever placed the Wizard has 1 point for it.',
  ),
  card(
    'magicFormula',
    'Magic Formula',
    'Every other player gives you a progress card of their choice. Keep one; the rest go back under their decks.',
  ),
  card(
    'magicPower',
    'Magic Power',
    'Your active knights count double in the next attack. Before or after your roll, or when the ship lands.',
  ),
  card(
    'magicVeto',
    'Magic Veto',
    'Turn away a card aimed at you alone (not the Indulgence, Alchemist, Bishop, Magic Current, Unicorn Dance or Magic Power). Or play it when the ship lands to keep your cities from the barbarians.',
  ),
];

export const witchesRules: RulebookModule = {
  module: M,
  name: 'Witches, Wizards & Dragons',
  cards: CARDS,
  items: {
    citadel: {
      name: 'Citadel',
      note: 'One of your cities, once a game (a settlement pays for the city as well, less 1 ore). 1 point; its city makes Crystal in place of a second brick; opens Magic.',
    },
  },
  names: {
    citadel: { name: 'Citadel', icon: '🏰' },
    crystal: { name: 'Crystal', icon: '💎' },
    magic: { name: 'Magic', icon: '🟣' },
    lightning: { name: 'Lightning', icon: '⚡' },
    greatDragon: { name: 'Great Dragon', icon: '🐉' },
    starFavor: { name: 'Star Favor', icon: '🌠' },
    witchSpell: { name: 'Witch’s Spell', icon: '🧹' },
    smallDragon: { name: 'Small Dragon', icon: '🦎' },
    magicFortune: { name: 'Magic Fortune', icon: '🍀' },
    magicMove: { name: 'Magic Move', icon: '🌀' },
    magicCurrent: { name: 'Magic Current', icon: '🌊' },
    unicornDance: { name: 'Unicorn Dance', icon: '🦄' },
    enchantedLand: { name: 'Enchanted Land', icon: '🗺️' },
    whiteMagic: { name: 'White Magic', icon: '⭐' },
    natureSpell: { name: 'Nature Spell', icon: '🌿' },
    wizard: { name: 'Wizard', icon: '🧙' },
    magicFormula: { name: 'Magic Formula', icon: '📜' },
    magicPower: { name: 'Magic Power', icon: '✨' },
    magicVeto: { name: 'Magic Veto', icon: '🛑' },
  },
  pages: [
    {
      id: 'witches',
      module: M,
      section: 'map',
      title: 'Witches, Wizards & Dragons',
      summary: 'A Magic track, Citadels, Crystal, the Wizard and a 15-point game.',
      tags: ['witches', 'wizards', 'dragons', 'magic', 'hzd', 'crystal', 'citadel'],
      body: `A fan expansion for Cities & Knights. It plays on its own or with Church, Faith & Reformation (not with Greed, Wealth & Power, which has its own Magic track).

- A fourth improvement track, **Magic**, paid for with **Crystal**. Its level 3, the **Magic Kitchen**, swaps brick 1:1 for any other resource on your turn, as often as you like.
- Each player may make one city a **Citadel**. Only a Citadel opens Magic.
- The **Magic deck** has eighteen cards, among them the **Wizard** and **Magic Veto**.
- The event die has ten faces: five ships, a gate for each of the four tracks, and a **joker**.
- You may hold five progress cards. Once you have level 4 in Science or Magic (or Religion, with Church, Faith & Reformation), the others stop at level 3.

The first to {setting:vpTarget} points wins.`,
    },
    {
      id: 'witches-citadel',
      module: M,
      section: 'rules',
      title: 'The Citadel and Crystal',
      summary: 'One city per player becomes a Citadel: a point, Crystal, and the Magic track.',
      tags: ['citadel', 'crystal', 'magic', 'kitchen'],
      body: `Once a game you may turn one of your cities into a **Citadel** for 1 ore and 2 brick. Straight from a settlement it costs 3 ore, 2 grain and 2 brick.

- A Citadel is worth **1 point**.
- When its city collects from hills, it takes 1 brick and 1 **Crystal** instead of 2 brick.
- You need a Citadel to improve Magic or take Magic cards. Without one, a Magic gate gives you nothing.

If your Citadel's city is lost to the barbarians, the Citadel goes with it and you may found a new one later. The Inquisitor can't stand at a Citadel, and a city with the Inquisitor can't become one.`,
    },
    {
      id: 'witches-wizard',
      module: M,
      section: 'rules',
      title: 'The Wizard',
      summary: 'A figure that guards one building from the robber, worth a point.',
      tags: ['wizard', 'robber', 'inquisitor'],
      body: `The Wizard comes into play with one of the three Wizard cards. Put it at one of your settlements or cities (not a Diocese). Another Wizard card moves it.

- That building produces even when the robber stands next to it, and nobody can take a card from you through it.
- Whoever placed the Wizard scores **1 point** while it stays.
- It leaves the board if its building is lost, if the city becomes a Diocese, or if the Inquisitor comes to it. Exile sends it away too.`,
    },
    {
      id: 'witches-timing',
      module: M,
      section: 'rules',
      title: 'Cards out of turn',
      summary: 'When the ship lands, on a 7, and when a card is aimed at you.',
      tags: ['veto', 'magic power', 'refuge', 'small dragon', 'out of turn', 'barbarians'],
      body: `A few cards are played when something happens, on anyone's turn:

- **When the ship lands**: Magic Power doubles your knights, Magic Veto keeps your cities safe (and, with Church, Faith & Reformation, Refuge does too). The attack waits until each holder plays or lets it come.
- **On a 7**: Small Dragon lets you keep four cards more.
- **When a card is aimed at you alone**: Magic Veto turns it away. You are asked before the card is worked out.`,
    },
    {
      id: 'witches-cards',
      module: M,
      section: 'cards',
      title: 'Magic cards',
      summary: 'Eighteen cards of weather, dragons and spells.',
      tags: ['magic', 'progress', 'lightning', 'dragon', 'wizard', 'veto'],
      body: `The Magic deck has eighteen cards. You need a Citadel to draw them.

- **Lightning**, **Star Favor**, **Enchanted Land**, **Magic Move** and the **Wizard** ask you to tap the board.
- **Magic Current** can bring the barbarians in at once: the attack is worked out on the spot.

See the card list for every card.`,
    },
  ],
};
