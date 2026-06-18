# A3 Polish Audit — Edge Cases, Error States, and Code Hygiene (2026-06-14)

**Date:** 2026-06-14
**Auditor:** Pi main lane (post-A1+A2 closure)
**Browser:** Playwright MCP (headed Chromium, 1440×900 + 390×844 viewports)
**Dev Server:** Vite/Svelte at `http://localhost:5175/` (port shifted from 5173 because of running parallel sessions)
**Source audit body:** This document

**Companion audits:**
- `docs/ui-ux-audit-2026-06-13.md` (A1, 343 lines, 11 UI/UX tickets UI-1 through UI-11) — closed
- `docs/ui-ux-audit-minimax-m3-2026-06-13.md` (A1 second pass)
- `docs/a11y-audit-2026-06-14.md` (A2, 485 lines, 8 a11y tickets A2-1 through A2-8) — closed
- `docs/audit-a3-polish-2026-06-14.md` (this document, A3, edge/error/hygiene tickets A3-1 through A3-7)

**Closure context:**
- A1 closure ledger: `docs/wave-11-ux-audit-closure-2026-06-14.md` (11/11 closed)
- A2 closure ledger: `docs/a2-audit-closure-2026-06-14.md` (8/8 closed)
- A3 closure: pending — this document is the seed

---

## Scope

A1 covered visible UI/UX issues. A2 covered screen reader and keyboard a11y. **A3 covers what neither A1 nor A2 caught:**

1. **Edge cases** — search with no results, focus on invalid anchor, demo state interactions
2. **Error states** — what happens when URL params point to non-existent things
3. **Console hygiene** — Svelte 5 warnings, diagnostic-adapter noise
4. **Polish** — first-visit tooltips persistence, loading state after ready
5. **Functional regressions** — anything broken since the Wave 11 state-class migration

Out of scope: pure visual polish (covered by A1), pure keyboard a11y (covered by A2), engine internals (Wave 11 territory).

---

## What's already good

| Area | Evidence |
|---|---|
| **A1+A2 work in production** | Skip link works, `<main>` landmark present, h1 visible, mode chips icon-only on mobile, roving tabindex on legend, listbox on search results, aria-keyshortcuts on Canvas + radiogroup |
| **Ctrl+1-6 mode switching** | A2-4 fix; works alongside Escape returns to Overview |
| **0 console errors** | All 16 warnings are Svelte 5 reactive binding (single root cause) |
| **Loading overlay** | Renders phase chips (Data, Assets, Restore, Ready) with progress bar |
| **Mobile idle** | Clean 390×844 layout; mode chips icon-only; header banner shows "SE" + keyboard shortcuts button only |

---

## Audit Findings

### A3-1: Search results don't populate from URL (HIGH — REGRESSION)

**Severity:** HIGH — functional regression, broken by Wave 11 state class migration
**File scope:** `src/components/SearchResults.svelte`, `src/lib/search-engine.ts` (or current canonical)

**Reproduction:**
1. Navigate to `http://localhost:5175/?nodemo=1&view=galaxy&q=restaurant`
2. Search input shows "restaurant" (URL→input works — UI-7 fix)
3. **"Neighborhood businesses" list is empty** — no results rendered
4. Wait 3+ seconds; still empty
5. Same for `?q=acme` — also empty

**Expected:** A search for "restaurant" should match the 524+ retail-and-food businesses in the dataset and render result rows.

**Root cause hypothesis:** Wave 11 state class migration may have decoupled the search store from the search render path. The URL→input is wired via `d987b4d` UI-7, but the input→results chain is broken.

**Recommended fix:**
1. Add a console.log or break in `SearchResults.svelte` to see if `searchResults` is ever populated
2. Check `src/lib/search-engine.ts` — does it actually receive the input value?
3. Re-bind the URL param flow to the new Svelte 5 state class
4. Add a test: `tests/unit-active/search-results-url-renders.test.ts` that asserts `?q=restaurant` produces ≥1 result

**Effort:** 30-60 min (likely regression in state wiring)
**Impact:** Search is the primary entry point for the app. Without results, the app is functionally broken for users coming from shared URLs.

**Visual evidence:** `audit/a3-desktop-search-acme.png`, `audit/a3-mobile-search-restaurant.png`

---

### A3-2: Search empty-state UI missing (MED)

**Severity:** MED — UX gap, not blocking
**File scope:** `src/components/SearchResults.svelte`

**Reproduction:**
1. Navigate to `?nodemo=1&view=galaxy&q=zzzzzzzzz`
2. Search input shows "zzzzzzzzz"
3. Result list is empty (which is correct — no matches)
4. **No "No results found" message**; no suggestions; no call-to-action
5. Status region is empty (no aria-live announcement of "no results")

