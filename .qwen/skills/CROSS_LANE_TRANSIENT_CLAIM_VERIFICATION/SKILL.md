---
name: CROSS_LANE_TRANSIENT_CLAIM_VERIFICATION
description: Validate whether reported build/typecheck/lint failures persist before memory-stamping fixes or dispatching subagents; treat transient cross-lane errors as tentative until re-verified.
source: auto-skill
extracted_at: '2026-06-08T21:23:06.760Z'
---

# Cross-Lane Transient Claim Verification

Use this when a check fails with many errors that were not seen on prior passes, or when a subagent report contends with recent green baseline evidence.

## Procedure

1. **Pin the exact command** that failed (script name, flags, config path).
2. **Re-run the same command in a new shell invocation.** If output differs, the original failure may be transient.
3. **Run a parallel check path.** Example: if `npm run check` (composite) failed, also run `npm run typecheck` and `npm run check:svelte` directly. Different lanes can hide/conflate faults.
4. **Inspect whether recent edits touched imported files or tsconfig/vite resolution.** Concurrent writes can flip `.ts` resolution and temporarily surface unrelated errors.
5. **Do not memory-stamp a fix until at least two independent signals agree.** Either:
   - two consecutive runs on the same lane match, or
   - two lanes agree (e.g. `typecheck` + `check:svelte` both red), or
   - an independent worker in a separate process reproduces the failure.
6. **If the failure is reproduced**:
   - classify as real vs structural (reproducible with minimal inputs)
   - prefer the smallest honest fix (`@ts-nocheck` only for non-runtime shadow wrappers; type fixes for canonical ports)
7. **If the failure is disproved**:
   - update memory/docs to reflect the disproof
   - record what evidence contradicted it (command output, worker id, timestamp)

## Anti-patterns to avoid

- Treating a single failing run as ground truth when prior runs in the same session were green.
- Memory-stamping an P0 action before disproof.
- Dispatching a subagent to "fix" a failure that may be transient.
- Fixing shadow `.ts` type errors when the shadow re-exports runtime `.js`; the build uses `.js`. Add `@ts-nocheck` only after confirming the shadow is non-canonical and the error is reproducible.
