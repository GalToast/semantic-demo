# Semantic Demo Focus-Stage CSS Ownership Matrix

Status: active
Updated: 2026-06-03
Purpose: Track focus-stage CSS ownership across base/supporting modules plus the collapsed mobile premium owner, with a state-by-state owner map and safe migration sequence.

---

## Raw Match Counts by File

| File | focus-stage matches | Role |
|---|---|---|
| `css/mobile_premium.css` | 270 | Collapsed mobile focus-search, semantic-dive, active field-node composition, terminal focus-stage-card reduced-motion ownership, geometry corrections, and mobile focus-stage action/button primitives |
| `css/modules/focus_stage.css` | 83 | Focus-stage component module linked directly from the app shell |
| `css/journey_steps.css` | 80 | Step Inside, active-trail, state-machine surfaces |
| `css/animations.css` | 10 | Motion/reduced-motion focus-stage tail rules |
| `css/journey_active.css` | 5 | Active journey focus-stage coupling |
| `css/strands.css` | 5 | Mobile bottom sheet, mobile chrome, route surfaces |
| `css/progressive_disclosure.css` | 4 | Legacy visibility/show-hide; late cascade |
| `css/controls.css` | 2 | View toggle, journey btn primitives |
| `css/mobile_base.css` | 1 | Mobile focus/stepinside owner block |
| `css/base.css` | 1 | Base focus-stage primitive |

2026-05-28 guardrail pass (pre-collapse historical notes):
- `tests/css-ownership-check.mjs` now ratchets `.focus-stage-card` per-file selector counts.
- `tests/focus-stage-css-ownership-contract.mjs` now ratchets `strands.css` to its current focus-stage-card and journey-compass counts and blocks new unregistered geometry-owner files.
- First consolidation target completed: terminal mobile reduced-motion `.focus-stage-card` selectors moved from `mobile_premium_surfaces.css` to `mobile_premium_focus.css`.
- Second consolidation target completed: terminal mobile focus-search `.focus-stage-what`, `.focus-stage-journey.active`, and `.focus-stage-journey-btn` rules moved from `mobile_premium_surfaces.css` to `mobile_premium_focus.css`.
- Third consolidation target completed: redundant semantic-dive `.focus-stage-kicker`, `.focus-stage-actions`, and `.focus-stage-dive-btn` suppression removed from `mobile_premium_surfaces.css`; `mobile_premium_focus.css` remains the state-specific owner. Trail-control suppression stayed in surfaces pending a separate protected-exception pass.

2026-05-29 component-module pass:
- `css/modules/focus_stage.css` is now the app-shell linked component module for focus-stage base styling.
- The older blocked target was `css/focus_stage.css`; do not introduce that root-level file. Continue routing focus-stage consolidation through `css/modules/focus_stage.css` and keep the focus/mobile/short-landscape contracts green.

2026-06-01 mobile action primitive pass (pre-collapse historical notes):
- Mobile focus-stage action/button primitives moved from `css/mobile_premium_surfaces.css` to `css/mobile_premium_focus.css`.
- At the time, `tests/focus-stage-css-ownership-contract.mjs` guarded against reintroducing `.focus-stage-action-btn`, `.focus-thread-inspector-btn`, `.focus-stage-journey-btn`, or `.action-btn` primitive ownership in `mobile_premium_surfaces.css`.
- `css/mobile_premium_focus.css` then owned active mobile field-node journey-compass refinements; `css/mobile_premium_surfaces.css` kept non-active field-node and idle/search backstops.

2026-06-01 journey-compass focus/dive refinement pass (pre-collapse historical notes):
- Focus-search / semantic-dive `.journey-compass.glass-heavy`, compact `[data-density="compact"]`, compact rail, and title wrapping rules moved from `css/mobile_premium_surfaces.css` to `css/mobile_premium_focus.css`.
- `tests/css-ownership-check.mjs` now ratchets the moved selector counts: focus owns the extra focus/dive selectors, surfaces is reduced.
- At the time, `tests/focus-stage-css-ownership-contract.mjs` blocked those focus/dive compass fragments from returning to `mobile_premium_surfaces.css`.

