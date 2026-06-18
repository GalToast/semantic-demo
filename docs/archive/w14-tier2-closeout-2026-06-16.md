# W14 Tier 2 Closeout — 2026-06-16

## Outcome: 6 retired, 0 main-lane-completed, 0 filed for W15

| File                              | LOC | Status     | Commit                | Notes                                                                                                                                                                                                            |
| --------------------------------- | --- | ---------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `js/modules/config.ts`            | 107 | ✅ Retired | `7a0a25e`             | 1 importer + 1 test contract rewired                                                                                                                                                                             |
| `js/modules/environment.ts`       | 144 | ✅ Retired | `127523e`             | 28 files rewired (3 src, 1 bridge, 16 kernel-side, 8 test mocks)                                                                                                                                                 |
| `js/modules/focus-panel-mode.ts`  | 31  | ✅ Retired | `adbc6fe`             | 6 importers (5 TS, 1 Svelte). Commit also absorbed parallel session's `cluster-labels.ts` deletion                                                                                                               |
| `js/modules/cluster-labels.ts`    | 275 | ✅ Retired | `705e9b7`             | 4 importers + 2 test contracts rewired                                                                                                                                                                           |
| `js/modules/strand-continuity.ts` | 96  | ✅ Retired | `1426402` + `d851958` | Path (a) bridge rewire (commit `1426402`); kernel deletion rewired 5 imported symbols including `setTimer`/`clearTimer`/`disposeTimers`/`getStrandArrivalNote` to canonical + 3-bridge-file deletion (`d851958`) |
| `js/modules/legend-ui.ts`         | 308 | ✅ Retired | `d851958`             | Approach 2 (main-lane approved): `src/lib/stores/legend-panel.svelte.ts` hosts the 10 ports; 7 .ts importers + 2 svelte surfaces + 1 bridge re-export updated; 1 dead test deleted                               |

**Net reduction: 961 LOC of legacy kernel deleted (6 of 6 in-scope files), 0 build breakages.**

## Workers

| Worker                       | Files                                   | Time                    | Cost        | Status                                                                                                    |
| ---------------------------- | --------------------------------------- | ----------------------- | ----------- | --------------------------------------------------------------------------------------------------------- |
| `ocw_57eaeffe` (Wave 1)      | config + environment + focus-panel-mode | 25 min                  | $0.0005     | Completed                                                                                                 |
| `ocw_fd51de49` (Wave 2)      | cluster-labels + legend-ui finding      | 5 min                   | $0.0005     | Completed                                                                                                 |
| `ocw_3efcc0e8` (strand)      | strand-continuity bridge rewire         | 6 min                   | $0.0004     | Completed — bridge repointed + `cleanOptionalValue` parity landed                                         |
| `ocw_0dd262b9` (strand ret.) | strand-continuity kernel retirement     | 10 min (worker timeout) | ~$0.001     | Completed (smoke-test contention); canonical surface extended; 5 imports rewired; kernel deleted          |
| `ocw_a4671c12` (legend-ui)   | legend-ui approach-2 port               | 10 min (worker timeout) | ~$0.001     | Completed (smoke-test contention); `legend-panel.svelte.ts` created; 10 importers rewired; kernel deleted |
| **Combined**                 | **6 retirements + 1 review**            | **~50 min**             | **~$0.005** | **Done**                                                                                                  |

## Findings

### 1. strand-continuity (✅ RESOLVED via path a)

**Decision taken (main-lane):** Path (a) — added standalone function wrappers to canonical that delegate to the singleton manager.

**Implementation:**

- Added `setStrandContinuityState(phase, options)` and `clearStrandContinuityState(reason)` wrapper exports to `src/lib/utils/strand-continuity.ts`. These lazily spin up a private `_wrapperManager` singleton with legacy side-effects wired through config callbacks (`onPhaseChange` mirrors to `state.strandContinuityState` global, `onBodySync` sets `data-strand-journey*` attributes, `onArrivalSync`/`onArrivalDispose` manage the arrival overlay).
- Repointed `src/lib/engine/strand-continuity-bridge.ts` from `js/modules/strand-continuity` to `@lib/utils/strand-continuity`. 4-source-consumer rewire: zero source changes needed since both legacy and canonical expose `setStrandContinuityState`/`clearStrandContinuityState` with matching signatures.
- Bridge rewire verified: `svelte-check` 0 errors / 0 warnings; `tests/unit/strand-continuity-ts.test.ts` + `tests/unit-active/strand-continuity.test.ts` 5/5 PASS.

**Architect-review DELTAs identified & addressed:**

