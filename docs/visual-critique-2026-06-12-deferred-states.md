# Visual Critique — Semantic Explorer (Deferred States Pass)

**Date:** 2026-06-12
**Reviewer:** Code analysis of `src/components/*.svelte` + the mobile premium CSS split + `js/modules/focus-pocket.ts`. Cross-referenced with the 2026-06-06 and 2026-06-07 visual critiques.
**States examined:** Focus selected, journey/trail, thread inspector, focus pocket, mobile experience. The 3D scene and atmosphere are unchanged from the 2026-06-07 re-audit (B+) and are not re-graded here.
**Methodology:** Component-by-component read of every Svelte file that owns a deferred state, plus the supporting mobile premium CSS files (`mobile_premium__*.css`) and the legacy `focus-pocket.ts` engine. Findings include line references.

---

## Summary

The Svelte/Vite track has fully absorbed the focus, journey, thread-inspector, and focus-pocket surfaces. The components are well-structured, the data flow is clear, and the visual language is consistent with the 2026-06-07 bioluminescent teal-amber palette. **However, the deferred states reveal a new tier of UX debt that the 3D-focused prior critiques did not surface:**

1. **Visual density problem:** The journey chrome, focus card, and thread inspector all use near-identical glass-morphism cards (same `rgba(7,16,24,0.92)`, same `backdrop-filter: blur(10–12px)`, same `1px solid rgba(78,205,196,0.1–0.22)` border). On focus, four of these stack vertically (focus card top-right, thread inspector top-left, journey chrome bottom-center, focus pocket full-canvas). The user cannot tell them apart at a glance.
2. **Z-index implicit cascade:** Components use `var(--z-focus-card)`, `var(--z-overlays)`, `var(--z-journey-chrome)`, but never collectively. The AGENTS.md mandates `src/lib/z-index.ts` as the single source, but per-component overrides (`var(--z-focus-card, 600)`) quietly fall back to magic numbers when tokens are absent.
3. **Touch targets are correct in isolation, broken in composition:** Each button meets 44px. But the focus-stage neighbor rail stacks "Inspect" + "Pin" buttons **vertically on mobile** (line: `.focus-stage-neighbor-actions { flex-direction: column }` at @media 768px), which is correct for 44px targets, but then both buttons sit *inside* the neighbor pill, which itself is a button. Result: nested tap targets, ambiguous hit testing.
4. **State synchronization is body-attr-watching, not store-derived:** `FocusCard.svelte` uses a `MutationObserver` on `<body>` data-attributes to detect focus state (lines: `syncBodyPanelSurface`). This is a code smell. Svelte 5 should be the source of truth; watching the DOM is the inverse of reactivity. The reason given (legacy `__APP_STATE__` is non-reactive) is fair, but the solution is to make the store reactive, not to mirror the DOM.
5. **Focus pocket is a hybrid that confuses ownership:** The Svelte `FocusPocket.svelte` renders an HTML overlay, but the actual 3D constellation comes from `applyLocalNeighborhoodFocus()` in `focus-pocket.ts`, which writes to `state.navState.focusPocketIndices`. The Svelte component then *mirrors* the legacy state into a Svelte store via `mirrorFocusPocketToSvelteStore()`. Two stores, one source of truth, manual sync.
6. **The "no visible neighbors" empty state is hidden:** When `filteredCandidates.length === 0`, the rail shows an `empty-state` div (line: `<div class="empty-state">No neighboring stops found in this area.</div>`), but it lacks the same role-based aria-live announcement the populated state has. A user with a screen reader gets "0 visible neighbors" announced, but the empty state itself is silent.

**Overall grade for the deferred-state surfaces: B-**
The components work, they look right individually, and the data layer is sound. The composition fails: too many glass cards, ambiguous touch targets, and DOM-mirrored reactivity that will break the moment the legacy layer is removed.

---

## A. Focus Selected State (`src/components/FocusCard.svelte`)

### Current implementation

