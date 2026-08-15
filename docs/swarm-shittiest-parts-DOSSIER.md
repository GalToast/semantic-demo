# Swarm Dossier — semantic-explorer "Shittiest Parts"

**Date:** 2026-08-15 · **Swarm:** 6 read-only workers (`agnes/agnes-2.5-flash`)
**Yield:** 6/6 delivered (`engine-teardown-audit` re-run completed 2026-08-14 — 🟢 GREEN w/ minor notes, see §8/F).
**Strike progress:** A1 DONE (`52f285d6` + `e915d055`, svelte-check clean). A2 WITHDRAWN (worker error — see Tier A2). Test-sprawl P0 partial (`fd1f3efb`: 2 `_tmp` deleted; `retired/` reverted; 3 dewindowing HELD).

## Verdict at a glance (corrects earlier hypotheses)

- **Dual-demo "shittiness" is RESOLVED** (committed `3f3a592c`, Aug 14). `demo-choreography.ts` deleted; only a 36-line no-op bridge stub remains.
- **`App.svelte` / `app.svelte.ts` / `data-store.ts` are NOT god-files** — by-design coordination roots (god-component audit: 0 god-files).
- **Real, actionable debt:** (A) test static-contract duplication, (B) `url-restore.ts` monolith + lockstep predicate landmine, (C) cosmetic legacy/doc cruft.
- **Frozen / load-bearing:** `@lib/orchestration/lifecycle` barrel (41 refs) + `window.__LEGACY_APP_STATE__` shim (~30 lines) — DO NOT touch until data-store legacy fallback is retired (multi-wave).

## Ranked findings (worst → least, by risk × effort × payoff)

### Tier A — High value, low risk (do first)

