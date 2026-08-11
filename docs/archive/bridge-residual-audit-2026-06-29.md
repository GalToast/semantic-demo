# Post-Phase-7 Bridge Residual Survey

**Date**: 2026-06-29
**Scope**: Non-`-bridge.ts` bridge shapes in `src/lib/**`, `src/components/**`, `src/types/**` — i.e. escape hatches that re-create the coupling problem Phase 7 closed (`docs/migration-plan.md` "Bridge File Doctrine") at a different layer.
**Out of scope**: the historical `src/lib/engine/*-bridge.ts` class (already 0 files per Phase 7, enforced by `npm run check:bridges`).

---

## Context

Phase 7 (2026-06-20) retired the historical `src/lib/engine/*-bridge.ts` class from 34 → 0 files and codified the **Bridge File Doctrine**: _"future bridge-like passthrough files should be treated as temporary debt and **must carry a deletion plan**"_ (see `docs/migration-plan.md:90–110` and `docs/ops/MIGRATION-STATUS.md`).

That class is gone. But post-retirement, the same coupling pattern has crept back in under different names — typed adapters in `src/lib/orchestration/`, `@ts-ignore` widening casts at the `window.*` boundary, store↔class-state write shims, and passthrough re-export modules in `src/lib/orchestration/`. None of these are "wrong" in isolation, but cumulatively they re-create the same fan-out problem Phase 7 solved.

This survey enumerates every non-`-bridge.ts` bridge shape reachable from production code, classifies by severity, and proposes an ordering. It is **survey-grade**: findings + fix sketches only — no timeline commitment. Promote to charter (Phase 8 candidate) when the user wants to lock the wave.

---

## Methodology

**Searched:**

1. `rg "as\s+any\b"` in `src/lib`, `src/components`, `src/App.svelte`, `src/window.d.ts`
2. `rg "@ts-(ignore|expect-error|nocheck)"` in `src/lib`, `src/components`
3. `rg "window\.__\w+"` in `src/lib`, `src/components` → cross-referenced against `src/window.d.ts` declarations
4. `rg "export\s*\{[^}]*\}?\s*from\s+['\"]"` (passthrough re-exports) in `src/lib/orchestration`
5. `wc -l` + per-file inspection for `src/lib/orchestration/*.ts` to flag the pure-passthrough files
6. `src/types/*.d.ts` audit for `[key: string]: any` and similar type-system escapes

