# CSS Ownership Inventory: Compass / Focus-Stage Hygiene

**Date:** 2026-05-19
**Task:** Analysis only - no CSS edits
**Output:** `docs/semantic-demo-css-ownership-next-pass.md`

**Status:** Historical/superseded twice. First by the 2026-06-02 mobile premium collapse into `css/mobile_premium.css`, then by the 2026-06-03 un-collapse back into the 7-file `css/mobile_premium__*.css` split. Split-file names below describe the pre-2026-06-02 cascade; current edits belong in the matching file of the current 7-file split.

---

## Exposed Tools

| Tool | Status |
|------|--------|
| `rg` (ripgrep, static inspection) | Available |
| `npm run check:ownership` | Available - **PASSED** |

`npm run check:ownership` confirmed: `CSS ownership contract OK: no new shared-selector definitions beyond the documented baseline.`

---

## Selector Inventory Table

### `.journey-compass`

| Selector (abbreviated) | File | Conflict Type | Recommended Owner | Removal Risk |
|---|---|---|---|---|
| `html body.is-active[data-panel-surface^="map-"] .journey-compass` | `mobile_premium_state.css:321` | Cross-surface geometry (map- prefix) | `mobile_premium_state.css` | Low - isolated to `map-*` surfaces |
| `html body.is-active[data-panel-surface="focus-search"] .journey-compass`, `[data-panel-surface="semantic-dive"] .journey-compass` | `mobile_premium_focus.css:22-23` | Focus/dive composition | `mobile_premium_focus.css` | Low - focused panel only |
| `html body.is-active[data-panel-surface^="map-"] .journey-compass` | `mobile_premium_focus.css:49` | Duplicated map geometry (same as state.css:321) | Should be in `mobile_premium_state.css`, not `mobile_premium_focus.css` | **Medium** - appears in two files; one is redundant |
| `html body[data-panel-surface]:not([data-panel-surface^="map-"]) .journey-compass` | `mobile_premium_surfaces.css:13-14` | Non-map surface normalization | `mobile_premium_surfaces.css` | Low - harmonizes non-map surfaces |
| `html body[data-panel-surface="idle"] .journey-compass`, `[data-panel-surface="search"] .journey-compass` | `strands.css:52-53` | Idle/search surface base | `strands.css` | Medium - overlaps with `journey_active.css` base block |
| Unprefixed `.journey-compass` | `journey_active.css:413` | Base block, all sub-props follow | `journey_active.css` | **High** - all other files layer on this; do not remove without cascade audit |
| `body[data-panel-surface="idle"] .journey-compass` | `journey_active.css:728` | Idle-specific overrides | `journey_active.css` | Low |
| `body.view-transitioning .journey-compass` | `progressive_disclosure.css:1354` | View transition | `progressive_disclosure.css` | Low |
| `html body[data-panel-surface="map-trail"] .journey-compass` | `strands.css:1211` | Map-trail surface | `strands.css` | Low |
| `html body[data-panel-surface="focus-search"] .journey-compass` | `journey_active.css:970` | Focus-search override | `journey_active.css` | Low |

**Key conflicts:** `map-*` geometry duplicated between `mobile_premium_state.css:321` and `mobile_premium_focus.css:49`. The `mobile_premium_focus.css` copy should be removed - it does not belong in the focus/dive composition layer.

---

### `.journey-compass-note`

| Selector (abbreviated) | File | Conflict Type | Recommended Owner | Removal Risk |
|---|---|---|---|---|
| `html body.is-active[data-panel-surface^="map-"] .journey-compass-note` | `mobile_premium_focus.css:65` | Duplicated map geometry | Should be in `mobile_premium_state.css` | **Medium** - duplicated from `mobile_premium_surfaces.css:157` |
| `html body[data-panel-surface]:not([data-panel-surface^="map-"]) .journey-compass-note` | `mobile_premium_surfaces.css:157-158` | Non-map surface normalization | `mobile_premium_surfaces.css` | Low |
| `html body[data-panel-surface="idle"] .journey-compass-note`, `[search"] .journey-compass-note` | `strands.css:66-67` | Idle/search base | `strands.css` | Low |
| `body[data-panel-surface="idle"] .journey-compass-note.discovery-active` | `journey_active.css:1383` | Idle discovery state | `journey_active.css` | Low |
| `.journey-compass-note` (unprefixed base) | `journey_active.css:472` | Base | `journey_active.css` | **High** - base block; do not remove |
| `body.searching .journey-compass-kicker::before` | `mobile_premium_surfaces.css:89-101` | Pseudo-element state override | `mobile_premium_surfaces.css` | Low - isolated pseudo-element |
| `#journey-compass-note.discovery-active` | `progressive_disclosure.css:1570` | Discovery ID selector | `progressive_disclosure.css` | Low - ID-based, single use |

