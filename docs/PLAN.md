# Colonizers: Master Plan

A private, browser-based hex-and-resources trading game for our friend groups, in the style of Catan and Colonist.io. This document is the plan only. No game code is written yet.

Status: draft v1, for review by Nachi.

---

## 0. Quick answers to the open questions

| Question | Short answer |
|---|---|
| Preset and random maps? | Yes, both. Presets are stored map files. Random maps come from a generator with three modes: Classic, Balanced (default) and Wild. See section 3. |
| Should generated maps be very fair? Do the originals care? | The originals care a little. The official rulebook only forbids red numbers (6 and 8) from touching, and its spiral token order spreads numbers out. It does nothing to balance resources or starting spots. Colonist adds options like balanced dice but, as far as we know, its random maps mostly enforce the same "no touching 6/8" rule. So a properly fair generator is a real improvement over the originals, and we will build one with a visible fairness report. |
| Do we know the tile and piece counts? | Yes. Exact counts for base 3–4 players and the 5–6 extension are in section 2. For Seafarers and Cities & Knights, each scenario sets its own layout, so we store each scenario as a map file and only need the per-player piece limits, which are listed. |
| Multi-device sync, login, achievements? | Yes. One authoritative game server per room keeps every device in sync, including reconnecting and switching devices mid-game. Login, profiles, stats and achievements are phases 5 and 6. |
| Webapp or full app? | A webapp is enough. We will build it as a PWA, so friends can "install" it to their home screen on iPhone, Android and desktop, get full-screen play and notifications, with no app store. If we ever want store listings, the same code can be wrapped later with Capacitor. |
| Free hosting? | Yes. Recommended stack is Cloudflare (Pages + Workers + Durable Objects + D1), all on the free plan. No paid storage needed at friend-group scale. See section 6. |
| Clean, beautiful UI? | Yes. Board-first, calm layout, mobile-first, with smooth animations. See section 7. |
| Original Catan or Colonist graphics, plus our own sets? | We can't use or recreate the official Catan or Colonist art, pieces or logos. They are copyrighted and trademarked, even for a private game. What we can do is a swappable theme system with our own sets, including a "Heritage" theme that gives the same warm, classic board-game feel (wood, parchment, painted terrain) with original artwork. See section 8. |

---

## 1. Rules

The rules engine implements the base game exactly, and every house rule or Colonist-style option is a switch in the game settings.

### 1.1 Base game (3–4 players)

**Goal.** First player to reach 10 victory points (VP) **on their own turn** wins.

**Victory points.**
- Settlement: 1 VP. City: 2 VP.
- Longest Road card: 2 VP (first player with an unbroken road of at least 5 segments; taken by anyone who beats it strictly).
- Largest Army card: 2 VP (first player to play 3 knights; taken by anyone who exceeds it strictly).
- Victory Point development card: 1 VP each (kept hidden until the player wins, or revealed at game end).

**Setup (snake draft).**
1. Random seat order. Round 1 goes 1 → N: each player places a settlement and a road touching it.
2. Round 2 goes N → 1: each player places a second settlement and road.
3. Each player collects one resource for each terrain hex next to their **second** settlement.
4. Distance rule applies: no settlement may be on a corner adjacent to another settlement or city (of anyone).

**Turn order.**
1. **Roll** two dice (a knight may be played before the roll).
2. **Production.** Every hex with the rolled number produces: 1 resource per adjacent settlement, 2 per adjacent city. The hex with the robber produces nothing.
   - Bank shortage: if the bank can't pay everyone owed a resource, nobody gets that resource, unless only one player is owed it, in which case they get whatever is left.
3. **Rolled a 7.** No production. Every player with more than 7 cards discards half, rounded down. The roller moves the robber to a different hex and steals one random card from a player with a building on that hex.
4. **Trade and build** (one combined phase, in any order):
   - Domestic trade with other players (only with the active player; no giving cards away for nothing unless the house rule allows it).
   - Maritime trade with the bank: 4:1 always, 3:1 at a generic harbor, 2:1 of a specific resource at that resource's harbor.
   - Build and buy (costs below).
   - Play at most **one** development card per turn, and not one bought this turn (VP cards excepted, they are never "played").
5. End turn.

**Building costs.**

