import type { CardGlossaryEntry, RulebookModule } from './types.ts';

const M = 'cities-knights';

function card(id: string, deck: string, name: string, text: string): CardGlossaryEntry {
  return { id, module: M, deck, name, text };
}

const CARDS: CardGlossaryEntry[] = [
  // Science (green)
  card(
    'alchemist',
    'science',
    'Alchemist',
    'Play instead of rolling. You choose what the red and yellow dice show; the event die is still rolled.',
  ),
  card(
    'crane',
    'science',
    'Crane',
    'Your next city improvement this turn costs one commodity less.',
  ),
  card('engineer', 'science', 'Engineer', 'Build one city wall for free.'),
  card(
    'inventor',
    'science',
    'Inventor',
    'Swap the numbers on two hexes. 2, 12, 6 and 8 can not be moved.',
  ),
  card(
    'irrigation',
    'science',
    'Irrigation',
    'Take 2 grain for every fields hex next to your settlements and cities.',
  ),
  card(
    'medicine',
    'science',
    'Medicine',
    'Upgrade a settlement to a city for just 2 ore and 1 grain.',
  ),
  card(
    'mining',
    'science',
    'Mining',
    'Take 2 ore for every mountains hex next to your settlements and cities.',
  ),
  card(
    'printer',
    'science',
    'Printer',
    'One victory point. Shown and scored as soon as you draw it.',
  ),
  card(
    'roadBuilding',
    'science',
    'Road Building',
    'Place two roads for free (or ships, with Seafarers).',
  ),
  card(
    'smith',
    'science',
    'Smith',
    'Promote up to two of your knights for free. Mighty knights still need the fortress.',
  ),
  // Trade (yellow)
  card(
    'commercialHarbor',
    'trade',
    'Commercial Harbor',
    'Give each other player one of your resources. Each who holds a commodity picks one to give you back.',
  ),
  card(
    'masterMerchant',
    'trade',
    'Master Merchant',
    'Look at the hand of a player with more points than you and take two cards of your choice.',
  ),
  card(
    'merchant',
    'trade',
    'Merchant',
    'Put the merchant on a land hex next to your settlement or city. While it is yours, trade that hex’s resource 2:1 and score 1 point.',
  ),
  card(
    'merchantFleet',
    'trade',
    'Merchant Fleet',
    'For the rest of your turn, trade one resource or commodity of your choice 2:1 with the bank.',
  ),
  card(
    'resourceMonopoly',
    'trade',
    'Resource Monopoly',
    'Name a resource. Every other player gives you up to 2 of it.',
  ),
  card(
    'tradeMonopoly',
    'trade',
    'Trade Monopoly',
    'Name a commodity. Every other player gives you 1 of it.',
  ),
  // Politics (blue)
  card(
    'bishop',
    'politics',
    'Bishop',
    'Move the robber and take one random card from every player with a building beside it.',
  ),
  card(
    'constitution',
    'politics',
    'Constitution',
    'One victory point. Shown and scored as soon as you draw it.',
  ),
  card(
    'deserter',
    'politics',
    'Deserter',
    'Another player removes one of their knights. You may place a knight of the same strength for free.',
  ),
  card(
    'diplomat',
    'politics',
    'Diplomat',
    'Remove any open road (one end touches nothing else of its owner). If it was yours, you may place it again.',
  ),
  card(
    'intrigue',
    'politics',
    'Intrigue',
    'Push away a rival knight that stands on one of your roads.',
  ),
  card(
    'saboteur',
    'politics',
    'Saboteur',
    'Every player with as many points as you or more discards half their hand.',
  ),
  card('spy', 'politics', 'Spy', 'Look at another player’s progress cards and take one.'),
  card('warlord', 'politics', 'Warlord', 'Activate all of your knights for free.'),
  card(
    'wedding',
    'politics',
    'Wedding',
    'Every player with more points than you gives you two cards of their choice.',
  ),
];

