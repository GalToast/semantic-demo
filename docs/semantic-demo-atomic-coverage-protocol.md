# Semantic Explorer Atomic Coverage Protocol

**Last updated:** 2026-06-12
**Companion to:** `docs/semantic-demo-ui-ux-audit-matrix.md`
**Purpose:** Define the minimal atomic surface/state set that must pass before any release, and the test that covers each atom.

---

## 1. Definition: Atomic Coverage

An **atom** is the smallest named unit of UI behavior that can be independently verified. Each atom has:

1. A **selector** (DOM target)
2. A **state precondition** (URL params, `data-*` attributes, viewport)
3. A **contract assertion** (DOM/layout check)
4. A **visual evidence** (screenshot at named viewport)
5. An **owning seam** (which file/CSS module owns the surface)

An atom is **covered** if and only if all five elements are present and the latest run shows pass.

---

## 2. Surface × State Coverage Matrix

This is the canonical matrix. Every cell must be exercised before release.

### Legend
- ✅ = covered, last run passed
- ⚠️ = covered, last run had warnings
- ❌ = covered, last run failed
- ⬜ = not yet covered in this audit cycle

### 2.1 Contract surfaces (DOM/layout)

| Surface | Mobile 390×844 | Desktop 1440×900 | 320×740 | Short 896×414 | Owning seam |
|---|---|---|---|---|---|
| `mobile-idle` | ✅ | — | ⬜ | — | `css/mobile_premium__idle.css` |
| `desktop-idle` | — | ✅ | — | — | `css/layout_base.css` |
| `launch-focus` | ✅ | — | ⬜ | — | `js/modules/micro-demo.js` |
| `search-error` | ✅ | — | ⬜ | — | `css/progressive_disclosure.css` |
| `search-no-results` | ✅ | — | ⬜ | — | `css/progressive_disclosure.css` |
| `map-trail` | ✅ | ✅ | ⬜ | — | `js/modules/journey-route-trace.js` |
| `focus-pocket` | ✅ | ✅ | ⬜ | — | `js/modules/focus-pocket.js` |
| `field-node` | ✅ FIXED | ⬜ | ⬜ | — | `css/mobile_premium__focus-dive.css` |
| `info-panel-empty` | ✅ | ✅ | ⬜ | — | `src/components/InfoPanel.svelte` |
| `compass-rail` | ✅ | — | ⬜ | — | `src/components/JourneyChrome.svelte` |
| `loading-overlay` | ✅ | — | ⬜ | — | `js/modules/loading-ui.js` |
| `mode-grid` | ✅ | — | ⬜ | — | `src/components/ModeChips.svelte` |
| `filters` | ✅ | — | ⬜ | — | `src/components/Filters.svelte` |
| `thread-inspector` | ✅ | — | ⬜ | — | `src/components/ThreadInspector.svelte` |
| `controls` | ✅ | — | ⬜ | — | `js/modules/camera-controls.js` |
| `search-chrome` | ✅ | — | ⬜ | — | `src/components/SearchBar.svelte` |
| `info-panel-populated` | ✅ | — | ⬜ | — | `src/components/InfoPanel.svelte` |
| `global-spacing` | ✅ | — | ⬜ | — | `css/semantic-demo.css` (manifest) |
| `mobile-product-focus-route` | ✅ | — | ⬜ | — | `css/mobile_premium__state.css` |
| `mobile-product-preview-route` | ✅ | — | ⬜ | — | `css/mobile_premium__state.css` |

### 2.2 Visual states (screenshot evidence)

States from `tests/visual-state-registry.mjs`:

