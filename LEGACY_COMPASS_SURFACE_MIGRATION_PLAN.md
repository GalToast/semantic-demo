# LegacyCompassSurface.svelte Migration Plan

> **Component:** `src/components/LegacyCompassSurface.svelte` (570 lines, 20.9 KB)  
> **Purpose:** Renders the legacy-compatible DOM structure that replaces the imperative `semantic-dive-ui.js` builder. Provides parity with the legacy DOM IDs, data-* attributes, and click handlers expected by 6 CSS files, ~398 CSS lines, 145 test refs, and 14 source-file refs.  
> **Related audit:** `BODY_DATASET_IPC_AUDIT.md` — 67 body.dataset attributes (38 parity-owned, 29 bypass-owned)  
> **Component test:** `tests/unit-active/component-LegacyCompassSurface.test.ts`

---

## 1. DOM ID Inventory (14 rendered IDs)

The component renders **14 unique DOM IDs** in the template (plus 1 in the doc-comment example block). Below each ID is listed with its data-* attribute bindings and the stores/values it derives from.

| # | DOM ID | Element | data-* attrs set | Derived from |
|---|--------|---------|-----------------|-------------|
| 1 | `journey-compass` | `<section>` | `data-phase={phase}`, `data-density={density}`, `data-copy={copy}`, `data-actions={actionsProfile}`, `data-navigation-owner={navigationOwner}` | `compass.phase`, `presentation.density`, `presentation.copy`, `presentation.actions`, `presentation.navigationOwner` |
| 2 | `journey-compass-kicker` | `<div>` | *(none)* | `compass.kicker || 'Journey'` |
| 3 | `journey-compass-title` | `<div>` | *(none)* | `visibleTitle` (depends on `compass.title`, `navSurface`, `bodyPanelSurface`, `phase`) |
| 4 | `journey-compass-note` | `<div>` | *(none)* | `compass.note || 'Search to open one semantic trail.'` |
| 5 | `btn-journey-primary` | `<button>` | `data-journey-action={actionKey(primaryAction)}`, `data-mobile-label={...}` | `primaryAction` (derived from `bodyCanStepInside`, `semanticDiveActive`, `bodyPanelSurface`, `compass.primaryAction`) |
| 6 | `btn-journey-secondary` | `<button>` | `data-journey-action={actionKey(compass.secondaryAction)}` | `compass.secondaryAction` |
| 7 | `btn-journey-tertiary` | `<button>` | `data-journey-action={actionKey(compass.tertiaryAction)}` | `compass.tertiaryAction` |
| 8 | `map-trail-strip` | `<div>` | *(none)* | `showMapTrailStrip` (derived from `navState.surface`, `navigationOwner`) |
| 9 | `btn-map-county` | `<button>` | `data-journey-action={JOURNEY_ACTIONS.COUNTY_OVERVIEW}` | `showMapTrailStrip` |
| 10 | `btn-focus-dive` | `<button>` | `data-journey-action="enter-inside"` | `showDiveButton`, `semanticDiveActive`, `canDive` |
| 11 | `focus-stage-inside-status` | `<div>` | *(none)* | `showInsideControls` |
| 12 | `focus-stage-inside-controls` | `<div>` | *(none)* | `showInsideControls` |
| 13 | `btn-inside-next` | `<button>` | `data-journey-action={JOURNEY_ACTIONS.NEXT_STOP}` | `showInsideControls` |
| 14 | `btn-inside-map` | `<button>` | `data-journey-action={JOURNEY_ACTIONS.OPEN_MAP}` | `showInsideControls` |
| 15 | `btn-inside-county` | `<button>` | `data-journey-action={JOURNEY_ACTIONS.COUNTY_OVERVIEW}` | `showInsideControls` |

**Note:** The doc-comment example block at lines 7-18 also shows `journey-compass-kicker` as a rendered ID (confirmed at line 337 of the actual template). The 15th DOM element referenced in comments is `journey-compass-kicker`.

**Additional rendered elements without DOM IDs:**
- `.focus-stage-kicker` (line 467) — div with class only, no ID
- `.journey-compass-step` spans (line 328) — dynamically generated via `{#each}` loop, uses `data-journey-step` attribute

