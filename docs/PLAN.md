# Colonizers: Master Plan

A private, browser-based hex-and-resources trading game for our friend groups, in the style of Catan and Colonist.io. This document is the plan only. No game code is written yet.

Status: draft v2, updated with Nachi's feedback from the first review.

What changed in v2:
- The engine is built around expansion modules from day one. Seafarers and Cities & Knights come right after the base game works online.
- Added special maps (Gold Rush, Volcano, forest-heavy and others), map generation rules for Seafarers, and support for 7–8 players.
- Fair map generation is now an option, not the default.
- Added bots with difficulty levels and play styles.
- Added Traders & Barbarians, Explorers & Pirates and fan-made expansions as later phases.
- Added an in-game rulebook and guide that opens as a pop-up during a game.
- Login is Google plus our own email sign-up only. Async play is supported but low priority.

---

## 0. Quick answers

| Question | Short answer |
|---|---|
| Preset and random maps? | Both. Presets are stored map files, including special maps like Gold Rush and Volcano. Random maps come from a generator (section 3). |
| Do maps have to be fair? Do the originals care? | Fairness is optional. The host picks Classic (official rules only), Balanced (our fairness rules) or Wild. The official rules only stop 6s and 8s from touching. They don't balance resources or starting spots. |
| Tile and piece counts? | Exact counts for base, 5–6 and the two main expansions are in section 2, plus our own 7–8 player design. |
| Seafarers and Cities & Knights? | The core engine is designed for them from the start (section 4.1), and they are phases 5 and 6, right after online play works. |
| Bots? | Yes. Easy, Medium and Hard bots, each with a play style such as Builder, Trader or Army (section 5). |
| More expansions? | Traders & Barbarians, Explorers & Pirates, then fan-made expansions, after the two main ones (sections 1.6–1.7). |
| Rulebook during a game? | Yes. A searchable rulebook and guide opens as a pop-up any time, showing only the rules active in that game (section 9). |
| Multi-device sync, login, achievements? | One game server per room keeps every device in sync. Login is Google or our own email and password. Achievements are checked on the server. |
| Webapp or full app? | A webapp is enough. It's built as a PWA, so it installs to the home screen with no app store. |
| Free hosting? | Cloudflare's free plan (Pages, Workers, Durable Objects, D1). See section 7. |
| Original Catan or Colonist graphics? | We can't use or recreate the official art, pieces or logos. They are copyrighted and trademarked, even for a private game. We'll build swappable themes with our own art, including "Heritage", which has the same classic wood-and-parchment feel (section 10). |

---

## 1. Rules

Every rule set is a module. The base game is one module; each expansion and each special map adds its own. House rules and Colonist-style options are switches in the game settings.

### 1.1 Base game (3–4 players)

**Goal.** First player to reach 10 victory points (VP) **on their own turn** wins.

**Victory points.**
- Settlement 1 VP, city 2 VP.
- Longest Road: 2 VP for the first player with an unbroken road of at least 5 segments. Someone takes it only by being strictly longer.
- Largest Army: 2 VP for the first player to play 3 knights. Someone takes it only by having strictly more.
- Victory Point development cards: 1 VP each, hidden until the player wins or the game ends.

**Setup (snake draft).**
1. Random seat order. Round 1 goes 1 → N: each player places a settlement and a road touching it.
2. Round 2 goes N → 1: each player places a second settlement and road.
3. Each player takes one resource for each terrain hex next to their **second** settlement.
4. Distance rule: no settlement may sit on a corner next to another settlement or city.

**A turn.**
1. **Roll** two dice. A knight may be played before rolling.
2. **Production.** Every hex with the rolled number pays 1 resource per adjacent settlement and 2 per adjacent city. The robber's hex pays nothing.
   - Bank shortage: if the bank can't pay everyone owed a resource, nobody gets it, unless only one player is owed it; they get what is left.
3. **A 7.** No production. Everyone with more than 7 cards discards half, rounded down. The roller moves the robber to another hex and steals one random card from a player with a building there.
4. **Trade and build**, in any order:
   - Trade with other players (always involving the active player).
   - Trade with the bank: 4:1, or 3:1 at a generic harbor, or 2:1 for that resource at a specific harbor.
   - Build and buy.
   - Play at most **one** development card, and not one bought this turn.
5. End turn.

**Costs.**

| Item | Cost | Notes |
|---|---|---|
| Road | 1 brick, 1 lumber | Connects to your road, settlement or city. |
| Settlement | 1 brick, 1 lumber, 1 wool, 1 grain | Touches your road; distance rule. |
| City | 2 grain, 3 ore | Replaces your settlement, which goes back to your supply. |
| Development card | 1 wool, 1 grain, 1 ore | Drawn face down. |

**Development cards.** Knight (move robber and steal, counts for Largest Army), Road Building (2 free roads), Year of Plenty (take any 2 resources), Monopoly (everyone gives you all of one named resource), Victory Point (1 hidden VP).