| Element | Source | Observation |
|---|---|---|
| Position | `position: absolute; bottom: 4.5rem; right: 1rem;` (line in `<style>`) | Anchors to bottom-right. Conflicts with `.journey-chrome` which is `bottom: 4.5rem; left: 50%`. On a 360px-wide phone they collide. |
| Width | `width: 260px` | Fixed. At 320px viewport (semantic-dive 320 surface), the mobile `@media` block forces `width: 100%`, which is correct, but at 360–390px the desktop and mobile rules overlap and specificity wins oddly. |
| Empty state icon | `<svg class="empty-icon">` (28×28, stroke 1.5) | OK. But `.empty-icon { color: rgba(78, 205, 196, 0.25); }` is *very* faint. At 25% opacity on a 0.92 dark background, the circle is nearly invisible. |
| Role badge | `<span id="selected-role-badge">` | Uses `.selected-role-badge { color: #4ecdc4; }` at full opacity, but the background is `rgba(78, 205, 196, 0.15)` (15% teal). Combined with the 0.55rem font size, the badge reads as "light teal text on slightly-teal background" — low contrast. |
| Status indicator | `.selected-card-status.active` / `.inactive` | Green/red colors `#96ceb4` and `#ff6b6b` at full saturation. Good. But the text inside is `text-transform: uppercase` at 0.55rem, which is below the WCAG 2.1 minimum (12px = 0.75rem) for non-decorative text. |
| Animation | `card-enter 0.25s ease-out` | Slide-up + fade-in. 250ms is fast enough to feel responsive but slow enough to read as "card appeared." Reasonable. |
| Footer | "Node N · Field focus" or "Search result" | Helpful provenance. But `currentFocusedIdx` is shown as a raw integer; no hash or shortened ID. For 8,406 nodes, "Node 4729" is not human-meaningful. |

### Findings

1. **Glass card collision risk.** `bottom: 4.5rem` is the same anchor as `.journey-chrome`. On a 360px viewport, the focus card (260px wide) and the journey chrome (centered, up to 95vw) overlap vertically. The focus card sits right, the journey chrome is centered — they probably don't overlap *horizontally* on most screens, but on 320px the focus card is forced to 100% width and the journey chrome is forced to 95vw, so they stack and the focus card covers the bottom of the journey chrome.
2. **Empty icon too faint.** 25% teal on near-black is below the perceptual threshold on most monitors. Bump to 45–55% for the icon and 30% for the text.
3. **Status text below 0.75rem.** 0.55rem ≈ 8.8px. WCAG 2.1 SC 1.4.4 recommends 12px minimum for resizable text, and the AAA contrast guidelines for non-decorative text need ≥18px or 14px bold. Status badges are functional, not decorative.
4. **"Node N" footer is uninformative.** Showing a raw index out of 8,406 is not actionable. Consider showing the cluster name or category instead, or both.
5. **Role badge low contrast.** 0.55rem teal on 15% teal is the same hue family. The badge reads as "softly glowing teal text on a teal-tinted background" — no edge, no separation.

### Prioritized improvements

```
### Priority 1: Reduce glass-card collision risk
- Where: src/components/FocusCard.svelte (mobile @media) and JourneyChrome.svelte
- Current: focus-card bottom: 4.5rem; journey-chrome bottom: 4.5rem at desktop, 3.5rem at mobile
- Proposed: Offset the focus card to bottom: 7rem when journey chrome is also active,
  OR shift focus card to top-right (top: 4.5rem; right: 1rem) when not in semantic-dive.
  This is a layout coordination fix, not a per-component fix.
- Impact: major (mobile composition)
- Effort: small

### Priority 2: Strengthen empty icon
- Where: src/components/FocusCard.svelte line 213 (CSS)
- Current: color: rgba(78, 205, 196, 0.25)
- Proposed: color: rgba(78, 205, 196, 0.5); add subtle pulse animation 4s ease-in-out
- Impact: small
- Effort: trivial

### Priority 3: Replace "Node N" footer with cluster + category
- Where: src/components/FocusCard.svelte (footer div)
- Current: <span class="footer-index">Node {currentFocusedIdx}</span>
- Proposed: <span class="footer-cluster">{formatClusterName(record.cluster)} · {record.category}</span>
- Impact: medium (information density)
- Effort: trivial

### Priority 4: Bump status text to 0.65rem minimum
- Where: src/components/FocusCard.svelte (selected-card-status CSS)
- Current: font-size: 0.55rem
- Proposed: font-size: 0.65rem; padding 0.2rem 0.5rem
- Impact: small (accessibility)
- Effort: trivial
```

---

## B. Journey / Trail State (`src/components/JourneyChrome.svelte`)

### Current implementation

