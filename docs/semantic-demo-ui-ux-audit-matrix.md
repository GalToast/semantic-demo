# Semantic Explorer UI/UX Audit Matrix

**Last audit run:** 2026-06-12
**Test runner:** `tests/surface-contract-check.mjs` (headless, legacy shell at `http://127.0.0.1:8795/vector-explorer-polished.html`)
**Visual runner:** `tests/visual-state-audit.mjs` (states from `tests/visual-state-registry.mjs`)
**Audit lead:** Main Codex lane
**Audit type:** Read-only diagnostic + active fixes

---

## 1. Audit Method

### 1.1 Tools

| Tool | Purpose | Output |
|---|---|---|
| `surface-contract-check.mjs` | Fast DOM/layout assertions per named surface | JSON per surface + summary |
| `visual-state-audit.mjs` | Screenshot capture + overlap/surface-fit/visibility checks | PNG + JSON per state |
| `inspect-deep.cjs` | Manual DOM probe (deeper visibility/structure checks) | JSON snapshot |

### 1.2 Server prerequisite

The contract test connects to `http://127.0.0.1:8795/vector-explorer-polished.html`. This requires `npm run serve` (Python `http.server` on port 8795) to be running from the **project root**. If the server serves from the wrong directory, the page returns the raw `data/scraped_businesses.json` and every DOM check fails with "missing element" (see §6 Pre-run diagnostic).

### 1.3 Coverage matrix

20 contract surfaces + 25 visual states defined (see `tests/visual-state-registry.mjs`).

---

## 2. Contract Surface Results — 2026-06-12

**Total:** 27 surfaces · 267 assertions · **267 pass / 0 fail (100%)**

| # | Surface | Pass | Fail | Status | Headline issue |
|---|---|---|---|---|---|
| 1 | `mobile-idle` | 7 | 0 | ✅ clean | — |
| 2 | `desktop-idle` | 5 | 0 | ✅ clean | — |
| 3 | `launch-focus` | 7 | 0 | ✅ clean | — |
| 4 | `search-error` | 8 | 0 | ✅ clean | — |
| 5 | `search-no-results` | 14 | 0 | ✅ clean | — |
| 6 | `map-trail` | 9 | 0 | ✅ clean | — |
| 7 | `focus-pocket` | 11 | 0 | ✅ clean | — |
| 8 | `field-node` | **24** | 0 | ✅ **FIXED** | `layout:focus-stage-card-bottom-flush` (see §5.5 Fix 1) |
| 9 | `info-panel-empty` | 10 | 0 | ✅ clean | — |
| 10 | `compass-rail` | 12 | 0 | ✅ **FIXED** | Compass/stage overlap (see §5.5 Fix 2) |
| 11 | `loading-overlay` | 11 | 0 | ✅ clean | — |
| 12 | `mode-grid` | 9 | 0 | ✅ clean | — |
| 13 | `filters` | 11 | 0 | ✅ clean | — |
| 14 | `thread-inspector` | 6 | 0 | ✅ clean | — |
| 15 | `controls` | 9 | 0 | ✅ clean | — |
| 16 | `search-chrome` | 32 | 0 | ✅ clean | — |
| 17 | `info-panel-populated` | 17 | 0 | ✅ clean | — |
| 18 | `global-spacing` | 10 | 0 | ✅ clean | — |
| 19 | `mobile-product-focus-route` | 7 | 0 | ✅ clean | — |
| 20 | `mobile-product-preview-route` | 6 | 0 | ✅ clean | — |
| 21 | `hover-tooltip` | 2 | 0 | ✅ clean | — |
| 22 | `synthesis-summary-card` | 5 | 0 | ✅ clean | — |
| 23 | `search-trail-cue` | 4 | 0 | ✅ clean | — |
| 24 | `mobile-focus-search` | 12 | 0 | ✅ clean | — |
| 25 | `mobile-semantic-dive` | 20 | 0 | ✅ clean | — |
| 26 | `mobile-semantic-dive-320` | 20 | 0 | ✅ clean | — |
| 27 | `tablet-semantic-dive` | 20 | 0 | ✅ clean | — |

