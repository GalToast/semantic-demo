# BOTH-pattern follow-up tickets — 2026-06-13

**Status:** Open work tracked from the 2026-06-13 shim retirement fix-wave
**Related:** `docs/both-pattern-exit-criteria.md` (the strategic doc that frames this work)
**Related:** `tmp/both-pattern-investigation-2026-06-13/SYNTHESIS-FINAL.md` (unified consumer-surface map)

This doc captures the open tickets left over after commit `2a91873` (8 dead shim deletions). The fix-wave PR per `tmp/both-pattern-investigation-2026-06-13/lane-4-deepseek.md` had 4 parts; Part B (the deletes) is now done. Parts A, C, D remain.

---

## Open tickets

### 🔴 Ticket 1: Port 4 LIVE stub-mis-wires (Part A — user-facing bugs)

**Priority:** HIGH — these are silent no-ops in user-facing flows
**Effort:** 1-2 days (moderate risk; real impls in `js/modules/*.ts` may reference `state.js`/DOM)
**Owner:** TBD

**What:** Port the 3-4 LIVE stub functions to their real implementations in `src/lib/`. Per `tmp/both-pattern-investigation-2026-06-13/lane-1-rerun-mimo.md` ast-grep trace, the mis-wire touches **41 LIVE call sites across 13 files** (more than deepsek estimated):

| Function | Source stub | LIVE callers (ast-grep) | Real impl location |
|---|---|---|---|
| `syncFocusStage` | `src/lib/journey/selected-card.ts:22` | 15 callers, 11 files (both legacy and Svelte) | `js/modules/journey-selected-card.ts` |
| `updateSelectedBusiness` | `src/lib/journey/selected-card.ts:38` | 8 callers, 6 files | `js/modules/journey-selected-card.ts` |
| `updateTraversalUi` | `src/lib/journey/focus-ui.ts:94` | 4 callers, 4 files — **called every frame in render loop** | `js/modules/journey-focus-ui.ts` |
| `clearThreadInspection` | `src/lib/journey/thread-inspector.ts:103` | 14 callers, 6 files | `js/modules/thread-inspector.ts` |

**Root cause:** BOTH-pattern shims were standardized to re-export from `../../src/lib/journey/*.ts` during the js→ts migration, but the `src/lib/` versions were marked as stubs while the legacy `js/modules/*.ts` files retained the real implementations.

**Verification after fix:** `rg "Stub function hit" src/lib/` should drop from 30 to 8; no `[journey] Stub function hit:` console warnings on `?demo=force`.

### 🟡 Ticket 2: Delete 18 dead stub functions (Part C)

**Priority:** MEDIUM — zero risk, but bundled with Ticket 1 for atomicity
**Effort:** 30 min
**Owner:** TBD

**What:** Delete the 18 stub functions that have zero external consumers. Per deepsek's report, distributed across 4 files:

- `src/lib/journey/selected-card.ts`: `initJourneySelectedCard` (1) — already dead per commit `56c3c48`
- `src/lib/journey/focus-ui.ts`: 7 stubs (`isCondensedFocusStageViewport`, `shouldUseSingleNeighborFocusRail`, `shouldSuppressSelectedBusinessNeighborRail`, `hasColdDegradedSemanticFallback`, `shouldUseFloatingFocusJourneyOnly`, `initFocusNeighborRailSubscriptions`, `updateFocusNeighborRail`)
- `src/lib/journey/thread-inspector.ts`: 7 stubs (`getThreadInspectionState`, `renderThreadInspection`, `inspectThreadNeighbor`, `pinThreadNeighbor`, `unpinThreadInspection`, `scheduleCanvasThreadInspectionClear`, `exploreThreadNeighbor`)
- `src/lib/journey/thread-settler-adapter.ts`: 3 stubs (`traverseNeighbor`, `walkInsideToNextStop`, `previewInsideNextThread`)

**Verification:** ast-grep verify zero callers before deletion. After deletion, `rg "Stub function hit" src/lib/` should drop by 18.

### 🟡 Ticket 3: Retire 19 `@legacy/*` imports in `three-engine.ts:238-256` (Part D)

**Priority:** HIGH — biggest single Tier-1 retirement target
**Effort:** 2-4 days (10 HOT imports need careful render-loop port; 9 COLD imports are easier)
**Owner:** TBD

**What:** Per mimo's corrected counts (`tmp/both-pattern-investigation-2026-06-13/lane-1-rerun-mimo.md`):
- **10 HOT** (in render loop): `state`, `camera-controls`, `scene-reveal`, `focus-pocket`, `cluster-labels`, `three-interaction-visuals`, `three-search-animations`, `inspected-strand-overlay-adapter`, `route-arrival-overlay-adapter`, `mycelium-engine`
- **9 COLD** (init-only, in same file): `view-controller`, `map-state`, `ui-feedback`, `map-flattening-layout`, `webgl-restore-adapter`, `focus-anchor-indicator`, `audio-scape`, `event-bindings`, `loading-ui`

All 19 can be retired in a single PR. The 9 COLD are bonus — same file, can ride along.

**Verification:** Playwright headed with `?demo=force`, no `console.warn` from the retired paths, no visual regression in scene reveal / focus pocket / thread inspection.

