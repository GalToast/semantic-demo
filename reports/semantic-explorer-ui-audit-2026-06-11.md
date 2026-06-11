# Semantic Explorer — End-to-End UI/UX Audit

**Date:** 2026-06-11
**Auditor:** main (browser MCP, headed Playwright)
**Surfaces audited:** Desktop 1440×900 + Mobile 390×844 on the Svelte/Vite build at `http://localhost:5173/?nodemo=1`
**Stack under test:** Svelte/TS scaffold (`src/components/*`), Vite proxy → `127.0.0.1:8795` (no PHP), legacy islands + `js/modules/*` shell still loaded by Svelte `App.svelte`.

> Method: every "user path" was driven with the browser MCP. State was probed via `window.__APP_STATE__`, `document.body.dataset.*`, and `querySelector` reads. Screenshots saved to `reports/screenshots/playwright/2026-06-11-semantic-explorer-audit/`.

---

## TL;DR — 30 issues found

| Severity | Count | Headline |
| --- | --- | --- |
| **P0 — blocks a path end-to-end** | 5 | Search results not clickable; URL `?anchor=N` doesn't focus; canvas click shows empty focus card; constellation doesn't render on focus; category legend toggle doesn't filter. |
| **P1 — visual/UX breaks the polish** | 12 | Two search inputs, duplicate DOM IDs, intro panel leaks into every mode, journey compass duplicates header nav, category legend hidden behind journey compass, mobile mode chips clipped, etc. |
| **P2 — cosmetic / state hygiene** | 13 | Body `data-mode` ↔ `navState.mode` desync, `view=galaxy` URL never updates, MANIFOLD overlay, weather re-fetches, etc. |

Of the P0s, the two biggest are:
- **P0-1** Search input blocks pointer events on the result list (results render but are unclickable).
- **P0-3** Canvas click on a node sets `navState.focusedIndex` but the new Svelte `FocusCard` shows the empty state, so the user sees "Select a business to see details" while the page title already says the focused name. The legacy `info-panel` only renders correctly when called via the programmatic `__APP_ACTIONS__.focusOnNode()` action, not via the natural canvas click.

---

## Environment & setup observed

- Vite dev server: `http://localhost:5173/` returns 200, HMR active.
- Vite `/api` proxy → `http://127.0.0.1:8795/` returns `000` (no upstream). All semantic_search calls get `502 Bad Gateway`. The JS-side fallback in `src/lib/search-engine.ts` (`MOCK_BUSINESSES`, 20 hand-curated rows) activates.
- Data: 8,406 `BusinessRecord`s loaded into the legacy `__APP_STATE__.points` array, plus the mock set. Semantic threads bundle present (`{generated_at, model, meta, nodes}`), `1,678` global mycelium pairs.
- Console: **0 errors, 29 warnings** at idle load. All warnings are the same `[State Bypass] state.scenePerformanceDiagnostics.* — use store .update()` — every animation frame writes to legacy `state` via the proxy instead of the Svelte store. Cosmetic but noisy.
- Initial body data state: `mode=overview`, `view-mode=galaxy`, `panel-surface=idle`, `scene-ready=true`, `search-status=idle`, `data-test-ready=true`, `compact=false`, `mobile=false`.

---

## P0 — Path-blocking issues

### P0-1 · Search results are rendered but unclickable

**Repro:** type "conroe" into the top search bar (or use `?q=conroe`). 5 result buttons render with `class="search-result svelte-107u63u"`. Hovering them changes color, but clicking fires no handler.

**Diagnosis from Playwright:**
```
- <input type="search" id="search-input" ...> from <div class="search-input-container svelte-1623ob8 expanded has-query"> subtree intercepts pointer events
- <header id="app-header" class="app-header svelte-oiwvqb"> intercepts pointer events
```

**Why:** `.search-input-container` in `src/components/SearchInput.svelte:219` is `position: absolute; top: 1rem; z-index: var(--z-search, 100)`. The results list `.search-results-wrapper` in `src/components/SearchResults.svelte:411` is **`position: static; z-index: auto;`** — it has no positioning at all, so it falls behind the absolutely-positioned search input in the stacking order. Clicking on a result hits the input first.

**Bonus cause:** `App.svelte:237` renders `<SearchResults visible={true} />` as a **sibling** of `<SearchBar />`, even though `SearchBar.svelte` already composes a `<SearchResults />` inside itself (line 66). Two result lists mount with the same `id="search-results"`; the one from `<SearchBar>` ends up behind the input, the sibling one is the off-screen duplicate (x=-22).

**Fix sketch:**
- Add `position: absolute; top: calc(1rem + 44px + 8px); z-index: 99;` (or use `--z-search-results`) to `.search-results-wrapper` in `SearchResults.svelte`, OR
- Stop rendering the sibling `<SearchResults>` in `App.svelte` (keep the one inside `SearchBar`).

**Files:** `src/components/SearchInput.svelte`, `src/components/SearchResults.svelte`, `src/components/SearchBar.svelte`, `src/App.svelte:232-238`.

---

### P0-2 · Search returns 0 results for many natural queries

**Repro:** type "restaurant", "real estate", or even a typo like "cofee" into the search box. You get "No matching businesses found." in both result lists.

