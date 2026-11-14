import type { RulebookModule } from './types.ts';

const M = 'kingdoms';

export const kingdomsRules: RulebookModule = {
  module: M,
  name: 'Kingdoms & Warriors',
  cards: [],
  items: {},
  names: {
    kingdom: { name: 'Kingdom marker', icon: '👑' },
  },
  pages: [
    {
      id: 'kingdoms',
      module: M,
      section: 'map',
      title: 'Kingdoms & Warriors',
      summary:
        'Kingdoms spread from your cities, take resources and are fought over. 2 points more.',
      tags: ['kingdoms', 'warriors', 'königreiche', 'krieger', 'siedlerinsel', 'marker'],
      body: `A fan expansion for the base game from the SiedlerInsel site. Around your cities, kingdoms grow field by field.

- Everyone starts with a **settlement and a city**, and places a **free kingdom marker** on a field beside the city.
- A **kingdom marker** costs 2 ore or 2 grain. It goes on a land field beside one of your cities or your markers.
- A marker **produces** its field's resource whenever the number is rolled, like a settlement. The robber blocks it.
- Every **3 markers joined** field to field make one kingdom point.
- Set a marker on a rival's field and the two of you **fight** when your turn ends.

The first to {setting:vpTarget} points wins.`,
    },
    {
      id: 'kingdoms-markers',
      module: M,
      section: 'rules',
      title: 'Kingdom markers',
      summary: 'Where markers go, what they give, and surrounding a rival.',
      tags: ['kingdom marker', 'surround', 'yield', 'points'],
      body: `**Placing.** A marker costs 2 ore or 2 grain, as many as you like a turn. It goes on a land field that touches one of your cities or is next to one of your markers. You can have only one marker on a field, and none on the robber's field.

**Points.** Markers joined field to field form a kingdom, worth 1 point for every 3 markers. If a battle cuts a kingdom in two, each part counts on its own, so points can be lost. A part with no city can still grow.

**Surrounding.** When one player's markers cover every land field around a rival's settlement, that player takes the settlement's yield. Around a city, they take one of its two cards and the owner keeps the other. Harbors still work for their owner.`,
    },
    {
      id: 'kingdoms-battles',
      module: M,
      section: 'rules',
      title: 'Battles',
      summary: 'Knights decide who keeps a field.',
      tags: ['battle', 'attack', 'knights', 'kampf', 'largest army'],
      body: `Set a marker on a field that already holds a rival's marker, and the battle is fought when you **end your turn**.

- Each side's strength is its **knight cards played**, plus 1 for **Largest Army**, plus **half a die** (rounded down).
- The loser's marker leaves the field. On a **tie**, the attacker's marker leaves and nobody gets anything.
- The **winner** gets a free marker to place on their next turn. It can't go beside a rival's settlement or city, or on a field a rival holds.
- At most **2 battles a turn**, against different players. A player's **last 2 markers** can't be attacked.
- A marker in a battle doesn't count toward points until the battle is fought.`,
    },
    {
      id: 'kingdoms-ck',
      module: M,
      section: 'rules',
      title: 'With Cities & Knights',
      summary: 'Knights on the board fight for your kingdoms.',
      tags: ['cities & knights', 'knights', 'defender of catan', 'commodities'],
      body: `With Cities & Knights, a player's army in a battle is their **active knights** on the board: 1 for a basic knight, 2 for a strong one, 3 for a mighty one. Add half their **Defender of Catan** cards (rounded up) and half a die (rounded down).

Around a surrounded city, the owner keeps the commodity and the kingdom takes the resource. A turn where your only yield comes from kingdom markers still counts as a yield, so the Aqueduct gives nothing extra.

The game plays to 2 points more than Cities & Knights. Investors & Speculators plays alongside with no changes.`,
    },
  ],
};