2026-06-03 mobile premium collapse pass:
- The split mobile premium files were retired. Current mobile focus-stage edits belong in the matching named section inside `css/mobile_premium.css`; older pass notes above describe pre-collapse file movement.
- `tests/focus-stage-css-ownership-contract.mjs` now registers `css/mobile_premium.css` as the collapsed mobile focus-stage owner.

---

## State-by-State Owner Map

### State: `focus` (panelSurface="focus")

Primary owner: `css/journey_steps.css` — focus-stage base geometry, active trail styling.
Support: `css/clusters.css` (selected-card accent), `css/progressive_disclosure.css` (show/hide), `css/layout_base.css` (info-panel override for focus).
Legacy/dupe risk: `css/strands.css` (bottom sheet mobile overrides), `css/mobile_premium.css` (mobile composition).

Selectors in play:
- `.focus-stage`, `#focus-stage`
- `.focus-stage.active`
- `.focus-stage-card`, `.focus-stage-kicker`, `.focus-stage-name`
- `.focus-stage-dive-btn`
- `body[data-panel-surface="focus"] .focus-stage`
- `body[data-panel-surface="focus"] .selected-card`

Minimum verification: `npm run qa:contract:launch-focus` + `npm run qa:contract:focus-pocket`

---

### State: `focus-search` (panelSurface="focus-search")

Primary owner: `css/mobile_premium.css` — mobile focus-search composition.
Support: `css/journey_active.css` (field-node canopy HUD), `css/strands.css` (bottom sheet), `css/progressive_disclosure.css` (show/hide), `css/clusters.css` (selected-card accent).
Legacy/dupe risk: `css/journey_steps.css` (state-machine overrides), `css/layout_base.css` (info-panel override).

Selectors in play:
- `.focus-stage[data-focus-search]`
- `body[data-panel-surface="focus-search"] .focus-stage`
- `body[data-panel-surface="focus-search"] .focus-stage-card`
- `body[data-panel-surface="focus-search"] .focus-stage-kicker`
- `body[data-panel-surface="focus-search"] .focus-thread-inspector`
- `body[data-panel-surface="focus-search"][data-thread-inspect-surface="idle"] .focus-thread-inspector`

Minimum verification: `npm run qa:contract:focus-pocket` + `npm run qa:contract:field-node`

---

### State: `semantic-dive` (panelSurface="semantic-dive" + data-semantic-dive="active")

Primary owner: `css/mobile_premium.css` — semantic-dive mobile composition.
Support: `css/progressive_disclosure.css` (transition-only data-semantic-dive), `css/journey_active.css` (inside-status, inside-controls).
Legacy/dupe risk: `css/journey_steps.css` (Step Inside state machine), `css/strands.css` (mobile chrome).

Selectors in play:
- `.focus-stage-inside-status`, `#focus-stage-inside-status`
- `.focus-stage-inside-controls`, `#focus-stage-inside-controls`
- `body[data-panel-surface="semantic-dive"] .focus-stage`
- `body[data-semantic-dive="active"] .focus-stage`
- `body[data-semantic-dive="transitioning"] .focus-stage` (transition-only)

Minimum verification: `npm run qa:surface:focus` (state: `15-mobile-semantic-dive`)

---

### State: `map-focus` / `map-focus-search` (activeView="map" + panelSurface="map-focus/map-focus-search")

Primary owner: `css/clusters.css` — selected-card map-focus accent and trail-context overrides.
Support: `css/layout_base.css` — info-panel override for map-focus, compass visibility.
Legacy/dupe risk: `css/progressive_disclosure.css` (show/hide), `css/journey_steps.css` (focus-stage route dots).

