---
name: TS/JS Runtime Deletion Shipping Gate
description: Detects the post-JS-to-TS-migration state where builds can appear green while release gates fail because deleted legacy source is still referenced by Node-native tests or contract scripts.
source: auto-skill
extracted_at: '2026-06-09T13:46:20.000Z'
---

# TS/JS Runtime Deletion Shipping Gate

Use after a large-scale JS-to-TS runtime replacement when deciding whether the project is actually ready to deploy.

## Problem

After deleting `js/modules/**/*.js` and replacing them with `js/modules/**/*.ts`:

- `npm run build:safe` and `npm run build:svelte` can pass
- `npm run ts-readiness` can report 100% TS coverage
- `npm run test:unit` can be mostly green
- `npm run test:contract` can fail because test files still read deleted `.js` files
- `npm run test` can fail because cache buster hashes were generated from the old build

This is a post-migration false-positive pattern distinct from cache-buster drift.

## Detection signals

- Large count of deleted tracked files in `git status` (e.g., 150+ `js/modules/*.js`)
- Large count of untracked new files (e.g., 113+ `js/modules/*.ts`)
- Tracked count of new files is much smaller than untracked count
- `npm run build` passes but `npm run test:fast` fails in `check:cache` or Node-native test path reads
- Contract tests fail with `ENOENT: no such file or directory, open '...js/modules/...js'`
- Unit test timeouts in legacy/surface tests that assumed legacy source still existed

## Verification procedure

1. Count deleted tracked source files: `git status --short | findstr "^ D" | find /c /v ""`
2. Count untracked replacement files: `git status --short js/modules/*.ts | findstr "^??" | find /c /v ""`
3. Count tracked replacements: `git ls-files "js/modules/*.ts" | find /c /v ""`
4. Confirm by running: `git ls-files "js/modules/*.js" | find /c /v ""` — if 0, the runtime is fully absent from git
5. Run `npm run test:fast` and `npm run test:contract`
6. Inspect failure output for patterns:
   - `ENOENT` errors against deleted `.js` paths
   - Cache buster hash mismatches
   - Bridge test timeouts in files that still reference legacy modules

## Decision rule

Do not allow a migration to be called "production-ready" until:

1. The replacement `.ts` files are committed to git
2. All release contract tests that read source files are updated to match current architecture
3. Cache buster hashes are aligned with the current build output
4. Unit test suite is fully green after one clean rerun

Breakfix: do not restore deleted legacy `.js` files to make tests pass. Instead, update tests and tooling to match the new TS source ownership map.

## Exit criteria

- `npm run test:fast` green
- `npm run test:unit` green after explicit rerun
- `npm run test:contract` green for contracts that read source files (update paths as needed)
- No uncommitted deletion churn blocking recoverability
- `git status --short | findstr "^ D" | find /c /v ""` shows only intentional, documented removals
- `git ls-files "js/modules/*.ts" | find /c /v ""` matches `git status --short js/modules/*.ts | findstr "^??" | find /c /v ""`
