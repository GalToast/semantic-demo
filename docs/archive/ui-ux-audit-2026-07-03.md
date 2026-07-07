# UI/UX Audit — 2026-07-03

## Scope

Desktop first-visit journey (1440×900), idle → splash → welcome → search-ready state. Inspection via native Playwright accessibility snapshots + programmatic DOM/layout evaluation + console diagnostics. Parallel session mid-flight on UX surfaces; this is read-only findings, not fixes.

## Methodology

1. **Accessibility snapshots** (Playwright) across 3+ page states with bounding boxes for collision detection.
2. **Programmatic DOM evaluation** — overlap, off-screen, visibility, data-content, and canvas render-state checks.
3. **Console warning audit** — all browser-level warnings captured.
4. **API health check** — `api.php` reachable but degraded (`semantic_service_offline`, lexical fallback).

## Findings

### CRITICAL

**1. 3D scene not ready within 10 seconds — degraded captions-only mode**

- Console: `[DemoChoreography] Canvas did not become ready in 10s; running demo in degraded mode (captions without 3D scene).`
- Canvas element exists (`<canvas data-engine="three.js r184" width="1440" height="900" role="application">`) and wrapper has `canvas-ready` class.
- But `engineReady` signal never fires in time, so DemoChoreography falls back to captions — no 3D mycelium, just text.
- First-visit user sees a 3D-themed app with ZERO 3D content. This is a catastrophic first-impression failure.
- APIs: 8795 peer returns `ok:true` but `degraded:true` (semantic service offline). The data pipeline may be slow to return 8,406 records.
- Screenshot: `ux-idle-desktop-1440.png` (saved to repo root).

**2. Disposable registry leak warnings (3×)**

- Console: `[view-controller] Adding disposable after disposeAll() — leak risk` repeated 3 times on every page load.
- Source: `src/lib/utils/disposable-registry.ts:32`
- Accumulated leaks over multiple page mounts (HMR reloads) will grow memory. In production, the first-visit will have 3 leaks; no accumulated effect unless the user navigates back-and-forth triggering mount cycles.

### HIGH

**3. Splash re-fires on every App re-mount**

- Observed: after escape-dismissing the welcome dialog, an `app-init` re-run (Vite HMR or view-controller re-bootstrap) re-showed the initial splash dialog.
- The first-visit splash logic is not guarded against re-mounts — any hot-reload or view-controller re-init triggers the splash again.
- Dev impact: every HMR save shows splash to the developer, breaking the dev cycle.
- Prod impact: if the user hits browser refresh, the splash re-appears (potentially intentional for first-visit, but the behavior after dismissal is not persisted).

**4. Two search inputs on first paint**

- Splash dialog contains its own search: `searchbox "Search Montgomery County businesses" [active]` + `button "Search"`.
- Business context panel independently contains: `combobox "Search businesses"` with `/` shortcut hint.
- Both visible simultaneously on first paint. The splash search is active; the panel search is in a `<search>` landmark.
- Cognitive load: user sees two search boxes, one in a modal, one in the page — confusing.

**5. Category legend always collapsed off-screen**

- The `complementary` Categories panel is positioned at `x=-230` (off-screen to the left) with width 205px — only 25px of the 205-wide drawer is visible at the left edge, and the text content starts at `x=-218` (entirely off-screen).
- Contains 21 category buttons with counts (General Business 2531, etc.) and "10 of 21 shown / scroll for more ↓".
- Only accessible via the "Open category legend" button in the header. Without clicking it, the user never sees the category metadata — a critical part of the mycelium exploration UX.
- **Recommendation:** Default to visible (or partially visible) on desktop where there's ample empty space.

**6. City filter dropdown data quality**

- The city filter `<select>` (opened from the "Filters" toggle) contains **garbage user-facing values**:
    - **Street address as city:** `"13070 S. HWY 242 Conroe (1)"` — a full street address ended up in the city field.
    - **Case duplicates:** `"Cut And Shoot (13)"` and `"Cut and Shoot (1)"` — same city, two entries due to inconsistent casing.
    - **Typo:** `"Clevland (1)"` vs `"Cleveland (796)"` — a misspelling creates a separate entry.
    - **Alternate spelling:** `"Cold Spring (1)"` vs `"Coldspring (2)"` — same place, two forms.
    - **Malformed city value:** `"unknown (Conroe (1)"` — literally `unknown (Conroe` with broken parentheses.
    - **ZIP code with note:** `"77301 (2nd location: 12762 Hwy 105 E (1)"` — a ZIP code and a parenthetical address note as a city.
- Root cause: commit `d9b086f5` changed the city dropdown from 5 hardcoded values to derived from business records without sanitizing the source data.

**7. First-visit dual-dialog stack**

- After dismissing the splash (Explore), a **welcome dialog** appears (`dialog "Explore Montgomery County businesses visually"` with "Got it" button AND quick-start list).
- Simultaneously, a **bottom-center toast** (`status` at 540,819, 360×65) remains visible with a close-X button.
- Two first-time guidance cues at once = redundant and confusing. The welcome dialog should suppress the toast, or the toast should auto-dismiss when the welcome dialog opens.