Note: `data-graph-context` was removed from the CSS cascade (2026-05-28). All map-focus and map-focus-search rules now use `data-panel-surface="map-focus"` and `data-panel-surface="map-focus-search"` directly. The `data-graph-context` attribute is no longer used by any CSS rule.

Selectors in play:
- `body[data-panel-surface="map-focus"] .selected-card`
- `body[data-panel-surface="map-focus-search"] .selected-card`
- `body[data-panel-surface="map-focus"] .trail-controls`
- `body[data-panel-surface="map-focus-search"] .trail-context`
- `body[data-active-view="map"][data-panel-surface="map-focus"] .journey-compass`

Minimum verification: `npm run qa:contract:map-trail` + `npm run qa:surface:map-trail`

---

### State: `map-trail` (panelSurface="map-trail")

Primary owner: `css/layout_base.css` — selected-card, info-panel, trail-controls map-trail overrides.
Support: `css/clusters.css` (selected-card base accent), `css/strands.css` (bottom sheet chrome).
Legacy/dupe risk: `css/progressive_disclosure.css` (show/hide), `css/journey_active.css` (active trail styling).

Selectors in play:
- `body[data-panel-surface="map-trail"] .selected-card`
- `body[data-panel-surface="map-trail"] .info-panel`
- `body[data-panel-surface="map-trail"] .trail-controls`
- `body[data-panel-surface="map-trail"] .trail-context`
- `body[data-panel-surface="map-trail"] .selected-match-panel`
- `body[data-panel-surface="map-trail"] .selected-trivia`
- `body[data-panel-surface="map-trail"] .selected-hero`
- `body[data-panel-surface="map-trail"] .selected-meta-strip`
- `body[data-panel-surface="map-trail"] .badge-row`

Minimum verification: `npm run qa:contract:map-trail` + `npm run qa:surface:map-trail`

---

### State: `field-node` (focusPanelMode="field-node")

Primary owner: `css/journey_active.css` — field-node compact canopy HUD, walk dock.
Support: `css/mobile_premium.css` (mobile field-node composition), `css/strands.css` (bottom sheet).
Legacy/dupe risk: `css/progressive_disclosure.css` (show/hide), `css/journey_steps.css` (focus-stage state machine).

Selectors in play:
- `body[data-focus-panel-mode="field-node"] .journey-compass`
- `.focus-stage-card` (walk dock)
- `.focus-stage-journey.active`
- `.focus-stage-journey-meta`
- `.focus-stage-journey-kicker`
- `.focus-stage-neighbor-kicker`
- `.focus-stage-route-dot`
- `.focus-stage-next`
- `.focus-stage-actions`

Minimum verification: `npm run qa:contract:field-node`

**Journey-compass within field-node:**
`css/mobile_premium.css` owns active mobile field-node journey-compass refinements, focus-search/semantic-dive compact journey-compass overrides, non-active field-node fallbacks, and shared idle/search backstops.
`css/journey_active.css` owns `.journey-compass` base phase/density states (18 selectors).
`css/strands.css` owns field-node journey-compass action buttons (39 selectors total, field-node subset).
`css/layout_base.css` owns map-focus/trail journey-compass info-panel overrides (12 selectors).
Do not add journey-compass geometry to `css/journey_steps.css` — it has no journey-compass selectors and must stay that way.
Verification: `npm run qa:contract:field-node` + `rg -c 'journey-compass' css/mobile_premium.css`

---

### State: `reduced-motion` / `transition`

Primary owner: `css/animations.css` — final mobile/reduced-motion override tail.
Support: `css/clusters.css` (selected-card transition override), `css/progressive_disclosure.css` (show/hide transition-only).
Legacy/dupe risk: `css/layout_base.css` (transition properties on layout rules), `css/time_weather.css` (weather widget transitions).

