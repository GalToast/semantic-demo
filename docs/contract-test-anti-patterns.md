# Contract Test Anti-Patterns (Node-runtime)

Durable lessons for writing `tests/*.mjs` contract tests that run under Node with
`--loader ./tests/helpers/ts-resolve-loader.mjs --import ./tests/helpers/svelte-rune-shim.mjs`.
These are the failure classes that produce "passes in the app, fails in the contract"
or "passes standalone, fails in a group run".

## 1. Svelte-5 store facade `get()` returns STALE snapshots without a subscriber

**Symptom:** a contract mutates `appState` (via `withStateMutation`) then calls
`refreshCompositionState()` and asserts `body.dataset.panelSurface` etc. — but the
value never flips from the initial state, even though a direct `searchStore().summary`
read shows the new data.

**Root cause:** store facades like `searchStore`/`navStore`/`focusStore` return a
snapshot built from `appState`. `get(store)` reads that snapshot, which only refreshes
when a subscriber exists and the store publishes. In the real app, components and
`$effect` roots subscribe; a bare Node contract does not, so `get()` keeps returning
the pre-mutation snapshot and every parity-derived attribute looks unchanged.

**Fix (either):**

- Subscribe once at contract top: `searchStore.subscribe(() => {})` (and any other
  facade parity reads — `navStore`, `focusStore`).
- Or drive the mutation through the canonical `with*Notify` action
  (`setSearchSummary()`, `setSemanticDiveMode()`, `setTrailDepth()`) which wraps
  `withSearchNotify`/`withFocusNotify` and publishes to the mirror — the same path
  the app itself uses.

**Verified case:** `tests/aria-sync-contract.mjs` (2026-08-11) — search→panelSurface
flip landed only after subscribing the store. See commit `bfdff5aa`.

## 2. Legacy flat appState fields moved into sub-aggregates

Several contracts wrote `state.currentSearchSummary`, `state.selectedPoint`, etc.
Svelte-5 migration (Phase 6b/6c) grouped them:

- `appState.searchState.currentSearchSummary`
- `appState.focusState.selectedPoint`
- `appState.navState.trailDepth` (with `semanticDiveMode` as a getter over it)

A contract writing the old flat field silently no-ops or asserts a never-set value.
**Fix:** use the nested path (or the store `get()` + canonical actions above).
Prefer the canonical actions so the store facade + parity re-read liveness also holds.

**Verified case:** `tests/aria-sync-contract.mjs` flat `state.selectedPoint` → nested
`state.focusState.selectedPoint`; `state.currentSearchSummary` → `state.searchState.currentSearchSummary`.

## 3. Stale owner after a module split — contracts pin pre-split file paths

When a module is extracted (e.g. engine teardown, bezier math, render loop), contracts
that read the OLD file path silently read empty/absent body and every includes()
fails. `sectionBetween`/`readFileSync` on a path that no longer exists returns `''` or
throws, and the contract reports "missing X" even though X moved.

**Fix:** re-point the contract to the NEW owner file (usually the one exporting the
symbol now — `mycelium-bezier.ts`, `three-engine-teardown.ts`, `three-engine-init.ts`,
`orchestration/search-filter-core.ts`, `orchestration/url-restore.ts` are current
owners as of 2026-08-11). A composite concat (barrel + extracted pieces) is the
canonical pattern when the API is re-exported through a barrel.

**Batch from 2026-08-11:** `residual-window-bridge-inventory`, `cluster-filter`,
`cancel-animate-dewindowing`, `three-setup-loop-dewindowing`, `three-visual-polish`,
`three-resource-lifecycle`.

## 4. Chromium-launch contracts belong in the browser lane, not Node-only runs

`.mjs` contracts that `import { chromium } from 'playwright'` and call
`chromium.launch()` are built to run their own browser; under a headless/software-GPU
host they hang or timeout (60s+ no output) — the same env class as the 3d suites.
They are NOT code bugs; route them to a headed/real-GPU run or skip under host contention.
Verified: `ui-quality-contract`, `micro-surface-interactions-contract`,
`reduced-motion-transition-contract` (chromium not defined / hang).

## How to diagnose (10-min loop)

1. Run the failing contract standalone (the same node flags) and read the exact
   assertion — it almost always names the missing owner.
2. Verify against the live lib: `rg -n "symbol" src/lib/` — find where the
   export DEFINATION actually lives now (moved vs deleted).
3. For state-flip failures: probe `get(store)` vs `store()` snapshot liveness
   (see #1) — the store facade needs a subscriber.
4. Fix the CONTRACT (re-point/action/subscription), not the lib — unless the lib
   genuinely lost a behavior (rare; e.g. parity `hasFocus→focus` fallthrough in
   `resolvePanelSurfaceMode`, fixed 2026-08-11).

## Pass criteria

- Re-run the contract standalone: exit 0, no assertions failed.
- Re-run its GROUP via `run-all-contracts.js --group=<parent>`: the contract shows
  PASS in the group summary (no settle-blank).
- Do not edit lib files for a contract-only stale path (exception: real lib bug).
