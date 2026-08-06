# Worker A — "inside" surface audit (read-only, evidence to tmp/)

You are a read-only UI audit worker in C:/Users/HP/repos/semantic-explorer.
A probe harness ALREADY run the search/focus/map surfaces; your job is the
**inside** journey surface (the focused business's local neighborhood panel).

## Success rubric (score yourself 0-10 at each gate — write it in the report)
- R5: You reach the `inside` panel surface in the live dev app (local:5174) and
  prove it: document.body[data-panel-surface] === 'inside' (screenshot: state an
  exit line in the report; do NOT heap screenshots).
- R4: You run a DOM battery on the surface and write per-item JSONL evidence to
  tmp/ (observable mid-run, not stdout-only).
- R3: You triage hits with the known false-positive classes and only report
  genuine issues, each with selector + computed geometry.
- R2: You state a final VERDICT: names of any real UI defects (MAX 3, honestly
  verified) or "NONE".
- R1: You did NOT edit any file under src/, api/, css/, tests/, scripts/ — read
  only. You only write under tmp/ (your evidence + your report markdown).

## How you reach inside
1. Dev server is ALREADY running: http://localhost:5174 (Vite). Do NOT start
   or kill servers. If it is down, state that and stop (report "SERVER DOWN").
2. Use node + playwright (already a devDependency). Write your probe under
   tmp/ (e.g. tmp/probe-inside-audit.mjs), run it with node. Kill nothing.
3. Boot the app node: use `node --input-type=module tmp/probe-inside-audit.mjs`
   with headless chromium desktop 1440x900. The app has a splash CTA click +
   WebGL gate; wait for window.__APP_STATE__.points > 100 like the repo's
   tmp/probe-lib.mjs does (you may import it but it is not required).
4. Reach inside: deep-link `?q=coffee` first loads search results; click the
   first result (.search-result-listitem) to focus a business; then click the
   mode-chip that says "Inside" (or keyboard: tab to it and press Enter).
   If locked, follow the app's affordance (it requires a selection, which you
   just made). If the UI shows no "Inside" chip, that is itself a finding.

## Probe protocol (critical — do not violate)
- EVERY awaited call that can hang (page.goto, waits, clicks) must run under a
  hard timeout: use a helper like
  `const t = (p, ms=15000, n='x') => Promise.race([p, new Promise((_,r)=>setTimeout(()=>r(new Error(n+' TIMEOUT')), ms))])`.
- Write a heartbeat line to your evidence file after each stage so an observer
  can see progress: append JSONL `{"beat":"stage-name"}` to
  tmp/audit-inside-<date>.jsonl via fs.appendFileSync.
- NEVER put huge arrays in stdout logs. Results go to the JSONL file or a
  compact report. If a scan returns more than ~200 items, aggregate counts in
  the report, not a dump.

## Battery to run once surface==='inside' (or closest reachable)
Capture with computed styles + boundingClientRect on every visible element
(skip SCRIPT/STYLE/CANVAS/SVG, display:none, visibility:hidden, opacity 0,
0×0 boxes). For each visible element:
1. horizontal overflow: rect.right > innerWidth + 2 → record (el, class, right, w)
2. clipped text: white-space nowrap && scrollWidth > clientWidth + 2 →
   record class + text + sw/cw (this is the "clip" class of bug)
3. interactive (a, button, [role=button], [tabindex]) with height < 42px →
   record class + text (touch-target finding)
4. interactive with NO accessible name (aria-label/title/labelledby absent AND
   no visible text child) → record (a11y gap)
Then, FOR EACH HIT, decide from these KNOWN-FALSE-POSITIVE rules and dismiss
(in report, do not list as real):
   - .sr-only / [class*="sr-only"] anywhere (screen-reader-only text)
   - ellipsis on .search-result-name, .selected-relationship-label,
     .focus-stage-neighbor-name (app intentionally ellipsizes result rows)
   - elements inside .focus-pocket-a11y or off-canvas legends
   - leaflet tiles hanging past viewport right edge (base layer, clipped by map)
   - disabled buttons (aria-disabled=true or :disabled) — expected
Do not BELIEVE a hit without looking at its computed style + its ancestor chain
(part of the evidence). Every real finding must include:
  path/selector, computed style excerpt, closest ancestor with overflow:hidden,
  whether it's visible on-screen at 1440x900 (not off-canvas).

## Deliverable (MANDATORY, write to disk)
- tmp/audit-inside-REPORT-<your initials or model short>.md containing:
  1. scorecard for the 5 rubric rows
  2. evidence file path(s)
  3. the final verdict list
  4. for each genuine finding: reproduction recipe + recommended fix file/area
The last line of the report must be:
   `INSIDE AUDIT DONE — verdict: <VERDICT>`
(Exactly that sentinel. Anything else means you did not finish.)

## Non-negotiables
- READ-ONLY on the codebase. No edits to src/, css/, api/, tests/, scripts/.
  Only creates files under tmp/ is allowed.
- Do not run npm install / npm run build / restart servers. A broken/absent
  server → stop and report.
- Do not kill processes. If a port is busy, use another.
- Work bounded: total budget ~25 min, then stop and write the report with
  what you have verified.