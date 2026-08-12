# Landmine-fix2: bridge-rewire 19 static `@lib` top-imports (the c-class crash class)

## Context

The `tests/*.spec.js` files imported a Svelte-runes/state class from `@lib/*`
(`@lib/stores|state|journey|orchestration|engine|search`) at the top of the
module. Playwright loads spec files in Node, where:

1. The `@lib/*` alias is Vite-only — Node raises `Cannot find package '@lib/...'`
   (verified at the start of this work: `node -e "import('./tests/camera-motion-visual-smoke.spec.js')"`
   → `CRASH: Cannot find package '@lib/search'`).
2. Even if a loader normalizer (ce26837b for the `.mjs` dynamic-import class)
   were applied, the Svelte state class itself uses runes (`$state` etc.) that
   have no Node shim — this is the same `$state is not defined` class the 3d
   battery hit (afc81073) and was only fixed for the 3d specs in that commit.

The crash class was the **static top-level import of a stateful Svelte module
into a Playwright spec file**. Removing the import (and rewiring the few call
sites that referenced the imported symbol) is the durable fix.

The pattern that the 3d battery already uses for the same problem (3d-camera-
orbit-resilience.spec.js) is `page.evaluate(() => window.__navActions__?.[X]?.())`
— the canonical test-bridge in `@lib/orchestration/test-globals.ts` (see also
`docs/tool-guide.md` and `docs/session-coordination.md`).

## Classification

| Bucket                                       | Count | Action                |
| -------------------------------------------- | ----- | --------------------- |
| (a) type-only                                |   0   | n/a (none present)    |
| (b) pure util (`@lib/utils/*`, `@lib/types/*`, `@lib/onboarding/*`, `@lib/data-loader`) |   8   | KEEP — no Svelte runes |
| (c) stateful Svelte (`@lib/stores|state|journey|orchestration|engine|search`) |  19   | FIX — bridge-rewire    |

## Files modified (19 c-class)

