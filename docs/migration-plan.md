# Migration Plan — Post-W42 Baseline

**Created:** 2026-06-18
**Baseline:** Post-W42 (thread-inspector fix + a11y sweep complete)
**Previous:** `docs/archive/migration-docs/phase56-migration-plan.md` (historical reference only)

---

## TL;DR

| Dimension         | Current state (W42)                                                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Svelte UI**     | 26/26 components complete. `svelte-check` 0/0. All stores, types, orchestration files in place.                                                                                                               |
| **Engine kernel** | Fully migrated to `src/lib/`. Worker runtime lives at `src/lib/workers/data-worker.ts`; the Vite URL boundary lives at `src/lib/workers/data-worker-url.ts`. Legacy `js/modules/*.ts` are gone from disk.     |
| **Bridge**        | ✅ Retired. Phase 7 deleted the final `src/lib/engine/state-bridge.ts` passthrough and migrated consumers to canonical `appState` / `withStateMutation` imports.                                                |
| **BOTH pattern**  | `.js` shadows retired in W10 W2 (commit `7fc7b9d`). `@legacy/*` alias retired in 9D-Option-B (`cbc6509`). Legacy islands deleted in m3 sweep (`b8a50ba`), reverted 2026-06-12 (`ec520da`) — status ambiguous. |
| **Contracts**     | 225 contract tests pass. Visual state audit covers 26 surface IDs.                                                                                                                                            |
| **Bundle**        | ~1,217 KB raw JS / ~338 KB gzip. CSS ~54 KB raw / ~10 KB gzip. Dead CSS modules pruned in W41 (`80e4224`).                                                                                                    |
| **Deploy**        | ✅ Complete (uncoupled on 2026-06-19). `deploy.sh` + `deploy.ps1` are standalone. Production shell at `dist/svelte/index.html`.                                                                               |
| **What's left**   | Release hardening: full static/unit/contract gates, product playthrough, visual QA, Lighthouse/performance re-baseline, and deploy shell normalization decision.                                               |

---

## Architecture Layers

| Layer                | Path                                                                              | Status            | Notes                                                                            |
| -------------------- | --------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------- |
| **Svelte UI**        | `src/components/*`, `src/lib/stores/*.svelte.ts`                                  | ✅ Complete       | 26 components, 12 stores, 4 type files                                           |
| **Bridge**           | `src/lib/engine/*-bridge.ts`                                                      | ✅ Retired        | Phase 7 closed the final engine bridge; see `docs/phase-7-state-bridge-retirement-2026-06-20.md` |
| **Engine kernel**    | `src/lib/engine/`, `src/lib/focus/`, `src/lib/journey/`                           | ✅ Migrated       | Three.js scene, camera, shaders, focus pocket, journey orchestration             |
| **Orchestration**    | `src/lib/orchestration/`                                                          | ✅ Complete       | App init, lifecycle, view transitions, URL state, compass, events, parity-attrs  |
| **State & stores**   | `src/lib/state/`, `src/lib/stores/`                                               | ✅ Complete       | `appState` Svelte 5 class + typed writable stores                                |
| **Search**           | `src/lib/search/`, `src/lib/search-engine.ts`                                     | ✅ Complete       | API search, local fallback, tokenization, reranking, caching                     |
| **Data**             | `src/lib/data-store.ts`, `src/lib/data-store.svelte.ts`, `src/lib/data-loader.ts` | ✅ Complete       | Business records, semantic threads                                               |
| **Utilities**        | `src/lib/utils/`                                                                  | ✅ Complete       | Seeded random, diagnostics, DOM helpers, math, WebGL restore, relationship roles |
| **Worker**           | `src/lib/workers/data-worker.ts`                                                  | ✅ Active runtime | Vite `?worker&url` import is centralized in `src/lib/workers/data-worker-url.ts` |
| **Legacy reference** | `legacy-reference/`                                                               | 🟢 Archive        | Frozen BOTH-pattern shadow files; reference only, not built                      |

Ref: AGENTS.md § "Engine Kernel Architecture"

---

## High-Risk Surfaces

These files require explicit ownership, targeted tests, and coordination with parallel sessions before any edit. (Per AGENTS.md "Edit Safety" section.)

