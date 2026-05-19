# mobile_premium_surfaces.css - Rule-by-Rule Shrink / Migration Plan

## Files Changed
None (this is a plan document only).

## Verification
```
rg -n "!important|journey-compass|focus-stage|search-results|info-panel|bottom-panel" \
  css/mobile_premium_surfaces.css css/mobile_premium_chrome.css css/mobile_premium_focus.css \
  css/mobile_premium_state.css css/mobile_premium_idle.css css/strands.css css/journey_active.css

rg -c "!important" css/mobile_premium_surfaces.css css/strands.css
```

## CSS Architecture Summary

The codebase has a multi-layer mobile CSS architecture. `mobile_premium_surfaces.css` is
documented as the "late harmonizer" - a single `@media (max-width: 768px)` block that
owns shared mobile app chrome, sheet chrome, focus-stage surface normalization, and
search-sheet layout while older modules migrate. It is loaded last.

```
Load order inside mobile_premium.css:
  mobile_premium_focus.css     - focus/dive composition
  mobile_premium_chrome.css    - search drawer, filters, map controls polish
  mobile_premium_state.css     - state ownership layer (idle, focus-search, map)
  mobile_premium_idle.css      - idle-only :has() cleanup
  mobile_premium_surfaces.css  - LATE HARMONIZER (this file, ~596 lines)
```

---

## Rule Classification

### 1. KEEP AS LATE HARMONIZER
Rules that belong in the late harmonizer because they harmonize cross-cutting concerns
that other files cannot cleanly own due to selector complexity or cascade position.

| Lines | Rule | Rationale |
|-------|------|-----------|
| 7-10 | `#selected-details.active { display: block; opacity: 1; }` | Generic panel activation. Short enough to stay. |
| 13-39 | `.journey-compass` glass base | Defines core glass morphology (backdrop, border, shadow, flex layout). Used as-is by field-node grid variants. |
| 41-49 | `.journey-compass-copy` | Column layout for compass text cell. Kept near compass base. |
| 51-61 | `.journey-compass-copy::after` | Technical separator pseudo-element. |
| 63-75 | `.journey-compass-kicker` | Label above title. Part of compass atom. |
| 78-87 | `.journey-compass-kicker::before` | Glowing status dot. Companion to kicker. |
| 89-93 | `body.searching .journey-compass-kicker::before` | Animated status pulse. State-dependent; fits here as harmonizer. |
| 95-98 | `@keyframes statusPulseRapid` | Animation for the above. |
| 100-104 | `@media (prefers-reduced-motion)` block for above | Motion safety. Appropriate in harmonizer. |
| 106-117 | `.journey-compass-title` | Title typography. |
| 119-125 | `.journey-compass-actions` | Actions row wrapper. |
| 127-142 | `.journey-compass-action` | Action button base styles. |
| 144-149 | `.journey-compass-action.primary` | Primary action gradient/border. |
| 151-155 | `.journey-compass-action:active` | Active press feedback. |
| 157-160 | `.journey-compass-note/.rail` hide | These elements are hidden by default; harmonizer manages visibility. |
| **342-379** | `data-focus-panel-mode="field-node"` journey-compass grid | Field-node specific layout (grid-template-columns, gap, min-width). Distinct variant that overrides generic compass in a specific mode. **Keep here.** |
| **381-407** | `data-panel-surface="idle"` journey-compass grid | Idle-specific compass layout variant. Distinct from field-node. **Keep here.** |
| 410-414 | `.focus-stage-route` | Route display. Part of focus stage atom. |
| 416-426 | `.focus-stage-route-dot` / `.is-current` | Route dots. Part of focus stage atom. |
| 429-457 | `.focus-stage-neighbors` / neighbor card | Neighbors list. Part of focus stage atom. |
| 460-465 | `.focus-stage-card::after` | Safe-area spacing buffer. Pure late harmonizer responsibility. |
| 467-471 | `data-panel-surface="semantic-dive"] #focus-stage` | Dive-state visibility override. |

---

### 2. MIGRATE TO `mobile_premium_chrome.css`
Search drawer polish rules that chrome.css already partially owns. These are Chrome-level
concerns, not harmonizer concerns.

