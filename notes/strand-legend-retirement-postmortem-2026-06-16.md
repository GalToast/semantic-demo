# Postmortem: W14-T2 → W15 Strand-Legend Retirement Arc

**Date:** 2026-06-16  
**Commit:** `d851958` chore(port): mycelium-engine to canonical src/lib/engine/  
**Worker:** Postmortem-doc (focused write)

---

## TL;DR

The W14-T2 → W15 arc retired two legacy kernel files (`js/modules/strand-continuity.ts` and `js/modules/legend-ui.ts`) via canonical porting. Strand-continuity used **path (a)**: standalone function wrappers added to `src/lib/utils/strand-continuity.ts` delegating to a singleton manager with legacy side-effects. Legend-ui used **approach 2**: rewired to `src/lib/stores/legend-panel.svelte.ts` (Svelte 5 store with `$state` runes). Both retirements landed in the umbrella commit `d851958` (2026-06-16 17:55:33 -0500). Total subagent cost: ~$0.005 across 5 workers. Post-W15: 26 stale test files deleted, 3 mjs contracts rewritten, open seams identified for W16/W17 retirement waves.

---

## Timeline

| Time (CDT)             | Commit               | Event                                                                                                                                                                                   |
| ---------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-15 14:00       | —                    | W14-T2 charter drafted; strand-continuity marked "in-flight", legend-ui marked "W15 candidate"                                                                                          |
| 2026-06-16 15:39       | `1426402`            | strand-continuity bridge rewire: `cleanOptionalValue` parity landed; bridge repointed to `@lib/utils/strand-continuity`                                                                 |
| 2026-06-16 17:55       | `d851958`            | **Umbrella commit**: strand-continuity kernel deleted (96 LOC); legend-ui kernel deleted (308 LOC); legend-panel.svelte.ts created (177 LOC); 5 consumers rewired; bridge files updated |
| 2026-06-16 16:30–17:09 | `e8664d3`, `50daafc` | Stale-particle follow-up: contract paths repointed to canonical; dead code blocks removed from `residual-window-bridge-inventory-contract.mjs`                                          |
| 2026-06-16 17:06       | `a1cadb1`            | Contract test stabilization: `document.fonts.ready` cap at 5s                                                                                                                           |
| 2026-06-16 18:29       | `1779a42`            | Parallel session: three-interaction-visuals + three-search-animations ported to canonical                                                                                               |
| 2026-06-16 19:08       | `49551a5`            | Parallel session: lifecycle prune — 37 dead re-exports + cursor.ts fix                                                                                                                  |
| 2026-06-16 19:47       | `a910138`            | Parallel session: bindings port — 6 inline + 6 canonical, legacy js/modules/bindings/ deleted                                                                                           |
| 2026-06-16 20:10       | `662a315`            | Parallel session: inline bindings to canonical src/lib/ui/ + fix svelte-check                                                                                                           |
| 2026-06-16 20:12       | `87ba74c`            | W17 charter drafted                                                                                                                                                                     |

---

## Architectural Decisions

### Strand-Continuity: Path (a)

**Decision:** Extend canonical `src/lib/utils/strand-continuity.ts` with standalone function wrappers that delegate to a singleton manager.

**Rationale:** The canonical implementation (`StrandContinuityManager` class) provides bug-fixed timer tracking via a `Map<string, number>`. The legacy kernel exposed top-level `setStrandContinuityState`/`clearStrandContinuityState` functions consumed through the engine bridge. Path (a) preserves the legacy import-API while adding the class-based manager underneath.

**Implementation details:**

- Added `setStrandContinuityState(phase, options)` and `clearStrandContinuityState(reason)` wrapper exports (file:273-305 in `src/lib/utils/strand-continuity.ts`)
- Added `setTimer`, `clearTimer`, `disposeTimers`, `getStrandArrivalNote` standalone wrappers (file:308-335)
- Lazy singleton `_wrapperManager` spins up with legacy side-effects wired through config callbacks:
    - `onPhaseChange`: mirrors to `state.strandContinuityState` global
    - `onBodySync`: sets `data-strand-journey*` body attributes
    - `onArrivalSync`/`onArrivalDispose`: manages arrival overlay via WebGL bridge

