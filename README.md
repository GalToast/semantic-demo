# Semantic Explorer

## Overview
A 3D semantic mycelium visualization for exploring business relationships in Montgomery County.

This directory is the standalone product repo for the Semantic Explorer. It was extracted from the broader McCullough Digital workspace so app source, QA, deployment scripts, runtime data, and product documentation can move together without the rest of the workspace noise.

Canonical local app shell:

```text
vector-explorer-polished.html
```

Live URL:

```text
https://mccullough.cloud/semantic-demo/vector-explorer-polished.html
```

## Start Here
**New to this codebase?** Quick orientation order:
1. `js/modules/app.js` - main entry, imports all modules in dependency order
2. `js/state.js` - single source of truth for all global state
3. `js/modules/micro-demo.js` - the 9-second guided first-visit experience
4. `js/modules/journey.js` - trail state, neighbor calculation, selected-card orchestration
5. `js/modules/ui-renderers.js` - DOM renderers for legend, search rows, and selected-card chrome
6. `js/modules/search-state.js` - search engine, query tokenization, result rendering
7. `AGENTS.md` - local agent guidance (module ownership, state machines, edit safety rules)
8. `TEST_STRATEGY.md` - how to verify changes (contract vs visual audit layers)

Key commands:
```bash
npm install                # first setup
npm run build              # bundle to dist/bundle.js
npm run test               # shell/cache/CSS ownership checks
npm run test:contract      # structural JS/DOM contract tests (~20 test files)
npm run serve              # local static server on 127.0.0.1:8795
npm run qa:contract:all    # fast DOM/layout assertions (17 surfaces, ~5-10s)
npm run qa:surface:all     # visual screenshot audit (22 states, ~60-90s)
npm run qa:short-landscape:release # constrained layout + transition behavior proof
```

## Recent Architectural Changes
- **JS Renderer Extraction**: UI renderer functions (buildLegend, renderSignalBadges, updateSelectedCardHeading, renderSelectedMetaStrip, renderSelectedMatchPanel, renderSelectedActionRow, setActiveSearchResultRow) are centralized in `js/modules/ui-renderers.js`. This module owns all window-bound renderer functions. `js/modules/ui-renderers-lifecycle.js` was a stub removed during extraction — do not recreate.
- **Modular CSS**: The single monolithic CSS file has been split into 17 ordered modules. See `docs/semantic-demo-css-ownership-map.md` for details.
- **CSS State Ownership**: `data-panel-surface` and related `data-*` body attributes are the canonical state interface between JS and CSS. See `docs/semantic-demo-mobile-state-ownership.md`.
- **Mobile Surface Polish**: Deterministic QA with contract tests for mobile layout geometry, panel proportions, and 3D scene quality. Playwright-based surface contracts cover clipping, overlap, and touch targets.
- **Micro-demo Fixes**: Resolved race conditions in the guided interaction loop, ensuring a reliable "Step Inside" experience for new users.
- **Journey Compass State Machine**: `journey-compass-state.js` owns action synthesis driven by `data-panel-surface` and `data-journey-phase`.

## Development & Maintenance
### Styles
New styles should be added to the appropriate file in the `css/` directory. The main `semantic-demo.css` acts as the import manifest.
After changing any CSS module, run `npm run refresh:cache` so the import hash in `semantic-demo.css` is updated.

### Scripts
The JavaScript is modularized and bundled using `esbuild`.
- Source: `js/modules/`
- Build: `npm run build`
- Output: `dist/bundle.js`

### Audit & Verification
The visual audit runner is `tests/visual-state-audit.mjs`. It captures screenshots and layout snapshots for named UI states.

Short-landscape QA has three intentional viewport buckets:
- `667x375` / `768x380` for constrained layout contracts (`npm run qa:short-landscape`)
- `667x375` for interactive transition behavior (`npm run qa:short-landscape:transition`)
- `896x414` for the screenshot visual state (`npm run qa:surface:short-landscape`)

Use `npm run qa:short-landscape:release` when a short-landscape change needs both deterministic layout and transition coverage.

## Surface Contract Check (DOM/layout assertions)