| Lines | Rule | Rationale |
|-------|------|-----------|
| 483-485 | `data-panel-surface="search/focus-search" .info-panel { max-height }` | Search panel height. chrome.css already has search drawer styling. |
| 488-491 | `search/focus-search .info-content { padding, height }` | Search content spacing. Belongs in chrome. |
| 493-502 | `search/focus-search .info-header`, `.stat-caption` hide | Hiding header elements in search mode. Chrome concern. |
| 504-515 | `search/focus-search"][data-panel-surface-detail="peek"] .info-panel` height overrides | Peek mode info-panel geometry. Chrome concern. |
| 516-575 | All `peek` search-result-item overrides | chrome.css already styles search-results. These `!important` peek-mode overrides should migrate there. |
| 577-595 | `"expanded" .info-panel`, search-results layout | Expanded search mode geometry. Belongs in chrome. |

---

### 3. MIGRATE TO `mobile_premium_focus.css`
Focus-stage atom rules that focus.css already owns in a more organized way.

| Lines | Rule | Rationale |
|-------|------|-----------|
| 226-234 | `.focus-stage-kicker` | Focus stage typography. focus.css has its own `.focus-stage-kicker` definition. Consolidate there. |
| 236-242 | `.focus-stage-name` | Same. |
| 244-253 | `.focus-stage-what` | Same. |
| 267-273 | `.focus-stage-actions { display: grid !important }` | Grid layout for action buttons. focus.css has focused composition - this base belongs there. |
| 275-294 | `.focus-stage-action-btn` | Action button styling. Belongs in focus.css. |
| 297-312 | `.focus-stage-dive-btn` | Dive button. Belongs in focus.css. |
| 410-426 | `.focus-stage-route` / `.route-dot` | Already covered in harmonizer keep list above. |

---

### 4. MIGRATE TO `mobile_premium_state.css` / `idle`
State-specific visibility resets that state/idle already manages with cleaner selectors.

| Lines | Rule | Rationale |
|-------|------|-----------|
| 474-480 | Hide `.focus-stage-filed`, `.meta`, `.badges`, `.trivia` | "HIDE THE OLD MESS" - legacy cleanup. state.css is the canonical place for state-driven visibility rules. |
| 315-326 | `data-panel-surface:not([data-panel-surface^="map-"]) #trail-controls, .focus-stage-journey.active` | Trail/controls visibility. Belongs in state.css with other panel-surface rules. |

---

### 5. CANDIDATE DELETE (after computed-style proof required)
Rules that duplicate functionality proven to exist elsewhere, or that suppress legacy markup
with no evidence those legacy classes still exist in the DOM.

| Lines | Rule | Rationale for Delete Candidacy |
|-------|------|------------------------------|
| 463-471 | `html body.is-active[data-panel-surface="semantic-dive"] #focus-stage { display: block; opacity: 1; pointer-events: auto; }` | Semantic-dive owns focus-stage visibility. This rule seems to re-expose a hidden element. Check if `.focus-stage` is hidden elsewhere before surfacing it. **Needs computed-style verification.** |
| 329-340 | `.action-btn, .focus-stage-journey-btn` | Button reset. These element types may have their reset already in journey_active.css. Check for duplication. **Needs DOM audit.** |

---

## SPECIAL SECTION: `!important` Declarations (63 total in surfaces.css)

### Group A: Font/Typography Globals - BLOCKED (requires upstream harmonization first)
```
Lines 195:  font-family: var(--font-display, ...) !important  (info-panel *)
Lines 229-233: .focus-stage-kicker { font-size, font-weight, text-transform, letter-spacing, color } !important
Lines 238-241: .focus-stage-name { font-size, font-weight, line-height, color } !important
Lines 246-252: .focus-stage-what { font-size, line-height, color, display: -webkit-box, -webkit-line-clamp,
                                   -webkit-box-orient, overflow: hidden } !important
```
**Why they use !important:** Override an external/stylesheet that applies default typography.
**Why they cannot be removed locally yet:** Wave6/Wave7 confirmed these declarations are
still load-bearing against upstream focus-stage typography in `clusters.css`,
`progressive_disclosure.css`, and `strands.css`. Remove them only after those upstream
values are harmonized or scoped away from the premium mobile surfaces.

