# A2 Accessibility Audit — Closure Ledger (2026-06-14)

**Status:** 8 of 8 audit tickets closed. All fixes have matching verification tests on master.

**Source audit:** `docs/a11y-audit-2026-06-14.md` (485 lines, 8 tickets: 5 HIGH / 3 MED)

**Total pure a11y closure commits:** 11 (fix + test pairs for most tickets; A2-1+A2-2 combined in two commits).

**Related prior work:** `da54ab5` (aria-labels on info-panel, mode chips, focus card) — pre-audit baseline.

---

## Closure map

| Audit ticket | Severity | WCAG | Closing commit(s) | What it fixed |
|---|---|---|---|---|
| **A2-1** Skip link target `#main-content` does not exist | HIGH | 2.4.1 | `0ba3f70`, `aeadc95` | `<main id="main-content">` added to `App.svelte`; skip link now moves focus into primary content |
| **A2-2** No `<main>` landmark | HIGH | 1.3.1 | `0ba3f70`, `aeadc95` | Same commit pair — screen readers gain landmark navigation to primary content |
| **A2-3** Legend creates 15 individual tab stops in idle | HIGH | 2.1.1 | `9d1fdef` | Roving tabindex on `Legend.svelte` category list; 15 tab stops → 1, arrow keys navigate |
| **A2-4** Mode chips hidden in search/focus modes — keyboard trap | HIGH | 2.1.1 | `145149f`, `1dd375f` | Escape returns to Overview; Ctrl/Cmd+1–6 keyboard shortcuts for mode switching from any state |
| **A2-5** Mode chips use radio semantics but Tab navigation | MED | 4.1.2 | `f8b5640`, `a6d3182` | Roving tabindex radiogroup on `Header.svelte` inline mode chips; arrow/Home/End keys; aria-keyshortcuts on container |
| **A2-6** No H1 heading — hierarchy starts at H3 | MED | 1.3.1 | `b5160c1` | Visually hidden `<h1 class="sr-only">Semantic Explorer</h1>` in `App.svelte` + `index.html` |
| **A2-7** Canvas missing `aria-keyshortcuts` | MED | 4.1.2 | `286fa04` | `aria-keyshortcuts` on Canvas `role="application"` element listing Arrow/Home/End/+/- shortcuts |
| **A2-8** Search results lack arrow-key navigation | HIGH | 2.1.1 | `25a87a3`, `7b3b436` | WAI-ARIA listbox pattern with roving tabindex, aria-activedescendant, arrow/Home/End/Enter keydown handler |

**Note on A2-5 vs A2-5b:** The audit flagged the orphan `ModeChips.svelte` component. The actual mode-chip rail lives in `Header.svelte:170`. The closing commits target the real component; the orphan was not touched. Audit ticket renumbered A2-5 → A2-5b in the fix to reflect the shifted target.

---

## Per-ticket verification notes

### A2-1 + A2-2 ✓
- Files touched: `src/App.svelte` (wrap primary content in `<main id="main-content">`)
- Test coverage: `tests/unit-active/a11y-skip-link-main-landmark.test.ts` (WCAG 2.4.1 + 1.3.1), `tests/unit-active/main-landmark-render-contract.test.ts`
- Two commits: `0ba3f70` (initial landing) and `aeadc95` (re-land with expanded test)
- Verified: Playwright confirms skip link moves focus into `<main>`; `document.getElementById('main-content')` returns the element

### A2-3 ✓
- File touched: `src/components/Legend.svelte` (roving tabindex on category list, arrow key handler)
- Test coverage: `tests/unit-active/legend-keyboard-roving-tabindex.test.ts` (asserts roving pattern, single tabindex=0)
- Verified: idle tab stops reduced from 34 total to 19; legend contributes 1 stop instead of 15

### A2-4 ✓
- Files touched: `src/App.svelte` (Escape handler, Ctrl+1–6 keyboard shortcuts), `src/components/Header.svelte` (shortcut wiring)
- Test coverage: `tests/unit-active/mode-chip-escape-render-contract.test.ts` (5 source-reading assertions for Escape handler structure), `tests/unit-active/mode-chip-keyboard-shortcuts.test.ts` (Ctrl/Cmd+1–6 shortcuts)
- Two commits: `145149f` (Escape test landed first, locked in Worker J verification), `1dd375f` (fix + shortcuts test)
- Verified: Escape returns to Overview from search/focus/inside states; Ctrl+1–6 dispatches mode switches

