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

## Group-run evidence (2026-08-11) — full-union validation

14/17 manifest groups were run + classified this session (first complete group-semantics
validation). Verdict: **every failing contract in every group is a Playwright `.spec.js`
(or `.mjs` self-launching chromium) that needs a headed/GPU host** — the env class above.
No code-level failure was left unfixed outside that class (15+ stale-owner re-points
committed). The `full` union battery reached **62/62 exit 0** after those fixes.

Design rules proven:

- HYPOTHESIS REJECTED: routing `.mjs` chromium-launcher contracts (.mjs importing
  `playwright` + calling `chromium.launch()`) to the Playwright CLI is WRONG — they are
  intentional plain-node browser-owners (47 such files); the group runner already times
  them out gracefully + continues. Group summaries carry them as env-class, not hangs.
- Contracts scanning a barrel (search.svelte.ts / three-engine.ts / semantic-overlay.ts)
  MUST composite the split-out sibling (search-core.ts / three-engine-init.ts /
  three-engine-render-loop.ts / semantic-overlay-material.ts) — the barrel re-exports but
  the body/import statements live in the sibling.

## Barrel-sweep classification rule (2026-08-11, validated full-group 62/62)

When an audit finds a contract reading a barrel with NO sibling composite, classify
before re-pointing:
1. **live `import('@lib/...')`** → OK (the barrel re-exports the runtime surface; imports are the correct usage).
2. **assert-absence** (retired-bridge/`must not contain window.X`) → OK by design.
3. **source-read of a def/import that now lives in a sibling** → RE-POINT (composite the sibling into the readFileSync concat).

Measured: 4 search-barrel readers looked un-composited but were live-imports; 5 engine-barrel readers
looked un-composited but assert the barrel SURFACE (exit 0). Re-pointing them would have been wrong.