### Group B: Search Peek/Expanded Layout - BLOCKED (requires chrome/state scoping first)
```
Lines 485, 490-491, 496-502, 506-508, 513, 518, 523-530, 535-538, 557,
562-564, 569-574, 579-580
```
All `!important` overrides for `data-panel-surface-detail="peek"` and `"expanded"` states.
**Why they use !important:** chrome.css defines base search drawer styles, and surfaces.css
uses `!important` to force peek/expanded geometry overrides on top of those base rules.
**Why they cannot be removed locally yet:** `mobile_premium_chrome.css` and
`mobile_premium_state.css` still define base search drawer and `:has()` geometry that would
win or leak into peek/expanded states. Co-locate and scope those upstream rules first.

### Group C: Focus-Stage Actions Grid - BLOCKED (requires display ownership cleanup first)
```
Line 268:  display: grid !important  (.focus-stage-actions)
```
**Why it uses !important:** Ensures the action grid layout is not overridden by earlier rules.
**Why it cannot be removed locally yet:** Wave7 found the declaration is load-bearing.
Earlier rules in `progressive_disclosure.css`, `clusters.css`, `strands.css`, and
`journey_active.css` still compete with grid/flex/none ownership. See
`tmp/next-cleanup-workers/focus-stage-actions-owner-result.md`.

### Group D: Trail/Journey Active Display - BLOCKED (requires journey layout reconciliation first)
```
Lines 317-325:  .focus-stage-journey.active { display: flex !important; align-items, gap, margin,
                    padding, border-radius, background, border, height } !important
```
**Why it uses !important:** Forces journey block visibility in a specific state configuration.
**Why it cannot be removed locally yet:** Wave7 found `display: flex !important` is the
barrier preventing older `display: grid` rules from taking over the trail/journey bar.
Resolve `progressive_disclosure.css:934`, `journey_steps.css:160/837`, and
`strands.css:1454` while preserving semantic-dive suppression before removing it.

### Group E: Hide Legacy Elements - PARTLY RESOLVED
```
Line 479:  .focus-stage-filed, .focus-stage-meta, .focus-stage-badges, .focus-stage-trivia
           { display: none !important; }
```
**Why it uses !important:** Ensures legacy hidden elements stay hidden.
**Current status:** Wave4/Wave5 demoted the filed/meta legacy suppression to
`display:none` without `!important` and moved authoritative focus-search/semantic-dive
suppression to `mobile_premium_focus.css`. `#trail-controls:not(.active)` remains a
documented protected exception.

### Group F: ONE LEGITIMATE KEEP - Sheet Chrome Transition (strands.css conflict)
```
Line 188:  transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1) !important;
```
**Why it legitimately uses !important:** The comment at line 187 explicitly states:
"Retained: strands.css prefers-reduced-motion blanket override requires high precedence."
strands.css has a broad `transition-duration: 0.01ms !important` for reduced-motion users
across many selectors. The sheet chrome transition override uses `!important` to ensure
the sheet transform animation is explicitly controlled even under reduced-motion override.
**Recommendation:** Keep this one. Consider extracting it into a dedicated
`prefers-reduced-motion` override block in state.css instead, so the blanket strands.css
override doesn't need to be countered.

---

## Wave 4 Status (2026-05-19)

The following items from this plan are now resolved:

| Item | Status | Detail |
|------|--------|--------|
| Group E: Hide Legacy Elements (`!important` on `.focus-stage-filed/.meta/.badges/.trivia`) | **Resolved** | Demoted to `display:none` without `!important` at surfaces.css lines 490-494. `mobile_premium_focus.css` now owns authoritative suppression for focus-search and semantic-dive. Only `#trail-controls:not(.active)` retains `!important` in that block. |

### Wave 5 — Completed 2026-05-19

Completed and verified:
- `progressive_disclosure.css` legacy filed/meta suppression cleanup
- `journey_active.css` losing focus-search `.journey-compass-action` rule removal
- Docs sync for wave4/wave5 state

---

### Wave 6 — Completed 2026-05-19

**Conclusion: Zero safe local `!important` removals in surfaces.css.**

Analysis (`tmp/next-cleanup-workers/surfaces-important-debt-result.md`) confirmed every `!important` in surfaces.css is load-bearing against competing rules in `progressive_disclosure.css`, `clusters.css`, `strands.css`, `journey_active.css`, `mobile_premium_state.css`, and `mobile_premium_chrome.css`.

**Tentative unsafe removals were investigated and restored/not attempted.** No `!important` declarations were modified.

### Wave 7 — Completed 2026-05-19