---

## 2. Data-* Attribute Mirror Matrix

The component sets the following data-* attributes on its elements. These mirror the parity-layer body.dataset attributes defined in `src/lib/orchestration/parity-attrs.svelte.ts`.

### Section-level: `journey-compass` (lines 318-322)

| data-* attr | Value source | Parity body.dataset equivalent |
|------------|-------------|-------------------------------|
| `data-phase` | `compass.phase` (overview/search/focus/inside/map) | `body.dataset.journeyPhase` (Category A) |
| `data-density` | `presentation.density` (standard/compact/hidden) | `body.dataset.journeyCompassDensity` (Category A — unused parity key) |
| `data-copy` | `presentation.copy` | *(none — no parity equivalent)* |
| `data-actions` | `presentation.actions` (standard/triple) | *(none — no parity equivalent)* |
| `data-navigation-owner` | `presentation.navigationOwner` | `body.dataset.journeyNavigationOwner` (Category A) |

### Button-level: `data-journey-action` (lines 365, 380, 394, 426, 449, 488, 501, 514)

| Button ID | data-journey-action value | Action enum |
|-----------|--------------------------|-------------|
| `btn-journey-primary` | `actionKey(primaryAction)` (dynamic) | e.g., `enter-inside`, `next-stop`, `open-map`, `county-overview` |
| `btn-journey-secondary` | `actionKey(compass.secondaryAction)` (dynamic) | Context-dependent |
| `btn-journey-tertiary` | `actionKey(compass.tertiaryAction)` (dynamic) | Context-dependent |
| `btn-map-county` | `JOURNEY_ACTIONS.COUNTY_OVERVIEW` | Static: `county-overview` |
| `btn-focus-dive` | `"enter-inside"` | Static: `enter-inside` |
| `btn-inside-next` | `JOURNEY_ACTIONS.NEXT_STOP` | Static: `next-stop` |
| `btn-inside-map` | `JOURNEY_ACTIONS.OPEN_MAP` | Static: `open-map` |
| `btn-inside-county` | `JOURNEY_ACTIONS.COUNTY_OVERVIEW` | Static: `county-overview` |

### Step indicators: `data-journey-step` (line 328)

Iterates over `JOURNEY_COMPASS_PHASE_ORDER` — values: `overview`, `search`, `focus`, `inside`, `map`.

### Mobile label: `data-mobile-label` (line 366)

Only on `btn-journey-primary` when action is `enter-inside` → value `'Inside'`.

---

## 3. Cross-Reference Map

### CSS Files Referencing Component DOM/Data Attributes

| CSS File | Total Lines | Lines Matching Component IDs/Selectors |
|----------|------------|--------------------------------------|
| `css/mobile_premium__focus-dive.css` | 2,110 | ~36 lines (selectors on `.journey-compass`, `[data-phase]`, `[data-density]`, `[data-panel-surface]`, `[data-focus-panel-mode]`) |
| `css/mobile_premium__surfaces.css` | 1,518 | ~9 lines (selectors on `.journey-compass`, `[data-journey-action]`) |
| `css/modules/focus_stage.css` | 1,286 | ~2 lines (selectors on `.focus-stage-inside-controls`, `.focus-stage-inside-status`, `[data-inside-walk-state]`) |
| `css/mobile_premium__chrome.css` | 892 | ~1 line (selector on `.journey-compass[data-density='hidden']`) |
| `css/animations.css` | 129 | ~2 lines (selectors on `.journey-compass`, `[data-phase]`) |
| `css/progressive_disclosure.css` | 1,029 | ~1 line (selector on `#journey-compass-note`) |
| **TOTAL** | **6,964** | **~51 lines** (direct DOM ID/class matches) |
| **TOTAL with data-* selectors** | | **~398 lines** (includes `body[data-panel-surface]` gating selectors) |

### Source Files Referencing Component DOM IDs

