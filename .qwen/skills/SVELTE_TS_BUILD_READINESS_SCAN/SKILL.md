---
name: Svelte TypeScript Build Readiness Scan
description: Read-only type-check and build diagnostic that distinguishes esbuild transpile success from real TS/Svelte errors, clusters errors by root cause, and prescribes the smallest next fixes.
source: auto-skill
extracted_at: '2026-06-08T16:34:31.807Z'
---

# Svelte TypeScript Build Readiness Scan

Use when asked to verify whether the Svelte/TypeScript track is "build-ready." This is a **report-only** worker: inspect, run commands, classify findings, and do not edit files.

## Why This Skill Exists

`npm run build:svelte` often exits 0 even when `npm run check:svelte` reports many type errors. Vite/esbuild transpiles without type-checking; only `svelte-check` and `tsc` catch the real errors. Treat a green build as necessary but **not sufficient** evidence of readiness.

## Procedure

### 1. Visible Tools / Model Metadata

Before running anything, report:
- What tools are available to you.
- Which model you are running and whether it supports deferred tool access.

No further action until this is acknowledged in the report.

### 2. Run Focused Diagnostics

Run these two commands **in order**:

1. `npm run check:svelte`
2. If and only if check fails, run `npm run build:svelte` to confirm whether the errors block the bundle.

Record:
- Exit code
- Whether svelte-check errors are in `src/` code vs legacy files
- Exact error snippets **grouped by file**, not streamed raw

### 3. Inspect Smallest Relevant Files

For each failing file:
- Read the file and the imports it references (`*.ts` stores, `three` types, utility modules).
- Do **not** read adjacent files that were not referenced in the errors.
- Identify whether each error is:
  - A literal TypeScript mistake (wrong `as const`, wrong arity, wrong cast)
  - A drift between legacy JS and TS ports (store rename, signature change)
  - A library upgrade gap (three.js type surface changed)

### 4. Group by Root Cause, Not by Error Count

One root cause can produce many errors. Group findings like:

| Root Cause | Files | Errors | Complexity |
|---|---|---|---|
| `Object.freeze() as const` | design-tokens.ts | 4 | Trivial — drop `as const` |
| store export renamed | personality.ts, geometry.ts | 4 | Small — update imports |
| `seededUnit` signature drift | personality.ts, geometry.ts | 4 | Small — widen signature or combine salts |
| three.js type surface | resource-tracker.ts, webgl-context.ts | 5 | Small — cast to `Mesh`; import OrbitControls addon path |

### 5. Produce the Report

Return exactly:

- **Commands run** (with pass/fail)
- **Pass/fail summary** in plain language
- **Exact error snippets** by file
- **Root cause** with file paths and line references
- **Next 1–3 fixes** prioritized by blast radius and fix complexity

Format the root cause table so a follow-on worker can start fixing immediately without re-reading the source.

### 6. Respect Worktree Rules

- Do not revert, alter, or stage anything.
- Do not delete or touch `node_modules/`, lock files, build caches, or `.git` artifacts.
- Treat a dirty working tree as normal — report does not require a clean baseline.

## When Not to Use

- Use `STRUCTURED_BUG_SURGERY` when a fix list already exists and the next step is surgical application.
- Use `PRODUCTION_READINESS_GATE` for broader go/no-go verification that also covers state invariants, disposal, and tests.
- Use `SVELTE_MIGRATION_PARITY_AUDIT` when the question is Svelte/legacy parity rather than type-check readiness.
