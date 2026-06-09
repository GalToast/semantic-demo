---
name: BUILD_ENTRY_RESTORE_AND_RACE_VERIFY
description: Restore a broken build caused by a missing hardcoded entry file, then reapply and verify a targeted state-machine or timeout regression fix in the same task lane.
source: auto-skill
extracted_at: 2026-06-08T15:36:52.074Z
---

# Build Entry Restore and Race Verify

Use this when a recent commit has broken the build by deleting a hardcoded entry file, and the same task also includes a targeted fix for a timeout, race, or transition-state regression that needs evidence after rebuild.

## When to Use

- Build fails because an entry file referenced by build tooling is missing in HEAD.
- A focused fix for a timeout/race/transition issue exists but was reverted or is no longer applied because the broken build blocked review.
- Verification should cover restore, rebuild, tests, and the original timeout regression surface in one lane.

## When NOT to Use

- The entry file still exists; the issue is an import or packaging config instead of a missing entry.
- Only a code-review pass is needed and the build is working.

## Procedure

### 1. Identify the build contract

Read the build script to identify the hardcoded entry and expected file path. Confirm the path is missing in the working tree.

### 2. Find the restore source

Use git history to find the last known-good commit that still contains the missing file. Compare that commit with the cleanup/broken commit to determine whether the deletion was intentional or accidental cleanup.

### 3. Restore surgically

Restore only the missing build entry from the source commit, without reverting unrelated migration or bugfix commits. Prefer one or two minimal changes that recover the build entrypoint boundary.

### 4. Reapply the targeted regression fix

Reapply the narrow fix for the original timeout issue. Keep it minimal and state the intended behavioral contract for what changes when the transition sequence occurs.

### 5. Validate in sequence

Run the build, test suite, and the specific timeout or visual-state check that originally drove the regression. Stop and inspect output before continuing.

## Verification

- Build: rebuild succeeds.
- Tests: project tests pass where they previously passed.
- Regression: the original timeout/transition behavior now matches the intended contract or moves meaningfully toward it.
- Scope: no files outside the restore or fix were modified.

## Anti-patterns

- Reverting an unrelated migration commit to recover the build when a single-file restore suffices.
- Applying extra migration cleanup while restoring the build entry.
- Trusting “missing file” claims without confirming the build script actually hardcodes that path.

## Adjacent Skills

- `BUGSWEEP_CLAIM_FALSIFICATION_CHECK` — use when claims about deletions or regressions may be overstated before restoring.
- `STRUCTURED_BUG_SURGERY` — use this for the regression fix once the build restore unblocks verification.
- `PROJECT_COMPLETION_100_VERIFY` — use this for status/roadmap context, not for the restore itself.