| Element | Source | Observation |
|---|---|---|
| Position | `position: absolute; bottom: 4.5rem; left: 50%; transform: translateX(-50%)` | Centered bottom anchor. Confirmed collision with focus card on narrow viewports. |
| Compass header | `.journey-header` (kicker + title + note) | 0.6rem kicker, 0.75rem title, 0.6rem note. Stacked vertically. Good hierarchy. |
| Walk breadcrumb | `.walk-breadcrumb` (chips separated by `/`) | 0.7rem chips, monospace fallback. `display: none` by default, `display: flex` when `.visible` class added. **Visibility is gated by `showBreadcrumb` derived, not state.** This means in a `data-panel-surface="search"` state, the breadcrumb disappears even if the user has walked. |
| Trail controls | `.trail-controls` (Prev | context | Next) | 4-column layout (button | context-wrapper | button | show-trail). The show-trail button is positioned at the far left, not at the far right where users expect it. |
| Trail context text | `trailContextText` | Computed from `walkHistoryIndices`, `threadSource`, `neighborCount`, `currentPoint`. Long sentences truncated with `text-overflow: ellipsis; white-space: nowrap` (max-width 280px). For rich context this strips critical information. |
| Progress | `progressText` | "Stop N of M" or "N nearby ready" or "Start exploring." Clear, but the three states are visually identical (just different text). |
| Next stop | `nextStopName` | Shows "Next: {name}" in 0.55rem teal. Helpful preview, but the name can be long and will be truncated by the parent's nowrap. |
| Neighbor rail | `.focus-stage-neighbor-list` | Up to 5 candidates (configurable by viewport: 1 on ultra-compact, 2 on compact landscape, 4 on mobile+compact, 5 on desktop). Each pill is a `<div role="button">` with hover, focus, click handlers. |
| Mobile rail | `.focus-stage-neighbor-actions` flex-direction: column at @media 768px | **Stacks Inspect + Pin vertically on mobile.** Correct for touch target height, but both are *inside* the neighbor pill, which is itself clickable. |

### Findings

1. **Trail controls layout is 4-up at desktop, 2-up at mobile, but the order is non-obvious.** Show-trail | Prev | context | Next. Users expect navigation arrows adjacent to context. Show-trail is the meta-action; it should be at the end or in a separate utility cluster.
2. **Trail context ellipsis hides "Semantic connections exist around X, but none survive the current slice."** This is a high-information message that becomes "Semantic connections exist around X, but none..." at narrow widths. The full message is important; truncating it to 280px silently loses the nuance.
3. **Mobile neighbor rail: nested tap targets.** The neighbor pill has `onclick={inspectCandidate}`. The Inspect and Pin buttons are spans with `onclick={(e) => { e.stopPropagation(); ... }}`. The `stopPropagation` works, but the visual nesting is: outer pill (44px+ tall) → inner buttons (44px tall). When the user taps "Pin", they hit the inner button. When they tap the pill background, they hit "Inspect." The Pin button is at the bottom of the vertical stack — its 44px height is the full available space, but the upper area is the pill's clickable region. **Result: tap targets feel inconsistent.**
4. **`showBreadcrumb` and `chromeHasFocus` are not derived from the same source.** `chromeHasFocus` is a derived from `hasFocus()` (which reads `window.__APP_STATE__`); `showBreadcrumb` is also derived but with `legacyRefreshTick` as the reactivity trigger (the `setInterval` at `onMount` increments every 250ms). **The component polls the legacy state every 250ms via a setInterval.** This is a known pattern for compatibility, but it's a code smell.
5. **The compass status note is generic.** The string "Start wide, then search by need or clue to open one trail through the network." is hardcoded. It should adapt to the current state (search-anchor, focus, inside, trail, empty).

### Prioritized improvements

```
### Priority 1: Reflow trail controls at mobile
- Where: src/components/JourneyChrome.svelte (.trail-controls mobile @media)
- Current: 4-column flex with Show | Prev | context | Next
- Proposed: On mobile (<768px), collapse to 2 rows: [Show | Next] / [Prev | context].
  Or use a single row with Prev | context | Next and put Show as a small icon button
  at the right edge of the context wrapper.
- Impact: major (mobile usability)
- Effort: small

### Priority 2: Allow trail context to wrap instead of ellipsis
- Where: src/components/JourneyChrome.svelte (.trail-context-text)
- Current: white-space: nowrap; text-overflow: ellipsis; max-width: 280px
- Proposed: white-space: normal; line-clamp: 2; max-width: 320px on mobile
- Impact: medium (information completeness)
- Effort: trivial

### Priority 3: Separate the neighbor pill click target from inner buttons
- Where: src/components/JourneyChrome.svelte (.focus-stage-neighbor-pill)
- Current: Outer div role=button, inner spans role=button with stopPropagation
- Proposed: Make the outer pill a non-interactive container (div, no role=button,
  no click handler). The "main" area becomes a button (Inspect). The Pin button
  stays separate. The pill is now a flex container, not a button.
- Impact: major (accessibility, touch target clarity)
- Effort: small

### Priority 4: Replace setInterval polling with onStoreChange subscription
- Where: src/components/JourneyChrome.svelte (onMount, legacyRefreshTick)
- Current: setInterval(legacyRefreshTick += 1, 250) — polls legacy state every 250ms
- Proposed: Subscribe to a Svelte derived that wraps hasFocus() with a manual
  invalidate signal; OR add a $effect that reads from document.body.dataset
  via MutationObserver (similar to FocusCard.svelte but local to this component)
  and updates a local $state. The 250ms setInterval is a hot path and wastes cycles.
- Impact: medium (perf + cleanliness)
- Effort: small
```

