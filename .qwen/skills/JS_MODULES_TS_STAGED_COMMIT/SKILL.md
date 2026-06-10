---
name: JS_MODULES_TS_STAGED_COMMIT
description: Staged commit procedure for porting 150-200 untracked .ts shadow files in js/modules/ root + subdirs, with verification loop and memory updates for model trial results.
source: auto-skill
extracted_at: '2026-06-09T07:24:38.736Z'
---

# JS Modules TS Staged Commit

Use when a repo has 150+ untracked .ts shadow files in `js/modules/` that need to be committed in reviewable increments rather than one bulk commit.

## Trigger

- User says "don't commit the tree all at once"
- Project has 100+ untracked .ts files in a single directory
- Prior session left a large uncommitted TS migration set

## Classification scheme

Classify every untracked `js/modules/*.ts` file by exactly two binary properties:

| Property | Check | Values |
|---|---|---|
| NOCHECK escape hatch | First line starts with `// @ts-nocheck` | TRUE / FALSE |
| Broken import path | File body contains one of the 3 systemic broken patterns | TRUE / FALSE |

Resulting categories:
- **CLEAN** — no @ts-nocheck, no broken imports → commit first, lowest risk
- **NOCHECK** — has @ts-nocheck, no broken imports → commit second, safe escape hatches
- **BROKEN** — no @ts-nocheck, has broken imports → defer until shims exist
- **BOTH** — has @ts-nocheck AND has broken imports → defer until shims exist

### The 3 systemic broken-import paths (must check literally)

```text
../state.js
../state/selectors/index.js
../../types/state.js
```

These are the ONLY broken-import patterns that matter for this repo. All 90+ broken files collapse to these 3 paths. Fix is 2 barrel shims PLUS type-only import normalization for the types path:
- `js/state.ts` — re-exports from `js/state.js` (complex: has Proxy, window side effects)
- `js/state/selectors/index.ts` — re-exports from `js/state/selectors/index.js` (simple barrel)
- Third path pattern: any broken import of `../../types/state.js` should be normalized to `../../types/state` when the import is `import type` only; non-type imports require a different runtime shim and should be treated as a separate hazard class instead of blindly dropping `.js`.

### Location split

- **Root slice**: `js/modules/<name>.ts` (3 path segments from repo root)
- **Subdir slice**: `js/modules/<subdir>/<name>.ts` (4+ path segments, where subdir is bindings/, utils/, view-models/, components/)

## Staged commit plan

Commit in this order, each as a separate conventional commit:

1. **Stage 1: CLEAN root** — all root .ts files with no @ts-nocheck and no broken imports
2. **Stage 2: NOCHECK-only root** — root files with @ts-nocheck but no broken imports
3. **Stage 3: BROKEN root** — requires creating the 2 barrel shims first, then committing
4. **Stage 4: BOTH root** — @ts-nocheck + broken imports; commit after shims exist
5. **Stage 5: Subdirs** — bindings/, utils/, view-models/ (independent, can commit in any order after root)
6. **Stage 3c/4/5b: Third path cleanup** — after root BROKEN/BOTH are unblocked, fix `../../types/state.js` imports using type-only vs value-import aware patches, then commit the affected files (root then subdir slices)

## Verification loop (per stage)

For each stage, run this procedure before committing:

### A. Inventory (main lane or subagent)

