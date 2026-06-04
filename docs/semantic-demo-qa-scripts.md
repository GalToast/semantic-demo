# Semantic Demo QA Scripts

## Contract Scripts (fast, DOM/layout assertions)

| Script | Surfaces tested | Viewport |
|--------|----------------|----------|
| `qa:contract:all` | core surface contract set, including product-route handoff surfaces | mixed |
| `qa:contract:mobile-critical` | mobile-idle, search-chrome, search-no-results, mobile-product-focus-route, mobile-product-preview-route, focus-pocket, map-trail, controls, field-node, compass-rail, global-spacing, mobile-semantic-dive-320 | 390x844 mobile + 320px semantic-dive geometry |
| `qa:contract:mobile-chrome` | search-chrome | 390x844 mobile |
| `qa:contract:phase-a` | info-panel-empty, compass-rail, loading-overlay, mode-grid | mixed |
| `qa:contract:phase-b` | filters, thread-inspector, controls, search-chrome, search-no-results, info-panel-populated | mixed |

Named surfaces: `mobile-idle`, `desktop-idle`, `launch-focus`, `search-error`, `search-no-results`, `map-trail`, `focus-pocket`, `field-node`, `info-panel-empty`, `compass-rail`, `loading-overlay`, `mode-grid`, `filters`, `thread-inspector`, `controls`, `search-chrome`, `mobile-product-focus-route`, `mobile-product-preview-route`, `info-panel-populated`, `global-spacing`, `mobile-focus-search`, `mobile-semantic-dive`, `mobile-semantic-dive-320`, `tablet-semantic-dive`.

## Visual Audit Scripts (screenshot-based)

Canonical visual state ids are registered in `tests/visual-state-registry.mjs`; `tests/surface-style-matrix-contract.mjs` verifies the registry, visual audit captures, package aliases, and surface style matrix stay in sync. The visual audit harness starts its own local static server for the default `127.0.0.1:8795` target when one is not already reachable, and fulfills Google Fonts requests with a local CSS fixture so headless runs do not depend on external font fetches.

Visual audit artifacts now include `routeEvidence` in each state JSON plus `route-evidence-summary.json` in the run folder. Treat `proofLane: constructed-surface` as layout/surface proof only; it means the state was shaped by URL params, app actions, or fixture DOM/dataset setup. `17-mobile-thread-inspector`, `21-mobile-route-trace-visible`, and `24-mobile-map-focus-search` are intentionally `real-route` visual states: search input, first-result focus, and the relevant visible controls must be used. `11-mobile-selected-card-map-trail` and `11-desktop-selected-card-map-trail` intentionally remain constructed guards for stale/legacy map-trail geometry; the real mobile mapped traversal route resolves through `24-mobile-map-focus-search`. Use `qa:product-playthrough` when the question is whether the broader product route can reach a state through visible interactions. Use `qa:real-route:visual` when the proof must be screenshot evidence from visible clicks only, with no debug-probe or forced-state fallback.

