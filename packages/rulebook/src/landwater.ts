import type { RulebookModule } from './types.ts';

const M = 'landwater';

export const landWaterRules: RulebookModule = {
  module: M,
  name: 'Land & Water',
  cards: [],
  items: {},
  names: {
    train: { name: 'Train', icon: '🚂' },
    ferry: { name: 'Ship', icon: '⛴️' },
    plane: { name: 'Plane', icon: '✈️' },
  },
  pages: [
    {
      id: 'landwater',
      module: M,
      section: 'map',
      title: 'Land & Water',
      summary: 'No roads: trains, ships and planes travel the island instead. Plays to 12.',
      tags: [
        'land & water',
        'land und wasser',
        'siedlerinsel',
        'train',
        'ship',
        'plane',
        'vehicle',
      ],
      body: `A fan expansion for the base game from the SiedlerInsel site, on the usual maps and the Seafarers scenarios without fog. Catan gets moving.

- There are **no roads**, and no Seafarers ships. Everyone starts with **two settlements** and nothing else.
- **Vehicles** are built at your own settlements and cities, and travel the island through its fields.
- An active **train** standing in a field collects that field's yield whenever its number is rolled, like a settlement.
- An active **ship** out at sea **fishes**, or opens the harbor it sits in front of.
- A **new settlement** goes on a corner where one of your active vehicles stands.
- **Most Vehicles** replaces the Longest Road: 2 points for the first player with 3 vehicles, until someone has more.
- Hands of up to **10 cards** are safe on a 7.

The first to {setting:vpTarget} points wins.`,
    },
    {
      id: 'landwater-vehicles',
      module: M,
      section: 'rules',
      title: 'Vehicles',
      summary: 'Building, moving and activating trains, ships and planes.',
      tags: ['train', 'ship', 'plane', 'move', 'step', 'passive', 'activate', 'grain'],
      body: `**Building.** A vehicle starts on the corner of one of your settlements or cities, and starts active.

- **Train** (1 ore, 1 brick, 1 grain): stays on land.
- **Ship** (1 lumber, 1 wool, 1 grain): built on the coast, stays at sea.
- **Plane** (2 ore, 2 brick, 2 grain): built at a city, goes anywhere.

**Moving.** A vehicle moves through the fields. Each step goes from a corner into a field next to it, or from a field out to one of its corners. A train or a ship has 1 free step a turn and a plane 2. Every further step costs a grain. Once you start moving, you can't build a settlement or a vehicle, or activate one, for the rest of the turn.

**Room.** A corner holds one train or ship, plus one plane. A field holds three trains or ships, plus two planes. No vehicle can enter the field of the robber or the pirate.

**Settling.** Build a settlement on a corner where one of your active vehicles stands, keeping the distance rule. The vehicle turns **passive**: it can't move or collect anything until you activate it again. A train costs 1 grain to activate, a ship 1 wool, and a plane 2 grain.`,
    },
    {
      id: 'landwater-yields',
      module: M,
      section: 'rules',
      title: 'Yields, fishing and harbors',
      summary: 'What trains collect, how ships fish, and harbors from the sea.',
      tags: ['yield', 'fish', 'fishing', 'harbor', 'gold', '1:1', '2+1:1'],
      body: `**Trains.** An active train in a field collects one of its resource when the number is rolled. On gold it collects a resource of your choice. Trains on corners collect nothing, and neither do planes or passive vehicles. The robber blocks trains in its field.

**Fishing.** A player who gets nothing on a roll (other than a 7) takes a resource of their choice for each sea field where they have an active ship. Two ships in the same field fish once. Ships in front of a harbor don't fish, and the pirate blocks fishing in its field.

**Harbors.** An active ship in the sea field in front of a harbor lets you use that harbor, as a settlement on it would. Using the same kind of harbor twice is better:

- Two 2:1 harbors of one resource (or the same one twice, by ship and by settlement) trade it **1:1**.
- Two generic harbors trade **2 of a kind plus any 1 card** for one.

Two ships in front of one harbor count once. The pirate in front of a harbor closes it.`,
    },
    {
      id: 'landwater-cards',
      module: M,
      section: 'rules',
      title: 'Knights and Road Building',
      summary: 'Three ways to play a knight, and free vehicles.',
      tags: ['knight', 'chase', 'road building', 'speed'],
      body: `**Knights.** When you play a knight, pick one of three uses. Each counts toward the Largest Army.

- Move the **robber** (or the pirate), as usual.
- **Speed** your vehicles: two free steps this turn.
- **Chase** a rival's train or ship out of its field, into a field next to it of your choice. If there's nowhere for it to go, it goes back to its owner's supply. Planes and vehicles on corners can't be chased.

You may play several development cards in a turn, though never one bought the same turn.

**Road Building** builds a free train or ship, or a plane for 3 of its cards less.`,
    },
    {
      id: 'landwater-ck',
      module: M,
      section: 'rules',
      title: 'Land & Water with Cities & Knights',
      summary: 'Knight cards instead of knights, commodities from trains, a late barbarian ship.',
      tags: ['cities & knights', 'knight card', 'barbarians', 'commodity', 'progress', 'fortress'],
      body: `Land & Water also goes with Cities & Knights, to 14 points.

- Everyone starts with a **settlement and a city**, and no vehicles.
- There are **no knight pieces**. The development deck holds only the base game's **knight cards**. They cost the usual development card and can be played the turn they're bought, in any of the three Land & Water ways. The robber use waits until the barbarians have attacked once.
- Played knight cards stay out and count **1 each against the barbarians**. They never turn passive, and they win Defender of Catan cards. They also count for the **Largest Army**. A tie goes to the player with a Fortress (Politics level 3); otherwise the card stays where it is.
- A **train** collects a commodity in place of its resource when you have another train in a field of the same kind (gold doesn't count). Two trains in one field never collect two commodities.
- The **Aqueduct** and **fishing** both pay.
- The **barbarian ship** sets sail only when it comes up on the event die for the third time.
- Progress cards: **Warlord** and **Smith** give a free knight card. The **Deserter** wins over one of a rival's played knights. **Intrigue** chases a rival's train or ship like a knight. The **Diplomat** gives two free steps. **Road Building** builds a free train or ship, or a plane for 3 cards less.`,
    },
  ],
};
