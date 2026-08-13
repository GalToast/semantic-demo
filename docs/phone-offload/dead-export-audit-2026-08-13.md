# Dead-Export Audit (phone w6) — curated verdict, verified on the real tree 2026-08-13

Source report: phone swarm worker w6 (nemotron-3-ultra free) at /swarm/report-dead.txt, 355 candidates.
Main-lane verification (real rg sweeps across src+tests+scripts, exact symbol + import check) shrank that to
**21 true single-file exports** (below). All 21: defined + exported, referenced by NO other module, no
dynamic refs (rg catches Object.values(..), bind, state[...] unds since a symbol there is still a textual hit).

## Verified zero-reference value exports
| name | file | kind |
|---|---|---|
| API_BYPASS_STICKY_MS | src/lib/search/mock-search-fallback.ts | const |
| CORRIDOR_TRAIL_SHADER_COLORS | src/lib/utils/design-tokens.ts | const |
| DEMO_LIFETIME_KEY | src/lib/stores/demo.svelte.ts | const |
| DEMO_SESSION_KEY | src/lib/stores/demo.svelte.ts | const |
| DEMO_TIMING | src/lib/stores/demo.svelte.ts | const |
| DEMO_TOTAL_DURATION_MS | src/lib/stores/demo.svelte.ts | const |
| EXPLICIT_EMPTY_QUERY_PATTERN | src/lib/search/mock-constants.ts | const |
| LEAFLET_CSS_URL | src/lib/engine/map-state.ts | const |
| LEAFLET_JS_URL | src/lib/engine/map-state.ts | const |
| LEAFLET_VERSION | src/lib/engine/map-state.ts | const |
| NAV_DRIFT_KEYS | src/lib/stores/navigation/navigation-state.svelte.ts | const |
| NESTED_STATE_PATHS | src/lib/state/state-validation.ts | const |
| PARITY_ATTRIBUTE_KEYS | src/lib/orchestration/parity-attrs.svelte.ts | const |
| ResourceTracker | src/lib/engine/resource-tracker.ts | class |
| SEARCH_INTENT_EXPANSIONS | src/lib/search/tokenizer.ts | const |
| SESSION_STORAGE_KEY | src/lib/demo/guards.ts | const |
| STORAGE_KEY | src/lib/demo/guards.ts | const |
| SUPPORT_BUCKET_ROLES | src/lib/journey/role-filter-bucket.ts | const |
| ThreadSettler | src/lib/journey/thread-settler.ts | class |
| VALID_* (10+ validation constants) | src/lib/state/state-validation.ts | const |
| isMapPrefixedSurface | src/lib/app/app-render.ts | fn |
| recordCount | src/lib/data-store.ts | exported store |

## Important false-positive classes found (why w6's 355 was inflated)
- Internally-used exported helpers (e.g. cancelEntryFocus: exported AND called within focus-coordinator.ts).
- Test-only consumers (titleCaseSlug, callDataWorker, getActiveIndexForMode, getLeadEnrichment, getLayoutManifest: imported only from tests/).
- Store API surfaces used via inference/derived (toggleLegendPanel, etc. — the app wires them without direct import in some paths).

## Recommendation
None of these 21 justify the risk of a blind bulk delete while the app is being actively worked;
delete per-item with a one-line justification commit. Highest-confidence initially:
- LEAFLET_CSS_URL / LEAFLET_JS_URL / LEAFLET_VERSION (dead map constants)
- DEMO_TOTAL_DURATION_MS and 6 other DEMO_* unused exports
- NESTED_STATE_PATHS, PARITY_ATTRIBUTE_KEYS, VALID_* (imported by nothing)
Track as follow-up, not this commit.