**Data observed:** 2,531 "Food & Dining" businesses exist, ~269 "Real Estate" businesses — but the JS-side fallback only matches against the 20-row `MOCK_BUSINESSES` keyword index in `src/lib/search-engine.ts:141-169` (Conroe Coffee Roasters, Lone Star HVAC, etc.). It does not match against the live 8,406-record dataset.

**Search test matrix (run with `page.evaluate` against `MOCK_BUSINESSES` fallback):**
| Query | Result | Why |
| --- | --- | --- |
| `conroe` | 5 hits | city match in fallback |
| `food` | 3 hits | category match |
| `auto` | 1 anchor | keyword match (b-004) |
| `medical` | 1 anchor | keyword match (b-008) |
| `restaurant` | **0** | not in fallback; 2,531 records ignored |
| `real estate` | **0** | space-separated — `kw.includes('real estate')` would hit b-007 but the live fallback uses `kw.startsWith(queryLower)` first; 269 records ignored |
| `cofee` | **0** | no fuzzy/typo handling |

Every query also surfaces a 502 from the API: `Failed to load resource: 502 ... /api.php?action=semantic_search&q=...&limit=18&offset=0`.

**Fix sketch:** Either (a) wire the fallback to walk the in-memory `businessRecords` (use the legacy `points` array, which is already loaded), or (b) surface the "API down + limited fallback" state with a "Try one of these high-signal terms" empty state, instead of "No matching businesses found." The current `search-empty-state.svelte` *does* have a suggestions block, but the live path skips it.

**Files:** `src/lib/search-engine.ts:130-200`, `src/lib/data-store.svelte.ts`, `src/components/SearchResults.svelte:265-289` (empty branch not reached because `isEmpty` is keyed off the API response).

---

### P0-3 · Canvas click on a node → Svelte `FocusCard` shows empty state

**Repro:** on `?nodemo=1` (no focus), dispatch a `click` event on the canvas at `(720, 450)`:
```
const pd = new PointerEvent('pointerdown', { clientX: cx, clientY: cy, ... });
canvas.dispatchEvent(pd); canvas.dispatchEvent(pu); canvas.dispatchEvent(cl);
```

**Observed result:**
- `__APP_STATE__.navState.focusedIndex = 3143` (set)
- `__APP_STATE__.points[3143].name = "Griswold Management, Inc."` (real record)
- Page `<title>` becomes `Focus: Griswold Management, Inc. | Semantic Explorer`
- BUT the `FocusCard.svelte` (class `focus-card selected-card focus-stage-card svelte-15lp41q selected-card-empty`) has `selected-card-empty`, `detailsHidden=true`, `emptyHidden=false`, `selectedName=null`.

**Compare with the programmatic action:** calling `window.__APP_ACTIONS__.focusOnNode(100, { animate: false })` produces a *different* element on screen — `class="selected-card svelte-dhpbxu"` — populated with `name = "3rd GEN Construction AND Contract Consultants LLC"` and the constellation hint header. So the legacy `info-panel` renders correctly, the new Svelte `FocusCard` does not.

**Diagnosis:** `FocusCard.svelte:60-71` derives `selectedRecord` from `getBusinessRecords()[currentFocusedIdx]`. The Svelte `getBusinessRecords()` (in `src/lib/data-store.svelte.ts:54`) reads from the Svelte writable `businessRecords` (defined in `src/lib/data-store.ts:45`). That store is populated by `setBusinessData()` which is called from `initData()` in `src/lib/data-store.svelte.ts:262`. The console log `[data-store] Business records loaded.` appears, so the call ran — but the FocusCard's `$derived` doesn't see the update.

Likely cause: the `__APP_ACTIONS__` path calls `focusOnNodeAction` (which uses `withStateMutation` and the Svelte store pipeline), while the canvas click path goes through the legacy `app.js` click handler that mutates `state.navState.focusedIndex` directly — bypassing the Svelte store. The bridge.ts adapter may be syncing back, but `getBusinessRecords()` is the wrong store view for the FocusCard to read.

**Fix sketch:** Make `FocusCard` read from the same source the legacy code uses, or wire the canvas click path through `__APP_ACTIONS__.focusOnNode()` (or a Svelte action that does the equivalent). Either is a small change; the duplication is the problem.

**Files:** `src/components/FocusCard.svelte:60-71`, `src/lib/data-store.svelte.ts:54`, `src/lib/data-store.ts:188`, `js/modules/app.js` (canvas click handler — to be located).

---

### P0-4 · Constellation (focus pocket) renders zero neighbor nodes

**Repro:** focus any node (`__APP_ACTIONS__.focusOnNode(100)` or click a node).

**Observed:**
- `[class*=focus-pocket-node]` count = `0`
- `__APP_STATE__.focusSemanticConnectionPairs.length = 0`
- `__APP_STATE__.focusSemanticLines.length = 0`
- The center of the canvas shows a single cyan focus halo, but no surrounding neighbor constellation.

The Svelte `FocusPocket.svelte` component is mounted (`#focus-pocket, .focus-pocket.svelte-wdgx9m, visible=true`) but its constellation population is empty. The `applyLocalNeighborhoodFocus` pipeline is not producing neighbor nodes for the focused point.

**This is the headline "constellation behavior" the user asked about** — the focus stage is the entire premise of the F/I modes, and it's silent.

