---
name: DRIFT_CONTRACT_SHADOW_AUDIT
description: Audit dual TS/JS file pairs to distinguish intentional drift-contract wrappers from dead shadows, verify post-recovery shadow staleness, and classify shadows by migration safety.
source: auto-skill
extracted_at: '2026-06-08T17:48:32.810Z'
---

# Drift-Contract Shadow Audit

## When to use

- A sweep or hurried cleanup claims N "dead .ts shadow files" in a JS/TS migration repo.
- Encountering dual `.js` + `.ts` files in `js/` or `js/modules/` and unsure whether to delete or preserve.
- Verifying a file pair before enabling a bulk-delete script or a `tsconfig.json` include/exclude change.
- Verifying a recently-applied TS sibling **recovery** operation for staleness, orphan, and build-entry correctness.
- Classifying recovered shadows into safety tiers before allowing `@ts-nocheck` removal.

## Pattern: intentional drift-contract wrapper

In active migrations, authors sometimes keep a `.js` stub alongside a `.ts` canonical entry solely for **drift-surface parity tests** (e.g., `ts-js-drift-contract.mjs`). The wrapper:

- Re-exports the real entry point's public surface (often just `init`).
- Imports sibling modules for side-effect surface parity.
- Guarantees the import graph stays minimally consistent while the build flips to the `.ts` entry.

This is **not** a dead shadow. Deleting it breaks the drift contract and the tests that depend on it.

**Canonical example (semantic-explorer, verified 2026-06-08):**
- `js/modules/app.ts` — 380 lines, real init orchestration, build entry (`entryPoints: ['js/modules/app.ts']`)
- `js/modules/app.js` — 56 lines, comment header explains it; re-exports `init` from `./app.ts`; imports all 43 siblings for drift-contract surface parity
- Build already flipped; `app.js` lives only for the contract test.

## What false claims look like

- Sweep worker counts `.ts` files under `js/` and reports "N dead shadows" without inspecting import graphs or build entry points.
- Sweep worker excludes `js/` from typecheck and concludes "never imported, dead code" — the `.ts` file IS built via esbuild entryPoints, not via tsconfig include.
- Sweep wave re-reports a prior wave's unverified number (e.g., "145 shadows") without re-running `git ls-files` or the project's own `--ts-readiness` diagnostic.
- Sweep concludes "all errors are strictness complaints, add `@ts-nocheck`" when the file is actually a **`SHADOW_OF_SRC`** — an exact exported-symbol duplicate of a canonical `src/` file. In that case, delete the shadow rather than ignoring it.

## SHADOW_OF_SRC classification (verified pattern)

When a `.ts` file under `js/` has a **same-symbol** canonical port in `src/`:

| Signal | Action |
|---|---|
| Canonical file exports the **same symbol** (e.g., `findNearestCanvasFieldNode`) | Verify the canonical is imported by a live consumer (`src/lib/journey/canvas-interaction.ts`) |
| Canonical importer exists and is live | Delete the `js/modules/` shadow from git and disk |
| Candidate has `@ts-nocheck` **and** broken legacy imports (deleted `.js` siblings) | Strong deletion signal — the file is both dead and crashed-runtime-unusable |
| Candidate has `@ts-nocheck` but NO canonical duplicate | Keep it; it's a SHADOW_OF_LEGACY, not SHADOW_OF_SRC |

After deletion, run `npm run check:svelte` and `npm run build:svelte` to confirm no regression.

## Audit procedure (shell-first; in-process tools may be stale)

1. **Check the build entry.**
   - `node scripts/build-app.mjs --ts-readiness` (if present)
   - Or: read `scripts/build-app.mjs` for `entryPoints: [...]`
   - Or: inspect esbuild/rollup/vite config for `.ts` entry.

2. **Size both files.**
   - `powershell "Get-Content f1,f2 | Measure-Object -Line"` or `wc -l`.
   - If one is < 100 lines and ends with `export { init } from './whatever.ts';`, it is likely a wrapper.

3. **Trace importers / entry usage.**
   - `git grep -n "modules/app\.js" -- '*.ts' '*.js' '*.svelte' '*.html'`
   - `git grep -n "entryPoints.*app\.ts" scripts/` / build config.
   - If zero importers except a `*_drift_contract.mjs` / `*_readiness.mjs` test, that supports "wrapper for contract test."

