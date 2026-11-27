# Colonizers: project brief

_Snapshot as of 23 Nov 2026, after PR #128. Read this first when starting fresh. If it disagrees with the code, the code wins, and update this file._

## What it is

A private, original-art remake of a hex-and-resources trading game (Catan / Colonist style) for Nachi's friend groups. It runs as a webapp that works on phones and desktops and syncs live across devices. It has accounts, achievements, bots, hotseat play and online rooms, and it runs on free hosting.

- **Repo:** `unbiddenautonomy/colonizers` (public). Default branch `main`.
- **Live site:** https://colonizers.unbidden.workers.dev
- **Stack:** pnpm monorepo, Node 22. `apps/web` is React + Vite with an SVG board. `apps/server` is a Cloudflare Worker with one Durable Object per room. Rules live in `packages/engine` plus one package per module in `packages/modules/*`. There are also `bots`, `stats`, `maps`, `rulebook` and `modes` packages.
- **Docs in the repo:** this file, `CLAUDE.md` (working rules, read it), `docs/PLAN.md` (master plan, rules, piece counts, phases), `docs/DEPLOY.md`, `docs/FREE-TIER.md`, `docs/EXPANSION-REQUIREMENTS.md`.
- **Modules built:** base, seafarers, cities-knights, traders-barbarians, explorers-pirates, special-maps, variants, plus the expansion and scenario modules under `packages/modules/` (church, civilisations, greed-wealth-power, investors-speculators, kingdoms-warriors, land-water, princes-explorers, soldiers-armies, strategist, treasures-dragons, witches, world-wonders).

## Standing rules

1. Claude may merge its own PRs once checks pass. Merge stacked PRs in order.
2. GitHub Actions minutes are limited. CI starts only by hand ("Run workflow") and runs on Linux runners only. Run `pnpm check` locally before every push and merge, and say in the PR that it passed.
3. Make fewer, larger commits and PRs, and push once at the end of a task.
4. Cloudflare builds are limited. A merge to `main` deploys only if `apps/`, `packages/` or the lockfile changed. No preview deploys, no hand-run `wrangler deploy`, and no repeat deploys of the same change.
5. Don't add new workflows or triggers without asking.

## How Nachi likes to work

- Show a picture or mock-up before any visual change, and wait for a pick.
- Report exactly what was done, plainly.
- Don't put words in art. Use backgrounds and sprites.
- Never reuse official Catan or Colonist artwork. All sets are original.

## Current state of the look

- **Default board:** Basic Clean.
- **Expansion games** (any module beyond base and variants) allow only boards with full piece sets: **Basic Clean, Casino (Emerald & Burgundy, also called Lounge), One Piece and the Wooden board** (see `EXPANSION_THEMES` in `apps/web/src/theme/themes.tsx`). Other boards switch to Basic for that game with a short note and switch back afterwards.
- **Other boards, for the base game:** Deco Emerald and Ivory, Isles Lagoon and Night, Masquerade Velvet, Chart Survey, Straw Hat, Heart, Big Mom, Beasts, Navy.
- **Wooden board** (Nachi's sheets, Nov 2026; `scripts/cut-wood-sheets.py` cuts them into `apps/web/src/art/wood/`): printed tiles for the rarer lands, plus a setting for land icons ("Lands": tiles only or tiles + icons, per device). Metropolises are the sheet's towers with emblems drawn as vectors (`theme/woodEmblems.tsx`); dragons keep their own colours; the stone buildings (chapel, monument, tower, silo) have an owner-coloured part; city walls are plain brown bars with raised ends, the city sitting in them like a cup. Nachi likes to see a picture before any visual change goes in.
- **Piece finish:** Enamel is the default. Enamel + glow and Lounge jewel are the other options.
- **Dragons:** Gold enamel is the default, with Emerald as an option. They are bigger and darker, show strength as 1 to 3 gold pips, and are neutral (not player coloured).
- **Extra sails:** a gold aura plus thin wind lines that arch upward.
- **Metropolis:** a player-coloured Lounge tower with an emblem.
- **Damaged city:** fades by 10%.
- **City walls:** white marble.
- **Merchant and army:** use sheet art on Basic, Lounge and One Piece.
- **Citadel, diocese, monument, silo:** keep their painted colours on a player-coloured base.
- **Legend:** the ◈ button in the game header (in the ☰ menu on phones) opens a pop-up of every piece and tile in this game, each drawn by the real board in the current board's art (`apps/web/src/ui/Legend.tsx`). Add an entry there when a new piece or tile is drawn on the board.
- **One Piece combined board:** Straw Hat crew colours for players. Law rides as settler cargo, a Marine ship is the neutral pirate ship, Zoro is 15% bigger with white pants, and the player ship has a skull sail.

## Decided, don't reopen

- **Removed for good:** the Clean, Tiles, BasicBench, Tabletop Pop, Wonderland, Sunrise Deck and Whitebeard boards, and the Nazca lines (Grand Saloon stays).
- **Rejected:** crimson, bronze and obsidian dragons, golden sails, and using dragon heads or tails as the tier cue for now (that needs new art).

## Open items

- Optional: new dragon-head art, if tiers should be shown by the head.
- Maybe: a bigger base or an outline for the diocese, monument and silo pieces (not yet decided).

## Working tips for a fresh project

- Start each piece of work in its own thread, and keep the project chat for routing.
- Update this file in the same PR when something above changes, so the next restart stays cheap.
- New painted art for a board goes in with `scripts/import-art.py` (resizes, keys out backgrounds, splits sheets). `scripts/make-metro-towers.py` makes the metropolis towers.
- Whole-game QA: `tools/qa/` (bot simulator over every board, mode and house rule, plus Playwright UI scripts). See its README.
- Older task list and decision log: `docs/TASKS.md`. Art specs and prompts: `docs/art/`.
- Keep every useful script, spec and prompt in the repo, never only in the project folder, so the project can move.
- Open images only when needed, since they cost tokens.