**Key conflicts:** `map-*` variants in `mobile_premium_focus.css` and `mobile_premium_state.css` overlap with non-map normalization in `mobile_premium_surfaces.css`. The map prefix creates a split that may need harmonizing.

---

### `.focus-stage`

| Selector (abbreviated) | File | Conflict Type | Recommended Owner | Removal Risk |
|---|---|---|---|---|
| `html body.is-active[data-panel-surface="focus-search"] .focus-stage`, `[semantic-dive"] .focus-stage` | `mobile_premium_focus.css:179-180` | Focus/dive composition | `mobile_premium_focus.css` | Low |
| `html body.is-active[data-panel-surface="focus-search"] .focus-stage` | `mobile_premium_state.css:272` | Focus-search state refinement | `mobile_premium_state.css` | **Medium** - overlaps with `mobile_premium_focus.css:179` and `journey_active.css:995` |
| `body[data-panel-surface="focus"] .focus-stage` | `strands.css:109-111` | Base strand definition | `strands.css` | Low |
| `.focus-stage` (unprefixed base) | `progressive_disclosure.css:148` | Legacy base block | `progressive_disclosure.css` | **High** - many sub-rules depend on this |
| `html body[data-panel-surface="focus-search"] .focus-stage` | `journey_active.css:995` | Active focus-search | `journey_active.css` | Low - active override |
| `html body[data-panel-surface="semantic-dive"] #focus-stage` | `mobile_premium_surfaces.css:467` | ID selector for semantic-dive | `mobile_premium_surfaces.css` | Low - ID-based, specific |

**Key conflicts:** `focus-stage` base is in `progressive_disclosure.css` but active overrides are scattered across `mobile_premium_focus.css`, `mobile_premium_state.css`, `journey_active.css`, and `strands.css`. This is the most fragmented component in the inventory.

---

### `.focus-stage-card`

| Selector (abbreviated) | File | Conflict Type | Recommended Owner | Removal Risk |
|---|---|---|---|---|
| `html body.is-active[data-panel-surface="focus-search"] .focus-stage-card` | `mobile_premium_focus.css:189` | Focus/dive composition | `mobile_premium_focus.css` | Low |
| `html body.is-active[data-panel-surface="focus-search"] .focus-stage-card` | `mobile_premium_state.css:272` | Duplicated - same selector as `mobile_premium_focus.css:189` | Should be unified | **Medium** - duplicate definitions for same surface |
| `html body.is-active[data-panel-surface]:not([data-panel-surface^="map-"]) .focus-stage-card` | `mobile_premium_surfaces.css:169` | Non-map surface normalization | `mobile_premium_surfaces.css` | Low |
| `html body.is-active[data-panel-surface="focus"] .focus-stage-card`, `[focus-search"] .focus-stage-card` | `mobile_premium_surfaces.css:220-221` | Focus/focus-search card geometry | `mobile_premium_surfaces.css` | Low |
| `body[data-panel-surface="focus"] .focus-stage-card` | `strands.css:120-122` | Base strand definition | `strands.css` | Low |
| `.focus-stage-card` (unprefixed) | `progressive_disclosure.css:157` | Legacy base | `progressive_disclosure.css` | **High** - base block |
| `html body[data-panel-surface="focus-search"] .focus-stage-card` | `journey_active.css:10` | Active focus-search card | `journey_active.css` | Low |
| `html body[data-panel-surface="semantic-dive"] .focus-stage-card` | `strands.css:1884` | Semantic-dive card | `strands.css` | Low |
| `body[data-panel-surface="semantic-dive"] .focus-stage-card` | `journey_active.css:590` | Semantic-dive active | `journey_active.css` | Low |