4. **Read the smaller file's header comment.**
   - Authors usually state the intent explicitly when creating a contract driver (e.g., "Compatibility wrapper for the TS entry flip... re-exports init from the TypeScript entry and keeps all sibling imports for surface parity").
   - Trust explicit structural comments over aesthetic symmetry.

5. **Check invalidation assumptions.**
   - Does `tsconfig.json` exclude `js/`? That only means typecheck does not validate it — not that it is unbuilt or unused.
   - Does the file import uninspected runtime code? Wrappers intentionally import heavy graphs to keep the contract honest; do not mistake magnitude for deadness.

6. **Decision.**
   - Wrapper/contract driver → **preserve**. Document it so future sweeps do not re-flag it.
   - True dead shadow (zero importers, zero build role, no stated contract purpose) → **delete** or wire up.
   - Unclear → default to preserve; assign to a human/Main-Lane review before bulk deletion.

## Drift closure for a named TS/JS pair

Use this focused flow when a lane is asked to close real behavioral drift in one specific pair (e.g. "reconcile WebGL drift lead before strictness").

1. **Verify the contract-test surface first** — read `tests/ts-js-drift-contract.mjs` and confirm `KNOWN_BASELINE`, `extractExports`, `extractSiblingImports`, and any `SEMANTIC_RULES` for the target file. Do not trust a dispatcher hint without checking the actual semantic rule text.
2. **Compare guard + body patterns** — in both files, list every `webglContext.*` reference with line number and context. List every `state.*` reference for the flagged surfaces. A "mixed" pattern is only drift if one side guards with `state` and the other with `webglContext` for the same property.
3. **Spot-check the paired tracker modules** — e.g. `js/modules/three-engine.{js,ts}` teardown may have the real drift, not the inspected pair. Cross-seam findings get logged as "outside scope" rather than touched.
4. **Treat shell-command denial as a report gap**, not a pass. State explicitly that `npm run check:ts-progress`, `npm run typecheck`, and `node tests/ts-js-drift-contract.mjs` were not run; give the expected output if the executor reruns them.
5. **Output contract** — `changed paths` (may be none), `exact drift fixed` (may be none), `checks run` with pass/fail or why not run, `unresolved risks`, `findings outside scope`.

**When no drift is found:** the report should still close the lead and call out what the file is still blocked by (for `three-interaction-visuals`: removal of `// @ts-nocheck` is blocked by `state` being typed as `unknown` for 12 semantic-lens/focus-mote/petal/filament/halo/core members, plus the mixed guard/body pattern is consistent in BOTH files).

## Anti-patterns to avoid

| Anti-pattern | Why it fails | Correct behavior |
|---|---|---|
| Count `tsconfig.json` include/exclude as proof of deadness | Build tools often use separate entryPoints (esbuild, vite, rollup) | Read the actual build config |
| Re-report a prior wave's count without re-verifying | Prior waves may have been generated against a different working tree (commits shift files between JS and TS) | Re-run shell `git ls-files` and `find . -name '*.ts'` against current HEAD |
| Delete because "no importers" | Contract-driver wrappers are imported by exactly one test, often in `tests/` | `git grep` across all extensions including test files |
| Treat dual files as always problematic | Dual files are a normal coexistence technique during phased migrations | Inspect intent first, then classify |

## Output contract

When a sweep claims shadow files, the audit return should state:

- **Computed count** from current source (shell), not from prior doc.
- **For each pair:** build role / importer list / wrapper comment quote / verdict (preserve / delete / unclear).
- **Confidence:** high/medium/low, with the single fact that would flip the verdict.

## Verified example — three-interaction-visuals (2026-06-08)

Task claimed `@ts-nocheck` on `js/modules/three-interaction-visuals.ts` and mixed `webglContext`/`state` ownership. Findings:

- `@ts-nocheck` not present in file.
- `@ts-ignore` / `@ts-expect-error` not present.
- Type-escaping path: `import { state as _state } from '../state.js'; const state = _state as any;` — local cast, not file-level blanket.
- Ownership parity: `webglContext.pointsMesh` guard is identical in both files; `state.pointsMesh?.localToWorld` accesses are identical in both files.
- `npm run typecheck` green; `npm run check:ts-progress` shows 0 drift pairs for this pair.
- Practical blocker to strictness removal: replace the per-file `const state = _state as any` with typed accesses; the cast escapes all `SemanticState` checks for 50+ state properties even though no function-level `@ts-nocheck` exists.

## Example conclusion (semantic-explorer 2026-06-08)

