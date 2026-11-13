import { WONDER_IDS, WONDERS, stageItem } from '@colonizers/module-world-wonders';
import type { RulebookModule } from './types.ts';

const M = 'world-wonders';
const ROMAN = ['I', 'II', 'III', 'IV'];

/** One bullet per wonder: what it needs, then its four stages. */
const list = WONDER_IDS.map((id) => {
  const w = WONDERS[id];
  const stages = w.stages.map((s, i) => `${ROMAN[i]} ${s.name}: ${s.text}`).join('; ');
  return `- ${w.icon} **${w.name}** (needs ${w.needs}). ${stages}.`;
}).join('\n');

export const worldWondersRules: RulebookModule = {
  module: M,
  name: 'World Wonders',
  cards: [],
  items: Object.fromEntries(
    WONDER_IDS.flatMap((id) =>
      WONDERS[id].stages.map((s, i) => [
        stageItem(id, i + 1),
        { name: `${WONDERS[id].name} ${ROMAN[i]}`, note: `${s.name}: ${s.text}` },
      ]),
    ),
  ),
  names: Object.fromEntries(
    WONDER_IDS.map((id) => [id, { name: WONDERS[id].name, icon: WONDERS[id].icon }]),
  ),
  pages: [
    {
      id: 'wonders',
      module: M,
      section: 'rules',
      title: 'World Wonders',
      summary: 'Fourteen wonders to build in four stages. A finished wonder is worth 3 points.',
      tags: ['wonder', 'wonders', 'stage', 'monument', 'civilisations'],
      body: `World Wonders comes from the Civilisations & World Wonders fan expansion. It works with the base game, Seafarers and Cities & Knights.

- **Starting a wonder:** once you meet a wonder's requirement (say, 4 settlements or cities by forest), you can build its first stage on your turn. Pick a hex beside the pieces that meet the requirement; for a terrain requirement, a hex of that terrain. The wonder stands there.
- **One owner:** each wonder belongs to the player who starts it. Nobody else can build it.
- **Stages:** a wonder goes up in four stages, in order. You can build **one stage a turn**, across all your wonders. Each stage costs resources, shown in the Wonders list and on the cost card.
- **What you get:** each stage gives an ability or points. A finished wonder is worth **3 points** in all.
- **The robber:** while the robber, the pirate or a dragon stands on a wonder's hex, nobody can build it further. Its abilities still work, unless the Pyramids' owner put it there.
- **Throwing again:** with the Colosseum's or Machu Picchu's third stage, your roll waits before anything is worked out, so you can throw again or keep it. The second throw is final. With Cities & Knights only the red and yellow dice are thrown again.
- **Resources of your choice** (the Pyramids' Nile Delta, Chichen Itza's Mayan Geometry) wait for you: take them whenever you like.
- **Other prices** (the Taj Mahal's Yamuna River, Machu Picchu's Alpaca Breeding): you pay the usual price when you can, and the other one when you can't.
- **Across mountains** (Cristo Redentor's Teleférico): your roads reach the far corner of a mountains hex beside your road or building, so you can build on from there. Not while the robber or a dragon is on that mountain.
- **Eight Levels of Paradise** (the Taj Mahal): when your turn ends, pick one resource you spent buying something that turn, and take it back.
- **Artemis, Goddess of the Hunt:** once a round, when you draw a development or progress card, you see the next one as well. Keep one; the other goes under the deck.
- **With Cities & Knights:** the Colossus' and Zeus' first stages add to your strength against the barbarians; Zeus' Offering buys progress cards; the Great Wall keeps your knights and cities on your ring of roads safe from rival knights, cards and the barbarians, and its third stage lets you move the barbarian ship two spaces or none when you roll it.
- **Winning:** you need a **finished wonder** to win, as well as the points. The host can switch this off under World Wonders when setting up the game.

Tap **🏛️ Wonders** to see every wonder, who is building it, and what it needs.`,
    },
    {
      id: 'wonders-list',
      module: M,
      section: 'rules',
      title: 'The fourteen wonders',
      summary: 'What each wonder needs, and its four stages.',
      tags: ['wonder', 'pyramids', 'lighthouse', 'colossus', 'petra', 'taj mahal', 'colosseum'],
      body: `Stages II and IV of every wonder are points (Pyramids: IV is worth 3). The rest are abilities, yours as soon as the stage is built.

${list}`,
    },
  ],
};