Cross-file cascade resolution was delegated and verified from worker reports. **No source
CSS edits were accepted.** The remaining surfaces.css `!important` declarations are
load-bearing; local removal would change live mobile layout.

Reports:
- `tmp/next-cleanup-workers/focus-stage-actions-owner-result.md`
- `tmp/next-cleanup-workers/focus-stage-journey-owner-result.md`
- `tmp/next-cleanup-workers/important-debt-doc-contract-result.md`

**Upstream blockers that must be resolved before any surfaces.css `!important` can be safely removed:**

| Blocker Group | Upstream File | What It Does | Why It Blocks surfaces.css |
|---|---|---|---|
| `.focus-stage-actions` display conflict | `progressive_disclosure.css:186-188` | `display: grid` with `grid-template-columns: repeat(2, minmax(0, 1fr))` and `gap: 5px` | Other sheets set `flex`/`none`; `!important` is only thing keeping 2-column grid |
| `.focus-stage-actions` display conflict | `clusters.css:1240` | `display: flex` | Overrides grid |
| `.focus-stage-actions` display conflict | `strands.css:983` | `display: flex; flex-wrap: wrap` | Overrides grid |
| `.focus-stage-actions` display conflict | `journey_active.css:226,1651` | `display: none` in two contexts | Hides element |
| Focus-stage kicker typography | `clusters.css:916-919` | `font-size: 10px; text-transform: uppercase; letter-spacing: 1.2px` on `.focus-stage-kicker` | Overrides surfaces.css kicker values |
| Focus-stage kicker typography | `progressive_disclosure.css` | Varying sizes (7px–11px) across panel states | Overrides mobile values |
| Focus-stage name typography | `strands.css` | `color: rgba(255, 226, 132, 0.92)` for semantic-dive | Overrides name color |
| Focus-stage what typography | `progressive_disclosure.css` / other | `-webkit-line-clamp: 1` or `2` with different values | Overrides 2-line clamp |
| Search peek height | `layout_base.css` | `.info-panel { position: fixed; left: 16px; top: 80px; width: auto; }` with `[data-mobile-route-peek]` | Would collapse peek height to `auto` |
| Search peek overflow | `mobile_premium_state.css` | `padding: 16px` and `height: 100%` via `:has()` | Would leak scroll |
| Search container height | `mobile_premium_state.css` | `height: min(54vh, 456px)` via `:has()` | Would override peek fixed heights |
| Search peek chrome overrides | `mobile_premium_chrome.css:91-101` | `border-radius`, `border-color`, `background`, `box-shadow` on `.search-results.active` | Would override peek's fixed 56px constraints |
| Search peek result items | `mobile_premium_chrome.css:125` | `border-radius: 8px` on `.search-result-item` | Would override min-height/height |
| Search peek typography | `mobile_premium_state.css:137` (chrome.css) | `font-size: 15px` on `.top-result .search-result-name` | Would override peek 8px/13px |
| Search expanded height | `mobile_premium_state.css` | `height/max-height: min(54vh, 456px)` via `:has()` | Would override expanded 57dvh/480px |
| Semantic-dive journey suppression | `mobile_premium_focus.css:421` | `display: none` on `.focus-stage-journey.active` for semantic-dive | Correctly suppresses; wins via specificity over surfaces.css:316 flex |
| Semantic-dive journey display | `strands.css:1457` | `display: grid` on `.focus-stage-journey.active` | Loses to surfaces.css:316 `flex` via specificity — two attribute selectors vs. one |

**Only safe-to-keep `!important` in surfaces.css (documented exceptions):**
- Line 188: `.info-panel, .focus-stage-card { transition }` — defensive against `strands.css` prefers-reduced-motion blanket override
- Line 488: `#trail-controls:not(.active) { display: none !important }` — task-scoped protected exception; `mobile_premium_state.css:272` also sets `display: none` without `!important`

---

### Wave 8 — Superseded by Wave 11 (2026-05-19)

**See `semantic-demo-css-ownership-next-pass.md` Wave 11 section for corrected cascade analysis.** Wave 8 incorrectly characterized the `!important` mechanism. The actual win condition for `.focus-stage-journey.active` is specificity-based, not `!important`-based. See Wave 11 correction in the ownership doc.

### Wave 9 — Completed 2026-05-19