| Surface                                                                                                  | Module          | Risk rationale                                                                                                                                      | Active-care rules                                                                                                                |
| -------------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **`src/lib/state/app.svelte.ts`**                                                                        | State class     | Single source of truth for all global state. Dual-store mirror discipline: must write through `writeNavStateMirror()` / `writeFocusPocketMirror()`. | M-flagged. Coordinate with parallel session. Verify `npm run lint:nav-mirror` after any change.                                  |
| **`src/lib/orchestration/app-init.ts`**                                                                  | Orchestration   | App initialization orchestrator. Replaces legacy `js/modules/app.ts`. Sequence-sensitive (10-step init).                                            | M-flagged via proxy (lifecycle.ts). Do not re-order init steps without visual regression pass.                                   |
| **`src/lib/journey/journey.ts`**                                                                         | Journey         | Journey orchestration layer. Thread walk, neighbor timers, trail seed, route index.                                                                 | Off-limits write surface (AGENTS.md Worker Prompt Boundary). Touch only with explicit lead approval.                             |
| **`src/lib/orchestration/lifecycle.ts`**                                                                 | Orchestration   | App orchestration, view handoff, window bindings, scene-reveal logic. 425 lines. Many no-op stubs for legacy bridge compat.                         | Coordinate with parallel session. Do not remove legacy stubs until bridge retirement phase.                                      |
| **`src/lib/engine/three-engine.ts`**                                                                     | Engine          | WebGL render loop, scene lifecycle, renderer management. RAF loop + GPU resource tracking.                                                          | Off-limits write surface. Do not touch without explicit lead approval. Disposal audit required for any material/texture changes. |
| **`deploy.sh` / `deploy.ps1`**                                                                           | Deploy          | Decoupled. Production shell routing.                                                                                                                | Standalone since 2026-06-19; any deploy change requires end-to-end verification against `dist/svelte/`.                          |
| **Focus-stage renderers** (`src/lib/focus/stage-renderer.ts`, `src/lib/journey/focus-stage-renderer.ts`) | Focus / Journey | M-flagged. Focus stage DOM rendering, selected-card hydration.                                                                                      | M-flagged. Coordinate with parallel session. CSS ownership via `docs/semantic-demo-focus-stage-css-owner-matrix.md`.             |

---

## BOTH-Pattern Decommission Status

### Truly dead (can be removed)

| Artifact                                 | Status         | Evidence                                                                                                        |
| ---------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------- |
| `@legacy/*` path alias                   | Dead           | Retired in 9D-Option-B, commit `cbc6509`.                                                                       |
| `.js` shadow files                       | Dead           | Retired in W10 W2, commit `7fc7b9d`.                                                                            |
| `js/modules/*.ts` (legacy orchestration) | Dead from disk | AGENTS.md: "The old `js/modules/*.ts` files referenced by earlier documentation are no longer present on disk." |

### Formerly load-bearing (retired)

| Artifact                           | Status             | Evidence                                                                                                         |
| ---------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `src/lib/engine/*-bridge.ts` files | ✅ Retired         | Phase 7 migrated final consumers and deleted `state-bridge.ts`; `npm run check:bridges` and `npm run test:contract` pass. |
| `src/lib/workers/data-worker.ts`   | **Active runtime** | Worker parser runtime. URL creation is centralized in `src/lib/workers/data-worker-url.ts`.                      |
| `legacy-reference/`                | **Archive-only**   | Frozen reference. Not built. Safe to leave.                                                                      |

### Ambiguous — requires 4-signal audit

| Artifact                                                                                                                         | Status         | Evidence                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy islands (`selected-details-svelte-island.{ts,js}`, `search-results-svelte-island.{ts,js}`, `island-mount-helper.{ts,js}`) | **Ambiguous**  | Deleted in m3 sweep (`b8a50ba`), then reverted on 2026-06-12 (`ec520da`). AGENTS.md: "Per the BOTH pattern below, they are part of the in-flight migration, not confirmed dead." Before removal, apply the 4-signal bridge rule: (1) runtime import, (2) docs/tests/legacy-reference reference, (3) public type export consumers, (4) commits in last 60 days. |
| `src/dist/svelte/` (build output)                                                                                                | **Not source** | Build artifact, not source. Safe to regenerate. Not a migration concern.                                                                                                                                                                                                                                                                                       |

### Post-06-12 revert implications

The `ec520da` revert restored the legacy islands after the m3 blanket-deletion. This means the islands track exists on disk again but is NOT wired by any live production path (the Svelte shell at `src/components/` is canonical). They are dormant artifacts that may be safely removed after confirming zero imports via `rg` across `src/`, `docs/`, and `tests/`.

---

## Bridge File Doctrine

The former bridge files (`src/lib/engine/*-bridge.ts`) were the canonical seam between the reactive Svelte UI and the imperative Three.js engine kernel during migration. Phase 7 retired that seam; future bridge-like passthrough files should be treated as temporary debt and must carry a deletion plan.

**Deletion protocol** (AGENTS.md §8 + § "Rule for future dead-code sweeps"):

1. Verify all callers are inlined or repointed: `rg <bridge-filename> src/ docs/ tests/`
2. Run `npm run check:bridges` — must return zero references
3. Remove the bridge file
4. Verify `npm run check && npm run build:svelte && npm run test:contract`