### 🟡 Ticket 4: Svelte-unification analysis for the 3 dual-impl functions

**Priority:** MEDIUM — design decision, not a fix
**Effort:** 1-2 hours analysis, then optional 1-2 day port
**Owner:** TBD
**Doc:** `docs/svelte-unification-analysis-2026-06-13.md` (in progress)

**What:** Three functions have parallel Svelte and legacy canonical implementations. Unify to one source of truth:

| Function | Svelte impl | Legacy canonical | Verdict |
|---|---|---|---|
| `normalizeRelationshipRole` | `src/lib/utils/relationship-roles.ts` | `js/modules/relationship-roles.ts` (300+ line canonical) | See unification doc |
| `syncSemanticDiveUi` | (in `src/lib/journey/`) | `js/modules/semantic-dive-ui.ts` (300+ line real impl) | See unification doc |
| `requestSemanticGuide` / `setSemanticGuideButtonState` | (in `src/lib/journey/`) | `js/modules/semantic-guide.ts` (300+ line real impl) | See unification doc |

The 2026-06-13 shim retirement made this question acute: the shims are gone, but each function now exists in two places. The unification analysis is the design call.

### 🟢 Ticket 5: search-engine single-track migration

**Priority:** MEDIUM — required before the search-rerank feature
**Effort:** 4-8 hours
**Owner:** TBD
**Doc:** `docs/search-rerank-integration-design.md` (the design doc)

**What:** `js/modules/search-state.js` is a two-source shim (per the 2026-06-13 audit, Category 3 risk). Port all consumers of the legacy path to `src/lib/search-engine.ts` and delete the legacy tree. Required before the search-rerank feature can be safely integrated (per Ticket 6).

### 🟢 Ticket 6: Search-rerank feature

**Priority:** LOW (gated on Ticket 5)
**Effort:** 3-4 hours
**Owner:** TBD
**Doc:** `docs/search-rerank-integration-design.md`

**What:** Add a NIM rerank step to result ranking. Per the proof in `reports/nvidia-capabilities/rerank-semantic-vs-geographic.md`, the semantic-explorer passage dominates geographic matches by 11.7 logit units — a rerank pass would surface the actual visualizer above geographic matches.

**NIM gotchas to remember:**
- Schema shape: `query` and `passages` MUST be dicts/objects like `{"text": "..."}`, NOT plain strings
- Model name: avoid MCP default `nvidia/llama-nemotron-rerank-1b-v2` (404). Use `nvidia/rerank-qa-mistral-4b` or `nv-rerank-qa-mistral-4b:1`
- Cost: $0 via 5 nvapi keys

### 🟢 Ticket 7: Re-dispatch the 2 lost subagent lanes

**Priority:** LOW (optional, the 3 reports we have are enough to drive Tickets 1-3)
**Effort:** 10 min manual OR 15 min re-dispatch
**Owner:** TBD

**What:** Round 2 of the consumer-surface investigation dispatched 4 subagents; 2 finished without writing reports:
- `ocw_8c9a795e...` (nemotron-3-super-120b-a12b) — produced 1077 tokens of work, no file
- `ocw_055dc58a...` (codestral-2508) — produced 37 tokens, barely started

The work that was done is in their `ocw_*/stdout.log` files (preserved). The missing reports are:
- **Two-source shim deep-dive** (filter-state.js, search-state.js consumer trace) — partially covered by session work on `initJourneySelectedCard`
- **Consumer inventory** (per-subsystem rollup, reachability) — partially covered by mimo's per-file table

A focused 10-min manual grep can complete the gap; a re-dispatch is also viable with different models.

---

## Reference artifacts

| Artifact | Path | Purpose |
|---|---|---|
| BOTH-pattern exit criteria | `docs/both-pattern-exit-criteria.md` | Strategic doc that frames this work |
| BOTH-pattern audit | `docs/semantic-demo-both-pattern-audit-2026-06-13.md` | Original 50-shim inventory |
| Investigation synthesis (round 1) | `tmp/both-pattern-investigation-2026-06-13/SYNTHESIS.md` | 1-of-4 first attempt |
| Investigation synthesis (round 2) | `tmp/both-pattern-investigation-2026-06-13/SYNTHESIS-FINAL.md` | 2-of-4 (mimo + deepseek) unified map |
| Lane 1-rerun (mimo) | `tmp/both-pattern-investigation-2026-06-13/lane-1-rerun-mimo.md` | Corrected hot-path counts (132 imports, 10 HOT) |
| Lane 4 (deepseek) | `tmp/both-pattern-investigation-2026-06-13/lane-4-deepseek.md` | Stub & dead-shim inventory |
| Archived shims | `legacy-reference/dead-shims-2026-06-13.zip` | 8 deleted shims, self-documenting README |

---

## Suggested sequencing

1. **Ticket 1 + 2** (Part A + C) — bundled atomic port, 1-2 days
2. **Ticket 3** (Part D) — the big retirement, 2-4 days
3. **Ticket 4** (Svelte unification) — design call, 1-2 hours analysis
4. **Ticket 5** (search-engine single-track) — 4-8 hours, gates Ticket 6
5. **Ticket 6** (search-rerank feature) — 3-4 hours
6. **Ticket 7** (lost subagent lanes) — 10 min manual OR skip