| Item | Cost | Notes |
|---|---|---|
| Road | 1 brick, 1 lumber | Must connect to your road, settlement or city. |
| Settlement | 1 brick, 1 lumber, 1 wool, 1 grain | Must touch your road; distance rule. |
| City | 2 grain, 3 ore | Upgrades your settlement; the settlement piece returns to supply. |
| Development card | 1 wool, 1 grain, 1 ore | Drawn face down. |

**Development cards.**
- **Knight**: move the robber and steal, counts toward Largest Army.
- **Road Building**: place 2 free roads.
- **Year of Plenty**: take any 2 resources from the bank.
- **Monopoly**: name a resource; every other player gives you all of theirs.
- **Victory Point**: 1 VP, hidden.

**Longest Road details.** Counted as the longest single path with no repeated segments. An opponent's settlement or city on a corner breaks the path. If the holder's road is broken and there is a tie for the new longest, the card is set aside until one player is strictly longest. Ships (Seafarers) count as part of a road path only if connected through a settlement or city.

**Piece limits.** A player can't build what they don't have left in supply: 15 roads, 5 settlements, 4 cities.

### 1.2 5–6 player extension

- Bigger board and more cards (counts in section 2.2).
- Between turns, a **Special Building Phase**: after each player's turn, every other player in order may build or buy development cards (no trading, no playing cards).
- Newer printings offer an alternative "Paired Players" rule, where two players take turns at once. We will support the Special Building Phase first and keep Paired Players as an option for later.

### 1.3 Colonist-style options (to verify against Colonist's current lobby settings before coding)

These are the online-specific options Colonist is known for. We will match their behaviour where it makes sense.

- **Friendly robber**: robber can't be placed on a hex touching a player with 2 or fewer visible VP.
- **Balanced dice**: rolls are drawn so the long-run distribution matches the true odds more closely and streaks are damped. Our design: a shuffled "deck" of all 36 dice outcomes, reshuffled when 5–10 cards remain, plus a mild penalty on numbers that came up very recently. Fully seeded and auditable.
- **VP target**: 10 by default, adjustable (e.g. 8 to 20).
- **Discard limit**: 7 by default, adjustable.
- **Turn timer**: off or a set number of seconds per action, with a time bank.
- **Hide bank card counts**: on or off.
- **Visible hand sizes**: everyone always sees how many cards each player holds (on by default in online play).
- **Trade offers UI**: active player posts an offer; others accept, decline or counter; active player picks who to trade with.
- **Bots** to fill empty seats (later phase).

### 1.4 House rules we will support as switches

- No robber (or friendly robber) until every player has had N turns.
- First settlement gives resources too (faster starts).
- Gifting cards allowed or not.
- Trading only on your own turn (official) vs. between any players.
- 2-player variant (neutral player pieces).
- Fixed vs. random seat order; random vs. chosen starting player.
- Number of starting placements (2 standard, 3 for big boards).
- "Robber returns to desert after each 7" variant.

### 1.5 Expansions (later phases)

**Seafarers.** Adds sea, islands, ships, gold fields and a pirate.
- Ships: cost 1 lumber + 1 wool, built on edges between sea and land or sea and sea. Open ends can be moved once per turn (not a ship placed this turn).
- Gold field hex: produces 1 resource of the owner's choice per building (2 for a city).
- Pirate: on a 7 or knight, a player may move the pirate instead of the robber; it blocks ships next to it and steals from a ship owner.
- Bonus VP tokens for settling new islands (scenario-dependent).
- VP target set by scenario (usually 12–14).

**Cities & Knights.** A deeper rework.
- Commodities: paper (forest cities), cloth (pasture cities), coin (mountain cities).
- City improvements in three tracks (trade, politics, science), unlocking progress cards and metropolises.
- Knights (basic, strong, mighty), activated with grain, defend against barbarians.
- Barbarian ship track and an event die. If barbarians win, the weakest-defended players lose a city.
- Progress cards replace development cards. Robber is inactive until the first barbarian attack.
- City walls raise the hand limit by 2 each.
- VP target 13.

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

**Number tokens: 18** (A–R in the official spiral order)

