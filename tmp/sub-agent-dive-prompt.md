# Worker B — "semantic-dive" surface audit (read-only, evidence to tmp/)

You are a read-only UI audit worker in C:/Users/HP/repos/semantic-explorer.
The search/focus/map/inside surface audits are handled elsewhere; your job is
the **semantic-dive** surface (the row-of-connections deep explore panel).

## Success rubric (score yourself 0-10 at each gate — write it in the report)
- R5: You reach the semantic-dive panel surface in the live dev app
  (local:5174) and PROVE it: document.body[data-panel-surface] ===
  'semantic-dive' (also look for body[data-semantic-dive] and
  .compass-dive-surface element). If you cannot reach it after honest attempts
  (it requires specific interaction), the R5 answer is "NOT REACHABLE — reason
  + nearest surface reached", and you audit the nearest reachable surface with
  the same battery, clearly labeled.
- R4: DOM battery run + per-item JSONL evidence written to tmp/ (observable).
- R3: Triaged with the known false-positive classes; genuine issues each carry
  selector + computed geometry + repro.
- R2: Explicit VERDICT line naming real defects (MAX 3) or "NONE".
- R1: No edits outside tmp/. Read-only on src/, api/, css/, tests/, scripts/.

## How to reach semantic-dive (discover the exact path — it's part of the audit)
1. Dev server ALREADY running at http://localhost:5174. Do not start/kill.
   If down → report "SERVER DOWN".
2. node + playwright are devDependencies. Write your probe under tmp/.
3. Boot: splash CTA + WebGL gate (window.__APP_STATE__.points > 100). Desktop
   1440x900 headless chromium. You may import tmp/probe-lib.mjs or inline the
   equivalent bounded helpers.
4. Path hypothesis (VERIFY, don't assume): deep-link ?q=coffee → click first
   result → focus card → look for a "Dive" / dive-stage button
   (.focus-stage-dive-btn or compass surface trigger). The dive may live after
   the inside surface. If the button is locked, follow the selection rules.

## Probe protocol (same as sibling: NEVER hang silently)
- Every awaited call runs under hard timeout (Promise.race, ~15s or less).
- Heartbeat JSONL lines (fs.appendFileSync) per stage to
  tmp/audit-dive-<date>.jsonl.
- No giant stdout arrays — aggregate counts in the report; detail goes to the
  JSONL evidence file.

## Battery (once you are on the dive surface, or nearest reachable)
For every visible element (skip SCRIPT/STYLE/CANVAS/SVG, display:none,
visibility:hidden, opacity 0, 0×0 boxes):
1. horizontal overflow rect.right > innerWidth + 2 → record
2. clipped text nowrap + scrollWidth > clientWidth + 2 → record class+text+sw/cw
3. interactive h<42px → record class+text
4. interactive with no accessible name (aria-label/title/labelledby + no
   visible text) → record

KNOWN-FALSE-POSITIVE classes (dismiss in report, exclude from the real list):
   .sr-only/*sr-only*, .search-result-name/.selected-relationship-label/
   .focus-stage-neighbor-name ellipsis (intentional), .focus-pocket-a11y /
   off-canvas, leaflet tiles near right edge, disabled buttons.

Every genuine finding: selector, computed excerpt, ancestor with
overflow:hidden, on-screen at 1440×900 proof.

## Deliverable (MANDATORY, write to disk)
- tmp/audit-dive-REPORT-<initials or model>.md with:
  1. scorecard (5 rubric rows)
  2. evidence path(s)
  3. verdict list
  4. per genuine finding: repro recipe + recommended fix area
Last line sentinel:
   `DIVE AUDIT DONE — verdict: <VERDICT>`

## Non-negotiables
- Read-only codebase; only tmp/ writes.
- No npm install/build, no server restarts, no killing processes.
- ~25 min budget then stop + write report.

Bonus (worth +1 rubric on R5): capture whether the dive surface has a visible
keyboard focus indicator (.focus-visible) and whether its primary CTA has a
44px hit area at 390x844 mobile — mark as dives-a11y-check. Good luck.