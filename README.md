# Colonizers

A private hex-and-resources trading game for friend groups. The plan is in [docs/PLAN.md](docs/PLAN.md).

## Layout

```
apps/
  web/          React + Vite web app (the board, lobby and rulebook later)
  server/       Cloudflare Worker: serves the web app, the API, and one Durable Object per game room
packages/
  engine/       Rules engine core shared by browser and server (no game-specific rules)
  modules/
    base/       The base game as the first module
docs/
  PLAN.md       Master plan
  DEPLOY.md     How deploys work and the one-time Cloudflare setup
  FREE-TIER.md  Cloudflare free plan limits and what they mean for the design
  EXPANSION-REQUIREMENTS.md  What Seafarers and Cities & Knights need from the core, with tests
```

Expansion modules, maps, bots, rulebook pages and themes get their own packages under `packages/` as their phases start (see PLAN.md section 12).

## Commands

Needs Node 22 and pnpm (`corepack enable`).

| Command        | What it does                                                 |
| -------------- | ------------------------------------------------------------ |
| `pnpm install` | Install everything                                           |
| `pnpm dev`     | Web app with live reload plus the local game server          |
| `pnpm check`   | Formatting, lint, typecheck, tests and build: the same as CI |
| `pnpm test`    | All tests (server tests run inside the real Workers runtime) |

Every push to `main` deploys to Cloudflare once the secrets are set up. See [docs/DEPLOY.md](docs/DEPLOY.md).
