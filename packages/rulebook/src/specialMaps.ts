import type { RulebookModule } from './types.ts';

export const specialMapsRules: RulebookModule = {
  module: 'special-maps',
  name: 'Special maps',
  cards: [],
  names: {
    volcano: { name: 'Volcano', icon: '🌋' },
    lake: { name: 'Lake', icon: '💧' },
  },
  pages: [
    {
      id: 'special-maps',
      module: 'special-maps',
      section: 'map',
      title: 'Special maps',
      summary: 'Our own board layouts. Each seed gives a new board with the same character.',
      tags: [
        'map',
        'gold rush',
        'volcano',
        'deep forest',
        'lakes',
        'diamond',
        'twirl',
        'ring',
        'mini',
      ],
      body: `Special maps change the shape or mix of the board. They are built fresh from the game's seed every time.

- **Gold Rush**: gold fields fill the middle. Each pays any resource you like.
- **Volcano**: volcanoes replace the desert. See the volcano page.
- **Deep Forest**: lots of forest, very little brick.
- **Lakes**: inland lakes split the land, each with harbors on its shore.
- **Diamond**, **Twirl**, **Ring** and **Mini**: unusual shapes that change where the good spots are.`,
    },
    {
      id: 'volcano',
      module: 'special-maps',
      section: 'map',
      title: 'Volcanoes',
      summary: 'Pays any resource, but each eruption may hit a building next to it.',
      tags: ['volcano', 'eruption', 'gold'],
      body: `A volcano has a number like any other hex. When it comes up, every settlement and city next to it may take any one resource (two for a city), like a gold field.

Then the volcano erupts. A die picks one of its six corners:

- A **settlement** on that corner is destroyed.
- A **city** on that corner drops back to a settlement.
- An empty corner means nobody is hurt.

Longest road is checked again afterwards. The robber starts on a volcano.`,
    },
    {
      id: 'lake',
      module: 'special-maps',
      section: 'map',
      title: 'Lakes',
      summary: 'Water inside the island, with harbors on the shore.',
      tags: ['lake', 'harbor', 'water'],
      body: `A lake is water in the middle of the land. It produces nothing and the robber can't go there.

Every lake has two harbors on its shore: one general 3:1 harbor and one 2:1 harbor for a single resource.`,
    },
  ],
};
