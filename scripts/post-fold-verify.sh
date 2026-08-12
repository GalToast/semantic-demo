#!/usr/bin/env bash
# Post-fold verification gate — run AFTER the lane's map-state split lands.
# Usage: bash scripts/post-fold-verify.sh
# Covers: swarm-2/3 committed layer (14 coverage files) + 5 invariant suites.
set -u

# Pick whichever vitest entry is reachable (lane keeps wiping .bin during installs).
if [ -x node_modules/vitest/vitest.mjs ]; then
	VITEST_BIN="node node_modules/vitest/vitest.mjs"
elif [ -x node_modules/.bin/vitest ]; then
	VITEST_BIN="node_modules/.bin/vitest"
else
	echo "vitest not resolvable — lane install still in flight" >&2
	exit 3
fi

FILES=(
	tests/unit-active/store-search-rerank-exports-contract.test.ts
	tests/unit-active/store-lifecycle-composition-contract.test.ts
	tests/unit-active/store-focus-thread-setters-contract.test.ts
	tests/unit-active/store-nav-predicates-contract.test.ts
	tests/unit-active/store-signal-stores-contract.test.ts
	tests/unit-active/store-focus-set-selected-business-contract.test.ts
	tests/unit-active/store-demo-eligibility-gate-contract.test.ts
	tests/unit-active/url-state-options-contract.test.ts
	tests/unit-active/get-bypass-attr-contract.test.ts
	tests/unit-active/parity-descriptor-contract.test.ts
	tests/unit-active/journey-manifest-display-limit-contract.test.ts
	tests/unit-active/journey-inspector-timing-contract.test.ts
	tests/unit-active/journey-focus-ui-rail-contract.test.ts
	tests/unit-active/worker-url-boundary-contract.test.ts
	tests/unit-active/css-important-invariant.test.ts
	tests/unit-active/svelte-bridge-import-contract.test.ts
	tests/unit-active/todo-without-ticket-invariant.test.ts
	tests/unit-active/commit-purity-invariant.test.ts
	tests/unit-active/w20-wave4-readiness-regression.test.ts
)

$VITEST_BIN run --config vitest.config.js "${FILES[@]}" --no-coverage
echo "post-fold gate exit=$?"