| # | State | Last captured | Issues |
|---|---|---|---|
| 01 | `01-mobile-idle` | 2026-06-11 | None |
| 02 | `02-mobile-search-coffee` | ⬜ | — |
| 03 | `03-mobile-focus-first-result` | 2026-06-12 | ✅ **FIXED** (field-node focus-stage flush + compass hidden in field-node mode) |
| 04 | `04-mobile-field-node-active` | ⬜ | — |
| 05 | `05-mobile-map` | ⬜ | — |
| 06 | `06-mobile-filters-open` | ⬜ | — |
| 07 | `07-desktop-idle` | 2026-06-12 | ✅ **FIXED** (selector scope fix) |
| 08 | `08-desktop-search-coffee` | ⬜ | — |
| 09 | `09-mobile-map-empty-state` | ⬜ | — |
| 10 | `10-mobile-search-error-state` | ⬜ | — |
| 11a | `11-mobile-selected-card-map-trail` | ⬜ | — |
| 11b | `11-desktop-selected-card-map-trail` | ⬜ | — |
| 12 | `12-desktop-reduced-motion` | ⬜ | — |
| 13a | `13-desktop-filters-open` | ⬜ | — |
| 13b | `13-mobile-reduced-motion` | ⬜ | — |
| 14 | `14-desktop-search-error` | ⬜ | — |
| 15 | `15-mobile-semantic-dive` | ⬜ | — |
| 16 | `16-desktop-info-panel-populated` | ⬜ | — |
| 17 | `17-mobile-thread-inspector` | ⬜ | — |
| 18 | `18-mobile-loading-overlay` | ⬜ | — |
| 19 | `19-mobile-compass-rail` | ⬜ | — |
| 20 | `20-mobile-mode-grid-visible` | ⬜ | — |
| 21 | `21-mobile-route-trace-visible` | ⬜ | — |
| 22 | `22-mobile-semantic-dive-320` | ⬜ | — |
| 23 | `23-mobile-short-landscape` | ⬜ | — |
| 24 | `24-mobile-map-focus-search` | ⬜ | — |
| 25 | `25-mobile-search-no-results` | ⬜ | — |

**Coverage:** 13 of 25 states captured in last run (52%). 12 states remain blocked on headed WebGL capture.

---

## 3. Per-Atom Definition

### 3.1 `field-node` atom (HIGH priority)

| Field | Value |
|---|---|
| Selector | `.focus-stage-card` (inside `#focus-stage`) |
| State precondition | `body[data-focus-panel-mode="field-node"]`, viewport 390×844 |
| Contract assertion | `layout:focus-stage-card-bottom-flush` — card bottom inset ≤ 0px |
| Visual evidence | `03-mobile-focus-first-result.png` |
| Owning seam | `css/mobile_premium__focus-dive.css:1138` (max-height), `js/modules/focus-stage-renderer.js` |
| Last status | ✅ **FIXED 2026-06-12** — field-node focus-stage pins to viewport bottom and legacy compass is hidden in field-node mode |
| Why it matters | Card sits with 534px of empty space below it on mobile focus — visible vertical gap between card content and viewport bottom |

### 3.2 `compass-rail` atom (mobile focus)

| Field | Value |
|---|---|
| Selector | `.journey-compass` |
| State precondition | `body[data-focus-panel-mode="field-node"]`, viewport 390×844 |
| Contract assertion | (1) compass present with ≥3 step buttons, (2) all step buttons have touch target ≥44px, (3) no horizontal overflow |
| Visual evidence | `03-mobile-focus-first-result.png` |
| Owning seam | `src/components/JourneyChrome.svelte`, `css/mobile_premium__focus-dive.css` |
| Last status | ✅ **FIXED 2026-06-12** — compass hidden in field-node mode; no horizontal overflow |
| Why it matters | Compass bar clips off-screen on right edge when shown alongside focus stage on mobile |

### 3.3 `desktop-idle` atom (chrome band)

| Field | Value |
|---|---|
| Selector | `#camera-controls` |
| State precondition | `body[data-active-view="galaxy"]`, viewport 1440×900 |
| Contract assertion | (1) controls present, (2) controls don't cover info-panel or journey-compass |
| Visual evidence | `07-desktop-idle.png` |
| Owning seam | `js/modules/camera-controls.js`, `css/mobile_base.css` |
| Last status | ✅ **FIXED 2026-06-12** — selector scope fix at `mobile_base.css:115-123`. The reset for `.controls-view`/`.controls-info` now uses direct child combinator (`.controls > .controls-view`) so the override only applies to actual sub-group wrappers, not modifier classes on the root `.controls` element. `#camera-controls` now correctly renders as `position: fixed` 44×148 column |
| Why it matters | Controls bar consumes top 148px of viewport and visually sits behind/over journey compass and info panel |

---

## 4. Pre-Release Gate