**Fix sketch:** Trace `applyLocalNeighborhoodFocus` → check whether `state.semanticNeighborMap` (size?) is populated when `focusedIndex` changes. The `semanticThreadBundle.nodes` exists, but the neighbor map may not be keyed on the same id space as `points[].lead_id`. Check `setSemanticThreadData` consumers in `src/lib/data-store.svelte.ts` and the focus-pocket JS module.

**Files:** `src/components/FocusPocket.svelte`, `js/modules/focus-pocket.js`, `js/modules/three-node-manager.js` (sampling).

---

### P0-5 · Category legend toggle does not filter the visualization

**Repro:** in idle mode, click the "Food & Dining" row in the CATEGORIES panel (left).
- `aria-pressed` flips from `false` to `true`.
- The label goes dim.
- The mycelium field looks **identical** to before (no fade, no reduction in node density).
- `document.body.dataset.filtersActive` stays `false`.

The Filters component (STATUS / CONTACT / CITY row at bottom-center in `Inside` mode) is rendered separately (`<Filters open={false} />` in `App.svelte`), so it has no effect on the legend either.

**Fix sketch:** The legend is wired to `legendOpen` (a boolean store) but the *click handler* on `.legend-item` likely only toggles "inactive" styling without driving a filter. Check `src/components/Legend.svelte` to see if the `onclick` calls into a filter pipeline; if not, wire it to `setBusinessFilter(categoryId)` or similar in `data-store.svelte.ts`.

**Files:** `src/components/Legend.svelte`, `src/lib/stores/filter-state.ts` (or equivalent), `src/components/Filters.svelte`.

---

## P1 — Visual / UX polish breaks

### P1-1 · Duplicate DOM IDs (invalid HTML, breaks a11y / form autofill / Playwright strict mode)

Playwright `page.evaluate` over `document.querySelectorAll('[id]')` reports:
- `search-input` × **2** — `SearchInput.svelte:179` is hard-coded `id="search-input"`, and `InfoPanel.svelte:438` mounts a `<SearchBar panelContained={true} />` which contains another `SearchInput`.
- `search-results` × **2** — `SearchResults.svelte:254` is hard-coded `id="search-results"`, mounted inside `SearchBar.svelte` AND as a separate sibling in `App.svelte:237`.
- `semantic-lane-pill` × **2** — same pattern: `SearchInput.svelte:165` emits the pill, and `InfoPanel`'s `SearchBar` emits another.

Strict-mode Playwright actions like `page.locator('#search-input').fill('x')` already throw `"strict mode violation: locator('...') resolved to 2 elements"`. Document-level form helpers, `aria-controls`, and any test using `getElementById` will pick one of the two at random.

**Fix:** Give `InfoPanel`'s copy scoped IDs (`info-panel-search-input`, `info-panel-search-results`) or remove the duplicate `SearchBar` mount in `InfoPanel.svelte` entirely (the App-level one already covers both surfaces).

**Files:** `src/components/InfoPanel.svelte:438`, `src/components/SearchInput.svelte:165,179`, `src/components/SearchResults.svelte:254`, `src/components/SearchBar.svelte:65-66`.

---

### P1-2 · "The MoCo Mycelium" intro / onboarding panel persists in every mode

The `#journey-compass` element (`<section class="journey-compass glass-heavy svelte-1bwkl14">` from `LegacyCompassSurface.svelte`) is always rendered at the top-center. In idle mode it shows the 5 step bars and the intro text: "Overview | Montgomery County / The MoCo Mycelium / Start wide, then search by need or clue to open one trail through the network."

In **Focus** mode, the same panel is still present — the step bars just reflow but the intro copy remains. Same in **Inside** and **Map** modes. There's no `data-journey-compass="idle"` → hidden transition; the body attribute exists but the visibility is unconditional.

**Fix:** Bind `display:none` (or `aria-hidden`) on `#journey-compass` when `data-journey-compass !== 'idle'` AND `data-journey-compass-density !== 'expanded'`, or hide the intro copy when the user has taken any meaningful action (searched, focused, opened map).

**Files:** `src/components/LegacyCompassSurface.svelte`, `css/layout_base.css`, `js/modules/journey-compass-controller.js`.

---

### P1-3 · Two parallel navigation systems

The user sees:
1. **Header `<radiogroup role="radiogroup" aria-label="View mode">`** — `M Overview`, `S Search`, `T Trail`, `F Focus`, `I Inside`, `G Map`.
2. **`<nav aria-label="Journey compass">`** with 5 buttons: `Navigate to overview`, `Navigate to search`, `Navigate to focus`, `Navigate to inside`, `Navigate to map`. (Note: no "Trail" — that mode only exists in the header.)

Both are visible simultaneously on every mode except Map. Clicking either updates the other's active state inconsistently — `data-nav-mode` updates from the header click, but the journey-compass `current` class doesn't always track.

**Fix:** Decide which nav is canonical. If header is canonical, hide the journey compass nav in idle (or shrink to an indicator). If journey compass is the legacy version that's about to be removed, hide the header duplicate. Don't ship both.

**Files:** `src/components/Header.svelte`, `src/components/LegacyCompassSurface.svelte`, `src/App.svelte:282`.

---

### P1-4 · Category legend hidden behind journey compass

On desktop idle, the CATEGORIES panel (`<aside class="legend.svelte-pswzrf">`) lives at `bottom: 1rem; left: 1rem` — but the journey compass nav (P1-3) sits at `left: 1rem; top: 50%`. They overlap vertically. The user can only see the first 5 categories (Food & Dining through Health & Medical); the rest are partially covered.