Selectors in play:
- `@media (prefers-reduced-motion: reduce)` blocks in `css/clusters.css`
- `transition: none` overrides
- `body[data-panel-surface="focus"]` transition overrides
- `body[data-panel-surface="focus-search"]` transition overrides
- `transition: var(--transition-premium)` cascade variables

Minimum verification: `npm run qa:contract:mobile-idle` (state: `12-desktop-reduced-motion`, `13-mobile-reduced-motion`)

---

## Migration Sequence (Safe Slices)

The sequence is ordered by cascade depth and risk. Shallow/utility selectors first; late cascade overrides last. Do not skip slices.

### Slice 1 — `.focus-stage` base geometry (Easiest — highest consensus, lowest cascade depth)

**Files affected:** `css/journey_steps.css` (canonical), `css/clusters.css` (selected-card accent), `css/progressive_disclosure.css` (show/hide).
**Action:** Confirm `css/journey_steps.css` owns `.focus-stage` base; move duplicate `.focus-stage` resets from `css/clusters.css` and `css/progressive_disclosure.css` into the canonical file or remove them if identical.
**Verification:** `npm run qa:contract:launch-focus` + `npm run qa:surface:focus`
**Risk:** Low. Base geometry rarely changes.

### Slice 2 — `.focus-stage-card` and kicker/name (DONE 2026-06-01)

**Files affected:** `css/clusters.css` (canonical base), `css/mobile_premium.css` (mobile override and geometry corrections).
**Action:** Confirm `css/clusters.css` owns `.focus-stage-card` base; confirm `css/mobile_premium.css` owns mobile-specific overrides.
**Verification:** `npm run qa:contract:focus-pocket`
**Risk:** Low. Mobile-specific overrides are isolated to `css/mobile_premium.css`.

### Slice 3 — `field-node` canopy HUD (DONE 2026-06-01)

**Files affected:** `css/journey_active.css` (canonical), `css/mobile_premium.css` (mobile comp), `css/strands.css` (bottom sheet), `css/journey_steps.css` (state machine).
**Action:** Confirm `css/journey_active.css` owns `.journey-compass` field-node canopy HUD, `.focus-stage-journey.active`, `.focus-stage-journey-meta`, `.focus-stage-actions`. Move any duplicate `.focus-stage-actions` from `css/strands.css` into `css/journey_active.css`. Do not touch `css/journey_steps.css` state-machine selectors without live video proof.
**Verification:** `npm run qa:contract:field-node`
**Risk:** Medium. State machine in `journey_steps.css` has implicit ownership — verify before moving.

### Slice 4 — `semantic-dive` inside-status / inside-controls (Medium risk — active journey state)

**Files affected:** `css/journey_active.css` (canonical), `css/mobile_premium.css` (mobile comp), `css/progressive_disclosure.css` (transition-only data-semantic-dive).
**Action:** Confirm `css/journey_active.css` owns `#focus-stage-inside-status` and `#focus-stage-inside-controls`. Confirm `css/progressive_disclosure.css` only owns transition-only `data-semantic-dive` selectors — those must stay until transitions are de-duplicated in Slice 6. Do not move `data-semantic-dive="transitioning"` selectors yet.
**Verification:** `npm run qa:surface:focus` (state: `15-mobile-semantic-dive`)
**Risk:** Medium. `progressive_disclosure.css` may have implicit ownership of non-transition states.

### Slice 5 — `map-trail` selected-card and trail controls (Medium risk — selected-card cascade)

**Files affected:** `css/layout_base.css` (canonical for map-trail overrides), `css/clusters.css` (selected-card base accent), `css/strands.css` (bottom sheet chrome).
**Action:** Confirm `css/layout_base.css` owns `body[data-panel-surface="map-trail"] .selected-card` and trail-control overrides. Confirm `css/clusters.css` still owns the base selected-card accent. Remove any `css/strands.css` overrides that duplicate `layout_base.css` map-trail rules.
**Verification:** `npm run qa:contract:map-trail` + `npm run qa:surface:map-trail`
**Risk:** Medium. Selected-card cascade is deep — changing import order can silently break map-trail accent.