| Script | States | Notes |
|--------|--------|-------|
| `qa:surface:all` | all 26 visual states | ~60-90s |
| `qa:desktop-critical` | 07-desktop-idle, 08-desktop-search-coffee, 11-desktop-selected-card-map-trail, 12-desktop-reduced-motion, 13-desktop-filters-open, 14-desktop-search-error, 16-desktop-info-panel-populated + headed desktop-idle/info-panel-populated contracts | headed desktop release smoke |
| `qa:surface:mobile-idle` | 01-mobile-idle | |
| `qa:surface:desktop-idle` | 07-desktop-idle | |
| `qa:surface:focus` | 03-mobile-focus-first-result + 04-mobile-field-node-active | |
| `qa:surface:focus-search-ownership` | mobile focus-search surface ownership | asserts search is compact context and `#focus-stage` is the sole drawer-sized mobile primary surface |
| `qa:focus-readability` | mobile focus-search camera/readability | asserts focused node framing, selected-node glow scale/opacity, and local focus shader radius stay readable |
| `qa:camera-ownership` | mobile semantic-dive + short-landscape camera ownership | asserts focused node and traversal neighbors remain in the usable canvas region without overzoom |
| `qa:interaction-ownership` | mobile focus-stage action ownership | asserts focus/thread preview/pin/clear/follow actions are exposed through `__APP_ACTIONS__` and preserve a single primary focus drawer |
| `qa:reset-map-ownership` | mobile reset + map transition ownership | asserts search clear, Escape, and semantic-dive-to-map transitions clear stale focus drawers and converge on the expected owning surface |
| `qa:surface:search-error` | 10-mobile-search-error-state | |
| `qa:surface:search-no-results` | 25-mobile-search-no-results | empty search result drawer; asserts no stale result cards, terminal search state, live status, and scroll ownership |
| `qa:surface:map-trail` | 11-mobile-selected-card-map-trail | constructed guard for stale/legacy `map-trail` geometry; real mobile map traversal is covered by `qa:surface:map-focus-search` |
| `qa:surface:map-focus-search` | 24-mobile-map-focus-search | real-click route; asserts selected map drawer remains visible and unoccluded while search/results/filters stay suppressed |
| `qa:surface:desktop-map-trail` | 11-desktop-selected-card-map-trail | constructed guard for desktop map-trail chrome/card overlap |
| `qa:surface:reduced-motion` | 12-desktop-reduced-motion | |
| `qa:surface:info-panel-populated` | 16-desktop-info-panel-populated | |
| `qa:surface:thread-inspector` | 17-mobile-thread-inspector | real-click route; asserts neighbor preview inspector, actions, copy, and strand diagnostics |
| `qa:surface:loading-overlay` | 18-mobile-loading-overlay | |
| `qa:surface:compass-rail` | 19-mobile-compass-rail | |
| `qa:surface:mode-grid` | 20-mobile-mode-grid-visible | |
| `qa:surface:route-trace` | 21-mobile-route-trace-visible | real-click route; asserts route trace lines, diagnostics, route motion, and shader time advance after focusing a search result |
| `qa:surface:semantic-dive-320` | 22-mobile-semantic-dive-320 | real-click route into narrow 320px semantic-dive geometry |
| `qa:surface:short-landscape` | 23-mobile-short-landscape | short landscape 896x414 focus-search geometry |
| `qa:product-playthrough` | live mobile/desktop/short-landscape walkthrough | observational product QA; writes screenshots and runtime JSON under `tmp/product-qa/<timestamp>/` |
| `qa:real-route:visual` | mobile search -> focus -> semantic dive -> 320px/short-landscape dive -> map -> reset | strict visible-interaction screenshot lane; writes artifacts under `tmp/real-route-visual/<timestamp>/` and fails on debug-probe/forced-state evidence |
| `qa:route-ergonomics` | same strict real route as `qa:real-route:visual` | adds visible UI ergonomics assertions for critical text clipping, blank visible labels, severe tap targets, primary-surface overlap, horizontal overflow, oversized mobile surfaces, semantic-dive primary-surface visibility across 390px, 320px, and short-landscape captures, and screenshot pixel-quality checks for blank/washed-out/flat screens and low-signal primary surfaces. Also writes advisory `design-score-report.json` and `.md` with non-blocking warnings for hierarchy, density, CTA competition, and scene/UI balance. Artifacts go under `tmp/real-route-ergonomics/<timestamp>/` |

States: `01-mobile-idle`, `02-mobile-search-coffee`, `03-mobile-focus-first-result`, `04-mobile-field-node-active`, `05-mobile-map`, `06-mobile-filters-open`, `07-desktop-idle`, `08-desktop-search-coffee`, `09-mobile-map-empty-state`, `10-mobile-search-error-state`, `11-mobile-selected-card-map-trail`, `11-desktop-selected-card-map-trail`, `12-desktop-reduced-motion`, `13-desktop-filters-open` (desktop viewport capture only — desktop filters are mobile-only, always display:none in idle), `13-mobile-reduced-motion`, `14-desktop-search-error`, `15-mobile-semantic-dive`, `16-desktop-info-panel-populated`, `17-mobile-thread-inspector`, `18-mobile-loading-overlay`, `19-mobile-compass-rail`, `20-mobile-mode-grid-visible`, `21-mobile-route-trace-visible`, `22-mobile-semantic-dive-320`, `23-mobile-short-landscape`, `24-mobile-map-focus-search`, `25-mobile-search-no-results`.

## UI Quality & Motion Scripts