| Number | 2 | 3 | 4 | 5 | 6 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|
| Tokens | 1 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 1 |
| Pips (ways to roll, out of 36) | 1 | 2 | 3 | 4 | 5 | 5 | 4 | 3 | 2 | 1 |

Total pips on the board: 58. Official spiral order for the A–R tokens: 5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11.

**Harbors: 9** (4 generic 3:1, plus one 2:1 each for lumber, wool, grain, brick, ore)

**Pieces per player (4 colors):** 15 roads, 5 settlements, 4 cities.

**Cards**
- Resource cards: 95 (19 each of lumber, wool, grain, brick, ore).
- Development cards: 25 = 14 Knight, 5 Victory Point, 2 Road Building, 2 Year of Plenty, 2 Monopoly.
- Special cards: Longest Road, Largest Army.
- Building cost reference cards (UI only for us).

**Other:** 1 robber, 2 dice, frame/sea border.

### 2.2 5–6 player extension (combined totals with the base game)

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

- Number tokens for 5–6 players: 2 and 12 have 2 each; 3, 4, 5, 6, 8, 9, 10, 11 have 3 each (28 total).
- Development cards for 5–6 players: 20 Knight, 5 Victory Point, 3 Road Building, 3 Year of Plenty, 3 Monopoly.

### 2.3 Seafarers (what we need to know)

Each Seafarers scenario defines its own map, so we encode every scenario as a preset file (hexes, numbers, harbors, starting rules, VP target). The fixed parts:
- Ships: 15 per player.
- 1 pirate ship.
- Gold field hexes and sea hexes, placed per scenario.
- Bonus VP tokens for new islands, per scenario.

Full box counts will be cross-checked against the rulebook in phase 10 before coding scenarios.

### 2.4 Cities & Knights (what we need to know)

- Commodity cards: 36 (12 each of paper, cloth, coin).
- Progress cards: 54, three decks of 18.
  - Science (green): Alchemist 2, Crane 2, Engineer 1, Inventor 2, Irrigation 2, Medicine 2, Mining 2, Printer 1, Road Building 2, Smith 2.
  - Trade (yellow): Commercial Harbor 2, Master Merchant 2, Merchant 6, Merchant Fleet 2, Resource Monopoly 4, Trade Monopoly 2.
  - Politics (blue): Bishop 2, Constitution 1, Deserter 2, Diplomat 2, Intrigue 2, Saboteur 2, Spy 3, Warlord 2, Wedding 2.
- Per player: 6 knights (2 basic, 2 strong, 2 mighty), 3 city walls, 1 city improvement chart.
- 3 metropolises, 1 merchant, 6 "Defender" VP cards, barbarian ship and track, event die (3 barbarian ship faces and 3 colored city-gate faces), and a red die that pairs with the regular yellow die.

---

## 3. Maps

### 3.1 Board model

- Hexes use axial (cube) coordinates. Corners (where settlements go) and edges (where roads go) get stable ids derived from coordinates, so the same map always has the same ids for replays.
- A map file (JSON) holds: hex list with terrain, number tokens, harbors (edge + type), robber start, allowed player counts, and optional rules (VP target, special pieces).

### 3.2 Preset maps

- **Starter**: the classic beginner layout feel, re-created with our own coordinates (layouts are not copyrightable art, but we will design our own balanced starter rather than copy the printed one exactly).
- **Classic 5–6**: our own fixed layout for the bigger board.
- **Original shapes** (later): diamond, ring with a lake in the middle, two continents, long river, small 3-player island. Each one ships with hand-checked fairness.
- **Seafarers scenarios** (phase 10).
- **Custom map editor** (stretch goal): paint hexes, drop tokens, save and share with the group.

### 3.3 Random generation and fairness

**How fair are the originals?**
- The official variable setup has one hard rule: red numbers (6 and 8) must never touch. The A–R spiral order also spreads tokens naturally.
- Nothing balances resources. A board can easily have both ore hexes on 2 and 12, or all the good numbers on grain. Players often complain about this in online play.
- So "very fair" is our improvement, not something the originals do. We will keep a Classic mode for purists.

**Generator modes**
- **Classic**: shuffle terrain, then tokens in spiral order or random with only the official rule (no touching 6/8).
- **Balanced** (default): hard constraints plus a scored search (below).
- **Wild**: fully random, with only "no touching 6/8". For chaos nights.

