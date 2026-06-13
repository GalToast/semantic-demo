# BOTH-pattern exit criteria — when does the JS→TS migration end?

**Status:** Proposed. Companion to `docs/semantic-demo-both-pattern-audit-2026-06-13.md` and `docs/canonical-truths.md`. Aligned with the durable code invariants in `AGENTS.md`.

**Author intent:** Codify the conditions under which the BOTH pattern (50 `.js` shims under `js/modules/` re-exporting from `src/lib/**/*.ts` and `js/modules/*.ts`) can be retired wholesale — not surgically per-shim.

---

## TL;DR

The BOTH pattern is a **transitionary** architecture, like a physical shim under a wobbly table: keep it while the migration is live, remove it when the migration is done. The audit's "is this dead?" rule (4-signal check) is the **per-file** answer; this doc is the **whole-pattern** answer.

**Exit signal:** when ALL of these are true:
1. Every consumer of the legacy runtime tree is gone or quarantined to a `legacy-reference/` archive.
2. No `js/modules/**` import in any `src/`, `tests/`, or build file outside an explicit allowlist.
3. The `@legacy/*` path alias can be removed from `vite.config.ts` without breaking any import.
4. A single `docs/legacy-runtime-retirement.md` exists naming what was deleted and why it's safe.

---

## Why the audit isn't enough

The 2026-06-13 audit (`docs/semantic-demo-both-pattern-audit-2026-06-13.md`) confirmed all 36 shims resolve to existing TS files. That's a **static** check — does each shim point at a real file? Yes. The audit explicitly did NOT validate:
- Whether the target file is a stub vs real implementation (the 2026-06-13 mobile-idle QA + the `initJourneySelectedCard` fix on 2026-06-13 both found live stub-mis-wire cases the audit missed)
- Whether the shim's consumer actually needs the legacy path
- Whether the Svelte components have fully replaced the legacy behavior

This doc is the **behavioral** complement: the audit says "the shim points at something real," and this doc asks "is the shim still needed at all?"

---

## The 4-signal audit rule (per `AGENTS.md`)

