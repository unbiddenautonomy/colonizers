import type { RulebookModule } from './types.ts';

const M = 'investors';

export const investorsRules: RulebookModule = {
  module: M,
  name: 'Investors & Speculators',
  cards: [],
  pages: [
    {
      id: 'investors',
      module: M,
      section: 'map',
      title: 'Investors & Speculators',
      summary: 'A market whose rates move on every 7, savings and loans.',
      tags: [
        'investors',
        'speculators',
        'investoren',
        'spekulanten',
        'siedlerinsel',
        'bank',
        'market',
      ],
      body: `A fan expansion from the SiedlerInsel site, for the base game, Seafarers and Cities & Knights. The bank becomes a market: prices move, cards can be saved for interest, and cards can be borrowed now and paid back later.

- The bank trades each resource at **its own rate**, from 2:1 to 6:1. All start at 4:1.
- A **7** robs no one. It sets the rates instead, and a 7 in the first round is thrown again.
- Each turn you may make **5 finance actions**: each card saved and each card borrowed is one.
- A loan not paid back in time turns into **bad debt**: points off for the rest of the game. **No one wins with a loan open.**
- **Town loans** put up a settlement or city now, and **derivatives** bet that someone's loan won't be paid back.

The first to {setting:vpTarget} points wins.`,
    },
    {
      id: 'investors-market',
      module: M,
      section: 'rules',
      title: 'The exchange market',
      summary: 'Each resource has a rate; harbors take 1 or 2 off it.',
      tags: ['rate', 'exchange', 'harbor', 'bank trade', 'price'],
      body: `The rate of a resource is how many cards of one kind the bank wants for **one** card of it. Rates run from **2:1** (plenty about) to **6:1** (scarce).

- A **3:1 harbor** takes 1 off every rate.
- A **2:1 harbor** takes 2 off every rate when you pay with its resource.
- No trade ever costs less than 1:1.`,
    },
    {
      id: 'investors-seven',
      module: M,
      section: 'rules',
      title: 'Rolling a 7',
      summary: 'Discards and the robber as usual, then the rates are set. No stealing.',
      tags: ['7', 'seven', 'robber', 'rates', 'show cards', 'discard'],
      body: `Big hands discard half and the roller moves the robber as usual, but **steals nothing**. Then:

- The roller **shows 3** of their resource cards, and **3 cards are drawn** at random from each rival's hand for all to see.
- Count every resource that came to light, the discards too. The **two seen most get cheaper** by a step.
- The roller makes **two other resources dearer** by a step (none past 6:1).
- The roller **keeps one** of the rivals' cards that came to light: a drawn card from that rival's hand, or a discarded one from the bank.

A 7 in the first round after setup is thrown again.`,
    },
    {
      id: 'investors-bank',
      module: M,
      section: 'rules',
      title: 'Savings and loans',
      summary: 'Save a card for 3 or 5 turns; borrow one for 1 to 10 turns.',
      tags: [
        'savings',
        'save',
        'loan',
        'borrow',
        'repay',
        'pay back',
        'debt',
        'interest',
        'finance',
      ],
      body: `In your main turn you may save, borrow and place derivatives, up to **5 finance actions** a turn.

**Savings.** Put a resource card in the bank for 3 or 5 of your turns. When it comes due (after your roll) it pays back by that resource's rate then:

- 3 turns: 2 cards at 2:1 or 3:1, else 1.
- 5 turns: 3 cards at 2:1 or 3:1, 2 at 4:1, else 1.

**Loans.** Take a resource card from the bank now and pay back more of the same kind later:

- 1 turn: 1 card and one card of any kind (1 point of bad debt if unpaid)
- 3 turns: 2 cards (1 point)
- 5 turns: 2 cards (2 points)
- 7 turns: 3 cards (2 points)
- 10 turns: 4 cards (3 points)

You may pay back any time in your main turn. A loan is due on your turn when its turns have run down; unpaid at the end of that turn, it turns into **bad debt**, points off for good.

Hold loans of one resource only from a single turn: you may take up to 5 of a kind in one turn, but must pay those back before borrowing that kind again. **No one wins with a loan open.**`,
    },
    {
      id: 'investors-town',
      module: M,
      section: 'rules',
      title: 'Town loans',
      summary: 'Build a settlement or city free now, and pay 1½ to 2½ of its cost later.',
      tags: ['town loan', 'settlement', 'city', 'build on loan', 'credit'],
      body: `In your main turn you may build a settlement or a city **free**, by the usual rules, on a loan. It is one finance action. Paying it back costs:

- 3 turns: the cost once, plus 2 cards from the cost of another (3 points of bad debt if unpaid)
- 5 turns: the same (4 points)
- 7 turns: the cost twice (4 points)
- 10 turns: the cost twice, plus 2 cards from the cost of another (5 points)

The building stays even if the loan isn't paid back. There are 10 settlement loans and 10 city loans for the whole table.

**While a town loan is open you can't borrow cards**, except in a turn when you take a town loan.`,
    },
    {
      id: 'investors-derivatives',
      module: M,
      section: 'rules',
      title: 'Derivatives',
      summary: 'Bet 2 cards that a loan won’t be paid back; win 1 or 2 points if it isn’t.',
      tags: ['derivative', 'cds', 'bet', 'hedge', 'speculate'],
      body: `Pay **2 cards of one kind** to place a derivative on any loan, yours or a rival's. It is one finance action, and you hold 5.

- Only loans of 5, 7 or 10 turns take derivatives, and only early on: while 4, 6 or 8 turns are left.
- If the loan isn't paid back, the derivative pays **1 point** (5 and 7 turns) or **2 points** (10 turns). On your own loan, that softens the bad debt.
- If it is paid back, the cards are gone. Either way the derivative comes back when the loan is settled.
- One derivative a player on each loan. Loans of one resource taken in the same turn for the same term count as one: a derivative on them pays once if any of them isn't paid back, and you may place one for each loan in it.`,
    },
    {
      id: 'investors-combos',
      module: M,
      section: 'rules',
      title: 'With other expansions',
      summary:
        'Seafarers, Cities & Knights, Witches, Church, Explorers & Pirates, Soldiers & Armies, Princes & Explorers, and 5 or 6 players.',
      tags: [
        'seafarers',
        'pirate',
        'cities & knights',
        'commodities',
        'paper',
        'cloth',
        'coin',
        'trading house',
        'merchant',
        'explorers & pirates',
        'gold',
        'harbor settlement',
        'settler',
        'soldiers & armies',
        'cavalry',
        'artillery',
        'princes & explorers',
        'traders & barbarians',
        'witches',
        'church',
        'crystal',
        'bread',
        'beer',
        'magic kitchen',
        'barbarians',
        'capitulate',
        '5 players',
        '6 players',
      ],
      body: `**Seafarers.** On a 7 you move the robber or the pirate, steal nothing, and set the rates as usual. A settlement built on a town loan that earns extra points (a new island) holds those points until the loan is paid back; if it isn't, they are lost with it.

**Cities & Knights.** Commodities trade, save and borrow at their resource's rate: paper with lumber, cloth with wool, coin with ore. On a 7 they count with their resource. The rates are set on every 7, even before the barbarians first land and the robber comes into play. The trading house, the merchant and the Merchant Fleet take 2 off a rate as a 2:1 harbor would. The game's own dice are used, so a first-round 7 isn't thrown again.

**Explorers & Pirates.** Gold buys a resource for 3 if its rate is 5:1 or 6:1, 2 at 3:1 or 4:1, and 1 at 2:1. Harbor settlements and settlers can be taken on a town loan as well, at their own cost. On a 7 the pirate steals nothing.

**Witches and Church.** Crystal goes by brick's rate plus 2, and Bread by grain's rate plus 1; on a 7 they count with their resource. Both can be bought, saved and borrowed without a Citadel or Diocese. The bank never sells Beer, but Beer buys at the rate of the card you take. The Magic Kitchen takes 3 off the rate when you give brick for a resource, never better than 1:1.

**Traders & Barbarians.** Gold buys a resource at the same 1 to 3 by its rate, still twice a turn. Against the barbarians there is no robber, so a 7 goes straight to the rates; for the traders a barbarian on the paths moves instead, taking no card.

**Soldiers & Armies.** Cavalry and artillery can be mustered on a town loan, paid back at their cost like a building. Infantry can't. A player who capitulates first pays back every loan they can; the rest turns to bad debt, and they leave on half of what is left (never below 0). A player wiped out leaves on 0, their loans and savings with them. The last one standing must pay back their loans too, and wins only with more points than anyone who left; otherwise the player who left with the most wins. Derivatives on these loans pay nothing.

**Princes & Explorers.** On a 7 the robber moves by the princes' rules but steals nothing, and the rates are set as usual. Buying a robber move outside a 7 still robs.

**5 or 6 players.** On a 7 everyone may hold 3 more cards, and there are 20 settlement and 20 city loans.`,
    },
  ],
};