**Hard constraints (Balanced mode)**
1. No 6 touches an 8, and no two 6s or two 8s touch.
2. No two identical numbers touch.
3. 2 and 12 don't touch each other.
4. No three hexes of the same terrain form a connected cluster.
5. The four red tokens (6, 6, 8, 8) sit on at least three different resources.
6. No resource gets both of its tokens only from 2/3/11/12 (each resource has at least one hex with 4+ pips).

**Soft goals, scored (lower score is better)**
1. **Pips per resource** close to its fair share. Fair share = total pips × (hexes of that resource / producing hexes). For the base game: lumber, wool and grain about 12.9 pips each; brick and ore about 9.7. Ore and brick are meant to be scarcer, so we balance per hex, not to equal totals.
2. **Spot quality.** A snake draft for 4 players picks 8 starting spots. We look at the best 8 corners (by pip sum, with a bonus for resource variety) and keep the gap between the best and 8th-best small, so seat 4 isn't punished.
3. **No monster spots.** Cap the best corner at 12 pips (the maximum possible with the red rule is 13).
4. **Regional balance.** Split the board into three sectors; pips per sector stay within a few points of each other.
5. **Harbor fairness.** A 2:1 harbor next to a high-pip hex of the same resource gets a penalty.
6. **Desert placement.** Not fixed to the center, but scored so it doesn't wipe out a whole coast's options.

**Algorithm**
1. Seeded random generation (the seed is shown so the board can be replayed or shared).
2. Rejection sampling until hard constraints pass.
3. Hill-climbing: swap pairs of tokens or terrains for a few thousand steps to lower the score.
4. Accept when the score is below a threshold; otherwise restart with a new seed. Runs in well under a second in the browser.

**Fairness report (shown in the lobby)**
- Pips per resource bar chart, best starting spots, a simple "Fairness: A/B/C" grade, and a Reroll button. The host can lock the board before starting.

**Testing**
- Property tests on thousands of seeds: every generated board meets the hard constraints, and the score distribution stays inside targets.
- Simulation with simple bots to check that seat position doesn't affect win rate much.

---

## 4. Architecture

### 4.1 Shared rules engine

- Written in TypeScript, used by both the browser and the server.
- Pure function: `apply(state, action) → { state, events }`. No randomness inside; dice and shuffles come from a seeded RNG owned by the server.
- Every game is stored as its seed plus the action log, so any game can be replayed, audited, or resumed exactly.
- Validators return clear reasons ("not your turn", "too close to another settlement") that the UI can show.

### 4.2 Realtime multi-device sync

- **Authoritative server.** One server-side game room per game. Clients never change state themselves; they send intents ("build road on edge 34"), the server validates with the shared engine, then broadcasts events.
- **Hidden information.** Each player gets their own view: their hand and dev cards in full, everyone else as counts only. The server strips hidden data before sending.
- **Ordered events.** Every event has a sequence number. A client that misses events (sleep, bad Wi-Fi) asks for "everything after #N" or gets a fresh snapshot.
- **Multiple devices.** A seat belongs to an account, not a device. Opening the game on a phone while it's open on a laptop just attaches a second live view; either can act.
- **Optimistic UI.** Moves like placing a road show instantly with a subtle pending state, and roll back if the server rejects them.
- **Persistent rooms.** Game state is saved after every action, so games survive server restarts and can be paused and resumed days later (good for async play across time zones).
- **Presence.** Show who's online, who is reconnecting, and a "nudge" button.

### 4.3 Accounts, profiles, achievements

- **Login**: Google and Discord sign-in (Discord suits gaming friend groups), plus guest play via invite link so nobody is blocked. Guests can upgrade to an account and keep their stats.
- **Profiles**: display name, avatar, favorite color, chosen theme, stats.
- **Groups ("crews")**: a friend group with its own leaderboard, game history and invite link.
- **Stats**: games, wins, win rate by seat, average VP, longest road record, favorite resource, dice luck (expected vs actual production).
- **Achievements** (examples):
  - First win; win from last seat; win with no ore; win in under 60 minutes.
  - Longest road of 12+; 5 knights in a game; Monopoly for 6+ cards.
  - Roll a 7 three times in a row (unlucky), get robbed 5 times in a game.
  - Play 10 games with the same crew; win on every preset map.
  - Achievements are computed on the server from the event log at game end, so they can't be faked and can be added later and back-filled from old games.
