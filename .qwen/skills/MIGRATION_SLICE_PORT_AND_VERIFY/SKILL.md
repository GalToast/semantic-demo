---
name: MIGRATION_SLICE_PORT_AND_VERIFY
description: End-to-end procedure for porting a JS→TS migration slice: verify slice intact, port files preserving exports/state guards/timers, then confirm with typecheck, drift contract, and targeted unit tests while reporting only cross-seam findings.
source: auto-skill
extracted_at: 2026-06-08T17:42:42.000Z
---

# Migration Slice Port and Verify

Use when a migration batch assigns a concrete list of legacy JS files to TS counterparts, with explicit approval to port files that are otherwise off-limits write surfaces.

## Trigger

- A prompt specifies an exact JS→TS file mapping (9 files, named paths).
- The slice includes off-limits legacy files that require explicit lead-approval notation.
- Verification must include `npm run typecheck`, `tests/ts-js-drift-contract.mjs`, and unit tests for affected modules.

## Procedure

### Step 1: Slice verification (before editing)

1. Confirm every listed JS file exists in `git ls-files` and `wc -l` shows >30 lines.
2. Confirm no pre-existing TS shadow exists for any target path.
3. Confirm reference files exist: stores, types, utils, and any sibling already-ported TS file used as style reference.
4. For bug-fix carryovers (e.g., `focus-pocket.js:202`), read the exact lines and preserve the fix in the TS port.

### Step 2: Port each file

For each file:
1. Read the full JS source and every export/jsdóc comment.
2. Read a sibling TS port for local conventions.
3. Create/overwrite the TS file.
4. Preserve every named export; the drift contract compares export surfaces.
5. Wrap mutations of `state.navState`, `state.strandContinuityState`, and other tracked keys in `withStateMutation()`.
6. Replace `Math.random()` in geometry/animation code with `seededUnit()`.
7. For timers, prefer purpose-keyed Map tracking (`StrandContinuityManager.setTimer` or store-backed timers) instead of raw `setTimeout` arrays.
8. For demo/choreography files, replace retry-loop sessionStorage patterns with synchronous `get(demoPhase)` store reads where possible, while preserving behavior required by the legacy choreography module.

### Step 3: Verify

Run these checks in order and record pass/fail:

1. **Typecheck**: `npm run typecheck`
2. **Drift contract**: `node tests/ts-js-drift-contract.mjs --strict`
   - Report whether drift is pre-existing (usually from legacy `js/modules/*.ts` shadows) versus new drift introduced by this slice.
3. **Unit tests**: `npx vitest run` for test files targeting the ported modules.
4. **Diff scope**: `git diff --stat` should show only the intended paths.

### Step 4: Report

Return:
- Slice verification summary (present/missing/pre-existing stubs).
- Per-file line counts.
- Bug fixes carried forward or newly applied.
- Verification results (typecheck/drift/tests/diff).
- Cross-seam findings only (files outside the slice that this port depends on or may need follow-up).
- Do not fix cross-seam issues in this pass; surface them for the owning worker.

## Anti-patterns

- Re-running only `typecheck` without drift contract or unit tests.
- Treating pre-existing drift contract noise as a regression caused by the port.
- Touching off-limits files beyond the approved slice—report them instead.
- Regenerating cache busters, build artifacts, or running visual/Playwright QA during a port task.

## Output contract

For each file, list:
- Path
- Line count
- Key exports preserved
- Notable fixes applied (if any)
- Whether the file overwrote an empty stub or created a new file

For verification, list:
- `npm run typecheck`: PASS/FAIL with error count
- `ts-js-drift-contract.mjs --strict`: baseline/new drift detail
- Unit tests: per-file pass/fail
- `git diff --stat`: focused on the ported paths