> **Note:** `docs/bridge-load-bearing-2026-06-18.md` is a historical audit input. The living bridge status is Phase 7 complete with 0 remaining `src/lib/engine/*-bridge.ts` files.

The 4-signal dead-code test (AGENTS.md § "Rule for future dead-code sweeps on `src/lib/`") applies to every bridge file candidate:

1. Imported by another `src/lib/` or `src/` file
2. Imported by name in `docs/`, `tests/`, or `legacy-reference/`
3. Exports public types or functions used by `src/components/`
4. Has a commit in the last 60 days
5. Is a `*-bridge.ts` file with active callers

A file passes the "dead" threshold only when **all five signals are zero**.

---

## Open Migration Arcs

### 1. Bridge Retirement (Phase 6 / Phase 7)

**Status:** ✅ Complete (2026-06-20). Phase 7 retired the final `state-bridge.ts` passthrough and aligned QA contracts around canonical state helpers.
**Reference:** `docs/phase-7-state-bridge-retirement-2026-06-20.md`

### 2. Deploy-Script `../js/scanner.js` Decoupling

**Status:** ✅ Complete (2026-06-19).
**Problem:** `deploy.sh` and `deploy.ps1` used to depend on the sibling `../js/scanner.js` path.
**Resolution:** Stale references were removed entirely across `deploy.sh`, `deploy.ps1`, and associated config topology contract tests. The deploy process is fully decoupled and standalone.

### 3. Parity-Attrs Final Closeout

**Status:** W15 shipped 13 commits, 113 tests, 2 mirror helpers, 1 CI lint check. Parity layer is functional.
**Remaining:** Verify no body data-attr is written by a non-parity-attrs path. Run `npm run check:ownership` to confirm.
**Reference:** AGENTS.md § "W15+ Arc Lessons (parity-attrs closure, 2026-06-17)"

### 4. Prod-Preview Parity Smoke

**Status:** ✅ Complete (W9-A, 2026-06-20). W8 Bridge Retirement preserved parity. Refresh baseline: `docs/production-preview-parity-baseline-w9-2026-06-20.md`. Smoke contract lives in `tests/production-preview-parity-contract.mjs` (registered under `smoke` group in `tests/contracts.manifest.json`).
**Remaining:** Expand smoke to all 16 surfaces (currently 16 high-traffic attrs across 2 flows). Visual pixel-level parity diff is a future hardening.

### 5. Deploy Shell Normalization

**Status:** Open.
**Problem:** Production build is published as both `/semantic-demo/index.html` AND the legacy `/semantic-demo/vector-explorer-polished.html` URL. This dual-path increases deploy complexity.
**Next step:** Decide whether to sunset the legacy URL path. If sunset, update deploy scripts. If keep, document the dual-path as intentional.

### 6. Svelte 5 Strict-Mode `!==` Cleanup

**Status:** 38 risky usages identified and fixed in W15 (commit wave 2026-06-17). CI guard live: `npm run lint:svelte5-strict-mode`.
**Remaining:** Ongoing vigilance for new `.svelte` / `.svelte.ts` files. See § "Svelte 5 Strict-Mode Gotcha" below.

---

## Edit-Safety Reassurances

For each high-risk surface, the following must hold before any edit:

| Surface                    | Pre-edit checklist                                                                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app.svelte.ts`            | 1. Confirm M-flagged status. 2. Coordinate with parallel session. 3. After edit: `npm run lint:nav-mirror`, `npm run check`, `npm run test:contract`.                                                           |
| `app-init.ts`              | 1. Confirm no parallel session write scope. 2. After edit: full init sequence verification (dev + prod-preview), `npm run check`, visual regression pass.                                                       |
| `journey.ts`               | 1. Requires explicit lead approval (off-limits write surface). 2. After edit: `npm run check:bridges`, `npm run test:contract`, compass-rail + thread-inspector surface checks.                                 |
| `lifecycle.ts`             | 1. Coordinate with parallel session. 2. After edit: `npm run check`, `npm run test:contract`, `node scripts/qa.mjs contract --all --headed`. Do not remove legacy stubs until bridge retirement phase.          |
| `three-engine.ts`          | 1. Requires explicit lead approval (off-limits write surface). 2. After edit: disposal audit for any new material/texture, `npm run test:contract`, visual regression for desktop-idle + mobile-idle.           |
| `deploy.sh` / `deploy.ps1` | 1. End-to-end deploy verification against `dist/svelte/`. 2. Verify `../js/scanner.js` path resolves. 3. Test both dev and production preview.                                                                  |
| Focus-stage renderers      | 1. M-flagged. Coordinate with parallel session. 2. After edit: `npm run check:bridges`, CSS ownership check (`docs/semantic-demo-focus-stage-css-owner-matrix.md`), focus-pocket + compass-rail surface checks. |

**Bridge candidate deletion rule:** Before deleting any file that _might_ be a bridge candidate, run `npm run check:bridges` and verify zero references in `rg <filename> src/ docs/ tests/`.

---

## Svelte 5 Strict-Mode Gotcha

**The bug:** In rune-mode `.svelte` and `.svelte.ts` files, `!==` is compiled to `$.strict_equals(a, b, false)` (equivalent to `===`), silently inverting the comparison. No warning at compile or runtime.

**Cookbook pointer:** `docs/svelte-5-strict-mode-cookbook.md` — three workaround patterns:

1. `typeof x === 'number'` guards (safest for type checks)
2. Positive equality + `!` prefix: `!(x === 'idle')` instead of `x !== 'idle'`
3. Loose `!=` for null/undefined checks (limited applicability)

**CI guard:** `npm run lint:svelte5-strict-mode` (added W15, commit wave 2026-06-17).

**Upstream report:** `docs/svelte-5-strict-mode-bug-upstream-report-2026-06-17.md` — paste-ready Svelte GitHub issue.

**Prior sweep:** `docs/latent-!==-bug-sweep-2026-06-17.md` — 167 `!==` usages audited, 38 found risky and fixed.

**Rule:** Any new `.svelte` or `.svelte.ts` file should use one of the three patterns instead of raw `!==`. Add `// audit-ok:` comment if the usage is provably safe (plain function, non-reactive context).

