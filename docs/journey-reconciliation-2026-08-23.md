# Journey-suite reconciliation — verdict + remaining worklist

Date: 2026-08-23 · Gate: `scripts/qa-journey-headless.mjs` (now D3D11 by default)

## What was broken

The journey suite reported ~43 structurally-failing tests, and the failure
signature was almost entirely **60s splash-wait timeouts** — the app never
reached its entry CTA. Three independent root causes, all pre-existing, all
masked by the timeout noise:

1. **Stale CTA label** (`181e0fe7`, 2026-08-18 — the same day as the last
   prod deploy). Placeholder2D's CTA was renamed `"Open full 3D experience"`
   → `"Open in 3D"` (`data-testid="placeholder-cta"`), but **12 test files**
   still waited on the old label. Every automated-desktop journey since then
   was looking for a button that no longer existed.
2. **Boot-shortcut clobbering** (W51). `__PLAYWRIGHT__` auto-fired
   `signalReady()` at boot, which forced `renderKind='webgl'` and skipped the
   real splash/placeholder flow — masking the fact that automated desktop
   sessions are _designed_ to boot into `placeholder2d`
   (`responsive-renderer.ts:133-146`), whose CTA is the entry point.
3. **Test-globals gated too narrowly**. `app-init.ts` installed
   `window.__navActions__` behind `isPlaywrightEnvironment()` (explicit flag),
   so specs relying on `navigator.webdriver` alone never exposed the
   globals — 13 of the failures were `__navActions__.focusOnNode is not
exposed`.

## What changed

| Change                                       | Where                                                                                                               | Effect                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Update stale CTA locator (12 files)          | `tests/*.spec.js`, `tests/unit-active/*.test.ts`                                                                    | CTA found again                                                                            |
| Gate boot-shortcut behind `?contract-boot=1` | `src/App.svelte`, `src/lib/orchestration/wait-for-gesture.ts` (shared `isContractBootTest()` in `app-lifecycle.ts`) | Journeys run the real splash→CTA flow; the 10 contract consumers keep instant-mount chrome |
| Broaden test-globals gate                    | `src/lib/orchestration/app-init.ts` `isPlaywrightEnvironment()` → `isAutomatedBrowserSession()`                     | `__navActions__` exposed for any WebDriver session                                         |
| Default gate to D3D11                        | `scripts/qa-journey-headless.mjs`                                                                                   | Software-WebGL garbage (51 min) no longer the default                                      |

## Result

|                   | Before                      | After                                                                                            |
| ----------------- | --------------------------- | ------------------------------------------------------------------------------------------------ |
| Failures          | ~43–45                      | **7** of 83 (arc: F-search-8, B-S7, W55, W51-h1, T1-4, W63 fixed; latest HEAD run 75P/7F/7.5min) |
| Passes            | ~37–50                      | **71**                                                                                           |
| Runtime           | ~50 min (software)          | **15.8 min** (D3D11)                                                                             |
| Failure signature | 60s splash timeouts (noise) | fast assertion/layout timeouts (signal)                                                          |

Contract gate: **51/51** before and after.

## Remaining 11 — triaged worklist

Each is now a _real_ test-vs-product mismatch, not infra noise. Sorted by
confidence of root cause:

1. ~~**F-search-8**~~ — FIXED (`049bf6f5`). The live API path returned raw
   PHP lexical scores (51.3 for "coffee") straight into `data-result-score`.
   `semantic-search-mapper.ts` now normalizes to `Math.min(1, score/100)`
   (PHP scorer is percentage-like: name exact = 28). Test passes in 7.4s.
2. ~~**B-S7**~~ — FIXED (`22bc9ca1`). The idle (placeholder2d) surface
   was missing the vertical-rail `top` values non-idle surfaces get, so
   toggles fell back to top:10px and overlapped the chip rail. Added the
   mirror rail in `mobile_premium__layout.css` (share 60px, legend 112px,
   keyboard-help 164px, app-help 216px). Passes in 3.3s.
   (`chips {left:8, right:...}`). Real layout regression on the placeholder2d
   path.
3. **desktop focus-search hides legacy dive sibling** — the legacy
   `#btn-focus-dive` (compass) shows inside focus-search when it must be
   hidden. Possible collateral from the slice-B/C/D landings.
4. **W51-mobile-h1** — placeholder2d path renders two H1s (help-dialog +
   placeholder). Likely the help-dialog auto-open interacting with the
   placeholder title.
5. ~~**W55 help-dialog**~~ — FIXED. The test was _designed_ around the old
   boot-shortcut auto-fire (its comment says clicking the CTA would race
   the auto-open $effect). Added `&contract-boot=1` to its URL to restore
   the behavior it depends on; passes in 29.8s.
