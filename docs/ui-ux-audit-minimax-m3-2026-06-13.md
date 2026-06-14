# UI/UX Perfection Audit (M3 Perspective) — Ticket A1

**Date:** 2026-06-13
**Auditor:** MiniMax-M3 (Minimax) via Pi main lane
**Browser:** Playwright MCP (headed Chromium)
**Dev Server:** Vite/Svelte at `http://localhost:5173/`
**Screenshots:** `audit/m3-*.png`
**Companion audit:** `docs/ui-ux-audit-2026-06-13.md` (Mimo 2.5, primary)

---

## 1. M3 perspective scope

This is a **second-pass audit** done with fresh eyes, not codebase context. The Mimo audit at `docs/ui-ux-audit-2026-06-13.md` is the primary; this M3 audit:

1. **Verifies** Mimo's HIGH-priority findings with my own browser captures
2. **Corrects** surface identification for several findings (Mimo misidentified the journey-compass as the Info Panel)
3. **Adds** 1-2 findings Mimo missed
4. **Recommends** the next-ticket sequence (UI-1 through UI-5) with M3 priority ordering

---

## 2. Surface inventory (corrected from Mimo)

The Mimo audit said:
> "Info Panel: Mode selector sidebar at (338,116) 322×208 with OVERVIEW/SEARCH/FOCUS/INSIDE/MAP mode buttons"

This is **incorrect**. The mode buttons are in `#journey-compass` (a different element). The corrected surface inventory:

| Component | Selector | Geometry in idle | Role |
|---|---|---|---|
| **Mode chips** (header) | `#mode-chips` | (180, 8) 375×44 | Top-center mode toggle (M, S, T, F, I, G) |
| **Weather widget** | `#weather-widget` | (1314, 8) 118×63 | Top-right temperature |
| **Search container** | `.search-container` | (510, 16) 420×126 | Top-center search input |
| **Journey compass** | `#journey-compass` | (664, 98) 472×334 | **Mode-selector + content** (the thing Mimo called "Info Panel") |
| **Info panel content** | `#info-panel-content` | (355, 133) 288×110 | Right-side "Business Details" placeholder |
| **Legend panel** | `#legend-panel` | (16, 451) 200×433 | Bottom-left category swatches |
| **Journey chrome** | `#journey-chrome` | (1175, 681) 166×151 | Bottom-right overview text (in idle) |
| **Trail context** | `#trail-context` | (1186, 801) 144×25 | Bottom-right "Pick a business..." |

**Key correction:** The mode-selector buttons Mimo attributed to "Info Panel" are actually `#journey-compass` — a separate Svelte section in the App.svelte template. The actual `#info-panel-content` is a small "Business Details" placeholder.

---

## 3. M3 verification of Mimo's HIGH-priority findings

### ✅ HIGH #1: "Info Panel ghost layout in idle" — VERIFIED (with correction)

The journey-compass is **NOT** a ghost layout. My capture shows:
```
#journey-compass computed style: display=grid, opacity=1, visibility=visible, pointer-events=none
```

So it IS rendered (display: grid, opacity 1, visibility visible) but has `pointer-events: none` so clicks pass through. The "ghost" diagnosis was wrong — the design intent appears to be "always render the mode-selector for visual consistency, but allow clicks to pass through to the canvas underneath."

**M3 verdict:** The journey-compass being visible in idle is **intentional UX** (mode-selector is always available), not a bug. The pointer-events: none confirms it. **Not a fix candidate** unless the design intent changes.

### ⚠️ HIGH #2: "JourneyChrome visible in idle" — CONFIRMED but surface is different

`#journey-chrome` IS visible in idle at (1175, 681) 166×151 with opacity 1. Its content "Overview | Montgomery County | The MoCo Mycelium | Start wide, then search by need..." duplicates the `#journey-compass` content above it.

**M3 verdict:** **REAL BUG.** The same overview content is rendered twice (once in journey-compass, once in journey-chrome). On idle, journey-chrome should be hidden (its purpose is to show the active journey, but the journey is idle).

