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
    nukeBase: { name: 'Nuke', note: 'Plus 5 cards of any kind. Once a game.' },
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

**Alliances:** your other armies next to the target can attack with the first. The defender's armies next to the attacked corner can join the defence, if they choose. Each side rolls the die of its best unit, and its losses come off that unit, whichever army it is in. A building's own defence comes last, once every defending army is gone.

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
      id: 'soldiers-nuke',
      module: M,
      section: 'rules',
      title: 'The nuke',
      summary:
        'Once a game: a field up to six away makes nothing again, and its buildings drop a level.',
      tags: ['nuke', 'nuclear', 'bomb'],
      body: `Each player may buy **one nuke** a game, for 6 ore, 5 grain and 5 more cards of any kind. It stands at one of your settlements or cities.

In the field, set it off on a land field **up to six fields away**, across the sea if need be. The field makes nothing for the rest of the game, and every building on it drops a level: a city with walls loses a wall, a city becomes a settlement, and a settlement is gone. Units are spared.`,
    },
    {
      id: 'soldiers-capitulation',
      module: M,
      section: 'rules',
      title: 'Capitulation and defeat',
      summary:
        'Give up for half your points, or be wiped out for none. The last one standing wins.',
      tags: ['capitulate', 'surrender', 'destroyed', 'out', 'last'],
      body: `On your turn, or while you are being attacked, you may **capitulate** to another player (to the attacker, in a battle). Everything you have goes to them: buildings, roads, ships, units and cards. You leave the game and finish on **half your points**, rounded up.

A player left with no settlement, city or unit is **wiped out**: they finish on 0 points, and whoever destroyed their last piece takes their cards.

Players who are out sit their turns out. The game ends when someone reaches {setting:vpTarget} points, or when only one player is left.`,
    },
    {
      id: 'soldiers-sea',
      module: M,
      section: 'rules',
      title: 'With Seafarers',
      summary: 'Armies cross the sea on anyone’s ships. Three points more than the scenario.',
      tags: ['seafarers', 'ships', 'sea', 'islands'],
      body: `Soldiers & Armies plays on the Seafarers maps with no other changes, to three points more than the scenario. Armies cross the sea along ships, whoever's they are, and a captured settlement takes the cut-off ships with it as well as roads. A rival can't build a ship on past a corner your army holds.`,
    },
    {
      id: 'soldiers-ck',
      module: M,
      section: 'rules',
      title: 'With Cities & Knights',
      summary:
        'Units replace knights; the barbarians besiege the weakest; metropolises roll a d20. 16 points.',
      tags: [
        'cities',
        'knights',
        'barbarians',
        'metropolis',
        'merchant',
        'politics',
        'progress',
        'warlord',
        'smith',
        'intrigue',
        'deserter',
        'engineer',
      ],
      body: `Soldiers & Armies plays with Cities & Knights to 16 points.

- There are **no knights**. Against the barbarians, and for Defender of Catan, each player counts their units: infantry 1, cavalry 2, artillery 3, a nuke 4.
- When the barbarians win, each player with the least strength has one city attacked: the one most likely to hold. The barbarians roll a **d12** against the city's die and walls, once. If they win, the city becomes a settlement and loses its walls.
- A **metropolis** defends with a **d20**. Beaten down to a city, its owner drops back to level 3 on that track, and the metropolis goes to whoever is furthest along it (the first in order of play on a tie).
- An army next to a rival's **merchant** can attack it once a turn. The owner defends with a d10. Win, and move the merchant to any field; lose, and give its owner two cards.
- The owner of the **Politics metropolis** marches each army five corners free.
- These walls (three to a city) replace the Cities & Knights walls.

Progress cards that name knights work with units instead:

- **Warlord**: muster a free infantry at one of your settlements or cities.
- **Smith**: step one of your units up a level (infantry to cavalry, cavalry to artillery), or muster a free infantry.
- **Intrigue**: take one infantry from a rival army on a corner your road or ship touches.
- **Deserter**: pick a rival. They give up one unit of their choice, and you muster one of the same level (or the best below it you have left).
- **Engineer**: a free wall, up to three to a city.`,
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
