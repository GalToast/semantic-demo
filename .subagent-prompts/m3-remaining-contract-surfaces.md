# M3 Subagent — Continue Contract Test Fixes (4 Remaining Surfaces)

## Role
You are a **fix-and-verify** subagent. Continue the mimo subagent's work on the 4 remaining contract test surfaces. Use the mimo report as your starting point.

## Working Directory
`C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer`

## Source of Truth
**MUST READ FIRST:**
- `tmp/mimo-contract-test-fixes-report.md` — what the mimo subagent already did + the dual-track architecture finding
- `tmp/nemotron-contract-test-diagnostic.md` — the per-surface legacy DOM ID lists (still valid for the 4 remaining surfaces)
- `tests/surface-contract-check.mjs` — the test file (already edited by the mimo subagent for 3 surfaces)

## Scope (you MAY touch)
- `tests/surface-contract-check.mjs` ONLY (4360 lines, 21 surfaces — 3 already fixed, 4 to do, 14 untouched)

## OUT OF SCOPE (do NOT touch)
- All source files (no source changes — test-only)
- `package.json` script edits
- Any other test file
- Do NOT undo or modify the 3 surfaces the mimo subagent already fixed (thread-inspector, search-no-results, field-node)

## What to SKIP
- Don't re-investigate the dual-track architecture — the mimo report has it.
- Don't run the full test suite mid-flight. Run individual surface contracts after each fix.
- Don't refactor the test runner. Smallest change per surface.

## Task

### Background

The mimo subagent fixed 3 of 7 known-failing contract surfaces (thread-inspector, search-no-results, field-node) using:
1. **Dual-selector queries** — check both legacy and Svelte selectors
2. **Smoke test conversions** — when legacy DOM is genuinely absent
3. **API-conditional assertions** — for `search-no-results` which depends on the live PHP API

**The 4 surfaces NOT yet fixed:**
1. `compass-rail` (Nemotron had no specific failure count)
2. `focus-pocket` (Nemotron had no specific failure count)
3. `info-panel-empty` (Nemotron had no specific failure count)
4. `mode-grid` (Nemotron had no specific failure count)

Per the mimo report's "Dual-track coexistence architecture" finding:
- Production build bundles BOTH legacy JS and compiled Svelte
- Svelte components mount with `visible={false}`
- Legacy DOM is selectively present (some in static HTML, some dynamically created)
- Tests must query both legacy and Svelte selectors, and accept "not present" as valid when components are hidden

### Method per surface (4 surfaces)

For each of the 4 remaining surfaces:

1. **Read the Svelte component** for the surface (e.g., `CompassRail.svelte`, `FocusPocket.svelte`, `InfoPanel.svelte`, `Header.svelte`+`ModeChips.svelte`)
2. **Read the test** in `tests/surface-contract-check.mjs` to see the legacy assertions
3. **Run the contract** to see actual current failures:
   - `npm run qa:contract:compass-rail 2>&1 | head -50`
   - `npm run qa:contract:focus-pocket 2>&1 | head -50`
   - `npm run qa:contract:info-panel-empty 2>&1 | head -50`
   - `npm run qa:contract:mode-grid 2>&1 | head -50`
4. **Update the test assertions** using the same dual-selector + smoke test pattern as the mimo subagent
5. **Re-run** to verify 0 failures
6. **Document** the changes

### For each surface, decide the approach

- **compass-rail**: Likely needs dual-selector queries like `field-node`. Read `CompassRail.svelte` to see the actual Svelte structure.
- **focus-pocket**: Read `FocusPocket.svelte` and check if Svelte mounts with `visible={false}` like the mimo report suggests. The legacy `#focus-pocket` is dynamically created by `ensureFocusStageAuxiliaryDom()` and is absent because of missing parent. Likely needs smoke test conversion.
- **info-panel-empty**: Read `InfoPanel.svelte`. Check both the populated and empty states. The m3 advisor earlier noted the islands are dead code and the canonical is the Svelte `InfoPanel.svelte`.
- **mode-grid**: Read `Header.svelte` + `ModeChips.svelte`. The mimo report noted `.mode-grid`, `.mode-chips`, `.active-mode-chip` are legacy DOM in static HTML; Svelte mode UI uses different structure.

### Use the mimo report's pattern

The mimo report's pattern for thread-inspector was:
- 11 legacy DOM assertions → 6 smoke test assertions
- Svelte app mount verification + default-hidden state + legacy-absent + no overflow

Apply the same pattern where the legacy DOM is genuinely absent.

For field-node, the pattern was:
- 7 legacy DOM assertions → 19 dual-selector queries
- Each assertion checks both legacy AND Svelte selectors

Use whichever pattern fits.

## Time Budget
- 5 min read mimo report + Nemotron diagnostic
- 4 surfaces × 12 min each = 48 min
- 5 min write report
- ~60 min total

If you fall behind, prioritize in this order: compass-rail → mode-grid → info-panel-empty → focus-pocket. Compass-rail is most likely a pure dual-selector update (similar to field-node). Focus-pocket is most likely needs full smoke conversion (similar to thread-inspector).

## Output
Save to `tmp/m3-remaining-contract-surfaces-report.md`:

```markdown
# Remaining Contract Test Fixes Report

## Summary
- Surfaces fixed: N (out of 4)
- Total before (in this scope): N failing
- Total after: N failing, N passing

## Per-surface diff

### compass-rail
- Before: N failing
- After: 0 failing (N pass)
- Key changes: <1-2 sentences>
- Pattern used: dual-selector / smoke test / mixed

### focus-pocket
...

### info-panel-empty
...

### mode-grid
...

## Surfaces NOT fixed (out of time)
<list if any>

## Architecture confirmations / new findings
<list>
```

## Constraints
- **No source edits.** Test-only.
- **No undoing** the 3 surfaces the mimo subagent fixed.
- **Update, don't delete** legacy assertions unless converted to smoke.
- **No false claims.** Verify each fix with the QA command.

## Return
≤120 words: surfaces fixed count, before/after failure counts, biggest pattern observed.
