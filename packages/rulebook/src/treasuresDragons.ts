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
- **Into the Unknown**: a small home island and many tiny islands in the fog, with chests everywhere and no pirate. Everyone starts with a **third settlement** and road or ship: after the usual two rounds, a third round goes in the first round's order, and it also collects starting resources. You need 2 more points than your target (12 with the usual 10).
- **Greater Catan**: the new islands have no numbers until someone reaches them. A long game: you need 8 more points than your target (18 with the usual 10), and everyone has 4 extra cities.
- **Desert Dragons**: dragons gather in three deserts and then spread across your island. You need 3 more points than your target (13 with the usual 10).

- **Enchanted Land** (with Cities & Knights): ship one knight to a dragon-haunted island and beat 6 dragons, or reach the target (18 with the usual 10).
- **The Great Canal** (with Cities & Knights): dig a canal across your island with pairs of knights so the dry farmland grows grain again. You need 5 more points than your target, plus Cities & Knights' 3 (18 with the usual 10).`,
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
      id: 'greater-catan',
      module: 'treasures-dragons',
      section: 'rules',
      title: 'Greater Catan',
      summary: 'New islands take their numbers from a small pile, then from the home island.',
      tags: ['greater catan', 'number', 'token', 'pile', 'move number'],
      body: `The home island is numbered as usual, but the new islands have **no numbers**. Everyone has **4 extra cities** (8 in all).

**Numbering a new hex**

When you build a road or ship that touches a land hex with no number, it gets one:

- While the face-down **pile** lasts, the top number goes on it.
- Once the pile is empty, you **move a number from the home island** to it. The game shows which numbers you may take. In order, the rules are:
  1. No 6 or 8 next to another 6 or 8 on the new island.
  2. Take it from a hex next to one of **your own** settlements or cities.
  3. Every settlement or city next to that hex must keep at least one other number.

If no number keeps all three rules, the first rule is dropped, then the second, then the third.

The home island slowly empties as the game goes on, so spread out early. You need **18 points** with the usual target.

This is our own version of the scenario, on our own generated boards.`,
    },
    {
      id: 'enchanted-land',
      module: 'treasures-dragons',
      section: 'rules',
      title: 'Enchanted Land',
      summary: 'Ship a knight to the enchanted land and fight its dragons.',
      tags: ['enchanted', 'dragon', 'knight', 'cross', 'fight', 'roam'],
      body: `Played with **Cities & Knights**. A strange island (tinted purple) lies across the water. Dragons 🐉 sit on its inland corners. The dots under a dragon show the knight it takes: **one dot**, any knight; **two**, a strong or mighty knight; **three**, only a mighty knight.

**Building there**

- Settlements only on its **coast**, and they can't become cities.
- **No roads** at all on the enchanted land, and no new knights. Ships are fine.

**Crossing**

Once in the game, you may send **one active knight** across. Its corner must be joined by your roads and ships to a coastal corner of the enchanted land. Tap **Use knight**, the knight, then the glowing coastal corner. (If your own settlement stands there, your knight steps ashore beside it.) The knight never comes back.

**On the enchanted land**

- An **active** knight moves up to **3 corners** along any paths, whoever built them, and is then switched off. It can't stop on the coast.
- It can push away a **weaker** rival knight; that knight is moved to a free corner elsewhere on the island.
- To fight, stop on a dragon's corner, **activate** the knight (1 grain), and on a later turn tap the knight again. If it's strong enough you take the dragon: **1 point**. If not, the knight just switches off; promote it or try another dragon.
- Beat your **6th dragon** on your turn and you win at once.

Knights on the enchanted land don't defend against the barbarians and aren't switched off by an attack. The Inventor can't move its numbers, and Deserter and Intrigue can't touch knights there.

This is our own version of the scenario, on our own generated boards.`,
    },
    {
      id: 'great-canal',
      module: 'treasures-dragons',
      section: 'rules',
      title: 'The Great Canal',
      summary: 'Dig a canal with your knights so the dry farmland grows grain again.',
      tags: ['canal', 'farmland', 'basin', 'lake', 'gold river', 'prospector', 'harbor', 'knight'],
      body: `Played with **Cities & Knights**. A drought has dried out the farmland around the **basin** in the west of your island. A canal is planned from the **mountain lake** in the east to the basin: the dashed line, with two point chips on each hex it crosses.

**Dry farmland**

The fields around the basin (cracked earth, faded numbers) produce **nothing** until the canal is finished. They still count for your starting resources, and the Irrigation card still works on them. Your home island has no other grain fields.

**Digging**

- When **two active knights** stand on corners of a marked hex, that stretch is dug at once. It doesn't matter how strong they are, and they stay active.
- Both knights yours: you take **both chips**. One each: you each take **one**. Each chip is **1 point**.
- One knight can stand next to two marked hexes, so one activation can dig two stretches.
- When only **one stretch** is left, the canal is finished: those last chips leave the game, the basin floods into a lake, and the farmland produces grain from then on.

**The small islands**

- No settlements there.
- You can raise a knight there at the end of your ships, but only beside a **gold river** or a **harbor**. It stays put.
- **Prospector:** a knight beside a gold river pans **1 resource of your choice** on every 8, until the basin floods. Two of your knights on the same river still pan one.
- **Trader:** a knight at a harbor lets you trade there as if you had a settlement.
- Knights on the small islands don't defend against the barbarians.

**Ships**

Ships can't sail on the lake, and a line of ships can't branch.

There is no pirate; the robber starts in the basin. This is our own version of the scenario, on our own generated boards. One change from the box: you don't have to start on the coast.`,
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