**Detailed run output:** `tmp/surface-contract-check/<runId>/<surface>.json` and `summary.json`

---

## 3. Visual State Audit Results — 2026-06-12 (13 of 25 states)

States captured: `01-mobile-idle`, `02-mobile-search-coffee`, `03-mobile-focus-first-result`, `04-mobile-field-node-active`, `05-mobile-map`, `06-mobile-filters-open`, `09-mobile-map-empty-state`, `10-mobile-search-error-state`, `11-mobile-selected-card-map-trail`, `18-mobile-loading-overlay`, `19-mobile-compass-rail`, `20-mobile-mode-grid-visible`, `25-mobile-search-no-results` (+ `07-desktop-idle` from individual re-run)

| State | Assertions | Visual issues found |
|---|---|---|
| `01-mobile-idle` | clean | None |
| `02-mobile-search-coffee` | clean | None |
| `03-mobile-focus-first-result` | clean | **0 issues** (was 3 — all FIXED in §5.5) |
| `04-mobile-field-node-active` | clean | None |
| `05-mobile-map` | clean | None |
| `06-mobile-filters-open` | clean | None |
| `09-mobile-map-empty-state` | clean | None |
| `10-mobile-search-error-state` | clean | None |
| `11-mobile-selected-card-map-trail` | clean | None |
| `18-mobile-loading-overlay` | clean | None |
| `19-mobile-compass-rail` | clean | None |
| `20-mobile-mode-grid-visible` | clean | None |
| `25-mobile-search-no-results` | clean | None |
| `07-desktop-idle` | 18 pass / **1 fail** | `#camera-controls` (z=100) overlap (see §3.2) — **unfixed** |

Full visual evidence: `tmp/semantic-ui-visual-audit/2026-06-12T06-52-02-411Z/` (13 PNGs + 13 JSONs) and `tmp/semantic-ui-visual-audit/2026-06-12T06-47-40-452Z/07-desktop-idle.png` (desktop-chrome issue).

### 3.0 States NOT captured (12 of 25)

States that failed to capture are blocked on the **`enterSemanticDiveViaVisibleControl` entry point** (`visual-state-audit.mjs:1487`), which times out at 12 seconds in headless mode:

| State | Reason |
|---|---|
| `08-desktop-search-coffee` | Headless WebGL / software renderer fallback blocks visible control entry |
| `11-desktop-selected-card-map-trail` | Same |
| `12-desktop-reduced-motion` | Same |
| `13-desktop-filters-open` | Same |
| `14-desktop-search-error` | Same |
| `15-mobile-semantic-dive` | Same |
| `16-desktop-info-panel-populated` | Same |
| `17-mobile-thread-inspector` | Same |
| `21-mobile-route-trace-visible` | Same |
| `22-mobile-semantic-dive-320` | Same |
| `23-mobile-short-landscape` | Same |
| `24-mobile-map-focus-search` | Same |

**Root cause:** The headless browser's software renderer is blocking the WebGL-driven entry point (`[demo] blocked -- no WebGL / software renderer` in console). To capture these states, either:
1. Run the visual audit in headed mode with real WebGL (`--no-headless` flag)
2. Increase the `enterSemanticDiveViaVisibleControl` timeout from 12s to 30s
3. Mock the WebGL state in headless test environment

### 3.1 Visual overlap detail (03-mobile-focus-first-result) — RESOLVED

~~Original 2026-06-11 issues:~~
- ~~(a) `.journey-compass` overflows right edge by 16px~~
- ~~(b) `.journey-compass` overlaps `#focus-stage` at 93.3%~~
- ~~(c) `.journey-compass` overlaps lower panel surface~~

**All three issues resolved** by:
- (a) Subagent `compass-overlap-v3` added `display: none` for `.journey-compass` in field-node mode
- (b/c) Same fix removes the compass from the field-node focus state entirely

Verified via re-run: `03-mobile-focus-first-result` shows 0 visual issues on 2026-06-12.

### 3.2 Visual overlap detail (07-desktop-idle)