| Script | What it checks |
|--------|---------------|
| `qa:ui-quality` | `tests/ui-quality-contract.mjs` — accessibility, touch targets, visual hierarchy |
| `qa:route-ergonomics` | `tests/product-playthrough-audit.mjs --real-route-visual --visual-ergonomics` — strict real-click route plus DOM geometry and screenshot pixel-quality assertions |
| `qa:surface-redundancy` | `tests/surface-redundancy-contract.mjs` — CSS selector duplication tracking |
| `qa:micro-interactions` | `tests/micro-surface-interactions-contract.mjs` — micro-demo choreography, panel transitions |
| `qa:motion-state` | `tests/motion-state-contract.mjs` — reduced-motion JS state wiring |
| `qa:reduced-motion-transition` | `tests/reduced-motion-transition-contract.mjs` — canonical reduced-motion owner check + Playwright computed-style proof of transition suppression |

## Cache Busters

`npm run refresh:cache` remains the strict global refresh path for release/checkpoint work. For narrow UI cleanup, `node tests/cache-buster-check.js --fix --assets=css/mobile_premium__focus-dive.css` (or any other `css/mobile_premium__*.css` file) updates only the requested asset and the ancestor references needed for that asset to load fresh. `npm run test` still runs the full cache-buster check.

## Semantic Space Scripts

| Script | What it checks |
|--------|---------------|
| `check:semantic-space` | `tests/semantic-space-audit.mjs` verifies `data.dat` 3D coordinates preserve `semantic_threads_ui.dat` neighbor relationships with edge-distance and neighborhood-preservation thresholds, and verifies `data.dat`, `data.dat.gz`, `semantic_threads_ui.dat`, and `semantic_space_layout_manifest.json` all trace back to the same embedding index generation. `tests/semantic-thread-relationship-role-contract.mjs` verifies Focus Constellation role metadata is present and propagated. Included in `npm test`. |

Regenerate the rendered 3D semantic coordinates with `python scripts/rebuild-semantic-space-layout.py`. The script reads the parent-folder Qwen index at `../tmp/public-semantic-search-build/index-rich-0.6b-20260604`, preserves the compact `data.dat` row schema, updates only `x/y/z`, writes `data.dat.gz`, and records `semantic_space_layout_manifest.json`.

`scripts/re-embed-corpus.py` writes `scripts/qwen3_embeddings.npy`, `scripts/qwen3_embeddings_meta.json`, and a promoted public index directory. It must not write raw UMAP coordinates into `data.dat`; only `scripts/rebuild-semantic-space-layout.py` owns browser coordinate generation.

After CRM/corpus/index changes, rebuild the public corpus, semantic thread payloads, and rendered coordinates before running `check:semantic-space`:

```bash
python ../scripts/maintenance/export_public_semantic_corpus_from_leadops.py --db "../crm.sqlite" --output "../tmp/public-semantic-search-build/ask_moco_corpus.from-leadops.jsonl"
python ../scripts/maintenance/build_semantic_threads_from_public_index.py --corpus "../tmp/public-semantic-search-build/ask_moco_corpus.from-leadops.jsonl" --index-dir "../tmp/public-semantic-search-build/index-rich-0.6b-20260604" --output "./semantic_threads.dat" --neighbors 24 --candidate-pool 96 --jobs 1
python ../scripts/maintenance/build_semantic_threads_ui.py "./semantic_threads.dat" "./semantic_threads_ui.dat" --neighbor-limit 12
python scripts/rebuild-semantic-space-layout.py --index-dir "../tmp/public-semantic-search-build/index-rich-0.6b-20260604"
```

`semantic_threads_ui.dat` must preserve `relationship_role`, `relationship_axis`, and `role_reason` per edge. Current role taxonomy: `core_peer`, `upstream`, `downstream`, `complement`, `same_market`, `geo_echo`, `bridge`.

User-facing role copy is centralized in `js/modules/relationship-roles.js`. Keep the data taxonomy stable for contracts and artifacts; tune rail labels, inspector labels, and classifier-reason rewrites there so Focus Constellation copy stays consistent across the neighbor rail and thread inspector.

## Build/Cache Scripts

`check:cache` verifies cache busters and now rebuilds `js/modules/app.js` into a temporary bundle before comparing it to `dist/bundle.js`. If source modules changed, run `npm run build` before `npm run refresh:cache`; otherwise the check fails instead of letting the shell serve stale JavaScript with fresh cache hashes.

Semantic/data ownership:

- `semantic_threads_ui.dat` owns generated edge facts: neighbor IDs, scores, relationship roles, relationship axes, and role reasons.
- `js/workers/data-worker.js` owns background loading and raw shape conversion only. It must not invent relationship fallback classes.
- `js/modules/relationship-roles.js` owns relationship-role normalization and UI copy fallback. Missing or unknown roles normalize to `unclassified`, never to a plausible generated role such as `bridge`.
- `js/modules/semantic-threads.js` owns the runtime `state.semanticNeighborMapByLeadId` map and normalizes both worker-loaded and main-thread-loaded edges through `relationship-roles.js`.
- `js/modules/journey-thread-model.js` owns semantic-vs-geometric candidate selection and fallback.
- `js/modules/journey-neighborhood.js` owns bounded route manifests and traversal ranking derived from those candidates.
- `js/modules/focus-pocket.js`, `js/modules/journey-focus-ui.js`, `js/modules/thread-inspector.js`, and `js/modules/journey-thread-settler.js` may render relationship metadata but should not reclassify it.

## Contract Test Suite (`npm run test:contract`)
Runs the pinned ordered contract suite from `tests/run-all-contracts.js`; `tests/contracts.manifest.json` also classifies targeted groups such as `core`, `navigation`, `scene`, `smoke`, `mobile-critical`, `motion`, `lifecycle`, `browser`, `render`, `quality`, and `full`.

## Manifest Group Scripts (`npm run test:contract:<group>`)