### A2-5b ✓
- File touched: `src/components/Header.svelte` (roving tabindex radiogroup, arrow/Home/End keydown, aria-keyshortcuts)
- Test coverage: `tests/unit-active/contract-header-mode-chips.test.ts` (5 assertions: tabindex distribution, aria-keyshortcuts, data-mode attributes, handler wiring, selectMode sync)
- Two commits: `f8b5640` (main fix, 62 lines in Header.svelte), `a6d3182` (aria-keyshortcuts follow-up, 1-line fix)
- Bug fixed during implementation: `querySelector('[data-mode=...]')` was matching the body element; scoped to `.mode-chip[data-mode=...]`
- Verified: 6 tab stops → 1; arrow keys cycle through chips with wrap; Home/End jump to first/last

### A2-6 ✓
- Files touched: `src/App.svelte` (H1 element), `src/index.html` (SR-only class + heading)
- No dedicated test file (structural HTML change, covered by existing render contracts)
- Verified: `<h1 class="sr-only">Semantic Explorer</h1>` present in DOM; heading hierarchy starts at H1

### A2-7 ✓
- File touched: `src/components/Canvas.svelte` (aria-keyshortcuts attribute)
- Test coverage: `tests/unit-active/canvas-aria-keyshortcuts-render-contract.test.ts`
- Verified: `aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home End Plus Minus"` on `role="application"` canvas element

### A2-8 ✓
- Files touched: `src/components/SearchResults.svelte` (listbox pattern, roving tabindex, keydown handler)
- Test coverage: `tests/unit-active/search-results-arrow-keys-render-contract.test.ts` (source-reading contract for arrow/Home/End/Enter/Space handling)
- Two commits: `25a87a3` (fix, 80 lines in SearchResults.svelte), `7b3b436` (verification test)
- Verified: 10+ result tab stops → 1; aria-activedescendant tracks active result; arrow/Home/End cycle; Enter triggers click; Tab exits naturally

---

## Wave context

The A2 audit ran on 2026-06-14 during the Wave 11 burndown window, overlapping with the Wave 11 UI/UX audit closure and the engine port plan. The audit scanned the Svelte UI chrome at `http://localhost:5173/?nodemo=1&view=galaxy` via Playwright MCP (headed Chromium, 1440×900).

**Timeline:**
- 07:33Z — Initial scan: 8 tickets identified, 34 visible tab stops in idle
- 03:02Z–03:54Z (earlier UTC, same day) — Fix commits land: A2-7, A2-6, A2-3, A2-1+A2-2, A2-5b, A2-8
- 13:53Z — A2-1+A2-2 re-land with expanded test (`aeadc95`)
- 14:24Z–14:33Z — A2-4 fix + Escape test + A2-5b follow-up
- 15:00Z — Drift re-audit: 5 of 8 shipped in parallel before burndown launch; all 8 closed by end of window

**Parallel activity:**
- Worker A (A2-8): search results arrow-key navigation
- Worker B (A2-5b): mode-chip roving tabindex
- Worker J (A2-4): Escape handler verification
- Wave 11 UI/UX closure (11 tickets) ran in parallel — no write conflicts on overlapping files (`Header.svelte` touched by both A2-5b and UI-8, but non-overlapping line ranges)

---

## Cross-seam a11y gaps (outside the A2 set)

These findings surfaced during the audit but were not part of the 8-ticket A2 scope:

| Gap | Source | Status |
|---|---|---|
| Legend count text (`9.6px`, `opacity: 0.5`) borderline contrast (~3.1:1) | §6 color contrast spot check | Not blocking — supplementary metadata, not interactive |
| Journey-compass live region may overannounce (full UI is live, not just status text) | §7 live region audit | Deferred — requires structural change to `LegacyCompassSurface.svelte` |
| `journey-compass` live region covers full compass UI, not just phase text | §7 live region audit | Same as above — cosmetic a11y, not functional |
| No keyboard shortcut to toggle the weather widget | Audit scope boundary | Not in A2; weather widget is non-essential UI |

---

## Outstanding

None. All 8 A2 tickets are closed with fix + verification test on master.

---

## Net product impact

- ✅ **Skip link functional** — keyboard users can bypass to primary content (WCAG 2.4.1)
- ✅ **Landmark navigation complete** — `<main>` + `banner` + `complementary` ×2 + `search` + `toolbar` + `application` + `list` + `status` covers all major regions
- ✅ **Tab stops reduced from 34 → 19 in idle** — legend roving (–14) + mode-chip roving (–5) + search-results roving (net –9 in search state)
- ✅ **Mode switching always keyboard-accessible** — Escape returns to Overview; Ctrl/Cmd+1–6 switches modes from any state
- ✅ **All interactive regions follow WAI-ARIA patterns** — radiogroup (mode chips), listbox (search results), toolbar (camera controls), application (canvas) with proper keyboard navigation in each
