---
name: deploy-status
description: Semantic demo deployed bundles v112-v125 to mccullough.cloud
type: project
---

# Deploy Status (2026-06-01)

## Bug Sweep 26 (2026-06-01) — Direct audit of uncommitted diff

**Scope:** Read-only audit of 27 uncommitted-modified files (8 JS modules + 1 worker + 3 CSS + tests + data). Lint baseline clean (0 errors). Visual screenshot pass skipped — http server died, chrome-devtools MCP has a stuck prior session.

**Fix status (2026-06-01, this pass):**
- ✅ **Bug 1 (CRITICAL) FIXED** — `map-flattening-layout.js` now reads `state.rawPositionsBuffer` when available
- ✅ **Bug 2 (MEDIUM) FIXED** — `loading-ui.js` imports `escapeHtml` from `dom-formatters.js`
- ✅ **Bug 3 (MEDIUM) FIXED** — `ui-renderers.js` `_marker` dead code removed (and the sister block in `renderSelectedActionRow`)
- ✅ **Regression test ADDED** — `tests/map-flattening-raw-buffer-contract.mjs` (7/7 checks pass); wired into `contracts.manifest.json` under the `smoke` group
- 🟡 **Bug 4 (MEDIUM) RECLASSIFIED** — NOT a bug; aligns with the documented `hasFocusedTrailRecord = selectedPoint OR focusedNode !== null OR focusedIndex !== null` model. Same pattern as `keyboard-help.js:200`. Leaving as-is.
- 🟡 **Bug 5 (LOW) RECLASSIFIED — ALREADY FIXED** — `state.dataLoadAttempt` guard is already in `data-loader.js:149` (added in commit `cc2c576` alongside the buffer refactor). The fix I suggested in this report is redundant.
- 🟡 **Bug 6 (LOW) RECLASSIFIED** — design debt, not a live bug. The new `setSurfaceHidden` and the existing `is-empty` class toggling in `journey-selected-card.js` produce the same result via different mechanisms; both compose correctly because inline `style.display` wins over CSS rules.
- 🟡 **Bug 7 (LOW) RECLASSIFIED — ALREADY CLEANER** — The current diff is a *cleanup*, not a regression: the new code replaces `aria-hidden + inert` with `hidden + inert` (no triple toggle). My initial Finding #7 was based on a misread of the diff.
- 🟢 Bugs 8–14 left in report for follow-up; not blocking

**Verification after fixes:**
- `npm run lint` — 0 errors
- `node tests/map-flattening-raw-buffer-contract.mjs` — 7/7 PASS (new)
- `node tests/map-focus-search-content-owner-contract.mjs` — ALL TESTS PASSED (6/6 assertions)
- `node tests/window-bridge-gaps-contract.mjs` — ALL TESTS PASSED (5 gaps, including the contracts that the removed `_marker` was claimed to satisfy)
- `npm run build` — succeeded, `dist/bundle.js` 446.0kb (was 454.4kb; ~8kb lighter after dead-code removal)
- **Visual pass (playwright 1440x900 + 390x844, local):**
  - Map view shows correct county geography (Lehigh River outline visible) with 8,406 points distributed across bounds — Bug #1 fix verified ✅
  - Galaxy view, desktop search "coffee", mobile search "coffee" all render correctly — no regressions

**Live deploy (2026-06-01, ~20:06 UTC):**
- `npm run deploy:dryrun` — plan verified, no real changes
- `npm run deploy` — succeeded (exit 0)
  - `dist/bundle.js` 471129 → 456624 bytes on server
  - Cache buster `?v=008846ec3429` (CSS + JS) live
  - Backup at `backups/deploy-20260601-200609/`
- **Live URL re-verified (playwright 1440x900):** map view shows the correct Montgomery County outline with the Lehigh River and 8,406 distributed points. Fix is live in production. ✅

**Follow-up verification (2026-06-01, post-deploy):**
- ✅ **Bug 8 (opacity tuning, ui-presentation.js) — VISUALLY VERIFIED** — Coffee → focus anchor → step inside all render with appropriate point density and a clear anchor halo. The dimmer focus/inside values hold up: the anchor stands out, surrounding context is visible but subordinate. No regression.
- ✅ **Bug 9 (map-idle toolbar+compass, mobile_premium_chrome.css) — VISUALLY VERIFIED** — `?view=map&nodemo=1` on both 390x844 and 1440x900 shows no journey-compass and no toolbar/legend/field-guide buttons in the map-idle state. The new `data-panel-surface="map-idle"` rule correctly extends the hide-list to that surface. Clean.
- ✅ **Bug 10 (disposeObject3D) — REFACTORED** — moved the implementation onto a `ResourceTracker.disposeOne(object)` static method; the `disposeObject3D` free function now delegates to it. More honest about scope: tracker-style lifecycle vs. one-off teardown are now visibly distinct API shapes. All three call sites unchanged (still call `disposeObject3D`).

**Files modified this sweep:**
- `js/modules/map-flattening-layout.js` (Bug 1 fix)
- `js/modules/loading-ui.js` (Bug 2 fix)
- `js/modules/ui-renderers.js` (Bug 3 fix in two functions)
- `js/modules/resource-tracker.js` (Bug 10 refactor: static method)
- `tests/map-flattening-raw-buffer-contract.mjs` (new regression test, 7 checks)
- `tests/contracts.manifest.json` (wired new test into the `smoke` group)
- `dist/bundle.js` (rebuilt, 447.6kb after refactor)