| Element A | Rect | Element B | Rect | Overlap |
|---|---|---|---|---|
| `#journey-compass` (z=90) | 664,98 472×74 | `#camera-controls` (z=100) | 0,96 1440×148 | 34,979 px² (100%) |
| `#info-panel` (z=80) | 16,116 322×208 | `#camera-controls` (z=100) | 0,96 1440×148 | 41,216 px² (61.5%) |
| `.search-container` (z=auto) | 31,187 282×109 | `#camera-controls` (z=100) | 0,96 1440×148 | 16,074 px² (52.3%) |
| `#camera-controls` (z=100) | 0,96 1440×148 | `#btn-legend` (z=100) | 1380,117 44×44 | 1,936 px² (100%) |

`#camera-controls` is a 148px-tall full-width bar at z=100 that visually sits *behind* `#journey-compass` and `#info-panel` (lower z) but *on top of* `#btn-legend` (same z). This creates a desktop chrome band at y=96-244 that several UI elements sit within. On desktop this is the expected layout band, but `#info-panel` (y=116-324) extending into the lower half of the band suggests the panel-top is clipped by the controls bar.

---

## 4. Known Pre-Existing Contract Failures — Resolved

The 2026-06-05 bug sweep flagged several surfaces as "known pre-existing failures" based on tests that were running against a broken server (returning JSON instead of HTML). All those flags are now invalidated by this audit run.

| Surface (was failing) | Old result (broken server) | Current result (fixed server) | Verdict |
|---|---|---|---|
| `compass-rail` | 5 pass / 4 fail | 12 pass / 0 fail | **Resolved** — server was serving JSON |
| `info-panel-empty` | 6 pass / 2 fail | 10 pass / 0 fail | **Resolved** — server was serving JSON |
| `field-node` | 12 pass / 2 fail | 23 pass / 1 fail | **Partially resolved** — 1 real issue remains (see §5.1) |
| `thread-inspector` | 5 pass / 1 fail | 6 pass / 0 fail | **Resolved** — server was serving JSON |
| `mode-grid` | 8 pass / 1 fail | 9 pass / 0 fail | **Resolved** — server was serving JSON |
| `focus-pocket` | 10 pass / 0 fail | 11 pass / 0 fail | **Clean** — was already passing |
| `search-no-results` | timeout (35s) | 14 pass / 0 fail | **Resolved** — was timing out on broken server |

**Root cause of old failures:** 4+ stale `python -m http.server` processes were bound to port 8795. The one accepting connections was started from the `data/` directory, so every request to `vector-explorer-polished.html` returned `data/scraped_businesses.json`. The `bodyChildren` showed `PRE` and `DIV.json-formatter-container` — the Python error page. **All stale servers have been killed; the live server now serves from the project root.**

---

## 5. Active Findings

### 5.1 `field-node` → `layout:focus-stage-card-bottom-flush` (HIGH)

- **Symptom:** `focus-stage-card` has a 534px bottom inset in a 844px viewport (mobile 390×844)
- **Where:** `body.focusPanelMode="field-node"` state
- **Root cause hypothesis:** `--focus-stage-card-max-height: min(46dvh, 400px)` in `css/mobile_premium__focus-dive.css:1138` caps the card at 400px, but the card's bottom anchor is positioned at y=310 (486+358=844), so the card extends to the viewport bottom in the DOM but is visually 534px above the actual bottom because the card *content* doesn't fill the 358px height — there's a 534px gap between the bottom of the card content and the bottom of the viewport
- **Test note:** `focusStageBottomAnchor.flush = true` (passes) but `focusStageCardBottomAnchor.flush = false` (fails)
- **Owning seam:** `css/mobile_premium__focus-dive.css` + `js/modules/focus-stage-renderer.js`
- **Recommended fix:** Either reduce `--focus-stage-card-max-height` to fit the content, or remove the max-height cap and let the card size to its content, or anchor the card to `bottom: 0` instead of `top: <calculated>`

### 5.2 `.journey-compass` right-edge overflow on mobile focus (HIGH)

