#!/usr/bin/env bash
#
# verify-lane-wave.sh — semi-supervised verification of a parallel lane's landing
# wave. Run after a parallel lane lands commits (git log --all shows new refs).
# Prints: what landed (one line per commit), any cross-lane index pollution in
# their commits (stray files), clause-classified status of the battery.
#
# Usage:
#   bash scripts/verify-lane-wave.sh [since-sha-or-date]
#   (default: verify everything newer than HEAD~5's date; pass explicit base to
#   anchor on a stable point e.g. bash scripts/verify-lane-wave.sh HEAD~6)
#
# This is READ-ONLY: never stages, commits, or touches lane WIP. It only reads
# refs and runs the deterministic gates that must pass regardless of owner.

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

BASE="${1:-HEAD}"

log() { echo "[$0] $*"; }

log "lane commits on master newer than ${BASE}:"
git log "${BASE}"..master --format='%h %ad %s' --date=short | head -20 || true

log ""
log "per-commit files (real content only; pollution check)"
git log "${BASE}"..master --format='%H %s' | grep -vE '^(index on master|checkpoint)' | while read -r sha rest; do
	files="$(git diff-tree --no-commit-id --name-only -r "${sha}" 2>/dev/null | wc -l)"
	if [ "${files}" -gt 0 ]; then
		log "  ${sha:0:7} (${files} files): $(echo "${rest}" | cut -c1-70)"
	fi
done

log ""
log "gates that must hold regardless of lane activity:"
log "- commit-purity ..."
npx vitest run tests/unit-active/commit-purity-invariant.test.ts --no-coverage 2>&1 | tail -2
log "- merge-reland guard ..."
npx vitest run tests/unit-active/merge-reland-guard.test.ts --no-coverage 2>&1 | tail -2

log ""
log "classification rubric (manual, lane-coordinated):"
log "A = regression from lane landing (report to lane / fix separately)"
log "B = lane WIP interference (dirty tree, don't touch)"
log "C = flake (passes solo — timing/env)"
