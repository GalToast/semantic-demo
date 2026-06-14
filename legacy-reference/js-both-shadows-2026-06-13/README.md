# Archived BOTH-pattern .js shadows — 2026-06-13

## What this is

This directory contains the **archived BOTH-pattern shadow files** for the `js/modules/*` and `js/state.js` engines. These `.js` files were vestigial shadows of their `.ts` siblings, kept around so older bundlers could resolve `import 'js/modules/X'` to the BOTH `.js` shim.

## Why archived

The BOTH pattern (`.ts` canonical + `.js` shadow) was the original migration design: keep the legacy `.js` as the bundler entry, write the typed implementation in `.ts`, re-export from `.js` to `.ts`. Vite's `.ts`-first resolution picked the `.ts` automatically, but the `.js` files were never actually used at build/runtime.

The BOTH pattern was retired in **Wave 9 ticket 9D-Option-B** (commit `cbc6509`), which dropped the `@legacy` and `@legacy-js` aliases. The `.js` shadows in `js/modules/*` are now also retired.

The retirement is a **retire, not a delete**:
- The 50 `.js` shadow files are moved to `legacy-reference/js-both-shadows-2026-06-13/` (preserved)
- The live tree's `js/modules/*` contains only the `.ts` canonical implementations
- The `js/modules/*` imports throughout `src/lib/**` are now extensionless (Vite resolves to `.ts` directly)
- The `.ts` files are the single source of truth; the `.js` shadows are reference material

## What's NOT in this archive

This is **not** an archive of the entire `js/` runtime. The `js/` directory still contains:
- `js/modules/*.ts` — the **engine kernel** (Three.js scene, camera, shaders, instanced meshes, thread geometry, focus pocket, journey system, search, weather, etc.)
- `js/state.ts` + `js/state/` — the **state kernel**
- `js/workers/` — the **worker kernel** (e.g., `data-worker.js` for the search service worker)
- 11 remaining `.js` files — **real `.js` implementations** without a `.ts` sibling, not BOTH shadows

The engine kernel is the **active runtime**, not legacy. The Svelte UI layer (`src/lib/components/*`, `src/lib/stores/*`) wraps the kernel via the imperative bridge in `src/lib/engine/`. This kernel-bridge-UI architecture is intentional, not stale coupling.

## How to read this directory

Each `.js` file here was a thin re-export of its `.ts` sibling. Example structure (from `js/modules/camera-controls.js` before retirement):

```js
export * from './camera-controls.ts';
```

The actual implementation always lived in the `.ts` file. The `.js` shadow existed for Vite's resolution chain and for any tooling that still expected the legacy path.

## What was retired in this batch

50 files total, archived in this directory (preserving original subdirectory structure minus the `js/` prefix):
- 46 in `modules/` (top-level, formerly `js/modules/`)
- 1 in `modules/utils/` (geo-data, formerly `js/modules/utils/geo-data.js`)
- 1 in `modules/bindings/` (panel-bindings, formerly `js/modules/bindings/panel-bindings.js`)
- 1 in `state/selectors/` (index, formerly `js/state/selectors/index.js`)
- 1 in `state.js` (formerly `js/state.js`)

The original file paths are preserved via `git mv`; see `git log --follow` for the history of any file.

## Companion docs

- `docs/wave-10-legacy-audit-2026-06-13.md` — the Wave 10 audit record (this retirement was the natural follow-up to the audit)
- `docs/legacy-runtime-retirement.md` — the Wave 9 retirement record (BOTH alias retirement)
- `docs/both-pattern-follow-ups-2026-06-13.md` — the BOTH-pattern follow-up tickets (all closed)
- `docs/both-pattern-exit-criteria.md` — the strategic frame

## Git history

The archive was created via `git mv`, preserving full git history. To see the original commits that introduced each shadow:

```bash
git log --follow legacy-reference/js-both-shadows-2026-06-13/<file>.js
```
