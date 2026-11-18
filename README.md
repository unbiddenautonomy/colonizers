# Colonizers

A private hex-and-resources trading game for friend groups. The plan is in [docs/PLAN.md](docs/PLAN.md).

## Layout

```
apps/
  web/          React + Vite web app: home, online lobby and game, hotseat play, SVG board, rulebook
  server/       Cloudflare Worker: serves the web app, the room API, accounts, and one Durable Object per room (lobby, chat, timer, bots, authoritative game)
packages/
  engine/       Rules engine core shared by browser and server (no game-specific rules)
  modules/
    base/       The base game as the first module
    seafarers/  Seafarers: ships, pirate, gold fields, fog, island bonus
    cities-knights/  Cities & Knights: commodities, improvements, knights, barbarians, progress cards
    special-maps/    Volcano and lake hexes for the special maps
    variants/        Special Building Phase, paired turns and house rules
  bots/         Computer players (Easy, Medium, Hard; five play styles), used by rooms and local games
  stats/        Game stats, achievements and career totals, worked out by replaying a game
  maps/         Map files, preset boards, board generator, fairness report, Seafarers scenarios
  rulebook/     Plain-language rule pages, card glossary, cost card data
docs/
  PLAN.md       Master plan
  DEPLOY.md     How deploys work and the one-time Cloudflare setup
  FREE-TIER.md  Cloudflare free plan limits and what they mean for the design
  EXPANSION-REQUIREMENTS.md  What Seafarers and Cities & Knights need from the core, with tests
```

Expansion modules, maps, bots, rulebook pages and themes get their own packages under `packages/` as their phases start (see PLAN.md section 12).

## Commands

Needs Node 22 and pnpm (`corepack enable`).

| Command        | What it does                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| `pnpm install` | Install everything                                                                                                    |
| `pnpm dev`     | Web app with live reload plus the local game server                                                                   |
| `pnpm check`   | Formatting, lint, typecheck, tests, build and Worker bundle check: the same as CI. Run it before every push and merge |
| `pnpm test`    | All tests (server tests run inside the real Workers runtime)                                                          |

Every push to `main` deploys to Cloudflare once the secrets are set up. See [docs/DEPLOY.md](docs/DEPLOY.md).
