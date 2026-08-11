#!/usr/bin/env bash
# mapstate split FOLD one-shot — main lane runs AFTER wave-6 reports.
# Runs the fold-gate + the plan's verification battery; writes a combined
# log to tmp/fold-gate-REPORT-<ts>.log the main lane audits.
# Exit non-zero on any failure; each gate's key line echoed.

set -u
cd "$(git rev-parse --show-toplevel)" || exit 2
LOG="tmp/fold-gate-$(date +%H%M%S).log"
: >"$LOG"

say() { echo "== $*" | tee -a "$LOG"; }

say "0) fold-gate export multiset (exit!=0 -> blocker)"
node scripts/mapstate-fold-gate.mjs >>"$LOG" 2>&1
FOLD_EXIT=$?
echo "fold-gate: $FOLD_EXIT" | tee -a "$LOG"

say "1) vitest map batch (plan rubric #2)"
npx vitest run \
	tests/unit-active/map-state.test.ts \
	tests/unit-active/map-state-api-contract.test.ts \
	tests/unit-active/cursor-surface-preservation-regression.test.ts \
	tests/unit-active/w11-t7-adapters-init.test.ts \
	--no-coverage >>"$LOG" 2>&1
echo "vitest-map: $?" | tee -a "$LOG"

say "2) residual-window scan (plan rubric #3)"
node tests/residual-window-bridge-inventory-contract.mjs >>"$LOG" 2>&1
echo "residual-scan: $?" | tee -a "$LOG"

say "3) svelte-check (0 new; url-restore pre-existing allowed)"
npx svelte-check --tsconfig ./tsconfig.json >>"$LOG" 2>&1
echo "svelte-check: $?" | tee -a "$LOG"

say "4) build"
npm run build >>"$LOG" 2>&1
echo "build: $?" | tee -a "$LOG"

echo "=== fold log: $LOG ==="
grep -E "^(fold_gate|vitest-map|residual-scan|svelte-check|build):" "$LOG"