---

## C. Thread Inspector (`src/components/ThreadInspector.svelte`)

### Current implementation

| Element | Source | Observation |
|---|---|---|
| Position | `position: absolute; top: 1rem; left: 1rem;` | Top-left anchor. **This is the same corner as the loading overlay and the help/legend toggles in some states.** Possible z-index conflict. |
| Width | `max-width: 260px` | Reasonable. On mobile, 1rem padding eats 32px, leaving 260px which fits a 320px viewport with overflow. |
| Title | `<h2 id="focus-thread-inspector-title">` | 0.84rem bold, color #e0f0f0. Good. |
| Copy | `<p id="focus-thread-inspector-copy">` | 0.68rem, color #b0d0d0. The "Previewing the semantic connection from {source} to node {inspectedIndex}." text is helpful but uses raw index, not business name. |
| Meta | `<div id="focus-thread-inspector-meta">` | "{n} segments · {n} braids · {n} endpoints" in 0.6rem monospace. The numbers are always 1/0/2 by default; only updated on rail hover or pin. |
| Actions | 3-button grid: Pin/Follow/Clear | 3 equal columns, 44px height, primary action is not visually distinguished. Pin = primary candidate but not styled primary. |
| Close button | `<button class="inspector-close">` | × at 1rem font, color #6a8a8a, hover #e0f0f0. OK. But the close button is only in the header; users may not see it. |

### Findings

1. **Same top-left anchor as help/legend toggles.** If the user opens the thread inspector while the legend is visible, both stack in the same corner. The thread inspector is `top: 1rem; left: 1rem` and the legend toggle is typically `top: 1rem; right: 1rem`, so they don't directly overlap, but the close button on the thread inspector may be hidden behind the legend close on smaller viewports.
2. **"Connection Preview" kicker is vague.** "Previewing the semantic connection from {source} to node N" — what is the source? "rail-hover"? "rail-inspect"? "semantic-search"? The user has no way to tell. Either localize the source name ("from your search") or remove it.
3. **No primary action styling.** Pin is the most likely next action (it persists the connection), but it's styled identically to Follow and Clear. Use the `.primary` class pattern from the neighbor rail (`color: #4ecdc4; border-color: rgba(78,205,196,0.3)`) for Pin.
4. **Numbers in meta are static placeholders.** segmentCount=1, braidCount=0, endpointCount=2 by default. These are set in `updateThreadInspector()` from the rail hover path. If the user opens the inspector without a recent rail hover, the numbers are always 1/0/2. They convey no information.
5. **`bodyInspectedIndex()` reads from `document.body.dataset.inspectedThreadIndex`.** Same DOM-mirroring pattern as FocusCard. If the legacy code doesn't set this dataset, the inspector shows "Connection Inspector" with generic copy. Acceptable fallback, but inconsistent.

### Prioritized improvements