1. List untracked .ts files: `git ls-files --others --exclude-standard "js/modules/*.ts"`
2. Classify into CLEAN / NOCHECK / BROKEN / BOTH using the two binary checks above
3. For CLEAN/NOCHECK files: run an IMPORTER CHECK — confirm each file has ≥1 importer across `js/`, `src/`, `*.html`, `*.svelte`
4. For BROKEN/BOTH files: confirm the broken-import symptom (don't fix yet)

### B. Subagent cross-check (optional but recommended for ≥20 files)

When using subagents for classification:
- Launch 2 parallel workers on the same task with DIFFERENT models (model trial)
- Compare results; discrepancies indicate a worker bug, not a data issue
- **Worker bug patterns to watch**:
  - Svelte importer search limited to `src/` only — also search `js/modules/components/*.svelte`
  - Pattern quoting failures on Windows paths
  - Timeout on 150+ file tasks with <5 min budget; prefer 8-10 min for bulk inventory
  - `read_file` vs `run_shell_command` choice: shell tools are more reliable for bulk grep

### C. Main lane verification (M3 pattern)

Always independently verify subagent results against source before committing:
1. Re-run the classification with a simple main-lane script
2. Spot-check the worker's flagged outliers (especially "orphan" claims)
3. Read the actual file content for any file the worker flagged as suspicious
4. If discrepancy found: trust the main lane, update the classification, proceed

### tsconfig.typecheck.json exclude trap (KNOWN BUG)

`tsconfig.typecheck.json` extends `tsconfig.json`. The base config has `"exclude": ["node_modules", "dist", "js", "tests", "css"]`.

Even when `tsconfig.typecheck.json` sets `"include": ["js/modules/**/*.ts", ...]`, the inherited `exclude: ["js", ...]` silently filters out every `js/modules/*.ts` file.

**This means a "0 errors" run of `npx tsc -p tsconfig.typecheck.json --noEmit` is meaningless for js/modules files; tsc is checking 0 js/modules files.**

To get real verification:
1. Run `tsc --explainFiles --noEmit -p tsconfig.typecheck.json` and look for `Matched by include pattern 'js/modules/**/*.ts'` for the files in question. If you don't see it, the exclude is filtering them out.
2. Use an override config that drops the `js` exclude: `exclude: ["node_modules", "dist", "tests", "css"]`. Put this override at the repo root so relative paths in the child config resolve correctly.

### Third-path import verification (required before mass edits)

Before mass-editing `../../types/state.js` files, verify **import kind** because the safe patch differs:
1. List candidate files by literal search for `types/state.js`
2. For each candidate, determine if it contains `import type { ... } from '../../types/state.js'` vs `import { ... } from '../../types/state.js'`
3. If ANY non-type/runtime import exists, do not apply blind drop-`.js` patch; instead create a runtime shim under `types/state.ts` or refactor with lead approval
4. If all imports are `type` imports, the patch is reproduction-safe: drop `.js` from the import specifier
5. **Session drift note:** In later sessions, the remaining unresolved files may instead use `types/state.ts`. Treat this as the same hazard class (extension-variant broken-import for a type-only path). The safe patch remains: confirm `import type`, then drop the `.ts` extension to resolve to `types/state.d.ts`.
6. In-flight or in-progress file variants must be skipped even when they match the pattern.
7. Record the outcome (`import type` vs mixed/non-type) and file count in the stage output before editing.

### D. Pre-commit staging

1. `git add` ONLY the files in the current stage's list
2. Run `git diff --cached --name-only` and count; must match expected count exactly
3. Run `git diff --cached --stat` to confirm no surprise deletions/modifications
4. Verify the user's in-progress dirty work is still untouched (compare `git status` dirty count)
5. If clean: commit with a conventional commit message documenting the stage, file count, line count, and verification method

## Memory updates

After each model trial, update memory with the result:

- Successful trials: record the model ref, routing path, task shape it worked on, and time
- Failed trials: record the failure mode (API error 400, timeout after X min, bytes produced)
- Special cases:
  - Nemotron Ultra on Kilo (`kilo/nvidia/nemotron-3-ultra-550b-a55b:free`) works despite earlier memory saying it was rejected
  - Nex N2 Pro on Kilo works but needs longer timeout (>5 min) for 150+ file tasks
  - Step 3.7 Flash on Kilo has a harness-side parameter conflict (`reasoning_effort` vs `reasoning.effort`) — don't use until harness is fixed

## Anti-patterns

- Don't bulk-commit all 150+ files in one commit; the user explicitly rejected this
- Don't trust a single worker's count; always cross-verify with main lane
- Don't skip the importer check — "orphan" findings from sweep reports are frequently wrong
- Don't add files outside the current stage's list — `git add` surgical paths only
- Don't assume a failed model is broken forever — re-test after memory updates
- Don't delete .js shadow files when committing .ts shadows — those are tracked changes that should be a separate commit (or deferred to later)

## Output contract

For each committed stage, report:
- Stage number and category
- File count and line count (+X / -Y)
- Commit hash and branch
- Verification method (which workers, which main-lane checks)
- Any discrepancies found between workers and how they were resolved
- Remaining untracked count after the commit
- User's in-progress dirty count (unchanged)
