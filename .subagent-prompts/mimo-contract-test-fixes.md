# Mimo Subagent A — Contract Test Stale Fixture Fixes

## Role
You are a **fix-and-verify** subagent. Edit specific lines within your scope. Use source verification before each change. Stay inside your scope.

## Working Directory
`C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer`

## Source of Truth
Read `tmp/nemotron-contract-test-diagnostic.md` for the per-surface breakdown. Each surface has a list of legacy DOM IDs that need replacement with the Svelte component's actual DOM.

## Scope (you MAY touch)
- `tests/surface-contract-check.mjs` ONLY (4360 lines, 21 surfaces)

## OUT OF SCOPE (do NOT touch)
- All source files (no source changes — this is test-side only)
- `package.json` script edits
- Any other test file

## What to SKIP
- Don't run the full test suite mid-flight. Run individual surface contracts after each fix.
- Don't refactor the test runner. Smallest change per surface.
- Don't fix all 7 surfaces if you can demonstrate the pattern works on 1-2 first.

## Task

### Background
The Nemotron diagnostic (`tmp/nemotron-contract-test-diagnostic.md`) confirmed all 7 known-failing contract surfaces fail as **A (stale test fixtures)** — the Svelte migration replaced the legacy JS DOM with new Svelte components, but the contract tests still assert on the old IDs/structure.

### Fix order (per Nemotron priority)
1. **thread-inspector** — 11 failures
2. **search-no-results** — 8 failures
3. **field-node** — 7 failures
4. **compass-rail**
5. **focus-pocket**
6. **info-panel-empty**
7. **mode-grid`

### Method per surface

For each surface, do NOT just delete the legacy assertions. Instead, **update the test to assert on the Svelte component's actual DOM**:

1. **Find the Svelte component** for the surface (e.g., `ThreadInspector.svelte` for thread-inspector)
2. **Read the Svelte component's template** to identify the actual DOM IDs, classes, and structure it produces
3. **Update the test assertions** to match. If the Svelte component has no equivalent DOM for what the test was checking, the test should be **updated to assert on the new Svelte contract** (e.g., "component renders, has the right props, mounts correctly") rather than deleted.
4. **Run the QA command for that surface** to verify the test now passes:
   - `npm run qa:contract:thread-inspector --headed`
5. **Capture before/after** for at least 3 surfaces in the report

### What to do if a surface test fundamentally cannot be salvaged

If a test's intent is no longer meaningful (e.g., the Svelte component has a completely different rendering model), convert the test into a "smoke" check:
```js
// Before: asserts on 11 specific legacy DOM IDs
// After: verifies the Svelte component mounts and key props/state are present
const inspector = document.querySelector('[data-component="thread-inspector"]');
expect(inspector).toBeTruthy();
```

This is acceptable IF the legacy test no longer represents real contract. Document the conversion in the report.

## Time Budget
- 5 min read components for surface 1
- 10 min fix surface 1
- 5 min verify
- 7 surfaces × 20 min = ... too much. Budget realistically: 3 surfaces (thread-inspector, search-no-results, field-node — top 3 by failure count). If time permits, continue to others.
- Total: 60-90 min

## Output
Save to `tmp/mimo-contract-test-fixes-report.md`:

```markdown
# Contract Test Fix Report

## Summary
- Surfaces fixed: N
- Before: 7 FAIL
- After: ? FAIL

## Per-surface diff
### thread-inspector
- Before: 11 failing assertions
- After: 0 failing
- Key changes: <1-2 sentences>

### search-no-results
...

## Tests converted to smoke
<list if any>

## Surfaced NOT fixed (out of time)
<list if any>
```

## Constraints
- **No source edits.** Test-only.
- **Update, don't delete** legacy assertions unless converted to smoke.
- **No false claims.** Verify each fix with the QA command.

## Return
≤120 words: surfaces fixed count, before/after failure counts, biggest pattern observed.