- **Game history and replays**: step through any finished game.

---

## 5. Webapp vs native app

**Recommendation: a PWA (Progressive Web App).**

- Works on every phone, tablet and computer from one link. Friends just open the invite.
- Can be installed to the home screen on iOS, Android and desktop, opens full screen like an app.
- Web push notifications ("your turn") work on Android and desktop, and on iOS for installed web apps (iOS 16.4+).
- No app store fees, reviews or developer accounts.
- If we later want App Store or Play Store listings, we wrap the same code with Capacitor. Nothing is lost by starting as a PWA.

A native app would only be worth it for heavy 3D graphics or deep OS integration, and we need neither.

---

## 6. Free hosting stack

**Recommended: Cloudflare, free plan**

| Need | Service | Why |
|---|---|---|
| Website and assets | Cloudflare Pages | Free, global CDN, auto-deploy from GitHub. |
| API | Cloudflare Workers | Free tier is generous for a friend group. |
| Live game rooms | Durable Objects (SQLite storage, on the free plan) | One object per game: holds state, runs the rules engine, keeps WebSocket connections. Hibernating WebSockets mean idle games cost nothing. |
| Accounts, stats, achievements, history | Cloudflare D1 (SQLite) | Free tier storage is far more than we need. |
| Auth | Better Auth (or Auth.js) running on Workers + D1, with Google and Discord OAuth | No paid auth service; no email sending needed. |
| Avatars and theme uploads (later) | Cloudflare R2 | Free tier storage, no egress fees. |

Free limits change over time, so we re-check them in phase 0. At our scale (a few groups, a few games a day), we should stay far below them.

**Alternatives considered**
- **Supabase** (Postgres + Auth + Realtime): great auth and database, but free projects pause after a week of inactivity, and game logic would still need a separate server for hidden info. Good fallback for accounts only.
- **Firebase (Spark plan)**: free auth and database, but no server functions on the free plan, which makes hidden hands and fair dice hard.
- **Render / Railway / Fly**: free tiers sleep, have shrunk, or were removed; not reliable for live games.
- **Colyseus or boardgame.io**: game frameworks that need an always-on Node server; we'd rather use Durable Objects, which fit "one room per game" naturally.

---

## 7. UI direction

**Principles**
- Board first. The map takes most of the screen; everything else sits around it and gets out of the way.
- Calm and readable. Soft colors, generous spacing, one accent color per player.
- Show, don't tell. Valid placements glow when you pick "Build road". Resources visibly fly from hexes to hands on each roll.
- Fast for regulars. One-tap actions, keyboard shortcuts on desktop, and a clear "what can I do now" bar.

**Layout**
- Desktop: board in the center, players along the top or side (avatar, VP, card count, dev count, knights, longest road), your hand along the bottom, action bar bottom right, log and chat in a collapsible side panel.
- Phone (portrait): board on top with pinch-zoom and pan, compact player strip, hand and actions in a bottom sheet that slides up.
- Trades in a dedicated sheet: drag cards into "give" and "get", see responses from each player live.

**Visual language**
- Rendering in SVG (crisp at any zoom, easy to theme, works with CSS animations). Upgrade to a canvas/WebGL renderer such as PixiJS only if performance needs it.
- Number tokens show pips (dots), with 6 and 8 highlighted, for quick reading.
- Dice roll animation, gentle sounds (toggleable), haptics on phones.
- Light and dark mode.

**Accessibility**
- Colorblind-safe player colors, plus a shape or pattern per player.
- Terrain readable without color (each hex has a distinct icon).
- Large tap targets, screen reader labels on actions, reduced-motion setting.

**Design process**
- Phase 3 starts with a clickable mockup of the main screen on desktop and phone for Nachi to approve before building.

---

## 8. Graphics, themes and skins

**What we can't do.** We won't use, trace, or recreate the official Catan or Colonist artwork, piece designs, card art, logos, or names in the product. They are copyrighted and trademarked, even for a private game. Game mechanics themselves aren't owned, so the rules are fine.