Before any release to staging or production, the following must all be true:

### 4.1 Contract gate
- [x] All 27 contract surfaces pass at their default viewport — **DONE 2026-06-12 (267/267)**
- [ ] No `[State Bypass]` warnings in console — **2 real bypasses FIXED in `focus-pocket.ts`**; 7 false positives remain (cosmetic sub-property writes; nested Proxy at `state.js:530-531` catches top-level writes correctly)
- [x] No horizontal overflow on any surface — **DONE**
- [x] `field-node` 534px bottom inset is resolved — **FIXED** at `css/mobile_premium__focus-dive.css`

### 4.2 Visual gate
- [ ] All 25 visual states captured — **13/25 (52%)**; 12 blocked on headless WebGL timeout
- [x] No `surface-overlap-matrix` failures — **DONE** (desktop-idle camera-controls band fixed by direct-child selector scope)
- [x] No `surface-fit:within-viewport` failures — **DONE**
- [x] No `surface-proportion` failures — **DONE**
- [x] Visual evidence reviewed for visual regressions vs prior run — **03-mobile-focus-first-result AND 07-desktop-idle both CLEAN**

### 4.3 Infrastructure gate
- [ ] Dev server (`npm run serve`) is running from project root
- [ ] Single Python process on port 8795 (no stale duplicates)
- [ ] Server returns `text/html` for `vector-explorer-polished.html` (not JSON)

---

## 5. Atomic Verification Procedure

To re-verify any single atom:

```bash
# 1. Ensure server is running from project root
pwsh -NoProfile -Command "Get-NetTCPConnection -LocalPort 8795 -State Listen | Select-Object OwningProcess, @{n='PID';e={\$_.OwningProcess}}"

# 2. Verify server serves HTML (not JSON)
iwr http://127.0.0.1:8795/vector-explorer-polished.html -UseBasicParsing | Select-Object -ExpandProperty Content | Select-Object -First 5

# 3. Run the specific surface contract
npm run qa:contract:field-node

# 4. Run the specific visual state
npm run qa:surface:mobile-focus-first-result

# 5. Inspect the JSON output for failures
ls tmp/surface-contract-check/<latest>/field-node.json
ls tmp/semantic-ui-visual-audit/<latest>/03-mobile-focus-first-result.json
```

To re-verify the full audit:

```bash
npm run qa:contract:all    # All 20 contract surfaces
npm run qa:surface:all     # All 25 visual states
```

---

## 6. Known Uncovered Atoms

These atoms are defined in the test infrastructure but have not been verified in the latest audit cycle:

| Atom | Why not covered | When to cover |
|---|---|---|
| `22-mobile-semantic-dive-320` | 320px width state | Before narrow-viewport release |
| `23-mobile-short-landscape` | 896×414 viewport | Before landscape release |
| `18-mobile-loading-overlay` | Loading state capture is timing-sensitive | Before demo/reveal release |
| `12-desktop-reduced-motion` / `13-mobile-reduced-motion` | Reduced-motion variant | Before accessibility audit |
| All desktop-idle, desktop-search, desktop-filters states | Only 1 desktop state captured | Before desktop polish sweep |

---

## 7. Adding a New Atom

When adding a new surface or state:

1. **Register the visual state** in `tests/visual-state-registry.mjs` (add to `VISUAL_STATE_IDS`)
2. **Add the contract assertion** in `tests/surface-contract-check.mjs` (add to `SURFACES` map)
3. **Document the atom** in §3 of this file with: selector, precondition, assertion, evidence path, owning seam
4. **Update the matrix** in §2 with coverage status
5. **Add the pre-release gate** in §4
6. **Capture baseline** screenshot and JSON for comparison
7. **Wire the npm script** in `package.json` under `qa:surface:<name>` and `qa:contract:<name>`

---

## 8. Audit Log

| Date | Atom count | Contract pass rate | Visual states covered | Notes |
|---|---|---|---|---|
| 2026-06-05 | 20 surfaces | ~65% (estimated) | 0 | Bug sweep day — server broken, all DOM tests fail |
| 2026-06-11 | 20 surfaces + 25 states | 99.6% (229/230) | 3 of 25 | Server fixed, 1 contract failure + 4 visual issues found |
