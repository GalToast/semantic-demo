# Semantic Demo Repo Health - Checkpoint

**Date:** 2026-05-19
**Status:** Docs, contracts, cache busters, and mobile-critical surface checks are consistent after the latest cleanup pass.

---

## Doc Inventory

| File | Scope | Consistent? |
|------|-------|-------------|
| `docs/semantic-demo-css-archaeology-cleanup.md` | CSS duplicate ownership, polish markers, cascade layer map | Yes |
| `docs/semantic-demo-js-demonolith-plan.md` | JS module extraction seams in `lifecycle.js`, `journey.js` | Yes |
| `docs/semantic-demo-mobile-state-ownership.md` | `data-*` body attribute ownership matrix | Yes |
| `docs/semantic-demo-qa-scripts.md` | Surface contract script inventory | Yes |
| `docs/semantic-demo-css-ownership-next-pass.md` | CSS cleanup next-pass worklist | Yes |
| `docs/semantic-demo-js-first-extraction-brief.md` | First JS extraction brief and acceptance criteria | Yes |
| `docs/semantic-demo-mobile-surfaces-shrink-plan.md` | Mobile surfaces shrink plan | Yes |
| `docs/semantic-demo-noncritical-surface-triage.md` | Noncritical surface follow-up triage | Yes |

---

## Cross-Link Audit

**Present:**
- `mobile-state-ownership.md` <-> `css-ownership-map.md` - `data-panel-surface` and `data-focus-panel-mode` attributes reference CSS owners in ownership map.
- `css-archaeology-cleanup.md` -> `mobile_premium_focus.css`, `mobile_premium_state.css` - references cascade-layer roles documented in `css-ownership-map.md`.
- `qa-scripts.md` surface list (`mobile-idle, search-chrome, focus-pocket, map-trail, controls, field-node, compass-rail`) exactly matches `package.json` `qa:contract:mobile-critical` script.

**Missing links (not errors, but useful):**
- `mobile-state-ownership.md` does not cross-reference `css-archaeology-cleanup.md` even though both document `data-focus-panel-mode="field-node"` - the attribute writer (lifecycle.js) and CSS consumer (journey_active.css polish blocks) are in separate docs.
- `js-demonolith-plan.md` Module C (Journey Compass State Machine) operates on `data-journey-phase` and `data-focus-panel-mode` - these attributes are documented in `mobile-state-ownership.md` but the two docs do not cross-reference.

**No broken links found.** No doc references a file, line, or attribute that doesn't exist.

---

## package.json vs qa-scripts.md Alignment

| Script | package.json | qa-scripts.md | Match? |
|--------|-------------|---------------|--------|
| `qa:contract:mobile-critical` | `--surfaces=mobile-idle,search-chrome,focus-pocket,map-trail,controls,field-node,compass-rail` | Same 7 surfaces, 390x844 mobile | Exact |
| `qa:contract:mobile-chrome` | `--surface=search-chrome` | Same | Exact |
| `qa:contract:all` | all 16 surfaces | "all surfaces" (concise) | Consistent |

`test:contract` in package.json lists 21 individual contract scripts; `qa-scripts.md` documents the surface-level contract scripts only - scope division is intentional.

---

## Verification

```
npm run build            PASS - dist/bundle.js rebuilt
npm run test:contract    PASS - all Node/module contracts pass
npm run check:ownership   PASS - no new shared-selector definitions beyond baseline
npm run check:manifest    PASS - semantic-demo.css and mobile_premium.css are import shells
npm run check:cache       PASS - cache busters consistent
npm run check:shell       PASS - vector-explorer-polished.html is only app shell
npm run test              PASS - all four checks pass
git diff --check          PASS - whitespace check passes; CRLF warnings only
npm run qa:contract:mobile-critical PASS - 76 passed, 0 failed, 0 overflow failures
```

`rg -n "mobile-critical|state ownership|de-monolith|archaeology" docs package.json` returns correct cross-references only.

---

## Latest Cleanup Accepted (Wave 4 Verified)