A `.ts` under `js/modules/` is **not dead** if any of:
1. Resolvable via the `@legacy/*` path alias (Vite's resolution chain — see `src/lib/engine/adapters/lifecycle-bridge.ts`, `src/lib/engine/demo-choreography.ts` for ~92 import sites)
2. Has a sibling `.js` in worktree or HEAD (the BOTH pattern)
3. Referenced by name in `src/`, `docs/`, or `tests/` (non-import grep)
4. Has a commit in the last 60 days

**Important:** This rule is a **lower bound** — "this file MIGHT be live." It is NOT a "this file is live" claim. To claim a file is live you also need at least one runtime call site (instrumented via diagnostic-adapter or by manual Playwright trace).

The 2026-06-13 mobile-idle QA + stub fix is a worked example: the `initJourneySelectedCard` function passed all 4 audit signals (it lives in `src/lib/journey/selected-card.ts`, has a sibling `.js` shim, is referenced by name in `src/lib/journey/journey.ts`, and was recently committed) — but its **runtime call site** was dead, and the function itself was a stub. Audit said clean; runtime said otherwise.

---

## Per-subsystem readiness

The BOTH pattern doesn't retire uniformly. Different subsystems are at different points in the migration:

| Subsystem | Legacy entry | Svelte entry | Single-track? | Notes |
|---|---|---|---|---|
| **Loading overlay** | `js/modules/loading-ui.ts` | `src/components/LoadingOverlay.svelte` | Yes (Svelte) | LoadingOverlay.svelte is the production path; legacy tree is fallback |
| **Demo choreography** | `js/modules/micro-demo.ts` + `js/modules/micro-demo-choreography.ts` | `src/lib/demo/choreography.ts` + `src/components/DemoChoreography.svelte` | No (BOTH) | Both paths run in parallel; Svelte DemoChoreography owns UI, legacy owns some choreography internals. State machine: **single-track** (`src/lib/stores/demo.svelte.ts`) |
| **Search engine** | `js/modules/search-state.ts` | `src/lib/search-engine.ts` | No (BOTH, two-source shim) | Audit Category 3. Integration target for the `2026-06-13` search-rerank design. **Highest-risk seam for new features** |
| **Filter state** | `js/modules/filter-state.ts` | `src/lib/orchestration/cluster-filter-controller.ts` | No (BOTH, two-source shim) | Audit Category 3 |
| **Camera controls** | `js/modules/camera-controls.js` + `-core.js` + `-restore.js` | `src/lib/engine/camera-controls.ts` | No (BOTH, triple-shim cycle) | Audit Category 1. Three shims alias the same TS facade — the core/restore separation was lost in migration |
| **Journey neighborhood** | `js/modules/journey-neighborhood.js` | `src/lib/journey/neighborhood.ts` | No (BOTH, stub no-ops) | Audit Category 2. 9 functions literally return undefined |
| **UI renderers** | `js/modules/ui-renderers.js` | `src/lib/ui-renderers.ts` | No (BOTH, stub no-ops) | Audit Category 2 |
| **InfoPanel** | (none) | `src/components/InfoPanel.svelte` | Yes (Svelte-only) | Single-track per AGENTS.md: 767L, ports the legacy chrome |

**Single-track count:** Loading overlay (UI), InfoPanel, micro-demo state machine = 3 of the major subsystems.

**Multi-track count:** search, filter, camera, journey, ui-renderers = 5 of the major subsystems.

---

## The BOTH-pattern debt, ranked by risk

Per the 2026-06-13 audit, the 50 BOTH files fall into 4 categories. **Risk = probability of latent bug × blast radius if a bug fires.**

### 1. Two-source shims (Category 3) — HIGHEST RISK
- `filter-state.js` and `search-state.js` carry both `./legacy.ts` AND `../../src/lib/*.ts` exports
- **Why highest:** two implementations of the same name live in the same module graph; consumers may resolve to either depending on import order
- **Concrete watch:** the search-rerank design (2026-06-13) integration point is `src/lib/search-engine.ts` (one of the two sources). Adding the rerank call only to the Svelte source leaves the legacy path running unranked. Adding it to both is 2× the work.
- **Exit step:** when the Svelte port covers 100% of the consumer surface, delete the legacy source from the shim and re-test.

### 2. Triple-shim cycle (Category 1) — HIGH RISK
- `camera-controls.js` / `-core.js` / `-restore.js` all alias the same `src/lib/engine/camera-controls.ts` facade
- **Why high:** the intended core/restore separation was lost. If any consumer relies on the distinction, it's silently aliased.
- **Exit step:** restore distinct TS files (`camera-controls-core.ts`, `camera-controls-restore.ts`) OR consolidate the `.js` shim layer so two of the three silent-aliases break.

### 3. Stub no-op exports (Category 2) — MEDIUM RISK
- `journey-neighborhood.js` and `ui-renderers.js` have 9 functions that `return undefined` / `return null`
- **Why medium:** the stub-and-warn pattern (`debugWarn('[…] Stub function hit: …')`) is a useful tripwire, but it requires a runtime check to detect (the audit's static check can't)
- **Watch:** any `console.warn` matching `/Stub function hit/` during normal page load = real mis-wire (the 2026-06-13 mobile-idle QA found one such case for `initJourneySelectedCard`)
- **Exit step:** port the stubbed functions to the Svelte path or delete them and remove their callers

### 4. Back-imports (Category 4) — LOW-MEDIUM RISK
- `journey-thread-settler.js:5` does `import { state } from '../../js/state.js'` (a src/-shaped module reaching back into the legacy tree)
- **Why low-medium:** the import works but inverts the intended dependency direction (Svelte → legacy instead of legacy → Svelte)
- **Exit step:** move the `state` ownership entirely to `src/lib/stores/index.svelte.ts` and have the legacy module consume it

---

## The exit criterion, restated

The BOTH pattern is retired when **all of these are true**:

1. **Zero non-archive `js/modules/**` consumers outside the allowlist.** Currently ~92 `@legacy/*` import sites in `src/lib/engine/adapters/lifecycle-bridge.ts`, `src/lib/engine/demo-choreography.ts`, etc. Each must either be:
   - Ported to Svelte and the legacy import removed
   - Moved to a `legacy-reference/` archive tree that doesn't ship in production
2. **The two-source shims are single-source.** `search-state.js` and `filter-state.js` resolve to only the Svelte path.
3. **The `@legacy/*` alias is removable from `vite.config.ts`.** This is the cleanest single check — if the alias can be dropped, the import graph has fully transitioned.
4. **A `docs/legacy-runtime-retirement.md` exists** that names the deletion commit, the consumer surface that was ported, and the verification that the build still passes without the legacy tree.

**Heuristic timeline:** at the current rate of 1-2 high-leverage fix waves per week (per the recent commit log), this is a 6-10 week arc. The 2026-06-13 audit is the inventory; this doc is the goal.

---

## Watch-out: designing new features on top of BOTH

The 2026-06-13 search-rerank design (`docs/search-rerank-integration-design.md`) is a near-term move. Its integration point is `_executeSearch` in `src/lib/search-engine.ts` — one of the two-source shims (Category 3, highest risk).

**Two paths forward, neither wrong:**

1. **Add the rerank call to the Svelte source only** (faster, but legacy path runs unranked — the rerank is effectively a partial feature for the duration of the BOTH pattern)
2. **Add the rerank call to BOTH sources** (correct, but 2× the work; the rerank fix must be applied to `js/modules/search-state.ts` AND `src/lib/search-engine.ts` and kept in sync per the BOTH-pattern invariant)

**My recommendation:** the search-rerank call belongs in a small new helper module (`src/lib/utils/rerank.ts` per the design doc), called from BOTH paths. The helper is the single source of truth for the fetch + remap logic; the call sites in both paths are one-liners. This is the same pattern as the BOTH pattern itself — shim at the call site, real impl in the helper.

If the user wants to land the rerank feature without the dual-call overhead, the alternative is to **finish the search-engine single-track migration first** (move `js/modules/search-state.ts` consumers to `src/lib/search-engine.ts` and delete the legacy tree), then add the rerank call once. That sequencing costs a few hours of migration work but saves the dual-call maintenance burden forever after.

---

## Open questions

1. **Is there a target date or release for the migration?** Knowing this would let us prioritize the per-subsystem work. If "no fixed date," the BOTH pattern retirement is opportunistic, in parallel with new features.
2. **What's the consumer surface for the legacy tree?** ~92 `@legacy/*` import sites is the count from the AGENTS.md invariant. Of these, how many are in the runtime hot path (camera, search, journey) vs the lazy / on-demand path (choreography, threads)?
3. **Does the Svelte port cover the legacy component surface 1:1?** InfoPanel is single-track (767L, ports the legacy chrome). Is the same true for Filter, Search, and Camera? If not, the retirement is blocked on the Svelte port.
4. **Is there a `legacy-reference/` archive tree planned?** The exit criterion assumes we either delete the legacy tree entirely or move it to a non-shipping archive. The latter is the safer move for a long-running production system.

---

## What to commit / link from

- Companion: `docs/semantic-demo-both-pattern-audit-2026-06-13.md` (the static inventory)
- Companion: `docs/canonical-truths.md` (the architectural facts that must remain true)
- Companion: `AGENTS.md` "JS/TS Coexistence: The BOTH Pattern" section
- Source of the per-file rule: `AGENTS.md` "Scaffold Status" notes
- Recent fix that exposed the audit's blind spot: 2026-06-13 `56c3c48 fix(journey): remove dead initJourneySelectedCardAdapter call site` + 2026-06-13 `6becd18 fix(demo): hide dismiss button in COMPLETE state and guard cancelDemo`
