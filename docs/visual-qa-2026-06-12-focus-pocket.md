# Visual QA — Focus Pocket 3D-Only Migration

**Date:** 2026-06-12
**Reviewer:** Codex main lane (MiniMax-M3) — direct vision review, no worker delegation
**Scope:** Surfaces most affected by the focus-pocket 3D-only migration (Phases 1-4: `e185ae5`, `aa2037d`, `746e17f`, `d57bdf0`, plus slice `f36765b`).
**Methodology:** Captured PNG screenshots at 1440x900 (desktop) and 390x844 (mobile) via Playwright, then visually reviewed. Anchored at `?view=galaxy&anchor=4729` (overview with focused node) and `?view=focus&anchor=4729` (focus mode).
**Confidence:** Medium. Static screenshots cannot capture the breathing/orbiting motion; several findings are structural (z-index/overlap) which static is well-suited to.

---

## Summary

| Severity | Count | Status |
|---|---|---|
| P0 (broken / user-blocking) | 2 | Both confirmed in screenshots |
| P1 (visible regression) | 2 | One confirmed, one likely |
| P2 (composition) | 2 | Confirmed |
| P3 (polish) | 1 | Noted |

The focus-pocket migration's core goal — *"3D only, no HTML overlay"* — appears to hold architecturally. No overlay-double-render is visible. But the visual surface now has **layout collisions** on desktop focus mode and **mobile chrome overflow** on focus mode that are regressions vs. the 2026-06-07 B+ baseline.

The 3D breathing/orbiting constellation described in the design doc is not visibly distinguishable in the static screenshots. This is partly a limitation of static capture (motion is hard to evaluate from a single frame), but the cluster around the focused node should still be visually distinct from the main mycelium field even in a still — and it isn't.

---

## P0 — Layout collision on desktop focus mode (lower-left cluster)

**Surfaces:** desktop focus mode, desktop overview-with-anchor.
**Screenshots:** `tmp/qa-desktop-focus-pocket.png`, `tmp/qa-desktop-focus-pocket-full.png`, `tmp/qa-focus-mode loaded.png`.

**What I see:** Three cards stack on top of each other in the lower-left:
1. **CATEGORIES panel** (leftmost) — list of 14 categories with counts, e.g. "Food & Dining 2531"
2. **FOCUS | COUNTY card** — the focus detail card showing "A local constellation of related businesses. Hover any glowing connection to see why it exists." with "Select a node" / "Click a business in the field to explore." prompts
3. **TRAIL section** — partial category names that get clipped: `y8 trial` (likely "Lifestyle" or similar), `53` "dustrial" (Industrial truncated). The section header "TRAIL" overlaps the CATEGORIES panel.

The FOCUS chip in the right-side stack shows FOCUS as the active mode (teal border), but the user-facing FOCUS card is in the lower-left and overlapped by category names from CATEGORIES.

**Why it's P0:** Three independent UI surfaces are colliding. The category list clips the focus card, the focus card covers trail content, and trail content clips category names. This is the user-visible composition failure the 2026-06-12 deferred-states critique flagged in finding 1 ("four of these stack vertically on focus, the user cannot tell them apart at a glance").

**Proposed fix direction:** Establish a single lower-left focus zone. Either (a) move CATEGORIES to a top-aligned horizontal strip in overview mode and hide it in focus mode, or (b) replace the three stacked cards with one tabbed focus card that has Category / Focus / Trail sections inside it. The mobile_idle and desktop_idle states don't have this problem because they only show one of the three.

---

## P0 — Empty-state prompt appears alongside active focus

**Surfaces:** mobile focus mode, desktop focus mode.
**Screenshots:** `tmp/qa-focus-pocket.png` (mobile), `tmp/qa-thread-inspector-attempt.png` (desktop).

**What I see:** The FOCUS | COUNTY card shows:
- Title: "Search results" (desktop) or the empty-state title
- Description: "A local constellation of related businesses. Hover any glowing connection to see why it exists."
- Action prompt: "Select a node" with placeholder, then "Click a business in the field to explore."

The MANIFOLD bar at top says "MANIFOLD #4729 Semantic proximity active" — meaning the focus is **set** to node 4729. But the FOCUS card still shows the empty-state prompts ("Select a node", "Click a business in the field to explore.").

**Why it's P0:** Contradictory UI. The user has selected a focus (the URL `?anchor=4729` proves it, the MANIFOLD bar says so) but the focus card tells them to "Select a node." This will confuse anyone trying to use the focus feature. Looks like the empty-state and populated-state components are both rendering at once, or the empty-state guard is wrong.

**Proposed fix direction:** When `focusedIndex !== null` (i.e. the Svelte focus store is set), the FOCUS | COUNTY card should show node details (name, role, category, neighbor list) instead of the empty-state prompt. Verify the conditional rendering in `src/components/FocusCard.svelte` and the equivalent in any Svelte focus card.

