import type { RulebookModule } from './types.ts';

export const tradersBarbariansRules: RulebookModule = {
  module: 'traders-barbarians',
  name: 'Traders & Barbarians',
  cards: [],
  names: {
    shoal: { name: 'Fishing ground', icon: '🐟' },
    fishingLake: { name: 'Fishing lake', icon: '🎣' },
    swamp: { name: 'Swamp', icon: '🪷' },
    river: { name: 'River', icon: '🌊' },
    bridge: { name: 'Bridge', icon: '🌉' },
  },
  pages: [
    {
      id: 'traders-barbarians',
      module: 'traders-barbarians',
      section: 'map',
      title: 'Traders & Barbarians',
      summary: 'Scenarios that add one new idea each to the base game.',
      tags: ['traders', 'barbarians', 'scenario', 'fishermen', 'rivers'],
      body: `Traders & Barbarians is a set of small scenarios. Each one keeps the base game and adds one idea. Pick one under **Traders & Barbarians** when you choose the map.

- **Fishermen**: fishing grounds and a lake pay fish, which buy small favours.
- **Rivers**: rivers cross the island, bridges cost extra, and gold decides who gains or loses points.

These scenarios use the base game only, so Cities & Knights is switched off for them. The house rules (and the Harbormaster bonus) still work. More scenarios from the box will follow.`,
    },
    {
      id: 'fishermen',
      module: 'traders-barbarians',
      section: 'rules',
      title: 'Fishermen',
      summary: 'Fishing grounds and a lake pay fish tokens; spend fish on favours.',
      tags: ['fish', 'fishing', 'shoal', 'lake', 'old boot', 'boot', 'tokens'],
      body: `**Where fish come from**

- Fishing grounds sit in the sea along the coast, each with a number. The desert is replaced by a fishing lake that pays on 2, 3, 11 and 12. (With two lakes, one pays on 2 and 12, the other on 3 and 11.)
- When a number comes up, every settlement touching that fishing ground or lake draws **1 fish token**, and every city draws **2**. The player whose turn it is draws first.
- Your second starting settlement draws 1 token if it touches a fishing ground or lake.
- The robber can sit on the lake (and stops it paying), but never on a fishing ground. It starts the game beside the board.
- A token shows 1, 2 or 3 fish. Other players only see how many tokens you hold, not their value.
- You can hold up to **7** tokens. Tokens you would draw beyond that stay in the pile.
- Fish are not cards: they don't count on a 7, can't be stolen and can't be traded.

**Spending fish** (on your turn)

- **2 fish**: take the robber off the board. It comes back on the next 7 or knight.
- **3 fish**: steal a random card from a player of your choice.
- **4 fish**: take one resource of your choice from the bank.
- **5 fish**: build a road for free.
- **7 fish**: take a development card for free.

The first three can be used before you roll. You hand in whole tokens and get no change, so the game picks the tokens that waste the fewest fish.

**The old boot**

One token in the pile is an old boot. Whoever draws it holds it face up, and it counts as **one point less** while they have it, so they need one more point to win. On your turn you can pass the boot to a player with as many points showing as you, or more.`,
    },
    {
      id: 'rivers',
      module: 'traders-barbarians',
      section: 'rules',
      title: 'Rivers',
      summary:
        'Rivers need bridges; building by the water pays gold; gold decides a bonus and a penalty.',
      tags: ['river', 'bridge', 'gold', 'coin', 'richest', 'poorest', 'swamp'],
      body: `**The board**

- Rivers run inland from the coast along the edges between hexes. No ordinary road can be built on a river.
- Two swamps produce nothing. The robber starts on one of them.

**Bridges**

- A bridge crosses a river edge. It costs **2 brick and 1 lumber** and must connect to your road, settlement or city.
- Each player has **3** bridges. They count toward Longest Road like roads.
- Free roads (from Road Building or fish) can't be bridges.

**Earning gold**

- **3 gold** for each bridge.
- **1 gold** for each road that touches a river.
- **1 gold** for each settlement built on a river corner. Upgrading to a city pays nothing.

Gold is open for everyone to see. It is not a card, so it can't be stolen, and it doesn't count on a 7.

**Spending gold**

On your turn, after rolling, pay **2 gold** for one resource of your choice. You can do this up to **2 times** a turn.

**Richest and poorest**

- The one player with the **most gold** gains **1 point**. A tie for the most means nobody has it.
- Every player tied for the **least gold** loses **2 points**. If everyone has the same, everyone loses 2.
- Both are checked all the time from the start of the first full turn, so spending gold can change them.`,
    },
  ],
};