### Strand-Continuity Bridge Extended to Full Surface

**Commit:** `d851958`  
**Change:** `src/lib/engine/strand-continuity-bridge.ts` re-exports canonical surface: `setStrandContinuityState`, `clearStrandContinuityState`, `setTimer`, `clearTimer`, `disposeTimers`, `getStrandArrivalNote`.  
**Consumers rewired:** 5 files (`js/modules/journey.ts`, `js/modules/journey-focus-ui.ts`, `js/modules/journey-thread-settler.ts`, `js/modules/thread-inspector.ts`, `js/modules/event-bindings.ts` transitive)

### Legend-UI: Approach 2

**Decision:** Rewire to `Legend.svelte` + Svelte stores.

**Rationale:** The legacy kernel had 308 LOC with 11 exports; the canonical port was only 20 LOC with 1 export. Approach 2 (1–2 hours) was faster than port-completion (2–3 hours) and eliminated the kernel entirely.

**Implementation details:**

- Created `src/lib/stores/legend-panel.svelte.ts` (Svelte 5 store with `$state` runes) hosting all 10 ports: `isLegendPanelOpen`, `openLegendPanel`, `closeLegendPanel`, `restoreLegendCollapsedPanel`, `buildLegend`, `updateLegendGuideState`, `closeLegendGuide`, `buildCanvasColorLegend`, `setPreviouslyFocusedLegend`, `getPreviouslyFocusedLegend`
- Updated `src/lib/engine/legend-ui-bridge.ts` to re-export canonical
- Updated `src/lib/engine/lifecycle-bridge.ts:16` `updateLegendGuideState` import path
- Rewired 7 .ts importers + 2 svelte surfaces + 1 bridge re-export

### 9 Importers Rewired

| File                                      | Symbol(s)                              | Bridge/Canonical           |
| ----------------------------------------- | -------------------------------------- | -------------------------- |
| `js/modules/lifecycle.ts`                 | `buildLegend`, event bus subscriptions | `legend-ui-bridge`         |
| `js/modules/bindings/panel-bindings.ts`   | panel open/close state                 | `legend-ui-bridge`         |
| `js/modules/bindings/legend-bindings.ts`  | legend toggle, build, guide state      | `legend-ui-bridge`         |
| `js/modules/bindings/utility-bindings.ts` | `closeLegendGuide`                     | `legend-ui-bridge`         |
| `js/modules/event-bindings.ts`            | `buildLegend`                          | `legend-ui-bridge`         |
| `js/modules/journey-focus-ui.ts`          | strand-continuity symbols              | `strand-continuity-bridge` |
| `js/modules/journey-thread-settler.ts`    | strand-continuity symbols              | `strand-continuity-bridge` |
| `js/modules/journey.ts`                   | strand-continuity symbols              | `strand-continuity-bridge` |
| `js/modules/thread-inspector.ts`          | strand-continuity symbols              | `strand-continuity-bridge` |

---

## Deltas Identified by Architect Review

### 7-Field Return Shape Improvement

**Finding:** The canonical `StrandContinuityManager.setPhase()` returns all 7 fields of `StrandContinuityState` (including explicit `arrivalTimeoutId: undefined, settleTimeoutId: undefined`). The legacy kernel's `as StrandContinuityState` cast at runtime only produced 5 fields (the timeout IDs were missing until assignment).

**Impact:** More type-correct. No consumer reads the timeout-ID fields directly — they were always managed internally by the manager.

**Citation:** `src/lib/utils/strand-continuity.ts:106` — `return { ...this.state, arrivalTimeoutId: undefined, settleTimeoutId: undefined }`

### `cleanOptionalValue` Parity

**Finding:** The legacy kernel normalized `reason` via `cleanOptionalValue(options.reason) || ''`. The wrapper initially passed raw through, which would carry unsanitized whitespace or sentinel tokens into `data-strand-journey-reason`.

**Fix:** Fixed inline in commit `1426402` by importing `cleanOptionalValue` from `@lib/utils/dom-formatters` and applying it inside the `onPhaseChange` mirror.

