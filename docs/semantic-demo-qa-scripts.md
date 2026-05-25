# Semantic Demo QA Scripts

## Contract Scripts (fast, DOM/layout assertions)

| Script | Surfaces tested | Viewport |
|--------|----------------|----------|
| `qa:contract:all` | all 17 surfaces | mixed |
| `qa:contract:mobile-critical` | mobile-idle, search-chrome, focus-pocket, map-trail, controls, field-node, compass-rail, global-spacing | 390x844 mobile |
| `qa:contract:mobile-chrome` | search-chrome | 390x844 mobile |
| `qa:contract:phase-a` | info-panel-empty, compass-rail, loading-overlay, mode-grid | mixed |
| `qa:contract:phase-b` | filters, thread-inspector, controls, search-chrome, info-panel-populated | mixed |

Named surfaces: `mobile-idle`, `desktop-idle`, `launch-focus`, `search-error`, `map-trail`, `focus-pocket`, `field-node`, `info-panel-empty`, `compass-rail`, `loading-overlay`, `mode-grid`, `filters`, `thread-inspector`, `controls`, `search-chrome`, `info-panel-populated`, `global-spacing`.

## Visual Audit Scripts (screenshot-based)

| Script | States | Notes |
|--------|--------|-------|
| `qa:surface:all` | all 22 visual states | ~60-90s |
| `qa:surface:mobile-idle` | 01-mobile-idle | |
| `qa:surface:desktop-idle` | 07-desktop-idle | |
| `qa:surface:focus` | 03-mobile-focus-first-result + 04-mobile-field-node-active | |
| `qa:surface:search-error` | 10-mobile-search-error-state | |
| `qa:surface:map-trail` | 11-mobile-selected-card-map-trail | |
| `qa:surface:desktop-map-trail` | 11-desktop-selected-card-map-trail | |
| `qa:surface:reduced-motion` | 12-desktop-reduced-motion | |
| `qa:surface:info-panel-populated` | 16-desktop-info-panel-populated | |
| `qa:surface:thread-inspector` | 17-mobile-thread-inspector | |
| `qa:surface:loading-overlay` | 18-mobile-loading-overlay | |
| `qa:surface:compass-rail` | 19-mobile-compass-rail | |
| `qa:surface:mode-grid` | 20-mobile-mode-grid-visible | |

States: `01-mobile-idle`, `02-mobile-search-coffee`, `03-mobile-focus-first-result`, `04-mobile-field-node-active`, `05-mobile-map`, `06-mobile-filters-open`, `07-desktop-idle`, `08-desktop-search-coffee`, `09-mobile-map-empty-state`, `10-mobile-search-error-state`, `11-mobile-selected-card-map-trail`, `11-desktop-selected-card-map-trail`, `12-desktop-reduced-motion`, `13-desktop-filters-open` (desktop viewport capture only — desktop filters are mobile-only, always display:none in idle), `13-mobile-reduced-motion`, `14-desktop-search-error`, `15-mobile-semantic-dive`, `16-desktop-info-panel-populated`, `17-mobile-thread-inspector`, `18-mobile-loading-overlay`, `19-mobile-compass-rail`, `20-mobile-mode-grid-visible`.

## UI Quality & Motion Scripts

| Script | What it checks |
|--------|---------------|
| `qa:ui-quality` | `tests/ui-quality-contract.mjs` — accessibility, touch targets, visual hierarchy |
| `qa:surface-redundancy` | `tests/surface-redundancy-contract.mjs` — CSS selector duplication tracking |
| `qa:micro-interactions` | `tests/micro-surface-interactions-contract.mjs` — micro-demo choreography, panel transitions |
| `qa:motion-state` | `tests/motion-state-contract.mjs` — reduced-motion JS state wiring |
| `qa:reduced-motion-transition` | `tests/reduced-motion-transition-contract.mjs` — canonical reduced-motion owner check + Playwright computed-style proof of transition suppression |

## Contract Test Suite (`npm run test:contract`)
Runs the pinned ordered contract suite from `tests/run-all-contracts.js`; `tests/contracts.manifest.json` also classifies targeted groups such as `core`, `navigation`, `scene`, `smoke`, `mobile-critical`, `motion`, `lifecycle`, `browser`, `render`, `quality`, and `full`.

## Manifest Group Scripts (`npm run test:contract:<group>`)

