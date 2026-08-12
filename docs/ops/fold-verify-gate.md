# Post-Fold Verify Gate (fold-wait → auto-fire)

When a parallel lane applies a multi-file merge into the shared worktree and you
need post-merge verification without idle polling:

1. `scripts/fold-watch.sh` — background job, 20s poll for exit-criteria (file
   existence, NOT git state — lanes apply to the worktree before committing),
   auto-fires the gate the moment the criteria are met. Logs to
   `tmp/fold-watch.log` with gate exit code.
2. `scripts/post-fold-verify.sh` — the gate: full committed coverage layer
   (14+ contract files) + 5 invariant suites. Self-resolving vitest entry
   (direct `node node_modules/vitest/vitest.mjs` — survives lane node_modules/
   .bin wipes during their install churn).
3. Proven: 2026-08-12 — fired 60s after launch, gate green 96/96, caught the
   map-state wave-6 split landing.
