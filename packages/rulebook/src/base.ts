import type { RulebookModule } from './types.ts';

export const baseRules: RulebookModule = {
  module: 'base',
  name: 'Base game',
  names: {
    brick: { name: 'Brick', icon: '🧱' },
    lumber: { name: 'Lumber', icon: '🌲' },
    wool: { name: 'Wool', icon: '🐑' },
    grain: { name: 'Grain', icon: '🌾' },
    ore: { name: 'Ore', icon: '🪨' },
    hills: { name: 'Hills', icon: '🧱' },
    forest: { name: 'Forest', icon: '🌲' },
    pasture: { name: 'Pasture', icon: '🐑' },
    fields: { name: 'Fields', icon: '🌾' },
    mountains: { name: 'Mountains', icon: '⛰️' },
    desert: { name: 'Desert', icon: '🏜️' },
    sea: { name: 'Sea', icon: '🌊' },
    knight: { name: 'Knight', icon: '⚔️' },
    victoryPoint: { name: 'Victory Point', icon: '⭐' },
    roadBuilding: { name: 'Road Building', icon: '🛣️' },
    yearOfPlenty: { name: 'Year of Plenty', icon: '🎁' },
    monopoly: { name: 'Monopoly', icon: '💰' },
  },
  items: {
    road: { name: 'Road', note: 'Must connect to your road, settlement or city.' },
    settlement: {
      name: 'Settlement',
      note: 'Must touch your road and keep the distance rule. 1 VP.',
    },
    city: { name: 'City', note: 'Replaces one of your settlements. Collects double. 2 VP.' },
    devCard: { name: 'Development card', note: 'Drawn face down. Play it on a later turn.' },
  },
  pages: [
    {
      id: 'goal',
      module: 'base',
      section: 'rules',
      title: 'How to win',
      summary: 'First to {setting:vpTarget} victory points on their own turn.',
      tags: ['victory', 'points', 'vp', 'win'],
      body: `The first player to reach **{setting:vpTarget} victory points** on their own turn wins.

- Settlement: 1 point
- City: 2 points
- Longest Road: 2 points
- Largest Army: 2 points
- Victory Point card: 1 point each, kept secret until you win

If you reach the target on someone else's turn, you win as soon as your own turn starts.`,
    },
    {
      id: 'setup',
      module: 'base',
      section: 'rules',
      title: 'Setting up',
      summary: 'Everyone places two settlements and two roads, in snake order.',
      tags: ['start', 'snake', 'starting resources'],
      body: `Players take turns placing one settlement and one road touching it. The first round goes in seat order. The second round goes backwards, so the last player places twice in a row.

After placing your **second** settlement, you collect one card for each terrain hex it touches.

The distance rule applies from the very first settlement.`,
    },
    {
      id: 'distance-rule',
      module: 'base',
      section: 'rules',
      title: 'Distance rule',
      summary: 'No settlement or city right next to another one.',
      tags: ['too close', 'settlement', 'spacing'],
      body: `A settlement can't go on a corner if any of the three neighbouring corners already has a settlement or city, yours or anyone else's.

This keeps at least one empty corner between every two buildings.`,
    },
    {
      id: 'turn',
      module: 'base',
      section: 'rules',
      title: 'Your turn',
      summary: 'Roll, collect, then trade and build in any order.',
      tags: ['roll', 'dice', 'order'],
      body: `1. **Roll** the dice. You may play a Knight before rolling.
2. **Everyone collects** from hexes showing the rolled number.
3. **Trade and build** in any order: trade with players or the bank, build, buy development cards, and play at most one development card.
4. **End your turn.**`,
    },
    {
      id: 'production',
      module: 'base',
      section: 'rules',
      title: 'Collecting resources',
      summary: 'Hexes with the rolled number pay everyone touching them.',
      tags: ['production', 'income', 'bank shortage'],
      body: `Every hex with the rolled number pays **1 card per settlement** and **2 cards per city** on its corners. The hex with the robber pays nothing.

**Bank running out:** if the bank can't pay everyone who is owed a resource, nobody gets that resource. If only one player is owed it, they get whatever is left.`,
    },
    {
      id: 'robber',
      module: 'base',
      section: 'rules',
      title: 'Rolling a 7 and the robber',
      summary: 'Big hands lose half, then the robber moves and steals.',
      tags: ['seven', '7', 'discard', 'steal', 'thief'],
      body: `When a 7 is rolled, nobody collects.

- Everyone holding more than **{setting:discardLimit} cards** discards half, rounded down.
- The roller moves the robber to a different hex. That hex stops paying until the robber leaves.
- The roller steals one random card from a player with a settlement or city on that hex.`,
    },
    {
      id: 'building',
      module: 'base',
      section: 'rules',
      title: 'Building',
      summary: 'Roads, settlements, cities and development cards.',
      tags: ['cost', 'road', 'settlement', 'city', 'supply'],
      body: `- **Road** (1 brick, 1 lumber): on an edge connected to your road, settlement or city. An opponent's building on a corner blocks your road from passing through it.
- **Settlement** (1 brick, 1 lumber, 1 wool, 1 grain): on a corner touching your road, keeping the distance rule.
- **City** (2 grain, 3 ore): replaces one of your settlements, which goes back to your supply.
- **Development card** (1 wool, 1 grain, 1 ore): drawn face down.

Each player has **15 roads, 5 settlements and 4 cities**. When they're used up, you can't build more of that piece.`,
    },
    {
      id: 'trading',
      module: 'base',
      section: 'rules',
      title: 'Trading',
      summary: 'With other players on your turn, or with the bank at 4:1.',
      tags: ['trade', 'bank', 'harbor', 'port', '4:1', '3:1', '2:1'],
      body: `On your turn you can trade with other players. Every trade must include you. You can't give cards away for nothing.

You can also trade with the bank:
- **4:1** any time: four of one resource for one of any other.
- **3:1** if you have a settlement or city on a generic harbor.
- **2:1** for one resource if you're on that resource's harbor.`,
    },
    {
      id: 'dev-cards',
      module: 'base',
      section: 'rules',
      title: 'Development cards',
      summary: 'One per turn, never the turn you bought it.',
      tags: ['knight', 'monopoly', 'year of plenty', 'road building', 'dev'],
      body: `You may play **one** development card per turn, and not one you bought this turn. A Knight can be played before you roll; the others after.

Victory Point cards are never played. They count for you secretly and are shown when someone wins.`,
    },
    {
      id: 'longest-road',
      module: 'base',
      section: 'rules',
      title: 'Longest Road',
      summary: '2 points for the longest unbroken road of {setting:longestRoadMin} or more.',
      tags: ['road', 'award', 'bonus'],
      body: `The first player with an unbroken road of at least **{setting:longestRoadMin} segments** takes the Longest Road card (2 points). Branches don't add up: only your single longest path counts.

Someone else takes it only by building a strictly longer road. An opponent's settlement on your road breaks it in two. If that leaves a tie for longest, nobody holds the card until one player is strictly ahead.`,
    },
    {
      id: 'largest-army',
      module: 'base',
      section: 'rules',
      title: 'Largest Army',
      summary: '2 points for playing the most Knights, at least {setting:largestArmyMin}.',
      tags: ['knight', 'army', 'award', 'bonus'],
      body: `The first player to play **{setting:largestArmyMin} Knights** takes the Largest Army card (2 points). Someone else takes it only by playing strictly more.`,
    },
    {
      id: 'tips-opening',
      module: 'base',
      section: 'tips',
      title: 'Tips: choosing starting spots',
      summary: 'Numbers matter more than resources early on.',
      tags: ['strategy', 'beginner'],
      body: `- The dots under each number show how often it's rolled. 6 and 8 come up most; 2 and 12 least.
- Add up the dots of the three hexes around a corner. Higher is better.
- Try to touch at least four different resources between your two settlements.
- Brick and lumber build roads and settlements early; ore and grain build cities later.`,
    },
    {
      id: 'map-terrain',
      module: 'base',
      section: 'map',
      title: 'Terrain',
      summary: 'What each hex produces.',
      tags: ['hex', 'tile', 'terrain'],
      body: `- Hills make brick 🧱
- Forest makes lumber 🌲
- Pasture makes wool 🐑
- Fields make grain 🌾
- Mountains make ore 🪨
- Desert makes nothing. The robber starts there.
- Sea surrounds the island. Harbors on the coast give better bank trades.`,
    },
  ],
  cards: [
    {
      id: 'knight',
      module: 'base',
      deck: 'dev',
      name: 'Knight',
      text: 'Move the robber and steal one card from a player on its new hex. Counts toward Largest Army. Can be played before rolling.',
    },
    {
      id: 'roadBuilding',
      module: 'base',
      deck: 'dev',
      name: 'Road Building',
      text: 'Build two roads for free.',
    },
    {
      id: 'yearOfPlenty',
      module: 'base',
      deck: 'dev',
      name: 'Year of Plenty',
      text: 'Take any two resources from the bank.',
    },
    {
      id: 'monopoly',
      module: 'base',
      deck: 'dev',
      name: 'Monopoly',
      text: 'Name a resource. Every other player gives you all of theirs.',
    },
    {
      id: 'victoryPoint',
      module: 'base',
      deck: 'dev',
      name: 'Victory Point',
      text: 'Worth 1 point. Keep it secret; it is revealed when someone wins.',
    },
  ],
};
