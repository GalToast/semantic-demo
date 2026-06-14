# UI/UX Perfection Audit — Ticket A1

**Date:** 2026-06-13
**Auditor:** Claude Opus 4 via Pi worker
**Browser:** Playwright MCP (headless Chromium, headed mode not available in this environment)
**Dev Server:** Vite/Svelte at `http://localhost:5173/`
**Screenshots:** `audit/a1-*.png` (7 captures across 5 states)

---

## Surface inventory

| Component | Role | Always renders | Key z-index |
|---|---|---|---|
| `Canvas` | WebGL 3D field (Three.js) | ✅ | 0 |
| `SemanticOverlay` | Manifold + lens overlays | ✅ | 30 |
| `MapView` | Leaflet geographic map | Conditional (`view=map`) | 50 |
| `Legend` | Category color swatches + counts | ✅ | 50 |
| `WeatherWidget` | Current temp + icon | ✅ (hidden mobile) | 50 |
| `InfoPanel` | Mode selector + business details sidebar | ✅ (gated by `infoPanelOpen`) | 80 |
| `SearchBar` | Composes `SearchInput` + `SearchResults` | Conditional (idle/search) | 100 |
| `Header` | Mode chips + app title | Conditional | 800 |
| `FocusCard` | Selected business detail card | Conditional (`focusActive`) | 600 |
| `JourneyChrome` | Compass header, breadcrumb, trail controls | ✅ (self-gates) | 200 |
| `FocusPocket` | Constellation anchor (3D-only post-Phase-2) | ✅ (inside focus-stage) | — |
| `FocusPocketA11y` | Screen-reader shadow list | ✅ | — |
| `MapSummary` | Mini-map trail SVG | Conditional (has trail) | 50 |
| `CompassRail` | Compass step buttons (mobile/non-compact) | Conditional | 700 |
| `Controls` | Zoom, auto-rotate, reset, share | Conditional | 100 |
| `Filters` | Status/signal/city filters | Conditional (`open`) | 800 |
| `ThreadInspector` | WebGL line overlay | Conditional (self-gates) | — |
| `DemoChoreography` | 9-second guided demo | Conditional | — |
| `LoadingOverlay` | Launch phases + progress bar | ✅ (self-gates) | 3000 |
| `Toast` | Notification toast | Conditional | 1200 |
| `DevGui` / `SpectorInspector` | Dev-only runtime tooling | DEV only | — |

---

## Per-state capture

### Desktop Idle (1440×900)

**Body attrs:** `panelSurface=idle`, `navSurface=idle`, `sceneReady=true`, `demoPhase=IDLE`

| Surface | Geometry | Key computed |
|---|---|---|
| Canvas | (0,0) 1440×900 | z:auto, overflow:clip |
| Info Panel | (338,116) 322×208 | opacity:0, pointer-events:none — **INVISIBLE BUT LAYOUT-PRESENT** |
| Search Bar | — | exists=false (not rendered in idle) |
| Header | (0,0) 1440×61 | z:800, mode chips visible |
| Legend | (16,451) 200×433 | z:50, full height visible |
| Weather | (1314,8) 118×63 | z:50, top-right |
| Controls | (1369,605) 55×279 | z:100, right rail |
| Focus Stage | (1092,904) 332×0 | opacity:0, pointer-events:none, **height=0 off-screen** |
| Journey Chrome | (1175,681) 166×151 | z:200, opacity:1 — **VISIBLE IN IDLE** |
| Filters | (0,0) 0×0 | display:none |

**Observations:**
- Info Panel renders at (338,116) with opacity:0 in idle — ghost layout presence
- JourneyChrome renders visible (opacity:1, z:200) at bottom-right in idle state with overview copy text
- Header shows mode chips: M(Overview), S(Search), T(Trail), F(Focus), I(Inside), G(Map)
- "County-wide overview across all visible records." text at top-right

### Desktop Search (1440×900, `?q=restaurant`)

**Body attrs:** `panelSurface=search`, `navSurface=search`, `searchStatus=empty`

| Surface | Geometry | Key computed |
|---|---|---|
| Info Panel | (16,116) 318×430 | opacity:0.96, z:80 |
| Search Input | (46,208) 364×44 | inside Info Panel |
| Search Results | (33,269) 284×0 | **height=0, no results rendered** |
| Header | — | display:contents (hidden) |
| Legend | (16,451) 200×433 | z:50, overlaps search panel bottom |
| Weather | (1314,8) 118×63 | z:50, expanded to show 67° |
| Controls | (1369,605) 55×279 | z:100, still visible |