- **`shell.css` polish208 duplicate REMOVED.** Canonical remains in `progressive_disclosure.css:1252`. `shell.css` no longer has a second copy.

- **`mobile_premium_focus.css` owns filed/meta suppression for focus-search and semantic-dive.** Lines 354-358 suppress `.focus-stage-filed` and `.focus-stage-meta` in compact focus states. `mobile_premium_surfaces.css` no longer needs to suppress these for focus surfaces.

- **`mobile_premium_surfaces.css` demoted `.focus-stage-filed` / `.focus-stage-meta` to `display:none` (no `!important`).** Only `#trail-controls:not(.active)` retains `display:none !important` in that small block — sole non-legacy `!important` remaining in surfaces.css.

- **`mobile_premium_state.css` focus-search `.focus-stage-card` duplicate removed.** Authoritative definition lives in `mobile_premium_focus.css:137-155`.

- **Semantic-lane extraction** (`lifecycle.js` → `js/modules/semantic-lane.js`) complete; all 10 contracts pass.

- **Journey text helpers extraction** (`journey-text-helpers.js`) complete; contracts guard both extraction and shared lead-id normalization.

- **Verification — all passed:**
  - `npm run build` → PASS
  - `npm run refresh:cache` → PASS
  - `npm run test` → PASS
  - `npm run test:contract` → PASS
  - `git diff --check` → PASS
  - `npm run qa:contract:mobile-critical` → 76 passed / 0 failed

---

## Wave 5 Status — Completed 2026-05-19

Completed lanes:
- `progressive_disclosure.css` legacy filed/meta suppression cleanup
- `journey_active.css` losing focus-search `.journey-compass-action` rule removal
- Docs sync for wave4/wave5 state

---

## Wave 11 — Completed 2026-05-19 (Docs-only)

**Scope:** Reconciled docs with post-Wave11 code truth. No CSS/JS files modified.

**Key corrections applied to `semantic-demo-css-ownership-next-pass.md` and `semantic-demo-mobile-surfaces-shrink-plan.md`:**

1. **`.focus-stage-journey.active` cascade (Wave 9 claim corrected):** The Wave 9 docs claimed `!important` was the win mechanism. Actual mechanism is specificity: surfaces.css:316 (`html body.is-active[data-panel-surface]:not([data-panel-surface^="map-"])`) has two attribute selectors; `strands.css:1457` (`html body[data-panel-surface]`) has one. surfaces.css wins without `!important`. `semantic-dive` suppression correctly handled by `mobile_premium_focus.css:421` `display: none !important`.

2. **`.focus-stage-actions` `!important` still load-bearing (Wave 10 claim corrected):** `strands.css:983` sets bare `display: flex`; this is the actual load-bearing competitor. `surfaces.css:268` `!important` is not redundant — removing it would let strands.css flex win.

3. **`strands.css:1320-1321` corrected:** Does NOT set flex; sets `display: none` (suppress context). The Wave 10 "strands action suppression" risk described the wrong mechanism.

4. **`semantic-dive` suppression added to blockers table:** `mobile_premium_focus.css:421` `display: none !important` for `.focus-stage-journey.active` in semantic-dive — was absent from Wave 7 blockers table.

**Docs changed:** `semantic-demo-css-ownership-next-pass.md`, `semantic-demo-mobile-surfaces-shrink-plan.md`. No source files touched.

---

## Open Risks

