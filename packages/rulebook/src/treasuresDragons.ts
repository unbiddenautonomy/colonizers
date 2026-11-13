import type { RulebookModule } from './types.ts';

export const treasuresDragonsRules: RulebookModule = {
  module: 'treasures-dragons',
  name: 'Treasures, Dragons & Adventurers',
  cards: [],
  names: {
    treasure: { name: 'Treasure chest', icon: '🧰' },
    dragon: { name: 'Dragon', icon: '🐉' },
  },
  pages: [
    {
      id: 'treasures-dragons',
      module: 'treasures-dragons',
      section: 'map',
      title: 'Treasures, Dragons & Adventurers',
      summary: 'Seafarers scenarios with treasure chests to find and dragons to fight.',
      tags: ['treasures', 'dragons', 'adventurers', 'scenario', 'treasure islands', 'unknown'],
      body: `These scenarios are played on Seafarers boards, so ships, gold fields and fog all work as usual. Pick one under **Treasures, Dragons & Adventurers** when you choose the map.

- **Treasure Islands**: fog hides the islands around your home, and treasure chests wait out at sea. 1 point for your first settlement on each new island. You need 4 more points than the target you picked (14 with the usual 10).
- **Into the Unknown**: a small home island and many tiny islands in the fog, with chests everywhere and no pirate. You need 2 more points than your target (12 with the usual 10).
- **Desert Dragons**: dragons gather in three deserts and then spread across your island. You need 3 more points than your target (13 with the usual 10).

More scenarios from this box (Greater Catan, the Great Canal and the Enchanted Land) are on the way.`,
    },
    {
      id: 'treasures',
      module: 'treasures-dragons',
      section: 'rules',
      title: 'Treasure chests',
      summary: 'Build a road or ship next to a chest to open it.',
      tags: ['treasure', 'chest', 'fog', 'explore', 'discover'],
      body: `Face-down chests 🧰 sit on corners out at sea. When you **build** a road or ship that touches a chest's corner, you open it (moving a ship doesn't count). Opening a chest gives you one of these:

- Build **2 roads or ships** for free.
- A **development card**.
- **1 grain**, **1 wool** or **1 brick** (the chest says which).
- **Any 2 resources**, or **any 1 resource**, of your choice.

A free build or a choice of resources waits until your own turn, after you roll.

**Exploring**

When your road or ship turns over a fog hex:

- Land pays 1 of its resource (gold: any 1 you like), as in Seafarers.
- An empty **sea** or **desert** hex holds a treasure from the face-down pile beside the board, while it lasts.

This is our own version: the chests are on our generated boards, and each one is decided when you open it.`,
    },
    {
      id: 'desert-dragons',
      module: 'treasures-dragons',
      section: 'rules',
      title: 'Desert Dragons',
      summary: 'Dragons gather in the deserts, then spread and block hexes, roads and towns.',
      tags: ['dragon', 'dragons', 'desert', 'knight', 'blocked'],
      body: `There is **no robber** and **no pirate**. On a 7, anyone with more than 7 cards discards half as usual, then the roller takes a random card from any other player. There is **no Largest Army**.

**The dragons gather**

After the starting settlements, every new **settlement or city** wakes dragons 🐉 in the three deserts: 3 each time with 3 players, 2 with more. They are shared out evenly. Once all **18** are awake, they attack.

**The dragons attack**

- When a number is rolled, everyone collects first. Then every hex with that number that touches a dragon (in a desert or out on the land) draws one dragon out of the deserts. A hex holds one dragon at most.
- A hex with a dragon **produces nothing**.
- A road between **two dragon hexes** is cut: it doesn't count for Longest Trade Route, and new roads can't join it.
- A settlement or city with dragons on **every side** scores no points. Dragons never go to sea, so a town on the coast is always safe.

**Fighting back**

A **Knight** card drives one dragon out of a land hex for good (not from a desert). The hex produces again from the next roll. The island across the water never sees a dragon, so getting there early pays.

This is our own version of the scenario, on our own generated boards.`,
    },
  ],
};
