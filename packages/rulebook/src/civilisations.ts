import { CIVS, CLASS_INFO, CLASSES } from '@colonizers/module-civilisations';
import type { RulebookModule } from './types.ts';

const M = 'civilisations';

const ready = CIVS.filter((c) => c.ready);

/** One bullet per civilisation that can be dealt now. */
const list = CLASSES.map((cls) => {
  const civs = ready.filter((c) => c.cls === cls);
  if (!civs.length) return '';
  const info = CLASS_INFO[cls];
  const rows = civs
    .map((c) => {
      const wonder = c.wonder ? ` Wonder: started with ${c.wonder.needs}.` : '';
      return `- **${c.name}.** ${c.start.name}: ${c.start.text} From 10 points, ${c.later.name}: ${c.later.text}${wonder}`;
    })
    .join('\n');
  return `**${info.icon} ${info.name}**\n\n${rows}`;
})
  .filter(Boolean)
  .join('\n\n');

export const civilisationsRules: RulebookModule = {
  module: M,
  name: 'Civilisations',
  cards: [],
  pages: [
    {
      id: 'civilisations',
      module: M,
      section: 'rules',
      title: 'Civilisations',
      summary: 'Lead a civilisation: an ability from the start, another from 10 points.',
      tags: ['civilisation', 'civilisations', 'warlord', 'republic', 'innovator', 'monument'],
      body: `Civilisations comes from the Civilisations & World Wonders fan expansion. It plays on Cities & Knights with Greed, Wealth & Power, to **20 points**. With World Wonders on too, the Monument civilisations get a head start on their wonder.

- **Picking:** before the starting placements, each player is dealt up to three civilisations and keeps one. Nobody sees the others' picks until everyone has chosen.
- **Two abilities:** each civilisation has one from the start of the game, and a second from the first time you reach **10 points**. You keep it if you drop back.
- **Classes:** every civilisation belongs to a class, with a bonus of its own:
  - ${CLASS_INFO.warlord.icon} **Warlord:** ${CLASS_INFO.warlord.bonus} You place it on your first turn.
  - ${CLASS_INFO.republic.icon} **Republic:** ${CLASS_INFO.republic.bonus}
  - ${CLASS_INFO.innovator.icon} **Innovator:** ${CLASS_INFO.innovator.bonus}
  - ${CLASS_INFO.monument.icon} **Monument:** ${CLASS_INFO.monument.bonus}
- **Free pieces and cards** wait for you: tap **🏳️ Civilisations** on your turn to place a free road or knight, or to use a once-a-game ability.
- **Any card:** some civilisations may swap one card a roll from a terrain for any resource or commodity. The offer shows up after the roll; keep your cards if you like.
- **On other players' turns:** Greece, from 10 points, is asked after each roll whether to throw some dice again, until it has done so; then it waits two rounds. Russia is asked after a 7 by the player before them whether to throw for the robber.
- **Striking back:** Babylon, from 10 points, may destroy a road, ship or inactive basic knight of anyone who robs, spies on, displaces, curses or holds a festival against them. Each harm gives one strike, used when they like.
- **Welfare:** Prussia's welfare tokens show in the 🏳️ Civilisations panel: 2 buy a resource, 3 a commodity.
- **Board changes:** Gran Colombia's harbor, France's number swap and the Inca's Lago Titicaca are done on the board from the **🏳️ Civilisations** panel: tap the harbor or hex first, then where it goes.

${ready.length} of the 40 civilisations are in the game so far; the rest come in later updates.`,
    },
    {
      id: 'civilisations-list',
      module: M,
      section: 'rules',
      title: 'The civilisations',
      summary: 'Each civilisation in the game, with its two abilities.',
      tags: [
        'civilisation',
        'kongo',
        'egypt',
        'korea',
        'morocco',
        'mali',
        'greece',
        'russia',
        'china',
        'inca',
      ],
      body: list,
    },
  ],
};