**Observations:**
- Info Panel shows OVERVIEW mode selector buttons even when `panelSurface=search` — user sees mode selector instead of search results
- Search Results has 0 height — `searchStatus=empty` despite `?q=restaurant`
- Legend bottom (y:884) overflows past viewport (h:900)
- Header hidden (display:contents) in search — no visible back/escape affordance

### Desktop Focus (1440×900, `?anchor=100`)

**Body attrs:** `panelSurface=focus-search`, `navSurface=focus-search`, `focusedNode=100`, `trailState=active`

| Surface | Geometry | Key computed |
|---|---|---|
| Focus Stage | (0,0) 389×900 | display:flex, opacity:1, z:100 |
| Focus Card | (1164,575) 260×239 | z:600, fixed position, bottom-right |
| Journey Chrome | (97,545) 194×283 | z:200, shows trail info |
| Map Summary | (16,679) 180×125 | z:50, mini-map trail |
| Legend | (16,451) 200×433 | z:50, **overlapping Journey Chrome and MapSummary** |
| Info Panel | — | display:none (correct) |
| Controls | — | exists=false (correct for focus-search) |
| Weather | — | display:none (correct) |
| Header | — | display:contents (hidden) |

**Observations:**
- Focus Card positioned at bottom-right (1164,575) — quite low on screen, near controls area
- **Bottom-left collision:** Legend (y:451–884), JourneyChrome (y:545–828), and MapSummary (y:679–804) all overlap in the same region
- "MANIFOLD #100 Semantic proximity active" indicator at top-center

### Desktop Map (1440×900, `?view=map`)

**Body attrs:** `panelSurface=map-idle`, `activeView=map`, `graphContext=map`

| Surface | Geometry | Key computed |
|---|---|---|
| Map View | (0,0) 1440×900 | z:50, full-screen Leaflet |
| Info Panel | (16,0) 320×900 | z:80, full-height sidebar |
| Legend | (16,451) 200×433 | z:50, **overlapping Info Panel sidebar** |
| Controls | (1274,782) 156×108 | z:100, grid layout (map controls) |
| Search Bar | — | exists=false (but search input visible in sidebar) |
| Header | — | exists=false (correct for map) |
| Weather | — | display:none |

**Observations:**
- Info Panel becomes a full-height sidebar (320×900) — correct map behavior
- **Legend overlaps sidebar:** Legend at (16,451) sits on top of Info Panel at (16,0) width 320
- Mode selector floats center-screen with MAP highlighted
- "Choose a business to map its neighborhood" empty state card in center

### Mobile Idle (390×844)

**Body attrs:** `compact=true`, `mobile=true`, `panelSurface=idle`

| Surface | Geometry | Key computed |
|---|---|---|
| Header | (0,0) 390×58 | z:800, mode chips as single-letter icons |
| Legend | (16,395) 200×433 | z:50, **extends past bottom (395+433=828, near viewport 844)** |
| Controls | (327,493) 55×279 | z:100, right rail |
| Info Panel | (0,0) 0×0 | display:none (correct for mobile) |
| Weather | (0,0) 0×0 | display:none (correct) |
| Journey Chrome | (125,697) 166×95 | z:200, opacity:1 — **VISIBLE IN IDLE** |
| Focus Stage | (42,848) 332×0 | height=0, off-screen |
| Compass Rail | — | exists=false (correct) |

**Observations:**
- Legend consumes 48% of viewport height on mobile
- Header mode chips are single-letter icons (M, S, T, F, I, G) with no text labels
- JourneyChrome visible at bottom-center in idle (z:200, opacity:1)
- "SEARCH" floating label visible at top-left

### Mobile Focus (390×844, `?anchor=100`)

**Body attrs:** `compact=true`, `mobile=true`, `panelSurface=focus-search`, `focusedNode=100`

| Surface | Geometry | Key computed |
|---|---|---|
| Focus Card | (12,10) 260×186 | z:600, fixed, top-left |
| Focus Stage | (0,0) 332×844 | z:100, full height |
| Info Panel | (10,196) 370×248 | z:80, overlapping focus card |
| Journey Chrome | (83,228) 166×550 | z:200, fixed, tall |
| Compass Rail | — | exists=false (correct for compact? should show) |
| Legend | (-225,395) 200×433 | **OFF-SCREEN LEFT (x=-225)**, still rendered |
| Map Summary | — | display:none (correct) |
| Controls | — | exists=false (correct) |