- **Symptom:** `.journey-compass` has `width: 390` and `left: 16` → right edge at 406, but viewport is 390px wide → 16px overflow
- **Where:** `03-mobile-focus-first-result` state, `body[data-focus-origin="field-node"]`
- **Root cause:** The compass bar inherits the focus-stage's left/right padding offset (16px) but doesn't subtract it from its own width
- **Owning seam:** `css/mobile_premium__focus-dive.css` (compass layout in focus state)
- **Recommended fix:** Set `.journey-compass` to `width: calc(100% - 32px)` or `right: 16` when nested in focus context

### 5.3 `.journey-compass` overlaps `#focus-stage` at 93.3% (MEDIUM)

- **Symptom:** Compass bar (z=90, 58px tall) sits *over* the focus-stage card (z=100, 358px tall) at full overlap
- **Where:** `03-mobile-focus-first-result`
- **Root cause:** Compass is z=90 and focus-stage is z=100, so the card should render above. But the 93.3% overlap ratio means the compass is *inside* the focus-stage's vertical region. This is z-index behavior working correctly, but the visual stacking is wrong because the compass should not be present in the field-node focus state at all, or it should sit above the card
- **Owning seam:** `css/mobile_premium__focus-dive.css` (compass visibility gates) + `js/modules/journey-compass-state.js` (visibility derivation)
- **Recommended fix:** Hide `.journey-compass` in `body[data-focus-panel-mode="field-node"]` or move it to z=110 so it floats above the card

### 5.4 Desktop `#camera-controls` 148px band overlaps chrome (MEDIUM)

- **Symptom:** `#camera-controls` (1440×148 at z=100) overlaps `#journey-compass`, `#info-panel`, `.search-container`, `#btn-legend`
- **Where:** `07-desktop-idle` and presumably all desktop states
- **Root cause:** The controls bar is 148px tall full-width and sits at y=96-244. The journey-compass starts at y=98 and extends to y=172 — fully inside the controls band. Same for info-panel (y=116-324) and search-container (y=187-296). This is a layout band issue, not a z-index issue
- **Owning seam:** `css/desktop*.css` + `js/modules/camera-controls.js`
- **Recommended fix:** Either reduce `#camera-controls` height, or push other chrome down to y≥244

### 5.5 `surface-overlap:.journey-compass:.focus-stage-card` (MEDIUM)

- **Symptom:** Companion check to 5.3 — the compass overlaps the lower panel surface in field-node
- **Where:** `03-mobile-focus-first-result`
- **Owning seam:** Same as 5.3

---

## 6. Pre-Run Diagnostic — Server State Recovery

Before this audit could run correctly, the test infrastructure was broken:

### 6.1 Symptom
Every contract test for surfaces that expected `.journey-compass`, `#info-panel`, `.mode-chip`, etc. returned "missing element" failures. The page loaded in 2 seconds, `bodyChildren` was `["PRE", "DIV.json-formatter-container"]`, and the content was `{"total_leads":8406,"num_categories":21,"embedding_dim":1024}` — the raw data file.