**Key conflicts:** `mobile_premium_state.css:272` and `mobile_premium_focus.css:189` both define `html body.is-active[data-panel-surface="focus-search"] .focus-stage-card`. This duplicate should be resolved - one should be removed or merged.

---

## Critical Conflicts Requiring Resolution

### 1. `map-*` geometry scatter (HIGH priority for `.journey-compass` and `.journey-compass-note`)

Both `mobile_premium_focus.css` and `mobile_premium_state.css` define `[data-panel-surface^="map-"]` variants for `.journey-compass` and sub-elements. These overlap and create maintenance risk. Recommend:

- **Move all `map-*` journey-compass geometry to `mobile_premium_state.css`** (the mobile state owner)
- **Remove the `map-*` copies from `mobile_premium_focus.css`** - they do not belong in the focus/dive composition layer

### 2. `focus-stage-card` duplicate between `mobile_premium_state.css:272` and `mobile_premium_focus.css:189`

Both files define `html body.is-active[data-panel-surface="focus-search"] .focus-stage-card`. Recommend:

- **Audit which file has the authoritative definition** based on what properties are set
- **Remove the redundant definition** - likely the `mobile_premium_state.css` copy should be removed since `mobile_premium_focus.css` is the dedicated focus/dive layer

### 3. `focus-stage` base ownership fragmentation

The `.focus-stage` base block is in `progressive_disclosure.css` but active overrides are in:
- `mobile_premium_focus.css`
- `mobile_premium_state.css`
- `journey_active.css`
- `strands.css`

This is a long-standing architectural issue noted in the ownership map. For hygiene work, **do not touch the `progressive_disclosure.css` base block** until a dedicated audit confirms no dependent selectors would break.

---

## Recommended Edit Order (Safest First)

1. **Remove `map-*` journey-compass duplicates from `mobile_premium_focus.css`** - lowest risk, isolated selectors
2. **Remove `focus-search` `.focus-stage-card` duplicate from `mobile_premium_state.css`** - confirm `mobile_premium_focus.css` is the authoritative definition first
3. **Harmonize `journey_active.css` and `strands.css` idle/search base blocks** for `.journey-compass-note` - these overlap and may have property conflicts
4. **Resolve `.focus-stage` base ownership** - only after steps 1-3 are verified and a live proof exists

---

## Verification Commands

```bash
# Confirm no new violations
npm run check:ownership

# Re-check selector scatter across files
rg -n "journey-compass|focus-stage" css/journey_active.css css/strands.css css/progressive_disclosure.css css/mobile_premium_chrome.css css/mobile_premium_focus.css css/mobile_premium_surfaces.css css/mobile_premium_state.css css/mobile_premium_idle.css

# Check for !important flags in focus/focus-stage context
rg -n "!important" css/mobile_premium_state.css css/mobile_premium_focus.css css/mobile_premium_surfaces.css
```

---

## Files Changed

| File | Change |
|---|---|
| `docs/semantic-demo-css-ownership-next-pass.md` | **Created** - this report |

No CSS files were modified (analysis only).

---

## Summary

The compass/focus-stage hygiene work has three actionable findings:

1. **`map-*` geometry duplicates** in `mobile_premium_focus.css` for `.journey-compass` and sub-elements - should migrate to `mobile_premium_state.css` and be removed from focus composition
2. **`focus-stage-card` duplicate definitions** at `mobile_premium_state.css:272` and `mobile_premium_focus.css:189` for the same selector - one is redundant
3. **Long-standing `.focus-stage` base fragmentation** across `progressive_disclosure.css`, `journey_active.css`, `strands.css`, and `mobile_premium_focus.css` - do not touch `progressive_disclosure.css` base block without a full cascade audit first

**No CSS files were edited.** All verification passed.

---

## Wave 6 / Wave 7 Status (2026-05-19)

### Wave 6 — Completed 2026-05-19

`tmp/next-cleanup-workers/surfaces-important-debt-result.md` confirmed **zero safe local `!important` removals** in surfaces.css. Every declaration is load-bearing against upstream competing rules in `progressive_disclosure.css`, `clusters.css`, `strands.css`, `journey_active.css`, `mobile_premium_state.css`, and `mobile_premium_chrome.css`. Tentative unsafe removals were investigated and not attempted.