**Observations:**
- **Legend off-screen but still rendered:** x=-225 means it's translated off the left edge but display:block, visibility:visible, opacity:1 — wasted resources
- Focus Card at (12,10) overlaps Info Panel at (10,196) — stacked vertically with tight margins
- JourneyChrome at (83,228) is 550px tall — consumes most of the screen below the header
- Compass Rail absent on mobile despite compact mode — users lose navigation affordance

### Demo (`?demo=force`)

- Demo ran to COMPLETE phase in <4 seconds (too fast to capture intermediate phases)
- Final state returned to idle: `demoPhase=COMPLETE`, `panelSurface=idle`
- No console errors during demo execution

---

## Tier-1 priority list

### HIGH

1. **[HIGH] Info Panel: Ghost layout in idle state** — Info Panel renders at (338,116) 322×208 with opacity:0 and pointer-events:none in idle. It has a real layout box (not display:none). This means it intercepts layout calculations and may cause unexpected spacing. *Suggested fix: gate rendering with `{#if}` or use `display:none` when not active.*

2. **[HIGH] JourneyChrome: Visible in idle state** — JourneyChrome shows at (1175,681) 166×151 with opacity:1 and z:200 in both desktop and mobile idle. It displays overview copy text ("Overview | Montgomery County") that duplicates the Info Panel content. On mobile it's even more prominent at (125,697) 166×95. *Suggested fix: gate JourneyChrome visibility behind `focusActive` or a journey-specific condition.*

3. **[HIGH] Legend/Info Panel collision in search and map** — In search state, Legend (y:451–884) overlaps the bottom of Info Panel (y:116–546). In map state, Legend (16,451) 200×433 sits directly on top of the Info Panel sidebar (16,0) 320×900. *Suggested fix: reposition Legend in search/map states, or auto-hide when Info Panel content extends into its region.*

4. **[HIGH] Bottom-left triple collision in focus** — Legend, JourneyChrome, and MapSummary all overlap in the bottom-left quadrant (x:16–290, y:451–884). Visual evidence: Legend at (16,451), JourneyChrome at (97,545), MapSummary at (16,679). *Suggested fix: define a bottom-left layout contract that stacks these surfaces vertically or collapses Legend when trail/map-summary is active.*

5. **[HIGH] Legend off-screen but rendered on mobile focus** — Legend is at x=-225 (off-screen left) but still has display:block, visibility:visible, opacity:1. It's fully rendered in the DOM and consuming GPU/compositor resources while invisible. *Suggested fix: use display:none when translated off-screen, or conditionally unmount.*

### MEDIUM

6. **[MED] Search Results: Zero height despite query** — With `?q=restaurant` and `panelSurface=search`, search results container has 0 height (284×0). The `searchStatus=empty` attribute suggests the search didn't populate. *Suggested fix: verify search state machine handles URL-initiated queries correctly.*

7. **[MED] Info Panel shows mode selector in search state** — When `panelSurface=search`, the Info Panel still shows OVERVIEW/SEARCH/FOCUS/INSIDE/MAP mode buttons instead of search results. The user sees mode selection in a search context. *Suggested fix: Info Panel content should reflect the current panelSurface, not always show mode buttons.*

8. **[MED] Focus Card positioned at bottom-right (desktop)** — Focus Card at (1164,575) is 260×239 positioned near the bottom-right, below center. This forces users to look away from the main field focus area. *Suggested fix: consider centering or positioning relative to the focused node's screen projection.*

9. **[MED] Mobile header mode chips are single-letter icons** — On mobile, header shows M, S, T, F, I, G as individual clickable targets (77–62px wide each). These are hard to distinguish and tap accurately. *Suggested fix: use icons or a hamburger/dropdown for mobile mode switching.*

10. **[MED] Legend extends to viewport edge on mobile idle** — Legend at (16,395) 200×433 extends to y:828, only 16px from the 844px viewport bottom. Near-clipping risks on shorter devices. *Suggested fix: add bottom margin or make Legend collapsible on mobile.*

11. **[MED] No visible back/escape affordance in search state** — Header is hidden (display:contents) in search state. The search input has a clear button, but there's no visible way to return to overview besides pressing Esc or clicking a mode chip that doesn't exist. *Suggested fix: show a minimal back button or breadcrumb in search state.*