---

## Cross-References

| Document                      | Path                                                    | Relevance                                                         |
| ----------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| W42 Charter                   | `docs/w42-charter-2026-06-18.md`                        | Thread-inspector fix + a11y sweep (completed)                     |
| W41 Charter                   | `docs/w41-charter-2026-06-18.md`                        | Bundle optimization + dead code elimination (partial)             |
| W40 Charter                   | `docs/w40-charter-2026-06-18.md`                        | Production verification + Lighthouse baseline + visual regression |
| W38 Charter                   | `docs/w38-charter-2026-06-17.md`                        | Prior wave charter                                                |
| W43 Charter                   | `docs/w43-charter-2026-06-18.md`                        | Focus-stage QA + performance prep (current)                       |
| Bridge Load-Bearing           | `docs/bridge-load-bearing-2026-06-18.md`                | Historical bridge audit input; superseded by Phase 7 closeout     |
| A11y Baseline                 | Per W42-B scope                                         | Keyboard traps, focus-visible, screen reader labels               |
| Performance Budget            | `docs/performance-budget.md`                            | JS/CSS budget ceilings and actuals                                |
| Design Tokens                 | `docs/semantic-demo-design-tokens.md`                   | Canonical token sheet                                             |
| State Transition Table        | `docs/semantic-demo-state-transition-table.md`          | View-phase state machine                                          |
| Surface Style Matrix          | `docs/semantic-demo-surface-style-matrix.md`            | 26 visual audit states mapped to tokens                           |
| Svelte 5 Strict-Mode Cookbook | `docs/svelte-5-strict-mode-cookbook.md`                 | `!==` inversion workaround patterns                               |
| Historical Migration Plan     | `docs/archive/migration-docs/phase56-migration-plan.md` | Phase 5/6 reference (archived)                                    |
| Nav State Ownership           | `docs/nav-state-ownership.md`                           | Field-by-field ownership for NavState                             |
| CSS Ownership Map             | `docs/semantic-demo-css-authority-map.md`               | CSS selector ownership                                            |
| Mobile State Ownership        | `docs/semantic-demo-mobile-state-ownership.md`          | Mobile body data-attr gates                                       |
| Focus-Stage CSS Owner         | `docs/semantic-demo-focus-stage-css-owner-matrix.md`    | Focus-stage CSS ownership                                         |

---

## Deferral List

| Item                                     | Deferred to                        | Reason                                                                            |
| ---------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------- |
| Bridge retirement (Phase 6 / Phase 7)    | ✅ Complete                        | Final `state-bridge.ts` retired on 2026-06-20                     |
| `../js/scanner.js` decoupling            | ✅ Complete                        | Successfully uncoupled on 2026-06-19                                              |
| Legacy islands removal                   | Future wave (after 4-signal audit) | Ambiguous status post-`ec520da` revert; needs fresh import audit                  |
| Deploy shell normalization               | Future wave                        | Requires product decision on legacy URL path sunset                               |
| Product/visual release QA                | Next release-hardening wave        | Run product playthrough, UI quality, visual surfaces, and Lighthouse re-baseline  |

---

## Contradictions vs AGENTS.md

None known in the living plan after Phase 7 closeout. Historical bridge audit documents may still describe `state-bridge.ts` as load-bearing because they preserve earlier wave context.

---

_Generated 2026-06-18. Commit: `docs: create migration-plan.md (post-W42 baseline)`_