```
### Priority 1: Distinguish Pin as the primary action
- Where: src/components/ThreadInspector.svelte (focus-thread-inspector-actions)
- Current: 3 equal-column buttons, all same style
- Proposed: Pin gets .primary class (teal border, teal text). Follow is secondary.
  Clear is destructive and gets a muted gray.
- Impact: medium (action hierarchy)
- Effort: trivial

### Priority 2: Localize the "source" string
- Where: src/components/ThreadInspector.svelte (handleFollow + focus-thread-inspector-copy)
- Current: "Previewing the semantic connection from {inspector.source} to node {inspectedIndex}."
- Proposed: Map source values to user-readable strings:
  - 'rail-hover' -> 'hovering a neighbor'
  - 'rail-inspect' -> 'inspecting a neighbor'
  - 'semantic-search' -> 'your search anchor'
  - 'trail-step' -> 'your last trail step'
- Impact: medium (clarity)
- Effort: small

### Priority 3: Hide meta when values are placeholder
- Where: src/components/ThreadInspector.svelte (focus-thread-inspector-meta)
- Current: Always shown with default 1/0/2
- Proposed: Hide meta if segmentCount <= 1 && braidCount === 0 && endpointCount <= 2
  (placeholder state). Show only when the data is meaningful.
- Impact: small (noise reduction)
- Effort: trivial

### Priority 4: Shift thread inspector to avoid corner collision
- Where: src/components/ThreadInspector.svelte (CSS position)
- Current: top: 1rem; left: 1rem
- Proposed: top: 4.5rem (below the help/legend row); right: 1rem.
  This puts it top-right, away from the focus card (bottom-right) and
  journey chrome (bottom-center).
- Impact: medium (mobile composition)
- Effort: trivial
```

---

## D. Focus Pocket (`src/components/FocusPocket.svelte` + `focus-pocket.ts`)

### Current implementation

| Element | Source | Observation |
|---|---|---|
| HTML overlay | `position: absolute; top: 0; left: 0; width: 100%; height: 100%;` | Full-canvas overlay. **Pointer-events: none** on the container; child nodes have `pointer-events: auto`. The constellation covers the full screen. |
| Pocket nodes | `<div class="focus-node">` (positioned by `style="left: X%; top: Y%"`) | Position derived from `((node.position[0] + 1) / 2) * 100` — this maps from the 3D world coordinates [-1, 1] to screen-space percentage. **But this is a 2D projection of a 3D layout.** No depth, no occlusion. |
| Node dot | 10×10px circle, role-colored (teal/yellow/red) | Roles: direct, support, civic. Three distinct colors with subtle box-shadow. |
| Node label | 0.55rem, color #b0d0d0, max-width 80px | Truncated to 80px. **At 80px, only the first ~10 characters of a business name are visible.** For names like "Joe's Plumbing & Heating LLC" this is barely meaningful. |
| Anchor indicator | Pulsing 16×16px circle, teal border | 1.5s ease-in-out infinite pulse. The pulse is the only animation in this component. |
| Mirroring | `mirrorFocusPocketToSvelteStore()` | Called after `applyLocalNeighborhoodFocus(idx)` in `$effect`. The Svelte store `focusPocketNodes` is populated from the legacy `state.navState.focusPocketIndices`. |

### Findings