### Slice 6 — `reduced-motion` transition cleanup (Highest risk — cascades through all states)

**Files affected:** `css/animations.css` (canonical tail), `css/clusters.css` (selected-card transition override), `css/progressive_disclosure.css` (transition-only rules), `css/layout_base.css` (transition properties).
**Action:** Last slice. Confirm `css/animations.css` owns `@media (prefers-reduced-motion: reduce)` blocks and `transition: none` global overrides. Remove duplicate `transition: none` from `css/clusters.css` if they are identical. Verify `css/progressive_disclosure.css` only has transition-only rules (no permanent state rules). Requires `npm run check:cache` and reduced-motion visual proof.
**Verification:** `npm run qa:contract:mobile-idle` (states: `12-desktop-reduced-motion`, `13-mobile-reduced-motion`)
**Risk:** High. Transition cleanup cascades through all states. Do only after all other slices are verified.

---

## Active Worker Guard

The following workers own active seams and their files must not be edited until their diffs are reviewed:

- `semantic-gemma-fallback-followup-1779287625817` — Gemma/story fallback completeness
- `semantic-a11y-focus-followup-1779287626643` — Focus restoration and ARIA fixes for info panel, legend, controls
- `semantic-reduced-motion-interrupt-followup-1779287627752` — Reduced-motion interruption/recovery proof

Do not touch CSS files owned by these workers without switchboard coordination.

---

## Active Ownership Violations (pre-existing, 2026-05-20)

These violations exist in the baseline before any wave-2 surgery. They are tracked here so we do not introduce new violations while resolving duplicates.

| Violation | File | Baseline | Actual | Owner file |
|---|---|---|---|---|
| `.search-results.active` | `strands.css` | 13 | 14 | `search.css`, `journey_active.css`, `progressive_disclosure.css`, `strands.css`, `mobile_premium.css`, `animations.css` |
| `.search-results.active` | `animations.css` | 0 | 2 | Not an owner. Owned by `search.css`, `journey_active.css`, `progressive_disclosure.css`, `strands.css`, `mobile_premium.css`, `animations.css` |

**Resolution plan:**
- `strands.css` duplicate focus info-content `:has(.search-container.has-query)` selector arms: **Status: RESOLVED 2026-06-01.** The redundant `focus`, `focus-search`, and `semantic-dive` `:has()` selector arms were removed because the same declaration block is already owned by plain `data-panel-surface` selectors. `tests/css-ownership-check.mjs` now forbids reintroducing those exact selector arms.
- `animations.css` +2 over baseline: `html body[data-panel-surface="focus"] .search-results.active` / `focus-search` rules at lines 26–27. **Status: RESOLVED 2026-05-20 — baseline updated to `animations.css: 2` in `tests/css-ownership-check.mjs`.** These are properly owned by animations.css as reduced-motion-adjacent focus/search visibility overrides.

---

## Transient `data-semantic-dive="transitioning"` Guardrail

Added: 2026-05-28

`data-semantic-dive="transitioning"` is a time-boxed transition flag (set during the semantic-dive enter/exit animation window). It may own transient animation overrides but **NOT stable geometry** on focus-stage elements.

**Allowed under transitioning:** transient visual overrides only — `opacity`, `transform`, `pointer-events`, `backdrop-filter`, `transition`, `animation`.

**Forbidden under transitioning:** stable layout/geometry properties — `width`, `height`, `position`, `top`, `left`, `right`, `bottom`, `margin`, `padding`, `border`, `display`, `z-index`, `flex`, `grid`, `float`, `clear`, `overflow`.

**Rationale:** A transition flag that sets stable geometry would permanently affect panel dimensions after the transition ends — causing layout shift, clip, or occlusion that no other state would correct.

