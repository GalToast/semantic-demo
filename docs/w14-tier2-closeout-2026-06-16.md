# W14 Tier 2 Closeout — 2026-06-16

## Outcome: 4 retired, 1 main-lane-completed, 1 filed for W15

| File                              | LOC | Status                 | Commit    | Notes                                                                                                                 |
| --------------------------------- | --- | ---------------------- | --------- | --------------------------------------------------------------------------------------------------------------------- |
| `js/modules/config.ts`            | 107 | ✅ Retired             | `7a0a25e` | 1 importer + 1 test contract rewired                                                                                  |
| `js/modules/environment.ts`       | 144 | ✅ Retired             | `127523e` | 28 files rewired (3 src, 1 bridge, 16 kernel-side, 8 test mocks)                                                      |
| `js/modules/focus-panel-mode.ts`  | 31  | ✅ Retired             | `adbc6fe` | 6 importers (5 TS, 1 Svelte). Commit also absorbed parallel session's `cluster-labels.ts` deletion                    |
| `js/modules/cluster-labels.ts`    | 275 | ✅ Retired             | `705e9b7` | 4 importers + 2 test contracts rewired                                                                                |
| `js/modules/strand-continuity.ts` | 96  | ✅ Main-lane completed | `1426402` | Path (a) — standalone wrappers added to canonical, bridge re-exported from `@lib/utils/`. Kernel retirement in flight |
| `js/modules/legend-ui.ts`         | 308 | 📋 W15 candidate       | —         | Port-completion arc, separate work (see `docs/w14-tier2/legend-ui-port-completion-2026-06-16.md`)                     |

**Net reduction: 557 LOC of legacy kernel deleted (4 of 6 in-scope files), 0 build breakages; strand-continuity bridge rewire committed.**

## Workers

| Worker                  | Files                                   | Time        | Cost        | Status                                                            |
| ----------------------- | --------------------------------------- | ----------- | ----------- | ----------------------------------------------------------------- |
| `ocw_57eaeffe` (Wave 1) | config + environment + focus-panel-mode | 25 min      | $0.0005     | Completed                                                         |
| `ocw_fd51de49` (Wave 2) | cluster-labels + legend-ui finding      | 5 min       | $0.0005     | Completed                                                         |
| `ocw_3efcc0e8` (strand) | strand-continuity bridge rewire         | 6 min       | $0.0004     | Completed — bridge repointed + `cleanOptionalValue` parity landed |
| `ocw_d637e90d` (review) | strand-continuity arch review           | 4 min       | $0.0012     | Identified `cleanOptionalValue` latent delta — fixed inline       |
| **Combined**            | **5 retirements + 1 review**            | **~40 min** | **~$0.003** | **Done**                                                          |

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

**Remaining for full kernel retirement:** 3 legacy-side consumers still import `setTimer`/`clearTimer`/`disposeTimers`/`getStrandArrivalNote` from `js/modules/strand-continuity.ts` (in `js/modules/thread-inspector.ts`, `js/modules/journey-thread-settler.ts`, and the re-export chain via `js/modules/journey.ts`). Tracked as W16 retirement candidate.

### 2. legend-ui port-completion (W15 candidate)

**Decision taken (main-lane):** **Approach 2** — rewire to `Legend.svelte` + Svelte stores for panel state.

**Rationale:**

- Approach 1 (extend canonical to 308 LOC) preserves the module-scoped `_previouslyFocusedLegend = null` pattern that's hostile to Svelte 5 runes. Carrying that into canonical locks in legacy patterns.
- Approach 2 eliminates the kernel entirely: `Legend.svelte` is already authored for cluster legend rendering; the panel state and `buildLegend`/`buildCanvasColorLegend` can be expressed as state + lifecycle hooks inside the `.svelte` file. All 10 importers get a thinner contract (state + intent functions).
- Approx EFFORT: approach 2 saves ~30 min over approach 1 because the `Legend.svelte` already exists.
- Approx COST: ~$0.003 (subagent with `mode: yolo, mcp_profile: default`).

**Verification gates for W15 worker:**

- svelte-check: 0 errors
- test:unit: 652/652 with no flakes
- Browser smoke test: open legend, toggle clusters, verify panel state
- Verify `Legend.svelte` renders correctly with category data

## Verification gates (each commit, at commit time)

- svelte-check: 0 errors
- test:unit: 652/652
- bridge contract: 5/5
- ts-js-drift: 78 .ts files clean

## Post-W14-T2 state

- 4 in-scope files retired from disk
- 2 in-scope files documented for follow-up (strand-continuity, legend-ui)
- `src/lib/engine/camera-controls.ts` is being split by the parallel session (mid-refactor, causes 23 svelte-check errors in `src/lib/engine/index.ts` — not W14-T2 scope)
- 5 parallel session DEATH-BRIDGE commits landed this session (camera-controls consumers, demo-choreography)

## Commit hygiene note

`adbc6fe` (focus-panel-mode retirement) accidentally absorbed the parallel session's `cluster-labels.ts` kernel deletion (275 LOC) into the diff. The cluster-labels importer rewires + test contract updates then got their own commit `705e9b7`. End state is correct, but the focus-panel-mode commit message only mentions focus-panel-mode. If commit archaeology matters later, the cluster-labels kernel deletion actually landed in `adbc6fe`, not `705e9b7`.
