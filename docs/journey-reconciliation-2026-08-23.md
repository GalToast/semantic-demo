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
   sessions are *designed* to boot into `placeholder2d`
   (`responsive-renderer.ts:133-146`), whose CTA is the entry point.
3. **Test-globals gated too narrowly**. `app-init.ts` installed
   `window.__navActions__` behind `isPlaywrightEnvironment()` (explicit flag),
   so specs relying on `navigator.webdriver` alone never exposed the
   globals — 13 of the failures were `__navActions__.focusOnNode is not
   exposed`.

## What changed

| Change | Where | Effect |
|---|---|---|
| Update stale CTA locator (12 files) | `tests/*.spec.js`, `tests/unit-active/*.test.ts` | CTA found again |
| Gate boot-shortcut behind `?contract-boot=1` | `src/App.svelte`, `src/lib/orchestration/wait-for-gesture.ts` (shared `isContractBootTest()` in `app-lifecycle.ts`) | Journeys run the real splash→CTA flow; the 10 contract consumers keep instant-mount chrome |
| Broaden test-globals gate | `src/lib/orchestration/app-init.ts` `isPlaywrightEnvironment()` → `isAutomatedBrowserSession()` | `__navActions__` exposed for any WebDriver session |
| Default gate to D3D11 | `scripts/qa-journey-headless.mjs` | Software-WebGL garbage (51 min) no longer the default |

## Result

| | Before | After |
|---|---|---|
| Failures | ~43–45 | **8** (F-search-8 `049bf6f5`, B-S7 `22bc9ca1`) |
| Passes | ~37–50 | **71** |
| Runtime | ~50 min (software) | **15.8 min** (D3D11) |
| Failure signature | 60s splash timeouts (noise) | fast assertion/layout timeouts (signal) |

Contract gate: **51/51** before and after.

## Remaining 11 — triaged worklist

Each is now a *real* test-vs-product mismatch, not infra noise. Sorted by
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
5. **W55 help-dialog** (smoke) — auto-open/Escape/chip-click sequence times
   out at 15s. Probably the same help-vs-splash interaction.
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

## How to run

```bash
# Full suite, D3D11 (default now):
node scripts/qa-journey-headless.mjs

# Software WebGL, explicit opt-in:
SEMANTIC_USE_D3D11=0 SEMANTIC_FORCE_WEBGL_SOFTWARE=1 node scripts/qa-journey-headless.mjs

# Single spec:
SEMANTIC_USE_D3D11=1 npx playwright test tests/widget-journey.spec.js --browser=chromium --workers=1 -g "<test name>"
```