| File | Refs | Type |
|------|------|------|
| `src/lib/orchestration/compass-controller.ts` | 9 refs (lines 102-110, 174-184, 253, 423, 443-445) | `getElementById` reads |
| `src/lib/journey/semantic-dive.ts` | 9 refs (lines 102-110) | `getElementById` reads |
| `src/lib/journey/focus-stage-dom.ts` | 4 refs (lines 248-249, 268) | `getElementById` reads |
| `src/lib/journey/focus-ui.ts` | *indirect* | Uses `focus-stage-*` classes |
| `src/lib/journey/selected-card.ts` | *indirect* | Uses `focus-stage-*` classes |
| `src/App.svelte` | *references via import* | Component consumer |
| `src/components/JourneyChrome.svelte` | *references via import* | Component consumer |
| `src/lib/orchestration/app-orchestration.svelte.ts` | *references* | State wiring |
| `src/lib/orchestration/parity-attrs.svelte.ts` | *references* | Body data-* mirror |
| `src/lib/engine/camera-choreography/framing-utils.ts` | *references* | Viewport framing |
| `src/lib/demo/guards.ts` | *references* | Demo gating |
| `src/lib/demo/ui.ts` | *references* | Demo UI |

### Test Files Referencing Component DOM IDs

**Spec files (.spec.js):** 13 files
- `tests/3d-focus-pocket-selectability.spec.js`
- `tests/3d-state-transition-integrity.spec.js`
- `tests/btn-journey-primary-layout.spec.js`
- `tests/camera-motion-visual-smoke.spec.js`
- `tests/canvas-hit-test-interaction.spec.js`
- `tests/live-state-transition-ui-paths.spec.js`
- `tests/live-step-inside-url-body-state-sync.spec.js`
- `tests/live-ui-reset-interaction.spec.js`
- `tests/reduced-motion-interruption-proof.spec.js`
- `tests/reduced-motion-interruption.spec.js`
- `tests/short-landscape-transition-ui-paths.spec.js`
- `tests/url-anchor-bare-regression.spec.js`
- `tests/visual-regression.test.ts`

**Contract files (.mjs):** 12 files
- `tests/focus-camera-ownership-contract.mjs`
- `tests/focus-stage-render-contract.mjs`
- `tests/micro-surface-interactions-contract.mjs`
- `tests/mobile-focus-search-surface-ownership-contract.mjs`
- `tests/mobile-route-ownership-contract.mjs`
- `tests/mobile-visual-qa-contract.mjs`
- `tests/product-playthrough-audit.mjs`
- `tests/reset-map-interaction-ownership-contract.mjs`
- `tests/surface-contract-check.mjs`
- `tests/three-scene-playtest.mjs`
- `tests/ui-quality-contract.mjs`
- `tests/visual-state-audit.mjs`

**Unit tests:** 2 files
- `tests/unit-active/component-LegacyCompassSurface.test.ts`
- `tests/unit-active/journey-chrome-idle-hide.test.ts`

**Total test contract files:** 27 files  
**Total test DOM refs (verified):** 145 references across all test files

---

## 4. Migration Tiers

### PHASE A — Low Risk: JS QuerySelector Migration (body.data-* → Store Direct Access)

**Scope:** Files that read `body.dataset.X` via `document.body.dataset.*` or `body.dataset.*` to determine compass UI state. The LegacyCompassSurface component already derives from stores directly — the migration target is the **consumers** of body.dataset that could instead read from the same stores.

**Affected files (JS readers of body.dataset for compass state):**

| File | Line(s) | Attrs Read | Migration Action |
|------|---------|-----------|-----------------|
| `src/lib/orchestration/compass-controller.ts` | 102-110 | `btn-focus-dive`, `focus-stage-inside-controls`, `focus-stage-inside-status`, `btn-inside-next`, `btn-inside-map`, `btn-inside-county`, `journey-compass` | Already uses `getElementById` — no change needed; these IDs are stable |
| `src/lib/journey/semantic-dive.ts` | 102-110 | Same as above | Already uses `getElementById` — no change needed |
| `src/lib/journey/focus-stage-dom.ts` | 248-249, 268 | `focus-stage-inside-status`, `focus-stage-inside-controls`, `btn-focus-dive` | Already uses `getElementById` — no change needed |
| `src/lib/stores/test-compat.svelte.ts` | 93-116 | 27 body.dataset reads | Replace with direct store subscriptions (e.g., `$navStore`, `$journeyStore`) |
| `src/lib/engine/camera-choreography/framing-utils.ts` | *indirect* | Via body.dataset gating | Add store subscription for relevant state |

