# QA harness (from the full test run, 18 November 2026)

Scripts and game lists behind the report "Colonizers full test run: bugs and
improvement ideas". The raw results files are not kept in the repo. `bot-freeze/game.cjs`
is a small Playwright repro from 19 November that starts a local bot game and saves it.

Not part of `pnpm check`: these are rough harness scripts, ignored by lint and Prettier.

## What is here

- `scripts/sim-core.ts`: plays a whole game with bots through the server's own
  set-up code (`buildConfig`) and checks every move. `REPO=/path/to/checkout`
  picks the code to test. It can also seat an absent player who only gets the
  turn timer's moves (`afk`), and check every player's hidden-hands view.
- `scripts/run-specs.ts specs.json out.jsonl [shard] [shards]`: runs a list of
  games and writes one JSON line per game. `gen-specs.ts` builds the lists.
- `scripts/ui-*.cjs`, `diag-*.cjs`, `repro-discard*.cjs`: Playwright scripts for
  the pages, the lobby, online rooms, phones and the discard crash. They expect
  the web app on :5173 and the server on :8787 (see `uilib.cjs`).
- `scripts/dbg-*.ts`: one-off looks at single problems (free road freeze,
  Greece loop, Papua setup, seat bias, progress cards).
- `specs/`: the game lists. Runs write one JSON line per game.

## Sweeps from the 18 Nov run

| Results file | Games | What |
| --- | --- | --- |
| boards.jsonl | 483 | every board at every player count |
| known.jsonl | 174 | the four known problem setups |
| modes.jsonl | 472 | every expansion and supported pair |
| afk.jsonl | 76 | one absent player on a turn timer |
| view.jsonl | 221 | hidden-hands view check on every move |
| arena-lite.jsonl | 238 | bot levels, styles and seats |
| options.jsonl | 90 | house rules |
| combos.jsonl | 189 | expansion mixes |
| online-modes.jsonl | 51 | online rooms in real browsers |
| ui-walk.jsonl | 96 | 48 ready-made setups as a human seat, desktop and phone |

Outcomes: `won`, `deadlock` (nobody can act), `maxRounds` (150 or 300 rounds),
`maxActions` (stopped after 4 minutes of computing).

Two warnings in the files are not game bugs: "cards not conserved: gold" is a
wrong starting count in the harness, and "replay differs from the live state"
comes from Greed, Wealth & Power helpers that write empty placeholders.

## Run it again

Run from `tools/qa/scripts` after `pnpm install`. The scripts default to this checkout
(`../../..`); set `REPO=<other checkout>` to test another one.

    cd tools/qa/scripts
    ../../../packages/maps/node_modules/.bin/tsx run-specs.ts ../specs/afk.json /tmp/afk.jsonl
    ./run-all.sh boards known      # several sweeps, results in tools/qa/out/

The sign-in names and password inside `ui-account2.cjs` and `ui-online5.cjs`
belong to throwaway accounts on the local test server only.