export const citiesKnightsRules: RulebookModule = {
  module: M,
  name: 'Cities & Knights',
  names: {
    paper: { name: 'Paper', icon: '📜' },
    cloth: { name: 'Cloth', icon: '🧵' },
    coin: { name: 'Coin', icon: '🪙' },
    knight1: { name: 'Basic knight', icon: '🛡️' },
    knight2: { name: 'Strong knight', icon: '🛡️' },
    knight3: { name: 'Mighty knight', icon: '🛡️' },
    wall: { name: 'City wall', icon: '🧱' },
    merchant: { name: 'Merchant', icon: '🧑‍💼' },
    alchemist: { name: 'Alchemist', icon: '⚗️' },
    crane: { name: 'Crane', icon: '🏗️' },
    engineer: { name: 'Engineer', icon: '📐' },
    inventor: { name: 'Inventor', icon: '💡' },
    irrigation: { name: 'Irrigation', icon: '💧' },
    medicine: { name: 'Medicine', icon: '💊' },
    mining: { name: 'Mining', icon: '⛏️' },
    printer: { name: 'Printer', icon: '🖨️' },
    smith: { name: 'Smith', icon: '⚒️' },
    commercialHarbor: { name: 'Commercial Harbor', icon: '⚓' },
    masterMerchant: { name: 'Master Merchant', icon: '🎩' },
    merchantFleet: { name: 'Merchant Fleet', icon: '🚢' },
    resourceMonopoly: { name: 'Resource Monopoly', icon: '💰' },
    tradeMonopoly: { name: 'Trade Monopoly', icon: '🏦' },
    bishop: { name: 'Bishop', icon: '⛪' },
    constitution: { name: 'Constitution', icon: '📜' },
    deserter: { name: 'Deserter', icon: '🏃' },
    diplomat: { name: 'Diplomat', icon: '🤝' },
    intrigue: { name: 'Intrigue', icon: '🗝️' },
    saboteur: { name: 'Saboteur', icon: '💣' },
    spy: { name: 'Spy', icon: '🕵️' },
    warlord: { name: 'Warlord', icon: '🎖️' },
    wedding: { name: 'Wedding', icon: '💍' },
  },
  items: {
    knight: {
      name: 'Knight',
      note: 'A basic knight on an empty corner of your roads. Starts inactive.',
    },
    activate: { name: 'Activate a knight', note: 'An active knight defends, moves and attacks.' },
    promote: {
      name: 'Promote a knight',
      note: 'Basic → strong → mighty (mighty needs politics level 3).',
    },
    wall: { name: 'City wall', note: 'Around one of your cities. +2 to your hand limit. Up to 3.' },
  },
  pages: [
    {
      id: 'ck-overview',
      module: M,
      section: 'rules',
      title: 'Cities & Knights at a glance',
      summary:
        'Commodities, city improvements, knights and barbarians. First to {setting:vpTarget} wins.',
      tags: ['cities', 'knights', 'overview', 'expansion'],
      body: `Cities matter more: they make **commodities** that pay for **city improvements**. A barbarian ship sails toward the island, and your **knights** must hold it off.

- You start with one settlement and one **city** (your second placement).
- Development cards are replaced by **progress cards**, drawn with the event die.
- The robber stays on the desert until the barbarians first attack.
- You need **{setting:vpTarget} points** to win.`,
    },
    {
      id: 'ck-dice',
      module: M,
      section: 'rules',
      title: 'Three dice',
      summary:
        'Red and yellow decide production. The event die moves the barbarians or opens a gate.',
      tags: ['dice', 'event die', 'roll', 'gate'],
      body: `Every roll uses three dice. The **red** and **yellow** dice add up for production, just like before.

The **event die** is worked out first:
- **Ship** (3 faces): the barbarian ship sails one step closer.
- **Green, yellow or blue gate**: everyone with an improvement level of at least 1 in that colour checks the red die. You draw a progress card of that colour if the red die is no higher than your level + 1. Level 1 draws on 1–2, level 5 on anything.`,
    },
    {
      id: 'commodities',
      module: M,
      section: 'rules',
      title: 'Commodities',
      summary: 'Cities on forest, pasture and mountains make paper, cloth and coin.',
      tags: ['paper', 'cloth', 'coin', 'commodity', 'production', 'city'],
      body: `A city next to a producing hex usually takes 2 resources. On three kinds of hex it takes 1 resource and 1 **commodity** instead:

- Forest: 1 lumber + 1 **paper** 📜
- Pasture: 1 wool + 1 **cloth** 🧵
- Mountains: 1 ore + 1 **coin** 🪙

Settlements never make commodities. Commodities count toward your hand limit, can be traded with the bank and other players, and can be stolen.`,
    },
    {
      id: 'improvements',
      module: M,
      section: 'rules',
      title: 'City improvements',
      summary: 'Three tracks of five levels, paid for with commodities.',
      tags: [
        'improvement',
        'science',
        'trade',
        'politics',
        'level',
        'aqueduct',
        'fortress',
        'trading house',
      ],
      body: `There are three tracks. Each level costs as many commodities as the level number (level 1 costs 1, level 5 costs 5). You need at least one city to improve.

- **Science** (green) is paid with paper.
- **Trade** (yellow) is paid with cloth.
- **Politics** (blue) is paid with coin.

**Level 3 abilities**
- Science, the **aqueduct**: when a roll (not a 7) gives you nothing, take any one resource.
- Trade, the **trading house**: trade commodities with the bank at 2:1.
- Politics, the **fortress**: you can promote strong knights to mighty knights.

Higher levels also mean more progress cards, because the event die gate covers more red numbers.`,
    },
    {
      id: 'metropolis',
      module: M,
      section: 'rules',
      title: 'Metropolises',
      summary: 'First to level 4 in a track gets its metropolis: +2 points.',
      tags: ['metropolis', 'points', 'improvement'],
      body: `The first player to reach **level 4** in a track puts that track's metropolis on one of their cities. It is worth **2 more points** (a metropolis city scores 4) and the barbarians can't harm it.

Someone else can take it away only by reaching **level 5** in that track while the holder is still below 5. Each city holds at most one metropolis, so you need a city without one to claim another.`,
    },
    {
      id: 'knights',
      module: M,
      section: 'rules',
      title: 'Knights',
      summary: 'Raise, activate and promote knights. Active knights defend and act.',
      tags: ['knight', 'activate', 'promote', 'strength', 'mighty', 'strong', 'basic'],
      body: `- **Raise** a basic knight (1 wool, 1 ore) on an empty corner touching your road. It starts **inactive**.
- **Activate** it with 1 grain. Only active knights count against the barbarians.
- **Promote** it (1 wool, 1 ore): basic (strength 1) → strong (2) → mighty (3). Mighty knights need politics level 3. Each knight can be promoted once per turn.

You have 2 knights of each strength. A knight blocks rival roads like a settlement does, but it does not stop settlements nearby (the distance rule only counts buildings). Nobody can build a settlement on a corner where a knight stands.`,
    },
    {
      id: 'knight-actions',
      module: M,
      section: 'rules',
      title: 'What active knights do',
      summary:
        'Move, push away weaker knights, or chase the robber. Each makes the knight inactive.',
      tags: ['move knight', 'displace', 'chase', 'robber', 'knight'],
      body: `An active knight that was not activated this turn can do one of these. Afterwards it is inactive again until you pay another grain.

- **Move** along your roads to an empty corner.
- **Push away** a weaker rival knight on a corner your roads reach. Your knight takes its place; the owner moves theirs to a free corner on their own roads, or loses it if there is none.
- **Chase the robber** if it stands next to the robber's hex. You move the robber and steal as after a 7.`,
    },
    {
      id: 'barbarians',
      module: M,
      section: 'rules',
      title: 'The barbarians',
      summary: 'When the ship lands, all cities are compared with all active knights.',
      tags: ['barbarians', 'attack', 'defender', 'pillage', 'ship'],
      body: `The ship moves one step each time the event die shows it. After {setting:barbarianTrack} steps it lands:

- **Barbarian strength** = number of cities on the board (metropolises count).
- **Defense** = total strength of all active knights.

**If the knights hold**, the player with the strongest active knights alone becomes a **Defender** and gets 1 point. If several tie, each draws a progress card from a deck of their choice.

**If the barbarians win**, the player (or players) with the weakest active knights each lose a city: it drops back to a settlement and its wall is torn down. Metropolises are safe, and players without a plain city are skipped.

Either way, every knight becomes inactive and the ship sails back to the start. The first attack also wakes the robber.`,
    },
    {
      id: 'progress-cards',
      module: M,
      section: 'cards',
      title: 'Progress cards',
      summary: 'Three decks drawn by the event die. Play any number on your turn after rolling.',
      tags: ['progress', 'cards', 'science', 'trade', 'politics', 'hand'],
      body: `Progress cards replace development cards. You draw them when the event die shows a gate (see Three dice).

- Play as many as you like on your turn after rolling, even the turn you draw them. The **Alchemist** is played instead of rolling.
- Played cards go back under their deck, so the decks never run dry for long.
- Point cards (**Printer**, **Constitution**) are shown and scored as soon as you draw them.
- You can hold up to **4** progress cards (point cards don't count). If you draw a 5th, you still take it, then put one of your choice back under its deck.`,
    },
    {
      id: 'walls',
      module: M,
      section: 'rules',
      title: 'City walls',
      summary: 'Each wall raises your hand limit by 2. Up to 3 walls.',
      tags: ['wall', 'hand limit', 'discard', '7'],
      body: `A city wall costs 2 brick and goes around one of your cities. Each wall lets you hold **2 more cards** before a 7 makes you discard. You can have up to 3. If the barbarians pillage a city, its wall goes too.`,
    },
    {
      id: 'merchant',
      module: M,
      section: 'rules',
      title: 'The merchant',
      summary: 'Placed by a Merchant card: 2:1 trades for that hex and 1 point.',
      tags: ['merchant', 'trade', 'point'],
      body: `There is one merchant. Playing a **Merchant** card puts it on a land hex next to your settlement or city. While it is yours you trade that hex's resource 2:1 with the bank and score 1 point. Another Merchant card moves it, and its point, to the new owner.`,
    },
    {
      id: 'ck-vs-base',
      module: M,
      section: 'rules',
      title: 'What changes from the base game',
      summary: 'Starting city, no development cards, sleepy robber, 13 points.',
      tags: ['changes', 'differences', 'setup', 'robber'],
      body: `- Your second starting placement is a **city**. It collects one resource per neighbouring hex.
- No development cards and no Largest Army.
- The robber stays put on 7s until the first barbarian attack. Players still discard on a 7.
- Commodities count toward the hand limit.
- With Seafarers, ships, the pirate, gold and islands all work as usual. Knights stand on land.`,
    },
    {
      id: 'tips-ck',
      module: M,
      section: 'tips',
      title: 'Tips for Cities & Knights',
      summary: 'Build cities early, and keep some knights active before the ship lands.',
      tags: ['tips', 'strategy'],
      body: `- Cities on forest, pasture or mountains feed your improvements.
- Watch the ship: activate knights a step or two before it lands.
- A level 3 track is worth it for the ability alone; the aqueduct is a good safety net.
- Grain matters more than usual, because every knight action costs one.`,
    },
  ],
  cards: CARDS,
};
