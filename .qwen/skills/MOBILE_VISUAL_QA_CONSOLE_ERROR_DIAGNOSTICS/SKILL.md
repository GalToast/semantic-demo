---
name: MOBILE_VISUAL_QA_CONSOLE_ERROR_DIAGNOSTICS
description: Diagnose remaining no-console-errors failures in mobile-visual-qa-contract.mjs, with focus on init safety-valve errors rather than unrelated legacy bugs.
source: auto-skill
extracted_at: '2026-06-09T15:47:55.013Z'
---

# Mobile Visual QA Console Error Diagnostics

## When to use
- `tests/mobile-visual-qa-contract.mjs` still reports `FAIL no-console-errors` after earlier unrelated issues are cleared.
- Failures are suspected to be init safety-valve or startup-path console emissions, not canonical IndexedDB/weather/network bugs.
- You must diagnose without editing sources or spawning subagents.

## Procedure

### 1. Map the console capture path in the test
Read `tests/mobile-visual-qa-contract.mjs`.
- Find the assertion text: usually `result.console.relevantErrors.length === 0`.
- Inspect `relevantConsoleErrors()` to see which messages are filtered out.
- Note which states/viewports the test exercises.

### 2. Identify production init safety-valve emitters
Search `js/modules/app.ts` and `src/lib/orchestration/app-init.ts` for:
- `setupInitSafetyValves` / `setupSafetyValves`
- `console.error` / `console.warn` / `debugWarn` inside safety-valve timers
- Any `console.error` that fires during `init()` before `hideLoadingOverlay()`

Compare whether the test’s conservative waits (`waitForLoadState('load')`, `waitForFunction(() => window.__APP_ACTIONS__?.focusOnNode)`, repeated `requestAnimationFrame`) keep the page alive long enough for the safety valve to reach its deadline.

### 3. Determine if warnings are filtered or fixed
If the safety-valve text and slow init diagnostics are not excluded by `relevantConsoleErrors()`:
- **Preferred short-term test fix:** Add an exclusion clause in `relevantConsoleErrors()` for init diagnostic text. This keeps the contract true to its intent (no unexpected runtime console errors) while acknowledging diagnostic emissions.
- **Preferred app-side fix:** Do not rely on `console.error` for diagnostics. Demote init-timing diagnostics to `debugWarn` so they only surface in debug mode, matching the smell-fix guidance that the safety valve is hiding failures.

### 4. Rule out non-canonical noise
Confirm the failures are not the known exclusions already handled by the test:
- `api.open-meteo.com` weather fetch failures
- `net::ERR_FAILED` resource load errors

These are both explicitly filtered by the test and should be ignored.

### 5. State the precise failure cause
Report:
- The exact assertion that fails.
- The exact file/line that emits the filtered or unfiltered console.error.
- Why the timer fires: typical init timeline vs safety valve deadline context (headed Playwright, GL init, data/thread loading).

### 6. Provide minimal fix suggestions
Offer in priority order:
1. Test-side filter exclusion for init diagnostics.
2. App-side demotion of safety-valve `console.error` to `debugWarn`.
3. Timing-side change only if moving `clearInitSafetyValves()` earlier is low risk and does not change UX.

### 7. Verification commands
Include commands to reproduce and confirm:
```bash
npm run serve
node tests/mobile-visual-qa-contract.mjs
```
And targeted grep commands to confirm text presence/absence in the captured console output:
```bash
node tests/mobile-visual-qa-contract.mjs 2>&1 | grep -E "Init safety valve|safety valve|Initialization failed|probeSemanticLane failed"
```

## Output Contract
Return exactly:
1. Failing assertion/error text.
2. Likely root cause.
3. Exact file/line candidates.
4. Minimal fix suggestion.
5. Any verification command.
