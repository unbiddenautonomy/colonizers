import type { RulebookModule } from './types.ts';

export const seafarersRules: RulebookModule = {
  module: 'seafarers',
  name: 'Seafarers',
  names: {
    gold: { name: 'Gold field', icon: '✨' },
    ship: { name: 'Ship', icon: '⛵' },
    pirate: { name: 'Pirate', icon: '🏴‍☠️' },
    hidden: { name: 'Fog', icon: '🌫️' },
  },
  items: {
    ship: {
      name: 'Ship',
      note: 'Goes on an edge next to the sea and must connect to your ship, settlement or city.',
    },
  },
  pages: [
    {
      id: 'sea-overview',
      module: 'seafarers',
      section: 'rules',
      title: 'Seafarers at a glance',
      summary: 'Ships, islands, gold, the pirate. First to {setting:vpTarget} points wins.',
      tags: ['seafarers', 'islands', 'overview'],
      body: `The board is made of islands. Roads only run on land, so to reach another island you build **ships** across the sea.

- Ships cost 1 lumber and 1 wool.
- Gold fields pay any resource you like.
- The pirate sails the sea and blocks ships.
- In most scenarios your first settlement on each new island is worth **{setting:islandBonus} bonus points**.

You need **{setting:vpTarget} points** to win this scenario.`,
    },
    {
      id: 'ships',
      module: 'seafarers',
      section: 'rules',
      title: 'Building ships',
      summary: 'A ship goes on an edge next to the sea and joins your shipping line.',
      tags: ['ship', 'shipping line', 'build', 'sea'],
      body: `A ship sits on an edge with sea on at least one side. Coastal edges can take either a road or a ship.

A new ship must touch one of your settlements or cities, or the end of one of your ships.

**Roads and ships only join at a settlement or city.** A road can't continue straight into a ship, or the other way round. Build a settlement on the coast to switch from one to the other.

During setup, you can place a ship instead of a road next to a settlement on the coast.

Each player has 15 ships.`,
    },
    {
      id: 'moving-ships',
      module: 'seafarers',
      section: 'rules',
      title: 'Moving a ship',
      summary: 'Once per turn, move the ship at the open end of a line.',
      tags: ['move', 'ship', 'open'],
      body: `Once per turn, after rolling, you may move one of your ships.

- Only a ship at the **open end** of a line can move: one end must have no other ship or building of yours.
- A ship can't move on the turn it was built.
- A ship between two of your settlements is locked in place.
- The moved ship must still connect to your network, like a new ship.
- Ships next to the pirate can't move, and ships can't move next to the pirate.`,
    },
    {
      id: 'pirate',
      module: 'seafarers',
      section: 'rules',
      title: 'The pirate',
      summary: 'On a 7 or a Knight, move the robber or the pirate.',
      tags: ['pirate', 'robber', '7', 'knight', 'steal'],
      body: `Whenever you would move the robber (a 7, or a Knight card) you may move the **pirate** instead. The pirate moves to any other sea hex.

You then steal one random card from a player with a ship beside the pirate.

While the pirate sits on a hex, no ship can be built on its edges, and ships there can't move.`,
    },
    {
      id: 'gold',
      module: 'seafarers',
      section: 'rules',
      title: 'Gold fields',
      summary: 'When a gold field produces, you pick the resource.',
      tags: ['gold', 'choose', 'pick', 'production'],
      body: `A gold field produces like any other hex, but you choose what you get: **1 resource of your choice** per settlement and **2** per city.

A starting settlement next to a gold field lets you pick one resource for it.

Everyone owed gold picks before the turn goes on.`,
    },
    {
      id: 'islands',
      module: 'seafarers',
      section: 'rules',
      title: 'Island bonus',
      summary: 'Extra points for your first settlement on each new island.',
      tags: ['island', 'bonus', 'points', 'vp'],
      body: `The islands where you place your starting settlements are your home islands.

The first time you build a settlement on any other island, you get **{setting:islandBonus} bonus points**. Every player can earn the bonus on every island.

Longest Road becomes **Longest Trade Route**: roads and ships both count, as long as they join at your own settlements or cities.`,
    },
    {
      id: 'fog',
      module: 'seafarers',
      section: 'rules',
      title: 'Fog and exploring',
      summary: 'Build next to fog to turn it over and get a reward.',
      tags: ['fog', 'explore', 'hidden', 'discover'],
      body: `In fog scenarios, hexes away from your home island start face down.

When you build or move a road or ship next to a fog hex, it turns over.

- **Land**: you get one of that hex's resource.
- **Gold**: you pick one resource.
- **Sea**: nothing, but now you can sail on.

Fog hexes produce nothing until they are turned over.`,
    },
    {
      id: 'sea-dev',
      module: 'seafarers',
      section: 'rules',
      title: 'Development cards at sea',
      summary: 'Road Building can place ships too.',
      tags: ['road building', 'development', 'ships'],
      body: `**Road Building** lets you place two free pieces, roads or ships, in any mix.

**Knight** lets you move the robber or the pirate.`,
    },
    {
      id: 'tips-sea',
      module: 'seafarers',
      section: 'tips',
      title: 'Tips for Seafarers',
      summary: 'Start on the coast, and plan your first voyage early.',
      tags: ['tips', 'strategy'],
      body: `- A coastal starting settlement lets you launch ships right away.
- Wool and lumber matter more than usual, because ships need both.
- Grab island bonuses early; they can be worth more than a city.
- Gold fields are flexible: they fill whatever you are missing.`,
    },
  ],
  cards: [],
};