12. **[MED] Compass Rail absent on mobile focus** — In mobile focus state (`compact=true`), Compass Rail doesn't render (exists=false). The AGENTS.md notes it should show for non-compact, but mobile users in focus state lose the step-navigation affordance. *Suggested fix: verify if Compass Rail is intentionally hidden on mobile or if this is a regression.*

### LOW

13. **[LOW] Weather Widget hidden on mobile** — Weather Widget has display:none on mobile. This is intentional per design, but users on mobile never see weather context. *Consider: show a compact weather icon in the header.*

14. **[LOW] Controls hidden in focus-search state** — Camera controls (zoom, rotate, reset, share) are hidden when `panelSurface=focus-search`. Users can't zoom in/out while exploring a focused node's neighborhood. *Consider: show minimal controls or allow pinch-zoom.*

15. **[LOW] Demo runs too fast to observe** — The 9-second demo choreography completed in <4 seconds. This may be timing-related to the dev environment or a regression in the demo phase durations. *Suggested: verify phase timing targets (GLIDING 1400ms, ARRIVED immediate, CARD_VISIBLE 1800ms, PULLBACK 1200ms, RETURNING 1000ms).*

16. **[LOW] `!important` usage in CSS** — 7 total `!important` declarations across 5 files: `clusters.css` (1), `mobile_base.css` (2), `mobile_premium__chrome.css` (1), `strands.css` (2), `src/lib/css/biofield.css` (1). Per AGENTS.md, `!important` is a specificity-conflict signal. *Recommended: resolve underlying specificity in a follow-up sweep.*

---

## Ownership smells

1. **Info Panel content ownership** — The Info Panel renders mode selector buttons (OVERVIEW, SEARCH, FOCUS, INSIDE, MAP) in all states, not just idle. This suggests the mode-selector content is owned by InfoPanel.svelte but should be gated by `panelSurface`. The 764-line component likely has internal state logic that doesn't fully respect the body data-attribute contract.

2. **Legend positioning across states** — Legend is at (16,451) in all states (idle, search, focus, map). It doesn't reposition when other panels (Info Panel sidebar, JourneyChrome) occupy the same region. This is a layout ownership smell — Legend should react to sibling panel presence.

3. **JourneyChrome idle content** — JourneyChrome renders overview text ("Overview | Montgomery County", "Start wide, then search by need...") in idle state despite being a journey-focused component. This content overlaps with Info Panel's overview content, suggesting unclear content ownership between the two.

---

## State machine gaps

1. **`searchStatus=empty` with `?q=restaurant`** — URL-initiated search query doesn't populate search results. The search state machine may not process URL params correctly in the Svelte track.

2. **JourneyChrome in idle** — The journey phase is `idle` and compass is `idle`, but JourneyChrome renders visible content. The component should gate its own visibility behind a journey-active condition.

3. **Info Panel mode selector in search** — `panelSurface=search` but Info Panel shows mode selection. The panel content should switch to search results or search-context content.

---

## Z-index / stacking

The z-index system is well-structured via `Z_LAYERS` in `src/lib/z-index.ts`:

| Layer | Value | Used by |
|---|---|---|
| canvas | 0 | Three.js canvas |
| legend | 50 | Legend, MapSummary |
| panels | 80 | Info Panel |
| search | 100 | Search input/results |
| journeyChrome | 200 | Journey chrome |
| focusCard | 600 | Focus card |
| compass | 700 | Compass rail |
| controls | 800 | Header, Controls, Filters |
| toast | 1200 | Toast |
| loading | 3000 | Loading overlay |

**Issues:**
- `mobile_premium__focus-dive.css` has hardcoded `z-index: 1200` and `z-index: 1201` (lines 1701, 1716) instead of using `var(--z-*)` tokens. This bypasses the managed system.
- Controls at z:800 shares the same layer as Header (z:800) and Filters (z:800). This is fine for non-overlapping surfaces but could cause confusion if they overlap.

---

## Accessibility gaps

1. **Info Panel complementary landmark has no accessible name** — The Info Panel renders as `complementary` with no `aria-label`. Screen readers announce it as a generic complementary region.

2. **Mode radio buttons use single-letter visible text** — Radio buttons show "M Overview", "S Search", etc. The single-letter prefixes (M, S, T, F, I, G) have no semantic meaning and confuse screen readers.

3. **JourneyChrome group has no accessible name** — The `group` element at (1175,681) contains trail/navigation content but has no `aria-label`.

