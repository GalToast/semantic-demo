# Round 7 Walkthrough — UI/UX Findings

**Date:** 2026-06-11  
**Viewport tested:** Desktop 1440×900, Tablet 768×1024, Mobile 390×844  
**States tested:** Idle, Search, Focus, Trail, Map, Mobile idle

---

## 🔴 Critical

### 1. Search relevance is broken
Searching "coffee" returns **1 result: "Conroe Business Furniture"**. A furniture company is not coffee. The search ranking/filtering appears to be completely non-functional or returning a default/wrong result. This is the core interaction of the app.

**Investigation note:** The dev repro did not return the exact furniture result; `api.php?action=semantic_search&q=coffee&limit=18&offset=0` returned **502 Bad Gateway** because the PHP backend on `127.0.0.1:8795` was offline, and `data.dat` also failed to load (`ERR_CONNECTION_REFUSED`). The frontend then fell back to a 20-row mock catalog and returned **"Conroe Coffee Roasters"**, which is coffee-relevant. This means the original "furniture" result likely came from a live/backend/local-index path rather than the current mock fallback. The real production risk is that search quality silently collapses to a tiny fallback or stale/degraded backend path when the semantic service/data path is unavailable.

**Live verification:** after starting the PHP backend on `127.0.0.1:8795`, the live API returned **34 coffee-relevant results** in `mode: local_record_search_v1`, `source: local-records`, `retrieval_source: lexical_fallback`, with top names including `519-angel-fire-coffee`, `7912-urban-grinds-coffee-company-llc`, `BLOOMIN' BREWS COFFEE LLC`, `1620-coffee-experts-llc`, and `7939-valentinas-coffee-llc`; the first 18 contained no furniture result. The Svelte frontend was then making the same API call through the Vite proxy, but it displayed unrelated local records because service-backed rows were being mapped into `SearchResult.index` and the UI treated that value as a local-record array index. Fixed by carrying service-backed display/focus data in `SearchResult.point` and using the result order as the UI index. Also fixed URL/search-family surface restoration so the search drawer owns the `search` surface and `#info-panel` contains the search chrome. Verified rendered results now show the coffee businesses above instead of unrelated local records. Also hid the search input's stale "No matching businesses found." status when results are present.

### 2. Ghost bar chart on idle (and persists across states)
The center info card on idle shows **5 empty gray bars** with no labels, no values, no axes. They look like skeleton loading placeholders that never populated. Visible in: idle, search, focus, trail, map. This is the most visually broken element — it makes the app look unfinished.

**Fix note:** the visible bars were the legacy journey-compass step spans, not selected-business rows. `src/components/LegacyCompassSurface.svelte` now renders phase labels (`overview`, `search`, `focus`, `inside`, `map`) instead of empty spans, and `src/App.svelte` gates the duplicate `FocusCard` to `focusActive`. Verified on idle: only one `#selected-card`, one `#info-panel`, one `#journey-compass`; step text is present.

---

## 🟠 Major

### 3. "Pulling back…" transient state on fresh load
On first load, the bottom center shows an **× button + "Pulling back…"** text that lingers for several seconds then fades. The × button persists even after the text disappears. Purpose is unclear — no tooltip, no visible action when clicked.

### 4. Duplicate info panels on idle
Two overlapping cards appear on idle:
- Card A (ref=e111): "Overview | Montgomery County / The MoCo Mycelium" — this is the visible one
- Card B (ref=e116): Has the numbered steps (1–5), "Search" and "Map" buttons, and repeats "Overview | Montgomery County / The MoCo Mycelium"

Card B appears to be a ghost/duplicate that bleeds through. The step numbers ("1. overview: See the whole county") overlap the category legend.

**Fix note:** `FocusCard` is now gated by `focusActive` in `src/App.svelte`, so idle no longer renders a second selected-card surface. Verified DOM counts on idle: `#info-panel=1`, `#selected-card=1`, `#journey-compass=1`.

### 5. Journey compass bleeds into category legend
The "Journey navigation" panel (overview, search, focus, inside, map steps) renders as a semi-transparent overlay **on top of** the category legend on the left. The step labels clip over category names (e.g., "g" from "Shopping" sits next to "I Services").

