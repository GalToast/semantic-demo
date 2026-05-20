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
| `qa:surface:all` | all 16 visual states | ~60-90s |
| `qa:surface:mobile-idle` | 01-mobile-idle | |
| `qa:surface:desktop-idle` | 07-desktop-idle | |
| `qa:surface:focus` | 03-mobile-focus-first-result + 04-mobile-field-node-active | |
| `qa:surface:search-error` | 10-mobile-search-error-state | |
| `qa:surface:map-trail` | 11-mobile-selected-card-map-trail | |
| `qa:surface:desktop-map-trail` | 11-desktop-selected-card-map-trail | |
| `qa:surface:reduced-motion` | 12-desktop-reduced-motion | |

States: `01-mobile-idle`, `02-mobile-search-coffee`, `03-mobile-focus-first-result`, `04-mobile-field-node-active`, `05-mobile-map`, `06-mobile-filters-open`, `07-desktop-idle`, `08-desktop-search-coffee`, `09-mobile-map-empty-state`, `10-mobile-search-error-state`, `11-mobile-selected-card-map-trail`, `12-desktop-reduced-motion`, `13-desktop-filters-open` (desktop viewport capture only — desktop filters are mobile-only, always display:none in idle), `14-desktop-search-error`, `13-mobile-reduced-motion`, `15-mobile-semantic-dive`.

## UI Quality & Motion Scripts

| Script | What it checks |
|--------|---------------|
| `qa:ui-quality` | `tests/ui-quality-contract.mjs` — accessibility, touch targets, visual hierarchy |
| `qa:surface-redundancy` | `tests/surface-redundancy-contract.mjs` — CSS selector duplication tracking |
| `qa:micro-interactions` | `tests/micro-surface-interactions-contract.mjs` — micro-demo choreography, panel transitions |
| `qa:motion-state` | `tests/motion-state-contract.mjs` — reduced-motion JS state wiring |
| `qa:reduced-motion-transition` | `tests/reduced-motion-transition-contract.mjs` — canonical reduced-motion owner check + Playwright computed-style proof of transition suppression |

## Contract Test Suite (`npm run test:contract`)
Runs the pinned ordered contract suite from `tests/run-all-contracts.js`; `tests/contracts.manifest.json` also classifies targeted groups such as `smoke`, `mobile-critical`, `motion`, `lifecycle`, `render`, `quality`, and `full`.

## Manifest Group Scripts (`npm run test:contract:<group>`)

| Script | Group | Contracts |
|--------|-------|-----------|
| `test:contract:smoke` | `smoke` | weather-lifecycle, weather-surface-ownership, camera-auto-rotate-settle, scene-reveal, loading-ui, motion-state (6 contracts, ~400ms total) |
| `test:contract:mobile-critical` | `mobile-critical` | semantic-dive-ui-surface, search-state-surface, journey-compass-state, focus-pocket-motion, focus-pocket-composition, journey-event-bindings, micro-demo, demo-camera-retirement, cluster-labels, journey-thread-inspector, window-bridge-gaps, loading-ui, exploration-modes, search-peek-expanded-render (14 contracts) |
| `test:contract:lifecycle` | `lifecycle` | lifecycle-composition, state-transition, demo-init-seam, demo-camera-retirement, demo-state-sync, weather-lifecycle, journey-event-bindings, window-bridge-gaps (8 contracts) |
| `test:contract:motion` | `motion` | camera-controls-motion, focus-pocket-motion, motion-state, reduced-motion-transition, reduced-motion-interruption, camera-auto-rotate-settle, scene-reveal, scene-atmosphere, three-visual-polish (9 contracts) |
| `test:contract:render` | `render` | focus-stage-render, info-panel-collapsed-render, mode-chip-state-render, weather-widget-render, connection-analysis-render-state (5 contracts) |
| `test:contract:quality` | `quality` | css-manifest-contract, ui-quality-contract, micro-surface-interactions, surface-redundancy (4 contracts; may write tmp reports and fails on UI quality regressions) |
| `test:contract:full` | `full` | All 34 pinned contracts in manifest-defined order |
| `test:contract:phase-a` | phase-a surfaces | info-panel-empty, compass-rail, loading-overlay, mode-grid |
| `test:contract:phase-b` | phase-b surfaces | filters, thread-inspector, controls, search-chrome, info-panel-populated |

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