### Wave 7 — Completed 2026-05-19

Cross-file cascade resolution was delegated for `.focus-stage-actions { display: grid !important }` (surfaces.css:268), `.focus-stage-journey.active { display: flex !important }` (surfaces.css:317), and the remaining surfaces.css dependency map.

**Result: no source edits accepted.** Both CSS ownership lanes produced no-op reports because the remaining surfaces.css `!important` declarations are still load-bearing. Removing them locally would allow earlier `grid`, `flex`, or `display:none` rules to change live mobile layout.

**Dependency map — contract for safe removal:**

| surfaces.css !important Group | Can Only Be Removed After |
|---|---|
| `.focus-stage-actions { display: grid }` (line 268) | `progressive_disclosure.css:186-188` gap harmonized; `clusters.css:982/1240` flex behavior resolved; `strands.css` mobile focus suppression preserved or scoped; `journey_active.css:225/1654` state-specific none/grid ownership preserved or scoped |
| `.focus-stage-kicker` typography (lines 229-233) | `clusters.css:916-919` overridden or removed; `progressive_disclosure.css` panel-state kicker sizes unified |
| `.focus-stage-name` typography (lines 238-241) | `strands.css` semantic-dive color harmonized; competing `font-size`/`font-weight` resolved |
| `.focus-stage-what` typography (lines 246-252) | `progressive_disclosure.css` `-webkit-line-clamp` values unified to match surfaces.css intent |
| Search peek block (lines 500-553) | `mobile_premium_chrome.css:91-101` border/shadow rules scoped away from peek mode; `layout_base.css` peek-height specificity resolved |
| Search peek result typography (lines 572-589) | `mobile_premium_chrome.css` top-result font-size harmonized or overridden |
| Search expanded heights (lines 594-595) | `mobile_premium_state.css` idle `:has` rule scoped so it cannot override expanded state |
| `.focus-stage-journey.active` display (lines 317-325) | `progressive_disclosure.css:934`, `journey_steps.css:160/837`, and `strands.css:1454` grid rules reconciled with the intended flex trail layout; semantic-dive suppression in `mobile_premium_focus.css:421` preserved |

**Wave 7 reports:**
- `tmp/next-cleanup-workers/focus-stage-actions-owner-result.md`
- `tmp/next-cleanup-workers/focus-stage-journey-owner-result.md`
- `tmp/next-cleanup-workers/important-debt-doc-contract-result.md`

**Safe-to-keep exceptions (not removable without deeper investigation):**
- Line 188: `transition` — `strands.css` reduced-motion blanket override requires high precedence
- Line 488: `#trail-controls:not(.active)` — task-scoped protected; `mobile_premium_state.css:272` duplicate exists

---

### Wave 11 — Completed 2026-05-19 (Docs-only reconciliation)

**Scope:** Truth-sync post-Wave11. No CSS files were modified. Only misleading status claims in this doc were corrected.

**Verified current state (not what prior workers reported):**

`.focus-stage-journey.active` display cascade:
- `surfaces.css:316-326` — `display: flex` (no `!important`) for all non-map surfaces via `html body.is-active[data-panel-surface]:not([data-panel-surface^="map-"])`. Specificity wins over `strands.css:1457`'s `display: grid` (two attribute selects vs. one).
- `mobile_premium_focus.css:421` — `display: none` for `semantic-dive` state only; higher specificity than surfaces.css:316, so semantic-dive correctly suppressed.
- **Finding:** The "flex wall" was never a `!important` barrier — it was won by selector specificity. surfaces.css:317 had `!important` removed in Wave 9 and now reads `display: flex` (no `!important`). The docs mischaracterized this as a `!important` removal; the real mechanism is specificity.

