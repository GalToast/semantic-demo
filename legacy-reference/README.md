# legacy-reference/

**Frozen archive of retired BOTH-pattern shadow files** — preserved for archaeology, not built.

## What's here

| Directory | What it was | When retired |
|---|---|---|
| `js-both-shadows-2026-06-13/` | 50 BOTH-pattern `.js` shadows of `js/modules/*.ts` + `js/state.js` | Wave 10 W2 (`7fc7b9d`, 2026-06-13) |
| `dead-shims-extracted/` | Earlier dead-shim extraction sweep | Legacy |
| `parts-a-c-retirement-2026-06-13/` | Parts A–C retirement wave artifacts | 2026-06-13 |
| `retired-artifacts-2026-06-13/` | Misc retired JS/TS artifacts | 2026-06-13 |
| `shim-archive-2026-06-13/` | Resolved import shims | 2026-06-13 |
| `*.zip` | Original tarballs before extraction (preserved for byte-level fidelity) | 2026-06-13 |

Each subdirectory has its own `README.md` with deeper scope notes. Read the sub-README for any specific archive before consulting this one.

## What's NOT here

This is **not** the engine kernel. The active runtime is:
- `js/modules/*.ts` (engine kernel — Three.js scene, camera, shaders, etc.)
- `js/state.ts` + `js/state/` (state kernel)
- `js/workers/` (worker kernel — data-worker)

Those files are the working application, not legacy. See `AGENTS.md` § "Engine Kernel Architecture" for the deliberate kernel-bridge-UI architecture rationale.

## How to read

Files were `git mv`-ed into place; **git history is preserved.** To see why a given file was retired:

```bash
git log --follow legacy-reference/js-both-shadows-2026-06-13/<file>.js
```

To see why the archive was created at all:

```bash
git log --grep "W10-W2\|9D-Option-B\|BOTH"
```

## Do not delete this directory

The BOTH-pattern shadows are referenced by `AGENTS.md` as part of the migration arc's documented history. Future agents reading the codebase need to see what was retired and why. If you genuinely want to consolidate, prefer the rule "move file to `legacy-reference/`, never `git rm`." If a file isn't worth keeping in-source, raise the question in a planning doc rather than deleting silently.

## Companion guards

These scripts prevent the legacy files from interfering with the live build:

- `npm run check:bridges` (scripts/check-bridge-references.mjs) — asserts every `@lib/engine/*-bridge` import resolves
- `npm run check:legacy-budget` (scripts/check-legacy-ts-budget.mjs) — asserts legacy `js/modules/*.ts` type-error count stays at or below budget (one-way ratchet)

Both are part of the W12/13 strategic-seam housekeeping series.