### MEDIUM

**8. Empty `<list> "Neighborhood businesses"` at 1×1 px**

- In the idle overview state, the `list "Neighborhood businesses"` element is rendered at `box=-1,27,1×1` — a 1-pixel degenerate element.
- It's semantically exposed as a list with no items, yet occupies a slot in the accessibility tree. Screen readers will announce an empty list.
- **Recommendation:** Hide (aria-hidden or display:none) when empty, or render only when populated.

**9. "All Cities (0)" on startup**

- On initial page load, the city filter select shows only 1 option: `"All Cities (0)"` with count zero.
- After the data pipeline completes, the full city list (30+ entries) populates. But the transition from 0 to 30+ entries is jarring and the user may click "All Cities (0)" before data loads, seeing a meaningless filter.
- **Recommendation:** Show a loading placeholder or defer filter rendering until data is available.

**10. Lock emoji in disabled radio buttons**

- Trail/Focus/Inside mode radios are disabled (`[disabled]`) and contain `🔒` as text content inside the radio.
- Screen readers will read the emoji as "lock" or "U+1F512". The affordance is clear (locked = needs a selected business), but the emoji-as-text is a mild a11y concern.
- **Recommendation:** Replace `🔒` with an `<img>` with `alt="Locked — requires a selected business"` or use `aria-label` with descriptive text.

### LOW

**11. Font preload unused**

- Console: `nunito-sans-latin-29e3890496.woff2 was preloaded using link preload but not used within a few seconds. Please make sure it has an appropriate 'as' value and it is preloaded intentionally.`
- The preload `<link>` tag has wrong `as` value or the font file isn't consumed by the CSS within the window's load event. Browser warning, no functional impact on rendering.

**12. Weather widget (89°)**

- New widget at top-right: `"Weather conditions for Montgomery County"` with a button `"Toggle weather details — current conditions for Montgomery County"` showing `89°`.
- Relevance to a business mycelium visualization is unclear; may be flavor or distraction. The widget is new (W46 weather-widget case study).
- **Recommendation:** Verify with user — is weather data valuable for business exploration context? If not, consider removing or making opt-in.

**13. Camera controls toolbar**

- Vertical toolbar at right: Zoom in, Zoom out, Reset view, Toggle auto-rotate, Share link (5 buttons, 44×44 each).
- Positioned at x=1369–1424 (within viewport, 16px right margin). Vertically from y=610 to y=884.
- Auto-rotate toggle is present but the scene has no visible 3D content, so its behavior is untestable in this audit.

## Harness Friction (not a product issue)

- The `mcp` gateway requires `args` as a JSON string literal, but the project's own `mcp-subagent-dispatch-routing` skill documents `mcp({ tool, args: {object} })`. The gateway rejects object args → validation error "must be string".
- **Workaround:** `tool_profile action=add` to add playwright DUAL tools natively, then call them with normal object args. This bypasses the string gateway entirely.
- Verified: `tool_profile(action: "add", tools: ["playwright_browser_navigate", ...])` works and adds 13 playwright tools to the active profile (27/116 active).
- Memory note saved for future sessions.

## Console warnings (full list from first load)

| #   | Source             | Message                                                                                            |
| --- | ------------------ | -------------------------------------------------------------------------------------------------- |
| 1   | `app-init`         | Starting Svelte-first initialization…                                                              |
| 2   | `app-init`         | Initialization orchestration complete.                                                             |
| 3   | `DemoChoreography` | **Canvas did not become ready in 10s; running demo in degraded mode (captions without 3D scene).** |
| 4   | `view-controller`  | **Adding disposable after disposeAll() — leak risk**                                               |
| 5   | `view-controller`  | **Adding disposable after disposeAll() — leak risk**                                               |
| 6   | `view-controller`  | **Adding disposable after disposeAll() — leak risk**                                               |
| 7   | Browser            | Font preload not used: nunito-sans-latin-29e3890496.woff2                                          |
| 8   | `audio`            | Reactive scape initialized.                                                                        |

## States inspected

- Desktop 1440×900: idle/overview with splash, post-splash welcome dialog, post-welcome idle overview, search mode (attempted), Focus mode (not reached — timing constraint).
- Mobile 375×667: not inspected (parallel session mid-flight; resize to mobile would be the next step).
- Map mode: not inspected.
- Filter dropdown: not opened (city data quality from initial snapshot).

## Priorities

1. **Fix 3D scene readiness** (finding #1) — solve engineReady timeout or data pipeline delay.
2. **Fix disposable registry leaks** (finding #2) — reorder disposeAll/add sequence.
3. **Sanitize city data** (finding #6) — normalize city values, dedup by case, flag malformed entries.
4. **Fix splash re-fire** (finding #3) — guard first-visit splash against re-mounts.
5. **Collapse dual first-visit dialogs** (finding #7) — suppress toast when welcome dialog opens.
6. **Show category legend by default** (finding #5) — on desktop, expand or partially show the legend.