**Longest Road details.** Longest single path with no repeated segment. An opponent's settlement or city on a corner breaks it. If the holder's road is broken and there is a tie for longest, the card is set aside until one player is strictly longest.

**Supply limits per player.** 15 roads, 5 settlements, 4 cities.

### 1.2 5–6 players

- Bigger board and more cards (section 2.2).
- **Special Building Phase**: after each player's turn, every other player in order may build or buy development cards (no trading, no playing cards).
- Alternative "Paired Players" turns, from newer printings, as an option.

### 1.3 7–8 players (our own design)

There's no official 7–8 board for the base game, so we design one.
- A bigger board of about 37 land hexes (draft counts in section 2.3), tuned by bot simulation so every seat gets fair chances.
- Paired turns by default: two players take their turns at the same time, so a round doesn't drag. Special Building Phase as an alternative.
- Bank and development deck scaled up.
- The UI must fit 8 player panels on a phone (compact strip with tap-to-expand).

### 1.4 Colonist-style options

These are the online options Colonist is known for. We'll check their current lobby settings before coding and match behaviour where it makes sense.
- **Friendly robber**: the robber can't go on a hex touching a player with 2 or fewer visible VP.
- **Balanced dice**: a shuffled "deck" of all 36 outcomes, reshuffled when 5–10 cards remain, with a mild penalty on numbers rolled very recently. Seeded and auditable.
- **VP target** (10 by default), **discard limit** (7 by default), **turn timer** with a time bank, **hide bank card counts**, **visible hand sizes**, and a **trade offer board** where others accept, decline or counter.

### 1.5 House rules as switches

- No robber for the first N rounds.
- First settlement also gives starting resources.
- Allow gifting cards.
- Trading only on your own turn, or between any players.
- 2-player variant with neutral pieces.
- Three starting placements on big boards.
- Robber goes back to the desert after each 7.

### 1.6 The two main expansions

These are top priority after the base game.

**Seafarers**
- Sea hexes, islands and ships. A ship costs 1 lumber + 1 wool and sits on an edge next to sea. Once per turn you may move one ship at the open end of a shipping line (not one built this turn).
- Ships and roads connect only through a settlement or city. Shipping lines count toward Longest Road (renamed "Longest Trade Route").
- **Gold field** hex: pays 1 resource of the owner's choice per settlement (2 per city).
- **Pirate**: on a 7 or a knight, you can move the pirate instead of the robber. It stops ships next to it from being built or moved, and steals from a ship owner beside it.
- **Island bonus**: VP tokens for the first settlement on each new island, per scenario.
- **Fog of war** (exploration scenarios): face-down hexes revealed when a ship or road reaches them, sometimes paying a resource on discovery.
- Scenarios set their own map, VP target (usually 12–14) and special rules. Each scenario is a map file plus a small rules module.

**Cities & Knights**
- **Commodities**: cities on forest make paper, on pasture make cloth, on mountains make coin (a city there takes 1 resource + 1 commodity instead of 2 resources).
- **City improvements** in three tracks: trade (cloth), politics (coin), science (paper), 5 levels each. Level 3 unlocks a special ability; reaching level 4 first earns a **metropolis** (+2 VP; another player can take it only by reaching level 5 in that track first).
- **Knights** (basic, strong, mighty) placed on corners, activated with grain. Active knights can move, chase away the robber, displace weaker enemy knights and defend.
- **Barbarians**: an event die moves the barbarian ship. When it lands, total active knight strength is compared to the number of cities. If the barbarians win, the player(s) with the lowest knight strength lose a city back to a settlement. If Catan wins, the strongest defender gets a "Defender of Catan" VP card (or a progress card on a tie).
- **Progress cards** replace development cards: three decks (green science, yellow trade, blue politics), drawn by event die rolls based on your improvement levels.
- **City walls** raise your hand limit by 2 each (max 3).
- The robber is inactive until the first barbarian attack.
- **Merchant** piece: placed on a hex, it lets its owner trade that hex's resource 2:1 with the bank and is worth 1 VP while they hold it.
- VP target 13. The hand limit counts commodities.

**Combinations.** Seafarers + Cities & Knights together is an official combination, and 5–6 player versions exist for both. The module system must allow any valid mix, with a test suite for each combination we support.

### 1.7 Later expansions

After the two main ones, in this order (we can reorder).

**Traders & Barbarians** (official). A box of separate scenarios and variants:
- *Fishermen of Catan*: fish shoal tiles around the coast pay fish tokens, spent on actions (move robber off, steal, free road, buy a development card). Includes the "old boot" that costs a VP.
- *Rivers of Catan*: rivers between hexes; bridges cost extra and pay gold coins; the wealthiest player gets a VP and the poorest loses one.
- *The Caravans*: camel lines vote-placed between oases; roads along camels count double toward Longest Road.
- *Barbarian Attack*: barbarians land on coastal hexes and block production; knights fight them for prisoners.
- *Traders & Barbarians* (main scenario): wagons carry goods between castle, quarry and glassworks for VP.
- Variants: event card deck instead of dice (also a good fairness option on its own), Harbormaster bonus card, 2-player rules.