| Risk | Doc | Severity | Status |
|------|-----|----------|--------|
| Compass polish208 duplicate (`progressive_disclosure.css:1252` vs `shell.css`) | `compass-polish208-owner-result.md` | Medium | **Resolved** — shell.css copy removed in wave4 |
| Focus filed/meta `!important` in `mobile_premium_surfaces.css` | `focus-filed-meta-visibility-result.md` | High | **Resolved** — premium focus owns suppression; surfaces.css demoted to `display:none` |
| `progressive_disclosure.css` legacy rules for `.focus-stage-filed` / `.focus-stage-meta` | `progressive-filed-meta-cleanup-result.md` | Medium | **Resolved** — redundant display suppressions removed; layout-only rules retained |
| Atmospheric CSS (`progressive_disclosure.css:1350-1452`) may be dead if JS no longer sets `body.view-transitioning` | `css-archaeology-cleanup.md` section4G | High | Needs behavioral test before cleanup |
| `mobile_premium_surfaces.css:188` `!important` transition exception | `css-archaeology-cleanup.md` section3E | Low | **Resolved** — state-scoped cascade now wins without `!important` |
| Wave 9/Wave 10 mischaracterized `!important` mechanisms for `.focus-stage-journey.active` and `.focus-stage-actions` | `semantic-demo-css-ownership-next-pass.md` Wave 9/10 sections | High | **Corrected** in Wave 11 — see corrected status in ownership doc |

---

## Post-Wave12 Integration — Completed 2026-05-19

**Scope:** Finished the search-sheet CSS ownership seam, extracted journey compass state derivation, and hardened mobile surface QA against startup-phase sampling.

**Accepted source changes:**
- `mobile_premium_state.css` now owns mobile `search` / `focus-search` peek and expanded sheet geometry.
- `mobile_premium_surfaces.css` no longer carries the search override repair block; search-sheet rules moved without `!important`.
- `#trail-controls:not(.active)` suppression was converted from `display: none !important` to a higher-specificity normal cascade rule.
- `js/modules/journey-compass-state.js` now owns `getFocusedJourneyPoint()` and `getJourneyCompassState()`.
- `lifecycle.js` imports and re-exports the journey compass state helpers; `window.getJourneyCompassState` was removed 2026-05-25 (dewindowed; use lifecycle named export from `journey-compass-state.js`).
- `tests/journey-compass-state-contract.mjs` added and wired into `npm run test:contract`.
- `tests/surface-contract-check.mjs` waits for mobile idle chrome before asserting `chrome:info-panel`, avoiding false reads during startup recovery.

**Verification — all passed:**
```
npm run test                         PASS
npm run test:contract                PASS
git diff --check                     PASS
npm run qa:contract:search-chrome    PASS - 13 passed / 0 failed
npm run qa:contract:mobile-idle      PASS - 9 passed / 0 failed
npm run qa:contract:mobile-critical  PASS - 80 passed / 0 failed
```

**Remaining known debt:**
- `mobile_premium_surfaces.css` has 0 `!important` declarations. The former 48 focus typography/action/sheet declarations were converted to state-scoped selectors and verified against focus-pocket, field-node, and mobile-critical contracts.
- Repo-wide CSS now has only the intentional reduced-motion `!important` declarations in `strands.css` (`animation` / `transition` suppression for user preference compliance).
- Semantic search backend/readiness remains a product-health seam separate from CSS ownership; prior visual QA saw WebGL render correctly while semantic search readiness was degraded.

---

## Important Debt Cleanup — Completed 2026-05-19

**Scope:** Removed the remaining 48 `!important` declarations from `mobile_premium_surfaces.css`.

**Accepted source changes:**
- Converted focus content rules (`.focus-stage-kicker`, `.focus-stage-name`, `.focus-stage-what`) from bare class selectors with `!important` to state-scoped selectors without flags.
- Converted focus action rules (`.focus-stage-actions`, `.focus-stage-action-btn`, `.focus-stage-dive-btn`) from bare class selectors with `!important` to state-scoped selectors without flags.
- Removed the root sheet transition `!important`; normal cascade now preserves the intended transition.
- Removed the global font reset `!important`; state-scoped specificity preserves the premium mobile font stack.

**Verification — all passed:**
```
npm run test                         PASS
npm run test:contract                PASS
git diff --check                     PASS
npm run qa:contract:focus-pocket     PASS - 11 passed / 0 failed
npm run qa:contract:field-node       PASS - 16 passed / 0 failed
npm run qa:contract:mobile-critical  PASS - 80 passed / 0 failed
Select-String css/mobile_premium_surfaces.css '!important'  PASS - 0 matches
Select-String css/*.css '!important'                        PASS - only strands.css reduced-motion exceptions
```
