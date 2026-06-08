---
name: DEAD_FILE_CLEANUP_VERIFICATION
description: Verify and bulk-remove dead/shadow files safely before mass deletion, especially after prior waves left staged deletions or partial fixes.
source: auto-skill
extracted_at: '2026-06-08T06:02:52.090Z'
---

# Dead File Cleanup Verification

Use this when you need to bulk-delete files that have been identified as dead (e.g. shadow `.ts`, orphan islands, stale wrappers) but prior waves may have already deleted some or staged partial changes.

## Procedure

1. **Inventory actual tracked targets**
   - Run `git ls-files <glob>` for the suspected dead files (e.g. `git ls-files "js/**/*.ts"`).
   - Record the exact count and list.

2. **Inspect working-tree staging state**
   - Run `git status --short` to see entries staged as `D` (deleted from disk but still tracked).
   - Distinguish between “already deleted on disk” and “still present on disk”.
   - This tells you whether the ~N count from prior reports is still accurate or has decayed.

3. **Verify sibling/existence requirement before deleting**
   - For each *still-present* target, confirm the sibling file exists (e.g. `.js` for a `.ts` shadow).
   - If any target lacks its expected sibling, STOP and report it. Do NOT delete.
   - Cite the exact path and missing sibling in the report.

4. **Inspect uncommitted changes in canonical/kept files**
   - If a target file is a re-export shim whose real content lives elsewhere (e.g. `.js` re-exporting from `.ts`), check `git diff HEAD -- <real-content-file>` first.
   - Preserve any uncommitted fixes in the canonical file before committing the bulk deletion.

5. **Execute the deletion**
   - Use `git rm` for tracked files.
   - If `git rm` fails with “local modifications”, inspect the changes with `git diff -- <file>`.
   - If the file is genuinely dead and the modifications are stale drift, use `git rm -f` or fall back to `git restore --staged <path> && git rm -f <path>`.

6. **Commit with surgical message**
   - Include the actual files deleted in the commit message body or broken summary if >30 files.
   - Mention preserved sibling paths so future readers know why some `.ts` files under the same glob still exist.

## Constraints

- Do NOT delete files outside the verified scope, even if they look related.
- Do NOT delete a file whose sibling is missing.
- Do NOT bulk-delete into a commit that also bundles unrelated logic fixes unless the logic fix is in a separate file and committed separately first.

## Orphan/Dead Claim Verification Extension

A sweep report may label files as "orphan" or "100% dead." That claim is **not ground truth** — it is another hypothesis that needs falsification checks before deletion.

### Step 1: Exhaustive import-style search (don't trust keyword grep)

For each candidate file, search for the **exact filename** across all relevant ingestion patterns:

| Pattern | Example `grep`/`findstr` target |
|---|---|
| Static `import` from sibling | `from './island-mount-helper.js'` |
| Dynamic `import()` preload list | `import('./search-results-svelte-island.js')` |
| Svelte/HTML `<script>` or `import` | across `*.svelte`, `*.html` |
| CSS reference (less common) | `@import` or filename in docs/comments |

### Step 2: Require a build confirmation

Even if every search returns negative, **do not delete** if deleting a file:
1. Was recently created or modified (high confidence it is actively wired).
2. Exports a symbol that is named in the sweep's own "orphan" description but not searched for by filename.

Run `npm run build` before and immediately after a deletion trial. If a deletion changes the build output (harness errors, different bundle size, or renamed asset hashes), restore the file and treat it as **NOT ORPHAN**.

### Step 3: Document why the sweep was wrong

If you remove a deletion target after finding an importer, update the sweep/handoff doc with the exact missed import path and the build error that surfaced. Otherwise the same false-positive will be rediscovered in the next wave.

## Anti-patterns

- Assuming prior report counts (e.g. "145 files") are still accurate. Always re-verify with `git ls-files`.
- Blindly running `git rm` on a glob without checking for import paths, especially relative imports (`./`) and dynamic `import()` arrays.
- Letting a subagent handle deletion if it gets stuck on Windows path escaping — abort and do the verification step yourself.