**Recommended fix:**
- Render an empty state when results.length === 0: "No businesses match `zzzzzzzzz`" with suggestions ("Try a category like 'food' or 'professional services'")
- Announce via `aria-live="polite"` so screen reader users know
- Suggest clicking a category from the legend

**Effort:** 30 min
**Impact:** Without empty state, users may think the app is broken. Empty state is a tiny UX win that ships big trust.

**Visual evidence:** `audit/a3-search-no-results.png`

---

### A3-3: Invalid anchor state has broken UX (HIGH)

**Severity:** HIGH — graceful-degradation gap
**File scope:** `src/lib/journey/*`, `src/components/JourneyChrome.svelte`

**Reproduction:**
1. Navigate to `?nodemo=1&view=galaxy&anchor=999999` (no such business)
2. App loads as "Focus" mode but with placeholder "Node 999999" in mini-map
3. Trail navigation: "Stop 1 of 0", "0 visible neighbors"
4. "Focused on This Business" — no business, no name
5. Loading progress bar STILL visible (Data, Assets, Restore, Ready)
6. No "Business not found" message, no fallback to Overview

**Recommended fix:**
- Detect missing anchor in URL handler
- Either: fall back to overview mode (preferred — graceful), or show a toast/banner: "Business #999999 not found" with a "Go to Overview" button
- Loading overlay should hide once data has loaded (see A3-4)

**Effort:** 30-45 min
**Impact:** Shared links to non-existent anchors currently hang the UI in a broken focus state. Real-world shared-link usage is common.

**Visual evidence:** `audit/a3-focus-invalid-anchor.png`

---

### A3-4: Loading overlay persists past ready (LOW)

**Severity:** LOW — visual hygiene
**File scope:** `src/components/LoadingOverlay.svelte`, `src/lib/state/app.svelte.ts` (state class)

**Reproduction:**
1. Navigate to `?nodemo=1&view=galaxy&anchor=999999`
2. Loading progress bar with "Gathering records..." still visible
3. Phase chips show all four phases (Data, Assets, Restore, Ready) complete
4. Yet the overlay hasn't hidden

**Recommended fix:**
- LoadingOverlay's visible prop should be driven by `data-loading-state` body attribute (per state-class pattern)
- Once `data-loading-state="ready"`, overlay should auto-hide
- Audit: when does the overlay correctly hide vs not?

**Effort:** 15-30 min
**Impact:** Visual hygiene. The overlay covers the focus card area, obscuring the empty focus card.

**Visual evidence:** `audit/a3-focus-invalid-anchor.png`

---

### A3-5: 15 Svelte 5 binding-to-non-reactive warnings on Legend (LOW — code quality)

**Severity:** LOW — code quality, no functional impact (warning, not error)
**File scope:** `src/components/Legend.svelte:159`

**Reproduction:**
1. Open the dev tools console
2. Navigate to any state (idle is enough)
3. Observe 15 `bind_property_non_reactive` warnings, one per legend button:
   ```
   [WARNING] [svelte] binding_property_non_reactive
   `bind:this={legendButtons[i]}` (src/components/Legend.svelte:159:8) is binding to a non-reactive property
   ```

**Root cause:** Worker H's A2-3 roving tabindex implementation introduced `bind:this={legendButtons[i]}` where `legendButtons` is a plain array (`let legendButtons: HTMLElement[] = []`), not a Svelte 5 `$state` rune. Svelte warns because the array is non-reactive (changes to it don't trigger re-render).

**Recommended fix:**
- Change `let legendButtons: HTMLElement[] = [];` to `let legendButtons = $state<HTMLElement[]>([]);` (Svelte 5 rune)
- OR: use a Map indexed by name, OR remove the binding entirely if not actually consumed reactively

**Effort:** 10 min
**Impact:** Console hygiene. Browsers and screen readers don't care; CI doesn't fail; but it pollutes dev console and may mask real warnings.

**Visual evidence:** `audit/a3-baseline-idle.png` + console log

---

### A3-6: Demo step tooltips persist after first interaction (LOW — UX polish)

**Severity:** LOW — UX polish
**File scope:** `src/components/App.svelte` (the static "1. overview" / "Step Inside" / "Map" hints), `src/components/LoadingOverlay.svelte` (the "Guided demo" panel)