1. **~~Lockstep focus predicate duplication~~ — DONE (committed `52f285d6` + prettier follow-up `e915d055`).** Extracted `isFocusSurfaceActive(navMode, focusedIndex, parity)` into `use-parity-attrs.svelte.ts`; rewired `App.svelte:237 focusActive` + `JourneyChrome.svelte:139 chromeHasFocus`. Kills the W53 30s-timeout landmine; `svelte-check` clean. [url-parity #1]
   - *Coordination:* `App.svelte` + `JourneyChrome.svelte` are **NOT** in current lane WIP → safe to touch now.
2. **~~Dead no-op demo bridge~~ — WITHDRAWN (worker error).** The dual-demo audit claimed `three-micro-demo-bridge.ts` is "safe to delete — zero runtime callers." TRUE at static scope, but **FALSE as a delete**: it is pinned by `tests/unit-active/svelte-bridge-import-contract.test.ts:193` (import-contract allowlist) and `tests/unit-active/commit-purity-invariant.test.ts:152` (exempts merge `be9d4f42` that *intentionally kept* it — live-referenced at runtime by `three-interaction-visuals` even though no static import exists). A static `rg` misses the runtime reference. **Do not delete** without also updating both contract tests + understanding the merge-resolution. [correction to dual-demo §7]

### Tier B — High LOC, low risk (mechanical)

3. **Static-contract sprawl** — ~50 near-identical source-regex `*.mjs` contracts testing "X imports Y from Z".
   - P0 deletes: `tests/_tmp_*.mjs` (2 scratch) — DONE (`fd1f3efb`). `tests/retired/*` **REVERTED** — active contract `tests/residual-window-bridge-inventory-contract.mjs` TEST 15 asserts `tests/retired/window-bridge-gaps-contract.mjs` stays available as a historical archive (audit's 'zero refs' claim was WRONG). 3 stale dewindowing contracts (`cancel-animate-`, `three-setup-zero-caller-`, `lifecycle-journey-quick-`) **HELD** — deletion requires editing `run-all-contracts.js` line 282/297/299, which carries uncommitted lane WIP at line 707. [test-sprawl P0 — partial]
   - Consolidate (~220K → ~53K): 9 `*-state-owner-*` → 1 manifest-driven sweep; 11 `*-dewindowing-*` → 1; 4 `focus-pocket-*` → 1. Touch `contracts.manifest.json` (34 stale entries). [test-sprawl P0/P1/P2]

### Tier C — Medium risk (structural; needs lane coordination)

4. **`url-restore.ts` monolith (874 LOC, 6 responsibilities)** — split deep-link + search helpers into `url-restore-deep-link.ts` / `url-restore-search.ts`; keep orchestrator ~200 LOC. Medium risk (shares `_isRestoreStale` / `restoreToken` bookkeeping). [url-parity #2]
   - *Coordination flag:* `url-restore.ts` **IS** in current lane WIP (modified, uncommitted). Do NOT start until lane clears, or coordinate with owning lane.

### Tier D — Cosmetic / defer

5. **Legacy doc-comment cruft** — ~10 `deprecated|legacy` doc comments, zero consumers. Safe delete. [legacy-cruft Tier 1]
2. **`data-store.ts` dual-write** — migration bridge (rune stores → `appState.*` mirrors). Not a bug; add a dev-only consistency assertion (`points.length` vs snapshot). Defer. [god-component P3]
3. **Lifecycle barrel + `__LEGACY_APP_STATE__` shim** — LOAD-BEARING (41 refs / ~30 lines). Retire only after data-store legacy fallback removal. **DO NOT TOUCH.** [legacy-cruft Tier 4]

### Tier F — Engine teardown / disposal correctness (audit re-run completed 2026-08-14, 🟢 GREEN w/ minor notes)

8. **Engine teardown/dispose correctness** — ASSESSED (re-run). Verdict: solid `DisposableRegistry` + `forceContextLoss()` + RAF/timer/AbortController discipline; no high-severity leaks. **2 medium + 3 low** findings:
   - **M1 (medium, hygiene — RE-VERIFIED, KEEP AS-IS)** `src/lib/engine/lifecycle.ts:600/608`. Two calls: `disposeInteractionVisuals()` (line 600, own try/catch) internally calls `disposeHeroAnimation()` (three-interaction-visuals.ts:175); a standalone `disposeHeroAnimation()` (line 608, SEPARATE try/catch) follows. The standalone is NOT pure redundancy — it is a **defensive fail-safe**: if `disposeInteractionVisuals()` throws before its internal `disposeHeroAnimation()`, the standalone still disposes. Removing it would lose the fail-safe. Worker's 'remove it' advice is incomplete. **Leave as-is.** (file NOT in lane WIP)
   - **M2 (medium, low-impact)** `map-state.ts:42-56` vs `:197-209` — `initMapStateSubscriptions()` registers 8 `subscribeKeyed()` listeners never unsubscribed in `destroyMap()`. Fix: add `unsubscribeKeyed(key)` to `event-bus.ts` + call in `destroyMap`. **Both files NOT in lane WIP → clean pick-up candidate.**
   - **L1 (low)** `canvas-interaction.ts:57-68` — `showClickPulse` `setTimeout` not tracked by AbortController (transient `<div>` leak only on unmount-mid-pulse).
   - **L2 (low)** `lifecycle.ts:639-646` — semantic-threads worker reset is fire-and-forget dynamic import (brief dual-worker window on rapid re-init/HMR).
   - **L3 (low)** `Canvas.svelte` keyboard binding uses manual flag vs AbortController (pattern inconsistency, no leak).

## Coordination flags (parallel lane)

- Lane WIP currently modifies `src/lib/orchestration/url-restore.ts` + `src/lib/stores/lifecycle.ts` + a stack of `tests/live-*` specs. Strikes A1, A2 are safe (those files not in WIP). Strike C4 MUST wait for lane-clear.
- `AUDIT-LANE-SWEEP-REVIEW.md` (main-lane verification, 2026-08-14) flagged 2 SEV1 items needing owning-lane confirmation: `SearchInputChrome.svelte` 28px→44px touch-target change; `3d-data-edge-cases.spec.js` coverage weakening (state-only check replacing DOM assertion). Neither blocks the swarm strikes.

## Recommended strike order

1. ~~Extract `isFocusSurfaceActive()` (A1)~~ — DONE (`52f285d6` + `e915d055`).
2. (withdrawn) Delete bridge (A2).
3. Test-sprawl P0 (B) — partial: `_tmp*` DONE (`fd1f3efb`); `retired/` reverted (active-contract assertion); 3 dewindowing HELD (runner-coord).
4. ~~**M2 (teardown map-state keyed subs)**~~ — DONE (`864367dd`).
5. M1 — RE-VERIFIED, KEEP AS-IS (defensive fail-safe, not a real issue; worker's 'remove it' advice incomplete).
6. (after lane-clear) `url-restore.ts` split (C4) + the 3 dewindowing contract deletes (runner edit at `run-all-contracts.js:282/297/299`, currently entangled with lane WIP at line 707).
7. Defer shim/barrel (D7), L1/L2/L3 (low: L1 = untracked `setTimeout` in `canvas-interaction.ts` click-pulse; L2 = fire-and-forget threads-worker reset; L3 = keyboard flag vs AbortController).

## Strike log

- **A1 (extracted `isFocusSurfaceActive`)** — DONE (committed `52f285d6` + prettier follow-up `e915d055`). Added `src/lib/ui/use-parity-attrs.svelte.ts::isFocusSurfaceActive(navMode, focusedIndex, parity)`; rewired `App.svelte:237 focusActive` + `JourneyChrome.svelte:139 chromeHasFocus` to call it. Both files NOT in lane WIP. `svelte-check` clean (0 errors). Converts the W53 lockstep foot-gun into a one-function source of truth.
- **A2 (delete bridge)** — WITHDRAWN. See Tier A2.
- **M2 (teardown map-state keyed subscriptions)** — DONE (committed `864367dd`). Added `unsubscribeKeyed(key)` to `src/lib/orchestration/event-bus.ts`; wired it into `destroyMap()` for the 8 map-state keys registered in `initMapStateSubscriptions()`. Closes engine-teardown audit M2 (dangling no-op subscribers across destroy→re-init). `svelte-check` clean (0 errors). Both files NOT in lane WIP.
- **M1 (duplicate `disposeHeroAnimation()`)** — RE-VERIFIED, **KEEP AS-IS**. `lifecycle.ts:600` (`disposeInteractionVisuals`, own try/catch) internally calls it; `:608` (SEPARATE try/catch) calls it again. The standalone is a **defensive fail-safe** — if `disposeInteractionVisuals()` throws before its internal call, the standalone still disposes. Worker's 'remove it' advice is incomplete (removing it would lose the fail-safe). Not a real issue.

## Source reports (on disk)

- `tmp/subagent-legacy-cruft-report.md`
- `tmp/subagent-dual-demo-report.md`
- `tmp/subagent-url-parity-report.md`
- `tmp/subagent-god-component-report.md`
- `tmp/subagent-test-sprawl-report.md`
- `tmp/subagent-engine-teardown-report.md` (re-run completed 2026-08-14, 🟢 GREEN w/ minor notes).