**Estimated effort:** 4-6 hours  
**Risk:** Low — IDs remain stable, only consumers of body.dataset change

### PHASE B — Medium Risk: CSS Selector Migration (body[data-X] → Element-Level Selectors)

**Scope:** CSS rules that gate on `body[data-panel-surface]`, `body[data-focus-panel-mode]`, `body[data-active-view]`, `body[data-inside-walk-state]` to style JourneyCompass elements. These rules are in 6 CSS files and affect ~398 lines.

**CSS files requiring migration:**

| CSS File | Lines Affected | Key Selectors | Migration Strategy |
|----------|---------------|---------------|-------------------|
| `css/mobile_premium__focus-dive.css` | ~36 | `body[data-panel-surface='focus-search'] .journey-compass`, `body[data-panel-surface='semantic-dive'] .journey-compass` | Replace `body[data-X]` with `.journey-compass[data-phase='X']` or add modifier classes on `#journey-compass` |
| `css/mobile_premium__surfaces.css` | ~9 | `.journey-compass[data-phase='overview']`, `[data-journey-action]` | Already element-level for most; only `body.searching` gating needs class replacement |
| `css/modules/focus_stage.css` | ~2 | `body[data-inside-walk-state='walking'] .focus-stage-inside-pulse` | Add `data-walk-state` to `#focus-stage-inside-controls` or parent section |
| `css/mobile_premium__chrome.css` | ~1 | `body.is-active[data-panel-surface^='map-'] .journey-compass[data-density='hidden']` | Replace with `.journey-compass[data-density='hidden']` + class on section |
| `css/animations.css` | ~2 | `body[data-panel-surface]:not([data-panel-surface^='map-']) .journey-compass` | Replace with `.journey-compass:not(.map-surface)` modifier class |
| `css/progressive_disclosure.css` | ~1 | `#journey-compass-note.discovery-active` | Already element-level — no change needed |

**Migration approach per rule:**
1. Add corresponding CSS classes to `#journey-compass` section (e.g., `class:map-surface={isMapSurface}`)
2. Replace `body[data-panel-surface='X']` with `.journey-compass[data-panel-surface='X']` or `.journey-compass.panel-X`
3. Remove `body.searching`, `body.is-active` gating where the class can live on the section

**Estimated effort:** 8-12 hours (requires visual QA after each CSS change)  
**Risk:** Medium — CSS specificity changes can cascade; requires browser testing

### PHASE C — High Risk: Test Contract Refactor + Visual Regression

**Scope:** 27 test files and 145 DOM references that assert on `body.dataset.X` values, `getElementById` results, and visual rendering contracts.

**Test categories requiring updates:**

| Test File | What Changes | Effort |
|-----------|-------------|--------|
| `tests/unit-active/component-LegacyCompassSurface.test.ts` | Update assertions from `body.dataset.X` to store values | 2-3 hrs |
| `tests/btn-journey-primary-layout.spec.js` | DOM layout assertions (stable IDs) | Low — IDs unchanged |
| `tests/canvas-hit-test-interaction.spec.js` | Asserts `body.data-semantic-dive='active'` alongside DOM | 1-2 hrs |
| `tests/live-state-transition-ui-paths.spec.js` | State transition assertions via body.dataset | 2-3 hrs |
| `tests/live-step-inside-url-body-state-sync.spec.js` | URL ↔ body.dataset ↔ DOM sync | 2-3 hrs |
| `tests/live-ui-reset-interaction.spec.js` | Reset behavior via body.dataset | 1-2 hrs |
| `tests/reduced-motion-*.spec.js` (2 files) | Motion state via body.dataset | 1 hr each |
| `tests/surface-contract-check.mjs` | Surface ownership assertions | 2-3 hrs |
| `tests/visual-state-audit.mjs` | Visual state registry | 2-3 hrs |
| `tests/visual-regression.test.ts` | Snapshot comparisons | Low — DOM structure stable |
| `tests/3d-*.spec.js` (2 files) | 3D interaction with DOM elements | 1-2 hrs each |
| `tests/focus-stage-render-contract.mjs` | Focus stage DOM rendering | Low — IDs stable |
| `tests/micro-surface-interactions-contract.mjs` | Surface-level interactions | 1-2 hrs |
| `tests/mobile-*.mjs` (3 files) | Mobile surface contracts | 1-2 hrs each |
| Remaining .mjs contracts (6 files) | Various body.dataset reads | 1 hr each |