---

## P1 — Mobile focus mode uses desktop-style long mode chips (overflow)

**Surfaces:** mobile focus mode (390x844).
**Screenshots:** `tmp/qa-focus-pocket.png` (fullPage).

**What I see:** At 390px viewport, the OVERVIEW/SEARCH/FOCUS/INSIDE/MAP chip stack renders in full-label form. MAP is clipped off the right edge of the viewport — the "P" letter is barely visible. Compare to **mobile-idle** (`tmp/qa-01-mobile-idle.png`) which correctly uses icon-condensed chips: SE | M | S | T | F | I | (grid icon) — letter glyphs only, fits comfortably.

**Why it's P1:** The mode-grid (icon-condensed) treatment is the correct mobile pattern. The migration didn't update the focus mode to use the same icon-condensed treatment that mobile-idle uses. The full-label stack is also used at desktop width (1440px) in earlier screenshots — that's correct for desktop. But mobile is broken.

**Proposed fix direction:** Wrap the mode-chip rendering with the same `@media (max-width: 768px)` rule that mobile-idle uses, swapping labels for icons. Or: ensure `mode-grid` (icon-condensed) is the default for `data-panel-surface='focus'`. Verify the mode-grid CSS isn't being suppressed in focus mode.

---

## P1 — Focus pocket 3D constellation not visibly distinct from main mycelium field

**Surfaces:** desktop focus mode, desktop overview-with-anchor.
**Screenshots:** `tmp/qa-desktop-focus-pocket.png`, `tmp/qa-focus-mode loaded.png`.

**What I see:** When `?anchor=4729` is set, the MANIFOLD bar confirms "Semantic proximity active" and a FOCUS | COUNTY card appears. The mycelium field renders 8,406 colorful dots in roughly the same triangular layout as mobile-idle. The focus cluster around node 4729 — the ~20 nodes that should be elevated, role-tinted, breathing, and orbiting per the design doc — is **not visibly distinguishable** from the main field. The dots are present, but there's no clear visual treatment marking them as the "focus neighborhood."

**Why it's P1:** This is the core product value of the focus-pocket feature. Per the design doc, "Motion fidelity (breathing, orbit)" was a 3/3 differentiator. Static screenshots can't evaluate motion, but even in a still, the cluster should be visually demarcated. Without a visible constellation, the migration's value proposition isn't perceptible to the user.

**Possible causes (do not edit, just diagnose):**
- The role-color differentiation from `e185ae5` (Phase 1) may be applying colors too subtly to read against the main field's cluster-based colors
- The breathing animation may be at its zero-crossing in the captured frame (bad luck)
- The constellation may be rendering at scale 0 or hidden behind the main field
- The breathing engine's anchor distance is reducing all nodes to a single point cluster

**Proposed fix direction:** Need motion capture (video or sequential frames) to distinguish "subtle but real" from "actually missing." If the design intent is for users to immediately see the cluster pulse on focus, consider stronger visual treatment: brighter node colors, larger render scale, a translucent focus-pocket ring outline.

---

## P2 — Empty-state contradiction on focus card (mobile)

**Surfaces:** mobile focus mode.
**Screenshots:** `tmp/qa-focus-pocket.png` (fullPage).

**What I see:** Below the FOCUS | COUNTY card, a separate card shows "Explore Neighborhood" with an iOS-like toggle (off position) and the prompt "Click a business in the field to explore." Both cards are visible simultaneously.

**Why it's P2:** Redundant empty-state messaging. The FOCUS | COUNTY card already says "Select a node / Click a business in the field to explore." The Explore Neighborhood card repeats the same prompt. Two cards telling the user the same thing.

**Proposed fix direction:** Either merge them into one card with one prompt, or hide the Explore Neighborhood card when the FOCUS | COUNTY card is showing.

---

## P2 — Trail section label clipping

**Surfaces:** desktop focus mode, desktop overview-with-anchor.
**Screenshots:** `tmp/qa-desktop-focus-pocket.png`.

**What I see:** The TRAIL section header overlaps the CATEGORIES panel. "trail · 1 pit..." and category names get partially clipped: `y8 trial` (Lifestyle truncated), `53` "dustrial" (Industrial truncated), "Manufacturing" partially visible. The trail section's row layout is fighting for the same horizontal real estate as the categories list.

**Why it's P2:** Information loss. The user can no longer read the full category list when TRAIL is active.

**Proposed fix direction:** Same as P0 — establish a single lower-left focus zone with a clear stacking order. Or: when TRAIL section is active, hide the CATEGORIES panel.

---

## P3 — Mode chip in lower-left of OVERVIEW stack doesn't have an icon-only fallback

**Surfaces:** desktop overview (no migration impact, but adjacent).
**Screenshots:** `tmp/qa-desktop-focus-pocket.png`.