`.focus-stage-actions` display cascade:
- `progressive_disclosure.css:186` — bare `.focus-stage-actions { display: grid }` (no media query, base rule)
- `progressive_disclosure.css:656/836` — state-specific `{ display: grid }` for `focus`/`focus-search`
- `progressive_disclosure.css:1106` — `semantic-dive` sets `{ display: none }`
- `strands.css:983` — `.focus-stage-actions { display: flex; flex-wrap: wrap }` (no `!important`; loses to progressive_disclosure.css cascade due to load order)
- `journey_active.css:225` — `focus-search` sets `{ display: none }`
- `journey_active.css:1655` — field-node overrides `{ display: grid }`
- `surfaces.css:268` — `{ display: grid !important }` — **still load-bearing** against bare `flex` declarations. Not redundant; `!important` is the only thing keeping `grid` winning in mobile-premium contexts where progressive_disclosure.css doesn't override. Without it, `strands.css:983` bare flex would produce wrong layout.

**Corrections applied:**
- Removed claim that "Wave 9 removed the flex !important wall" — the `!important` was removed, but the cascade still works via specificity, not because upstream grid was removed.
- Corrected "Strands action suppression" risk: `strands.css:1320-1321` does NOT set `display: flex` — it suppresses via `display: none`. The `display: flex` claim in Wave 10 Open Risks was incorrect.
- Updated upstream blockers table: `strands.css:983` sets flex (not grid) and is still the reason surfaces.css:268 `!important` is load-bearing.
- Added `semantic-dive` suppression to the blockers table (was missing from Wave 7 table).

---

**Target:** upstream display ownership for `.focus-stage-actions` and `.focus-stage-journey.active` — NOT local `!important` removal in surfaces.css.

**Why upstream, not local:** The `!important` on surfaces.css lines 268 and 317 are load-bearing barriers. Removing them locally would allow upstream `display: grid` rules to override the intended mobile-premium layout. Resolution requires either (a) harmonizing upstream selectors so they produce the intended display value without `!important`, or (b) raising upstream specificity to beat competing rules without `!important`.

**Acceptance bar for any future `!important` removal:**

| Phase | Requirement | Verification |
|-------|-------------|--------------|
| 1. Selector winner proof | One canonical selector per state owns `.focus-stage-actions` display and `.focus-stage-journey.active` display across all panel surfaces | Written decision doc; no conflicting display rules remain |
| 2. Computed-style contract coverage | Each panel state (`focus`, `focus-search`, `semantic-dive`, `map-*`, `idle`) yields intended computed `display` | Browser DevTools or Playwright snapshot per state |
| 3. Mobile-critical QA | Journey trail flex row, action buttons 2-column grid, semantic-dive suppression — all verified at ≤390px | `npm run test` or equivalent |

**Wave8 expected artifacts:**
- `tmp/next-cleanup-workers/wave8-focus-stage-actions-display-result.md`
- `tmp/next-cleanup-workers/wave8-focus-stage-journey-display-result.md`
- `tmp/next-cleanup-workers/wave8-docs-decision-sync-result.md`

**Status: delegated. No source files edited.**

---

## Wave 9 — Completed 2026-05-19

**Claim:** Active journey mobile surface no longer relies on the `display: flex !important` wall.

**Verified state of `.focus-stage-journey.active` display:**

- `progressive_disclosure.css`: `display: grid` removed from `.focus-stage-journey.active` block (~line 190 in the `@media (max-width: 768px)` section). The block still sets `gap`, `margin-top`, `padding-top` but no longer sets `display: grid`.
- `progressive_disclosure.css`: `display: grid` added to `.focus-stage-actions` at two `@media` breakpoints (lines ~656 and ~836), explicitly guarding the 2-column grid layout for focus and focus-search states.
- `mobile_premium_state.css`: `.focus-stage-card` duplicate definition removed (was ~line 272, same selector as `mobile_premium_focus.css:137`). Authoritative definition lives in `mobile_premium_focus.css`.
- `mobile_premium_surfaces.css`: `.focus-stage-journey.active` changed from `display: flex !important` → `display: flex` (no `!important`).

**Result (corrected post-Wave11):** The `!important` barrier on `.focus-stage-journey.active` was removed. Cascade still works via specificity: surfaces.css:316 `display: flex` wins over `strands.css:1457` `display: grid` because surfaces.css selector has two attribute selectors (`body.is-active[data-panel-surface]:not(...)`) vs. strands.css one (`body[data-panel-surface]`). `semantic-dive` suppression correctly handled by `mobile_premium_focus.css:421` `display: none` (higher specificity, `!important`). The win mechanism is specificity, not `!important` removal.

