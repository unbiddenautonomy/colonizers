# Notes for Claude

## Commits, pushes and CI minutes

GitHub Actions minutes are limited each month, so:

- **GitHub checks run only by hand.** The CI checks start only from "Run workflow". Pull requests start nothing. Don't rely on GitHub checks.
- **Test thoroughly on our side before every push and every merge.** Run `pnpm check` (format, lint, typecheck, all tests, build, Worker dry-run: the same steps as CI) and only push or merge when it passes. Say in the PR that it passed locally.
- **Fewer, larger commits.** Commit once per finished piece of work, not after every small step. Squash work-in-progress commits before pushing.
- **Push once, at the end of a task.** Keep history tidy.
- **If you start CI by hand**, do it once, on the final commit. No force-push loops, empty commits or re-runs.
- **Linux runners only.** Workflow jobs use `runs-on: ubuntu-latest`. Never macOS or Windows runners: they use minutes 10× and 2× faster.
- **Don't add new workflows or triggers** (for example on pull requests, branch pushes, or a schedule) without asking first.

## Cloudflare deploys are limited too

- Merging into `main` deploys only when `apps/`, `packages/` or the lockfile
  changed. Batch work so one merge carries it, rather than many small merges.
- Never run `wrangler deploy` by hand or add preview deploys. To deploy without
  a code change, use "Run workflow" on `main` with "Deploy" ticked.
