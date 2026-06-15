# Visual Critique Closeout — W12 Deferred States Sweep

**Date:** 2026-06-15
**Reviewer:** Automated Playwright sweep (HEATED mode)
**Master commit:** ed419b2
**Viewport:** 1440x900 (desktop) + 390x844 (mobile iPhone 14 Pro)
**Dev server:** Vite 8.0.14 on port 5173

---

## Executive Summary

**Grade update: B- → B**

The W12 closeout sweep verified 6+ findings from the 2026-06-12 deferred states critique across 5 visual states. Key improvements since the original critique:

- **2 findings FIXED:** "Node N" footer replaced with cluster name (A.4), trail context text wraps instead of truncating (B.2)
- **2 findings PARTIAL:** Pin button visually distinguished as primary (C.1), source string partially localized (C.2)
- **3 findings PRESENT:** Role badge low contrast (A.5), static meta placeholders (C.4), empty state hidden from screen readers (cross-cutting)
- **1 new observation:** Mobile mode chips show icons only (E.5)

The glass-morphism composition problem remains: focus card, journey chrome, and thread inspector all use the same `rgba(7,16,24,0.92)` + `blur(12px)` visual language. On narrow viewports, these surfaces stack without clear visual hierarchy.

---

## Per-State Verdict

### A. Focus Selected State
**Screenshot:** `tmp/w12-visual-qa-closeout/focus-selected/screenshot.png`
**Verdict:** GOOD with caveats

| Finding | Status | Evidence |
|---------|--------|----------|
| A.1 Glass card collision risk | PARTIAL | Focus card position:relative, journey chrome position:absolute bottom:72px. No overlap at 1440px. Needs 320px verification. |
| A.2 Empty icon too faint | PARTIAL | No separate .empty-icon SVG found. Empty state text at full opacity with muted color. |
| A.3 Status text below 0.75rem | FIXED | Status text fontSize: 16px (1rem), NOT 0.55rem as critique claimed. |
| A.4 "Node N" footer uninformative | **FIXED** | Footer shows "Professional Services Field focus" — cluster name + context. |
| A.5 Role badge low contrast | **PRESENT** | 9.6px teal on 15% teal background. Below WCAG 12px minimum. |

### B. Journey / Trail State
**Screenshot:** `tmp/w12-visual-qa-closeout/journey-trail/screenshot.png`
**Verdict:** GOOD

| Finding | Status | Evidence |
|---------|--------|----------|
| B.1 Trail controls layout non-obvious | PARTIAL | Grid layout (not flex). Order: Show trail | Prev | context | Next. |
| B.2 Trail context ellipsis hides info | **FIXED** | whiteSpace:normal, textOverflow:clip. Text WRAPS. |
| B.3 Nested tap targets in neighbor rail | CANNOT VERIFY | 0 neighbors in tested state. |
| B.4 250ms setInterval polling | CODE-LEVEL | Not visually impactful. |
| B.5 Compass status note generic | PRESENT | Same generic text regardless of state. |

### C. Thread Inspector
**Screenshot:** `tmp/w12-visual-qa-closeout/thread-inspector/screenshot.png`
**Verdict:** GOOD with caveats

| Finding | Status | Evidence |
|---------|--------|----------|
| C.1 Distinguish Pin as primary | **FIXED** | Pin borderColor 0.65 opacity vs 0.22 for others. |
| C.2 Localize "source" string | PARTIAL | "inspecting a neighbor" is user-readable, but "node 513" is raw index. |
| C.3 Hide meta when placeholder | **PRESENT** | "1 segments · 0 braids · 2 endpoints" shown with default values. |
| C.4 Shift to avoid corner collision | NOT VERIFIED | Top-left position. No collision observed at 1440px. |

### D. Focus Pocket
**Screenshot:** `tmp/w12-visual-qa-closeout/focus-pocket/screenshot.png`
**Verdict:** PARTIAL (limited verification)