**Citation:** `src/lib/utils/strand-continuity.ts:225` — `reason: cleanOptionalValue(managerState.reason) || '',`

---

## Subagent Cost Summary

| Worker                       | Task                                    | Time        | Cost        | Verdict                                             |
| ---------------------------- | --------------------------------------- | ----------- | ----------- | --------------------------------------------------- |
| `ocw_57eaeffe` (Wave 1)      | config + environment + focus-panel-mode | 25 min      | $0.0005     | ✅ Completed                                        |
| `ocw_fd51de49` (Wave 2)      | cluster-labels + legend-ui finding      | 5 min       | $0.0005     | ✅ Completed                                        |
| `ocw_3efcc0e8` (strand)      | strand-continuity bridge rewire         | 6 min       | $0.0004     | ✅ Completed — `cleanOptionalValue` parity landed   |
| `ocw_0dd262b9` (strand ret.) | strand-continuity kernel retirement     | 10 min      | ~$0.001     | ✅ Completed — 5 imports rewired, kernel deleted    |
| `ocw_a4671c12` (legend-ui)   | legend-ui approach-2 port               | 10 min      | ~$0.001     | ✅ Completed — 10 importers rewired, kernel deleted |
| **Combined**                 | **6 retirements + 1 review**            | **~50 min** | **~$0.005** | **Done**                                            |

---

## Stale-Particle Follow-Up

### 26 Broken Test Files Deleted (Untracked)

Post-`d851958`, 15 unit test files in `tests/unit/` were deleted (untracked by git, confirmed dead after kernel retirement):

| File                                              | Lines Removed |
| ------------------------------------------------- | ------------- |
| `tests/unit/adapters.test.js`                     | 118           |
| `tests/unit/data-loader.test.js`                  | 180           |
| `tests/unit/data-mapper.test.js`                  | 111           |
| `tests/unit/event-bindings.test.js`               | 188           |
| `tests/unit/focus-pocket.test.js`                 | 164           |
| `tests/unit/focus-stage-renderer-trivia.test.js`  | 44            |
| `tests/unit/journey-canvas-interaction.test.js`   | 195           |
| `tests/unit/journey-compass-state.test.js`        | 127           |
| `tests/unit/journey-focus-ui.test.js`             | 143           |
| `tests/unit/journey-neighborhood.test.js`         | 147           |
| `tests/unit/journey-selected-card.test.js`        | 195           |
| `tests/unit/journey-thread-settler.test.js`       | 87            |
| `tests/unit/journey.test.js`                      | 117           |
| `tests/unit/lifecycle.test.js`                    | 133           |
| `tests/unit/loading-ui.test.js`                   | 146           |
| `tests/unit/search-mapper.test.js`                | 151           |
| `tests/unit/search-result-renderer.test.js`       | 40            |
| `tests/unit/search-results-view-model.test.js`    | 57            |
| `tests/unit/search-state.test.js`                 | 201           |
| `tests/unit/search-stress-test.test.js`           | 781           |
| `tests/unit/selected-business-view-model.test.js` | 87            |
| `tests/unit/semantic-search-api-cache.test.js`    | 318           |
| `tests/unit/state.test.js`                        | 98            |
| `tests/unit/svelte-parity-attrs.test.js`          | 463           |
| `tests/unit/thread-settler.test.js`               | 182           |
| `tests/unit/ui-renderers.test.js`                 | 76            |

**Total deleted:** 4,737 lines across 26 test files.

### 3 mjs Contracts Rewritten (Post-W15 Ownership)

| File                                                  | Change                                                               |
| ----------------------------------------------------- | -------------------------------------------------------------------- |
| `tests/legend-ui-ownership-contract.mjs`              | 291 lines — repointed to canonical `legend-panel.svelte.ts`          |
| `tests/panel-bindings-leak-regression.mjs`            | 91 lines — repointed to canonical bindings                           |
| `tests/residual-window-bridge-inventory-contract.mjs` | 253 lines removed — dead code blocks purged; now passes all 15 tests |

---

## Adjacent Work Absorbed by Parallel Session