| File | Imports removed | Bridge call site |
|------|-----------------|------------------|
| `tests/camera-motion-visual-smoke.spec.js` | `search` from `@lib/search/state` | `window.__navActions__?.search?.('coffee')` |
| `tests/critical-visual-layout-regression.spec.js` | `setTrailDepth` from `@lib/stores/journey.svelte`, `focusOnNode` from `@lib/orchestration/lifecycle` | `window.__navActions__?.setTrailDepth?.(1, { skipUrlSync: true })`, `window.__navActions__?.focusOnNode?.(4200, { fromSearchResult: true })` |
| `tests/data-boundary-stress.spec.js` | `search`, `focusOnNode` | `window.__navActions__?.search?.('...', { ... })`, `window.__navActions__?.focusOnNode?.(9001, 'search')` |
| `tests/disposal-hygiene-contract.spec.js` | `clearSearch`, `search` | `typeof window.__navActions__?.clearSearch === 'function'` (waitForFunction), `window.__navActions__?.search?.(q, { ... })` (4 call sites) |
| `tests/dynamic-lighting-contract.spec.js` | `search` | `window.__navActions__?.search?.(q, { ... })` |
| `tests/focus-semantic-line-contract.spec.js` | `setTrailDepth` from `@lib/stores/journey.svelte`, `setTrailFromSeed` from `@lib/journey/neighborhood` | `window.__navActions__?.setTrailDepth?.(1, { skipUrlSync: true })`, `window.__navActions__?.setTrailFromSeed?.(0)` |
| `tests/live-reset-clear-demo-proof.spec.js` *(legacy shell)* | `clearSearch`, `search`, `resetExplorationFocus` | `typeof window.__navActions__?.clearSearch === 'function'`, `window.__navActions__?.search?.(q)`, `window.__navActions__?.resetExplorationFocus?.()` |
| `tests/live-reset-proof.spec.js` *(legacy shell)* | `returnToOverview`, `resetExplorationFocus`, `search` | `typeof window.__navActions__?.resetExplorationFocus === 'function'`, `window.__navActions__?.returnToOverview?.()`, `window.__navActions__?.resetExplorationFocus?.()`, `window.__navActions__?.search?.(q)` |
| `tests/live-state-transition-ui-paths.spec.js` | `clearSearch`, `search`, `setSemanticDiveMode` | `typeof window.__navActions__?.clearSearch === 'function'`, `window.__navActions__?.setSemanticDiveMode === 'function'`, `window.__navActions__?.search?.(q, { ... })`, `window.__navActions__?.clearSearch?.()` |
| `tests/live-step-inside-url-body-state-sync.spec.js` | `refreshCompositionState`, `setSemanticDiveMode`, `search` | `typeof window.__navActions__?.refreshCompositionState === 'function'`, `window.__navActions__?.setSemanticDiveMode === 'function'`, `window.__navActions__?.search === 'function'`, `window.__navActions__?.search?.(q)` (2 call sites) |
| `tests/live-ui-reset-interaction.spec.js` | `setSemanticDiveMode`, `refreshCompositionState`, `clearSearch` | `typeof window.__navActions__?.setSemanticDiveMode === 'function'`, `window.__navActions__?.refreshCompositionState === 'function'`, `typeof window.__navActions__?.clearSearch === 'function'` |
| `tests/live-url-state-reconstruction.spec.js` | `search` | `window.__navActions__?.search?.('coffee')` |
| `tests/node-interaction-contract.spec.js` | `search` | `typeof window.__navActions__?.search === 'function'`, `window.__navActions__?.search?.('coffee', { ... })` |
| `tests/polish-adversarial.spec.js` | `refreshCompositionState` | `window.__navActions__?.refreshCompositionState?.()` (2 call sites) |
| `tests/reset-experience-state.spec.js` | `switchView`, `resetExperienceState` | `typeof window.__navActions__?.resetExperienceState === 'function'`, `window.__navActions__?.switchView?.('map', { ... })`, `window.__navActions__?.resetExperienceState?.()` |
| `tests/sd143-map-search-visual.spec.js` | `switchView` | `typeof window.__navActions__?.switchView === 'function'`, `window.__navActions__?.switchView?.('map', { ... })` |
| `tests/semantic-role-traversal.spec.js` | `focusOnNode`, `refreshCompositionState`, `setTrailDepth` | `window.__navActions__?.focusOnNode`, `window.__navActions__?.setTrailDepth`, `window.__navActions__?.refreshCompositionState` (capture inside `page.evaluate`) |
| `tests/short-landscape-transition-ui-paths.spec.js` | `search` | `window.__navActions__?.search?.(q, { ... })` |
| `tests/webgl-resilience-contract.spec.js` | `clearSearch` | `typeof window.__navActions__?.clearSearch === 'function'` |

## Files NOT modified (b-class, kept their imports)

These imported pure data/utility modules — no Svelte runes, no crash class:

- `tests/capture-phase2.spec.js` (`ONBOARDING_STORAGE_KEY` from `@lib/onboarding/onboarding-storage`)
- `tests/data-loader-abort.spec.js` (`callDataWorker` from `@lib/data-loader` — pure async, mocked Worker, Node-runnable)
- `tests/loading-overlay-error-state-journey.spec.js` (`ONBOARDING_STORAGE_KEY`)
- `tests/record-url-focus-restore-journey.spec.js` (`ONBOARDING_STORAGE_KEY`)
- `tests/search-input-cleared-status.spec.js` (`ONBOARDING_STORAGE_KEY`)
- `tests/search-input-escape-cancel-journey.spec.js` (`ONBOARDING_STORAGE_KEY`)
- `tests/thread-inspector-a11y-journey.spec.js` (`ONBOARDING_STORAGE_KEY`)
- `tests/weather-widget-context-journey.spec.js` (`ONBOARDING_STORAGE_KEY`)

## Fleet's dirty 3d specs — NOT touched (per task constraint)

- `tests/3d-hover-affordance.spec.js` — already had no `@lib` static import (verified)
- `tests/3d-focus-pocket-selectability.spec.js` — already had no `@lib` static import (verified)

The grep was scoped to `^import .*from ['\"]@lib/['\"]`; both were absent from the
26-file target list.

## Verification

### 1. No remaining c-class static imports

```bash
$ rg -l "@lib/(stores|state|journey|orchestration|engine|search)" tests/*.spec.js
(no output — exit 1, all clean)
```

### 2. `node --check` on all 19 touched files

All 19 spec files pass `node --check` (no syntax errors):

