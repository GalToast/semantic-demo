# Worker FIX-A — Land the W3 mobile empty-band fix (1-line CSS) + verify

You are an autonomous fix worker in C:/Users/HP/repos/semantic-explorer.
A prior audit (`tmp/subagent-w3-emptyband-REPORT.md`) diagnosed a user-visible
defect; your job is to LAND the one-line fix and PROVE it with measurements.

## The bug (verified by the audit, re-prove it before you touch anything)
- Mobile (390×844) idle surface shows a ~206px empty glassmorphic band below the
  search bar inside `aside#info-panel`.
- Cause: `css/mobile_premium__state.css` ~line 955 sets
  `height: min(42dvh, 320px)` on
  `body.view-galaxy[data-panel-surface='idle'][data-compact='true'] #info-panel.info-panel`
  while the panel's content (search bar) is only ~98px tall.
- A `.session-lock` is absent and no other agent is online → you own this claim.

## Your fix (Option A from the audit: minimal, safe)
- In that same rule, change `height: min(42dvh, 320px);` → `height: auto;`
- KEEP `min-height: 214px` and `max-height: min(42dvh, 320px)` (they stay as a
  floor/cap). ONLY the `height` line changes. One line. Nothing else in the rule.

## Rubric (score yourself 0-10, write it in the report)
1. R5 — You reproduce the bug first (Playwright 390×844, `?nodemo=1`, splash
   CTA, wait points>100): before-fix panel gap ≥ 190px. THEN apply the edit.
2. R4 — After fix, re-measure: panel height shrinks (≤ ~230px) and the dead
   band drops by ≥ 120px; search bar still visible + 44px touch target intact.
3. R3 — `npm run lint` and a quick `node --check`-style sanity pass on the
   touched file (CSS — verify no brace imbalance).
4. R2 — The journey/unit suite is NOT required for this CSS-only change, BUT
   you must prove NO regression at 390 mobile: search results still open, the
   panel does not overlap the footer compass.
5. R1 — You may only edit `css/mobile_premium__state.css`. Nothing else.

## Non-negotiables
- EDIT ONLY the one property in that one file. No reformatting, no moving
  blocks, no touching media queries or other rules.
- Do not run npm install / npm run build (Vite dev may be needed for probing —
  use `npm run dev:svelte` ONLY if a server is already running; otherwise use
  port 5174 hardcoded URL). Never kill processes.
- After the edit + measurement, write `tmp/empty-band-fixed-REPORT.md` with:
  before/after rects, the exact diff you applied, and the sentinel last line:
  `EMPTY-BAND DONE — band: <px-after> (was <px-before>)`
- Work bounded ~15 min. If the dev server is unavailable, still attempt the
  edit + CSS syntax check and report what you could and couldn't prove.

## Extra credit (+1 R5)
- Confirm the panel `aria-label="Business information"` survives (a11y intact).