6. **T1-4** — mode chip clicks don't sync nav state (`setJourneyPhase` +
   `currentView`). Real nav-state drift.
7. **C1** — semantic dive doesn't win over trail in compass phase
   (`insideActive-before-inTrailMode`). 8s waitForFunction.
8. **mobile focus: list toggle lifts above the dive strip** — 30s timeout;
   z-index/stacking on the mobile focus pocket.
9. **W63** — Show-more control escapes the fixed mobile search sheet (1.1m).
10. **W64** — active query doesn't resynchronize the sheet at the compact
    breakpoint.
11. **5o** — demo replay doesn't restart from phase 1 (M15 invariant). 2m
    timeout; the demo choreography replay path.

Items 1–3 are the highest-ROI fixes (pure logic / layout). 4–5 share a
likely common cause (help-dialog × placeholder). 6–10 are mobile-sheet
stacking. 11 is the demo replayer.

## Session-2 triage (2026-08-23 late)

Fixed after fresh-context triage on a clean-HEAD build:

- **W51-mobile-h1** (`387530b6`): test waited for placeholder2d boot, but S5
  auto-enter boots webgl on capable devices. Pinned `?placeholder=1`.
- **T1-4 + W63** (`387530b6` + `c260abec`): the `.mode-grid`→`#mode-chips`
  rename (19c030c9, Aug-18) re-armed dormant hide rules at **five sites**
  (mobile_premium__state surface-search, strands ×2 search, strands idle,
  mobile_premium__layout idle) — contradicting the A2-4 audit closure
  ("nav rail always rendered"). Chips were unclickable on search/idle.
  Removed #mode-chips from all five groups; immersive surfaces
  (focus-search / semantic-dive / map-composites) intentionally keep their
  hides. Resurrection-guard lesson recorded: when a selector rename lands,
  sweep ALL grouped hide-rules, not just the first match.

Session-3 (same day): **boot-blocker found + reverted.** Lane commit
60c2428d (advancedChunks regroup) deadlocked rolldown-runtime silently -
all assets 200, zero errors, main.ts never ran (see failure memory:
'rolldown advancedChunks silent boot hang'). Reverted in `33169fb6` after
A/B proof; lane's budget re-stamp against the non-booting dist was undone
with it (`4ad8a825` re-aligned). Lesson: size/budget gates pass on a dist
that never boots - add a boot smoke to the gate chain.

Two more fixed after healthy-boot triage (`bcd08f5c`): list-toggle
(deep-link self-entry skips any CTA stage) and dive-sibling (?q= lands on
search surface; select the result before asserting focus-search chrome).