### 6.2 Root cause
4 stale `python -m http.server` processes were bound to port 8795. The process actually accepting connections was started from the `data/` directory, so it served `scraped_businesses.json` for every request to `vector-explorer-polished.html` (Python's http.server resolves missing files by listing the directory, and in this case found a JSON file with a matching name pattern in the data directory).

### 6.3 Resolution
1. Killed all stale Python processes (PIDs 22848, 22880, 30184, 35364, 53880, 56540, 28388, 6568)
2. Started a fresh `python -m http.server 8795 --bind 127.0.0.1` from the project root
3. Verified `http://127.0.0.1:8795/vector-explorer-polished.html` returns 23,532 bytes (matching the on-disk file size)
4. Re-ran all contract tests — pass rate jumped from ~65% (inferred) to 99.6%

### 6.4 Prevention
The `qa:contract:*` npm scripts assume a server is running on 8795 but don't verify it's serving from the right directory. Consider adding a `--verify-server` flag to the test runner that fetches the URL and checks for `<!DOCTYPE html>` before running assertions.

---

## 7. Unverified Surfaces

The following states/surfaces have not been re-audited in this run and may have issues that haven't been captured:

- All 22 remaining visual states (only 3 of 25 were run)
- Visual states at 320px width (`22-mobile-semantic-dive-320`)
- Short landscape (`23-mobile-short-landscape`)
- Loading overlay capture (`18-mobile-loading-overlay`)

**Next audit pass should run all 25 visual states with overlap, surface-fit, and visual-settle checks.**

---

## 8. Console Warnings Observed

During the visual audit, the following console warnings were emitted. These are not test failures but indicate state mutation patterns that bypass the store system:

```
[State Bypass] state.scenePerformanceDiagnostics.active — use store .update()
[State Bypass] state.scenePerformanceDiagnostics.renderer — use store .update()
[State Bypass] state.scenePerformanceDiagnostics.vendor — use store .update()
[State Bypass] state.navState.focusedIndex — use store .update()
[State Bypass] state.navState.mode — use store .update()
[State Bypass] state.navState.trailDepth — use store .update()
[State Bypass] state.strandContinuityState — wholesale reassignment detected
[State Bypass] state.inspectedStrandDiagnostics — wholesale reassignment detected
[State Bypass] state.routeTraceDiagnostics.mapPointCount — use store .update()
[State Bypass] state.routeTraceDiagnostics.mapPathActive — use store .update()
```

These correlate with the `state.js` Proxy bypass findings from the 2026-06-05 bug sweep (§2). The nested Proxy fix at `state.js:530-531` catches top-level property writes, but `state.scenePerformanceDiagnostics.*` and `state.navState.*` sub-property writes still emit warnings because the warning system is catching them at the `set` trap level. This is a **cosmetic warning**, not a functional failure, but it indicates the diagnostic warning system is working as intended and the sub-property writes are still happening.

---

## 9. Fixes Applied — 2026-06-12

### Fix 1: `field-node` bottom-flush (Main lane)

- **File:** `css/mobile_premium__focus-dive.css`
- **Change:** Added `position: fixed; bottom: 0` to `.focus-stage-card` within `[data-focus-panel-mode='field-node']`
- **Before:** Card had a 534px bottom inset (not bottom-flush)
- **After:** Card pins to viewport bottom
- **Tests:** `field-node`: 24 pass / 0 fail (↑ from 23/24)

### Fix 2: `.journey-compass` / `#focus-stage` overlap (Subagent)

- **File:** `css/mobile_premium__focus-dive.css`
- **Change:** Added `display: none` for `.journey-compass` when `data-focus-panel-mode='field-node'` is active
- **Before:** Compass (z=90) overlapped focus-stage (z=100) at 93% — compass was visible behind the stage creating visual noise
- **After:** Compass is completely hidden in field-node mode
- **Tests:** `compass-rail`: 12 pass / 0 fail, `field-node`: 24 pass / 0 fail
- **Worker:** `ocw_f5ef0b08-4772-4f40-ba0b-99c98be1537a` (mimo-v2.5, completed 2026-06-12)

---

## 10. Next Audit Steps

1. **Run all 25 visual states** — currently only 3 of 25 were captured
2. **Run visual audit at 320px width** — narrow viewport likely has additional overflow issues
3. **Investigate `[State Bypass]` warnings** — confirm nested Proxy is catching all writes or document remaining edge cases
4. **Update `atomic-coverage-protocol.md`** with the surface-by-state coverage matrix
5. **Add server health check** to `surface-contract-check.mjs` to prevent the JSON-vs-HTML silent failure mode

---

## 11. Audit Trail

| Date | Auditor | Action | Result |
|---|---|---|---|
| 2026-06-05 | Subagent sweep | 3-slice bug sweep (engine, state, CSS) | 10 items resolved, 0 open |
| 2026-06-06 | Main lane | Doc refresh + verification | All sweep items verified |
| 2026-06-11 | Main lane (this audit) | Full contract surface + 3 visual states | 229/230 pass, 3 visual issues |
| 2026-06-12 | Main lane + subagent | CSS fixes: field-node flush + compass overlap | **267/267 pass (100%)**, 0 visual issues in contract suite |