- Count: **3** `.ts` files in `js/modules/` (not 145).
- Classification: 3 dual modules (`app`, `journey-route-trace`, `journey-semantic-overlay`).
- `app.ts` is canonical build entry. `app.js` is a drift-contract wrapper (verified via header comment + zero non-test importers).
- Verdict: **Preserve all 3.** Update sweep claims to reflect actual count and contractual purpose.

## Blind spots to probe before passing

- **`@ts-nocheck` vs local `as any` on state imports.** A grep for the string `@ts-nocheck` can pass even when the TS shadow has a type-escaping cast, e.g. `const state = _state as any;` — a targeted search only surfaces literal `@ts-nocheck`. Probe for cast patterns too.
- **`typecheck` green with broad eagle escapes.** Strict `tsc` can pass while a module is still completely untyped at the state surface if every access routes through `any`. Do not treat green `npm run typecheck` as proof that strict-mode risk is low — inspect the `as any` scope and count.
- **`npm run check:ts-progress` does not surface semantic drift.** The drift-contract progress script only reports export/surface parity, not internal body divergence. A zero-drift pair can still differ on privacy, fallback math, or lifecycle order.

### 1. Inventory sanity
- Count `.ts` files under `js/modules/`.
- Count `.js` files under `js/modules/`.
- Count `@ts-nocheck` occurrences.
- Count local `as any` casts on major state surfaces (e.g. `state as any`, `window as any`, `(module as any)`).
- Compute orphan sets: TS with no JS sibling, JS with no TS sibling.
- Verify `npm run build:svelte` and `npm run typecheck` succeed.
- Record whether the TS file succeeded on its own or through broad escape hatches.

### 1. Inventory sanity

- Count `.ts` files under `js/modules/`.
- Count `.js` files under `js/modules/`.
- Count `@ts-nocheck` occurrences.
- Compute orphan sets: TS with no JS sibling, JS with no TS sibling.
- Verify `npm run build:svelte` and `npm run typecheck` succeed.

### 2. Three-way shadow classification

Classify every drift pair into exactly one category:

| Category | Meaning | Action |
|---|---|---|
| **Retired shadow** | JS is a re-export stub pointing at `.ts`; TS is canonical and larger. | Preserve; exclude from type-check removal queue. |
| **Checkpoint copy** | TS matches JS closely (within ±5%). | Safe starting point for annotation after drift closure. |
| **Stale shadow** | TS is smaller than JS by >5% (especially >10%). TS was captured from an older git snapshot and JS changed afterward. | Must re-sync TS from JS before any `@ts-nocheck` removal or flip. |

### 3. Staleness triage

For files in the **Stale shadow** category:

1. Read the first 30 lines of both `.js` and `.ts` and compare import blocks.
2. Focus on **missing exports** and **missing imports** — these are the hardest failure modes because type-checking passes while runtime behavior silently changes.
3. Look for signs of stale recovery in the TS header/blurb (`// @ts-nocheck\n// TypeScript shadow of ...`).
4. Determine whether the JS is simply larger due to comments/JSDoc (safe) or contains omitted function bodies (unsafe).

### 4. Checkpoint copy verification

For files claimed as generated from current JS source during recovery (e.g., "8 no-history siblings"):

1. Compare line counts and size ratios.
2. Confirm the function/export surfaces match.
3. Confirm no new imports or exports were invented during generation.

### 5. Acceptance gate recommendations

Before any main-lane agent removes `@ts-nocheck` from a recovered shadow, require:

- **Category established**: the file is Retirement / Checkpoint / Stale — no unknown category.
- **Stale resolved**: any Stale shadow is re-synced from current `.js` first.
- **Drift closed**: `npm run check:ts-progress` reports zero drift for the pair.
- **Typecheck passes after removal**: remove `@ts-nocheck`, run `tsc --noEmit -p tsconfig.typecheck.json`, confirm zero new failures.
- **Build passes after removal**: `npm run build:svelte` and `npm run build:safe` both exit 0.
- **No orphan regression**: `git diff --stat` still shows the pair on disk (or that the obsolete JS was intentionally removed).

### 6. Reporting

The audit should return:

- **Computed true counts** (files on disk, @ts-nocheck count, drift report numbers).
- **Category table** with all files, TS/JS line counts, category, and confidence.
- **Stale shadow prioritization** ranked by delta size and transitive blast radius.
- **Wrapper identification** for any retired/shuck JS stubs.
- **Correction log** for any worker claims that are mathematically true but operationally misleading.
- **No files changed** confirmation for read-only audits.
