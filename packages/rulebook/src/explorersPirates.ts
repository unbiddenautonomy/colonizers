import type { RulebookModule } from './types.ts';

export const explorersPiratesRules: RulebookModule = {
  module: 'explorers-pirates',
  name: 'Explorers & Pirates',
  cards: [],
  items: {
    ship: { name: 'Ship', note: 'Built beside your harbor settlement. Carries settlers.' },
    harbor: { name: 'Harbor settlement', note: 'Upgrade a coastal settlement. 2 points.' },
    settler: { name: 'Settler', note: 'Goes on your harbor or a ship beside it.' },
  },
  names: {
    gold: { name: 'Gold', icon: '🪙' },
    harbor: { name: 'Harbor settlement', icon: '⚓' },
    settler: { name: 'Settler', icon: '🧑‍🌾' },
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

This is our own version of the expansion, played on our generated boards. Pirate lairs, fish and spice come next.`,
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
  ],
};