Final HEAD run (78P/4F/8.2min): W53-#6 FocusCard dismiss PASSED (confirmed
flaky). NEW failure to investigate FIRST next session:
**W54-4486** 'placeholder2d Search chip reveals #info-panel' (2min cap) -
newly failing AFTER the idle/search chip-unhide sweep (387530b6+c260abec);
possible self-inflicted collateral. Then: C1 compass-phase emission (real drift - Inside radio path
does not flip #journey-compass[data-phase] to 'inside'; dedicated dive-choreography dig), W64 sheet-resync, B-A1 count overshoot,
W53-#6 FocusCard dismiss (flaky candidate), 5o demo replay.

Session-4 (same day, lock `fix-demo-replay-m15-plus-cosmetic-overlaps`): **5o FIXED** —
two stacked root causes. (1) Boot: `682b3e82` gated engineReady auto-fire behind
`?contract-boot=1`, so 5o's passive `?demo=force` load sat on the splash forever;
spec now boots via `&contract-boot=1` (that test hunk landed inside `bcd08f5c`'s
sweep). (2) Replay: the qa-journey-headless low-contention profile emulates
`prefers-reduced-motion:reduce` suite-wide; `requestReplay()` silently refused
AND the component acked anyway, so even keyboard-help's 500ms fallback toast
never fired (silent dead button for reduced-motion users). Fix:
`requestReplay(): boolean` — ack dispatches only on accept (DemoChoreography.svelte

- keyboard-help.ts comment); W7 F2 contract windows updated to pin the stronger
  conditional-ack invariant. Verified post-revert master: wrapper profile PASS
  19.5s, plain PASS. Remaining: W54-4486 (investigate first), C1, W64, B-A1.

Cosmetic-probe verdicts (`tmp/probe-overlap.mjs`, DOM rects): the 'County terrain'
header overlap reproduces ONLY under isPlaywright — App.svelte force-mounts MapView
via `|| isPlaywright`, so automated probes see a ghost map identity overlapping the
app header (220x54px measured in focus-search); real users never mount it there.
Suppressed via CSS inverse of Fix #1 (`body:not([data-active-view='map'])
.map-view-header{display:none}`), which leaves `?view=map` chrome untouched.
'Legend pill clips focus card': NOT reproduced desktop or mobile in deep-link
flows (legend stays auto-hidden); likely healed by session-2 rail-top fixes —
reopen only with an exact repro URL.

Session-5 (same day, lock `fix-W54-4486-chip-info-panel-plus-C1-compass-phase`):
triage of the remaining board on healthy-boot master, isolated D3D11 runs:

- **W54-4486 — PHANTOM, healed.** Passes 3× isolated + full W54 block 2/2. It was
  filed during the `60c2428d` non-booting window (see session-3 revert); nothing to fix.
- **C1 — FIXED (test driver rot, product chain healthy).** The old Inside RADIO
  locators match zero DOM (affordance is ModeChipRail chips), and the old evaluate()
  fallback wrote plain fields into `window.__APP_STATE__`, which is NOT the live
  $state proxy — both doors were dead, so the dive never armed and the 8s
  `data-phase='inside'` wait timed out. Rewritten to boot galaxy-focus (`?record=519`
  without view=map — chips are intentionally hidden on map composites per A2-4) and
  drive the real door ladder: chip → `[data-journey-action="enter-inside"]` → Ctrl+5.
  All three route through ENTER_INSIDE, which arms trailDepth=2 + semanticDiveMode via
  the canonical funnel. PASS 9.5s.
- **W53 #6 — confirmed flake.** PASS isolated (16.7s); matches session-3 suspicion.
- **Still REAL: W64 sheet-resync and B-A1 count overshoot** — both fail isolated;
  next digs.

- **W64 — REAL PRODUCT BUG, FIXED.** `setupMobileSearchSheetToggle` early-returned when
  the search chrome wasn't mounted yet (exactly the state at initAdapters() boot and at
  first successful search() on placeholder boots) — BEFORE `bindCompactViewportChange`,
  and nothing ever retried, so `(max-width: 768px)` never got a listener (proven via
  MediaQueryList.prototype.addEventListener instrumentation: zero binds) and orientation
  changes left `mobileSearchSheet` unset forever. Fix: bind-first (handler re-queries
  container per fire), label wiring retried bounded via rAF. Verified: journey test PASS
  12.7s; MQ listener registered; label click now toggles expanded/peek.
- **B-A1 — ENVIRONMENT PHANTOM, healed.** Needs `VITE_API_BASE_URL=http://127.0.0.1:8795`
  baked into the served build (the canonical playwright-web-server does this; bare static
  servers don't, so same-origin /api.php 404s under ?staticDev=0) AND plain data twins
  (`scripts/decompress-data-twins.mjs`) for the threads artifacts. PASS 11.4s with both.
- **W53 #6 sub-pixel flake root-caused**: dismiss box measures 43.99998…px against a bare
  `>= 44`; assertion now compares Math.round. 

Original session-2 notes:
Remaining 7 (fresh error-contexts under `test-results/` from the
TEST_BASE_URL=worktree-server run): dive-sibling pair, W64 sheet-resync,
B-A1 count overshoot, W53-#6 FocusCard dismiss (first appearance —
flakiness candidate), 5o demo replay, mobile-focus list-toggle, C1.

Isolated-run recipe (main repo contested by parallel lanes):

```bash
git worktree add ../se-journey-head HEAD && cd ../se-journey-head   && npm install && npm run build:svelte
node tmp/journey-head-server.mjs &   # serves worktree on :8797
TEST_BASE_URL=http://127.0.0.1:8797 SEMANTIC_USE_D3D11=1   npx playwright test tests/widget-journey.spec.js --workers=1
```

## Known phantom signature: non-booting dist

If journey failures show `locator.click: element is not visible` on
`.mode-chip` (or anything waiting on chrome that never appears), FIRST
verify the served dist actually boots: load any page and check that
`#app` has children beyond the static `#app-loading-placeholder`. A dirty
parallel-lane working tree can produce a build where the app never mounts
(verified 2026-08-23: lane WIP stuck boot at the placeholder on ALL
viewports while clean HEAD mounted fine). Re-running the suite against a
non-booting dist produces garbage failures — including re-failing tests
that pass on a good build (W63/W64 did exactly that).

## How to run

```bash
# Full suite, D3D11 (default now):
node scripts/qa-journey-headless.mjs

# Software WebGL, explicit opt-in:
SEMANTIC_USE_D3D11=0 SEMANTIC_FORCE_WEBGL_SOFTWARE=1 node scripts/qa-journey-headless.mjs

# Single spec:
SEMANTIC_USE_D3D11=1 npx playwright test tests/widget-journey.spec.js --browser=chromium --workers=1 -g "<test name>"
```
