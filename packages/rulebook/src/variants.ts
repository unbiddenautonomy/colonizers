import type { RulebookModule } from './types.ts';

export const variantsRules: RulebookModule = {
  module: 'variants',
  name: 'Options and house rules',
  cards: [],
  pages: [
    {
      id: 'big-games',
      module: 'variants',
      section: 'rules',
      title: 'Games for 5 to 8 players',
      summary: 'Bigger boards, more pieces in the bank, and a way to keep everyone busy.',
      tags: ['5', '6', '7', '8', 'players', 'big', 'extension', 'waiting'],
      body: `With 5 or more players the board grows and the bank holds more cards, so there is room for everyone.

Waiting for seven other turns is slow, so bigger games use one of two turn styles:

- **Special Building Phase**: after each turn, everyone else gets a chance to build. This is the default for 5 or 6 players.
- **Paired turns**: two players take each turn together. This is the default for 7 or 8 players.

The host can pick either style, or plain turns, under **Options and house rules** before the game starts.`,
    },
    {
      id: 'special-build',
      module: 'variants',
      section: 'rules',
      title: 'Special Building Phase',
      summary: 'After each turn, every other player in order may build.',
      tags: ['special building', 'sbp', 'build', 'out of turn'],
      body: `When a player ends their turn, each other player in seat order gets a short building step.

- You may build roads, ships, settlements and cities, and buy development cards.
- You may **not** trade with anyone, the bank included, and you may not play development cards.
- Press **Done building** when you are finished, and the next player goes.

When everyone has had their step, the next player's turn begins as usual.`,
    },
    {
      id: 'paired-turns',
      module: 'variants',
      section: 'rules',
      title: 'Paired turns',
      summary: 'The player across the table builds during your turn.',
      tags: ['paired', 'partner', 'build', 'out of turn', '7', '8'],
      body: `Each turn has a main player and a **partner**: the player sitting across the table.

- Once the dice are rolled, the partner may build and trade with the bank, at the same time as the main player.
- The partner can't trade with other players, play development cards, or move the robber.
- Only the main player rolls, trades with other players and ends the turn.

While a trade offer is open, the partner waits until it is settled.`,
    },
    {
      id: 'house-rules',
      module: 'variants',
      section: 'rules',
      title: 'House rules',
      summary: 'Optional rules the host can switch on before the game.',
      tags: ['options', 'friendly robber', 'balanced dice', 'gift', 'quiet start', 'discard'],
      body: `The host can switch these on before the game starts. Everyone sees which ones are on in the lobby.

- **Friendly robber**: the robber can't go on a hex next to a player with 2 or fewer points showing, unless there is nowhere else.
- **Balanced dice**: the dice come from a shuffled deck of all 36 combinations, so every total comes up about as often as the odds say. The deck is shuffled again when 5 to 10 are left. (Not used with Cities & Knights.)
- **Gifts**: on your turn you can give cards to another player for nothing.
- **Both starting settlements pay**: you get resources for both of your starting settlements, not just the second.
- **Quiet start**: for the first few rounds a 7 does nothing: no discards and no robber.
- **Discard limit**: when a 7 is rolled, players holding more than this many cards discard half.
- **Harbormaster**: a 2-point bonus for building on harbors. See the Harbormaster page.`,
    },
    {
      id: 'harbormaster',
      module: 'variants',
      section: 'rules',
      title: 'Harbormaster',
      summary: '2 points for the player with the most buildings on harbors.',
      tags: ['harbormaster', 'harbor', 'bonus', 'points'],
      body: `A house rule from Traders & Barbarians that the host can switch on.

- Each settlement on a harbor counts **1**, each city on a harbor counts **2**.
- The first player to reach **3** takes the Harbormaster bonus, worth **2 points**.
- Someone with more takes it straight away. A tie leaves it where it is.
- If the holder drops below 3, the bonus goes back until someone qualifies again.

The bonus makes games a little shorter, so you may want to raise the points to win by one.`,
    },
  ],
};