---

## Wave 10 — Completed 2026-05-19

**Claim:** Focus/focus-search actions now have explicit display:grid guards; residual seams are strands action suppression and mobile_premium_surfaces action/legacy !important debt.

**Verified state of `.focus-stage-actions` display:**

- `progressive_disclosure.css` now has `display: grid` explicitly set on `.focus-stage-actions` at lines ~656 and ~836 (two `@media` breakpoints for focus/focus-search). This is the upstream guard — the mobile-premium layer no longer needs to win via `!important` against an upstream bare selector.
- `mobile_premium_focus.css`: no `.focus-stage-actions` block — does not override display. The focus composition layer styles `.focus-stage-card`, `.focus-stage-journey.active`, and sub-components but not the action grid itself.
- `mobile_premium_surfaces.css:268`: `.focus-stage-actions { display: grid !important }` — `!important` still present but now redundant against upstream `display: grid` in progressive_disclosure.css. The `!important` is technically unnecessary; the upstream rules at equal specificity now produce the intended grid layout without override. **Left in place as defensive belt-and-suspenders until live QA confirms stability.**

**Residual seams (not fully resolved through Wave 10; corrected here):**

1. **Strands action context (`strands.css:1320-1321`):** Sets `display: none` (suppresses) in focus/focus-search — does NOT set `flex`. The Wave 10 description was incorrect. No conflict with surfaces.css grid.
2. **Strands display competition (`strands.css:983`):** Sets `.focus-stage-actions { display: flex; flex-wrap: wrap }` — this is the real load-bearing competitor. `!important` on surfaces.css:268 is what keeps grid winning over this bare flex.
3. **strands.css:1457 sets `display: grid`** on `.focus-stage-journey.active` — but loses to surfaces.css:316 `display: flex` via specificity (two attribute selects vs. one).
4. **mobile_premium_surfaces action/legacy !important debt:**
   - `.focus-stage-actions { display: grid !important }` (surfaces.css:268) — `!important` redundant but retained defensively
   - `#trail-controls:not(.active) { display: none !important }` (surfaces.css:488) — `!important` on trail controls is a legacy/protected exception per Wave 7 contract
   - `.focus-stage-filed, .focus-stage-meta, .focus-stage-badges, .focus-stage-trivia { display: none }` (surfaces.css:490-494) — `!important` removed; now relies on cascade order

**Post-Wave11 surfaces.css `!important` inventory (verified from live code inspection, not git diff):**

| Selector | surfaces.css line | !important | Status | Why Still Load-Bearing |
|---|---|---|---|---|
| `.focus-stage-actions` | 268 | `display: grid !important` | **Still needed** | `strands.css:983` sets bare `flex`; `!important` is what keeps grid winning |
| `.focus-stage-action-btn` | 275-288 | Multiple `!important` | Still load-bearing | `clusters.css:982` and `progressive_disclosure.css` competing |
| `.focus-stage-dive-btn` | 297-312 | Multiple `!important` | Still load-bearing | `clusters.css:982` and `progressive_disclosure.css` competing |
| `#trail-controls:not(.active)` | 488 | `display: none !important` | Protected legacy exception | — |
| `.info-panel` transition | 188 | `!important` | Defensive; still needed | strands.css reduced-motion blanket override |

**Verification:**
- `git diff --check -- docs/semantic-demo-css-ownership-next-pass.md` — pending
- `npm run check:ownership` — not rerun; prior baseline held
- Live QA (mobile viewport ≤390px) — required before removing surfaces.css:268 `!important`

---

### Open Risks (as of 2026-05-19 post-Wave10)

