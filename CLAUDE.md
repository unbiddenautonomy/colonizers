# Working in this repo

## GitHub Actions minutes are limited

- Make fewer, larger commits. Batch related changes into one commit and one PR,
  and push only when the work is ready, not after every small step.
- Every push to an open PR starts a CI run, so avoid push-fix-push loops: run
  the checks locally (`pnpm typecheck`, `pnpm test`, `pnpm build`) before pushing.
- No force-push loops, empty commits or re-runs to retrigger CI.
- Workflows must run on Linux runners (`ubuntu-latest`), never macOS or Windows.

## Cloudflare deploys are limited too

- Merging into `main` deploys only when `apps/`, `packages/` or the lockfile
  changed. Batch work so one merge carries it, rather than many small merges.
- Never run `wrangler deploy` by hand or add preview deploys. To deploy without
  a code change, use "Run workflow" on `main`.
