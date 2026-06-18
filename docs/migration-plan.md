# Migration Plan — Post-W42 Baseline

**Created:** 2026-06-18
**Baseline:** Post-W42 (thread-inspector fix + a11y sweep complete)
**Previous:** `docs/archive/migration-docs/phase56-migration-plan.md` (historical reference only)

---

## TL;DR

| Dimension | Current state (W42) |
|-----------|---------------------|
| **Svelte UI** | 26/26 components complete. `svelte-check` 0/0. All stores, types, orchestration files in place. |
| **Engine kernel** | Fully migrated to `src/lib/`. Only `js/workers/data-worker.ts` remains (active runtime web worker, imported via `data-worker-url-bridge.ts`). Legacy `js/modules/*.ts` are gone from disk. |
| **Bridge** | `src/lib/engine/*-bridge.ts` files are the canonical seam manifest. Load-bearing; do not mass-delete (AGENTS.md §9). |
| **BOTH pattern** | `.js` shadows retired in W10 W2 (commit `7fc7b9d`). `@legacy/*` alias retired in 9D-Option-B (`cbc6509`). Legacy islands deleted in m3 sweep (`b8a50ba`), reverted 2026-06-12 (`ec520da`) — status ambiguous. |
| **Contracts** | 225 contract tests pass. Visual state audit covers 26 surface IDs. |
| **Bundle** | ~1,217 KB raw JS / ~338 KB gzip. CSS ~54 KB raw / ~10 KB gzip. Dead CSS modules pruned in W41 (`80e4224`). |
| **Deploy** | `deploy.sh` + `deploy.ps1` depend on sibling `../js/scanner.js`. Production shell at `dist/svelte/index.html`. |
| **What's left** | Bridge retirement (Phase 6), deploy-script decoupling, parity-attrs final closeout, prod-preview parity smoke, Svelte 5 strict-mode `!==` cleanup, deploy shell normalization. |

---

## Architecture Layers

| Layer | Path | Status | Notes |
|-------|------|--------|-------|
| **Svelte UI** | `src/components/*`, `src/lib/stores/*.svelte.ts` | ✅ Complete | 26 components, 12 stores, 4 type files |
| **Bridge** | `src/lib/engine/*-bridge.ts` | 🟡 Load-bearing | Canonical seam manifest — see § "Bridge File Doctrine" |
| **Engine kernel** | `src/lib/engine/`, `src/lib/focus/`, `src/lib/journey/` | ✅ Migrated | Three.js scene, camera, shaders, focus pocket, journey orchestration |
| **Orchestration** | `src/lib/orchestration/` | ✅ Complete | App init, lifecycle, view transitions, URL state, compass, events, parity-attrs |
| **State & stores** | `src/lib/state/`, `src/lib/stores/` | ✅ Complete | `appState` Svelte 5 class + typed writable stores |
| **Search** | `src/lib/search/`, `src/lib/search-engine.ts` | ✅ Complete | API search, local fallback, tokenization, reranking, caching |
| **Data** | `src/lib/data-store.ts`, `src/lib/data-store.svelte.ts`, `src/lib/data-loader.ts` | ✅ Complete | Business records, semantic threads |
| **Utilities** | `src/lib/utils/` | ✅ Complete | Seeded random, diagnostics, DOM helpers, math, WebGL restore, relationship roles |
| **Worker** | `js/workers/data-worker.ts` | 🟡 Active runtime | Only remaining `js/` file; imported via `src/lib/engine/data-worker-url-bridge.ts` |
| **Legacy reference** | `legacy-reference/` | 🟢 Archive | Frozen BOTH-pattern shadow files; reference only, not built |

Ref: AGENTS.md § "Engine Kernel Architecture"

---

## High-Risk Surfaces

These files require explicit ownership, targeted tests, and coordination with parallel sessions before any edit. (Per AGENTS.md "Edit Safety" section.)