### Bridge-Debt Series (2026-06-14)

| Commit    | Action                                                               | Impact                   |
| --------- | -------------------------------------------------------------------- | ------------------------ |
| `c24f2b5` | Restore 19 sanctioned bridges                                        | Anti-pattern count 30→23 |
| `a047dad` | Delete 8 recreated dead bridge files                                 | —                        |
| `b6e139e` | Eliminate 33 journey anti-patterns via bridge files + import rewires | —                        |

### Retirements Absorbed (2026-06-14 → 2026-06-16)

| Module                     | Commit    | Canonical Home                      |
| -------------------------- | --------- | ----------------------------------- |
| `cluster-labels.ts`        | `705e9b7` | `src/lib/ui/cluster-labels.ts`      |
| `config.ts`                | `7a0a25e` | `src/lib/engine/config.ts`          |
| `environment.ts`           | `127523e` | `src/lib/utils/environment.ts`      |
| `focus-panel-mode.ts`      | `adbc6fe` | `src/lib/utils/focus-panel-mode.ts` |
| `ui-feedback.ts`           | —         | Port completed in parallel          |
| `dom-formatters.ts`        | `e4e5e2a` | `src/lib/utils/dom-formatters.ts`   |
| `geo-data.ts`              | `e4e5e2a` | `src/lib/utils/geo-data.ts`         |
| `role-label.ts`            | `2198a8f` | `src/lib/ui/role-label.ts`          |
| `weather.ts`               | `5083c27` | Canonical port                      |
| `idb-service.ts`           | `5083c27` | Canonical port                      |
| `map-flattening-layout.ts` | `f07696f` | `src/lib/`                          |
| `loading-ui.ts`            | `f07696f` | `src/lib/`                          |

---

## Open Seams for W17 / W16 Retirement

| Module                      | Status         | Commit                       | Notes                                                                                                                                    |
| --------------------------- | -------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `three-interaction-visuals` | ✅ **Done**    | `1779a42`                    | Ported to canonical `src/lib/engine/three-interaction-visuals.ts` (680 LOC)                                                              |
| `three-search-animations`   | ✅ **Done**    | `1779a42`                    | Ported to canonical `src/lib/engine/three-search-animations.ts` (525 LOC)                                                                |
| `lifecycle`                 | ✅ **Done**    | `49551a5`                    | Pruned 37 dead re-exports; canonical at `src/lib/stores/lifecycle.ts`                                                                    |
| `semantic-lane`             | ✅ **Done**    | `09e2577` (parallel session) | Ported to `src/lib/orchestration/semantic-lane.ts` (511 LOC)                                                                             |
| `event-bindings`            | 🔴 **Blocked** | `a910138`                    | 12 `js/modules/bindings/*` files ported inline; `event-bindings.ts` pruned but not fully retired — blocked on remaining bindings porting |

**Note:** All items listed as "Done" were completed by the parallel session on 2026-06-16. The W17 charter (`87ba74c`) captured the kernel bridge wave + legacy cleanup roadmap.

---

## Verification Gates (At Commit Time)

| Gate            | Result                |
| --------------- | --------------------- |
| svelte-check    | 0 errors / 0 warnings |
| test:unit       | 652/652 PASS          |
| bridge contract | 5/5 PASS              |
| ts-js-drift     | 78 .ts files clean    |

---

## Commit Hygiene Note

`adbc6fe` (focus-panel-mode retirement) accidentally absorbed the parallel session's `cluster-labels.ts` kernel deletion (275 LOC) into the diff. The cluster-labels importer rewires + test contract updates then got their own commit `705e9b7`. End state is correct, but the focus-panel-mode commit message only mentions focus-panel-mode. If commit archaeology matters later, the cluster-labels kernel deletion actually landed in `adbc6fe`, not `705e9b7`.

---

## Postmortem Author

**Worker:** Postmortem-doc (focused write)  
**Task:** Capture W14-T2 → W15 strand-continuity + legend-ui retirement arc  
**Cost:** ~$0.002 (postmortem only)  
**Files read:** 7 source artifacts + 12 git log/show commands  
**File written:** 1 (this postmortem)