**What we will do: a swappable theme system.**

A theme is a folder with a manifest file:
- Palette and fonts (as design tokens).
- Terrain hex art for each terrain (and sea, gold, etc.).
- Number token style.
- Piece art per player color: road, settlement, city, ship, knight.
- Robber and pirate.
- Card faces and backs (resources, development, progress).
- Dice, harbor markers, board frame and background.
- Optional sounds and animation settings.

Themes are swappable per player (each person can see the board in their own theme) and per game. The game engine never knows about art.

**Planned original themes**
1. **Heritage**: the classic board-game feel, our own art. Warm painted terrain, wooden-looking pieces, parchment cards, a carved-wood frame. Evokes the original's mood without copying any of it.
2. **Clean** (default): flat, modern, geometric. Soft pastel terrain with simple icons, very readable on phones.
3. **Night Market**: dark mode theme with glowing accents, lanterns, deep blues.
4. **Papercraft** (stretch): cut-paper look with soft shadows.

**How the art gets made**
- I can draw the Clean theme as hand-made SVG directly in code.
- Heritage and others: original illustration in SVG, optionally starting from CC0 asset packs (for example Kenney's free hex kits) as a base, and refined by hand.
- Every asset's source and license is listed in a `CREDITS.md` file.

---

## 9. Build phases

Each phase ends with something we can play or use.

| Phase | What | Done when |
|---|---|---|
| **0. Foundations** | Monorepo (web app, server, shared engine), TypeScript, lint, tests, CI on GitHub, Cloudflare deploy pipeline, check current free-tier limits. | A "hello" page and a test room deploy automatically on every push. |
| **1. Rules engine** | Base game rules as a pure, seeded, event-logged engine. Full unit tests for every rule in section 1.1. | A script can play full random games end to end with no rule errors. |
| **2. Board and maps** | Hex model, map files, Starter and Classic presets, random generator with Classic/Balanced/Wild modes, fairness score and report. | 10,000 generated boards all pass the hard constraints; fairness report renders. |
| **3. Local play UI** | Mockup approval, then a playable hotseat game in the browser with the Clean theme. | We can play a full game on one device. |
| **4. Online multiplayer** | Durable Object game rooms, WebSockets, hidden info, reconnect, multi-device, lobby, invite links, guest play, turn timer, chat. | 4 friends finish a game on different devices, including one who refreshes mid-game. |
| **5. Accounts and crews** | Google/Discord login, profiles, guest upgrade, friend groups. | Games are linked to accounts and show up in each person's history. |
| **6. Stats and achievements** | Stats pages, achievements, crew leaderboards, game replays. | Achievements unlock live at game end and back-fill from old games. |
| **7. Themes** | Theme system plus Heritage and Night Market themes, per-player theme choice. | Switching theme mid-game changes every asset instantly. |
| **8. PWA polish** | Installable app, push notifications for "your turn", sounds, haptics, accessibility pass, performance on older phones. | Installed on an iPhone and an Android phone, notifications work. |
| **9. Options and 5–6 players** | Colonist-style options (friendly robber, balanced dice, VP target, discard limit, hide bank), house rules, 5–6 player board with Special Building Phase. | A 6-player game works with all options. |
| **10. Expansions and bots** | Seafarers scenarios, then Cities & Knights; simple bots to fill seats; map editor. | Each scenario playable online. |

Phases 1 and 2 can run in parallel. Phase 7 art can start any time after phase 3.

---

## 10. Repository layout (planned)

```
colonizers/
  apps/
    web/          # React + Vite PWA (UI, themes, SVG board)
    server/       # Cloudflare Worker + Durable Objects (rooms, auth, API)
  packages/
    engine/       # Pure rules engine, shared by web and server
    maps/         # Map files, generator, fairness scoring
    themes/       # Theme manifests and assets
  docs/
    PLAN.md
```

---

## 11. Questions for Nachi

1. How big are the groups usually? If 5–6 players is common, we can move the 5–6 board earlier.
2. Do you want async play (games over several days, with "your turn" notifications), or mostly live sessions?
3. Login: are Google and Discord the right sign-in options for your friends?
4. Which expansion matters most after the base game: Seafarers or Cities & Knights?
5. Any favorite house rules your groups already use?