| Script | Group | Contracts |
|--------|-------|-----------|
| `test:contract:core` | `core` | semantic-dive-ui-surface, search-state-surface, state-transition, focus-semantic-state-boundary, semantic-lane, connection-analysis, exploration-modes (7 contracts) |
| `test:contract:navigation` | `navigation` | journey-compass-state, journey-thread-inspector, thread-inspector-dewindowing, journey-window-surface, journey-cluster-accent-dewindowing, journey-event-bindings, trail-review-focus, pathfinding, journey-walk-candidate, journey-walk-thread-neighbor-timer, journey-ui-ownership (11 contracts) |
| `test:contract:scene` | `scene` | scene-reveal, scene-atmosphere, three-visual-polish, reduced-motion-transition, reduced-motion-interruption (5 contracts) |
| `test:contract:smoke` | `smoke` | weather-lifecycle, weather-surface-ownership, camera-auto-rotate-settle, scene-reveal, loading-ui, motion-state (6 contracts, sub-1s total) - fast smoke, no browser needed |
| `test:contract:mobile-critical` | `mobile-critical` | semantic-dive-ui-surface, search-state-surface, focus-pocket-motion, focus-pocket-composition, micro-demo, demo-init-seam, reset-callsite-routing, demo-camera-retirement, cluster-labels, window-bridge-gaps, loading-ui, short-landscape-layout, critical-visual-layout-regression (13 contracts) |
| `test:contract:lifecycle` | `lifecycle` | lifecycle, state, demo, weather, bridge, dewindowing, cluster/filter, URL/search, focus, journey extraction, bootstrap, and adapter ownership contracts including `journey-neighborhood-manifest-contract.mjs`, `journey-walk-thread-neighbor-timer-contract.mjs`, and `journey-strand-continuity-contract.mjs` (49 contracts) |
| `test:contract:motion` | `motion` | camera-controls-motion, focus-pocket-motion, motion-state, camera-auto-rotate-settle, semantic-dive-reverse, focus-transition (6 contracts) |
| `test:contract:browser` | `browser` | focus-stage-render, info-panel-collapsed-render, mode-chip-state-render, weather-widget-render, connection-analysis-render-state, search-peek-expanded-render (6 contracts, 5-20s each) - Playwright browser launch required |
| `test:contract:render` | `render` | Same contracts as `browser` - backward-compatible alias; prefer `test:contract:browser` for new scripts |
| `test:contract:quality` | `quality` | css-manifest-contract, design-token-doc-contract, surface-style-matrix-contract, focus-stage-css-ownership-contract, css-transient-state-ownership-contract, mobile-chrome-ownership-contract, ui-quality-contract, micro-surface-interactions, surface-redundancy, aria-sync-contract, focus-trap-contract, window-global-allowlist-contract, persistence-contract, disposal-hygiene-contract.spec.js (14 contracts; may write tmp reports and fails on UI quality regressions) |
| `test:contract:full` | `full` | All pinned contracts in manifest-defined order |
| `test:contract:phase-a` | phase-a surfaces | info-panel-empty, compass-rail, loading-overlay, mode-grid |
| `test:contract:phase-b` | phase-b surfaces | filters, thread-inspector, controls, search-chrome, info-panel-populated |
| `test:contract:3d-focus-neighborhood` | `3d-focus-neighborhood` | focus-pocket-selectability, overlay-hit-stealing, hover-affordance, thread-orchestration-quality, camera-orbit-resilience, focus-neighborhood-geometry, focus-neighborhood-interaction (7 contracts; runner is sequential — not the cause of remaining failures) |
| `test:contract:3d-engine` | `3d-engine` | webgl-resilience, disposal-hygiene (2 contracts; Playwright/WebGL lane, requires server on port 8795) |
| `test:contract:3d-focus-neighborhood-geometry` | `3d-focus-neighborhood-geometry` | focus-neighborhood-geometry (1 contract) |
| `test:contract:3d-focus-neighborhood-interaction` | `3d-focus-neighborhood-interaction` | focus-neighborhood-interaction (1 contract) |
| `test:contract:3d-focus-desktop-click` | `3d-focus-desktop-click` | 3d-focus-desktop-click.spec.js (3 tests) — strict desktop-only lane; desktop hover/click accuracy at 1440×900 without mobile-frustum soft-skips; owns deprecation markers on duplicate desktop tests in `3d-focus-neighborhood-interaction.spec.js` |
| `test:contract:3d-focus-ghost-graph-visibility` | `3d-focus-ghost-graph-visibility` | 3d-focus-ghost-graph-visibility (1 contract; **verified 7/7**) |
| `test:contract:3d-hidpi-click-accuracy` | `3d-hidpi-click-accuracy` | 3d-hidpi-click-accuracy (1 contract; **verified 6/6**) |
| `test:contract:3d-focus-pocket-geometry` | `3d-focus-pocket-geometry` | focus-pocket-selectability, focus-neighborhood-geometry (2 contracts) |
| `test:contract:3d-hover-click-interaction` | `3d-hover-click-interaction` | hover-affordance, real-pointer-playthrough, hidpi-click-accuracy, node-hit-accuracy, focus-neighborhood-interaction (5 contracts) |
| `test:contract:3d-rapid-re-selection` | `3d-rapid-re-selection` | 3d-rapid-re-selection-contract (1 contract; **verified 6/6**) |
| `test:contract:3d-responsive-ui` | `3d-responsive-ui` | camera-orbit-resilience, viewport-dpr-resilience, touch-parity (3 contracts) |
| `test:contract:3d-visual-quality` | `3d-visual-quality` | cluster-readability, thread-orchestration-quality (2 contracts; thread-orchestration **verified 1/1**) |
| `test:contract:3d-resilience` | `3d-resilience` | camera-orbit-resilience, touch-parity, viewport-dpr-resilience, overlay-hit-stealing (4 contracts) |
| `test:contract:3d-state-data` | `3d-state-data` | state-transition-integrity, data-edge-cases (2 contracts; state-transition-integrity covers Escape-from-dive path **2/2**) |
| `test:contract:3d-accessibility-fallback-performance` | `3d-accessibility-fallback-performance` | accessibility-fallback-performance (1 contract) |
| `test:contract:3d-smoke` | `3d-smoke` | node-hit-accuracy, hover-affordance, focus-pocket-selectability (3 contracts) |
| `test:contract:3d-regression` | `3d-regression` | focus-neighborhood-geometry, focus-ghost-graph-visibility, focus-neighborhood-interaction, overlay-hit-stealing, hover-affordance, thread-orchestration-quality (6 contracts) |
| `test:contract:3d-slow` | `3d-slow` | cluster-readability, thread-orchestration-quality, accessibility-fallback-performance (3 contracts) |
| `test:contract:3d-full` | `3d-full` | all 3d-*.spec.js contracts (16 contracts) |
| `test:contract:projection` | `projection` | projection-state-sync (1 contract; no browser needed) |
| `test:contract:visual-smoke` | `visual-smoke` | btn-journey-primary-layout, camera-motion-visual-smoke, demo-init-seam, micro-demo, ui-renderers-validation (5 contracts; Playwright lane, requires server on port 8795) |
| `test:contract:live-url` | `live-url` | live-url-state-reconstruction, url-restore-cluster-filter-race, live-step-inside-url-body-state-sync, live-reset-clear-demo-proof, live-reset-proof-wave2, polish-adversarial (6 contracts; requires server on port 8795) |
| `test:contract:extraction` | `extraction` | extraction-contracts, semantic-guide-fallback-contract, semantic-guide-fetch-fallback-contract, semantic-guide-edge, short-landscape (5 contracts; mixed Node/Playwright lane, requires server on port 8795 for browser specs) |
| `test:contract:manual-risk` | `manual-risk` | sd143-map-search-visual, reset-experience-state (2 contracts; alternate-port/manual-risk lane, may require specific environment) |
| `test:contract:e2e` | `e2e` | switchview-race, e2e-click-flow (2 contracts; requires live server on port 9876) |