| Surface | Module | Risk rationale | Active-care rules |
|---------|--------|---------------|-------------------|
| **`src/lib/state/app.svelte.ts`** | State class | Single source of truth for all global state. Dual-store mirror discipline: must write through `writeNavStateMirror()` / `writeFocusPocketMirror()`. | M-flagged. Coordinate with parallel session. Verify `npm run lint:nav-mirror` after any change. |
| **`src/lib/orchestration/app-init.ts`** | Orchestration | App initialization orchestrator. Replaces legacy `js/modules/app.ts`. Sequence-sensitive (10-step init). | M-flagged via proxy (lifecycle.ts). Do not re-order init steps without visual regression pass. |
| **`src/lib/journey/journey.ts`** | Journey | Journey orchestration layer. Thread walk, neighbor timers, trail seed, route index. | Off-limits write surface (AGENTS.md Worker Prompt Boundary). Touch only with explicit lead approval. |
| **`src/lib/orchestration/lifecycle.ts`** | Orchestration | App orchestration, view handoff, window bindings, scene-reveal logic. 425 lines. Many no-op stubs for legacy bridge compat. | Coordinate with parallel session. Do not remove legacy stubs until bridge retirement phase. |
| **`src/lib/engine/three-engine.ts`** | Engine | WebGL render loop, scene lifecycle, renderer management. RAF loop + GPU resource tracking. | Off-limits write surface. Do not touch without explicit lead approval. Disposal audit required for any material/texture changes. |
| **`deploy.sh` / `deploy.ps1`** | Deploy | Depend on `../js/scanner.js` path. Production shell routing. | Do not move app root until deploy scripts are decoupled. Any deploy change requires end-to-end verification against `dist/svelte/`. |
| **Focus-stage renderers** (`src/lib/focus/stage-renderer.ts`, `src/lib/journey/focus-stage-renderer.ts`) | Focus / Journey | M-flagged. Focus stage DOM rendering, selected-card hydration. | M-flagged. Coordinate with parallel session. CSS ownership via `docs/semantic-demo-focus-stage-css-owner-matrix.md`. |

---

## BOTH-Pattern Decommission Status

### Truly dead (can be removed)

| Artifact | Status | Evidence |
|----------|--------|----------|
| `@legacy/*` path alias | Dead | Retired in 9D-Option-B, commit `cbc6509`. |
| `.js` shadow files | Dead | Retired in W10 W2, commit `7fc7b9d`. |
| `js/modules/*.ts` (legacy orchestration) | Dead from disk | AGENTS.md: "The old `js/modules/*.ts` files referenced by earlier documentation are no longer present on disk." |

### Still load-bearing (do NOT remove)

| Artifact | Status | Evidence |
|----------|--------|----------|
| `src/lib/engine/*-bridge.ts` files | **Load-bearing** | AGENTS.md §9: "Bridge files are the canonical seam manifest." Must pass `npm run check:bridges` before deletion. |
| `js/workers/data-worker.ts` | **Active runtime** | Imported by `src/lib/engine/data-worker-url-bridge.ts`. Only surviving `js/` file. |
| `legacy-reference/` | **Archive-only** | Frozen reference. Not built. Safe to leave. |

### Ambiguous — requires 4-signal audit

| Artifact | Status | Evidence |
|----------|--------|----------|
| Legacy islands (`selected-details-svelte-island.{ts,js}`, `search-results-svelte-island.{ts,js}`, `island-mount-helper.{ts,js}`) | **Ambiguous** | Deleted in m3 sweep (`b8a50ba`), then reverted on 2026-06-12 (`ec520da`). AGENTS.md: "Per the BOTH pattern below, they are part of the in-flight migration, not confirmed dead." Before removal, apply the 4-signal bridge rule: (1) runtime import, (2) docs/tests/legacy-reference reference, (3) public type export consumers, (4) commits in last 60 days. |
| `src/dist/svelte/` (build output) | **Not source** | Build artifact, not source. Safe to regenerate. Not a migration concern. |

### Post-06-12 revert implications

The `ec520da` revert restored the legacy islands after the m3 blanket-deletion. This means the islands track exists on disk again but is NOT wired by any live production path (the Svelte shell at `src/components/` is canonical). They are dormant artifacts that may be safely removed after confirming zero imports via `rg` across `src/`, `docs/`, and `tests/`.

