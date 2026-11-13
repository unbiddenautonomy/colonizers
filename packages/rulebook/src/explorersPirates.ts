import type { RulebookModule } from './types.ts';

export const explorersPiratesRules: RulebookModule = {
  module: 'explorers-pirates',
  name: 'Explorers & Pirates',
  cards: [],
  items: {
    ship: { name: 'Ship', note: 'Built beside your harbor settlement. Carries settlers.' },
    harbor: { name: 'Harbor settlement', note: 'Upgrade a coastal settlement. 2 points.' },
    settler: { name: 'Settler', note: 'Goes on your harbor or a ship beside it.' },
    crew: { name: 'Crew', note: 'Goes on your harbor or a ship beside it. Storms pirate lairs.' },
  },
  names: {
    gold: { name: 'Gold', icon: '🪙' },
    harbor: { name: 'Harbor settlement', icon: '⚓' },
    settler: { name: 'Settler', icon: '🧑‍🌾' },
    crew: { name: 'Crew', icon: '⚔️' },
    lair: { name: 'Pirate lair', icon: '🏴‍☠️' },
  },
  pages: [
    {
      id: 'explorers-pirates',
      module: 'explorers-pirates',
      section: 'map',
      title: 'Explorers & Pirates',
      summary: 'Sail into the fog with settlers, found settlements, and spend gold.',
      tags: ['explorers', 'pirates', 'land ho', 'scenario', 'fog', 'gold'],
      body: `Explorers & Pirates plays differently from the base game:

- There are **no cities**, **no robber**, **no development cards**, and no Longest Road or Largest Army.
- Your coastal settlements can become **harbor settlements** ⚓, worth 2 points each.
- **Ships** carry settlers out into the fog. A ship with a settler founds a new settlement on any free coast it reaches.
- **Gold** 🪙 is money: you start with 2, and it buys resources.

**Land Ho!** is the first scenario: a home island in the middle, and fog over all the sea around it. You need 2 points fewer than the target you picked (8 with the usual 10).

**Starting out**

1. In the usual order, each player places a **harbor settlement** on the coast of the home island, and a **ship** beside it with a settler aboard.
2. In reverse order, each player places a **settlement** and a **road**. This settlement collects starting resources.

**Pirate Lairs** adds crews, pirate lairs on gold fields out in the fog, the pirate ship, and the lair mission track. You need 2 points more than the target you picked (12 with the usual 10).

This is our own version of the expansion, played on our generated boards. Fish and spice come next.`,
    },
    {
      id: 'ep-turn',
      module: 'explorers-pirates',
      section: 'rules',
      title: 'An Explorers & Pirates turn',
      summary: 'Roll, then trade and build, then sail.',
      tags: ['turn', 'sail', 'movement', 'phase', 'gold', 'nothing'],
      body: `1. **Roll** for production. Every player who gets **nothing** from a roll (other than a 7) takes **1 gold**. On a 7, anyone with more than 7 resources discards half; there is no robber.
2. **Trade and build.**
3. **Sail.** Once one of your ships sails or puts up extra sails, you can't trade or build any more this turn. You can still sail, load and unload, and found settlements.

**Trading**

- The bank trades **3:1** for anything.
- **3 of one resource** sell for **1 gold** (use Bank trade, or the gold buttons).
- **2 gold** buy **1 resource** of your choice, at most **twice a turn**.
- Gold can be traded with other players like any card, and doesn't count toward the 7-card limit.`,
    },
    {
      id: 'ep-ships',
      module: 'explorers-pirates',
      section: 'rules',
      title: 'Ships and settlers',
      summary: 'Ships sail 4 edges a turn, carry a settler, and found settlements.',
      tags: ['ship', 'settler', 'cargo', 'sail', 'harbor', 'found', 'extra sails', 'wool'],
      body: `**Building**

- **Ship** (1 lumber, 1 wool): on a sea edge beside one of your harbor settlements. You have 3.
- **Harbor settlement** (2 grain, 2 ore): replaces one of your settlements on the coast. Worth 2 points, and it still collects 1 resource per hex.
- **Settler** (1 brick, 1 lumber, 1 wool, 1 grain): onto one of your harbor settlements, or straight onto your ship beside one. You can have 2 settlers out at once.

**Sailing**

- Each ship moves up to **4 edges** a turn along the sea. Paying **1 wool** gives it **2 more** this turn.
- Ships pass each other but can't stop on an edge where another ship is.
- A ship holds one settler. A ship beside your harbor settlement can **swap cargo** with it at any time on your turn.

**Founding a settlement**

A ship with a settler, at a corner of free land, founds a **settlement** there. The usual distance rule applies, and the corner must not touch the fog. The settler becomes the settlement, and the ship goes back to your supply to be built again.

You can also build settlements with roads, as usual, but not next to the fog.`,
    },
    {
      id: 'ep-explore',
      module: 'explorers-pirates',
      section: 'rules',
      title: 'Exploring the fog',
      summary: 'A ship that touches the fog turns it over and stops.',
      tags: ['fog', 'explore', 'discover', 'hidden', 'land ho'],
      body: `When one of your ships stops on an edge whose end touches a fog hex, that hex is turned over and the ship stops for the turn.

- A land hex pays you **1 of its resource**.
- Anything else (sea, desert) pays **2 gold**.

Ships can't sail through the fog, and nobody can build roads, settlements or ships right next to it.`,
    },
    {
      id: 'pirate-lairs',
      module: 'explorers-pirates',
      section: 'rules',
      title: 'Pirate lairs and the pirate ship',
      summary: 'Crews storm lairs on the gold fields; the pirate ship moves on a 7.',
      tags: ['pirate', 'lair', 'crew', 'gold field', 'mission', 'hero', 'tribute', 'chase', '7'],
      body: `**Crews**

A crew (1 ore, 1 wool) goes on your harbor settlement or a ship beside it, like a settler. A ship holds two crews, or one settler. You can have 6 crews out at a time.

**Pirate lairs**

Every gold field out in the fog holds a pirate lair. A ship beside a lair can **land its crews** there, from any player. The **third crew** captures the lair:

- Everyone with crews there takes **2 gold** and moves **1 step** on the lair mission track.
- Each of them rolls a die and adds their crews there. The highest is the **hero** and moves 1 more step (the player who landed last wins a tie).
- All the crews go back to the supply.

Each step on the mission track is worth **1 point**. A captured gold field pays **2 gold** to each settlement or harbor settlement beside it when its number is rolled. Before that it pays nothing.

**The pirate ship**

On a 7, after discards, you move the pirate ship to a sea hex that doesn't touch the home island. If other players have ships beside it, you rob one of them: a random resource, or 1 gold if they have no resources.

- Sailing onto an edge beside the pirate costs **1 gold** in tribute, once per voyage. Without gold you must sail around it.
- A ship beside the pirate that hasn't moved this turn can **chase** it: roll a die, and on a 6 the pirate leaves the board until the next 7. The ship's turn ends either way.`,
    },
  ],
};
