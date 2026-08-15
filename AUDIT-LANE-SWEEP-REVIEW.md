VERDICT: ISSUES FINDINGS: 7 FILE: AUDIT-LANE-SWEEP-REVIEW.md SELF-VERIFY: FILE-WRITTEN

## SEV1 Issues (Real Problems)

1. **SearchInputChrome.svelte behavior regression** (src/lib/components/search/SearchInputChrome.svelte:209-267)
    - 14-line CSS change increases button sizes from 28px to 44px for .search-back-btn and adds min-width/height
    - No corresponding JS/behavior logic changes, but visual layout shift without explicit justification
    - NEEDS-CONFIRMATION: Is this intentional UX change or accidental drift?

2. **3d-data-edge-cases.spec.js weakened coverage** (tests/3d-data-edge-cases.spec.js:458-520)
    - 41-line change replaces concrete statusText assertion with waitForFunction checking searchStatus state
    - Removes direct DOM text extraction, relies on state introspection
    - May miss visual regressions if state is correct but UI not updated
    - NEEDS-CONFIRMATION: Is state-only check sufficient or should DOM verification remain?

## SEV2 Issues (Potential Problems)

1. **header-mode-nav.test.ts reduced coverage** (tests/unit-active/header-mode-nav.test.ts:240-294)
    - 28-line deletion removes explicit array literals in expect().toEqual() calls
    - Changes from `['SETV:...', 'SETS:...', 'URL']` to inline arrays
    - No functional change, but reduces readability of expected call sequences
    - Style-only change in test file - questionable value

2. **contracts.manifest.json vs run-all-contracts.js inconsistency**
    - contracts.manifest.json uses inline array syntax: `"contracts": ["file1", "file2"]`
    - run-all-contracts.js uses spread syntax: `[PLAYWRIGHT_CLI, 'test', ...files.map(f =>`tests/${f}`), ...PLAYWRIGHT_FLAGS]`
    - No functional issue, but inconsistent style across test infrastructure

## SEV3 Issues (Minor/Nits)

1. **CLI script formatting drift** (scripts/prewarm-catalog.sh, scripts/verify-lane-wave.sh)
    - Mixed tabs/spaces in shell scripts (echo statements)
    - Missing final newlines in prewarm-catalog.sh
    - No functional impact, but violates project formatting standards

2. **window-global-allowlist.md 289-line churn** (docs/window-global-allowlist.md)
    - Massive table formatting changes (alignment, spacing)
    - No content changes - purely cosmetic
    - Questionable value for 289 lines of diff noise

3. **Half-done refactor remnants**
    - Multiple files show partial migration patterns (e.g., demo choreography comments)
    - No active breakage, but suggests incomplete work
    - Should be completed or reverted to avoid confusion

## Summary

- 2 potential behavioral regressions needing confirmation
- 2 test coverage questions
- 3 minor formatting/style issues
- No breaking changes found
- Most changes appear to be cosmetic/formatting with questionable ROI

---

## Main-lane verification (2026-08-14)

- SEV1 SEARCH INPUT: CONFIRMED — diff shows .search-back-btn/.search-clear 28px→44px
  (min-width:44px, padding:0). Undocumented UX/size change; the owning lane should
  confirm intent (likely intentional a11y touch-target, but verify).
- SEV1 3D TEST: CONFIRMED — concrete DOM text assertion replaced by
  window.**APP_STATE** waitForFunction (state-only check). Coverage weakened for
  visual regressions. Owning lane should confirm.
- SEV2/SEV3: cosmetic/style — no blocking issues.
  Verified main-lane against git diff of both files.