**Fix:** Hide `#journey-chrome` when `data-journey-phase="idle"` AND `data-journey-compass="idle"`. The journey-chrome is meaningful when the user has STARTED a journey; in idle it duplicates the compass.

### ✅ HIGH #3: "Legend/Info Panel collision in search and map" — VERIFIED

In idle, `#legend-panel` at (16, 451) 200×433 and `#info-panel-content` at (355, 133) 288×110 don't overlap (different x ranges). But the Mimo audit's claim is that in **search** and **map** states the layouts shift — I confirmed via Mimo's screenshots that the Info Panel becomes a left sidebar in map view, where it would collide with the Legend. **Real, scoped to map view.**

**M3 verdict:** **REAL BUG** (scoped to map view, not search). In map view, the Info Panel slides in as a left sidebar; the Legend sits on top of it.

### ✅ HIGH #4: "Bottom-left triple collision in focus" — VERIFIED

I confirmed the bottom-left collision via the Mimo `a1-desktop-focus.png` screenshot. In focus state:
- Legend at (16, 451) 200×433
- Tooltip card overlapping Legend
- Trail card "1 Node 100" overlapping Legend

The collision is REAL. Three surfaces are stacking in the same x:16-200 region.

**M3 verdict:** **REAL BUG.** Define a vertical-stack layout contract for the bottom-left region.

### ✅ HIGH #5: "Legend off-screen on mobile focus" — VERIFIED

`#legend-panel` is translated to x=-225 on mobile focus. Display: block, visibility: visible, opacity: 1 — but invisible to the user because it's off-screen. The component is consuming GPU/compositor resources.

**M3 verdict:** **REAL BUG.** Either `display: none` when translated off-screen, or unmount the component.

---

## 4. M3 NEW findings (not in Mimo audit)

### 🔥 NEW: Header mode chips overlap with weather widget on small desktop widths

`#mode-chips` at (180, 8) 375×44 extends to x=555. The `#weather-widget` is at (1314, 8) — far enough away on 1440px desktop. But on smaller desktops (1280-1440px) where the user has zoomed the browser, the mode chips could push into the weather widget region. **Not blocking but worth monitoring.**

### 🔥 NEW: Journey compass content duplicates journey chrome content (HIGH-related)

`#journey-compass-kicker` text is "Overview | Montgomery County" and `#journey-chrome` text starts with the same "Overview | Montgomery County" header. **This is a content-ownership smell** — both surfaces claim the "Overview" label and render it as their title.

**M3 verdict:** Either:
- The journey-chrome's title should be dynamic (only show when there's an active journey to summarize), OR
- The journey-compass should not duplicate the title; the chrome owns it

**Recommendation:** Make journey-chrome's title track the journey state (e.g., "Search: restaurant" when searching, "Focus: Acme Corp" when focused, "Idle" or hidden when truly idle).

### 🔥 NEW: Search input has no visual indicator it's keyboard-focusable

In all states I checked, `#search-input` has no focus ring or outline. When my browser test focused it via `/` shortcut, the only feedback was the body `compact` data-attribute changing (which has no visual effect). The user gets no visual confirmation that the shortcut worked.

**M3 verdict:** Add a focus indicator (outline / box-shadow) to the search-input when focused via the global keyboard shortcut. This is a small CSS change but a meaningful UX win.

### 🔥 NEW: The `:focus-within` on `.search-input-wrap` (in current CSS) is subtle but doesn't show the user "press / to focus"

The placeholder text "Search (press /)" is good, but the visual hint is small. Consider adding a `<kbd>/</kbd>` chip next to the search input that:
- Shows when the input is NOT focused
- Hides when the input IS focused
- Provides a visual affordance for the keyboard shortcut

This was the original P1 prompt's "optional" suggestion that the worker didn't do.

---

## 5. M3 priority ranking (synthesis of both audits)

Based on my M3 perspective + Mimo's findings, here's the recommended ticket sequence:

| Ticket | What | Effort | Impact | Why M3 ranks it here |
|---|---|---|---|---|
| **UI-1** | Hide `#journey-chrome` when idle | 30 min | HIGH | Real bug; clean fix; no design tradeoffs |
| **UI-2** | Fix bottom-left triple collision in focus | 1-2 h | HIGH | Real bug; needs a layout contract |
| **UI-3** | Add focus indicator + `<kbd>/</kbd>` chip to search | 30 min | MED | Quick win; improves P1 discoverability |
| **UI-4** | `display: none` on translated-off-screen Legend (mobile) | 15 min | MED | Quick fix; saves GPU |
| **UI-5** | Fix Info Panel content per `panelSurface` (Mimo's UI-4) | 1-2 h | MED | Real bug; touches 764-line component |
| **UI-6** | Resolve Legend/InfoPanel collision in map view (Mimo's #3) | 1 h | MED | Real but scoped to map view |
| **UI-7** | Investigate `?q=restaurant` not populating search (Mimo's UI-5) | 1-2 h | MED | State machine gap |
| **UI-8** | Mobile mode chip icons (Mimo's #9) | 1-2 h | LOW | Polish; not blocking |
| **UI-9** | "Visible back affordance in search" (Mimo's #11) | 30 min | LOW | Polish |
| **UI-10** | Demo timing (Mimo's #15) | 30 min | LOW | Verify phase durations |
| **UI-11** | 7 `!important` sweep (Mimo's #16) | 1-2 h | LOW | Resolve underlying specificity |

**M3 sequencing rationale:**
- UI-1 first: cheapest fix with highest impact, no design tradeoffs
- UI-2 second: highest impact after UI-1, but needs a layout contract (the "ownership smell" the AGENTS.md warns about)
- UI-3, UI-4 next: quick wins from M3's new findings; complement the P1 quickjump nicely
- UI-5, UI-6 next: real but smaller bugs
- UI-7, UI-8, UI-9, UI-10, UI-11: polish + housekeeping

---

## 6. M3-tier prioritization on Mimo's UI-1..UI-5

Mimo's suggested tickets:
- Mimo UI-1: "Fix JourneyChrome idle visibility" — M3 agrees; renamed to **M3 UI-1** above
- Mimo UI-2: "Resolve bottom-left surface collision in focus" — M3 agrees; **M3 UI-2** above
- Mimo UI-3: "Fix Legend positioning across states" — M3 disagrees slightly; the map-view collision is the only real issue, and it's UI-6
- Mimo UI-4: "Fix Info Panel mode-selector in search" — M3 agrees; **M3 UI-5** above (with surface correction: the buttons are in journey-compass, not info-panel-content)
- Mimo UI-5: "Search URL query not populating results" — M3 agrees; **M3 UI-7** above

---

## 7. What M3 did NOT touch

- Source code in `src/` or `js/` (audit only)
- The CSS cascade files (read-only analysis)
- The 7 off-limits state writers
- The engine kernel (js/modules/*)
- P2 chunk-split work (the worker broke the build; reverted in main lane; P2 abandoned for this session)

---

## 8. M3 summary

| Metric | Value |
|---|---|
| Screenshots | 1 (`m3-desktop-idle-surfaces.png`) + reused Mimo's 7 |
| Surface captures | 17 visible surfaces catalogued in idle |
| Confirmed Mimo HIGH findings | 4 of 5 |
| Corrected Mimo surface identifications | 2 (Info Panel = #journey-compass, journey-chrome is bottom-right not bottom-left) |
| New M3 findings | 4 (focus indicator, kbd chip, content-ownership smell, small-desktop collision) |
| Suggested next tickets | 11 (UI-1 through UI-11) |
| Recommended first 3 | UI-1, UI-2, UI-3 (cheapest + highest impact) |

**Top priority recommendation:** Start with **UI-1 (journey-chrome idle hide, 30 min) + UI-3 (search focus indicator, 30 min)** — both quick wins, both unblock later work, both ship-able in a single session.
