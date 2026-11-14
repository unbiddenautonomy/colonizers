import type { RulebookModule } from './types.ts';

const M = 'soldiers';

export const soldiersRules: RulebookModule = {
  module: M,
  name: 'Soldiers & Armies',
  cards: [],
  items: {
    infantry: { name: 'Infantry', note: 'Rolls a d6. Musters at your settlement or city.' },
    cavalry: { name: 'Cavalry', note: 'Its army rolls a d10.' },
    artillery: { name: 'Artillery', note: 'Its army rolls a d12.' },
    wall: {
      name: 'City wall',
      note: '+1 to the city’s defence, and 2 more cards on a 7. Three a city.',
    },
    armyStep: { name: 'March further', note: 'Each corner past the three free ones, per army.' },
  },
  names: {
    army: { name: 'Army', icon: '⚔️' },
  },
  pages: [
    {
      id: 'soldiers',
      module: M,
      section: 'map',
      title: 'Soldiers & Armies',
      summary: 'Muster armies and fight for your rivals’ settlements and cities. 13 points.',
      tags: ['soldiers', 'armies', 'soldaten', 'armeen', 'siedlerinsel', 'war', 'battle'],
      body: `A fan expansion for the base game from the SiedlerInsel site. Settlements and cities can now be lost: armies can damage, shrink and capture them. Fights cost more than they win, so most armies stand guard.

- Everyone starts with **a settlement and a city** (the second placement is a city).
- A turn goes: roll, trade and build (now also units and walls), then **take the field** to march and fight.
- **Development cards** aren't bought. After a turn without buying or playing anything you may draw one free, then march. Hold at most four. There are no Victory Point cards and no Largest Army.
- On a 7 you keep **10 cards**, plus 2 for each city wall.

The first to {setting:vpTarget} points wins.`,
    },
    {
      id: 'soldiers-armies',
      module: M,
      section: 'rules',
      title: 'Armies',
      summary: 'Units muster at your buildings and march three corners a turn.',
      tags: ['army', 'infantry', 'cavalry', 'artillery', 'march', 'move', 'units'],
      body: `Buy **infantry**, **cavalry** and **artillery** in your build phase. They muster on one of your settlements or cities, joining the army already there. The units on one corner are one army, and a corner holds only one army.

Once building is over, **take the field**. Each army marches **three corners free**, and one more for each **1 lumber and 1 grain**. It goes along land, passes through buildings and your own armies, but not a rival's army, and it can't stop on a rival's building or another army.

- No one can build a settlement where an army stands.
- A rival can't build a road on past a corner your army holds. Armies don't break anyone's longest road.
- Once you fight, your armies stop marching for the turn.`,
    },
    {
      id: 'soldiers-battle',
      module: M,
      section: 'rules',
      title: 'Battles',
      summary: 'Roll against a rival army or building next to yours. Ties go to the defender.',
      tags: ['attack', 'battle', 'fight', 'dice', 'capture', 'retreat', 'wall', 'damaged'],
      body: `An army next to a rival army or a rival settlement or city can **attack** it. A building with an army on its corner can only be attacked once that army is gone.

Each round both sides roll:

- an army rolls by its best unit: **d6** infantry, **d10** cavalry, **d12** artillery,
- a **settlement** rolls a d8 and a **city** a d12, plus 1 for each wall.

The higher roll wins the round, and a **tie goes to the defender**. The loser pays:

- an army steps its best unit down (artillery to cavalry, cavalry to infantry); infantry leaves, and an army with no units is gone,
- a building is first **damaged**, then drops a level: a city becomes a settlement (losing its walls), and a settlement falls.

Keep rolling as long as you like. When you **break off**, your army falls back one corner and the damage stays. A fallen settlement is **captured**: it becomes yours, with the roads and ships joined to it that no longer reach one of the loser's buildings.`,
    },
    {
      id: 'soldiers-robber',
      module: M,
      section: 'rules',
      title: 'Fighting the robber',
      summary: 'An army next to the robber can fight it once a turn.',
      tags: ['robber', 'fight', 'attack'],
      body: `Once a turn, in the field, an army at a corner of the robber's field can **fight the robber**. The army rolls its die, the robber a d6, and a tie goes to the robber.

- Win, and move the robber and steal a card as on a 7.
- Lose, and hand over a resource of your choice.`,
    },
    {
      id: 'soldiers-walls',
      module: M,
      section: 'rules',
      title: 'City walls',
      summary: '3 brick: +1 defence and 2 more cards on a 7, up to three a city.',
      tags: ['wall', 'walls', 'city', 'defence', 'hand limit', '7'],
      body: `Build up to **three walls** around each city for **3 brick** each. Every wall adds 1 to the city's defence roll and lets you keep 2 more cards on a 7. A city that drops to a settlement loses its walls.`,
    },
  ],
};