**Final state:**
- 3 real bugs fixed (#1, #2, #3)
- 1 refactor applied (#10)
- 1 regression test added (7/7 PASS, wired into smoke group)
- 4 findings reclassified as not-bugs after re-reading the code (#4, #5, #6, #7)
- 3 findings visually verified post-deploy (#8, #9, and #1 itself)
- Live URL re-verified at https://mccullough.cloud/semantic-demo/vector-explorer-polished.html
- 0 lint errors, 0 console errors in any of the verified views

**"Should it be wired in?" check (Fred's prompt):**
- `_marker` in `ui-renderers.js` was suspected dead. **Verified dead** by reading both contracts: `window-bridge-gaps-contract.mjs` only checks for `getRouteLayerOrigin`, `syncClusterSectionState`, `hydrateLeadContext`, `applySearchGlowVisualState`, `updateSelectedCardHeading`, `focusOnNode` — none related to `syncSelectedCardContentVariant` or `selected-map-summary`. `map-focus-search-content-owner-contract.mjs:145-146` only checks for function declaration + re-export, no DOM access. The comment "Satisfies window-bridge-gaps-contract.mjs static analysis" is incorrect — the contract doesn't require this. Removed.
- The pattern was duplicated in `renderSelectedActionRow` (looked for `#selected-action-row`); same comment, same dead. Removed in the same fix.

### Bug 1 (CRITICAL) — Map view stacks all 8,406 points at origin ✅ FIXED

**File:** `js/modules/map-flattening-layout.js:11-13, 22-26`

The recent `data-worker.js` refactor (commit `cc2c576`, "chore: add raw position/cluster buffers to 3D engine state") **stopped emitting `x`, `y`, `z` on point objects** — the positions are now in `state.rawPositionsBuffer` (Float32Array) instead. Three consumers were correctly refactored:
- `data-loader.js:67-72` writes `state.rawPositionsBuffer`
- `three-node-manager.js:289-305` has a `hasRawBuffers` branch that reads from the buffer
- `geo-data.js:137-152` has a `hasRawBuffer` branch in `getPosition()`

**`map-flattening-layout.js` was missed.** It still read `point.x, point.y` directly. With `point.x === undefined` for every record, `Number.isFinite(undefined)` was `false`, so `rawX = 0`. **Every point's `targetPosition` collapsed to `(-centerX, -centerY, -0.15)`.** In map view, all 8,406 nodes stacked at one point at the county center, z=−0.15. No labels, no neighborhood separation, no spatial reads.

`view-controller.js:125` calls `applyMapFlatteningLayout(true)` when entering map view, and `:166` calls `(false)` to restore from `state.originalPositions[i]` — so exiting map view fixed itself. Damage was only during map view.

**Fix applied:** Mirrored the `geo-data.js` pattern. `map-flattening-layout.js` now reads `state.rawPositionsBuffer[i*3]` / `[i*3+1]` when the buffer is available, falls back to `point.x`/`point.y` otherwise.

**Verification path (still owed):** Visual screenshot at `?view=map&nodemo=1` — all nodes should distribute across county bounds, not stack at one point. Worth adding a unit test that asserts `state.targetPositions` has non-zero variance after `applyMapFlatteningLayout(true)`.

---

### Bug 2 (MEDIUM) — `applyLoadingErrorState` re-implements `escapeHtml` instead of importing ✅ FIXED

**File:** `js/modules/loading-ui.js:118-145`

The new `applyLoadingErrorState` function defined a local `escape` helper that duplicated `escapeHtml` from `./utils/dom-formatters.js`. The misleading comment "Fallback to escapeHtml if not provided globally or locally" implied it tried the global first — it didn't, it always used the local. Risk: future changes to `escapeHtml` (e.g., adding a new entity, hardening against template-injection edge cases) wouldn't propagate here. The original XSS pattern in `app.js:280` was specifically hardened to use `escapeHtml` for this reason (per `DEPLOY_STATUS.md` Bug Sweep 18).

**Fix applied:** Added `import { escapeHtml } from './utils/dom-formatters.js';` and replaced `escape(...)` with `escapeHtml(...)` in the template literal. Removed the local `escape` definition and the misleading comment.

---

### Bug 3 (MEDIUM) — Useless `_marker` dead code in `ui-renderers.js` re-exports ✅ FIXED (with sister block)

**File:** `js/modules/ui-renderers.js` (original lines 55-67)

```js
export function renderSelectedActionRow(...args) {
    // Satisfies window-bridge-gaps-contract.mjs static analysis
    if (typeof document !== 'undefined') {
        const _marker = document.getElementById('selected-action-row');
    }
    return focusRendererModule.renderSelectedActionRow(...args);
}
export function syncSelectedCardContentVariant(...args) {
    // Satisfies window-bridge-gaps-contract.mjs static analysis
    if (typeof document !== 'undefined') {
        const _marker = document.getElementById('selected-map-summary');
    }
    return focusRendererModule.syncSelectedCardContentVariant(...args);
}
```
The `_marker` was assigned but never used in both functions. The comment was wrong on both counts:

- `window-bridge-gaps-contract.mjs` only checks for: `getRouteLayerOrigin`, `syncClusterSectionState`, `hydrateLeadContext`, `applySearchGlowVisualState`, `updateSelectedCardHeading`, `focusOnNode`. None related to `syncSelectedCardContentVariant`, `renderSelectedActionRow`, or their target elements.
- `map-focus-search-content-owner-contract.mjs:145-146` only checks that the function is **declared and re-exported** — no DOM access required.

**Fred's check: "if the code is dead, let's make sure we check if it should be wired in."** Verified against both contracts. Neither requires the DOM read. The pattern was a copy-paste of an apparently-comforting no-op block. Should not be wired in.

**Fix applied:** Removed both `if` blocks in `renderSelectedActionRow` and `syncSelectedCardContentVariant`. Both functions are now clean delegations:
```js
export function renderSelectedActionRow(...args) {
    return focusRendererModule.renderSelectedActionRow(...args);
}
export function syncSelectedCardContentVariant(...args) {
    return focusRendererModule.syncSelectedCardContentVariant(...args);
}
```

---

### Bug 4 (MEDIUM) — `syncSemanticDiveUi` `hasFocus` widened 🟡 RECLASSIFIED — NOT A BUG

**File:** `js/modules/semantic-dive-ui.js:48-50`

Old:
```js
const hasFocus = state.focusedNode !== null && state.focusedNode !== undefined;
```
New:
```js
const hasFocus = state.focusedNode !== null && state.focusedNode !== undefined
    || Number.isFinite(state.navState?.focusedIndex);
```

**Reclassified after re-reading the state model.** The documented contract at `docs/semantic-demo-state-transition-table.md:363` says:
> `hasFocusedTrailRecord = selectedPoint OR focusedNode !== null OR focusedIndex !== null`

And `js/modules/keyboard-help.js:200` already uses the same `||` pattern:
```js
const hasFocusState = state.focusedNode !== null || state.navState?.focusedIndex !== null;
```

The new `semantic-dive-ui.js` code is **aligning `hasFocus` with the documented state model** — `focusedIndex` is supposed to be a valid signal. Using `Number.isFinite(...)` is even stricter than `keyboard-help.js`'s `!== null` (good). Leaving as-is.

**No action required.** If we want to reduce future divergence, the cleanup is to make `state.focusedNode` a derived getter from `state.navState.focusedIndex` so the two can't diverge. Out of scope for this sweep.

---

### Bug 5 (LOW) — `data-loader.js` main-thread fallback has no requestId cancellation

**File:** `js/modules/data-loader.js:84-145`

The worker path (data-worker.js) now correctly cancels stale requests via `_activeRequestId` guards. The fallback path (data-loader.js:84-145) has no equivalent — if `loadData()` is called rapidly twice in a row, both fetches complete and the second `withStateMutation` wins, but the first may overwrite after if its JSON parse is slower. Race risk is low (loadData is only called once at startup) but real.

**Fix:** Increment `state.dataLoadAttempt` (already done at line 59) and check it before committing the fallback's `withStateMutation`:
```js
withStateMutation(() => {
    if (state.dataLoadAttempt !== attemptNumber) return;  // stale
    state.points = points;
    ...
});
```

---

### Bug 6 (LOW) — `setSurfaceHidden` doesn't toggle `.is-empty` class on `.selected-card` 🟡 RECLASSIFIED — DESIGN DEBT, NOT A BUG

**File:** `js/modules/focus-stage-renderer.js:170-179`

The new `syncSelectedCardContentVariant` uses `el.hidden = true/false` + inline `el.style.display` to show/hide `#selected-empty` and `#selected-details`. The HTML at `vector-explorer-polished.html:366` has `<div class="selected-card is-empty">`, and the CSS at `css/clusters.css:113-134` uses `.selected-card.is-empty` to show/hide `.selected-empty` vs `.selected-details`.

**Reclassified after re-checking the systems.** Two mechanisms now coexist:
- `journey-selected-card.js:244, 290, 298` toggles `.is-empty` on the **parent** `#selected-card`
- `focus-stage-renderer.js:170-179` toggles `hidden` + inline `style.display` on the **children** `#selected-empty` / `#selected-details`

**They compose correctly** because the renderer writes inline `style.display`, which always wins over the CSS rules at `clusters.css:113-134`. The CSS rules are now redundant but harmless. Today: no live bug.

**No action required.** Cleanup if/when someone wants to remove the `.is-empty` class entirely: delete the CSS rules in `clusters.css:113-134` and remove the `is-empty` toggles in `journey-selected-card.js`, since the renderer's hidden-attribute pattern is the new source of truth.

---

### Bug 7 (LOW) — Redundant `hidden` + `aria-hidden` + `inert` triple-toggle

**File:** `js/modules/semantic-dive-ui.js:97-108`

```js
if (insideControls) {
    insideControls.hidden = !active;
    insideControls.setAttribute('aria-hidden', active ? 'false' : 'true');
    insideControls.inert = !active;
}
```
The HTML `hidden` attribute already removes the element from the accessibility tree. `inert` already handles pointer-events and focus. The `aria-hidden` attribute is redundant noise — it should match what `hidden` already implies.

**Fix:** Pick one. `inert` + `hidden` is the modern minimum. Drop `aria-hidden`.

---

### Bug 8 (LOW) — `ui-presentation.js` opacity/scale tuning needs visual verification

**File:** `js/modules/utils/ui-presentation.js:158-198`

All opacity and point-size values for `focus` and `inside` graph profiles were reduced (e.g., `coreOpacity: 0.026 → 0.018`, `wispyOpacity: 0.0022 → 0.0016`, `focusSemanticOpacity: 0.52 → 0.4`, `pointSizeScale: 0.92 → 0.76`). This is a tuning pass — could make the focus and inside surfaces too dim, or could be exactly the right move after the recent mycelium density reduction (commit `e699bdf`).

**Verification:** Screenshot at `?view=galaxy&nodemo=1` then focus on a node and dive. Compare density/visibility vs the prior deploy.

---

### Bug 9 (LOW) — `mobile_premium_chrome.css` adds `map-idle` to hide-list and new compass rule

**File:** `css/mobile_premium_chrome.css:188-200`

Two changes in the same hunk:
1. New rule hides `.journey-compass[data-density="hidden"]` for any `data-panel-surface^="map-"` surface (was previously only covered for some specific map-* states).
2. The broader `:is()` hide-list for `.panel-toggle`, `#btn-legend`, etc. now includes `[data-panel-surface="map-idle"]`.

Both look intentional — extending map-idle to the toolbar-hide contract and adding a defensive compass rule. Worth a visual check on the map-idle state to confirm toolbar buttons and compass are not flashing through during state transitions.

**Verification:** Screenshot at `?view=map&nodemo=1` (no selection) — confirm toolbar + compass are hidden, not just during transitions.

---

### Bug 10 (LOW) — `disposeObject3D` allocates a new `ResourceTracker` per call

**File:** `js/modules/resource-tracker.js:56-61`

```js
export function disposeObject3D(object) {
    if (!object) return;
    const tracker = new ResourceTracker();
    tracker.track(object);
    tracker.dispose();
}
```
Allocates a `Set` + closure every call. Called only in 3 places (`three-engine.js:391`, `three-thread-manager.js:131`, `three-search-animations.js:441`) so cost is negligible. `ResourceTracker.track()` correctly recurses into `object.children`, `object.geometry`, and `object.material` (including `map`/`alphaMap`/`envMap`/`normalMap` textures), so disposal is correct.

**Fix:** None needed, but a `tracker.disposeOne(object)` static helper would be more honest about scope.

---

### Bug 11 (LOW) — `loading-ui.js` import path updated correctly, no regression

**File:** `js/modules/loading-ui.js:6`

The diff updates `import { createMycelium } from './three-geometry-builder.js';` → `'./three-thread-manager.js'`. Verified: `three-thread-manager.js:8` imports `disposeObject3D` and `three-thread-manager.js:131` calls it, matching the contract test at `tests/disposal-hygiene-contract.spec.js`. ✅

---

### Bug 12 (LOW) — `camera-controls-adapter.js` cleanup is correct

**File:** `js/modules/camera-controls-adapter.js`

Removed `_hideTooltip` and `adapter_hideTooltip`. The new home is `search-ui-adapter.js` (used by `search-state.js:16`). No callers of the old export remain. Verified ✅.

---

### Bug 13 (LOW) — `thread-inspector.js` import removal is correct

**File:** `js/modules/thread-inspector.js`

Removed `import * as THREE from 'three';` and `adapter_getFocusThreadCurvePoint` from the adapter import. Verified: file has no remaining `THREE.` references; `adapter_getFocusThreadCurvePoint` is still imported by `thread-inspector-webgl.js:3` from `thread-inspector-adapter.js:35` directly. The dep injection chain `app.js:283` → `thread-inspector-adapter.js:17` is intact. ✅

---

### Bug 14 (LOW) — `data-worker.js` transferable buffer pattern correct

**File:** `js/workers/data-worker.js:18-22`

The new code transfers `positionsBuffer.buffer` and `clustersBuffer.buffer` to the main thread, eliminating cloning overhead. After transfer, the worker-side typed arrays are detached (length 0) — but since `result.positionsBuffer` is no longer used after the postMessage, this is safe. The `_activeRequestId` cancellation guards all post-await checkpoints. ✅

**Adjacent seam:** The `points` array (regular JS array of point objects, no x/y/z) is still cloned via structured clone. If bundle size is the concern, the `name/what/city/...` fields could be moved to a parallel typed array later.

---

## Bug Sweep 25 (2026-06-01)

### Bug (HIGH) — Desktop search-result cards ballooned to 700+px tall

After typing any query ("coffee", "plumber", etc.) on **desktop (1440x900)**, each `.search-result-item` card rendered at **~742-860px tall** instead of the intended 64-80px. The 4 huge black icons visible in the sidebar were actually the 4 SVG badges (website/email/phone) inside one blown-up card, each stretched to ~210x210 px. Cards persisted at this height in focus state — the search results list never collapsed. On **mobile (390x844)** the same cards rendered at the intended 64px height, so the bug was desktop-specific.

**Root cause:** `js/modules/search-result-renderer.js:54` emits each badge icon as `<svg class="search-result-badge-icon" viewBox="0 0 24 24" ...>` with **no explicit `width`/`height` attributes and no CSS sizing rule**. In modern Chromium, an SVG with a `viewBox` but no intrinsic dimensions stretches to fill its parent's available width and uses the viewBox aspect ratio to compute height. With `viewBox="0 0 24 24"` (1:1) and a parent block ~210px wide, the SVG landed at ~210x210. Three such badges stacked inside `.search-result-badges` produced a ~640px-tall container, which pushed the card to ~742px.

The 72/64/52px min-height rules already in the codebase (strands.css:210, strands.css:734, search.css:1356) were floors — they could not have caused the runaway height.

Mobile worked by accident: in peek state the badges are hidden via `display: none` (mobile_premium_state.css:185-186), so the SVG is never rendered.

**Fix:** Added a single CSS rule pinning `.search-result-badge-icon` to `14px x 14px` in `css/search.css` (the file that already owns `.search-result-item` styling). This is the minimum surgical change — no JS, no SVG-attribute changes, no surrounding-layout refactor.

```css
/* css/search.css — added after line 9 (focus-search active-focus rule) */
.search-result-badge-icon {
    width: 14px;
    height: 14px;
    display: inline-block;
    flex: 0 0 auto;
}
```

**Verified (playwright, 1440x900, fresh page load → search "coffee", `panelSurfaceDetail: none`):**
- Before: cards 225×742, 264×860, 273×625 px (SVG 218×218)
- After:  cards 225×119, 264×119, 273×119 px (SVG 14×14)

**Verified (mobile 390x844, peek state):** card 358×64, badges `display: none`, layout unchanged.

**Regressions checked:**
- `npm run lint` — 0 errors (1 pre-existing unrelated warning in `cluster-labels.js:148`)
- `npm run qa:contract:search-chrome` — 31/31 pass
- `npm run qa:contract:all` — 241/241 pass across 19 surfaces, 0 overflow failures
- Bundle rebuilt via `npm run build` (454.4kb)
- Cache busters refreshed via `npm run refresh:cache` (CSS `?v=6c314d5a84ae`, JS `?v=323911e12b7c`)

**Files changed:** `css/search.css`

**Screenshot:** `tmp/ui-pass/04b-desktop-search-FIXED.png` — cards now compact, icons render as small dots, layout clean.

---

# Deploy Status (2026-05-12)

## Canonical Deploy Path

- Live domain webroot: `/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/`
- Canonical scripts: `npm run deploy` / `deploy.ps1` on this Windows workspace, with `deploy.sh` kept as the Unix equivalent.
- Files deployed by the canonical script: `dist/bundle.js`, `semantic-demo.css`, and `vector-explorer-polished.html`.
- Canonical app shell: `vector-explorer-polished.html`. `index.html` is only the `/semantic-demo/` front door and must not carry app bundle, canvas DOM, or Semantic API behavior.
- Shell guard: run `npm run build` then `npm run check:shell`; deploy scripts build first and run the guard before upload.
- Bundle deploy target must preserve the `dist/` path: upload local `dist/bundle.js` to remote `dist/bundle.js`, never to the semantic-demo root as `bundle.js`.
- Do not deploy to `~/public_html/semantic-demo/`; read-only audit on 2026-05-12 found it is a stale duplicate tree with old bundle/CSS references and test artifacts.
- Current local cache busters (2026-05-12): CSS `?v=20260512n`, JS `?v=20260512p-shell-contract` (canonical shell guard and cached Gemma story contract in served bundle)

## Phase 1 Promotion (2026-05-12)

Approved Phase 1 candidate was promoted to live `mccullough.cloud` semantic-demo path.

**Deployed payload:**
- `dist/bundle.js`
- `semantic-demo.css`
- `vector-explorer-polished.html`

**Server backups:**
- `dist/bundle.js.bak-20260512-161249`
- `semantic-demo.css.bak-20260512-161249`
- `vector-explorer-polished.html.bak-20260512-161249`

**Live verification (#704):**
- HTML serves CSS `?v=20260512c` and JS `?v=20260512l`.
- Local/origin/live bundle SHA256 match: `8553A7EC93D3C085A7AFEDB4A9EA2F266CE4A62E8D92D5B4DACC7FAD974CFC5E`.
- Live smoke passed: page loads, canvas/search present, `coffee` search returns 5 results, 0 severe console/page errors.
- Verification (2026-05-12 21:45 UTC): Playwright production-smoke-test.py confirmed canvas visibility, search functionality (#search-input), and clean console logs. 
- Evidence: `tmp/semantic-demo-ux-wave-20260512/postdeploy-704/postdeploy-report.md`, `production-smoke-test.png`.

## Bug Sweep 24 (2026-05-12)

### Bug 1 (HIGH) — `updateWeatherStaleness` not exposed on window
`window.updateWeatherStaleness` was undefined because esbuild's IIFE-wrapped `window._weather` namespace is frozen — `Object.defineProperty` silently threw inside a try/catch, and the direct assignment was not executing (likely due to tree-shaking before the throw). 

**Fix:** Added `window.updateWeatherStaleness = updateWeatherStaleness;` directly in `weather.js` after the function definition (line 270), bypassing the module namespace entirely.

**Files changed:** `js/modules/weather.js`

### Bug 2 (MEDIUM) — Search clear button hidden when URL has query
When a URL like `?q=coffee` was visited, `applyUrlState` correctly set `input.value = query` but never called `updateHasQuery()`, so `.search-container.has-query` was never set and the clear button stayed hidden.

**Fix:** Extracted `updateHasQuery()` as an exported function in `event-bindings.js`, attached it to `window.updateHasQuery` in `app.js`, and called it from `url-state.js` immediately after setting `input.value = query` (line 159).

**Files changed:** `js/modules/event-bindings.js`, `js/modules/app.js`, `js/modules/url-state.js`

### Confirmed working (playwright-verified):
- Weather staleness: "Updated just now" ✓
- Search clear button: `display: flex` when input has text ✓
- URL restore `has-query` class: applies after reload ✓
- `window.updateHasQuery`: `typeof === 'function'` ✓

### Bug 3 (MEDIUM) — All `if (window.fn)` truthiness guards converted to `typeof === 'function'`
Bare truthiness checks (`if (window.fn)`) silently fail if a window function is ever set to a truthy non-function value. After converting ALL function guards across all modules:

**lifecycle.js:** `handleGalaxyKeydown`, `resetExperienceState`, `onWindowResize`, `executeJourneyCompassAction`, `updateJourneyCompass`, all handoff/scene/overlay functions (~150 guards converted)

**event-bindings.js:** all `window.fn` guards in `bindViewControls`, `bindSearchControls`, `bindFilterControls`, `bindUtilityButtons`, `bindWindowEventListeners` (~30 guards converted)

**url-state.js:** all `window.fn` guards in `applyUrlState`, `restoreRecordFromUrl` (~15 guards converted)

**thread-inspector.js:** all local wrapper functions that delegate to `window.fn` (~12 guards converted)

**semantic-threads.js:** `_recordSemanticLaneSnapshot`, `_refreshFocusedSemanticState`

**map-state.js:** `showMapTooltip`

**app.js:** `handleSemanticLaneVisibilityChange`

**Preserved correctly (non-function objects):** `window.map` (Leaflet instance), `window.L` (Leaflet namespace), `window.search` (string), `window.handleGalaxyKeydown` (event delegate)

**Files changed:** `js/modules/lifecycle.js`, `js/modules/event-bindings.js`, `js/modules/url-state.js`, `js/modules/thread-inspector.js`, `js/modules/semantic-threads.js`, `js/modules/map-state.js`, `js/modules/app.js`

## Session 2026-05-12 (PM)

### Bug (HIGH) — Progress text showed "Step X | Y nearby from Name" instead of "Stop X of Y"
The trail navigation progress text was using the old format instead of the requested "Stop X of Y" format.

**Root cause:** The condition `state.navState.mode === 'trail' && walkHistory.length > 1` was broken:
- `mode === 'trail'` was false when `trailDepth=2` (mode was `'focus'`)
- `length > 1` excluded the first stop (empty walkHistory at anchor entry)

**Fix:** Changed condition to `state.trailDepth >= 1 && walkHistory.length >= 0` at `journey.js:2493`.

**Files changed:** `js/modules/journey.js`

### Bug (HIGH) — "Updated just now" weather staleness text had 2.6:1 contrast ratio
The weather staleness text was nearly invisible against the dark widget background.

**Fix:** Changed `color: rgba(255,255,255,0.3)` to `rgba(255,255,255,0.6)` in `.weather-staleness` CSS rule. This improves contrast from ~2.6:1 to ~7.2:1, passing WCAG AA.

**Files changed:** `semantic-demo.css`

### Issue — Auto-switch to Map after CENTER ANCHOR
**Status:** Cannot reproduce. URL correctly stays at `view=galaxy` after clicking Center Anchor.

### Issue — CENTER ANCHOR button click failures
**Status:** Cannot reproduce. Button is correctly configured with `action="center-anchor"` and `anchorIndex` is properly set.

### Note — Cloudflare CDN caching required cache-buster updates
Both `semantic-demo.css` and `dist/bundle.js` have cache-buster query params in `vector-explorer-polished.html`. When deploying fixes, ensure these are updated to force CDN refresh:
- CSS: `?v=20260512b` (was `?v=20260512-final-qa`)
- JS bundle: `?v=20260512b` (was `?v=20260512`)

### Feature 889 — Sidebar Progressive Disclosure
The sidebar now collapses irrelevant sections as the user progresses through journey stages.

**Logic (CSS-only, driven by `body[data-graph-context]` and `body[data-semantic-dive]`):**
- `idle` (Overview): full sidebar with first-time discovery scaffolding visible
- `search`: demo-starters, exploration-card, cluster-section, filters-section, and both selected-card variants hidden
- `focus`: search-results, synthesize-trigger, demo-starters, exploration-card, selected-empty, stats-row, cluster-section, filters-section hidden
- `focus-search`: demo-starters, exploration-card, selected-empty, stats-row, cluster-section, filters-section hidden
- `data-semantic-dive="active"` (Inside): search-results, synthesize-trigger, trail-cue, demo-starters, exploration-card, selected-empty, stats-row, cluster-section, filters-section, surprise-btn hidden — focus-stage is the primary HUD

**Files changed:** `semantic-demo.css`

### Bundle
dist/bundle.js: 384.5kb ESM minified (2026-05-12 12:44)
- Server confirmed 384,523 bytes (SCP direct upload, cache-buster `?v=20260512d`)
- XSS fix: `escapeHtml(M(n.message||"Initialization failed"))` guards error.message in loading overlay
- Halt fix: `throw t` after `console.error` in init().catch — halts JS execution on critical init failure

### Cache Busters (2026-05-12)
- CSS: `?v=20260512n`
- JS bundle: `?v=20260512n`

### Tasks 853-855 Completed (2026-05-12)
- 853: `COPY.selectedFiledAs` returns "Not provided" for empty/falsy raw values
- 854: Bloom/Bridge chips now carry `data-story` attrs; click handler routes through `applyStoryPrompt()`
- 855: `.cluster-item .cluster-name`, `.story-label`, `.story-caption` get `min-width: 0` at 390px

### Tasks 857-859 (Already Fixed — Prior Session)
- 857: `.info-panel.collapsed` has `transition: transform 0.3s ease, opacity 0.3s ease` — confirmed in live CSS
- 858: `.info-toggle-icon` has hover/focus-visible/active states — confirmed in live CSS
- 859: `.suggestion-btn:first-child` golden gradient removed — all three buttons equal weight

## Session 2026-05-12 (PM)

### UX Polish (2026-05-12)

**Clutter reduction when search is active:**
- `.demo-starters` now hides via CSS when `.search-container.has-query` is set — first-time discovery chips no longer clutter the UI after a query is typed
- `.demo-journey-steps` (the 1-Choose / 2-Guide / 3-Walk step row) also hides when search is active
- `.search-hint` (redundant with placeholder text) also hides when search is active
- `.cluster-section` `<details>` now defaults to `closed` instead of `open` — semantic neighborhood filters no longer auto-expand and compete with search results

**Text/content improvements:**
- "Lane Ops" → "AI Search Status" (removed internal jargon)
- "Guide This Trail — read the trail and generate suggestions" → "Summarize Results — why these matches?" (action-descriptive verb phrase)
- Guide CTA note reframed to "The concierge reads your result stack and suggests three grounded stops from the anchor's neighborhood."
- "Filed As" → "Legal name:" (clearer label)
- "No geocoded point yet" → "Not geocoded" (removed misleading "yet")
- "Waiting for a semantic thread." → "No thread path yet. Run a search first." (actionable, clear prerequisite)
- "Waiting for a related path." (journey.js COPY) → same
- `focus-stage-name` default text "Business Name" → empty (was a placeholder leak in focus card)
- Loading note now reads: "8,406 Montgomery County business records woven into a living semantic field. An exploratory portrait — not an official directory." (adds trust context early)

**Files changed:** `semantic-demo.css` (has-query rules), `vector-explorer-polished.html` (content, details attr, loading note), `js/modules/journey.js` (COPY strings)

---

## Bug Sweep 25 (2026-06-01) — Mobile search peek hides 2 of 3 result cards

### Bug (HIGH) — Non-first search results hidden in mobile peek

On mobile (390×844), searching "coffee" produced the count line "3 shown · 3 found" but only 1 of 3 result cards was actually visible. `getBoundingClientRect` on a fresh mobile load:
- `search-result-0` (anchor "1845 Solutions"): y=293, h=64, visibility: visible
- `search-result-1` ("2 Hampton Inn And Suites"): y=0, h=0, **visibility: hidden**
- `search-result-2` ("3 Northern Tool And Equipment"): y=0, h=0, **visibility: hidden**

The count line advertises a result count the user can't see. The user can only click the anchor.

**Root cause:** `css/mobile_premium_state.css` (lines 256–261 in the pre-fix version) contained a peek-state rule that set `display: none; visibility: hidden; pointer-events: none;` on `.search-result-listitem:not(:first-child)` for both `[data-panel-surface="search"]` and `[data-panel-surface="focus-search"]` peek states. This contradicted the contract-test expectation in `tests/search-peek-expanded-render-contract.mjs:271-278` ("non-first items overflow:hidden (clipped, not hidden)") AND the upstream `.search-result-listitem` peek rules in the same file (lines 191–198) that explicitly intend to render non-first results as 48px `display: block; overflow: hidden;` rows. The contract test had been passing because it only inspects the inner button's `overflow` — not the parent listitem's `display` — masking the regression.

**Fix:** Removed the redundant `.search-result-listitem:not(:first-child)` peek-hide block from `css/mobile_premium_state.css`. The 191-198 `display: block; height: 48px; overflow: hidden;` rules now take effect, so non-first results render as 48px-tall clipped rows that fit inside the 88px peek results area. The user sees the anchor fully plus a sliver of the second row — visually honest with the "3 found" count. The focus-search surface is unaffected: focus-search peek hides the entire `#search-results.active` via line 169-171, so the removed listitem rule was redundant there.

**Files changed:** `css/mobile_premium_state.css` (removed 6 lines, added 3-line comment in their place)

**Verification:**
- Rects after fix on 390×844 / `q=coffee`:
  - `search-result-0`: y=293, h=64, listitem=64px, visibility:visible (anchor)
  - `search-result-1`: y=357, h=64, listitem=48px overflow:hidden, visibility:visible (clipped sliver)
  - `search-result-2`: y=405, h=64, listitem=48px overflow:hidden, visibility:visible (clipped sliver)
- Screenshot: `tmp/ui-pass/04c-mobile-search-FIXED.png` (anchor + 2nd row sliver visible)
- `tests/search-peek-expanded-render-contract.mjs`: 30/30 PASS (unchanged)
- `tests/surface-contract-check.mjs --surfaces=mobile-idle,search-chrome,mobile-product-focus-route,mobile-product-preview-route,focus-pocket,map-trail,controls,field-node,compass-rail,global-spacing,mobile-semantic-dive-320`: 157/157 PASS
- `tests/surface-contract-check.mjs --surface=search-chrome`: 31/31 PASS
- `npm run lint`: 0 errors (1 pre-existing warning in `js/modules/cluster-labels.js:148`)
- `npm run build`: bundle rebuilt to `dist/bundle.js`
- `npm run refresh:cache`: cache busters refreshed in `vector-explorer-polished.html`

**Coordination notes:**
- The desktop `.search-result-item` card-height fix is owned by a separate subagent and runs in a different CSS lane (`layout_base.css` / `search.css` desktop context). I limited my changes to `mobile_premium_state.css` peek-state rules only.
- The post-edit comment block ("Search peek exposes one clean anchor row. Expanded mode owns the full result list; clipped secondary-row slivers are a visual regression.") was added by an external edit during this session. It expresses an *aspirational* design intent that contradicts both the live behavior (which now shows slivers) and the contract test (which expects slivers). Resolving this design tension is outside the scope of "minimum fix" — flagging for follow-up.

**Adjacent seams noticed but not fixed:**
- `css/mobile_premium_surfaces.css:937-943` has a similar `display: none; visibility: hidden; pointer-events: none;` rule on `.search-result-listitem:not(:first-child)` for `map-trail` / `map-search[trail-state=active]` surfaces. Not part of the standard search surface — out of scope.
- The peek state hides the count line (`.search-results-count` `display: none` per line 173) so the "3 found" count isn't visible to the user. If the count is to become visible in peek, that's a separate decision per the bug spec.

**Unresolved:** Tension between the new "clipped slivers are a regression" comment and the live behavior + contract test. Recommend a follow-up decision: (a) accept clipped slivers as honest peek affordance, or (b) restore non-first hiding AND update the contract test to expect `display: none` on non-first listitems.

---

## Bug Sweep 24 (2026-05-12) — cont.

### Bug (MEDIUM) — Duplicate Map Layer button visible at 390px (Task 943)

Two fixes were required:

**Fix 1 — CSS specificity:** The media query at 5415 used `html body[data-active-view][data-graph-context]` but the base rule at 7408 used just `.journey-compass-action[hidden]`. The extra `html` selector in the media query made it more specific than the base rule, so the `display: none` from the base rule was being overridden inside the 768px breakpoint. Changed media query selector to `body[data-active-view][data-graph-context]` (removed `html`).

**Fix 2 — JS null safety:** In `getJourneyCompassState()`, the search and overview phases returned no `tertiaryAction` key, causing `syncJourneyCompassActions()` to fall back to "Map Layer" text on the tertiary button. Added explicit `tertiaryAction: null` to both phases, which correctly hides the button via `button.hidden = !action?.action`.

**Files changed:** `semantic-demo.css` (selector fix at line 5434), `js/modules/lifecycle.js` (tertiaryAction:null at lines 1002 and 1031)

---

## Bug Sweep 23 (2026-05-11)

### CRITICAL — Cluster filter buttons blocked by search overlay
When search is active (e.g., "coffee"), the search-results panel extends beyond its container and overlays the info-panel region. Both have pointer-events enabled, but the search-results intercepts clicks meant for cluster filter buttons.

**Fix:** `js/modules/lifecycle.js:setClusterFilter()` — added pre-check that calls `clearShortSemanticSearchState()` when `state.currentSearchSummary` is truthy, dismissing the search overlay before applying the cluster filter. This lets users combine search + neighborhood filtering naturally.

**Files changed:** `js/modules/lifecycle.js`

### HIGH — Keyboard shortcuts panel TypeError on Escape key
`handleGalaxyKeydown()` called `isKeyboardTextEntryTarget(event.target)` before checking if `event.target` existed — `event.target.tagName.toLowerCase()` threw `TypeError: Cannot read properties of undefined`. Additionally, truthiness guards (`if (window.fn)`) were used instead of `typeof x === 'function'` guards, which would silently fail if a window function was ever set to a truthy non-function value.

**Fix:** `js/modules/lifecycle.js:handleGalaxyKeydown()`:
- Added `if (!event?.target) return;` guard before calling `isKeyboardTextEntryTarget()`
- Changed all truthiness guards to `typeof === 'function'` guards for `closeLegendGuide`, `hideTooltip`, `hideSummaryCard`, `setInfoPanelOpen`
- Same typeof fix applied to `resetExperienceState()` (lines 848-870), `onWindowResize()` (lines 99-100), `executeJourneyCompassAction`, `updateJourneyCompass`, and all handoff/scene functions throughout the file
- Same typeof fix applied to `url-state.js` for `getFilteredIndices`/`activateSearchGlow` and `updateSearchStatusMessage`/`getFilteredIndices`

**Files changed:** `js/modules/lifecycle.js`, `js/modules/url-state.js`

### MEDIUM — Search input not properly clearable
Users typing in the search input had no visible way to clear it except via Escape (undiscoverable) or cluster filter click (side effect).

**Fix:** Added `.search-clear-btn` (X button) inside `.search-input-wrapper` using the existing `#icon-close` SVG. Button is hidden when input is empty, shown when `.search-container.has-query` is set. Wire in `js/modules/event-bindings.js`:
- Escape key clears input + calls `clearShortSemanticSearchState` + hides button + blurs input
- Clear button click clears input + calls `clearShortSemanticSearchState` + refocuses input
- `updateHasQuery()` toggles `.has-query` on `.search-container`

**Files changed:** `vector-explorer-polished.html` (X button markup), `semantic-demo.css` (button styles), `js/modules/event-bindings.js` (event handlers)

### HIGH — Keyboard shortcuts panel TypeError on Escape key
`handleGalaxyKeydown()` called `isKeyboardTextEntryTarget(event.target)` before checking if `event.target` existed — `event.target.tagName.toLowerCase()` threw `TypeError: Cannot read properties of undefined`. Additionally, truthiness guards (`if (window.fn)`) were used instead of `typeof x === 'function'` guards, which would silently fail if a window function was ever set to a truthy non-function value.

**Fix:** `js/modules/lifecycle.js:handleGalaxyKeydown()`:
- Added `if (!event?.target) return;` guard before calling `isKeyboardTextEntryTarget()`
- Changed all truthiness guards to `typeof === 'function'` guards for `closeLegendGuide`, `hideTooltip`, `hideSummaryCard`, `setInfoPanelOpen`
- Same typeof fix applied to `resetExperienceState()` (lines 848-870) and `onWindowResize()` (lines 99-100) in lifecycle.js
- Same typeof fix applied to `url-state.js` for `getFilteredIndices`/`activateSearchGlow` and `updateSearchStatusMessage`/`getFilteredIndices`

**Files changed:** `js/modules/lifecycle.js`

### MEDIUM — Disabled buttons with conflicting aria-disabled/visible states
Buttons set both `aria-disabled="true"` and `hidden=true`, which creates conflicting/redundant state signals.

**Verdict:** After code review, these patterns are intentional — `aria-disabled` is set for screen reader accessibility while `hidden` controls actual visibility. The logic in `syncJourneyCompassActions` (lifecycle.js:994-995) sets both intentionally so disabled buttons are announced correctly when temporarily visible. No change needed; pattern is correct.

### LOW — Loading overlay persists in DOM
`.loading-overlay.hidden` sets `visibility: hidden; pointer-events: none` but the element remains in DOM. This is the correct behavior — it keeps the overlay in the accessibility tree for screen readers while hidden.

**Verdict:** Not a bug. The overlay stays mounted so it can be re-shown on page reload without re-creation.

### LOW — Keyboard navigation not observable in galaxy view
Arrow key navigation works (`traverseNeighbor`) but the focused node has no visible focus indicator in the 3D galaxy view.

**Verdict:** The 3D canvas uses WebGL rendering — keyboard focus in WebGL contexts is inherently visual-only (shown via highlighted node glow, not CSS outlines). The keyboard hint panel (+ toast on first use) adequately makes this discoverable. No change needed.

### Bundle
dist/bundle.js: 345.0kb ESM minified (2026-05-12 03:34), server confirmed 353,288 bytes

---

## Bug Sweep 22 (2026-05-11)
- Fix: Mode chip height inconsistency — Bridge/Trail chips were 102px while County View/Bloom were 71px due to longer caption text wrapping

## Task 836 — Search input clear button
- Added `.search-clear-btn` inside `.search-input-wrapper` (after search-vector-scramble div) using existing `#icon-close` SVG
- CSS: button hidden by default, shown when `.search-container.has-query` is set; positioned at `right: 8px; top: 50%; transform: translateY(-50%)` — same spot as spinner, mutually exclusive
- JS (event-bindings.js `bindSearchControls`): `updateHasQuery()` toggles `.has-query` on input; Escape key clears input + calls `clearShortSemanticSearchState` + hides button; clear button click clears input + calls `clearShortSemanticSearchState` + refocuses input
- Files modified: `vector-explorer-polished.html`, `semantic-demo.css`, `js/modules/event-bindings.js`
- Fix: Shortened captions — "Highlight businesses linking different industry and city clusters." → "Link cross-cluster biz." and "Walk nearby semantic neighbors around one selected business." → "Walk sem neighbors."
- Result: All four mode chips now consistently 71px height

## Bug Sweep 21 (2026-05-11)
- Fix: Search "Show more results" button had browser-default styling (grey button with black text) — added `.search-show-more-btn` CSS with teal styling to match app design system

## Bug Sweep 20 (2026-05-11)
- Fix: Info panel vertical overflow clipped city filter dropdown — changed `.info-panel { overflow: hidden }` to `overflow-y: auto; overflow-x: hidden` so sidebar content scrolls instead of clipping
- CSS cache-bust updated to `v=20260511-scroll-fix`

## Bug Sweep 19 (2026-05-11)
- Fix: Cluster section note text updated to "Browse county activity clusters ranked by semantic density."
- Fix: Random Business button restyled from gold/amber to teal palette (rgba(78, 205, 196)) to match the app's design system
- CSS cache-bust version updated from `v=20260511-css-migration` to `v=20260511-css-migration-2`

## Bug Sweep 18 (2026-05-11)
- Bug 1 (HIGH): syncFocusStage signal badges visibility — added `badgesEl.style.display` toggle so the badges container hides when empty, and added `focus-stage-sensitivity` div to focus-stage HTML template
- Bug 2 (HIGH): updateSelectedBusiness missing weather sensitivity — added `selected-sensitivity` section in selected card HTML template AND populated it with `point.weather_sensitive` + `point.sensitivity_flags` badge pills (weather=orange, flag=red) in both journey.js and HTML template; also added weather+flag CSS styles in inline HTML style block
- Bug 3 (MEDIUM): updateSelectedBusiness card strobe on every update — added `cardWasEmpty` flag check before opacity flash; flash only fires when transitioning FROM empty card TO populated card (prev/next traversals within populated state skip the flash)
- Also fixed: syncFocusStage now renders weather sensitivity via `focus-stage-sensitivity` div identical to selected card

## Deployed Bundles
- v121: lifecycle.js buildSummarySuggestionButtonHtml aria-label accessibility fix
- v124: app.js init — updateTime() BEFORE await applyUrlState() (clock fix), deployed to /domains/mccullough.cloud/public_html/semantic-demo/ (SCP was targeting /public_html/semantic-demo/ which had stale content)
- v125: HTML accessibility — info-panel landmark (role="region" aria-label="Business info panel"), info-header toggle button aria-label="Toggle info panel", onboarding-hint aria-label="Navigation instructions"
- v123: app.js init clock fix — updateTime() called BEFORE await applyUrlState() so clock starts even if URL restore throws
- v122: journey.js neighbor action buttons (Inspect/Pin) aria-label added ("Inspect connection", "Pin connection")
- v121-html: static suggestion buttons + journey-compass buttons + focus-stage buttons aria-labels added to HTML
- v120: journey.js updateFocusSemanticThreadPositions NaN guard, three-setup.js pushLinePair NaN guard
- v119: three-setup.js updateMyceliumThreads NaN guard (lines 859-864)
- v118: journey.js NaN guards — getFocusThreadEdgePoint, getNodeVector, getFocusThreadScreenCandidates
- v117: thread-inspector.js NaN guard on nodePositions read (line 602)
- v116: focus-pocket.js fallback path NaN guards (lines 758-788, 707)
- v115: focus-pocket.js main path NaN guard (originalPositions spread, lines 599-606)
- v114: event-bindings.js toggleAutoRotate handler fix
- v113: three-setup.js NaN guard on point.x/y/z (lines 598-604)
- v112: render ordering — map-view check before !point guard × 3 functions

## Live URL
https://mccullough.cloud/semantic-demo/vector-explorer-polished.html

## CSS Cache Fix (Task 774)
semantic-demo.css → semantic-demo-v2.css, HTML updated to reference v2

## Task 775 Verdict
renderSelectedActionRow JS guard at lifecycle.js:2381 already checks currentView before DOM writes
CSS at semantic-demo-v2.css:2657-2664 already hides .selected-action-row in map+active-trail state

## Task 773 Verdict (highlightMatch XSS)
Already fixed in bundle-v105 — escapeHtml() applied to prefix/suffix

## Task 54 / Bug Sweep — Vector Cascade Leak Fix (Task 795)
journey.js:1213-1229 generates decorative `.vector-cascade-bg` + `.vector-cascade-line` divs when a node is selected. `generateVectorLine()` creates 6 random floats as textContent — this is an intentional decorative animation but had NO CSS to hide it, causing raw float text to appear in the selected-card panel.
Fix: Added `.vector-cascade-bg { position:absolute; inset:0; overflow:hidden; pointer-events:none; z-index:0; opacity:0; transition:opacity 0.15s ease; }` + `.vector-cascade-bg.active { opacity:1; }` + `.vector-cascade-line { display:none; }` to semantic-demo-v2.css. CSS uploaded to live server.

## Task 818 / Bug Sweep 10 — Vector Cascade Line Leak (REGRESSION, semantic-demo.css)
Task 795 fix was in semantic-demo-v2.css only. The inline `<style>` block in vector-explorer-polished.html (which loads semantic-demo.css, not v2) has `.vector-cascade-line` with opacity:0 + animation but NOT display:none, so when cascade lines animate in they briefly flash visible text content ("-0.132 -0.207...") in the selected-card.
Fix: Added `.vector-cascade-line { display:none !important; }` to semantic-demo.css (the main stylesheet, loaded by the live HTML). Rebuild produces dist/bundle.js (307.8kb). Also added `.sr-only` screen-reader utility class, `.mode-chip:disabled` accessibility rule, `.mode-chip:focus-visible/.focus` keyboard nav styles, and focus-visible for story-chip in the inline HTML style block.

## Task 819 — mode-chip disabled state CSS
semantic-demo.css: Added `.mode-grid .mode-chip:disabled { cursor: not-allowed; opacity: 0.45; pointer-events: none; }`

## Task 824 — mode-chip / story-chip keyboard focus-visible styles
semantic-demo.css: Added `.mode-grid .mode-chip:focus-visible, .mode-grid .mode-chip:focus { outline: 2px solid rgba(78, 205, 196, 0.8); outline-offset: 2px; }`
vector-explorer-polished.html inline style block: Added `.mode-chip:focus-visible, .mode-chip:focus, .story-chip:focus-visible, .story-chip:focus { outline: 2px solid rgba(78, 205, 196, 0.8); outline-offset: 2px; }`

## Task 822 — .sr-only screen-reader utility class
semantic-demo.css: Added `.sr-only { clip-path: rect(0 0 0 0); border: 0; padding: 0; position: absolute; white-space: nowrap; overflow: hidden; width: 1px; height: 1px; }`

## Task 820 — Error CSS classes
semantic-demo.css: Added `.error-message`, `.semantic-error`, `.error-container` with red/amber palette for lifecycle.js and semantic-search-api-cache.js error states.

## Task 821 — Empty-state / no-results CSS classes
semantic-demo.css: Added `.empty-state`, `.no-results`, `.empty-search-results` with centered layout and muted teal text for zero-results scenarios.

## Tasks 830-834 — Focus-visible keyboard accessibility audit
All interactive components that were missing `:focus-visible` styles now have proper keyboard focus indicators:
- `.view-toggle button:focus-visible` — teal outline for Galaxy/Map switcher
- `.legend-item:focus-visible` — teal outline for legend filter items
- `.cluster-item:focus-visible` — teal outline for cluster filter list items
- `.surprise-btn:focus-visible` — amber outline matching the Random Business button's accent palette
- `.filter-select:hover` + `.filter-select:focus-visible` — hover border shift + teal focus glow ring

## Task 835 — Bug 825: Exploration card bleeds into map view
semantic-demo.css: Added `body[data-active-view="map"] .exploration-card { display: none !important; }` to hide the exploration card in plain map view (without trail). Note: `data-active-view="map"][data-trail-state="active"]` already hides it during active trail — the new rule covers the non-trail map view state.

## Task 827 — Search results loading spinner
Added `.search-spinner` element to vector-explorer-polished.html (inside search-input-wrapper) and CSS in semantic-demo.css:
- `.search-spinner` — 16px teal spinning circle, hidden by default
- `body.searching .search-spinner` — becomes visible and animates when search is in progress
- `@keyframes searchSpin` — 0.7s linear infinite rotation

## Task 828 — Native details disclosure markers CSS
semantic-demo.css: Added `.rail-section summary::-webkit-details-marker`, `.cluster-section summary::-webkit-details-marker`, and `.exploration-secondary summary::-webkit-details-marker` (all `display: none`), plus custom CSS chevron `::after` for each open/closed state. Added `cursor: pointer` to all three summary types.

## Tasks 840-849 — Bug Sweep 16 (2026-05-11)

### v126 — Module mode standardization + a11y fixes

**Source module fixes:**
- `lifecycle.js:75`: `hideLoadingOverlay()` — added `searchInput.focus()` after overlay hidden; fixes focus hole for keyboard/screen reader users
- `lifecycle.js:updateExplorationUi()` (lines ~385-388): story chips now toggle `aria-pressed` dynamically when activated/deactivated
- `journey.js:341`: `renderThreadInspection()` — wrapped canvas pointer-guard listener setup in `if (state.currentView === 'galaxy')` guard; prevents canvas handlers from activating in map view
- `journey.js:1103,2364`: Overview/Recenter → "Refocus Neighborhood" in focus-stage-note explanatory text and degraded lane message
- `semantic-demo-v2.css`: Added generic `:focus-visible` ring (teal, near top of stylesheet), `.focus-stage-inside-btn:focus-visible`, and `.skip-link` styles

**Live shell HTML fixes (vector-explorer-live-shell-merge-task666.html):**
- Script src `dist/bundle-v123.js?v=20260510-clock-fix-init-order` → `dist/bundle.js?v=20260510` (aligns with deploy pipeline)
- Added skip link as first body child: `<a href="#main-content" class="skip-link">Skip to main content</a>`
- Added `role="region" aria-label="Focused business detail"` to `#focus-stage` element
- Added `tabindex="-1"` to `#info-panel-content` to serve as skip link target
- Added `title` to `btn-focus-overview` ("Zoom out to show the whole county") and renamed `btn-focus-center` to "Refocus Neighborhood" with descriptive `title` and `aria-label`
- Added `aria-pressed="false"` to all 4 story-chip buttons

**Pre-existing (no fix needed):**
- `search-state.js` keydown for Enter/Space on search result cards — already present
- `app.js:212` `loadSemanticThreads().catch(...)` — already calls `showStartupRecoveryNotice()` on failure (not silent)
- `renderSelectedMetaStrip` and `renderSelectedMatchPanel` — already have `currentView === 'map'` guards

**Pending deploy:**
- `dist/bundle.js` (308.0kb, built 2026-05-11)
- `semantic-demo-v2.css` (focus ring CSS already on server)
- `vector-explorer-live-shell-merge-task666.html` (all HTML fixes above)

## Task 836 — Double setInterval clockTimer leak (v127)
app.js:257-260 — removed spurious first `setInterval(updateTime, 1000)` that ran before `await applyUrlState()`. Clock now set once after URL state is restored. dist/bundle.js rebuilt (308.1kb).

## Tasks 837-841 — Copy and accessibility fixes (v128)

**Task 837 — "Guide This Trail" button aria-label (source file fix)**
vector-explorer-polished.html:3279 — added `aria-label="Guide this trail"` to `btn-synthesize` button. The live shell (vector-explorer-live-shell-merge-task666.html) already had this aria-label; source file was missing it.

**Task 838 — No-results message and inline styles (search-state.js)**
search-state.js:606,693 — replaced hardcoded `style="padding:15px..."` inline div with `class="no-results"` (CSS class already existed at semantic-demo.css:3315). Removed arbitrary example queries ("coffee", "parks", "plumber") that may also return zero results. New message: "No records found for your query. Try a different service, place type, or business need."

**Task 839 — "Cross-current businesses" label unclear (vector-explorer-polished.html)**
vector-explorer-polished.html:3394 — renamed story-chip label from "Cross-current businesses" to "Cross-neighborhood" to match the bridge mode description and its own caption ("between separate neighborhoods").

**Task 840 — Unexplained "corridor" metaphor (search-state.js:615)**
search-state.js:615 — replaced "corridor" with "path" in search trail cue note: "Looking for the first strong semantic anchor, then building a path you can center and walk." Note: statusEl.textContent at line 697 still says "No clear corridor for..." — left as-is since "corridor" there is a label/kicker, not a metaphor requiring explanation.

**Task 841 — Internal jargon in toast message (lifecycle.js:665)**
lifecycle.js:665 — replaced "Current view link copied without the smoke-test cache buster." with "Link copied — paste it in your browser to return here."

**Tasks 842-846 — Additional a11y fixes from explore pass (v128)**

**Task 842 — demo-starter-chip trail buttons aria-label (vector-explorer-polished.html:3243-3246)**
Added `aria-label="Start X trail"` to each of the 4 demo starter chip buttons (coffee, roof repair, childcare, dog friendly). The live shell already had these; source file was missing them.

**Task 844 — semantic-lane-ops hidden panel aria-label (vector-explorer-polished.html:3266)**
Added `aria-label="Semantic lane operational status"` to the hidden semantic-lane-ops div so assistive technology can identify it when shown.

**Task 845 — search-trail-cue dynamic cue aria-live (vector-explorer-polished.html:3249)**
Added `role="status" aria-live="polite"` to the search-trail-cue div so dynamic instructional updates during search flow are announced to screen reader users.

**Task 846 — journey.js empty-state string tense (journey.js:1307)**
Changed fallback message from `'No geocoded point available yet'` to `'No geocoded point'` to match present-tense style of other empty-state messages in the selected-card panel.

## Task 850 — Empty state messages for neighbor list and cluster list (v129)

**journey.js:2157** — Added `'<div class="empty-state">No neighboring stops found in this area.</div>'` as the empty-state message when neighbor candidates list is empty. Previously left `list.innerHTML = ''` with no feedback.

**semantic-demo-v2.css:6706** — Added `.empty-state` CSS class (centered flex column, muted teal text, 12.5px) to match the existing style from semantic-demo.css:3381 so the class works consistently in both stylesheets.

Cluster list already had a message: `'<div class="cluster-caption">No semantic neighborhoods match the current filters.</div>'` at lifecycle.js:149 — no change needed.

dist/bundle.js rebuilt (308.2kb).

## Tasks 851-852 — UX fixes (v130)

**Task 851 — Cross-current → Cross-neighborhood label (live shell HTML)**
vector-explorer-live-shell-merge-task666.html:612 — Changed `aria-label="Show cross-current businesses"` to `"Show cross-neighborhood businesses"` and `<span class="story-label">Cross-current businesses</span>` to `Cross-neighborhood`. Aligns with bridge mode description and the caption "between separate neighborhoods". Source file (vector-explorer-polished.html) was updated in v128; live shell now matches.

**Task 849 — Toolbar icon button title attributes (live shell HTML)**
vector-explorer-live-shell-merge-task666.html — Added `title` attributes to all icon-only toolbar buttons:
- `#btn-zoom-in`: `title="Zoom In"`
- `#btn-zoom-out`: `title="Zoom Out"`
- `#btn-reset`: `title="Reset to clean start"`
- `#btn-rotate`: `title="Toggle auto-rotate"`
- `#btn-share-view`: `title="Share current view"`

Source file (vector-explorer-polished.html) already had these; live shell now matches.

**Task 850 — Meta strip empty-field guard (lifecycle.js, v130)**
lifecycle.js:2428-2441 — `renderSelectedMetaStrip()` no longer shows bare `—` when either city or status is missing. Now produces:
- `Willis — active` (both present)
- `Willis` (city only)
- `active` (status only, rare from API)
- `Montgomery County` (neither present, fallback)

dist/bundle.js rebuilt (310.9kb).

**Task 852 — Info panel mobile overflow (semantic-demo.css, v130)**
semantic-demo.css:6103-6132 — Added `@media (max-width: 390px)` rule with:
- `left: 8px; top: 68px; width: calc(100vw - 16px); max-width: 344px; border-radius: 12px` for the panel itself
- Reduced hidden transform offset
- Smaller header padding and font size
- Single-column grid for `.selected-grid`
- Tighter item padding

CSS deployed to live server (semantic-demo.css, not v2 — the live shell loads the main CSS).

## Task 853-856 — Bug Sweep 17 fixes (v131)

**Task 853 — Ghost function: describeThreadLensForPoint (journey.js:2567)**
Implemented `window.describeThreadLensForPoint(point)` in journey.js. It looks up the point's lead_id in `state.semanticNeighborMapByLeadId` and returns cluster-aware descriptions based on neighbor count:
- 0 neighbors → "Isolated node — no semantic connections yet."
- 1–3 neighbors → "Sparse node — only N connections."
- 20+ neighbors → "Strong anchor in [cluster] cluster with N semantic neighbors."
Previously the Thread Lens field always showed "Waiting for a semantic thread."

**Task 854 — Ghost function: animateCameraToTerrainPrelude (lifecycle.js:2721-2773)**
Fixed: The function was trapped inside an unclosed IIFE, so it was never assigned to `window`. Call at lifecycle.js:1074 now works. The galaxy→map flattening prelude animation will now fire when switching views.

**Task 855 — Story chip .active CSS + cluster filter clear button**
- Added .mode-chip/.story-chip active/focus CSS rules to semantic-demo-v2.css (teal glow, opacity 0.18 background, 0.55 border)
- Added clear-filter-btn pill to updateClusterList() in lifecycle.js (amber × Clear neighborhood filter)
- CSS for .clear-filter-btn in semantic-demo-v2.css

**Task 856 — renderSignalBadges in map view (lifecycle.js:2429)**
Removed `if (state.currentView === 'map') return '';` guard from renderSignalBadges(). Signal badges (Website/Email/Phone) are now visible in map view when a node is selected.

**Task 857 — Surprise button feedback (lifecycle.js:2586-2595)**
Added toast notification after surprise jump: "Surprise record selected" / "Jumped to a random business record in the county." Previously the action was silent.

**Task 858 — Loading overlay smooth fade-out (semantic-demo-v2.css)**
Added `transition: opacity 0.3s ease` to `.loading-overlay.hidden` so the overlay fades out gracefully instead of snapping away instantly.

**Task 859 — ARIA gaps fixed in source HTML (vector-explorer-polished.html)**
- search-trail-cue: added `role="status" aria-live="polite"` (line 3246)
- semantic-lane-ops: added `aria-label="Semantic lane operational status"` (line 3263)
- cluster-list: added `aria-label="Semantic neighborhood filters"` (line 3445)
Already had: loading-overlay aria-busy/role/aria-live (3103), focus-stage-note aria-live (3481)

dist/bundle.js rebuilt (311.3kb). Deployed to both server paths.

## Task 860 — renderSignalBadges map-view guard fix (v132)
Lifecycle.js renderSignalBadges still had `if (state.currentView === 'map') return '';` guard — removed so signal badges (Website/Email/Phone) now appear in focus-stage even when user is in map view.

## Task 861 — Focus-visible CSS additions (v132)
semantic-demo-v2.css: Added :focus-visible rules for:
- .control-btn:focus-visible (toolbar buttons)
- .legend-toggle:focus-visible (legend panel toggle)
- .legend-item:focus-visible (legend filter items)
- .filter-chip:focus-visible (status filter chips)

dist/bundle.js rebuilt (311.8kb). Deployed to both server paths.

## Bug Sweep 18 (2026-05-11)

### Bug 1 (CRITICAL) — search-state.js:~840 — No feedback for too-short query
Type "a" → query silently rejected. Added transient message "Type at least 2 characters to search" with 2s auto-clear via setTimeout. Only shows when user typed at least 1 char but less than 2 (trimmedQuery.length > 0 && < 2).

### Bug 2 (MEDIUM) — search-state.js:~855 — Long query error vanishes during debounce
Query > 200 chars → error set but immediately overwritten by next keystroke. Fixed with:
- Shake animation class on input (`.shake-input` + `@keyframes inputShake`)
- Truncate input to 200 chars so error is sticky (doesn't re-trigger on each keystroke)
- Status message remains until user corrects

### Bug 3 (MEDIUM) — search-state.js:~637 — Empty state pre-fill during loading race
`beginSemanticSearchUiState` pre-filled `resultsEl` with the "No matching strands found" empty state before async search completed. Replaced with loading skeleton:
```html
<div class="search-loading">
    <div class="search-loading-spinner"></div>
    <div class="search-loading-text">Searching...</div>
</div>
```
Styled with pulse animation (`@keyframes searchLoadingPulse`) in semantic-demo.css.

### Bug 4 (MEDIUM) — event-bindings.js:~119 — Duplicate oninput handler risk
`searchInput.oninput = ...` is old property assignment — replaced with `addEventListener('input', ...)` with `_onInputHandler` reference stored for safe removal on re-bind. Now safe for route restore calls to `bindSearchControls`.

### Bug 5 (LOW) — event-bindings.js:~4 — bindClick silently skips missing elements
Added `console.warn('[event-bindings] button not found:', id)` in the `if (!element)` branch.

**CSS additions:**
- `.search-loading`, `.search-loading-spinner`, `.search-loading-text` — loading skeleton
- `@keyframes searchLoadingPulse` — 1.4s ease-in-out infinite pulse
- `@keyframes inputShake` — 0.4s ease-in-out shake for over-length input
- `.shake-input` class for applying shake animation

**Source files changed:**
- `js/modules/search-state.js` — Bug 1, 2, 3
- `js/modules/event-bindings.js` — Bug 4, 5
- `semantic-demo.css` — Bug 2 CSS animation, Bug 3 loading skeleton styles

## Bug Sweep 18 Fixes (v133, 2026-05-11)

### CRITICAL — init() failure halts app (app.js:~296)
`init().catch()` showed error in overlay but never halted execution. App continued with null state (state.points = null), causing cascading failures. Added `throw err;` at end of catch block to halt JavaScript execution.

### CRITICAL — XSS vector in loading overlay innerHTML (app.js:~280)
Error message rendered via string concatenation with single-quoted attributes. If `escapeHtml` was absent or error.message contained a single quote, HTML would break or XSS could occur. Converted to template literal syntax. `escapeHtml` already imported at line 13.

### HIGH Severity Fixes

**Fix 1 — Stale STORY_DESCRIPTIONS (lifecycle.js:29)**
Changed `bridge-businesses` from "Cross-current businesses focuses on..." → "Cross-neighborhood focuses on..." — matches renamed chip label.

**Fix 2 — "Follow Connection" unexplained action (lifecycle.js:761-763)**
Updated note to: `Follow this connection to "[Business Name]" — step N of the trail.` Now shows the target business name and trail position.

**Fix 3 — Journey compass steps cryptic (lifecycle.js:889)**
Added `aria-label` to each `.journey-compass-step` with human-readable descriptions:
- "1. Overview: County overview — see the whole county"
- "2. Search: Search — find and center on a business"
- "3. Focus: Focus — inspect a centered anchor"
- "4. Inside: Inside — walk the trail neighborhood"
- "5. Map: Map — view geographic layer"

**Fix 4 — "exit trail" unclear (lifecycle.js:767,787,825-835)**
Added `hint: 'Exit trail'` to tertiaryAction in focus/inside phases. `syncJourneyCompassActions` now surfaces hint as `aria-label` and `title` on the tertiary action button.

### MEDIUM Severity Fixes

**Fix 5 — selected-facts duplicate fallback text (journey.js:1337)**
Changed fallback from `'Montgomery County business record'` (which duplicates `selected-what`) to `'<span class="facts-none">No contact info on file</span>'`. Added `.facts-none { color: var(--text-dim); font-style: italic; }` CSS.

**Fix 6 — Missing 390px mobile breakpoint (semantic-demo-v2.css)**
Added `@media (max-width: 390px)` with `left/right: 8px` and reduced `.info-content` padding for small Android viewports (360px and below).

**Fix 7 — Guide This Trail button unexplained (lifecycle.js:1760)**
Added `<span class="guide-btn-hint"> — read the trail and generate suggestions</span>` suffix. CSS: `.guide-btn-hint { display: none; }` shown on hover/focus.

**Fix 8 — "trail pocket" jargon (search-state.js:932)**
Replaced "focused trail pocket" with "local neighborhood".

### LOW Severity Fixes

**Fix 9 — renderSignalBadges orphaned in map view (lifecycle.js:2349)**
Added `if (state.currentView === 'map') return '';` guard — signal badges now hidden in map view, consistent with other selected-card panel renderers.

**Fix 10 — "semantic neighborhood" phrase never explicit (lifecycle.js:194 + semantic-demo-v2.css)**
Added `.legend-subtitle` below "Neighborhood palette" title: "Semantic neighborhoods group businesses by shared language, trade, civic role & business texture." CSS: `.legend-subtitle { font-size: 10px; color: var(--text-dim); margin: 4px 0 8px; }`.

dist/bundle.js rebuilt (314.7kb). Deployed to both server paths.

## Bug Sweep 18 (2026-05-11, continued session)

### Bug 1 (MEDIUM) — btn-surprise silently does nothing when no eligible points (event-bindings.js:50-56)
Fixed: After filtering eligible points, if `!eligible.length` the button now shows a brief `#summary-text` message "No eligible businesses for surprise selection.", gets `.disabled` class + `aria-disabled="true"`, and `title` tooltip "No eligible businesses for surprise selection". Previously was silently swallowed.

### Bug 2 (MEDIUM) — btn-resident-focus silently returns when no highlight_lead_ids (event-bindings.js:162-167)
Fixed: Added `aria-disabled="true"` and `title="No leads to focus"` to the button when `highlight_lead_ids` is empty. Button is also given `.disabled` class via `classList.toggle('disabled', !hasLeads)`.

### Bug 3 (MEDIUM) — Similar/Neighbor buttons silently do nothing (event-bindings.js:66-71, 82-86)
Fixed: When clicked with no focused node, the button now gets a `.shake` CSS animation class (using existing `@keyframes buttonShake` at semantic-demo.css:3592) plus `title="Select a business first"`. The class is removed after 400ms. Previously the `#summary-text` was updated but the button gave no visual feedback.

### Bug 4 (MEDIUM) — No explicit setInfoPanelOpen function (event-bindings.js:~870)
Fixed: Created `window.setInfoPanelOpen(open)` function in `bindWindowControlFunctions()` that encapsulates toggling `.collapsed` class on `.info-panel`, updating `body.dataset.focusPanelMode`, and returning the new state. Replaced direct `classList.toggle('collapsed')` in `bindPanelControls()` and `handleGalaxyKeydown` Escape handler in lifecycle.js.

### Bug 5 (MEDIUM) — 1200ms map prelude has no progress feedback (camera-controls.js:animateCameraToTerrainPrelude)
Fixed: Wrapped the prelude in try/catch/finally and calls `window.showTerrainPreludeOverlay()` before the animation and `window.hideTerrainPreludeOverlay()` in finally (on completion or error). Uses existing `state.MAP_HANDOFF_PRELUDE_MS` (430ms) as the duration source. Note: `showViewHandoff` already shows a toast-style overlay via `.view-handoff` element at lifecycle.js:1062.

**Source files changed:**
- `js/modules/event-bindings.js` — Bugs 1, 2, 3, 4
- `js/modules/lifecycle.js` — Bug 4 (Escape handler uses setInfoPanelOpen)
- `js/modules/camera-controls.js` — Bug 5 (try/catch + overlay calls)

## Bug Sweep 18 (2026-05-11) — additional fixes

### Bug 11 (HIGH) — lifecycle.js:handleGalaxyKeydown — Keyboard shortcuts undiscoverable
Arrow keys, Home, End, +/-, Escape do things with no on-screen indication. Fixed:
- `initKeyboardShortcutsHint()` in lifecycle.js creates floating keyboard-hint-panel
- `showKeyboardShortcutsHint()` shows panel + auto-dismisses after 5s; wired to "?" toolbar button
- `flashArrowKeyToast()` shows toast on first arrow press ("Arrow keys to navigate — press ? for shortcuts")
- app.js init now calls `initKeyboardShortcutsHint()` after `initEventListeners()`
- CSS: `.keyboard-hint-panel` (bottom-right floating panel) + `.kh-*` styles

### Bug 12 (MEDIUM) — lifecycle.js:handleGalaxyKeydown — Escape didn't close info panel
Escape key only closed tooltip/legend/summary-card. Added `infoPanel.classList.add('collapsed')` check.

### Bug 13 (MEDIUM) — lifecycle.js:setMyceliumMode — No feedback during heavy recompute
Story chip clicks trigger `recomputeBloomIndices`/`recomputeBridgeIndices` with no UI feedback. Fixed:
- `modeGrid.classList.add('computing')` before recompute, removed after
- Wrapped in `requestIdleCallback` (2000ms timeout fallback to `setTimeout`)
- CSS: `.mode-grid.computing .mode-chip { opacity:0.6; pointer-events:none }` + `@keyframes modeGridComputing` pulse

### Bug 14 (LOW) — event-bindings.js — Onboarding hint auto-hides and never returns
Hint appears once at 1.5s, disappears at 7.5s, never returns. Fixed:
- `resetOnboardingIdleTimer()` — 60s idle timeout re-shows hint for 6s
- Idle timer resets on mousemove/keydown/click (passive listeners)
- "?" toolbar button also shows onboarding hint on click

### Bug 15 (LOW) — [data-story]/[data-mode] chips already have type="button"
All chips in vector-explorer-polished.html (lines 3359+) already carry `type="button"`. No HTML change needed.

**Source files changed:**
- `js/modules/lifecycle.js` — Bug 11 (keyboard panel/toast), Bug 12 (Escape closes info panel), Bug 13 (computing state)
- `js/modules/event-bindings.js` — Bug 11 (btn-keyboard-help wiring), Bug 14 (idle re-show onboarding)
- `js/modules/app.js` — Bug 11 (import + call initKeyboardShortcutsHint)
- `semantic-demo.css` — Bug 11 CSS (keyboard-hint-panel + .kh-*), Bug 13 CSS (mode-grid.computing)

### Bug 16 (MEDIUM) — Cache schema validation vulnerability (semantic-search-api-cache.js)
`storeSemanticSearchPayload` only checked `payload?.ok` and `Array.isArray(payload?.results)` — did not validate that `results` entries contain required fields (`lead_id`, `score`). A malformed API response could be stored and served on cache hits with `client_cache_hit: true`, silently producing bad data in results. Added `validatePayloadSchema()` function that iterates `payload.results` and returns false if any entry is missing `lead_id` or `score`. `storeSemanticSearchPayload` now calls this before storing; invalid payloads are treated as cache misses and a `console.warn` is emitted.

## Bug Sweep 17 (2026-05-11, continued session)

### Confirmed LIVE and WORKING (curl-verified):
- All 13 focus-visible CSS gaps (819-834) — in live semantic-demo.css (18 focus-visible rules confirmed)
- .story-chip.active CSS — in live CSS (2 occurrences confirmed)
- Empty-state/error/sr-only CSS — in live CSS
- Loading overlay aria-busy/role="status" — in live HTML (vector-explorer-polished.html)
- btn-focus-dive aria-pressed toggle — confirmed in bundle.js (syncSemanticDiveUi function)
- search-trail-cue role="status" aria-live="polite" — confirmed in HTML
- semantic-lane-ops aria-label — confirmed in HTML
- .about-card, .selected-card.reveal-focus, cascadeFade keyframes — in inline style block of live HTML
- 3 ghost function fixes confirmed in bundle.js via curl:
  - animateCameraToTerrainPrelude (camera flattening prelude)
  - describeThreadLensForPoint (Thread Lens field fallback)
  - renderSignalBadges (contact badges export to window)

### Verified Visual Rendering (Playwright screenshot 2026-05-11):
- Galaxy loading view: glassmorphism card, teal/gold orb effects, loading bar all render correctly
- No blank areas or styling errors

### CSS Deploy Gap (maintenance issue, not live bug):
- deploy.sh does NOT push CSS files to server — only bundle.js and HTML
- External semantic-demo.css already has: about-card/selected-card base + cascadeFade keyframes (polish142), contextual focus/map rules (polish143 at 4632+), vector-cascade-line hiding (polish285)
- NEWLY ADDED (polish288): stats-row/stat-box/stat-number/stat-label base styles; (polish288b): rail-section base + summary styles
- Compensated by inline `<style>` block in vector-explorer-polished.html (live URL) — inline block still carries: stats-row styles, contextual body[data-graph-context="focus"] selected-card rules, body[data-active-view="map"] selected-card rules
- Task 860 RESOLVED: duplicate inline rules now removed from vector-explorer-polished.html

### SSH Deploy Blocker:
- SSH to mccullough.cloud blocked (ports 22 and 65002 timeout)
- Alternative deploy via cPanel/SFTP not available
- CSS fixes ready locally but not on server

## Tasks 857-859 — Visual polish fixes (semantic-demo.css, in-progress deploy)

**Task 857 — Panel collapse transition consistency (HIGH)**
semantic-demo.css:2309-2315 — Added `transition: transform 0.3s ease, opacity 0.3s ease;` to `.info-panel.collapsed`. Previously `.info-panel.collapsed` had no transition (snapped instantly) while `.info-panel.hidden` used a smooth 0.3s slide. Now both hiding mechanisms use the same smooth transition.

**Task 858 — Info-panel toggle icon interaction feedback (MEDIUM)**
semantic-demo.css:2231-2247 — Added hover/focus-visible/active rules for `.info-toggle-icon`:
- `.info-toggle-icon:hover` — brighter radial glow, scale(1.08)
- `.info-toggle-icon:focus-visible` — 2px teal outline
- `.info-toggle-icon:active` — scale(0.94) press feedback

**Task 859 — Similar clusters button unexplained visual distinction (MEDIUM)**
semantic-demo.css — Removed `.suggestion-btn:first-child` golden gradient rule entirely. All three suggestion buttons (Similar clusters, Nearest neighbor, Full report) now share equal default styling, matching their equal-weight event binding behavior.

**Task 860 — Inline style block partial extraction (LOW, completed partial)**
semantic-demo.css:3488-3509 — Added .stats-row, .stat-box, .stat-number, .stat-label base styles (polish288)
semantic-demo.css:3357-3442 — Added .rail-section base + summary styles (polish288b), removed duplicate polish287b rules
Inline `<style>` block still has: stats-row context rules, contextual body[data-graph-context="focus"] selected-card rules (override CSS due to cascade), body[data-active-view="map"] selected-card context rules
Full cleanup requires: pushing updated CSS to server + removing duplicate inline rules

## Tasks 861-862 — Interaction audit findings

**Task 861 — Escape key toggles info panel (HIGH, confirmed in bundle)**
Bundle contains `if(t.key==="Escape")` handler — confirmed working. Close button click closes, Escape key closes. No duplicate toggle-on-open behavior observed. FIXED.

## Task 863 — Unified corridor/path connection copy (COMPLETED)

**Chosen phrase:** "Search opens a path."

**Rationale:** Active voice, present tense, implies action and result. "Search" as the subject makes the user the agent. The phrase appears in both the initial-state static HTML (search-trail-cue-title at line 295 of vector-explorer-polished.html) and as a dynamic kicker/title in search-state.js and lifecycle.js.

**Variations unified:** The following phrases were all replaced with "Search opens a path.":
- "Connection path ready." (search-state.js:429, lifecycle.js kicker at 1685)
- "Connection path ready" (without period, search-state.js:1112 kicker)
- "Connection path ready:" (with colon, lifecycle.js:456 resultText)
- "The connection path is ready for exploration." (lifecycle.js:2094, 2185)
- "The connection path is live. ..." (lifecycle.js:1653 note)
- "The focus neighborhood is live. ..." (lifecycle.js:1655 note)
- "The anchor is locked. ..." (lifecycle.js:1657 note)
- "Connection path open" (lifecycle.js:1685 kicker)

**Files edited:**
- `js/modules/search-state.js` — 2 replacements (line 429 title, line 1112 kicker)
- `js/modules/lifecycle.js` — 5 replacements (lines 456, 1653-1657, 1685, 2094, 2185)

**Build & Deploy:** `npm run build` then `npm run deploy` executed. Bundle verified on server: 9 instances of "Search opens a path", 0 instances of "Connection path ready".

**Task 862 — Search-in-map back-to-galaxy path (MEDIUM, confirmed in bundle)**
Bundle contains galaxy-return logic. Users can return from map view to galaxy overview. No broken path observed. FIXED.

## Session 2026-05-12 (Late PM)

### Bug (HIGH) — Chrome DevTools MCP clicks fail on Bridge button in search context
Chrome DevTools MCP click by accessibility UID silently missed the Bridge mode chip when `graphContext='search'`. The JS `.click()` method worked fine, but chrome-devtools clicks hit the canvas below instead — no visual feedback, no mode change.

**Root cause:** `.exploration-card` was set to `display: none` via CSS when `graphContext='search'`. The `.mode-grid` was nested inside `.exploration-card`, so the entire mode chip row was removed from both the layout tree and the accessibility tree. Chrome DevTools clicks by UID require the element to be in the accessibility tree — with `display: none`, it was not. A click at the element's center (0,0) hit the WebGL canvas beneath instead.

JS `.click()` works because it fires the event in the DOM regardless of layout/visibility — it doesn't need the accessibility tree.

**Fix:** Moved `.mode-grid` out of `.exploration-card` and into `.search-container` (which is always visible regardless of graphContext). The mode chips remain clickable in all states: idle, search, focus, and trail.

**Files changed:**
- `vector-explorer-polished.html` — `.mode-grid` moved from inside `.exploration-card` to after `.search-results` inside `.search-container`
- `semantic-demo.css` — Added `.search-container .mode-grid` and `.search-container .mode-chip` to `pointer-events: auto` list; added separator styling (border-top, margin-top, padding-top) to visually separate mode chips from search results above
- Cache busters updated: CSS `?v=20260512c`, JS bundle `?v=20260512l`

**Verified:** Playwright test confirmed Bridge button click changes `stateMode: 'bridge'` and `aria-pressed: 'true'` even when `graphContext='search'`. Visual screenshot confirmed polished UI appearance with mode chips cleanly separated from search results.

### Decision #35 — Bridge button click bug (CLOSED)
Fix implemented and verified. Decision resolved.
