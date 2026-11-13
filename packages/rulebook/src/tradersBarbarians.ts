import type { RulebookModule } from './types.ts';

export const tradersBarbariansRules: RulebookModule = {
  module: 'traders-barbarians',
  name: 'Traders & Barbarians',
  cards: [],
  names: {
    shoal: { name: 'Fishing ground', icon: '🐟' },
    fishingLake: { name: 'Fishing lake', icon: '🎣' },
    swamp: { name: 'Swamp', icon: '🪷' },
    oasis: { name: 'Oasis', icon: '🌴' },
    castle: { name: 'Castle', icon: '🏰' },
    quarry: { name: 'Quarry', icon: '⛏️' },
    glassworks: { name: 'Glassworks', icon: '🏭' },
    swiftJourney: { name: 'Swift Journey', icon: '🐎' },
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
      tags: [
        'traders',
        'barbarians',
        'scenario',
        'fishermen',
        'rivers',
        'caravans',
        'barbarian attack',
      ],
      body: `Traders & Barbarians is a set of small scenarios. Each one keeps the base game and adds one idea. Pick one under **Traders & Barbarians** when you choose the map.

- **Fishermen**: fishing grounds and a lake pay fish, which buy small favours.
- **Rivers**: rivers cross the island, bridges cost extra, and gold decides who gains or loses points.
- **Caravans**: camels leave an oasis; everyone votes on where they go.
- **Barbarian Attack**: barbarians land on the coast; knights from the castle fight them.
- **Traders & Barbarians**: wagons carry goods between the castle, the quarry and the glassworks.

These scenarios use the base game only, so Cities & Knights is switched off for them. The house rules (and the Harbormaster bonus) still work.`,
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
    {
      id: 'caravans',
      module: 'traders-barbarians',
      section: 'rules',
      title: 'Caravans',
      summary:
        'Vote with wool and grain on where camels go; camels double roads and reward buildings.',
      tags: ['caravan', 'camel', 'oasis', 'vote', 'wool', 'grain'],
      body: `**The board**

The oasis sits in the middle of the island in place of the desert, and the robber starts there. Three caravans set out from every other corner of the oasis.

**When a camel moves**

At the start of each new round, if anyone built a settlement or a city during the last round, everyone votes on one new camel. (Only one camel per round, however much was built.)

- Starting with the player whose turn it is, each player picks a path and may put up to **3** wool and grain on it as votes. Cards you bid are spent, win or lose. You may also bid nothing.
- The path with the most votes gets the camel. On a tie, the path chosen by the first voter wins if it is among the tied ones.
- A camel always goes one step on from the head of a caravan. Caravans never loop back on themselves. If a caravan reaches another one, they join and it stops there.
- There are **22** camels in all.

**What camels do**

- A road with a camel on it counts as **two** roads for Longest Road.
- A settlement or city with camels on two or more of its paths is worth **1 extra point**.
- You need **2 more points** to win than usual (12 with the default target).`,
    },
    {
      id: 'barbarian-attack',
      module: 'traders-barbarians',
      section: 'rules',
      title: 'Barbarian Attack',
      summary:
        'Barbarians land on the coast and take hexes; knights fight them for prisoners and gold.',
      tags: [
        'barbarian',
        'barbarians',
        'knight',
        'knights',
        'castle',
        'prisoner',
        'prisoners',
        'gold',
        'conquered',
      ],
      body: `**The board**

A castle stands in the middle of the island. There is **no robber** and **no Largest Army**. Your second starting settlement goes down as a **city**. One barbarian already waits on the coastal hex with the 2 and one on the 12.

**Barbarians land**

Each time anyone builds a settlement or a city, the barbarians roll for three different numbers (never 7). One barbarian lands on every coastal hex showing one of those numbers.

- A hex with **3** barbarians is **held**. It produces nothing, nobody can build on its paths or corners, and no more barbarians land there.
- A settlement or city that touches only held land is cut off: it is worth no points and its harbor can't be used until the land is freed.
- A 7 still makes big hands discard, but nothing else happens.

**Knights**

- Playing a **Knight** card puts one of your knights on a free path leading away from the castle (you have **6**). It doesn't move a robber or count for Largest Army.
- On your turn, each knight may move once: up to **3** steps along the paths, or up to **5** for 1 grain. Knights pass over anything, but must stop on a free path that isn't one of the castle's own sides.

**Fights**

At the end of each turn, knights on the six paths around a hex fight the barbarians there if the knights outnumber them.

- The barbarians are captured. Every player with a knight there takes one prisoner while they last, and the player with the most knights there takes any left over (a tie is settled by a roll; the others tied get 3 gold). A player left without a prisoner gets 3 gold.
- Then a die picks one direction of path. Your knights on those paths of the hex are lost, and you get **3 gold** for each.
- Every **2 prisoners** are worth **1 point**.

**Gold**

2 gold buys one resource from the bank, up to twice a turn.

This is our own version of the scenario: Knight cards stand in for the box's own development cards, and new knights start just outside the castle.`,
    },
    {
      id: 'traders-main',
      module: 'traders-barbarians',
      section: 'rules',
      title: 'Traders & Barbarians (main scenario)',
      summary: 'Drive your wagon between three trade hexes, delivering goods for gold and points.',
      tags: [
        'wagon',
        'trade',
        'castle',
        'quarry',
        'glassworks',
        'glass',
        'marble',
        'sand',
        'tools',
        'toll',
        'swift journey',
      ],
      body: `**The board**

Three trade hexes sit on the coast: the **castle** 🏰, the **quarry** ⛏️ and the **glassworks** 🏭. They don't produce, and the 2 and 12 are left out. There is **no robber** and **no Longest Road**. Three barbarians stand on inland paths. Everyone starts with **5 gold**, and your second starting settlement goes down as a **city** with your wagon on it.

**Moving your wagon**

Your wagon goes from corner to corner along the paths. Each turn it has moves to spend (4 to start):

- A path with no road takes **2** moves. A road takes **1**. On someone else's road you also pay them **1 gold**.
- A barbarian on the path adds **2** more moves.
- Once a turn you can pay **1 grain** for 2 more moves. Moves you don't use are lost.

**Goods**

Each trade hex has a face-down stack of goods. The first time your wagon reaches a corner of any trade hex, you load the top one. Then take it where it belongs:

- 🔮 Glass and 🪨 marble go to the **castle**.
- 🔨 Tools go to the **quarry**.
- ⏳ Sand goes to the **glassworks**.

When you deliver, it's worth **1 point** and gold (1 to 5, by your wagon's level), and you load the next one from the stack there. Loading or delivering ends the wagon's moves for the turn. You carry one load at a time.

**Upgrading the wagon**

| Level | Moves | Gold a delivery | Drive off a barbarian on | Upgrade cost |
|---|---|---|---|---|
| 1 | 4 | 1 | – | – |
| 2 | 5 | 2 | 6 | 1 lumber, 1 wool, 1 ore |
| 3 | 6 | 3 | 5–6 | 1 lumber, 1 wool, 1 ore, 1 grain |
| 4 | 7 | 4 | 4–6 | 1 lumber, 2 wool, 2 ore |
| 5 | 8 | 5 | 3–6 | 2 lumber, 2 wool, 2 ore |

Reaching level 5 is worth **1 point**.

**Barbarians**

- Nobody can build a road on a path with a barbarian.
- On a 7 (after discards) or a Knight card, move one barbarian to a free inland path. If it lands on someone's road, take a random card from them.
- From level 2, a wagon next to a barbarian can try to drive it off once a turn: roll a die, and on a high enough number move it to a free inland path (you take no card).

**Cards and winning**

The development deck has 25 cards: 16 Knights, 3 Road Building, 3 **Swift Journey** (your wagon gets its moves again this turn) and 3 Victory Points. 2 gold buys a resource, twice a turn. You need **13 points** to win.

This is our own version: wagons stop at any corner of a trade hex, and the wagon levels and costs are our own.`,
    },
  ],
};
