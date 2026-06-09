---
name: LEGACY_JS_DELETION_COVERAGE_AUDIT
description: Verify that deleted legacy JS modules were fully superseded by TS replacements before treating the deletion as safe.
source: auto-skill
extracted_at: 2026-06-09T06:28:06.557Z
---

# Legacy JS Deletion Coverage Audit

Use this after a migration wave deletes legacy runtime files and replaces them with TS siblings, especially when tests or build scripts still reference the deleted `.js` files.

## Trigger

- `js/modules/*.js` files have been deleted and `js/modules/*.ts` replacements exist or are staged.
- Tests/build commands fail with missing `.js` module paths.
- There is uncertainty whether hidden behavior/config survived the deletion.

## Procedure

### 1. Inventory deleted runtime files

Use the working tree diff, not assumed counts from older reports:

- deleted: `git diff --name-only --diff-filter=D -- 'js/modules/*.js' 'js/modules/**/*.js'`
- replacements: `git ls-files 'js/modules/**/*.ts'`

Do not trust stale memory counts for deletion coverage.

### 2. Check replacement existence

For each deleted JS file, confirm a TS sibling exists at the same base path. If any deleted module lacks a TS sibling, stop and report the missing replacement before proceeding.

### 3. Compare exported surface

Diff the deleted JS export surface against the TS replacement. At minimum:

- exported functions
- exported constants/classes
- default export presence

A simple export-name comparison is usually enough. If the TS file is missing exported identifiers that existed in the deleted JS file, treat the deletion as **not yet safe** until those symbols are restored or confirmed unnecessary.

### 4. Verify live import state after restoration

If you restore missing exports into TS files:

- rerun `npm run typecheck`
- rerun `npm run build`
- rerun the narrow verification command that surfaced the stale reference (`test:contract:smoke`, targeted unit tests, or affected build path)

### 5. Separate concerns

Do not conflate three separate problems:

- deleted JS file no longer on disk
- test still importing the deleted `.js` path
- TS replacement missing a behavior/export

Fix them in that order. Do not undelete JS files just to make tests pass; migrate the tests/build paths after the replacement coverage is verified.

## Output

When reporting status, include:

- count of deleted JS files reviewed
- count of missing TS replacements, if any
- count of missing exports after restoration check
- exact commands run to verify safety