4. **Focus Card business name truncated** — "3RD GEN CONSTRUCTIO..." is visually truncated. No `title` attribute or `aria-label` provides the full name.

5. **Legend buttons lack state indication** — Category filter buttons (e.g., "Food & Dining 2531") don't indicate active/inactive state to screen readers.

---

## Responsive gaps

1. **Mobile focus: Legend off-screen** — Legend is translated to x=-225, wasting render resources.
2. **Mobile idle: Legend near-clipping** — Legend extends to y:828 in an 844px viewport (16px margin).
3. **Mobile header: Mode chips are tiny** — Single-letter icons at 6–15px font size are hard to read and tap.
4. **Desktop search: Legend overlaps Info Panel** — No responsive repositioning when both panels are visible.
5. **Desktop map: Legend overlaps sidebar** — Legend sits on top of the Info Panel sidebar in map view.

---

## What I did NOT touch

- **Source code in `src/` or `js/`** — Audit only, no edits
- **CSS cascade files** — Read-only analysis
- **The 7 off-limits state writers** — journey.js, lifecycle.js, ui-renderers.js, focus-pocket.js, journey-compass-state.js, deploy scripts
- **Engine kernel** — js/modules/* (Three.js, shaders, instanced meshes)
- **LoadingOverlay** — Only visible during initial load; captured as "hidden" in all post-load states
- **ThreadInspector** — Didn't trigger a thread-inspection state; exists=false in all captured states
- **Demo intermediate phases** — Demo completed too fast to capture GLIDING/ARRIVED/CARD_VISIBLE/PULLBACK/WIDE_VIEW/RETURNING phases individually

---

## Suggested next tickets

### UI-1: Fix JourneyChrome idle visibility [small, 1 session]
Gate JourneyChrome rendering behind `focusActive` or journey-phase != idle. Remove the idle-state overview text that duplicates Info Panel content. Impacts: idle, mobile idle, mobile focus.

### UI-2: Resolve bottom-left surface collision in focus [medium, 1 session]
Define a vertical stack contract for Legend, JourneyChrome, and MapSummary in the bottom-left quadrant. Options: (a) auto-collapse Legend when trail/map-summary is active, (b) stack vertically with scroll, (c) move MapSummary to bottom-right. Impacts: desktop focus, mobile focus.

### UI-3: Fix Legend positioning across states [small, 1 session]
Reposition or auto-hide Legend when Info Panel sidebar (map view) or search panel occupies the same region. Add `display:none` when translated off-screen (mobile focus). Impacts: map, search, mobile focus.

### UI-4: Fix Info Panel mode-selector in search [medium, 1 session]
Info Panel content should reflect `panelSurface` — show mode selector only in idle, search results or search context in search, business details in focus. Impacts: search state UX.

### UI-5: Search URL query not populating results [medium, 1 session]
Investigate why `?q=restaurant` results in `searchStatus=empty` and 0-height search results. May be a timing issue with URL state application in the Svelte track. Impacts: shared URLs, deep linking.

---

## Summary

| Metric | Value |
|---|---|
| States captured | 7 (desktop idle, desktop search, desktop focus, desktop map, mobile idle, mobile focus, demo) |
| Tier-1 HIGH issues | 5 |
| Tier-1 MED issues | 7 |
| Tier-1 LOW issues | 4 |
| Total tier-1 issues | 16 |
| Ownership smells | 3 |
| State machine gaps | 3 |
| Z-index conflicts | 2 (hardcoded values in mobile_premium__focus-dive.css) |
| A11y gaps | 5 |
| Responsive gaps | 5 |
| Suggested next tickets | 5 (UI-1 through UI-5) |

### Top 5 issues

1. **JourneyChrome visible in idle** — Renders overview content that duplicates Info Panel, visible in all idle states on desktop and mobile
2. **Bottom-left triple collision** — Legend + JourneyChrome + MapSummary overlap in focus state
3. **Legend off-screen but rendered on mobile** — x=-225, still display:block, wasting resources
4. **Info Panel ghost layout in idle** — opacity:0 but layout-present (322×208 box)
5. **Search URL query not populating** — `?q=restaurant` produces empty results

### Surprises

- **Demo ran in <4s** — Much faster than the 9-second spec. May be timing-related to dev environment or a phase-duration regression.
- **Info Panel shows mode selector in all states** — Not just idle; this is the primary content of the panel even in search/focus contexts.
- **Mobile Compass Rail absent** — Not rendering in mobile focus despite compact mode, losing navigation affordance.
