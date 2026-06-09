---
name: SVELTE_TS_BUILD_FAIL_CLUSTER_QA
description: Targeted QA procedure when svelte-check/tsc surfaces a focused Svelte/TypeScript error cluster — inspect only reported files, rank fixes by blast radius, return concise remediation with path/line refs and verification command.
source: auto-skill
extracted_at: '2026-06-08T16:38:40.992Z'
---

# Svelte/TS Build Fail Cluster QA

## Trigger

Use when `npm run check:svelte` (or `tsc --noEmit`) returns a **focused error cluster** in 3–6 files. Prefer this over a broad build sweep when the error list is already bounded.

## Core procedure

### 1. Anchor the real errors

- Re-run `npm run check:svelte` (or the relevant command) and capture stderr.
- Copy the full error list into your working notes before editing anything.

### 2. Read only reported files

- Read *only* the files named in the error output.
- Read minimal surrounding context (5–15 lines of target lines) unless the signature/call shape itself is in question.
- Do not expand scope to adjacent files that are not in the error list.

### 3. Verify signature claims before fixing

- If an error says X is missing or expects N args, **grep for the real definition** before editing call sites:
  - Search `export function|export const|export class` or open the file revealed by the import path.
  - Confirm whether the symbol is exported, renamed, or no longer exists.
- Treat the compiler message as a hypothesis, not ground truth.

### 4. Rank by blast radius

Order fixes as:

1. **Silent logic failure** — type-correct but wrong shape (e.g. wrong arity compiles in JS but yields empty or junk results in TS).
2. **Build blocker** — missing symbol, bad import, or type mismatch that prevents the next compile/surface from advancing.
3. **Noisy but safe** — cast / narrowing errors that do not change runtime behavior.

### 5. Output format

Return **top 5** concrete fixes as:

```
### N. <SHORT TITLE>
**Error:** one line.
**Path/line:** <relative path>:<line>
**Why:** <1–3 sentences on blast radius / silent failure>
**Fix (representative):** <exact code change or import rewrite>
**Verify:** `npm run check:svelte` — error clears.
```

If a fix requires threading state through multiple call sites, note the **minimum viable change** (one file/one import) that makes the next verification pass meaningful.

### 6. Verify

- Re-run the same command after each fix.
- If errors collapse into a smaller cluster, update ranking before continuing.
- Stop when the original build surface is unblocked; do not opportunistically fix adjacent surfaces.

## Anti-patterns

- Do **not** start deleting "orphan" files found incidentally during this scan — use a dedicated orphan-verification sweep with exhaustive import search first.
- Do **not** expand scope to CSS or layout surfaces unless the error list includes them.
- Do **not** claim "all errors fixed" after fixing one layer; re-run the command and confirm the specific cluster is smaller or gone.