**Explorers & Pirates** (official). Missions on an unexplored sea:
- Ships carry settlers and crews; harbor settlements are needed to build ships.
- Fog-of-war map revealed by exploring.
- Missions: land settlers, fish for the Council, deliver spice, fight pirate lairs with crews. Each mission pays gold and VP.
- Gold can buy resources. The pirate ship moves on 7s.

**Fan-made expansions** (requested: Harbors and Artisans, Civilizations of Catan, Oil Springs, Explorers of Catan, Combats and Politics, Dragons and Wizards).
- We need the rule text for each. Some are well documented online, some have several versions. Before each one, I'll gather its rules and write a short summary for Nachi to confirm which version your group plays.
- Oil Springs is an official scenario released by the Catan publisher (oil tiles produce oil for upgrades and metropolises, with spills and disasters as a downside).
- These rules belong to their authors. We implement the mechanics for private play and credit each source in the rulebook.
- The module system (section 4.1) is what makes these cheap to add: most need new hex types, new pieces, a new card deck and a few turn hooks.

---

## 2. Components and exact counts

### 2.1 Base game (3–4 players)

**Terrain hexes: 19**

| Terrain | Resource | Count |
|---|---|---|
| Forest | Lumber | 4 |
| Pasture | Wool | 4 |
| Fields | Grain | 4 |
| Hills | Brick | 3 |
| Mountains | Ore | 3 |
| Desert | (none) | 1 |

**Number tokens: 18**

| Number | 2 | 3 | 4 | 5 | 6 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|
| Tokens | 1 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 1 |
| Pips (ways to roll, out of 36) | 1 | 2 | 3 | 4 | 5 | 5 | 4 | 3 | 2 | 1 |

Total pips on the board: 58. Official spiral order (A–R): 5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11.

**Harbors: 9.** 4 generic 3:1 and one 2:1 each for lumber, wool, grain, brick and ore.

**Per player (4 colors):** 15 roads, 5 settlements, 4 cities.

**Cards.** 95 resource cards (19 of each). 25 development cards: 14 Knight, 5 Victory Point, 2 Road Building, 2 Year of Plenty, 2 Monopoly. Longest Road and Largest Army cards.

**Other.** 1 robber, 2 dice, sea frame.

### 2.2 5–6 players (totals including the base game)

| Component | Base | Added | Total |
|---|---|---|---|
| Terrain hexes | 19 | 11 | 30 |
| Forest / Pasture / Fields | 4 / 4 / 4 | 2 / 2 / 2 | 6 / 6 / 6 |
| Hills / Mountains | 3 / 3 | 2 / 2 | 5 / 5 |
| Desert | 1 | 1 | 2 |
| Number tokens | 18 | 10 | 28 |
| Harbors | 9 | 2 (1 generic, 1 wool) | 11 |
| Resource cards | 95 | 25 | 120 (24 each) |
| Development cards | 25 | 9 | 34 |
| Player colors | 4 | 2 | 6 |

- Tokens: 2 and 12 have 2 each; 3, 4, 5, 6, 8, 9, 10 and 11 have 3 each.
- Development cards: 20 Knight, 5 Victory Point, 3 Road Building, 3 Year of Plenty, 3 Monopoly.

### 2.3 7–8 players (our draft, tuned later by simulation)

| Component | Draft total |
|---|---|
| Land hexes | 37: Forest 8, Pasture 8, Fields 8, Hills 6, Mountains 6, Desert 1 |
| Number tokens | 36: 2 and 12 ×2, all others ×4 |
| Harbors | 13: 6 generic, 7 specific (2 wool, 2 grain, 1 each other) |
| Resource cards | 30 of each (150) |
| Development cards | 44: 26 Knight, 6 VP, 4 Road Building, 4 Year of Plenty, 4 Monopoly |
| Player colors | 8, all colorblind-safe with a shape per player |

### 2.4 Seafarers

Each scenario sets its own layout, so scenarios are stored as map files. Fixed parts:
- 15 ships per player.
- 1 pirate ship.
- Sea hexes, gold field hexes and island bonus tokens, used per scenario.

The full box inventory gets checked against the rulebook at the start of phase 5. Because the engine doesn't depend on box totals, a wrong box count can't break anything; only scenario files matter.

### 2.5 Cities & Knights