| Script | Group | Contracts |
|--------|-------|-----------|
| `test:contract:core` | `core` | semantic-dive-ui-surface, search-state-surface, state-transition, focus-semantic-state-boundary, semantic-lane, connection-analysis, exploration-modes (7 contracts) |
| `test:contract:navigation` | `navigation` | journey-compass-state, journey-thread-inspector, journey-window-surface, journey-event-bindings, trail-review-focus, pathfinding (6 contracts) |
| `test:contract:scene` | `scene` | scene-reveal, scene-atmosphere, three-visual-polish, reduced-motion-transition, reduced-motion-interruption (5 contracts) |
| `test:contract:smoke` | `smoke` | weather-lifecycle, weather-surface-ownership, camera-auto-rotate-settle, scene-reveal, loading-ui, motion-state (6 contracts, sub-1s total) - fast smoke, no browser needed |
| `test:contract:mobile-critical` | `mobile-critical` | semantic-dive-ui-surface, search-state-surface, focus-pocket-motion, focus-pocket-composition, micro-demo, demo-init-seam, reset-callsite-routing, demo-camera-retirement, cluster-labels, window-bridge-gaps, loading-ui, short-landscape-layout, critical-visual-layout-regression (13 contracts) |
| `test:contract:lifecycle` | `lifecycle` | lifecycle-composition, state-transition, focus-semantic-state-boundary, demo-init-seam, reset-callsite-routing, semantic-guide-payload, demo-camera-retirement, demo-state-sync, weather-lifecycle, window-bridge-gaps, residual-window-bridge-inventory, lifecycle-semantic-guide-residual-bridge, legend-ui-ownership, semantic-dive-ui-dewindowing, semantic-dive-active-owner, state-ownership, filter-ownership, cluster-filter-city-filter-side-effect, keyboard-reset-ownership, url-state-search-dewindowing, cluster-filter-dewindowing, search-state-ui-adapter, url-state-navigation-dewindowing, focus-selection-owner, focus-pocket-state-owner, bootstrap-window-export, lifecycle-search-panel-ownership, search-lifecycle-adapter (28 contracts) |
| `test:contract:motion` | `motion` | camera-controls-motion, focus-pocket-motion, motion-state, camera-auto-rotate-settle, semantic-dive-reverse, focus-transition (6 contracts) |
| `test:contract:browser` | `browser` | focus-stage-render, info-panel-collapsed-render, mode-chip-state-render, weather-widget-render, connection-analysis-render-state, search-peek-expanded-render (6 contracts, 5-20s each) - Playwright browser launch required |
| `test:contract:render` | `render` | Same contracts as `browser` - backward-compatible alias; prefer `test:contract:browser` for new scripts |
| `test:contract:quality` | `quality` | css-manifest-contract, focus-stage-css-ownership-contract, ui-quality-contract, micro-surface-interactions, surface-redundancy, aria-sync-contract, focus-trap-contract, persistence-contract, disposal-hygiene-contract.spec.js (9 contracts; may write tmp reports and fails on UI quality regressions) |
| `test:contract:full` | `full` | All pinned contracts in manifest-defined order |
| `test:contract:phase-a` | phase-a surfaces | info-panel-empty, compass-rail, loading-overlay, mode-grid |
| `test:contract:phase-b` | phase-b surfaces | filters, thread-inspector, controls, search-chrome, info-panel-populated |
| `test:contract:3d-focus-neighborhood` | `3d-focus-neighborhood` | focus-pocket-selectability, overlay-hit-stealing, hover-affordance, thread-orchestration-quality, camera-orbit-resilience, focus-neighborhood-geometry, focus-neighborhood-interaction (7 contracts; runner is sequential — not the cause of remaining failures) |
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

**Fast vs slow split:** `smoke` (sub-second, no browser) is the fast lane. `browser`/`render` (5-20s each, Playwright required) is the slow lane. Use `--list` on the runner to preview any group before running: `node tests/run-all-contracts.js --list`.

## Usage Notes
All scripts target `http://127.0.0.1:8795/vector-explorer-polished.html` by default. Start the server with `npm run serve` before running any QA scripts.

## Additional QA Scripts

| Script | What it checks |
|--------|---------------|
| `qa:mode-chip` | `tests/mode-chip-state-render-contract.mjs` — mode chip states, aria, active/locked/waiting/disabled styles, galaxy palette override |
| `qa:scene-health` | `tests/three-scene-playtest.mjs` — self-contained server + Playwright scene health: WebGL, luminance, mycelium continuity, focus pocket, map layout |
| `qa:adversarial` | `tests/polish-adversarial.spec.js` — Playwright adversarial polish suite (edge cases, loading states) |
| `qa:ui-renderers-seam` | `tests/ui-renderers-validation.spec.js` — Playwright UI renderers module validation |
| `qa:semantic-guide-fallback` | `tests/semantic-guide-fallback-contract.spec.js` — Playwright contract verifying showSemanticThreadsDetail() error path populates both story-text and source elements on API failure |
| `qa:live-reset` | `tests/live-reset-clear-demo-proof.spec.js` — Playwright proof for clear-search click/keyboard behavior and Escape during forced demo |
