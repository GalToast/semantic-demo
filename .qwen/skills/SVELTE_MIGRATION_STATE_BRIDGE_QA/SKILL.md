---
name: Svelte Migration State/Bridge QA
description: Report-only QA/debug scan for state/data-flow bugs around a JS→Svelte/TS migration and legacy engine bridge. Triage focus files, run targeted static checks, return top-N findings with exact path/line refs, impact, verification, and fix order.
source: auto-skill
extracted_at: '2026-06-08T16:38:00.733Z'
---

# Svelte Migration State/Bridge QA

Use this when asked to audit state/data-flow correctness between a Svelte/TypeScript migration track and a legacy JS engine bridge, **without making edits**. Output is a ranked report of concrete bugs/risks suitable for a downstream fix lane.

## Adjacent Skills
- `SVELTE_MIGRATION_PARITY_AUDIT` — full 10-layer audit; use this skill when scope is narrowed specifically to state/data-flow and the legacy bridge.
- `STATE_DESYNC_PARITY_SURGERY` — fixes the class of bugs this skill identifies.
- `CROSS_TRACK_DATA_PARITY_FIX` — for data-processing/search-tokenization drift (different layer).
- `BUGSWEEP_CLAIM_FALSIFICATION_CHECK` — validate bugsweep claims before turning them into report items.

## Default Focus Files
Depending on the repo layout, the canonical bridge/state surfaces are usually:
- Svelte track: `src/App.svelte`, `src/lib/stores` (or `src/lib/stores/*.svelte.ts`), `src/lib/data-store*`, bridge adapters under `src/lib/engine/adapters/`, and Svelte-side data loaders.
- Legacy track: `js/state.js`, `js/modules/bridge-registry.js` (if present), `js/modules/lifecycle.js`, and any module listed in the repo’s “off-limits” or “high-risk” surfaces.

If the user provides a narrower file list, use that; otherwise default to the above.

## Anchored Readiness Checklist (pre-report)
Before drafting findings, confirm these invariants:
1. **Lint pass** — run `npm run lint` for quick syntax/static health on `js/`.
2. **Dirty file scope** — run `git diff --name-only HEAD` (or `git status --porcelain`); prefer files with **recent** edits over unchanged files.
3. **Tool hygiene on Windows** — in-process `read_file`/`glob` may return stale data; use `git diff HEAD`, `dir`, `findstr`, or `Select-String` for current-workspace verification.

## QA Procedure

### Phase 1: Read-Only Recon
1. Read each focus file (or the top/export surface if large). Note store definitions, mutation helpers, and bridge wiring.
2. Identify whether the repo has **dual module variants** (e.g., `.ts` vs `.svelte.ts`), aliased runtime paths (`@legacy/...`), or SSR/rune wrappers — these are the most common state-flow failure points.
3. Record any window-global contracts the bridge is expected to maintain (e.g., `window.__APP_STATE__`, `__TEST_STATE__`).
4. Inspect git diffs on the scoped files; recent rewrites are the most likely source of logic bugs.

### Phase 2: Targeted Static Checks (non-invasive)
Prefer grep/read-only commands that don’t mutate the worktree:
- `npm run check:svelte` or `npm run check` only if the user explicitly allows it and it is not expensive; otherwise skip.
- `grep` for specific patterns:
  - Dual/duplicate state modules: `grep -rn "export const .*=" src/lib/data-store* src/lib/stores/*.svelte.ts src/lib/stores/*.ts` and look for same-name stores across multiple files.
  - Store accessor mistakes: `grep -rn "navStore as any\]\.\|navStore\.focusedIndex" src/` and compare against the store’s actual read API.
  - Wrapper/stub traps: `grep -rn "console\.warn.*stub" src/lib/stores/ src/lib/` and count silent no-ops exporting critical behavior.
  - Bridge mutation boundaries: `grep -rn "withStateMutation\|_withMutation" src/lib/engine/adapters/` and verify every critical-key write is wrapped.
  - Legacy-writer dual writers: `grep -rn "document\.body\.dataset\.|state\.(navState|focusedNode|trailDepth|semanticDiveMode) =" src/` and check if parity/state-store are updated in sync.
  - Lifecycle/setLoadingPhase duplication: `grep -rn "setLoadingPhase" src/ js/` to detect competing writers.
  - Window global contract violations: `grep -rn "window\.__APP_STATE__\|require\('@legacy/state\.js'\)\|require\('@legacy/modules/" src/` and confirm whether the referenced global actually includes the keys being accessed.