**Fast vs slow split:** `smoke` (sub-second, no browser) is the fast lane. `browser`/`render` (5-20s each, Playwright required) is the slow lane. Use `--list` on the runner to preview any group before running: `node tests/run-all-contracts.js --list`.

## Usage Notes
All scripts target `http://127.0.0.1:8795/vector-explorer-polished.html` by default. Start the server with `npm run serve` before running any QA scripts.

## Additional QA Scripts

| Script | What it checks |
|--------|---------------|
| `qa:mode-chip` | `tests/mode-chip-state-render-contract.mjs` — mode chip states, aria, active/locked/waiting/disabled styles, galaxy palette override |
| `qa:scene-health` | `tests/three-scene-playtest.mjs` — self-contained server + Playwright scene health: WebGL, luminance, mycelium continuity, focus pocket, map layout. Expected headless WebGL/readback warnings are classified in the script and do not fail the test; unexpected warnings still fail. |
| `qa:role-traversal` | `tests/semantic-role-traversal.spec.js` — Playwright proof that visible Support, Market, and Bridge rail paths can be followed and the next neighborhood remains semantic role-backed |
| `qa:surface:focus-search-ownership` | `tests/mobile-focus-search-surface-ownership-contract.mjs` — Playwright proof that mobile `focus-search` has one drawer-sized primary surface: `#focus-stage` |
| `qa:focus-readability` | `tests/focus-camera-readability-contract.mjs` — Playwright proof that mobile focus framing keeps the selected node and context graph readable |
| `qa:camera-ownership` | `tests/focus-camera-ownership-contract.mjs` — Playwright proof that semantic-dive and short-landscape camera framing keeps the selected node plus reachable neighbor context inside the usable canvas region |
| `qa:reset-map-ownership` | `tests/reset-map-interaction-ownership-contract.mjs` — Playwright proof that clear, Escape, and semantic-dive map handoff paths do not leave duplicate primary drawers or stale semantic-dive body state on map surfaces |
| `qa:product-playthrough` | `tests/product-playthrough-audit.mjs` — live walkthrough evidence for search, focus, neighbor preview/follow, Step Inside, map transition, desktop focus, and short landscape; not a release gate |
| `qa:adversarial` | `tests/polish-adversarial.spec.js` — Playwright adversarial polish suite (edge cases, loading states) |
| `qa:ui-renderers-seam` | `tests/ui-renderers-validation.spec.js` — Playwright UI renderers module validation |
| `qa:semantic-guide-fallback` | `tests/semantic-guide-fallback-contract.spec.js` — Playwright contract verifying showSemanticThreadsDetail() error path populates both story-text and source elements on API failure |
| `qa:live-semantic-roles` | `tests/live-semantic-roles-contract.mjs` — live `mccullough.cloud` smoke for deployed points, worker/data fetches, seven-role semantic distribution, and zero missing role metadata |
| `qa:live-reset` | `tests/live-reset-clear-demo-proof.spec.js` — Playwright proof for clear-search click/keyboard behavior and Escape during forced demo |
| `qa:live-step-inside` | `tests/live-step-inside-url-body-state-sync.spec.js` — Playwright proof for Step Inside URL/body state sync |
| `qa:live-reset-interaction` | `tests/live-ui-reset-interaction.spec.js` — Playwright proof for live reset interaction state cleanup |
| `qa:canvas-hit-test` | `tests/canvas-hit-test-interaction.spec.js` — Playwright proof for canvas hit-test interaction wiring |