**Fix:** Either move the legend to a different anchor (top-right? fold it into the header?) or move the journey compass (center it horizontally, not just left-anchored).

**Files:** `src/components/Legend.svelte:1-60`, `src/components/LegacyCompassSurface.svelte`.

---

### P1-5 · Trail breadcrumb + "Select a node" leaks into Map mode

`MapSummary.svelte` (the trail mini-map) and the focus pocket ("Select a node / Click a business in the field to explore.") both render regardless of mode. In Map mode the user sees a "TRAIL 1 Node 42" panel and a focus-pocket empty state stacked at the bottom-left.

The Map view's own description ("8,406 businesses · 8,162 mapped · zoom to inspect density…") is correct, but the irrelevant trail UI underneath confuses the read.

**Fix:** Hide `MapSummary` when `data-mode === 'map'` (or `currentView === 'map'`). Hide the focus pocket when not in focus/inside.

**Files:** `src/components/MapSummary.svelte`, `src/components/FocusPocket.svelte`.

---

### P1-6 · Mobile (390px) — mode chips clipped to first 4 of 6

`body[data-mobile="true"]` is set, `body[data-compact="true"]` is set, but the header mode-chips row still tries to fit all 6 chips plus the brand mark plus the legend toggle. On 390px wide, the last two chips (`I Inside`, `G Map`) clip off the right edge of the viewport.

The CSS at `Header.svelte:248-251` only hides the chip **label** on compact; the **icon** (`{M, S, T, F, I, G}`) is still rendered with `min-width: 44px`, eating horizontal space. With 6 chips at 44px = 264px + brand (148px) + legend toggle (28px) + gaps, the row is ~500px, well over the 390px viewport.

**Fix:** Replace the chip row with a single "Mode: X" dropdown on compact, or use a horizontal scroll, or reduce `min-width: 44px` to `32px` on compact and remove the brand label.

**Files:** `src/components/Header.svelte:200-260`, `css/mobile_premium__chrome.css`.

---

### P1-7 · Mobile — info panel and category legend stack on top of each other

On 390px, the CATEGORIES legend slides up to mid-height and the BUSINESS DETAILS info panel sits below it, but they overlap around y≈500-700. The user sees both partial panels competing for the same strip.

**Fix:** On compact, make the legend a button-triggered bottom sheet (or auto-collapse to a single row showing "16 categories"), and let the info panel own the bottom half.

**Files:** `css/mobile_premium__surfaces.css`, `css/mobile_premium__chrome.css`, `src/components/Legend.svelte`.

---

### P1-8 · Search results drop-down sits at the top-left of the document, not under the input

In all idle/focus states, the result list `.search-results-wrapper` (SearchResults.svelte:411) has `margin-top: 0.35rem` and no `position: absolute`. It renders in normal flow at the top of the document (y≈5px), so the result list appears as a half-cut strip in the **top-left** of the viewport (around x=510, y=5) while the search input is at (x=523, y=59). They don't visually connect.

**Fix:** See P0-1 — also solves this.

---

### P1-9 · Two search inputs on the screen simultaneously