**Estimated effort:** 30-45 hours  
**Risk:** High — test failures are expected during migration; requires careful regression tracking

---

## 5. Fastest First Win

### Candidate: `css/progressive_disclosure.css` (1 line affected)

**Why this is the fastest win:**
- Only **1 line** of CSS references `#journey-compass-note` (line 729: `#journey-compass-note.discovery-active`)
- The selector is **already element-level** — no body-level gating
- The `discovery-active` class can be added directly to the `#journey-compass-note` div via Svelte class binding
- **Zero test changes required** — DOM IDs unchanged
- **Zero JS changes required** — only adds a class binding

**Migration action:**
```svelte
<!-- In LegacyCompassSurface.svelte, line ~351 -->
<div
  id="journey-compass-note"
  class="journey-compass-note"
  class:discovery-active={someCondition}
>
```

**Effort:** < 30 minutes  
**Risk:** Near zero — adds a class, no structural change

### Runner-up: `css/animations.css` (2 lines affected)

Both lines use `body.searching` or `body[data-panel-surface]` gating. Adding `.searching` class to `#journey-compass` section would eliminate body-level dependency.

**Effort:** ~1 hour  
**Risk:** Low

---

## 6. Summary & Effort Estimate

| Phase | Description | Files Affected | Lines of Code/Config | Effort Estimate | Risk Level |
|-------|------------|---------------|---------------------|-----------------|------------|
| **A** | JS QuerySelector migration (body.data-* → stores) | 4-5 files | ~30 lines | 4-6 hrs | Low |
| **B** | CSS selector migration (body[data-X] → element-level) | 5 CSS files | ~398 CSS lines | 8-12 hrs | Medium |
| **C** | Test contract refactor + visual regression | 27 test files | ~145 DOM refs | 30-45 hrs | High |
| **Fastest win** | progressive_disclosure.css (1 line) | 1 CSS file | 1 line | < 30 min | Near zero |
| **TOTAL** | Full migration | **36 files** | **~430+ lines** | **42-63 hrs** | Mixed |

### Key Findings

1. **DOM IDs are stable.** All 14 (plus kicker = 15) IDs are referenced by `getElementById` in 5 source files and 27 test files. The component's DOM structure is the contract — IDs should not change during migration.

2. **data-* attributes are the real coupling.** The 8 data-* attributes (`data-phase`, `data-density`, `data-copy`, `data-actions`, `data-navigation-owner`, `data-journey-action` × 8 buttons, `data-journey-step` × 5 steps, `data-mobile-label`) are the bridge between parity-layer body.dataset and the DOM. Migration means making these attributes the single source of truth.

3. **CSS is the heaviest dependency.** 398 CSS lines across 6 files reference body-level data-* selectors that gate on `data-panel-surface`, `data-focus-panel-mode`, `data-active-view`, `data-inside-walk-state`. Moving these to element-level classes on `#journey-compass` is the bulk of Phase B.

4. **test-compat.svelte.ts is the parity bridge.** 27 body.dataset reads in this file (lines 93-116) should be replaced with direct store subscriptions ($navStore, $journeyStore, $focusStore) as the migration progresses.

5. **No structural DOM changes needed.** The component already renders the correct DOM. Migration is about decoupling consumers from body.dataset and moving CSS selectors from body-level to element-level.

### Recommended Execution Order

1. **Fastest win first:** `css/progressive_disclosure.css` (1 line, < 30 min)
2. **Phase B batch:** `css/animations.css` → `css/modules/focus_stage.css` → `css/mobile_premium__chrome.css` → `css/mobile_premium__surfaces.css` → `css/mobile_premium__focus-dive.css` (largest file, save for last)
3. **Phase A:** Replace `test-compat.svelte.ts` body.dataset reads with store subscriptions
4. **Phase C:** Update 27 test files in parallel batches (10-12 hrs per batch)
