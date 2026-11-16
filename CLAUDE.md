# Notes for Claude

## Commits, pushes and CI minutes

GitHub Actions minutes are limited each month, so:

- **Fewer, larger commits.** Commit once per finished piece of work, not after every small step. Squash work-in-progress commits before pushing.
- **Push once, at the end of a task.** Every push to `main` or to a branch with an open pull request starts CI, so don't push after each commit. Run the checks locally (`pnpm typecheck`, `pnpm test`, `pnpm build`) before pushing, to avoid push-fix-push loops.
- **Skip CI when it isn't needed.** For changes that don't affect the build or tests (docs, comments, notes), put `[skip ci]` in the commit message.
- **No force-push loops, empty commits or re-runs to retrigger CI.**
- **Linux runners only.** Workflow jobs use `runs-on: ubuntu-latest`. Never macOS or Windows runners: they use minutes 10× and 2× faster.
- **Don't add new workflows or triggers** (for example on every branch push, or on a schedule) without asking first.

## Cloudflare deploys are limited too

- Merging into `main` deploys only when `apps/`, `packages/` or the lockfile
  changed. Batch work so one merge carries it, rather than many small merges.
- Never run `wrangler deploy` by hand or add preview deploys. To deploy without
  a code change, use "Run workflow" on `main`.