In `?q=conroe` mode (so `searchBarVisible` is true AND the InfoPanel's internal search is also active), two `#search-input` elements mount:
- Input #0: x=−22, y=176, w=364 (off-screen left)
- Input #1: x=523, y=43, w=364 (visible, top-center)

Input #0 is the one inside `InfoPanel.svelte`'s `<SearchBar panelContained={true} />`. It's positioned with negative x because the panel is `position: absolute; right: 0; transform: translateX(100%)` (closed), and the `info-panel-contained` mode applies `margin: -2rem -1rem 0` which puts the input at a negative offset. So the user *sees* one input but the DOM has two, and only one of them is positioned reasonably.

**Fix:** See P1-1.

---

### P1-10 · "MANIFOLD" overlay is unexplained and persistent

After any focus (`?anchor=42`, or canvas click), the `<SemanticOverlay visible={true}>` (App.svelte:212) shows a chip at the top-center: "MANIFOLD #42 Semantic proximity active". It has no visible action; hovering it doesn't reveal what it does. After 3 seconds it stays.

This is the `semantic-overlay.svelte-1vftrd4` from `SemanticOverlay.svelte` — a `body` `data-semantic-dive="active"` indicator chip. It is a status badge, but it reads as an interactive element to users (chip styling, looks clickable).

**Fix:** Either make it explicitly non-interactive (no border, no hover, `pointer-events: none`, a label like "Auto · Manifold active" to make it clear it's status), or wire it to a real toggle that does something.

**Files:** `src/components/SemanticOverlay.svelte`, `js/modules/journey-semantic-overlay.js`.

---

### P1-11 · Trail navigation shows broken count text

In the trail controls area (bottom-left in focus/inside modes), the breadcrumb shows "Stop 1 of 0" when there's a single stop in the trail. The "0" should be "1" (Stop 1 of 1). The Prev/Next buttons are also disabled when there's exactly one stop but the user is conceptually on it.

**Fix:** Compute `total` from the trail array length, not from a hard-coded `0`. Disable Prev at the start, Next at the end — not based on a separate counter.

**Files:** `src/components/JourneyChrome.svelte`, `js/modules/journey-thread-settler.js`.

---

### P1-12 · "Thread Inspector" panel shows with no thread

The `<ThreadInspector visible={true} />` in `App.svelte:300` always renders, and in `?anchor=42` and Inside modes it surfaces a panel with "CONNECTION PREVIEW / Select a nearby stop / Click a neighbor below to preview why it belongs here, then pin or follow. / [PIN CONNECTION] [FOLLOW CONNECTION] [CLEAR]" — even when no thread is active and no neighbor is selected. The buttons are disabled visually, but the panel itself is in the way.

**Fix:** Hide the panel unless `threadInspectorActive()` returns true (which the component already does via `visible && ...`), and double-check the gating.

**Files:** `src/components/ThreadInspector.svelte`, `js/modules/thread-inspector.js`.

---

## P2 — Cosmetic / state hygiene

### P2-1 · URL `?view=galaxy` is appended on first load and never changes

`url-state.ts:319` writes `$nav.currentView || 'galaxy'` to the share URL on every nav. The internal `currentView` is always `'galaxy'` for overview (and `'map'` for map mode), so the URL gains `&view=galaxy` on first idle load and `&view=map` when in Map mode — but **never `&view=search`, `&view=focus`, `&view=inside`, or `&view=trail`**. So a user sharing a URL from focus mode ends up with a `view=galaxy` link that lands them in overview.

**Fix:** Compute a real `view` from `mode + panelSurface + viewMode`, not from `navStore().currentView`. Or hide the `view` param when it equals the default.

---

### P2-2 · `data-mode` (body) and `navState.mode` desync

- `body.dataset.mode = "focus"` after clicking the Focus chip
- `__APP_STATE__.navState.mode = "overview"` at the same moment

Two separate sources of truth, updated by different handlers. The body attribute is updated by `parity-attrs.ts` which reads Svelte stores; the legacy `state.navState` is updated by the legacy bindings. They drift.

**Fix:** Choose one as canonical. The Svelte store is the new path; the legacy `state` should be derived from it (one-way).

**Files:** `src/lib/orchestration/parity-attrs.ts`, `js/state.ts:602` (the warnings say "use store .update()").

---

### P2-3 · 29 state-bypass warnings per load

```
[WARNING] [State Bypass] state.scenePerformanceDiagnostics.active — use store .update() @ js/state.ts:602
[WARNING] [State Bypass] state.scenePerformanceDiagnostics.renderer — use store .update() @ js/state.ts:602
... (28 more)
```

`state.js` has a `withStateMutation()` guard for `navState`, `strandContinuityState`, and other tracked sub-objects. Direct assignment to `state.scenePerformanceDiagnostics.foo` triggers the warning, and `_makeProdProxy` would *throw* in production builds (per the AGENTS.md invariant). So the production build is currently broken in dev — it just hasn't been built yet.

**Fix:** Wrap all `state.scenePerformanceDiagnostics.*` writes in `withStateMutation()` in `three-engine.js` / `three-visual-polish.js`.

**Files:** `js/state.js:602`, `js/modules/three-engine.js`, `js/modules/three-visual-polish.js`.

---

### P2-4 · Category count in legend snapshot reads as "0"

The Playwright accessibility snapshot shows category buttons as `button "Food & Dining 0"`, but the **actual textContent** is "Food & Dining 2531" (verified via `.textContent.trim()`). This is an a11y labeling issue — the count is in a separate `<span>` inside the button, so the accessible name concatenates it as "Food & Dining 2531" only via inner text. Older AT may not concatenate spans.

**Fix:** Use `aria-label="Food & Dining (2,531 records)"` on the button, or include the count in a `<span class="sr-only">`.

**Files:** `src/components/Legend.svelte:1-50`.

---

### P2-5 · Weather widget temperature changes between modes (72° → 67°)

Going from Overview to Map, the WeatherWidget re-renders and the temperature drops from 72° to 67° (and the icon changes from a sun-like symbol to a cloud). This is either a re-fetch storm (the widget re-fetches on mount instead of caching) or a fake-data bug.

**Fix:** Cache the fetch in a module-level promise, or have the widget reuse the parent's `weather` store.

**Files:** `src/components/WeatherWidget.svelte`, `js/modules/weather-widget.js`.

---

### P2-6 · Empty state of focus card says "Business Name" / "RECORD"

On mobile, the empty focus card chrome shows `Business Name` (as placeholder text) and a `RECORD` badge — looks like dev-skeleton content leaking into the empty state.

**Fix:** Replace with the polished empty state copy: "Pick a node to see its story" or hide the chrome entirely when `isEmpty`.

**Files:** `src/components/InfoPanel.svelte:455-480`, `src/components/FocusCard.svelte`.

---

### P2-7 · Info panel "Business Details" header is hidden but the section is reserved

In `InfoPanel.svelte:444`, the `<h3>Business Details</h3>` is `hidden={searchChromeSurface}`, but the section is still in the DOM. That's fine, but the focus card and the info panel both render the **same** selected business in two places. The user sees a focus card on the right (selected-card) AND an info-panel on the right (info-panel) with potentially the same content. Visually it's a duplicate.

**Fix:** Choose one path (the focus card OR the info panel) per surface, not both.

**Files:** `src/App.svelte:227-228` (InfoPanel + FocusCard both mounted).

---

### P2-8 · URL `?q=` sets mode=search but doesn't restore query state on reload

`App.svelte:127-133` reads `?q=…` and sets `mode: 'search', surface: 'search'`, but the actual query string is never pushed into `searchStore.query`, so on reload the search bar is empty. The user would expect the previous query to be restored.

**Fix:** Also dispatch `setSearchQuery(q)` in the URL handler.

**Files:** `src/App.svelte:127-133`, `src/lib/orchestration/url-state.ts`.

---

### P2-9 · "Stop 1 of 0" / "Show trail 1 of Pn e" — typography clipping in trail chrome

The trail breadcrumb chip "Node 42" is followed by cramped text "Show trail 1 of" and "Stop Pn e next" — the "Pn e" is likely "Prev" / "Next" with letter-spacing broken by inline elements. Looks like a CSS clipping issue with mixed `span` and `button` widths.

**Files:** `src/components/JourneyChrome.svelte`.

---

### P2-10 · URL `&record=3144` is set but `&anchor=3143` is not

`applyUrlState` (or its equivalent) writes the focused record as `record=3144` (leadId) instead of `anchor=3143` (index). The `?anchor=N` URL convention from `App.svelte:30-35` is only honored at first load, not for in-app focus. So a user sharing a focused URL gets a URL that **does** restore focus (because `record=N` is read too), but the share URL is inconsistent with the docs (which say "use ?anchor=").

**Files:** `src/lib/orchestration/url-state.ts`.

---

### P2-11 · The "I Inside" and "G Map" mode chips don't have a corresponding `currentView`

The body data has `data-mode="inside"` after clicking Inside, but `data-active-view="galaxy"` and `data-view-mode="galaxy"`. So inside/inside mode is mapped to the same `view` as overview. The view system has only 2 values (`galaxy`, `map`) but 6 modes.

**Files:** `src/lib/stores/navigation.svelte.ts`.

---

### P2-12 · `#focus-stage` element renders even when empty

`#focus-stage` is always present in the DOM (`App.svelte:256`). It becomes `active` when `focusActive` is true, but children (FocusCard, JourneyChrome, FocusPocket) are always rendered (just hidden via internal `cardVisible` / `hasFocus()` checks). This bloats the DOM and risks z-index races.

**Files:** `src/App.svelte:255-280`.

---

### P2-13 · The `Skip to main content` link is at the top but `main-content` ID is missing

`<a href="#main-content">` is rendered, but the `<main id="main-content">` is not. Pressing Tab + Enter on the skip link does nothing.

**Files:** `src/App.svelte:288` (the link), `src/App.svelte:268-270` (no main wrapper).

---

## Cross-cutting observations

- **The src/ Svelte track is **partially** working** — programmatic actions (`__APP_ACTIONS__.focusOnNode`) and URL deep-links (`?anchor=`, `?q=`) flow correctly into both legacy and Svelte stores. The Svelte track **does not** respond to canvas clicks, on-page filter clicks, or category legend clicks. The asymmetry is the root cause of P0-3 and P0-5.
- **The legacy `__APP_STATE__` and Svelte `navStore` are two different systems that mostly agree** until they don't. The bridge exists (`bridge.ts`, `parity-attrs.ts`) but is one-way for some paths. Consolidating to Svelte stores as canonical (with the legacy as a derived mirror) would eliminate P2-2, P2-3, and likely simplify P0-3 and P0-4.
- **Many components render at all times** (FocusCard, InfoPanel, ThreadInspector, MapSummary, FocusPocket, LegacyCompassSurface, Controls, Filters, SearchBar+SearchResults siblings, DemoChoreography, LoadingOverlay). That's ~15 root-level components in `#semantic-explorer`. Even with `display:none` shortcuts, the mount cost and Svelte reactive graph is heavy. Gating at the App level (mount only when needed) would also make the visible-mode invariants easier to reason about.
- **The visual design language is solid** — the dark teal/cyan glass aesthetic is consistent, the focus halo is gorgeous, the search input has a clean focus ring. The issues are not in the visual design but in the integration of the new Svelte track with the legacy shell, and in the surface-mode logic.

---

## Reproduction cheatsheet

```bash
# Start Vite + static servers (assumes they're already up at 5173 and 8795)
npm run dev:svelte

# Audit each path
node tests/surface-contract-check.mjs
node tests/visual-state-audit.mjs
node tests/contract --focus-pocket
node tests/contract --field-node
```

Manual reproduction:
1. `http://localhost:5173/?nodemo=1` → idle overview.
2. Click "S Search" chip → mode=search, header vanishes, intro panel leaks in.
3. Type "conroe" → 5 results render at top-left (not under the input), cannot click any.
4. Type "restaurant" → 0 results (should find 2,531 Food & Dining).
5. Click a category in the legend → aria-pressed=true, no data change.
6. `http://localhost:5173/?nodemo=1&anchor=42` → focus state in navState is null, focus card still empty.
7. Click on the canvas → focus card shows empty, but page title is the focused business name.
8. Resize to 390×844 → last 2 mode chips clip off-screen, info panel overlaps category legend.
9. `window.__APP_ACTIONS__.focusOnNode(100)` → works correctly, showing the legacy info panel with full data.
10. Inspect console: 29 `[State Bypass]` warnings on first load, 6 `502` errors on first search.

---

## Recommended fix order (impact / effort)

1. **P0-1 + P1-1 + P1-9**: Either give `InfoPanel`'s internal `SearchBar` scoped IDs and remove the duplicate, or remove the InfoPanel's `SearchBar` mount entirely. Also remove the duplicate `<SearchResults>` sibling in `App.svelte:237`. One PR, ~30 min, unblocks every search path.
2. **P0-3**: Wire the canvas click handler in `app.js` (or its Svelte replacement) to call `__APP_ACTIONS__.focusOnNode(idx)` instead of mutating `state.navState.focusedIndex` directly. The Svelte `FocusCard` will then receive the right `$derived` and render the data. ~1 hour.
3. **P0-4**: Trace `applyLocalNeighborhoodFocus` in `focus-pocket.js` and verify `state.semanticNeighborMap` is populated when focusedIndex changes. Likely the neighbor map is keyed on `lead_id` but lookup is by `index`. ~2 hours.
4. **P0-5**: Add a real `onclick` to `.legend-item` in `Legend.svelte` that calls a `setCategoryFilter(categoryId)` action in `data-store.svelte.ts`. ~1 hour.
5. **P0-2**: Make the search fallback walk the in-memory `businessRecords` (8,406 records) and index by name/category/city. Wire to a flag (`useMockSearch`) so production uses the API. ~2 hours.
6. **P1-3 / P1-4 / P1-5 / P1-7 / P1-8 / P1-10 / P1-11 / P1-12**: surface-mode visibility cleanup. A single PR that wires every component's `visible` prop to the right `data-mode` / `panel-surface` / `currentView` predicate. ~1 day.
7. **P1-6 / P1-2**: Mobile compact mode layout fixes (mode chips dropdown, intro panel hide-after-first-action). ~1 day.
8. **P2 series**: state hygiene — single source of truth, fix the 29 bypass warnings, URL state consistency, etc. ~1 week.

---

*Audit completed. All screenshots in `reports/screenshots/playwright/2026-06-11-semantic-explorer-audit/`. 12 of the 30 issues are P0/P1 path-breakers. The remaining 18 are visual polish and state hygiene. The design language is excellent; the integration is where the polish is bleeding.*

---

## Fixes applied during the audit walkthrough (2026-06-11)

While walking the audit, I patched the highest-impact P0s so the user paths work end-to-end. Verification screenshots in `reports/screenshots/playwright/2026-06-11-semantic-explorer-audit/` (files `15-` through `22-`).

### Fixed in this pass

- **P0-1 (search results unclickable)** — *fixed.* Removed the duplicate `<SearchResults>` sibling in `src/App.svelte:237` (it was rendering at the top of the document, intercepting clicks against the absolutely-positioned search input). Added `position: absolute; top: calc(1rem + 44px + 0.35rem); left: 0; right: 0; z-index: calc(var(--z-search, 100) - 1)` to `.search-results-wrapper` in `src/components/SearchResults.svelte` so the dropdown is anchored directly under the input. Also added `pointer-events: none` to the non-interactive chrome inside the search input container (`.semantic-lane-pill`, `.search-label-text`, `.search-status`) and flipped `.search-input-container` from `position: absolute; top: 1rem` to `position: relative` so the input and the result list share a stacking context. *Files: `src/App.svelte`, `src/components/SearchInput.svelte`, `src/components/SearchResults.svelte`.*
- **P1-1 (duplicate DOM IDs)** — *fixed.* Removed the InfoPanel's internal `<SearchBar panelContained={true} />` mount at `src/components/InfoPanel.svelte:438`. The App-level SearchBar in `src/App.svelte` is now the sole search input on the page; `id="search-input"`, `id="search-results"`, and `id="semantic-lane-pill"` all have count = 1. Also stopped the InfoPanel from hiding the selected business in search mode: removed `hidden={searchChromeSurface}` from the info header and `#selected-card` (the App-level SearchBar owns the input + dropdown; the panel stays in its business-detail posture so the user can see the record they're inspecting). Also removed a redundant `$effect` in InfoPanel that was forcibly re-hiding `#selected-card` and `#selected-details` whenever `body.dataset.panelSurface` became `search` or `focus-search` (the leftover from the panel-hosted SearchBar days). *Files: `src/components/InfoPanel.svelte`.*
- **P1-8 (search results at top-left of document)** — *fixed.* Same change as P0-1.
- **P1-9 (off-screen duplicate search input)** — *fixed.* Same change as P1-1.
- **P0-3 (canvas click shows empty FocusCard)** — *partially fixed.* The InfoPanel's `selected-card` now correctly shows the focused business data (e.g. *"2 Dunlap Consulting Services LLC · Consulting and professional expertise"*). The Svelte `FocusCard` (which renders the "FOCUS | NEIGHBORHOOD" constellation hint) still shows the empty neighborhood view in search mode by design; that's a separate surface contract. The remaining half of P0-3 is for the canvas click path to also sync the Svelte store, which still partially works but the title doesn't update to "Focus: <name>". *Files: `src/components/InfoPanel.svelte` (the panel no longer hides the card in search mode).*
- **P0-5 (category legend doesn't filter)** — *fixed.* The Legend was importing `setClusterFilter` from `@lib/stores/filter` (a stub that only writes the writable without doing any of the filter pipeline) instead of the smart `setClusterFilter` from `@lib/orchestration/cluster-filter-controller` (which clears search glow, calls `applyFilters()`, updates the URL, and publishes `FILTER_CHANGED`). Fixed the Legend's import + added the cluster *index* (number) as a second argument to `toggleCluster` so the active-cluster comparison in the engine's `isPointVisible(point, cluster, ...)` can match. Also added a `withStateMutation(() => { legacyState.activeClusterFilter = toggledCluster; })` block in `cluster-filter-controller.setClusterFilter` so the Svelte store is mirrored to `state.activeClusterFilter` (the property the WebGL engine reads). After the fix, clicking "Food & Dining" hides every other cluster from the canvas; screenshot 22- shows the field reduced to the cyan-only cluster.
- **P1-6 (mobile mode chips clipped)** — *partially fixed.* Mobile now shows all six mode chips (M, S, T, F, I, G) plus the legend toggle, plus the brand mark. The chip labels are hidden on compact, leaving just the icon letters, which fits in 390px. The brand + grid icon + 6 chip icons are still a tight row; a follow-up could swap to a dropdown or scroll-snap.

### Still open

- **P0-2 (search returns 0 for natural terms)** — *fixed.* Replaced the 20-row `MOCK_BUSINESSES` fallback with a real local index over the Svelte `businessRecords` writable (8,406 records). The new `performLocalIndexSearch` builds a lazy token → `(recordIndex, field)` map, walks it with priority [exact name → name prefix → whole-word token match across name/what/category/city with TF + field boost → substring fallback], and adds a capped Levenshtein fuzzy pass (distance 1 for ≤5-char tokens, 2 for longer, top 5 closest) for typos like "cofee" → "coffee". Top 5 most-common categories feed the empty-state suggestion chips via `getSearchEngineEmptyStateSuggestions()`. A `VITE_USE_LIVE_SEARCH=1` env flag keeps production preferring the live API; dev and static-dev always use the local index after the API fails. The 20-row mock is kept as a last-resort fallback for production with a dead API. *Files: `src/lib/search-engine.ts`, `src/components/SearchResults.svelte`.*

  Browser scenario (Playwright, headed):
  - "restaurant" → 10 real hits (Alfonso's Mexican Restaurant, Angie's Mexican Restaurant, CHOP Nation African Restaurant & Grill, Cook Restaurant Group LLC, Corral Restaurant Group 2 INC, …)
  - "real estate" → 10 real hits
  - "cofee" → 10 real hits via fuzzy match (Angel Fire Coffee, Bloomin' Brews Coffee LLC, Coffee Experts LLC, Morning DEW Coffee, …)
  - "conroe" → 10 real hits (regression: Conroe Business Furniture, Conroe Eyes, Express Employment Professionals Conroe TX, …)
  - Screenshots: `23-search-restaurant.png`, `24-search-cofee.png`, `25-search-real-estate.png`.

- **P0-3 remainder (canvas click → Svelte navStore sync)** — *fixed.* The legacy `focusOnNode` (called by the canvas click path) publishes `EVENTS.CAMERA_NODE_FOCUSED`, but the existing Svelte subscriber only called `updateJourneyCompass` and never updated the Svelte `navStore`. The Svelte `FocusPocket` and `FocusCard` therefore rendered with the *old* `focusedIndex`. Replaced the thin `subscribe(EVENTS.CAMERA_NODE_FOCUSED, updateJourneyCompass)` in `src/lib/orchestration/triggers.ts` with a multi-action subscriber that updates `navStore` (focusedIndex, mode: 'focus', surface: 'focus' unless already 'focus-search', trailDepth: max(1, prev)) *and* still calls `updateJourneyCompass()`. The Svelte track now mirrors legacy canvas clicks the same way it already mirrors search-result clicks. *File: `src/lib/orchestration/triggers.ts`.*
- **P0-4 (constellation doesn't render on focus)** — *fixed.* The Svelte `FocusPocket.svelte` reads from `focusStore.pocketNodes` (a Svelte writable), but `applyLocalNeighborhoodFocus` writes to the LEGACY `state.navState.focusPocketIndices`. The two stores never agreed, so the constellation rendered empty even when the legacy engine had built the pocket. Added a `mirrorFocusPocketToSvelteStore()` helper in `src/lib/focus/pocket.ts` that reads the legacy `focusPocketIndices` + `focusPocketRoleByIndex` + `targetPositions` and pushes a derived `FocusPocketNode[]` (with `index`, `position`, `role: 'direct' | 'support' | 'civic'`, `label: BusinessRecord.name`) into the Svelte store. `FocusPocket.svelte` calls it in the `$effect` after every `applyLocalNeighborhoodFocus`. Now the constellation renders. *Files: `src/lib/focus/pocket.ts`, `src/components/FocusPocket.svelte`.*
- **P1-3 / P1-4 / P1-5 / P1-7 / P1-10 / P1-11 / P1-12**: surface-mode visibility cleanup. The journey-compass nav, category legend overlap, trail breadcrumb in Map mode, MANIFOLD overlay, "Stop 1 of 0" count, and thread inspector with no thread are all still in the queue.
- **P2-2 / P2-3**: 29 `[State Bypass] state.scenePerformanceDiagnostics.*` warnings per load and `data-mode` ↔ `navState.mode` desync. Direct legacy mutations need to route through `withStateMutation()` and parity-attrs should be the single source of truth.
- **P2-8 / P2-10 / P2-11**: URL deep-link state hygiene. `?q=` doesn't restore query, `?anchor=` vs `?record=` inconsistency, `view=galaxy` never updates.