**Known compliant use:**
```css
/* animations.css — galaxy+transitioning window: restore full opacity during shake animation */
html body[data-active-view="galaxy"][data-semantic-dive="transitioning"] .focus-stage-card {
    opacity: 1;
    pointer-events: auto;
    transform: none;
    transition: none;
    backdrop-filter: none;
}
```

**Files that must never gain transitioning+stable-geometry combos:** all CSS files under the contract.

**Contract test:** `node tests/focus-stage-css-ownership-contract.mjs` — `transient transitioning-geometry guard: passed`

---

## Verification Commands

| Touched slice | Minimum check |
|---|---|
| Slice 1: `.focus-stage` base | `npm run qa:contract:launch-focus` + `npm run qa:surface:focus` |
| Slice 2: `.focus-stage-card` | `npm run qa:contract:focus-pocket` |
| Slice 3: `field-node` canopy | `npm run qa:contract:field-node` |
| Slice 4: `semantic-dive` inside | `npm run qa:surface:focus` (state `15-mobile-semantic-dive`) |
| Slice 5: `map-trail` selected-card | `npm run qa:contract:map-trail` + `npm run qa:surface:map-trail` |
| Slice 6: `reduced-motion` | `npm run qa:contract:mobile-idle` (states `12-desktop-reduced-motion`, `13-mobile-reduced-motion`) |

After any CSS change:
```
npm run build
git diff --check
```

### Journey-Compass Specific Verification

| Touched file | Command | Expected |
|---|---|---|
| `css/journey_active.css` journey-compass base | `rg -c '\.journey-compass' css/journey_active.css` | 18 |
| `css/mobile_premium.css` collapsed mobile owner | `rg -c 'journey-compass' css/mobile_premium.css` | ratcheted by `tests/css-ownership-check.mjs` |
| `css/strands.css` field-node actions | `rg -c '\.journey-compass' css/strands.css` | 39 |
| `css/layout_base.css` map-focus/trail | `rg -c '\.journey-compass' css/layout_base.css` | 12 |
| `css/mobile_base.css` early mobile | `rg -c '\.journey-compass' css/mobile_base.css` | 6 |
| `css/progressive_disclosure.css` show/hide | `rg -c '\.journey-compass' css/progressive_disclosure.css` | 2 |
| `css/animations.css` reduced-motion tail | `rg -c '\.journey-compass' css/animations.css` | 5 |
| `css/journey_steps.css` | `rg -c '\.journey-compass' css/journey_steps.css` | 0 (must stay 0) |

If `css/journey_steps.css` reports non-zero journey-compass selectors, that is a regression — journey-compass geometry must not be added there.

---

## Risks

1. **Cascade dependency**: `css/progressive_disclosure.css` has many focus-stage matches — many are show/hide that implicitly depend on later `css/mobile_premium.css` cascade order. Moving selectors before verifying the full mobile cascade can silently break visibility states.
2. **State-machine coupling**: `css/journey_steps.css` owns `.focus-stage-journey` state-machine selectors that are coupled to JS state flags (`data-trail-state`, `is-active`). Moving them without live video proof can break the Step Inside flow.
3. **Semantic-dive transition-only flag**: `data-semantic-dive="transitioning"` in `css/progressive_disclosure.css` is a transition-only attribute guard. Removing it before the transition de-dupe in Slice 6 will break the semantic-dive exit animation.
4. **Selected-card cascade depth**: `css/clusters.css` owns the base selected-card accent, but `css/layout_base.css` and `css/mobile_premium.css` both override it for specific states. Any re-ordering of these files in the cascade will silently change map-focus/map-trail accent behavior.
5. **Active workers**: The three follow-up workers listed above may be touching `css/progressive_disclosure.css`, `css/journey_active.css`, and `css/animations.css` during this migration. Check switchboard before committing slice changes.
