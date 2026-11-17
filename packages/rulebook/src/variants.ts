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
      tags: [
        'options',
        'friendly robber',
        'robber goes home',
        'open trading',
        'time bank',
        'balanced dice',
        'gift',
        'quiet start',
        'discard',
      ],
      body: `The host can switch these on before the game starts. Everyone sees which ones are on in the lobby.

- **Friendly robber**: the robber can't go on a hex next to a player with 2 or fewer points showing, unless there is nowhere else.
- **Robber goes home**: the robber blocks a hex and steals as usual, then goes back to the desert at the end of that turn. No hex stays blocked for long.
- **Open trading**: any player can offer a trade on anyone's turn, not just the player whose turn it is. Only one offer is open at a time, and the player who made it chooses who to trade with.
- **Balanced dice**: the dice come from a shuffled deck of all 36 combinations, so every total comes up about as often as the odds say. The deck is shuffled again when 5 to 10 are left. (Not used with Cities & Knights.)
- **Gifts**: on your turn you can give cards to another player for nothing.
- **Both starting settlements pay**: you get resources for both of your starting settlements, not just the second.
- **Quiet start**: for the first few rounds a 7 does nothing: no discards and no robber.
- **Discard limit**: when a 7 is rolled, players holding more than this many cards discard half.
- **Harbormaster**: a 2-point bonus for building on harbors. See the Harbormaster page.
- **Event cards**: a deck of cards replaces the dice. See the Event cards page.
- **Duel rules** (two players only): neutral builders, two rolls a turn and trade tokens. See the Duel rules page.

In online rooms with a turn timer, the host can also give everyone a **time bank**: extra time to spend over the whole game, like a chess clock. When a step's timer runs out, your bank starts counting down; only when it is empty too does the room play a safe move for you.`,
    },
    {
      id: 'duel',
      module: 'variants',
      section: 'rules',
      title: 'Duel rules for two players',
      summary: 'Two neutral builders, two rolls a turn, and trade tokens.',
      tags: ['two players', '2 players', 'duel', 'neutral', 'trade tokens', 'forced trade'],
      body: `A house rule for two players, our version of the two-player rules from Traders & Barbarians. The host switches it on when setting up a two-player game. It doesn't mix with Cities & Knights or Explorers & Pirates.

**Neutral builders**

Two neutral builders, white ⚪ and black ⚫, start with 2 settlements and a road each, on good spots. Their pieces produce nothing and score nothing, but they get in the way like anyone's: they count for the distance rule, and they cut roads.

- Each time you **build a road**, you then place a free road for the neutral builder of your choice, joined to its pieces.
- Each time you **build a settlement**, you then place a free settlement for a neutral builder, on one of its roads and two corners from any other building. If neither builder has room, you place a neutral road instead.

**Two rolls a turn**

You roll the dice twice at the start of each turn, and both rolls pay. If the second roll comes up the same as the first, it is rolled again. A 7 on either roll works as usual.

**Trade tokens** 🎟️

- You earn 1 token for a settlement on the coast, 1 more if it touches the desert, and 1 for every Knight you play.
- On your turn, spend tokens on a **forced trade**: take 2 random resources from your opponent, then give back 2 of your choice.
- Or spend them to **send the robber home** to the desert.
- Either one costs **1 token**, or **2** while you have more points showing than your opponent.`,
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
    {
      id: 'event-cards',
      module: 'variants',
      section: 'rules',
      title: 'Event cards',
      summary: 'A deck of 36 cards replaces the dice, and many cards carry an event.',
      tags: ['event', 'cards', 'dice', 'earthquake', 'epidemic', 'plentiful', 'tournament'],
      body: `Instead of rolling, the player whose turn it is turns the top event card. Its number works like a dice roll: the 36 cards hold each total exactly as often as two dice would (one 2, two 3s, up to six 7s). When only 5 cards are left, the whole deck is shuffled again, so the end of the deck can't be counted.

The event happens first, then the number produces as usual. Events that need a choice are made right after production.

- **Good times** (16 cards): nothing extra happens.
- **The robber strikes** (the six 7s): a normal 7.
- **Epidemic** (6, 8): every city pays only 1 card this turn.
- **Earthquake** (6): everyone picks one of their roads to be damaged. A damaged road still counts for Longest Road, but its owner can't buy new roads until they repair it (1 brick and 1 lumber), and nobody can build a settlement next to it. Free roads still work.
- **Good neighbours** (6): everyone gives one resource of their choice to the player on their left.
- **Tournament** (5): whoever has played the most knights takes a resource from the bank.
- **Trade advantage** (5): the Longest Road holder (or whoever has the most roads, alone) takes a random resource from a player of their choice.
- **Calm seas** (9, 12): whoever has buildings on the most harbors takes a resource from the bank.
- **The robber flees** (two 4s): the robber goes back to the desert.
- **Helping hand** (10, 11): the leaders in points each give one resource to a player with fewer points.
- **Conflict** (3): whoever alone has played the most knights takes a random resource from a player of their choice.
- **Plentiful year** (2): everyone takes a resource of their choice from the bank.

Event cards can't be used with Cities & Knights, which has its own dice.`,
    },
  ],
};