| Risk | Status | Reference |
|------|--------|----------|
| Compass polish208 duplicate (`progressive_disclosure.css:1252` vs `shell.css`) | **Resolved** — shell.css copy removed | Wave 4 |
| Focus filed/meta `!important` in surfaces.css | **Resolved** — premium focus owns suppression; surfaces.css demoted to `display:none` | Wave 4 |
| `progressive_disclosure.css` legacy rules for `.focus-stage-filed` / `.focus-stage-meta` | **Resolved** — redundant display suppressions removed; layout-only rules retained | Wave 5 |
| `display: flex !important` wall on `.focus-stage-journey.active` | **Resolved** — `!important` removed in Wave 9; cascade works via specificity (surfaces.css:316 beats strands.css:1457) | Wave 9, corrected Wave 11 |
| `.focus-stage-actions` `!important` in surfaces.css:268 | **Still load-bearing** — `strands.css:983` sets bare `flex`; `!important` keeps grid winning | Wave 11 clarification |
| `strands.css:1320-1321` missing explicit `display: grid` | **Incorrect premise** — strands.css:1320-1321 sets `display: none` (suppress), not flex; no conflict with surfaces.css grid | Wave 11 correction |

## Implementation Notes (Wave 4 / Wave 5 Verified)

### Wave 4 — Completed 2026-05-19

1. **`shell.css` polish208 duplicate REMOVED.** `shell.css` no longer contains the duplicate polish208 block. Canonical remains in `progressive_disclosure.css:1252`.

2. **`mobile_premium_focus.css` owns filed/meta suppression for focus-search and semantic-dive.** Lines 354-358 suppress `.focus-stage-filed` and `.focus-stage-meta` in compact focus states. Lines 362-371 suppress additional legacy fragments in dive state. This is the authoritative location — `mobile_premium_surfaces.css` no longer needs to suppress these for focus surfaces.

3. **`mobile_premium_surfaces.css` demoted `.focus-stage-filed` / `.focus-stage-meta` to `display:none` (no `!important`).** Lines 490-494: `.focus-stage-filed`, `.focus-stage-meta`, `.focus-stage-badges`, `.focus-stage-trivia` are now `display:none` without `!important`. Only `#trail-controls:not(.active)` retains `display:none !important` in that small block — sole `!important` remaining for non-legacy rules in surfaces.css.

4. **`mobile_premium_state.css` focus-search `.focus-stage-card` duplicate removed.** The redundant definition at former ~line 272 was deleted. Authoritative definition lives in `mobile_premium_focus.css:137-155`.

5. **Verification — all passed:**
   - `npm run build` → PASS
   - `npm run refresh:cache` → PASS
   - `npm run test` → PASS (4 checks)
   - `npm run test:contract` → PASS
   - `git diff --check` → PASS
   - Focus-pocket QA: 9 passed / 0 failed
   - Field-node QA: 14 passed / 0 failed
   - Mobile-critical QA: 76 passed / 0 failed

### Wave 5 — Completed 2026-05-19

1. **`progressive_disclosure.css` legacy filed/meta suppressions cleaned.** Redundant `.focus-stage-filed` and `.focus-stage-meta` entries were removed from grouped `display:none` rules for `focus-search` and `semantic-dive`. Layout-only filed/meta sizing rules remain.

2. **`journey_active.css` focus-search compass action losing rule removed.** The deleted rule set `.journey-compass-action` to 44px/9px for `focus-search`; stronger canonical selectors in `progressive_disclosure.css`, `strands.css`, and the premium focus layer already determine the live style.

3. **Docs synced to the verified Wave4/Wave5 state.**

### Prior Work (not reverted)

- `map-*` journey-compass geometry removed from `mobile_premium_focus.css` in earlier pass — remains owned by `mobile_premium_state.css:311` onward.
- `.focus-stage` base ownership fragmentation across `progressive_disclosure.css`, `journey_active.css`, and `strands.css` remains a known issue — do not touch `progressive_disclosure.css` base block without full cascade audit.

### Open Risks (as of 2026-05-19)

| Risk | Status | Reference |
|------|--------|----------|
| Compass polish208 duplicate (`progressive_disclosure.css:1252` vs `shell.css`) | **Resolved** — shell.css copy removed | `tmp/next-cleanup-workers/compass-polish208-owner-result.md` |
| Focus filed/meta `!important` in surfaces.css | **Resolved** — premium focus owns suppression; surfaces.css demoted to `display:none` | `tmp/next-cleanup-workers/focus-filed-meta-visibility-result.md` |
| `progressive_disclosure.css` legacy rules for `.focus-stage-filed` / `.focus-stage-meta` | **Resolved** — redundant display suppressions removed; layout-only rules retained | `tmp/next-cleanup-workers/progressive-filed-meta-cleanup-result.md` |