**Reproduction:**
1. Open any state
2. On the right side, observe 5 journey-step tooltips: "1. overview", "2. search", "3. focus", "4. inside", "5. map" with "Step Inside" and "Map" buttons
3. After user navigates to Overview and dismisses the demo (× button), the static tooltips remain
4. They overlap the right edge of the canvas

**Recommended fix:**
- Hide the 5 static tooltips once the user has dismissed the demo panel
- OR: make them contextual (only show during initial first-visit state)
- They are presumably first-visit hints but the dismissal signal isn't propagating

**Effort:** 30 min
**Impact:** First-visit UX. After demo, the right edge of the canvas has stale hints.

**Visual evidence:** `audit/a3-baseline-idle.png`, `audit/a3-demo.png`

---

### A3-7: Diagnostic adapter logs to console on every load (LOW — noise)

**Severity:** LOW — developer noise
**File scope:** `js/modules/diagnostic-adapter.ts:27`

**Reproduction:**
1. Open dev tools console
2. Reload the page
3. Observe: `[postprocessing] initialized — vignette + CA + bloom + DOF ready`

**Recommended fix:**
- Gate this log behind a debug flag (e.g., only log when `?debug=1` is set)
- OR: log to a less visible channel (e.g., the DevGui overlay if present)

**Effort:** 5 min
**Impact:** Console hygiene. Doesn't break anything; just noise.

---

## Summary

| Metric | Value |
|---|---|
| States captured | 6 (idle, search-no-results, search-acme, focus-invalid-anchor, mobile-idle, mobile-search, demo) |
| Tier-1 HIGH issues | 2 (A3-1 search results broken, A3-3 invalid anchor UX) |
| Tier-1 MED issues | 1 (A3-2 search empty state) |
| Tier-1 LOW issues | 4 (A3-4 loading overlay, A3-5 Svelte warnings, A3-6 demo tooltips, A3-7 console noise) |
| Total tier-1 issues | 7 |
| Console errors | 0 |
| Console warnings | 16 (15 Svelte 5 binding warnings, 1 diagnostic noise) |
| Visual evidence | `audit/a3-*.png` (6 captures) |

### Top 3 issues

1. **A3-1: Search results don't populate** — Most-impactful. Search is the primary entry point. The URL→input is wired (UI-7) but input→results is broken. Likely Wave 11 state class migration regression.
2. **A3-3: Invalid anchor has broken UX** — Graceful-degradation gap. Shared links to non-existent anchors hang the UI. Small fix (fall back to Overview).
3. **A3-2: Search empty-state missing** — Tiny but high-trust. "No results found" with a suggestion is a 30-min win.

### Surprises

- **A2-3's roving tabindex introduced 15 console warnings** — A2 closing ledger celebrated "tab stops 34→19 in idle" but missed the Svelte 5 reactive binding migration in the implementation. Code quality drift under the audit-radar.
- **Loading overlay persistence in invalid-anchor state** — Bug. Should hide once `data-loading-state="ready"`.
- **Search results empty even for `?q=acme`** — Even for queries that should obviously match (acme is a common business name; the dataset has 8000+ businesses). Either the search engine is misconfigured or the render path is broken.

---

## Recommended ticket sequence

1. **A3-1** — search results don't populate (HIGH) — 30-60 min
2. **A3-3** — invalid anchor UX (HIGH) — 30-45 min
3. **A3-2** — search empty state (MED) — 30 min
4. **A3-4** — loading overlay persistence (LOW) — 15-30 min
5. **A3-5** — Svelte warnings (LOW) — 10 min
6. **A3-6** — demo tooltips (LOW) — 30 min
7. **A3-7** — diagnostic console noise (LOW) — 5 min

Total estimated effort: 2.5-4 hours for all 7 tickets.

---

## What I did NOT touch

- Source code edits (audit only)
- Engine kernel (`js/modules/*`) — Wave 11 state-class migration in flight
- CSS cascade (`css/**`) — AGENTS.md off-limits
- The 7 off-limits state writers — journey.js, lifecycle.js, ui-renderers.js, focus-pocket.js, journey-compass-state.js, deploy scripts
- The state class (`src/lib/state/app.svelte.ts`) — currently in flight as `src/lib/state/app.svelte.ts` is dirty
- Search engine internals (covered by Worker K's audit-area)

---

## Verification gates for tickets

Each A3 ticket must pass:
- `npm run check` (svelte-check 0 errors)
- `npm run test:unit` (no regression in 345/345 across 39 test files)
- `npm run build:svelte` (clean build)
- `git status -sb` (only intended files)
- For visual/UX tickets: headed Playwright capture before/after
- For regression tickets (A3-1, A3-3): the new test must reproduce the bug pre-fix and pass post-fix