**Cross-reference checks:** every finding site was validated against the corresponding contract test in `tests/unit-active/*-typing-contract.test.ts` (each pins a file's `as any` budget via regex), and against `docs/as-unknown-as-cast-audit.md` (load-bearing subset narrowing).

**Not searched (intentionally):** legacy `js/modules/**` consumers of the LOW-tier passthroughs. Migration ordering would be a charter question, not a survey question.

---

## Summary

| Severity                     | Count | Description                                                                           |
| ---------------------------- | ----- | ------------------------------------------------------------------------------------- |
| **HIGH**                     | 6     | `as any` / `@ts-ignore` escape hatches on a production runtime path                   |
| **MED**                      | 4     | Untyped or undeclared window globals; type-system escape hatches                      |
| **LOW** (separately-tracked) | 3     | Doctrine-compliant passthrough re-export files with deletion plans in their docblocks |

Plus 4 categorical **permanent exclusions** (worker boundary, DEV-only tooling, window allowlist compat, subset-narrowing cast bridges) — listed in [Permanent exclusions](#permanent-exclusions). These are _not_ in the burn-down count.

---

## HIGH (6)

Each is reachable from production runtime path. Every fix is bounded, single-file, has a contract-test surface, and is reversible.

| #   | File:Line                                           | Smell                                                                                                                                                                                              | Fix sketch                                                                                                                                                                                                                             |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/lib/stores/lifecycle.ts:156–157`               | `(appSt.focusState as any).selectedPoint !== undefined` (read), then `(appSt.focusState as any).selectedPoint = $focus.selectedBusiness` (**write**).                                              | Add `selectedPoint: BusinessRecord \| null` to `FocusState`; wrap the write in `withStateMutation(() => appSt.focusState.selectedPoint = $focus.selectedBusiness)`. Drops both `as any` annotations.                                   |
| 2   | `src/lib/stores/search.svelte.ts:241–243`           | `@ts-expect-error -- testCompatStore returns TestCompatState which lacks searchState; legacy bridge gap (w32-b)` followed by `as SearchSummary` non-null cast.                                     | Add `searchState?: { summary: SearchSummary \| null }` to `TestCompatState`. Close the w32-b gap; @ts-expect-error + `as` cast both drop.                                                                                              |
| 3   | `src/lib/stores/lifecycle.ts:201`, `:210`           | Inline widening reads of `window.__semanticState as { bloomIndices?: Set<number> } \| undefined` and the `bridgeIndices` sibling cast.                                                             | Add `__semanticState: { bloomIndices?: Set<number>; bridgeIndices?: Set<number> }` to `src/window.d.ts`; drop both inline casts.                                                                                                       |
| 4   | `src/lib/orchestration/parity/parity-context.ts:81` | `(window.__APP_STATE__?.navState as { focusedIndex?: number } \| undefined)?.focusedIndex` cast in the legacy fallback path (documented as "what actually carries the focus index in production"). | Tighten `__APP_STATE__` in `src/window.d.ts` from `Record<string, unknown>` to a structural `Pick<AppState, 'navState'>` alias. Drops the inline cast; this removes 1 of the 9 sites flagged in `docs/as-unknown-as-cast-audit.md`.    |
| 5   | `src/components/SpectorInspector.svelte:273`        | `// @ts-ignore — bridge shape is wider than window.__spector type` at the `window.__spector = bridge` write site.                                                                                  | Either widen the `__spector` declaration in `src/window.d.ts` to expose the actual runtime shape, or declare a local `SpectorDevWindow` interface that widens it. Drop `@ts-ignore`.                                                   |
| 6   | `src/components/DevGui.svelte:105`, `:169`          | `// @ts-ignore — window.__semanticPostprocessing is typed in window.d.ts` and an `guiInstance` widening cast on the same file.                                                                     | `__semanticPostprocessing` is partially typed in `src/window.d.ts` but missing the actual signature of one runtime method set in `src/lib/engine/three-postprocessing.ts:170` / `:243`. Add the missing shape. Drop both `@ts-ignore`. |

---

## MED (4)

These are _typed_ escapes — either untyped-window-globals (not in `src/window.d.ts`) or type-system escape hatches (`[key: string]: any`).

| #   | File:Line                                                         | Smell                                                                                                                                | Fix sketch                                                                                                                                                                                                                                                                     |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 7   | `src/components/DevTelemetry.svelte:7` — writer; reader not found | `window.__telemetry_devtoolsVisible = true` writes a global that is not declared in `src/window.d.ts`. Search confirms zero readers. | Either delete the write (lowest cost) or add `__telemetry_devtoolsVisible?: boolean` to the DEV-only section of `src/window.d.ts`.                                                                                                                                             |
| 8   | `src/lib/ui/view-bindings.ts:29` — reader; writer not found       | `window.__semanticDemoProd` is read at `!window.__semanticDemoProd` but the global is not declared anywhere.                         | Search confirms no writer reachable in `src/`. Either (a) replace the read with `import.meta.env.PROD` (typed and tree-shakeable) or (b) declare the global in `src/window.d.ts` after locating the writer.                                                                    |
| 9   | `src/lib/engine/three-engine-init-helpers.ts:131`                 | A comment references `window.__semanticEngine` as the "Spector.js frame-capture bridge", but the global is not declared.             | Verify whether the global is actually published; if yes, declare in `src/window.d.ts`; if no, delete the comment (it has drifted).                                                                                                                                             |
| 10  | `src/types/three-engine.d.ts:86`                                  | `[key: string]: any // Allow arbitrary dynamic properties from legacy code` plus `controls: any \| null` at `:45`.                   | The index sig exists because the engine's stage-side state surface is being decomposed per `docs/three-engine-decomposition-plan.md` (Phases 3–5). Tighten to specific keys as each decomposition phase lands; add a docblock cross-reference to the responsible Phase ticket. |

**Note on `src/lib/orchestration/test-globals.ts:88–90`**: `__navStore__` / `__focusStore__` / `__navActions__` _are_ typed (via local `declare global` blocks) but should be promoted to `src/window.d.ts` for consistency. Categorized as MED-adjacent; not counted in the burn-down above.

---

## LOW (3) — separately-tracked doctrine-compliant passthroughs

These follow the **Bridge File Doctrine** explicitly: each has a deletion plan in its file docblock, naming the legacy `js/modules/` consumers to migrate before removal. They are _known_ temporary debt with a documented exit. No code change required today; they're tracked so they don't drift.

| #   | File (LOC)                                                                                       | Action                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11  | `src/lib/orchestration/composition-state.ts` (14 LOC, single `export … from` line)               | Docblock identifies 3 legacy consumers: `js/modules/lifecycle-modes.ts`, `js/modules/lifecycle.ts` view-controller section, etc. Migrate imports to `@lib/stores/lifecycle`, then delete.                       |
| 12  | `src/lib/orchestration/cluster-filter-controller.ts:354–356` — "Legacy Adapter Re-exports" block | Comment acknowledges the re-exports "satisfy importers that previously depended on \_\_\_" — circular-dependency-compat shim. Migrate the 3 importers, delete the block.                                        |
| 13  | `src/lib/orchestration/navigation-state.ts:61–63`                                                | Three-line `export { dispatchNavTransition, NAV_TRANSITION_ACTIONS, NavTransitionAction, NavTransitionResult }` re-export tail. Self-documented as "Re-exports from canonical stores." Migrate consumers, drop. |

Status check on these three is already in `ops/MIGRATION-STATUS.md`'s pipeline tracker; this survey does not duplicate that surface.

---

## Cross-cutting observations

- **`src/window.d.ts` is the canonical seam** for window globals — 22 declared today. Three currently-undeclared globals (#7, #8, #9) should land there before they're consumed by more code. The existing `docs/window-global-allowlist.md` policy already classifies globals; this survey proposes extending that classification to the undeclared trio (currently invoking policy through absence, which is fragile).
- **Test-strategy gap** — findings #5 and #6 touch `src/components/*.svelte`. Per AGENTS.md and `scripts/git-hooks/pre-commit`, these trigger the **test-strategy-gap precommit warning** (any `*.svelte` staged without a journey test). The current `tests/widget-journey.spec.js` is the only journey test in the repo. Any commit on these files probably needs a journey test staged alongside — the warning is currently advisory, but should not be silently overridden.
- **Contract-test pinning** — every `as any` in `src/lib/` is pinned by a per-file regex budget test in `tests/unit-active/`. Per-file tightening is sequential because the regex depends on the file being in its pinned state. Any wave should commit one file at a time and run `vitest run tests/unit-active/` after each.
- **No `as unknown as` overlap** — none of the 6 HIGH findings complement the `docs/as-unknown-as-cast-audit.md` 85-site dataset; this survey is the `as any` / `@ts-ignore` / window-global layer. The two are complementary.

---

## Recommended wave order

If/when the survey is promoted to a wave:

1. **`stores/lifecycle.ts` typing tuck** — combines #1 + #3 (4 escape-hatch annotations removed in one file). Single commit.
2. **`stores/search.svelte.ts` w32-b retirement** — #2 alone. Single commit; closes the w32-b comment.
3. **`src/window.d.ts` shape promotion** — fold #3's `__semanticState` plus MED #7–9 plus the test-globals.ts trio into one update. Single commit.
4. **`parity/context.ts:81` widening** — #4 alone. Single commit. Tightens one `Record<string, unknown>` to a structural alias.
5. **SpectorInspector + DevGui** — combine #5 + #6. Two files, one logical change. Single commit (or two; pick by precommit-hook warning threshold for `*.svelte`).
6. **`three-engine.d.ts:86` index sig tightening** — wait for `three-engine-decomposition-plan.md` Phases 3–5 to land specific extractions; tighten incrementally per extraction.
7. **LOW-tier passthrough burns** — separate track, owned by the `js/modules/` consumer migration wave. No interaction with HIGH/MED fixes; can run in parallel.

Each HIGH/MED commit is sized for reviewability (≤100 LoC change, single file). The wave is bounded to ~5 commits if LOW burns run separately.

---

## Permanent exclusions

These bridges are **not in the burn-down count** because they're irreducible or policy-allowed:

| Category                            | Files / Globals                                                                                                                                                                                                                | Why irreducible                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Worker boundary**                 | `src/lib/workers/data-worker-url.ts` and the `data-worker-url-bridge.ts` runtime                                                                                                                                               | Web-Worker is a hard VM boundary. Phase 7 closed the URL-wrapper layer but the worker contract itself is permanent.                                            |
| **DEV-only bridges**                | `src/components/SpectorInspector.svelte`, `src/components/DevGui.svelte`, `src/lib/engine/three-dev-bridge.ts`, `window.__spector`, `window.__semanticPostprocessing` runtime handles, `_ti` namespace                         | Tree-shaken from production via `import.meta.env.DEV`. Per `docs/window-global-allowlist.md:74–80`: "It is not a product runtime bridge."                      |
| **Window allowlist compat surface** | `js/modules/bridge-registry.js`, `window.__APP_ACTIONS__`, `window.__APP_STATE__`, `window.__TEST_STATE__`, `window._getSelectedBusinessRoleLabel`, micro-demo globals (`window.isMicroDemoRunning`, `window.cancelMicroDemo`) | `classification: live-product` per `docs/window-global-allowlist.md`. Permanent compat namespace for Playwright, visual-audit, and external callers.           |
| **Subset-narrowing cast bridges**   | 48 load-bearing `as unknown as` sites in `docs/as-unknown-as-cast-audit.md`                                                                                                                                                    | Incompatible-type seams that survive via typed `unknown`-through casts. Audited and reclassified as load-bearing; removal requires upstream signature changes. |

---

## Open questions

1. **Survey-graduation:** does the user want this promoted to a Phase 8 charter (commitment + exit criteria + ticket IDs), like `phase-7-state-bridge-retirement-2026-06-20.md`? Survey status today; charter-blocked pending a decision.
2. **Undeclared globals (#7, #8, #9)** — `#7` and `#8` may have writers outside `src/` (in `js/modules/` legacy code?). Survey did not search legacy paths to keep scope tight. Resolve during wave execution.
3. **`three-engine.d.ts:86` tightening** — bound to `docs/three-engine-decomposition-plan.md` Phase 3–5 timeline. If those phases slip, the index sig stays.
4. **`composition-state.ts` (14 LOC) is the smallest** of the LOW-tier passthroughs — lowest-cost deletion candidate. Should be the first burn-down target when LOW-tier work resumes.

---

## Cross-references

- Doctrine: `docs/migration-plan.md:90–110` ("Bridge File Doctrine")
- Status: `docs/ops/MIGRATION-STATUS.md` (Phase 7 = "Bridge files — ✅ Complete (0 remaining)")
- Layer-2 audit: `docs/as-unknown-as-cast-audit.md` (subset-narrowing casts)
- Layer-3 audit: this document (escape hatches and globals)
- Window policy: `docs/window-global-allowlist.md` (compat-surface classification)
- Active waves that share sites: `state-class-migration-*.test.ts` (lifecycle/store layer), `three-engine-decomposition-plan.md` (engine surface), `three-interaction-visuals-decomposition-plan.md` (micro-demo bridge question)
- Test-strategy gap: AGENTS.md "The test-strategy gap" + `scripts/git-hooks/pre-commit`