---

## Bridge File Doctrine

The bridge files (`src/lib/engine/*-bridge.ts`) are the canonical seam between the reactive Svelte UI and the imperative Three.js engine kernel. They are **load-bearing during active migration**.

**Deletion protocol** (AGENTS.md §8 + § "Rule for future dead-code sweeps"):

1. Verify all callers are inlined or repointed: `rg <bridge-filename> src/ docs/ tests/`
2. Run `npm run check:bridges` — must return zero references
3. Remove the bridge file
4. Verify `npm run check && npm run build:svelte && npm run test:contract`

> **Note:** `docs/bridge-load-bearing-2026-06-18.md` referenced in the prompt scope does not exist as of 2026-06-18. **TBD — verify** whether this doc was created by a parallel session or if it should be authored as part of a future wave.

The 4-signal dead-code test (AGENTS.md § "Rule for future dead-code sweeps on `src/lib/`") applies to every bridge file candidate:

1. Imported by another `src/lib/` or `src/` file
2. Imported by name in `docs/`, `tests/`, or `legacy-reference/`
3. Exports public types or functions used by `src/components/`
4. Has a commit in the last 60 days
5. Is a `*-bridge.ts` file with active callers

A file passes the "dead" threshold only when **all five signals are zero**.

---

## Open Migration Arcs

### 1. Bridge Retirement (Phase 6 from historical plan)

**Status:** Not started. Bridge files are the canonical seam.
**Scope:** Slim bridge adapters (Phase 6A), then eliminate bridge entirely (Phase 6B) once Canvas component owns engine lifecycle.
**Dependency:** Requires porting engine modules to TS-first pattern (already done per AGENTS.md "Engine Kernel Architecture" — the engine kernel is fully in `src/lib/`).
**Blocker:** The bridge still wraps imperative Three.js calls; eliminating it requires the Svelte layer to own all engine lifecycle sequencing directly.
**Reference:** `docs/archive/migration-docs/phase56-migration-plan.md` §7–8

### 2. Deploy-Script `../js/scanner.js` Decoupling

**Status:** Open.
**Problem:** `deploy.sh` and `deploy.ps1` depend on the sibling `../js/scanner.js` path. Moving the app root would break production deployment.
**AGENTS.md guard:** "Do not move the app root until `deploy.sh` and `deploy.ps1` no longer depend on the sibling `../js/scanner.js` path."
**Next step:** Identify whether `scanner.js` is still needed post-migration. If dead, remove the reference. If active, vendor it into `scripts/` and update the deploy scripts.

### 3. Parity-Attrs Final Closeout

**Status:** W15 shipped 13 commits, 113 tests, 2 mirror helpers, 1 CI lint check. Parity layer is functional.
**Remaining:** Verify no body data-attr is written by a non-parity-attrs path. Run `npm run check:ownership` to confirm.
**Reference:** AGENTS.md § "W15+ Arc Lessons (parity-attrs closure, 2026-06-17)"

### 4. Prod-Preview Parity Smoke

**Status:** Baseline captured in W15 (`docs/production-preview-parity-baseline-2026-06-17.md`).
**Remaining:** Re-run parity smoke after any visual or body data-attr change. Verify dev (Vite 5173) and production preview (Vite preview 4174) produce identical body attributes and visual state.

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