**What I see:** The right-side mode stack always uses full labels. There's no way to collapse to icons on smaller desktop viewports (e.g. 1024-1280px) where the full labels start to crowd.

**Why it's P3:** Polish, not a blocker. Document for the next mobile-cascade audit.

---

## Cross-reference: `docs/visual-critique-2026-06-12-deferred-states.md`

| Deferred-state finding | Status from this visual pass |
|---|---|
| **#1 Visual density** (four glass cards stack on focus) | **CONFIRMED AND WORSENED.** Three cards overlap in lower-left. Two are now TRAIL/FOCUS | CATEGORIES, all on the same anchor point. |
| **#2 Z-index implicit cascade** | Likely still an issue. The overlapping cards suggest the z-index ordering isn't strict; whichever is rendered last wins. |
| **#3 Touch targets nested in mobile neighbor rail** | Not observable from screenshots alone. Need DOM audit. |
| **#4 State sync via MutationObserver on body** | Architecture concern, not visual. Out of scope for this pass. |
| **#5 Focus pocket hybrid ownership** | Partially addressed: the HTML overlay is gone, but the visible constellation (per #4 above) is not clearly distinct, so the migration's value isn't visually clear. |
| **#6 "No visible neighbors" empty state aria** | Cannot evaluate from screenshots. Architecture concern. |

---

## Cross-reference: 2026-06-07 B+ baseline (`docs/semantic-demo-bugsweep-2026-06-07.md`)

The 3D scene + atmosphere in mobile-idle and overview mode is at the documented B+ baseline. No regression in:
- Color palette (bioluminescent teal-amber on near-black)
- Dot density and clustering
- Camera framing
- Category list readability
- Zoom control placement
- Hero card (MONTGOMERY COUNTY | "The MoCo Mycelium" | STEP INSIDE + MAP)

The regressions are concentrated in the focus-mode-specific UI.

---

## Surfaces NOT reviewed (out of scope for this pass)

- Thread-inspector state (URL `?view=inspector` or similar not tested; needs a node with neighborhood first)
- Field-node active state (would need URL `?fieldnode=1` or actual node click)
- Compass-rail state (already covered by mycelium-bordered in mobile-idle screenshots; the compass-rail is implied by the mycelium border)
- Search error / no-results states (no query string tested)
- Inside / map views (deferred)
- All 21+ named states in the visual-state-registry (this pass reviewed 4)

A full visual pass over all 21 states with sequential motion capture is the right next step; this pass focused on the migration's highest-risk surfaces.

---

## Screenshots (in `tmp/`)

| File | What it shows |
|---|---|
| `tmp/qa-01-mobile-idle.png` | Mobile baseline, no focus, icon-condensed mode chips, search bar at top, mycelium full-canvas |
| `tmp/qa-focus-pocket.png` (fullPage) | Mobile focus mode, full page including FOCUS | COUNTY card, "Explore Neighborhood" card, clipped MAP chip |
| `tmp/qa-desktop-focus-pocket.png` | Desktop overview with anchor, MANIFOLD bar, lower-left card collision |
| `tmp/qa-desktop-focus-pocket-full.png` | Same as above, full page |
| `tmp/qa-focus-mode loaded.png` | Desktop focus mode after extended wait, mycelium loaded |
| `tmp/qa-thread-inspector-attempt.png` | Desktop focus mode initial state, "Gathering records..." loading card visible |

---

## Recommendations (next slice)

1. **P0 — Fix lower-left focus zone overlap.** Establish a single focus card with sub-sections (Overview / Focus / Trail), or move TRAIL and CATEGORIES to dedicated zones with explicit z-index. (AGENTS.md off-limits: `css/mobile_premium__*.css`, `js/modules/focus-pocket.js`, `src/components/FocusPocket.svelte` need lead approval.)
2. **P0 — Fix focus empty-state vs. populated-state conflict.** Audit `src/components/FocusCard.svelte` (and any related journey chrome) for state-conditional rendering. The empty-state should not show when `focusedIndex` is set.
3. **P1 — Use icon-condensed mode-grid on mobile focus mode.** Same CSS rule as mobile-idle.
4. **P1 — Make focus constellation visually distinct.** Consider brighter role colors, larger render scale, or a focus-pocket ring outline. Requires motion capture to validate.
5. **Capture motion video for the 3D breathing/orbiting.** A 5-second screen recording at 4fps would let us verify whether the constellation is genuinely breathing or just static dots.

---

## Open questions for the lead

1. Is `?view=focus` supposed to enter a true FOCUS mode that hides CATEGORIES? Or do we expect CATEGORIES to remain visible? (Current behavior: both are visible, overlapping.)
2. Should the FOCUS card in overview-mode-with-anchor show a "back to overview" button? The MANIFOLD bar shows focus is active but offers no escape.
3. Is there a deferred-state critique owner who should review this report before we act on the P0/P1 items?