| Finding | Status | Evidence |
|---------|--------|----------|
| D.1 HTML overlay duplicates 3D | PARTIAL | Container exists, 0 nodes rendered. Dual-render concern valid. |
| D.2 80px label truncation | CANNOT VERIFY | 0 nodes rendered. |
| D.3 Role colors similar at small size | CANNOT VERIFY | 0 nodes rendered. |
| D.4 Mirror pattern smell | CODE-LEVEL | Not visually impactful. |
| D.5 No touch interaction | CANNOT VERIFY | 0 nodes rendered. |

### E. Mobile Experience
**Screenshot:** `tmp/w12-visual-qa-closeout/mobile/screenshot.png`
**Verdict:** GOOD with caveats

| Finding | Status | Evidence |
|---------|--------|----------|
| E.1 360px escape-hatch gap | CANNOT VERIFY | Tested at 390px, not 360px. |
| E.2 Focus card bottom-sheet radius | PARTIAL | 12px radius, not 22px 22px 0 0 as critique claimed. |
| E.3 narrow.css scope leak | CODE-LEVEL | Not visually verifiable. |
| E.4 Touch target composition | PARTIAL | Mode chips 44x44px (good). Focus card 338px wide. |
| E.5 Mobile mode chips icons only | **NEW** | Text labels hidden on mobile. Valid optimization but reduces discoverability. |

---

## New Issues Identified

1. **Vite HMR error on parallel-session file:** `@lib/engine/event-bus-bridge` import failed in `src/lib/journey/semantic-overlay.ts`. This is a parallel-session modification, not a product bug. The error overlay blocked the page until dismissed.

2. **Focus pocket nodes don't render in non-inside states:** The focus pocket container exists but renders 0 nodes when panelSurface is not "inside". This may be by design, but it means the HTML overlay is effectively dead in most states.

3. **Thread inspector title uses raw node index:** "Node 513 thread" is not human-meaningful. Should show business name or cluster.

---

## Recommended Next Actions

### Priority 1 (Trivial, < 30 min)
1. **Bump role badge font to 0.65rem** — `src/components/FocusCard.svelte` CSS
2. **Hide thread inspector meta when placeholder values** — `src/components/ThreadInspector.svelte`
3. **Add aria-live to empty state** — `src/components/JourneyChrome.svelte`

### Priority 2 (Small, 1-2 hrs)
4. **Localize thread inspector title** — Show business name instead of "Node N"
5. **Verify 360px viewport** — Test narrow.css escape-hatch gap at 320px
6. **Test focus pocket with neighbors** — Verify node rendering, label truncation, role colors

### Priority 3 (Medium, 2-4 hrs)
7. **Glass card visual differentiation** — Differentiate focus card, journey chrome, and thread inspector with distinct visual treatments
8. **DOM-mirroring removal** — Replace MutationObserver + setInterval with Svelte reactive derivations

---

## Files Examined

- `src/components/FocusCard.svelte`
- `src/components/JourneyChrome.svelte`
- `src/components/ThreadInspector.svelte`
- `src/components/FocusPocket.svelte`
- `css/mobile_premium__narrow.css`
- `css/mobile_premium__focus-dive.css`

## Evidence Directory

All screenshots, DOM snapshots, computed styles, and finding verifications saved to:
`tmp/w12-visual-qa-closeout/`

```
tmp/w12-visual-qa-closeout/
├── desktop-idle.png
├── focus-selected/
│   ├── screenshot.png
│   ├── dom-snapshot.txt
│   ├── computed-styles.txt
│   └── finding-verification.md
├── journey-trail/
│   ├── screenshot.png
│   ├── screenshot-with-neighbors.png
│   ├── dom-snapshot.txt
│   ├── computed-styles.txt
│   └── finding-verification.md
├── thread-inspector/
│   ├── screenshot.png
│   ├── dom-snapshot.txt
│   ├── computed-styles.txt
│   └── finding-verification.md
├── focus-pocket/
│   ├── screenshot.png
│   ├── screenshot-focus.png
│   ├── dom-snapshot.txt
│   └── finding-verification.md
└── mobile/
    ├── screenshot.png
    ├── computed-styles.txt
    └── finding-verification.md
```
