# Dead-Export Audit (phone w6) — curated verdict, verified on the real tree 2026-08-13

Source report: phone swarm worker w6 (nemotron-3-ultra free) at /swarm/report-dead.txt, 355 candidates.
Main-lane verification (real rg sweeps across src+tests+scripts, exact symbol + import check) shrank that to
**21 true single-file exports** (below). All 21: defined + exported, referenced by NO other module, no
dynamic refs (rg catches Object.values(..), bind, state[...] unds since a symbol there is still a textual hit).

## Verified zero-reference value exports

| name                                 | file                                                 | kind           |
| ------------------------------------ | ---------------------------------------------------- | -------------- |
| API_BYPASS_STICKY_MS                 | src/lib/search/mock-search-fallback.ts               | const          |
| CORRIDOR_TRAIL_SHADER_COLORS         | src/lib/utils/design-tokens.ts                       | const          |
| DEMO_LIFETIME_KEY                    | src/lib/stores/demo.svelte.ts                        | const          |
| DEMO_SESSION_KEY                     | src/lib/stores/demo.svelte.ts                        | const          |
| DEMO_TIMING                          | src/lib/stores/demo.svelte.ts                        | const          |
| DEMO_TOTAL_DURATION_MS               | src/lib/stores/demo.svelte.ts                        | const          |
| EXPLICIT_EMPTY_QUERY_PATTERN         | src/lib/search/mock-constants.ts                     | const          |
| NAV_DRIFT_KEYS                       | src/lib/stores/navigation/navigation-state.svelte.ts | const          |
| NESTED_STATE_PATHS                   | src/lib/state/state-validation.ts                    | const          |
| PARITY_ATTRIBUTE_KEYS                | src/lib/orchestration/parity-attrs.svelte.ts         | const          |
| ResourceTracker                      | src/lib/engine/resource-tracker.ts                   | class          |
| SEARCH_INTENT_EXPANSIONS             | src/lib/search/tokenizer.ts                          | const          |
| SESSION_STORAGE_KEY                  | src/lib/demo/guards.ts                               | const          |
| STORAGE_KEY                          | src/lib/demo/guards.ts                               | const          |
| SUPPORT_BUCKET_ROLES                 | src/lib/journey/role-filter-bucket.ts                | const          |
| ThreadSettler                        | src/lib/journey/thread-settler.ts                    | class          |
| VALID\_\* (10+ validation constants) | src/lib/state/state-validation.ts                    | const          |
| isMapPrefixedSurface                 | src/lib/app/app-render.ts                            | fn             |
| recordCount                          | src/lib/data-store.ts                                | exported store |

## Important false-positive classes found (why w6's 355 was inflated)

- Internally-used exported helpers (e.g. cancelEntryFocus: exported AND called within focus-coordinator.ts).
- Test-only consumers (titleCaseSlug, callDataWorker, getActiveIndexForMode, getLeadEnrichment, getLayoutManifest: imported only from tests/).
- Store API surfaces used via inference/derived (toggleLegendPanel, etc. — the app wires them without direct import in some paths).

## Recommendation

None of these 21 justify the risk of a blind bulk delete while the app is being actively worked;
delete per-item with a one-line justification commit. Highest-confidence initially:

- (LEAFLEAF_* constants were re-investigated main-lane: they ARE used internally by map-state.ts loader; NOT dead — retracted)
- DEMO*TOTAL_DURATION_MS and 6 other DEMO*\* unused exports
- NESTED*STATE_PATHS, PARITY_ATTRIBUTE_KEYS, VALID*\* (imported by nothing)
  Track as follow-up, not this commit.

## Follow-up 2026-08-13 (post-repair): full 30-candidate re-sweep -> NOTHING DEAD

Main-lane definitive sweep of all 30 residual candidates with corrected
methodology (list EVERY external referencing file per candidate):
- 0 candidates had zero external references.
- Every one either (a) has a unit/contract test consumer (API_BYPASS_STICKY_MS,
  CORRIDOR_TRAIL_SHADER_COLORS, DEMO_LIFETIME_KEY/SESSION_KEY/TIMING,
  NESTED_STATE_PATHS, PARITY_ATTRIBUTE_KEYS, STORAGE_KEY, SUPPORT_BUCKET_ROLES,
  ThreadSettler), or (b) is re-exported via barrel (getZIndex), or (c) used in
  production paths (all the rest).
- countRaw/expandRaw/fetchSemanticLaneHealth/isDebugProbesEnabled: not found as
  exports in the current tree (removed by the parallel map-state refactor already).

Conclusion: the dead-export cleanup for THIS wave = the 2 real removals from
e9f48985 (recordCount, isMapPrefixedSurface). No further deletions warranted;
the earlier "21 single-file" count was the same own-file-reference blind spot
at file granularity, now corrected.