1. **HTML overlay is a poor 2D projection of a 3D constellation.** The nodes are positioned by screen-space percentage, but the 3D engine already knows where they are. **The HTML overlay duplicates the 3D rendering.** The 3D engine draws the focus nodes in WebGL (via `applyLocalNeighborhoodFocus`), and then the HTML overlay draws them again as divs. **Result: the user sees two sets of nodes, possibly misaligned.**
2. **80px label truncation is too aggressive.** Business names in the dataset can be 30+ characters. 80px at 0.55rem font shows ~10 chars. The user has to hover for a tooltip (if any) to see the full name.
3. **Three role colors are visually similar at small size.** Direct (teal), Support (yellow #ffd93d), Civic (red #ff6b6b) — at 10px diameter, the box-shadows blend and the role is hard to distinguish.
4. **The mirror pattern is a smell.** `applyLocalNeighborhoodFocus` writes to legacy state; `mirrorFocusPocketToSvelteStore` reads legacy state and writes to Svelte store; Svelte store is what the component reads. **Three hops, one source of truth.** If `mirrorFocusPocketToSvelteStore` is async or out-of-order, the HTML overlay and the 3D render are inconsistent.
5. **No touch interaction on the HTML overlay.** The node is `role="button"`, but there are no `onclick` or `onkeydown` handlers. The HTML overlay is decorative.

### Prioritized improvements

```
### Priority 1: Remove the HTML overlay entirely OR remove the 3D rendering
- Where: src/components/FocusPocket.svelte (entire component) + focus-pocket.ts
- Current: Both 3D constellation and HTML overlay are drawn
- Proposed: Pick one. The 3D rendering is the source of truth (it's animated,
  depth-aware, and integrated with the camera). Remove the HTML overlay.
  If the 3D rendering is not yet complete enough, remove it and keep only
  the HTML overlay. Two sets of nodes is worse than one.
- Impact: major (visual coherence, perf)
- Effort: medium (architectural decision)

### Priority 2: Widen the label
- Where: src/components/FocusPocket.svelte (.node-label CSS)
- Current: max-width: 80px; white-space: nowrap; overflow: hidden
- Proposed: max-width: 160px; white-space: normal; line-clamp: 2;
  Or remove the inline label and use a hover tooltip via the existing
  tooltips.css infrastructure.
- Impact: small (readability)
- Effort: small

### Priority 3: Make the role colors more distinct
- Where: src/components/FocusPocket.svelte (.focus-node.direct/support/civic)
- Current: teal #4ecdc4 (shadow 0.6), yellow #ffd93d (shadow 0.4), red #ff6b6b (shadow 0.4)
- Proposed: Use distinct shapes (circle, square, diamond) OR distinct sizes
  (12px, 10px, 8px) in addition to color. Color-only is below the WCAG
  "do not rely on color alone" guideline.
- Impact: small (accessibility)
- Effort: small

### Priority 4: Add click handler to HTML overlay nodes
- Where: src/components/FocusPocket.svelte
- Current: role="button" with no handlers
- Proposed: onclick={() => inspectCandidate(node.index)} or onclick={() => focusNode(node.index)}
- Impact: medium (interaction completeness)
- Effort: small
```

---

## E. Mobile Experience

### Findings

The mobile premium CSS split (`mobile_premium__*.css`) is the late-cascade owner. The 7 files cover:
- `focus-dive.css` (1762 lines) — mobile focus/semantic-dive composition
- `chrome.css` (865 lines) — mobile chrome, controls, search drawer
- `state.css` (840 lines) — state-machine gates
- `idle.css` (88 lines) — mobile idle tweaks
- `map.css` (119 lines) — map summary
- `surfaces.css` (1178 lines) — late geometry corrections
- `narrow.css` (150 lines) — ≤360px escape hatches

From the 2026-06-05 bugsweep, the `narrow.css` had a scope leak at lines 9–26 (bare class selectors without `body.is-active` gate) and an escape-hatch gap at lines 96–142 (≤360px gap). These are tracked in the bugsweep doc and should be considered unresolved.

### Specific mobile issues from the deferred states

1. **Focus card mobile breakpoint forces 100% width but uses `border-radius: 22px 22px 0 0` only in `semantic-dive` state.** In other mobile states (e.g., `focus-search` with `field-node` panel mode), the card is full-width but has the default 0.6rem border-radius. Inconsistent with the "bottom sheet" idiom.
2. **Journey chrome at 320px viewport.** The neighbor list has `max-height: min(40vh, 280px)` and `overflow-y: auto`. On a 320px × 568px iPhone SE viewport, 40vh is 227px. The list fits ~3 pills. Fine, but the `flex-direction: column` for `.focus-stage-neighbor-actions` means the Inspect/Pin buttons are stacked, but the *parent pill* still has `cursor: pointer` and the entire pill surface is clickable. This creates the nested-tap-target problem mentioned in §B.3.
3. **Thread inspector at 320px viewport.** `max-width: 260px` + `top: 1rem; left: 1rem` + 1rem padding = 260px content area. On a 320px viewport, this leaves 28px on the right. Tight but fits. The 3-button grid (Pin/Follow/Clear) is 44px tall; total inspector height is ~180px. Below the 4.5rem (72px) top offset = fits. OK.
4. **The 360px escape-hatch gap is a known unresolved issue.** The `narrow.css` escape-hatch at lines 96–142 covers `min-width: 361px and max-width: 768px`. At ≤360px, journey compass is hidden entirely (lines 71–73). **Users on a 320px iPhone SE in focus state have no chrome escape path.**

### Prioritized improvements

```
### Priority 1: Resolve the 360px escape-hatch gap
- Where: css/mobile_premium__narrow.css (lines 96–142)
- Current: escape-hatch covers 361–768px only
- Proposed: Extend escape-hatch to ≤360px, or add a minimal escape affordance
  (small "Show chrome" button) for the ≤360px range.
- Impact: major (accessibility for small phones)
- Effort: small
- Reference: 2026-06-05 bugsweep, §3 CSS Cascade & Visual

### Priority 2: Standardize the focus card bottom-sheet radius
- Where: src/components/FocusCard.svelte (mobile @media)
- Current: border-radius: 22px 22px 0 0 only in semantic-dive state
- Proposed: Apply the same radius in focus-search + field-node panel mode
  (the other "bottom sheet" mobile states).
- Impact: small (visual consistency)
- Effort: trivial

### Priority 3: Add scope gates to narrow.css bare selectors
- Where: css/mobile_premium__narrow.css (lines 9–26)
- Current: bare class selectors (`.stat-caption`, `.map-trail-strip`, etc.)
  without body.is-active or data-panel-surface gate
- Proposed: Prefix with body.is-active[data-panel-surface] to match
  scoped journey-compass selectors in the same block.
- Impact: medium (state-leak prevention)
- Effort: trivial
- Reference: 2026-06-05 bugsweep, §3 CSS Cascade & Visual
```

---

## F. Cross-Cutting Findings

### Z-index implicit cascade

The AGENTS.md mandates `src/lib/z-index.ts` as the single source for z-index values, mirrored in `src/lib/css/z-layers.css`. Components reference `var(--z-focus-card)`, `var(--z-overlays)`, `var(--z-journey-chrome)`, but the CSS in each component provides a fallback (`var(--z-focus-card, 600)`). This is intentional for now (the tokens may not be defined everywhere), but it means:
- If `src/lib/css/z-layers.css` is not loaded, components fall back to magic numbers.
- A developer reading one component cannot know the z-index without checking the token file.
- A z-index change in the token file may not propagate to a component that uses the fallback.

**Recommendation:** Audit the loaded order of `src/lib/css/z-layers.css` vs. the component CSS to ensure tokens are defined before components are mounted. If the order is wrong, the fallbacks silently win.

### DOM-mirrored reactivity

Three components (FocusCard, JourneyChrome, ThreadInspector) read state from `<body>` data-attributes via `MutationObserver` or `document.body.dataset`. This is a defensive pattern for the legacy-state-to-Svelte migration, but it:
- Wastes cycles on every body attribute change.
- Creates two sources of truth (legacy state + Svelte state).
- Will silently break if the legacy state is removed before the DOM-mirroring is.

**Recommendation:** Define a milestone for removing DOM-mirroring. Track it in the migration plan doc.

### Touch target composition

Multiple components meet the 44px minimum in isolation. In composition (focus card + journey chrome + thread inspector + neighbor rail), the touch targets overlap. A user tapping the bottom-right of a 390px viewport may hit:
1. The journey chrome (bottom-center, 4.5rem from bottom)
2. The focus card (bottom-right, 4.5rem from bottom)
3. A neighbor pill (inside journey chrome, ~56px tall)
4. An Inspect/Pin button (inside neighbor pill, 44px tall, column on mobile)

**Recommendation:** Map out the touch-target grid for each state. Identify overlaps. Offset or hide competing surfaces based on the active state.

### Accessibility gaps

- Focus card empty icon at 25% opacity is below WCAG SC 1.4.11 (Non-text Contrast).
- Status text at 0.55rem is below WCAG SC 1.4.4 (Resize Text) for non-decorative text.
- Focus pocket role differentiation is color-only, below WCAG SC 1.4.1 (Use of Color).
- The thread inspector's "source" string is implementation-leaking (rail-hover, rail-inspect).
- The 360px escape-hatch gap means some mobile users have no chrome access in focus state.

---

## G. Prioritized Improvement Plan (Top 12)

| # | Improvement | File | Impact | Effort | Category |
|---|---|---|---|---|---|
| 1 | **Resolve 360px escape-hatch gap** | `css/mobile_premium__narrow.css:96-142` | 🔴 Major | 🟢 Small | E.1 |
| 2 | **Decide focus pocket HTML overlay vs. 3D rendering** | `src/components/FocusPocket.svelte` + `focus-pocket.ts` | 🔴 Major | 🔴 Medium | D.1 |
| 3 | **Offset focus card to avoid journey chrome collision** | `src/components/FocusCard.svelte` mobile CSS | 🔴 Major | 🟢 Small | A.1 |
| 4 | **Separate neighbor pill click target from inner buttons** | `src/components/JourneyChrome.svelte` | 🔴 Major | 🟢 Small | B.3 |
| 5 | **Reflow trail controls at mobile** | `src/components/JourneyChrome.svelte` mobile @media | 🟠 Medium | 🟢 Small | B.1 |
| 6 | **Allow trail context to wrap instead of ellipsis** | `src/components/JourneyChrome.svelte` CSS | 🟠 Medium | 🟢 Trivial | B.2 |
| 7 | **Replace "Node N" footer with cluster + category** | `src/components/FocusCard.svelte` | 🟠 Medium | 🟢 Trivial | A.4 |
| 8 | **Distinguish Pin as primary in thread inspector** | `src/components/ThreadInspector.svelte` | 🟠 Medium | 🟢 Trivial | C.1 |
| 9 | **Localize "source" string in thread inspector** | `src/components/ThreadInspector.svelte` | 🟠 Medium | 🟢 Small | C.2 |
| 10 | **Add scope gates to narrow.css bare selectors** | `css/mobile_premium__narrow.css:9-26` | 🟠 Medium | 🟢 Trivial | E.3 |
| 11 | **Standardize focus card bottom-sheet radius** | `src/components/FocusCard.svelte` mobile CSS | 🟡 Small | 🟢 Trivial | E.2 |
| 12 | **Remove 250ms setInterval polling in JourneyChrome** | `src/components/JourneyChrome.svelte` onMount | 🟡 Small | 🟢 Small | B.4 |

---

## H. Implementation Recommendations

### Phase 1 — Trivial (< 30 min, no visual risk)

1. **#1, #6, #7, #8, #10, #11, #12** — All CSS/HTML edits that don't change layout structure. Each is a single block of CSS or one derived value.

### Phase 2 — Small effort (1–2 hrs, layout coordination)

2. **#3, #4, #5, #9** — Layout coordination between focus card, journey chrome, and thread inspector. Requires verifying the touch-target grid doesn't break on 320px, 360px, 390px, 768px, 1024px, 1440px.

### Phase 3 — Architectural (2–4 hrs)

3. **#2** — Decide whether the focus pocket is HTML or 3D. If 3D, remove the HTML overlay and add hover/click handlers to the 3D nodes (which require raycasting). If HTML, remove the 3D constellation.

4. **DOM-mirroring removal** — Track in migration plan. Replace `MutationObserver` + `setInterval` polling with Svelte reactive derivations that read from the legacy store via a manual invalidation signal.

---

## I. Cross-References

- 2026-06-06 critique: deferred "focus selected state", "trail/journey state", "focus pocket / neighborhood-inside state", and "mobile observations" to this follow-up.
- 2026-06-07 re-audit: confirmed 8 remaining gaps (thread depth-write, dead envelope, atmosphere sphere opacity, county reference sphere, etc.). **None of those 8 gaps are re-examined here** — the 3D scene/atmosphere was not re-graded.
- 2026-06-05 bugsweep: confirmed `narrow.css` escape-hatch gap and bare-selector scope leak. Both are flagged here as #1 and #10 in the prioritized plan.
- AGENTS.md durable invariant: `withStateMutation()` required for tracked sub-objects. The `setFocusPocketIndices` family in `focus-pocket.ts` does not use it. **This is a latent bug** — the navState writes will throw in production. Flagged here for awareness; not a visual issue.

---

## J. Open Questions

1. **Focus pocket: HTML or 3D?** The current dual-render is the worst of both. The 3D rendering is more visually integrated but harder to make accessible (no screen-reader hook). The HTML overlay is accessible but visually flat. Need a product call.
2. **Should journey chrome and focus card share the same `bottom: 4.5rem` anchor?** At narrow viewports, yes. At desktop, no — they should be on opposite sides. A state-aware offset is the right answer.
3. **Is the 250ms `setInterval` in JourneyChrome needed?** It's there to invalidate `legacyRefreshTick` so derived values re-evaluate. This is a compatibility shim for the legacy `__APP_STATE__`. When the migration is complete, this should be removed.
4. **Should the thread inspector be top-left or top-right?** The help/legend toggles are typically top-right. The loading overlay is full-canvas but not blocking. The thread inspector as top-left avoids the help/legend but is in the same corner as the loading overlay (which is full-canvas anyway). A product call.

---

## Appendix: Files Examined

- `src/components/FocusCard.svelte` (entire file, 380 lines)
- `src/components/FocusPocket.svelte` (entire file, 117 lines)
- `src/components/JourneyChrome.svelte` (lines 1–646, then continued at 200–646)
- `src/components/ThreadInspector.svelte` (entire file, 181 lines)
- `js/modules/focus-pocket.ts` (lines 1–150, then continued at 151–410)
- `docs/semantic-demo-css-ownership-map.md` (mobile premium split, focus-stage ownership)
- `docs/semantic-demo-bugsweep-2026-06-05.md` (CSS scope leak, narrow.css escape-hatch gap)
- `docs/visual-critique-2026-06-06.md` (prior deferred states list)
- `docs/visual-critique-2026-06-07.md` (re-audit, 8 remaining 3D gaps)