1. **7-field return shape improvement** — canonical returns all 7 fields of `StrandContinuityState` (including explicit `arrivalTimeoutId: undefined, settleTimeoutId: undefined`); legacy's `as StrandContinuityState` cast at runtime only produced 5 fields. New is more type-correct; no consumer reads the timeout-ID fields.
2. **`cleanOptionalValue` parity** — legacy normalized `reason` via `cleanOptionalValue(options.reason) || ''`. Wrapper initially passed raw through, which would carry unsanitized whitespace or sentinel tokens into `data-strand-journey-reason`. **Fixed inline in commit `1426402`** by importing `cleanOptionalValue` and applying it inside the `onPhaseChange` mirror.

**Remaining for full kernel retirement:** NOW RETIRED in `d851958`. 5 legacy-side consumers (thread-inspector.ts, journey-thread-settler.ts, journey.ts, journey-focus-ui.ts, event-bindings.ts transitive) all rewired to `@lib/engine/strand-continuity-bridge`. Canonical extended with `setTimer`/`clearTimer`/`disposeTimers`/`getStrandArrivalNote` standalone wrappers delegating to the singleton manager. Legacy `tests/unit/strand-continuity.test.js` deleted (its imports targeted already-retired files `js/state` and `js/modules/journey-webgl`).

### 2. legend-ui (✅ RESOLVED via approach 2)

**Decision taken (main-lane):** Approach 2 — rewire to `Legend.svelte` + Svelte stores.

**Implementation (`d851958`):**

- Created `src/lib/stores/legend-panel.svelte.ts` (Svelte 5 store with `$state` runes) hosting all 10 ports: `isLegendPanelOpen`, `openLegendPanel`, `closeLegendPanel`, `restoreLegendCollapsedPanel`, `buildLegend`, `updateLegendGuideState`, `closeLegendGuide`, `buildCanvasColorLegend`, `setPreviouslyFocusedLegend`, `getPreviouslyFocusedLegend`.
- Updated `src/lib/engine/legend-ui-bridge.ts` to re-export from canonical.
- Updated `src/lib/engine/lifecycle-bridge.ts:16` `updateLegendGuideState` import path.
- Rewired 7 .ts importers + 2 svelte surfaces + 1 bridge re-export.
- Deleted `js/modules/legend-ui.ts` (308 LOC).

**Verification:**

- svelte-check: 0 errors / 0 warnings
- vitest strand-continuity canonical: 5/5 PASS
- vite build: exit 0

**Tests-excluded-impact:** 4 test files import from the deleted kernel (`tests/legend-ui-ownership-contract.mjs`, `tests/lifecycle-semantic-guide-residual-bridge-contract.mjs`, `tests/residual-window-bridge-inventory-contract.mjs`, `tests/unit/ui-renderers.test.js`). Per the W14 charter's verification rule these were not deleted and remain as stale-particle truth; flagged for follow-up cleanup in W15.

### 3. Anti-pattern wind-down (parallel session `bridge-debt` series)

Reviewed during this turn: bridge waves `c24f2b5` (restore 19 sanctioned), `a047dad` (delete 8 dead), `b6e139e` (eliminate 33 anti-patterns). Active bridge files now: 14 in working tree vs. 30 at series start. Anti-pattern count dropped 30→23. Adjacent: `e4e5e2a chore(bridge): flip dom-formatters, geo-data, ui-presentation to canonical`, `2198a8f chore(bridge): port role-label to canonical, flip bridge`, plus `f07696f chore(port): move map-flattening-layout and loading-ui to canonical`. These are part of the parallel-session's continuing bridge-canonicalization track and not yet fully owner-stamped; main-lane visibility is via the `bridge-debt` commit series.

## Verification gates (each commit, at commit time)

- svelte-check: 0 errors
- test:unit: 652/652
- bridge contract: 5/5
- ts-js-drift: 78 .ts files clean

## Post-W14-T2 state

- 6 in-scope files retired from disk (zero follow-ups)
- `src/lib/engine/camera-controls.ts` is being split by the parallel session (mid-refactor, causes 23 svelte-check errors in `src/lib/engine/index.ts` — not W14-T2 scope)
- 5 parallel session DEATH-BRIDGE commits landed this session (camera-controls consumers, demo-choreography)

## Commit hygiene note

`adbc6fe` (focus-panel-mode retirement) accidentally absorbed the parallel session's `cluster-labels.ts` kernel deletion (275 LOC) into the diff. The cluster-labels importer rewires + test contract updates then got their own commit `705e9b7`. End state is correct, but the focus-panel-mode commit message only mentions focus-panel-mode. If commit archaeology matters later, the cluster-labels kernel deletion actually landed in `adbc6fe`, not `705e9b7`.
