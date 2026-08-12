#!/usr/bin/env bash
# semantic-threads carve FOLD one-shot (main-lane, 2026-08-12)
# Run AFTER the lane lands the normalize carve on upstream.
set -u
cd "$(git rev-parse --show-toplevel)" || exit 2
LOG="tmp/carve-fold-$(date +%H%M%S).log"
: > "$LOG"
say() { echo "== $*" | tee -a "$LOG"; }
say "0) carve fold-gate (8 checks)"
node scripts/semantic-carve-gate.mjs --baseline upstream/master >> "$LOG" 2>&1
echo "carve-gate: $?" | tee -a "$LOG"
say "1) semantic-threads suites"
npx vitest run \
  tests/unit-active/semantic-threads-load.test.ts \
  tests/unit-active/semantic-threads-worker-lifecycle.test.ts \
  tests/unit-active/t1-semantic-threads-leadid-null.test.ts \
  --no-coverage >> "$LOG" 2>&1
echo "vitest-ct: $?" | tee -a "$LOG"
say "2) svelte-check"
npx svelte-check --tsconfig ./tsconfig.json >> "$LOG" 2>&1
echo "svelte: $?" | tee -a "$LOG"
echo; echo "=== log: $LOG ==="
grep -E "^(carve-gate|vitest-ct|svelte):" "$LOG"
