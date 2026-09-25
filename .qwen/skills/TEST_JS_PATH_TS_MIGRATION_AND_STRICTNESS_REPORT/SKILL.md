---
name: TEST_JS_PATH_TS_MIGRATION_AND_STRICTNESS_REPORT
description: Focused migration of tests/contracts away from retired js/modules/*.js paths to native TS entries, plus a line-anchored strictness/drift report for the next camera/WebGL seam.
source: auto-skill
extracted_at: '2026-06-08T04:10:00.000Z'
---

# Test JS-to-TS Migration + Strictness/Drift Report

Use when you need to move tests/contracts off retired `js/modules/*.js` imports onto existing `js/modules/*.ts` files, verify the migration with the project’s TS-progress gate, and deliver a follow-up strictness map for the next camera/WebGL seam rather than doing a broad refactor.

It does this: scopes the edit boundary to `tests/**/*.{mjs,js}` and `tests/unit/**/*.js`, surveys all remaining retired JS-path references, chooses the highest-value small cluster, refactors only that cluster to `.ts` imports, runs focused verification, then writes a strictness and drift report for the next seam. It can freeze or reduce the skill boundary if another lane would do the needed work.

## When to use

- You are asked to perform a focused TS-only checkpoint seam on tests/contracts.
- You also need a strictness map and drift finding for the next camera/WebGL files (focus/routes camera, three-interaction-visuals, webglContext surface).
- `npm run check:ts-progress` is green, but some tests still point at retired `.js` sources.
- Scope must stay narrow: test files only, no broad refactor of runtime `js/modules/*.ts` files.

## Prerequisites

- Have read-only access to packages, test contracts, and compiler/type materials.
- Use Node 24+ syntax (native TS ESM) with `.mjs` harnesses; test harnesses may still rely on runtime `.js` state proxies.
- Do not alter runtime files outside the assigned test/contract boundary unless contract scripts must read source paths.
- Do not claim “orphan/dead” status for complex files without exhausting all import paths (read_file before grep_search).

## Boundary

- Writes: `tests/**/*.{mjs,js}`, `tests/unit/**/*.js`, `tmp/`.
- Read-only scope for strictness report: specified camera/WebGL files, plus type declarations if needed.
- Out-of-scope writes: runtime `js/modules/**/*.js` and `src/**`, CSS, deploy scripts, secrets.

## State-lock paradigmmove to tests-first root-cause audit; do not delete off-limits state writer files

When a developer or subagent says “all tests pass” but you detect orphaned imports or JS-path references in tests, the first move is a tests-first reference audit (`grep` plus targeted reads). The lock paradigmmove is:
1. Do not revert, rename, or delete runtime files outside the assigned ownership boundary.
2. Record the orphan/dead finding carefully.
3. Present evidence (import paths, file paths, targeted regressions) to the main lane before cleanup or any migration step.

## Evidence-driven test migration contract

For every migrated test/contract:
1. Prefer creating a single `tests/source-path.mjs` resolver helper over per-file path rewrites. The helper should map `js/modules/foo.js` → `js/modules/foo.ts` when the `.js` is absent, and pass the path through unchanged when it still exists. This centralizes the transition logic and avoids scattering fallback logic across many files.
2. Update source-only contracts to import `resolveSource` from `./source-path.mjs` and replace `readFileSync(path.join(root, 'js/modules/foo.js'), 'utf8')` with `readFileSync(resolveSource('js/modules/foo.js', root), 'utf8')`.
3. For contracts that use `import()` of JS files, remove the dynamic import since TS files cannot be imported by Node without a transpiler.
4. If a runtime state proxy or a TS syntax difference (type annotations, return types, variable prefixes like `_s.` vs `state.`) breaks regex assertions, update the regex/checks to match TS syntax rather than reverting to JS.
5. If a runtime state proxy or a transitive JS dependency still blocks loading, record why it is blocked and halt that partition of the migration (this is the freeze condition: do not expand ownership to solve a root cause outside the test boundary).
6. Run the changed tests with `node` and `npm run check:ts-progress` to confirm the migration did not reintroduce drift.
7. If any verification turns up unexpected errors in an untouched test, report it as adjacent seam risk rather than chasing it.

## Strictness map output contract

Write a single `report.md` under `tmp/<run-id>-strictness/report.md` that contains:

- `Summary` — what changed, how many references were migrated, and whether any JS tests would pass.
- `Files changed` — a diff summary showing real edits (rename to `.ts` imports, path normalization).
- `Verification results` — commands run and their exit output.
- `Risks or unresolved issues` — concrete blockers by file and line (e.g., `js/state.js` L1 still imports retired `design-tokens.js`).
- `Finds outside scope` — any adjacent seam that was identified but not touched.
- `report path` — absolute or repo-relative path to the written report.

For segment-using models with extended output, add:
- `Config / command evidence` — copy of any CLI commands, audit scripts, references to `FRAG_USE_INLINE_STREAM_SOLE_OUTPUT_USE` constraints, and mirroring the config template style (`tsconfig.projectSettings.types`, `capture.test`, `command.exec`, `httpx.url`).
- `Fusion result` — summary of audit or migration outcome for follow-up review.
- `Telegram message — 6 title, 7 body` — a minimal status communication template.

## Tips

- Use Node’s direct TS ESM import support (`node -e "import('./js/modules/foo.ts')"`) as the fastest way to verify imports in this codebase.
- Read files in large chunks (one `read_file` call per file with `offset` and large `limit`) where possible to minimize tool calls.
- When the found test file does not exist (e.g., `state.test.js`), do not assume it is “dead”; verify exhaustive references before deleting or editing as orphaned.
- Reuse existing auto-skill patterns: strictness-first mapping, state-lock, and tests-first audits.