- Commodity cards: 36 (12 each of paper, cloth, coin).
- Progress cards: 54, three decks of 18.
  - Science (green): Alchemist 2, Crane 2, Engineer 1, Inventor 2, Irrigation 2, Medicine 2, Mining 2, Printer 1, Road Building 2, Smith 2.
  - Trade (yellow): Commercial Harbor 2, Master Merchant 2, Merchant 6, Merchant Fleet 2, Resource Monopoly 4, Trade Monopoly 2.
  - Politics (blue): Bishop 2, Constitution 1, Deserter 2, Diplomat 2, Intrigue 2, Saboteur 2, Spy 3, Warlord 2, Wedding 2.
- Per player: 6 knights (2 basic, 2 strong, 2 mighty), 3 city walls, 1 city improvement chart.
- 3 metropolises, 1 merchant, 6 "Defender of Catan" VP cards, barbarian ship and track.
- Event die (3 barbarian ship faces, 3 colored city-gate faces) and a red die that pairs with the regular yellow die.

### 2.6 Later expansions

Component lists for Traders & Barbarians, Explorers & Pirates and each fan expansion get written at the start of their phase, together with their rule summaries.

---

## 3. Maps

### 3.1 Board model

- Hexes use axial (cube) coordinates. Corners and edges get stable ids from coordinates, so replays always line up.
- A map file (JSON) holds hexes (terrain, number token, face-up or hidden), harbors, starting pieces (robber, pirate), allowed player counts, required modules, VP target and any special rules.
- Hex types are open-ended. New ones (gold, volcano, oasis, oil, fish shoal, river edge, pirate lair, fog) are added by modules, not by changing the core.

### 3.2 Preset maps

**Standard boards**
- Starter (our own balanced layout for learners), Classic 5–6, Big 7–8.

**Special maps** (inspired by the kinds of special maps Colonist offers; layouts and names are our own designs)
- **Gold Rush**: several gold field hexes in the middle of the board, fewer normal resource hexes. Fast and swingy.
- **Volcano**: one or more volcano hexes. A volcano pays like a gold field. When its number is rolled, a die picks one of its corners: a settlement there is destroyed, a city drops to a settlement.
- **Deep Forest**: a forest-heavy board with clearings, lumber plentiful and brick rare. Roads are cheap, settlements are not.
- **Lakes**: inland lakes break the board into regions. Lake shores have harbors.
- **Diamond**, **Twirl**, **Ring** and **Mini**: shape variants that change where the best spots are.
- **World** and **Archipelago**: continent-style maps (with Seafarers ships).
- More can be added any time as data files, and the map editor (phase 13) lets the group make their own.

**Seafarers scenarios**: Heading for New Shores, Four Islands, Fog Islands, Through the Desert, the Forgotten Tribe, Cloth for Catan, the Pirate Islands, Wonders of Catan, and others from the box, each as a map file plus rules module.

*Shipped in phase 5*: our own versions of New Shores, Four Islands and Fog Islands, plus Archipelago. Each is a generator recipe plus settings (`packages/maps/src/seafarers.ts`), so every game gets a fresh board that passes the section 3.4 checks. Scenarios with extra rules (Through the Desert, the Forgotten Tribe, Cloth, Pirate Islands, Wonders) come later as small rules modules on top.

### 3.3 Random generation

The host chooses a mode in the lobby. **Classic is the default.** Fairness is optional.

| Mode | What it does |
|---|---|
| **Classic** (default) | Shuffles terrain and places numbers by the official rule: 6s and 8s never touch. Matches how the originals do it. |
| **Balanced** | Classic, plus our fairness rules and a scored search (below). |
| **Wild** | Fully random, even red numbers may touch. Chaos nights. |
| **Custom** | Host turns individual rules on or off, and sets resource weights (e.g. "more ore"). |

**Balanced mode rules**

Hard rules:
1. No 6 or 8 touches another 6 or 8.
2. No two identical numbers touch.
3. 2 and 12 don't touch each other.
4. No three hexes of the same terrain in a connected cluster.
5. The red tokens sit on at least three different resources.
6. Every resource has at least one hex with 4 or more pips.

