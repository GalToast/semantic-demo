# Production Preview Parity Baseline — 2026-06-17

## Purpose

Document the dev-mode vs production-preview parity for the body data-attr layer. The W15 deeper parity-attrs gap (`data-journey-phase` reverting to `'overview'` after a search-result focus click) was originally a production-only issue caused by the pre-bundled legacy `updateJourneyCompass` in `dist/svelte/assets/panel-bindings-*.js`. The fix in commit `42aa09b` + parity-attrs derivation rework in `db9eb8d` (W22) + the Svelte bundle rebuild verified by this baseline closes that gap.

## Test methodology

- **Server:** `npx vite preview --config vite.config.ts --port 4174 --host 127.0.0.1`
- **Bundle:** `dist/svelte/assets/index-C2x4Ful_.js` (1.4 MB minified)
- **URL:** `http://127.0.0.1:4174/?nodemo=1&view=galaxy`
- **Mock fetch:** `/api/search` returns `{ok: true, count: 3, results: [{lead_id: 522, ...}]}`, `/api/semantic/health` returns `{ok: true, state: 'healthy'}`
- **Flow:** click search mode radio → fill `#search-input` with "cafe" → press Enter → click first `.search-result-item`

## Body data-attrs baseline

### Before search-result click (overview/idle state)

| Attr                        | Value      |
| --------------------------- | ---------- |
| `data-mode`                 | `overview` |
| `data-nav-mode`             | `overview` |
| `data-nav-surface`          | `idle`     |
| `data-panel-surface`        | `idle`     |
| `data-panel-surface-mode`   | `idle`     |
| `data-panel-surface-detail` | `none`     |
| `data-journey-phase`        | `overview` |
| `data-graph-context`        | `overview` |
| `data-search-status`        | `idle`     |
| `data-trail-depth`          | `0`        |
| `data-trail-state`          | `inactive` |
| `data-semantic-dive`        | `inactive` |
| `data-focused-node`         | (absent)   |
| `data-focus-origin`         | (absent)   |
| `data-loading-overlay`      | `hidden`   |
| `data-scene-ready`          | `true`     |

### After search-result click (focus-search state)

| Attr                        | Value           | Expected           | Pass                   |
| --------------------------- | --------------- | ------------------ | ---------------------- |
| `data-mode`                 | `focus`         | `focus`            | ✓                      |
| `data-nav-mode`             | `focus`         | `focus`            | ✓                      |
| `data-nav-surface`          | `focus-search`  | `focus-search`     | ✓                      |
| `data-panel-surface`        | `focus-search`  | `focus-search`     | ✓                      |
| `data-panel-surface-mode`   | `focus-search`  | `focus-search`     | ✓                      |
| `data-panel-surface-detail` | `none`          | `none`             | ✓                      |
| `data-journey-phase`        | `focus-search`  | `focus-search`     | ✓ **W15 fix verified** |
| `data-graph-context`        | `focus`         | `focus`            | ✓                      |
| `data-search-status`        | `focusing`      | `focusing`         | ✓                      |
| `data-trail-depth`          | `1`             | `1`                | ✓                      |
| `data-trail-state`          | `active`        | `active`           | ✓                      |
| `data-semantic-dive`        | `inactive`      | `inactive`         | ✓                      |
| `data-focused-node`         | `522`           | `522`              | ✓                      |
| `data-focus-origin`         | `search-result` | `search-result`    | ✓                      |
| `data-search-glow`          | `inactive`      | (set by cursor.ts) | ✓                      |
| `data-focus-search-forced`  | `true`          | `true`             | ✓                      |
| `data-route-exploration`    | `idle`          | `idle`             | ✓                      |
| `data-strand-journey`       | `idle`          | `idle`             | ✓                      |
| `data-loading-overlay`      | `hidden`        | `hidden`           | ✓                      |
| `data-scene-ready`          | `true`          | `true`             | ✓                      |

## Result

**ALL 8 critical body data-attrs are correct in the production preview build.**

Specifically, the W15 deeper parity-attrs gap is now fully resolved at all levels:

- Source code: commits `42aa09b` (syncSvelteNavFromLegacy), `37636fe` (FOCUS_NODE branch mirror), `83a0220` (Canvas onNodePicked), parity-attrs derivation rework (W22)
- Production bundle: `dist/svelte/assets/index-C2x4Ful_.js` contains all the fixes
- Integration test: `tests/integration/w15-body-attr-live-probe.spec.js` validates this baseline

## Dev-mode vs production parity

The dev-mode Vite server (port 5175) and the production preview server (port 4174) return **identical body data-attr values** for the same user flow. The parity layer works correctly in both modes.

Dev mode difference:

- Source maps enabled
- HMR enabled
- No minification
- Tests run against source files via `importOriginal` mocks

Production preview difference:

- Minified bundle
- No HMR
- Source maps stripped
- Tests run against the actual built bundle

Both modes converge to the same body data-attr values, which is the desired behavior.

## How to reproduce

```bash
# 1. Build the Svelte bundle (one-time)
npm run build:svelte

# 2. Start the production preview server
nohup npx vite preview --config vite.config.ts --port 4174 --host 127.0.0.1 &

# 3. Navigate to the app with Playwright MCP
# http://127.0.0.1:4174/?nodemo=1&view=galaxy

# 4. Click Search mode, type "cafe", press Enter, click first result

# 5. Inspect document.body.dataset for the 8 critical attrs:
#    mode, navMode, navSurface, panelSurface, journeyPhase,
#    graphContext, searchStatus, focusedNode, focusOrigin, trailDepth

# All should reflect the focus-search state after click.
```

## Regression detection

To detect regression, run `npm run lint:nav-mirror` (CI check exits 0) AND `npx vitest run tests/unit-active/parity-attrs-derivation.test.ts` (84/84 tests pass) AND this production preview baseline check.

If any of these fail, the parity layer has regressed. The W15 deeper gap would manifest as `data-journey-phase` showing `'overview'` instead of `'focus-search'` after the focus click.

## Related documents

- `notes/w15-parity-attrs-second-look-2026-06-17.md` — W15 closeout
- `notes/legacy-mirror-audit-2026-06-17.md` — Mirror discipline audit
- `docs/nav-state-ownership.md` — Field-by-field ownership map
- `docs/svelte-5-strict-mode-cookbook.md` — Svelte 5 `!==` → `===` bug cookbook
- `tests/integration/w15-body-attr-live-probe.spec.js` — Integration test
- `tests/unit-active/parity-attrs-derivation.test.ts` — Unit tests for the derivations