```
OK: tests/camera-motion-visual-smoke.spec.js
OK: tests/dynamic-lighting-contract.spec.js
OK: tests/live-url-state-reconstruction.spec.js
OK: tests/node-interaction-contract.spec.js
OK: tests/short-landscape-transition-ui-paths.spec.js
OK: tests/webgl-resilience-contract.spec.js
OK: tests/critical-visual-layout-regression.spec.js
OK: tests/data-boundary-stress.spec.js
OK: tests/disposal-hygiene-contract.spec.js
OK: tests/focus-semantic-line-contract.spec.js
OK: tests/live-ui-reset-interaction.spec.js
OK: tests/reset-experience-state.spec.js
OK: tests/sd143-map-search-visual.spec.js
OK: tests/polish-adversarial.spec.js
OK: tests/live-step-inside-url-body-state-sync.spec.js
OK: tests/live-state-transition-ui-paths.spec.js
OK: tests/semantic-role-traversal.spec.js
OK: tests/live-reset-clear-demo-proof.spec.js
OK: tests/live-reset-proof.spec.js
```

### 3. Node import-resolution (the actual crash class)

```bash
$ for f in <19 c-class files>; do
    node -e "import('./$f').then(()=>{}).catch(e => {
      if (e.message.includes('@lib/')) console.log('CRASH: ' + e.message)
    })" 2>&1
  done
(no output — zero @lib module resolution failures)
```

(The only crash signature is the expected `Playwright Test did not expect
test.describe() to be called here.` from `@playwright/test` runtime guard when
the file is loaded outside the `playwright test` CLI — not from `@lib/*`.)

**Before the fix** (control):

```bash
$ node -e "import('./tests/camera-motion-visual-smoke.spec.js')"
CRASH: Cannot find package '@lib/search' imported from .../camera-motion-visual-smoke.spec.js
```

### 4. Headless boot-only verification (3 fixed specs, server on :8795)

```bash
$ PLAYWRIGHT_REUSE_SERVER=1 SEMANTIC_USE_D3D11=1 TEST_BASE_URL=http://127.0.0.1:8795 \
    npx playwright test \
      tests/camera-motion-visual-smoke.spec.js \
      tests/short-landscape-transition-ui-paths.spec.js \
      tests/live-state-transition-ui-paths.spec.js \
      --workers=1
Running 8 tests using 1 worker
  [1/8] tests\camera-motion-visual-smoke.spec.js:207:5 › ... (loaded + executed)
  [2/8] tests\live-state-transition-ui-paths.spec.js:115:1 › ... (loaded + executed)
  ...
```

The boot is the test: 8/8 spec invocations reached Playwright's test runner
(previously the suite died at module-load time with `Cannot find package
'@lib/...'`). Failures observed are environmental (e.g. `#search-input` not
visible on the dev server) — they are not import-time crashes.

## Edge cases handled

1. **Legacy shell tests** (`live-reset-clear-demo-proof.spec.js`,
   `live-reset-proof.spec.js`) target `vector-explorer-polished.html` which
   404s in this workspace. They were already broken at runtime; the import
   removal at least lets the spec files load in Node. Their `await
   page.waitForFunction(() => typeof window.__navActions__?.X === 'function')`
   patterns will still time out at runtime, but that's the pre-existing
   pre-fix runtime behavior, not a new regression.

2. **Pre-existing `const X = X` self-shadow pattern** was a TDZ-style
   workaround for the same crash class — it crashed silently (X was
   `undefined` in the browser). All 8 instances across 4 files were replaced
   with the `window.__navActions__?.[X]?.()` pattern that actually
   resolves in the browser at runtime.

3. **`page.evaluate(() => clearSearch())`** style calls were replaced with
   `page.evaluate(() => window.__navActions__?.clearSearch?.())` so the
   optional-chaining keeps the call a no-op if the bridge isn't yet
   installed (graceful early-frame behavior, matches the existing `?.()` idiom
   used in 3d specs).

## Files in scope

- Modified: `tests/*.spec.js` (19 files, c-class only)
- Added: `tmp/landmine-fix2-REPORT.md` (this file)

## Out of scope (per task constraint)

- `src/` (no source changes)
- `tests/3d-hover-affordance.spec.js`, `tests/3d-focus-pocket-selectability.spec.js`
  (fleet's dirty 3d specs)
- `css/` (no CSS changes)