Scored goals:
1. **Pips per resource** near its fair share (share of the total pips in proportion to that resource's hex count). Base game: about 12.9 for lumber, wool and grain; about 9.7 for brick and ore. Brick and ore stay scarcer by design.
2. **Starting spot spread**: the best 2N corners (N players) are close in value, so the last seat isn't punished.
3. **No monster spots**: cap on the best corner's pip total.
4. **Regional balance**: board split into sectors with similar total pips.
5. **Harbor balance**: a 2:1 harbor beside a strong hex of its own resource gets a penalty.

Algorithm: seeded generation → reject until the hard rules pass → swap pairs of tokens or terrains a few thousand times to lower the score → accept below a threshold. Runs in the browser in well under a second. The seed is shown so any board can be shared or replayed.

**Fairness report** (any mode): pips per resource, best starting spots, an A/B/C grade, a Reroll button, and Lock board.

### 3.4 Seafarers map generation

Sea boards need more rules than land boards.

**Structure**
1. A **home island** (or two) big enough for every player's starting settlements: at least 2N good corners that obey the distance rule.
2. **Outer islands** of 2–6 hexes each, with the number of islands and their sizes set by the host (or random).
3. **Sea gaps**: every outer island is reachable by ship. Each must be 1–3 sea hexes from another island, so no island is unreachable and none is too easy.
4. **Sea share**: a target share of sea hexes (for example 35–50%), chosen by board size.

**Resources and numbers**
5. The home island has every resource, so nobody is shut out at the start.
6. Outer islands may be resource-skewed (an ore island, a wool island), which gives a reason to sail.
7. **Gold fields** only on outer islands, never next to each other, and not on 6 or 8 in Balanced mode.
8. Small islands get at least one decent number (4+ pips) so they're worth reaching.
9. The usual number rules (no touching 6/8) apply inside each island and across a one-hex strait.

**Harbors and pieces**
10. Harbors only on coastal edges, facing sea, spread across the home island and some outer islands.
11. The pirate starts in open sea, away from the home island's coast.

**Fog of war** (optional)
12. Outer hexes are face down. The generator still checks all its rules on the hidden layout, so exploring can't reveal an impossible board.

**Island bonus**: each outer island is tagged so the first settler there gets the bonus VP.

**Checks**: property tests on thousands of seeds (every island reachable, home island has all resources, enough starting spots for every player count).

---

## 4. Architecture

### 4.1 Rules engine built for expansions

The engine is written in TypeScript and shared by the browser and the server. The core knows nothing about specific expansions. Everything game-specific lives in modules.

**What the core provides**
- **Board graph**: hexes, corners, edges, with an open list of hex types.
- **Pieces**: a generic "piece on a corner / edge / hex" model. Roads, ships, settlements, cities, metropolises, knights, walls, harbor settlements, camels, bridges, robber, pirate, barbarians, merchants and dragons are all pieces with properties defined by modules.
- **Cards and tokens**: a registry of card types and decks (resources, commodities, development, three progress decks, event cards, fish, gold coins, VP tokens).
- **Dice**: a pluggable source of rolls: 2d6, balanced dice, event card deck, or the Cities & Knights trio (yellow, red, event die).
- **Costs**: data, not code. A module can add an item or change a cost.
- **Turn phases**: a state machine that modules can add phases to (Special Building Phase, barbarian movement, ship moves, mission resolution).
- **Hooks**: modules react to events like "dice rolled", "production", "7 rolled", "piece built", "turn ended", "compute VP", "hand limit".
- **VP**: computed from contributions every module reports.
- **Seeded RNG and event log**: every game is its seed plus a list of actions, so games can be replayed and resumed exactly.

**What a module provides**
- An id, which modules it needs and which it conflicts with.
- New hex types, pieces, cards, costs, phases, actions and hooks.
- Its own rulebook pages (section 9) and UI panels (for example the C&K city improvement chart or the barbarian track).
- Bot hints so bots understand its pieces (section 5).

**Designing for the main two from the start.** Before the base game is coded, phase 1 writes down everything Seafarers and Cities & Knights need from the core and checks the core design against it:
- Seafarers: sea edges, ships as a second kind of edge piece, moving pieces, hidden hexes, gold choice during production, pirate as a second hex occupant, island ownership.
- Cities & Knights: a second production type (commodities), a third die, three card decks drawn by dice, pieces with levels and active/inactive state, a global event track (barbarians), per-player improvement charts, hand limit changes, an inactive robber at the start, VP target 13.

This list is the acceptance test for the core. The base game ships only once the core passes it, so Seafarers and C&K slot in without a rewrite. The signed-off list, with a test for each line, is in [EXPANSION-REQUIREMENTS.md](EXPANSION-REQUIREMENTS.md).

### 4.2 Realtime multi-device sync

- **Authoritative server.** One server-side room per game. Clients send intents ("build road on edge 34"). The server checks them with the shared engine and sends out events.
- **Hidden information.** Each player gets their own view: their hand and cards in full, others as counts only.
- **Ordered events** with sequence numbers. A client that missed some (sleep, bad Wi-Fi) asks for "everything after #N" or gets a fresh snapshot.
- **Multiple devices.** A seat belongs to an account, not a device. A phone and a laptop can both be open; either can act.
- **Optimistic UI.** Moves show instantly and roll back if the server rejects them.
- **Persistent rooms.** State is saved after every action, so games survive restarts.
- **Async play** (low priority): because rooms persist, async is mostly a lobby setting (long turn timer) plus "your turn" notifications. It comes in the polish phase.
- **Presence**: who's online, who's reconnecting, and a nudge button.

### 4.3 Accounts, profiles, achievements

- **Login**: Google sign-in, plus our own email and password sign-up. Nothing else. Email verification and password reset need an email service; Resend's free tier (a few thousand emails a month) is more than enough. Players can also join a game as a guest from an invite link and upgrade later.
- **Profiles**: display name, avatar, favorite color, chosen theme, stats.
- **Crews**: a friend group with its own leaderboard, history and invite link.
- **Stats**: games, wins, win rate by seat and by map, average VP, records, favorite resource, dice luck (expected vs actual production).
- **Achievements** (examples): first win; win from the last seat; win with no ore; longest road of 12+; 5 knights in a game; Monopoly for 6+ cards; win on every special map; defend Catan from barbarians 3 times; settle 4 islands in one game; beat a Hard bot. Achievements are computed on the server from the game log, so they can't be faked and new ones back-fill from old games.
- **History and replays**: step through any finished game.

---

## 5. Bots

Bots fill empty seats, give practice games, and let one person play alone.

**Difficulty**

| Level | How it thinks |
|---|---|
| **Easy** | Picks reasonable legal moves with some randomness. Rarely trades, sometimes wastes cards. Good for beginners. |
| **Medium** | Scores moves with rules of thumb: production value of spots, resource variety, what it can build next, blocking leaders with the robber, sensible bank trades. |
| **Hard** | Medium's scoring plus look-ahead. It simulates many possible futures (guessing hidden cards from what it has seen played) and picks the move that wins most often. It tracks what's in each opponent's hand from public events. |

**Play styles** (any difficulty)
- **Builder**: roads and settlements, goes for Longest Road.
- **City**: grain and ore, cities and development cards.
- **Army**: development cards and knights, Largest Army.
- **Trader**: trades a lot and uses harbors.
- **Balanced**: adapts to the board.

**Trading with humans.** Bots post and answer trade offers. They won't make trades that help a player who is close to winning, and their offers are judged by how much each resource is worth to them right now.

**Expansions.** Every module includes bot hints (how to value its pieces and actions), so bots can play Seafarers, Cities & Knights and later expansions. Hard bots get the most from this because look-ahead works with any rules.

**Where bots run.** All bots run on the server, inside the game room's Durable Object, which gets 30 seconds of processing time per message even on the free plan (checked in phase 0, see [FREE-TIER.md](FREE-TIER.md)). If a Hard bot's thinking makes players wait too long, it can move to the host player's browser (in a background worker) and send moves through the server like any player; the server still checks every move.

**As built (phase 8).** All three levels run on the server, in the room; Hard thinks for at most 2.5 seconds a move, so it has not needed the browser yet. Bots only see what their seat may see (the same view a player's browser gets). Bots judge moves through the rule modules themselves (production, points and costs from the registry), plus small hints for Cities & Knights, so new modules work without bot changes. In bot-only test games Hard beat Medium 31 of 40, and Medium beat Easy 17 of 20 (`packages/bots/test/arena.test.ts`).

**Testing.** Bots playing thousands of games against each other also test the rules engine and the fairness of maps and seats.

---

## 6. Webapp vs native app

**Recommendation: a PWA (Progressive Web App).**
- One link works on every phone, tablet and computer.
- Installs to the home screen on iOS, Android and desktop, and opens full screen like an app.
- "Your turn" notifications on Android, desktop, and iOS 16.4+ for installed web apps.
- No app store fees or reviews.
- If store listings are wanted later, the same code can be wrapped with Capacitor.

---

## 7. Free hosting stack

**Recommended: Cloudflare, free plan**

| Need | Service | Why |
|---|---|---|
| Website, assets and API | One Cloudflare Worker with static assets | Static files are free and unlimited. One address for site and API keeps login cookies simple. (Changed from Pages + Worker in phase 0.) |
| Live game rooms | Durable Objects (SQLite storage, available on the free plan) | One object per game holds state, runs the rules engine and keeps the live connections. Idle games cost nothing. |
| Accounts, crews, history | One SQLite Durable Object named "main" (`Accounts`) | Same free storage as D1 without setting up a database or giving the deploy token D1 rights. Fine for a friend group; can move to D1 later. (Changed from D1 in phase 7.) |
| Auth | Our own small auth: Google sign-in (OAuth code flow) + email and password (PBKDF2, hashed inside the Accounts object), HttpOnly session cookie | No paid auth service and no extra library. (Changed from Better Auth in phase 7.) |
| Emails (verify, reset password) | Resend free tier | Enough for a friend group. |
| Avatars and theme uploads (later) | Cloudflare R2 | Free storage, no download fees. |

**Checked in phase 0** (details in [FREE-TIER.md](FREE-TIER.md))
- Plain Workers get only 10 ms of processing time per request, but Durable Objects get 30 seconds per request or message on the free plan. So password hashing and all bots run inside Durable Objects. Supabase Auth stays the fallback for logins if the phase 7 benchmark fails.
- Every message a player sends to a room counts toward 100,000 requests a day, enough for about 50 or more full games a day. Keep the protocol lean (no chatty heartbeats).
- Durable Objects and D1 each allow 100,000 row writes a day, so a game writes one row per action and snapshots only occasionally.

**Alternatives considered**: Supabase (free projects pause after a week idle, and game logic would still need a server), Firebase free plan (no server functions, so hidden hands and fair dice are hard), Render, Railway and Fly (free tiers sleep, shrank or ended), Colyseus and boardgame.io (need an always-on server).

---

## 8. UI direction

**Principles**
- Board first. Everything else sits around it and gets out of the way.
- Calm and readable: soft colors, generous spacing, one accent color per player.
- Show, don't tell. Valid spots glow when you pick a build. Resources fly from hexes to hands.
- Fast for regulars: one-tap actions, keyboard shortcuts on desktop, a clear "what can I do now" bar.

**Layout**
- Desktop: board in the center, player panels along the side (VP, card count, development cards, knights, longest road), your hand at the bottom, actions bottom right, log and chat in a side panel.
- Phone (portrait): board on top with pinch-zoom, compact player strip (fits 8), hand and actions in a bottom sheet.
- Expansion panels slot in: C&K improvement chart and barbarian track, Seafarers ship counter, mission boards.
- Trades in their own sheet: drag cards into "give" and "get", see each player's answer live.
- A **?** button in the corner opens the rulebook (section 9) at any time.

**Visual language**
- SVG rendering (crisp at any zoom, easy to theme). PixiJS only if performance needs it.
- Number tokens with pips, 6 and 8 highlighted.
- Dice animation, gentle sounds (toggleable), haptics on phones, light and dark mode.

**Accessibility**: colorblind-safe colors plus a shape per player, terrain icons readable without color, large tap targets, screen reader labels, reduced motion.

**Process**: phase 3 starts with a clickable mockup on desktop and phone for Nachi to approve.

---

## 9. In-game rulebook and guide

Available from the home screen, the lobby, and during a game as a pop-up window (a side panel on desktop, a bottom sheet on phone). Opening it never interrupts the game.

**Contents**
- **Rules for this game**: only the modules active in this game (base, Seafarers, Cities & Knights, the map's special rules, house rules and options the host turned on), with the current VP target and limits filled in.
- **Full rulebook**: every module, browsable and searchable.
- **Cost card**: everything you can build or buy right now, greyed out if you can't afford it.
- **Card glossary**: every development and progress card, with what it does.
- **Map guide**: what each special hex does (gold, volcano, fog, fish, oil).
- **Strategy tips** for beginners, per module.

**Context help**
- Long-press (or hover) any hex, piece, card or button to see the rule behind it.
- When a move is rejected, the message links to the rule ("Too close to another settlement → distance rule").
- First-time tutorial game against Easy bots, with step-by-step hints.

**How it's written**
- Each module ships its own rulebook pages, so the rulebook grows with the game.
- We write the rules text ourselves, in plain language. We don't copy the official rulebooks' wording.
- Fan expansions credit their original authors.

---

## 10. Graphics, themes and skins

**What we can't do.** We won't use, trace, or recreate the official Catan or Colonist artwork, piece designs, card art, logos, or names in the product. They're copyrighted and trademarked, even for a private game. Game mechanics aren't owned, so the rules are fine.

**What we will do: a swappable theme system.** A theme is a folder with a manifest:
- Palette and fonts.
- Art for every hex type (including sea, gold, volcano, fog and expansion hexes).
- Number token style.
- Pieces per player color: road, settlement, city, ship, knight (3 levels), wall, metropolis and expansion pieces.
- Robber, pirate, barbarians, merchant.
- Card faces and backs for every deck.
- Dice, harbors, frame, background, sounds.

Each player can see the board in their own theme. The engine never knows about art. A theme that's missing art for a new expansion falls back to the default theme's art for that piece.

**Planned original themes**
1. **Heritage**: the classic board-game feel with our own art. Painted terrain, wooden-looking pieces, parchment cards, carved-wood frame.
2. **Clean** (default): flat, modern, geometric, very readable on phones.
3. **Night Market**: dark theme with glowing accents.
4. **Papercraft** (stretch): cut-paper look.

**How the art gets made**: the Clean theme as hand-made SVG in code. Heritage and others as original SVG illustration, optionally starting from CC0 asset packs (such as Kenney's free hex kits) and refined by hand. Every asset's source and license goes in `CREDITS.md`.

---

## 11. Build phases

Each phase ends with something we can play or use. Seafarers and Cities & Knights come straight after the base game works online.

| Phase | What | Done when |
|---|---|---|
| **0. Foundations** ✅ | Monorepo, TypeScript, tests, CI, Cloudflare deploy, check free-tier limits. | A test page and test room deploy on every push. |
| **1. Engine core + base game** ✅ | Module system, board graph, pieces, cards, dice, phases, hooks. Base game as the first module. Checked against the Seafarers and C&K requirements list (section 4.1). | Scripted random games finish with no rule errors, and the requirements list is signed off. |
| **2. Maps and generator** ✅ | Map files, Starter / 5–6 presets, Classic / Balanced / Wild / Custom generator, fairness report. | 10,000 boards per mode pass their rules. |
| **3. Local play UI + rulebook** | Approved mockup, hotseat play with the Clean theme, in-game rulebook pop-up and cost card. | A full game on one device, with the rulebook open mid-game. |
| **4. Online multiplayer** ✅ | Game rooms, live sync, hidden info, reconnect, multi-device, lobby, invite links, guest play, turn timer, chat. | 4 friends finish a game on different devices, one refreshing mid-game. |
| **5. Seafarers** ✅ | Ships, pirate, gold, fog of war, island bonus, scenarios, Seafarers map generator. | Every included scenario playable online; generator checks pass. |
| **6. Cities & Knights** ✅ | Commodities, improvements, metropolises, knights, barbarians, progress cards, walls, merchant. Seafarers + C&K combined. | C&K and the combined game playable online. |
| **7. Accounts and crews** ✅ | Google and email sign-up, profiles, guest upgrade, crews. | Games show up in each person's history. |
| **8. Bots** ✅ | Easy and Medium on the server, Hard in the browser, play styles, bot trading, bots for Seafarers and C&K. | A full game with 3 bots; Hard beats Medium most of the time. |
| **9. Bigger games and options** ✅ | 5–6 players, 7–8 player board and paired turns, Colonist-style options, house rules, special maps (Gold Rush, Volcano, Deep Forest, Lakes and shapes). Done: Special Building Phase, paired turns, friendly robber, balanced dice, quiet start, gifts, discard limit, both starting settlements pay, 8 special maps. Not yet: World/Archipelago maps, 2-player neutral player, robber back to the desert, trading between any players, time bank, hidden bank counts. | An 8-player game and every special map work. |
| **10. Stats and achievements** ✅ | Stats, achievements, leaderboards, replays. Done: stats worked out by replaying each game on the server, 14 achievements that back-fill, profile stats, crew leaderboards with average points and achievements, replays of online games. Not yet: a global leaderboard and stats for games played on one device. | Achievements unlock at game end and back-fill. |
| **11. Themes** ✅ | Theme system plus Heritage and Night Market. Done: themes for the board, pieces, harbors, cards and page; picker on the home screen, in games and replays; each device keeps its own choice. Not yet: saving the theme to the account, sounds, custom dice faces. | Switching theme mid-game swaps every asset. |
| **12. PWA polish and async** ✅ | Installable app, notifications, async games, sounds, accessibility, performance on older phones. Done: manifest and icons, offline app shell, Web Push \"your turn\" notifications (needs VAPID secrets, see DEPLOY.md step 7), in-page notifications and tab title, turn timers up to 3 days, sounds and haptics with an off switch, dice animation, reduced motion, focus outlines. Not yet: testing on real iPhone/Android devices, a performance pass on older phones. | Installed on iPhone and Android with working notifications. |
| **13. More expansions** | Traders & Barbarians, Explorers & Pirates, then fan expansions one at a time (rules confirmed with Nachi first), map editor. | Each expansion playable online with rulebook pages and bot support. |

Phases 1 and 2 can overlap. Theme art (phase 11) can start any time after phase 3. Phase 9's 5–6 player work can move earlier if needed.

---

## 12. Repository layout (planned)

```
colonizers/
  apps/
    web/            # React + Vite PWA (UI, themes, SVG board, rulebook)
    server/         # Cloudflare Worker: serves web/, API, Durable Objects (rooms, auth, bots)
  packages/
    engine/         # Core rules engine (no expansion-specific code)
    modules/
      base/
      variants/     # turn styles (special building, paired) and house rules
      seafarers/
      cities-knights/
      special-maps/ # volcano and lake hexes for the special maps
      ...           # later expansions
    maps/           # Map files, generators, fairness scoring
    bots/           # Bot logic, shared by server and browser
    stats/          # Game stats and achievements from a replayed game
    rulebook/       # Rule pages per module (base game done)
    themes/         # Theme manifests and assets
  docs/
    PLAN.md
    DEPLOY.md       # Deploy pipeline and one-time Cloudflare setup
    FREE-TIER.md    # Free plan limits and their effect on the design
```

---

## 13. Decisions so far

From Nachi's answers to the first draft:
1. Groups are usually 4 players. 5–6 and 7–8 must be supported.
2. Async play is allowed but low priority.
3. Login is Google plus our own email sign-up, nothing else.
4. Seafarers and Cities & Knights are both top priority.
5. No favorite house rules, so standard rules are the default.
6. Fair map generation is optional; Classic is the default.

## 14. Open questions

1. For each fan expansion, which version do you play? I'll gather the rules and send a summary to confirm before that phase.
2. Is the order of later expansions in section 1.7 right, or is one more important?