| Surface | Pre-edit checklist |
|---------|--------------------|
| `app.svelte.ts` | 1. Confirm M-flagged status. 2. Coordinate with parallel session. 3. After edit: `npm run lint:nav-mirror`, `npm run check`, `npm run test:contract`. |
| `app-init.ts` | 1. Confirm no parallel session write scope. 2. After edit: full init sequence verification (dev + prod-preview), `npm run check`, visual regression pass. |
| `journey.ts` | 1. Requires explicit lead approval (off-limits write surface). 2. After edit: `npm run check:bridges`, `npm run test:contract`, compass-rail + thread-inspector surface checks. |
| `lifecycle.ts` | 1. Coordinate with parallel session. 2. After edit: `npm run check`, `npm run test:contract`, `npm run qa:surface:all`. Do not remove legacy stubs until bridge retirement phase. |
| `three-engine.ts` | 1. Requires explicit lead approval (off-limits write surface). 2. After edit: disposal audit for any new material/texture, `npm run test:contract`, visual regression for desktop-idle + mobile-idle. |
| `deploy.sh` / `deploy.ps1` | 1. End-to-end deploy verification against `dist/svelte/`. 2. Verify `../js/scanner.js` path resolves. 3. Test both dev and production preview. |
| Focus-stage renderers | 1. M-flagged. Coordinate with parallel session. 2. After edit: `npm run check:bridges`, CSS ownership check (`docs/semantic-demo-focus-stage-css-owner-matrix.md`), focus-pocket + compass-rail surface checks. |

**Bridge candidate deletion rule:** Before deleting any file that *might* be a bridge candidate, run `npm run check:bridges` and verify zero references in `rg <filename> src/ docs/ tests/`.

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

| Document | Path | Relevance |
|----------|------|-----------|
| W42 Charter | `docs/w42-charter-2026-06-18.md` | Thread-inspector fix + a11y sweep (completed) |
| W41 Charter | `docs/w41-charter-2026-06-18.md` | Bundle optimization + dead code elimination (partial) |
| W40 Charter | `docs/w40-charter-2026-06-18.md` | Production verification + Lighthouse baseline + visual regression |
| W38 Charter | `docs/w38-charter-2026-06-17.md` | Prior wave charter |
| W43 Charter | `docs/w43-charter-2026-06-18.md` | Focus-stage QA + performance prep (current) |
| Bridge Load-Bearing | `docs/bridge-load-bearing-2026-06-18.md` | **TBD — verify** existence; may not exist yet |
| A11y Baseline | Per W42-B scope | Keyboard traps, focus-visible, screen reader labels |
| Performance Budget | `docs/performance-budget.md` | JS/CSS budget ceilings and actuals |
| Design Tokens | `docs/semantic-demo-design-tokens.md` | Canonical token sheet |
| State Transition Table | `docs/semantic-demo-state-transition-table.md` | View-phase state machine |
| Surface Style Matrix | `docs/semantic-demo-surface-style-matrix.md` | 26 visual audit states mapped to tokens |
| Svelte 5 Strict-Mode Cookbook | `docs/svelte-5-strict-mode-cookbook.md` | `!==` inversion workaround patterns |
| Historical Migration Plan | `docs/archive/migration-docs/phase56-migration-plan.md` | Phase 5/6 reference (archived) |
| Nav State Ownership | `docs/nav-state-ownership.md` | Field-by-field ownership for NavState |
| CSS Ownership Map | `docs/semantic-demo-css-authority-map.md` | CSS selector ownership |
| Mobile State Ownership | `docs/semantic-demo-mobile-state-ownership.md` | Mobile body data-attr gates |
| Focus-Stage CSS Owner | `docs/semantic-demo-focus-stage-css-owner-matrix.md` | Focus-stage CSS ownership |

---

## Deferral List

| Item | Deferred to | Reason |
|------|-------------|--------|
| Bridge retirement (Phase 6) | Future wave | Bridge files are load-bearing; requires Canvas to own full engine lifecycle first |
| `../js/scanner.js` decoupling | Future wave | Requires decision on `scanner.js` necessity post-migration |
| Legacy islands removal | Future wave (after 4-signal audit) | Ambiguous status post-`ec520da` revert; needs fresh import audit |
| Deploy shell normalization | Future wave | Requires product decision on legacy URL path sunset |
| `docs/bridge-load-bearing-2026-06-18.md` | Verify existence | May not have been created yet |

---

## Contradictions vs AGENTS.md

None found. All claims in this plan are consistent with AGENTS.md as of the W42 baseline. The `docs/bridge-load-bearing-2026-06-18.md` file is referenced in the prompt scope but does not exist on disk — marked "TBD — verify" rather than fabricating.

---

*Generated 2026-06-18. Commit: `docs: create migration-plan.md (post-W42 baseline)`*