- Read any “keyhole” files where the bugs are most likely: the store barrel, `selectedPointStore()`, `setLoadingPhase`, the bridge `init()` sequence.
- When a TS file delegates to a core loader and then reads back results from a window global, verify whether that global's **shape** includes the accessed keys.

### Phase 3: Triage and Pattern Matching
Map each anomaly to a known pattern (from the adjacent skills) or a novel state/data-flow pattern:

| Pattern | Typical signature |
|---|---|
| Data-loader readback mismatch | `src/lib/data-loader.ts` delegates to `@lib/...` core, then reads `window.__APP_STATE__` keys that weren't written into that global |
| Sealed core path abandoned | After refactor/delegation, callers depend on `require('@legacy/...')` fallbacks that always fail under Vite ESM; the path returns empty/error silently |
| Split state heap | Two files define the same store name (`businessRecords`, `positionBuffer`, etc.) but different module paths resolve them independently. |
| Wrong store accessor | `(store as any).prop` instead of `store().prop` on a hybrid/readable API; or the store is a rune getter but read as a writable. |
| Silent stub export | A barrel re-exports a function whose implementation is `console.warn(...); return;` — callers get no-ops with no error. |
| Dual writer / parity drift | Legacy `setLoadingPhase` and/or Svelte `loadingPhaseStore.set()` are not the same call site; parity-attrs is subscribed to only one. |
| Init race | Bridge `syncDataToLegacyState` runs after `initThreeJS()` with a long poll window, so the engine starts with empty geometry and never retriggers. |
| Missing global mirror | Tests depend on `window.__...__` globals; the Svelte track sets a different shape, omits a key, or resolves to stale snapshots. |
| Track desync | Legacy `state.js` is updated directly but the matching Svelte store action is skipped; the legacy engine renders, but the Svelte UI stays stale. |
| Global escape-hatch leak | Event listeners added at `document`/`documentElement` level via dataset guard; teardown only clears canvas-scoped signals, leaving document listeners alive after mode-switch/reload |
| Dedup normalization drift | `nearDuplicateKey()` or similar strips/merges characters with a regex that differs from normalization helpers, causing distinct records to collide |

### Phase 4: Report Assembly
Return a **numbered report with exactly N items** (user-specified, default 5). For each item:

```
### N. One-line title — SEVERITY
- **Paths:** exact file paths (and line ranges if available)
- **Bug:** concise statement of the gap or race
- **Why it matters:** user/test impact
- **Verify:** a concrete shell command, runtime check, or browser observation
- **Suggested fix:** one-sentence approach (do not edit)
```

Finish with a **“Next fix order”** table:
- Priority, bug label, effort estimate, and why that order.

### Severity Guide
- **HIGH** — user-facing data or UI is missing; core store/read returns `null` or stale.
- **MEDIUM** — architecture smell, dual writers, or silent stubs that degrade behavior.
- **LOW** — cosmetic parity drift, doc mismatch, or brittle but currently passing paths.

## Constraints
- Do **not** edit files.
- Do **not** spawn subagents unless explicitly requested; if allowed, prefer read-only subagents.
- Do **not** run expensive build commands without explicit approval; suggest the command instead.
- Treat bugsweep/sweep claims as evidence, not ground truth — verify against source before including.
