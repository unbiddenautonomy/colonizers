# Working in this repo

## GitHub Actions minutes are limited

- Make fewer, larger commits. Batch related changes into one commit and one PR,
  and push only when the work is ready, not after every small step.
- Every push to an open PR starts a CI run, so avoid push-fix-push loops: run
  the checks locally (`pnpm typecheck`, `pnpm test`, `pnpm build`) before pushing.
- No force-push loops, empty commits or re-runs to retrigger CI.
- Workflows must run on Linux runners (`ubuntu-latest`), never macOS or Windows.