**Verified:** Active journey mobile surface no longer relies on the `display: flex !important` wall.

- `progressive_disclosure.css`: `display: grid` removed from `.focus-stage-journey.active` (~line 190). Upstream no longer sets `grid` on this selector.
- `mobile_premium_surfaces.css`: `.focus-stage-journey.active { display: flex !important }` → `display: flex` (no `!important`). `!important` no longer needed as barrier since upstream `display: grid` no longer competes.
- `mobile_premium_state.css`: redundant `.focus-stage-card` definition removed (was ~line 272).

### Wave 10 — Completed 2026-05-19

**Verified:** Focus/focus-search actions now have explicit display:grid guards.

- `progressive_disclosure.css`: `display: grid` now explicitly set on `.focus-stage-actions` at lines ~656 and ~836 (two `@media` breakpoints). This is the upstream guard — surfaces.css:268 `!important` is now redundant but retained defensively.
- `mobile_premium_surfaces.css`: `.focus-stage-filed/.meta/.badges/.trivia` `!important` fully demoted to `display:none` without `!important`; premium focus.css owns suppression.

**Residual seams:**
- `strands.css:1320-1321` sets `.focus-stage-actions` without explicit `display` — relies on progressive_disclosure.css cascade rather than setting `display: grid` explicitly
- surfaces.css:268 `.focus-stage-actions { display: grid !important }` — `!important` technically redundant but retained defensively pending live QA
- surfaces.css:488 `#trail-controls:not(.active) { display: none !important }` — protected legacy exception

**Post-Wave11 surfaces.css `!important` inventory (verified from live code inspection):**

| Selector | Line | !important | Status | Why Still Load-Bearing |
|---|---|---|---|---|
| `.focus-stage-actions` | 268 | `display: grid !important` | **Still needed** | `strands.css:983` sets bare `flex`; wins only via `!important` |
| `.focus-stage-action-btn` | 275-288 | Multiple | Still load-bearing | `clusters.css:982` and `progressive_disclosure.css` competing |
| `.focus-stage-dive-btn` | 297-312 | Multiple | Still load-bearing | `clusters.css:982` and `progressive_disclosure.css` competing |
| `#trail-controls:not(.active)` | 488 | `display: none !important` | Protected legacy exception | — |
| `.info-panel` transition | 188 | `!important` | Defensive; still needed | strands.css reduced-motion blanket override |

---

## Risks or Unresolved Issues

1. **Search peek/expanded !important cascade:** chrome.css defines base search drawer styles.
   surfaces.css uses `!important` to override them for peek/expanded states. If chrome.css
   is modified, surfaces.css rules will still win due to `!important`. The risk is that
   when these rules migrate to chrome.css, a specificity arms race could develop again.
   **Mitigation:** Migrate both base AND peek/expanded rules together to chrome.css so they
   are co-located and the peek/expanded rules naturally override the base via cascade.

2. **Group F (sheet chrome transition):** The strands.css reduced-motion blanket override
   (`transition-duration: 0.01ms !important`) conflicts with the sheet chrome transform
   transition. This is a documented conflict. The `!important` here is a band-aid for a
   cascade design problem in strands.css. **Long-term fix:** strands.css should scope its
   reduced-motion override to specific selectors rather than using a blanket `!important`.

3. **Field-node and idle compass grid variants (lines 342-407):** These use different
   grid-template-columns values than the base compass. They are correctly placed in the
   harmonizer as they override the base compass layout for specific panel modes. However,
   they represent a layering smell - they should ideally be in state.css where other
   `data-panel-surface` rules live. **Recommendation:** Evaluate moving these to
   state.css after the search peek/expanded rules are migrated, to see if state.css
   selector specificity is sufficient.

4. **Verify `.focus-stage-filed`, `.focus-stage-meta`, `.focus-stage-badges`, `.focus-stage-trivia`
   still exist in DOM** before committing the delete candidate for lines 474-480. The comment
   says "HIDE THE OLD MESS" - if these classes are genuinely removed from the markup,
   this rule is dead code and should be deleted rather than migrated.

5. **Journey_active.css (213 lines) vs mobile_premium_focus.css ownership split:**
   Both files style the same focus-stage/journey elements. The harmonizer imports rules that
   overlap with journey_active.css. A future consolidation pass should audit both files
   to eliminate duplication before any migration of focus-stage rules.