**Fix note:** desktop repro after the compass-label/gating fix showed no horizontal overlap between `#journey-compass` and `#legend-panel`; only a small vertical overlap remained. The previous bleed was driven by the duplicate journey surface/empty-step rendering rather than a remaining desktop compass-vs-legend collision.

### 6. "Business Details" empty panel hogs mobile/tablet screen
On mobile (390px) and tablet (768px), the empty-state "Business Details / Select a business to see details" panel takes up **~40% of the viewport**. Combined with the search bar at top, the actual 3D visualization is squeezed into a narrow middle band.

**Fix note:** `InfoPanel` now closes when idle (`open={infoPanelOpen}` in `src/App.svelte`, and `hidden={!panelOpen}` in `src/components/InfoPanel.svelte`). Verified after reload: idle `#info-panel` is `hidden=true` with `0×0` geometry on desktop/tablet/mobile, so the empty details sheet no longer consumes idle viewport space. The category legend also stops being pushed above the info sheet on narrow/tablet idle layouts.

---

## 🟡 Moderate

### 7. Status text leaks to users
- **Fixed:** the stale "No matching businesses found." status under the search bar no longer appears when results are present.
- **Fixed:** internal ranking labels were converted to user-facing copy: `"1 anchor"`/`"Anchor"` became `"Top match"`, `"#2"` became `"Match 3"`, and `"Strong"` became `"Strong match"`.

### 8. Navigation labels are single letters on mobile/tablet
The top nav shows just **M, S, T, F, I, G** without the full word labels. At 390px the letters are ~10px and hard to tap. No tooltips explain what they mean.

### 9. Category legend hidden on mobile and tablet
The entire CATEGORIES panel (15 items with counts) is **not visible** on mobile or tablet. No toggle or hamburger reveals it. Users lose the color-coding context for the node cloud.

### 10. Map view: info card overlaps the map
The "MAP | PHYSICAL DISTANCE / Montgomery County Map" card with ghost bars sits in the upper-right quadrant, covering a significant portion of the map area. The category legend also overlaps the left edge of the map.

### 11. Truncated text on Map
The header area shows "8,406 businesses - 8,1…" — the second number is cut off mid-digit.

### 12. Weather widget is unexplained
A "🌬 85°" widget appears in the top-right. It's not clear if this is real weather, simulated ambient data, or decorative. No tooltip on hover.

---

## 🔵 Minor / Polish

### 13. Map is SVG, not Leaflet (by design, but confusing)
The map says "Stylized SVG · no external map tiles". Users who click "MAP" in the nav may expect a real geographic map (Google/Leaflet). The SVG abstraction is fine as a design choice, but there's no explanation.

### 14. "Close category legend" button icon is unclear
The × icon next to "Semantic Explorer" in the header closes the category legend, but the icon doesn't clearly communicate that. First-time users won't know what it does.

### 15. No onboarding or first-run guidance
The idle state gives no hint about what to do first. The "Start wide, then search by need…" text is small and easy to miss. A "Surprise Me" or "Try searching for coffee" nudge would help.

### 16. X button at bottom center persists across all states
A small × button sits at the bottom center in every state. It doesn't appear to do anything when clicked and has no tooltip. Likely a leftover from the guided demo dismiss.

### 17. 29 console warnings on every load
All warnings are `[State Bypass] state.scenePerformanceDiagnostics.*` — direct property mutation instead of store `.update()`. Not user-facing but indicates tech debt.

---

## Summary by state

| State | Ghost bars | Overlap | Status leaks | Mobile issues |
|-------|-----------|---------|-------------|---------------|
| Idle | ✅ Fixed labels | Duplicate cards, compass bleeds | — | No categories; huge empty panel now hidden on idle |
| Search | ✅ Fixed labels | Journey overlay | ✅ Status leaks fixed | — |
| Focus | ✅ Fixed labels | — | ✅ Status leaks fixed | — |
| Trail | ✅ Fixed labels | — | "TRAIL EMPTY" (OK, informative) | — |
| Map | ✅ Fixed labels | Card covers map | Truncated count text | — |
