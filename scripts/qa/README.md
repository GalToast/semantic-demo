# Unified QA Runner

Replaces the scattered `qa:*`, `test:contract:*`, and `capture:visual` npm scripts with a single CLI.

## Quick Start

```bash
# Surface contract check for a single surface
node scripts/qa.mjs contract --surface=mobile-idle --headed

# Visual audit for a set of states
node scripts/qa.mjs visual --states=01-mobile-idle,07-desktop-idle --headed

# All visual states
node scripts/qa.mjs visual --all --headed

# All surface contract checks
node scripts/qa.mjs contract --all --headed

# Specific contract group (delegates to tests/run-all-contracts.js)
node scripts/qa.mjs contract-group core
node scripts/qa.mjs contract-group 3d-smoke --stop-on-first-fail

# Mobile-critical surface preset
node scripts/qa.mjs contract --preset=mobile-critical --headed

# Full product playthrough
node scripts/qa.mjs playthrough --headed
node scripts/qa.mjs playthrough --real-route-visual --headed
```

## Migration Map (old → new)

Old npm script → New command

```bash
# Old
npm run qa:surface:mobile-idle
# New
node scripts/qa.mjs contract --surface=mobile-idle --headed

# Old
npm run qa:surface:all
# New
node scripts/qa.mjs contract --all --headed

# Old
npm run qa:contract:mobile-critical
# New
node scripts/qa.mjs contract --preset=mobile-critical --headed

# Old
npm run qa:visual
# New
node scripts/qa.mjs visual --all --headed

# Old
npm run qa:product-playthrough
# New
node scripts/qa.mjs playthrough --headed

# Old
npm run test:contract:core
# New
node scripts/qa.mjs contract-group core

# Old
npm run test:contract:3d-smoke
# New
node scripts/qa.mjs contract-group 3d-smoke
```

## Surface IDs

| Surface                        | Coverage                |
| ------------------------------ | ----------------------- |
| `mobile-idle`                  | Default mobile view     |
| `desktop-idle`                 | Default desktop view    |
| `launch-focus`                 | Initial focus state     |
| `search-error`                 | Search with error       |
| `search-no-results`            | Empty search results    |
| `map-trail`                    | Map trail visible       |
| `focus-pocket`                 | Focus pocket open       |
| `field-node`                   | Field node selected     |
| `info-panel-empty`             | Info panel (empty)      |
| `compass-rail`                 | Compass rail visible    |
| `loading-overlay`              | Loading state           |
| `mode-grid`                    | Mode grid visible       |
| `filters`                      | Filters panel open      |
| `thread-inspector`             | Thread inspector active |
| `controls`                     | Controls visible        |
| `search-chrome`                | Search chrome active    |
| `info-panel-populated`         | Info panel with data    |
| `global-spacing`               | Global spacing check    |
| `mobile-product-focus-route`   | Mobile product focus    |
| `mobile-product-preview-route` | Mobile product preview  |

## Visual State IDs

| State ID                            | Description               |
| ----------------------------------- | ------------------------- |
| `01-mobile-idle`                    | Mobile idle               |
| `02-mobile-search-coffee`           | Mobile search (coffee)    |
| `03-mobile-focus-first-result`      | Focus first result        |
| `04-mobile-field-node-active`       | Field node active         |
| `05-mobile-journey-card`            | Journey card              |
| `06-mobile-semantic-dive`           | Semantic dive             |
| `07-desktop-idle`                   | Desktop idle              |
| `08-desktop-search-coffee`          | Desktop search (coffee)   |
| `09-desktop-search-no-results`      | Desktop search empty      |
| `10-mobile-search-error-state`      | Mobile search error       |
| `11-mobile-selected-card-map-trail` | Selected card + map trail |
| `12-desktop-reduced-motion`         | Reduced motion            |
| `13-desktop-filters-open`           | Filters open              |
| `14-desktop-search-error`           | Desktop search error      |
| `15-mobile-semantic-dive`           | Mobile semantic dive      |
| `16-desktop-info-panel-populated`   | Info panel populated      |
| `17-mobile-thread-inspector`        | Thread inspector          |
| `18-mobile-loading-overlay`         | Loading overlay           |
| `19-mobile-compass-rail`            | Compass rail              |
| `20-mobile-mode-grid-visible`       | Mode grid visible         |
| `21-mobile-route-trace-visible`     | Route trace visible       |
| `22-mobile-semantic-dive-320`       | Semantic dive (320px)     |
| `23-mobile-short-landscape`         | Short landscape           |
| `24-mobile-map-focus-search`        | Map focus search          |
| `25-mobile-search-no-results`       | Mobile search empty       |

## Environment Variables

- `PW_HEADLESS=1` — Force headless mode
- `PLAYWRIGHT_HEADLESS=1` — Force headless mode
- `SEMANTIC_VISUAL_AUDIT_STATES` — Comma-separated list of visual states
- `SURFACE_CONTRACT_URL` — Override contract check URL
- `SURFACE_CONTRACT_SHELL` — Override shell (`legacy` or `svelte`)