Fast DOM/layout contract assertions complement the screenshot visual audit. Runs named surfaces independently without full visual-state audit infrastructure.

```bash
# All documented surfaces
node tests/surface-contract-check.mjs
node tests/surface-contract-check.mjs --surfaces=mobile-idle,desktop-idle,launch-focus,search-error,map-trail,focus-pocket,field-node,info-panel-empty,compass-rail,loading-overlay,mode-grid,filters,thread-inspector,controls,search-chrome,info-panel-populated,global-spacing

# Single surface
node tests/surface-contract-check.mjs --surface=mobile-idle
node tests/surface-contract-check.mjs --surface=launch-focus

# Override URL (default: http://127.0.0.1:8795/vector-explorer-polished.html)
node tests/surface-contract-check.mjs http://localhost:8080/vector-explorer-polished.html

# Via npm scripts
npm run qa:contract:all
npm run qa:contract:mobile-idle
```

**Surfaces:**
| Surface | Viewport | Key assertions |
|---------|----------|----------------|
| `mobile-idle` | 390x844 | touch targets >=44px, compass overlay check, black-on-dark, gutter >=8px, viewport overflow |
| `desktop-idle` | 1440x900 | selected-card border-radius 12px, canvas/map-container present, black-on-dark on panels |
| `launch-focus` | 390x844 | focus-stage DOM + overlay, dive-button touch target + text clip, kicker/label clip |
| `search-error` | 390x844 | error-state present, retry/dismiss buttons >=44px, no blocking overlay |

**Output:** `tmp/surface-contract-check/<run-id>/` with `mobile-idle.json`, `desktop-idle.json`, etc., plus `summary.json`. Console output is concise JSON with pass/fail counts and failure list.

## Visual State Audit (screenshot-based)

Run targeted surface checks without memorizing state IDs:

```bash
# Single states
npm run qa:surface:mobile-idle     # 01-mobile-idle
npm run qa:surface:desktop-idle    # 07-desktop-idle
npm run qa:surface:search-error    # 10-mobile-search-error-state
npm run qa:surface:map-trail       # 11-mobile-selected-card-map-trail
npm run qa:surface:reduced-motion   # 12-desktop-reduced-motion
npm run qa:surface:thread-inspector # 17-mobile-thread-inspector
npm run qa:surface:loading-overlay  # 18-mobile-loading-overlay
npm run qa:surface:compass-rail     # 19-mobile-compass-rail
npm run qa:surface:mode-grid        # 20-mobile-mode-grid-visible

# Combined slices
npm run qa:surface:focus           # 03-mobile-focus-first-result + 04-mobile-field-node-active

# Full visual-state suite
npm run qa:surface:all
npm run qa:surface                 # same as qa:surface:all

# Pass a target URL (useful with local server)
npm run qa:surface:mobile-idle -- http://127.0.0.1:8795/vector-explorer-polished.html

# Filter via CLI arg
node tests/visual-state-audit.mjs --states=01-mobile-idle,07-desktop-idle

# Filter via env var
SEMANTIC_VISUAL_AUDIT_STATES=01-mobile-idle,07-desktop-idle node tests/visual-state-audit.mjs
```

Available states: `01-mobile-idle`, `02-mobile-search-coffee`, `03-mobile-focus-first-result`, `04-mobile-field-node-active`, `05-mobile-map`, `06-mobile-filters-open`, `07-desktop-idle`, `08-desktop-search-coffee`, `09-mobile-map-empty-state`, `10-mobile-search-error-state`, `11-mobile-selected-card-map-trail`, `11-desktop-selected-card-map-trail`, `12-desktop-reduced-motion`, `13-desktop-filters-open`, `13-mobile-reduced-motion`, `14-desktop-search-error`, `15-mobile-semantic-dive`, `16-desktop-info-panel-populated`, `17-mobile-thread-inspector`, `18-mobile-loading-overlay`, `19-mobile-compass-rail`, `20-mobile-mode-grid-visible`.

Output goes to `tmp/semantic-ui-visual-audit/<run-id>/`. Each state produces `<state-id>.png` (screenshot), `<state-id>.json` (layout/box data), plus `summary.json` and `assertions.json`.
