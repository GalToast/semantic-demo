# BOTH-pattern follow-up tickets — 2026-06-13

**Status:** Open work tracked from the 2026-06-13 shim retirement fix-wave
**Related:** `docs/both-pattern-exit-criteria.md` (the strategic doc that frames this work)
**Related:** `tmp/both-pattern-investigation-2026-06-13/SYNTHESIS-FINAL.md` (unified consumer-surface map)

This doc captures the open tickets left over after commit `2a91873` (8 dead shim deletions). The fix-wave PR per `tmp/both-pattern-investigation-2026-06-13/lane-4-deepseek.md` had 4 parts; Part B (the deletes) is now done. Parts A, C, D remain.

---

## Open tickets

### ✅ Ticket 1: Port 4 LIVE stub-mis-wires (Part A) — CLOSED

**Closed by `c5a04a3`:** "fix(both-pattern): port 4 LIVE stub-mis-wires + delete 15 dead stubs (Parts A+C)" — 5 files modified, `syncFocusStage` / `updateSelectedBusiness` / `updateTraversalUi` / `clearThreadInspection` all ported via the delegating-shim strategy (option (b) from the original ticket scope). The v2 worker (`ocw_9e4d0593`) verified all 4 ports post-commit, ran the full test suite (10/10 unit, 70/70 tests, svelte-check 0/0, contract tests pass), and confirmed ast-grep caller counts match the audit.

**Original scope (per `tmp/both-pattern-investigation-2026-06-13/lane-1-rerun-mimo.md`):**
- 41 LIVE call sites across 13 files
- All 4 functions implemented as delegating re-exports from `@legacy/modules/*` (Vite's `.ts-first resolution` picks the real impl from `js/modules/*.ts`)

**Cross-seam finding (becomes Ticket 8):** 2 of the 3 functions originally listed in Ticket 2's `thread-settler-adapter.ts` scope were actually LIVE stub-mis-wires, not dead stubs. See Ticket 8 below.

### ✅ Ticket 2: Delete 16 dead stub functions (Part C) — CLOSED

**Closed by `c5a04a3`** (same atomic commit as Ticket 1, per the original ticket's "bundled atomic port" guidance). 16 dead stubs deleted across 4 files:

- `src/lib/journey/focus-ui.ts`: 7 stubs (verified deleted by v2 worker, `rg -c "function <name>"` returns 0)
- `src/lib/journey/thread-inspector.ts`: 7 stubs (same verification)
- `src/lib/journey/thread-settler-adapter.ts`: 1 stub (`walkInsideToNextStop` only, per the GLM-5 cross-check correction)
- `src/lib/journey/selected-card.ts`: 1 stub (`initJourneySelectedCard` — already deleted in `56c3c48`)

**Verification:** `rg "Stub function hit" src/lib/journey/{selected-card,focus-ui,thread-inspector,thread-settler-adapter}.ts` returns 0 hits in the 4 scope files (1 false positive in a comment). The 8 remaining hits in `src/lib/` are out-of-scope (7 in `thread-settler.ts` private stubs, 1 in a comment).

### ✅ Ticket 3: Retire 19 `@legacy/*` imports in `three-engine.ts:238-256` (Part D) — CLOSED

**Closed by:**
- `1eae33f` — 9 COLD imports in `three-engine.ts:238-256`
- `f1176bc` — 10 HOT imports in `same dynamic import block`
- `d8b3a63` — sibling warm edge in `src/lib/engine/adapters/lifecycle-bridge.ts` (view-controller)
- `8102c06` — Ticket 3 hot follow-up: 6 additional `@legacy/*` retirements across `camera-choreography/{cursor,focus,routes}.ts`, `camera-controls.ts`, `orchestration/window-actions.ts`, plus `lifecycle-bridge.ts` state import

**Original scope (per mimo's corrected counts `tmp/both-pattern-investigation-2026-06-13/lane-1-rerun-mimo.md`):**
- 10 HOT (render loop): `state`, `camera-controls`, `scene-reveal`, `focus-pocket`, `cluster-labels`, `three-interaction-visuals`, `three-search-animations`, `inspected-strand-overlay-adapter`, `route-arrival-overlay-adapter`, `mycelium-engine`
- 9 COLD (init-only): `view-controller`, `map-state`, `ui-feedback`, `map-flattening-layout`, `webgl-restore-adapter`, `focus-anchor-indicator`, `audio-scape`, `event-bindings`, `loading-ui`

**All 19 retired and verified.** Tier-1 `@legacy/*` retirement target for `three-engine.ts` and the camera-choreography / orchestration tree is now complete. The remaining 2 ineffective dynamic import warnings in `memory/active-context.md` are accepted legacy lazy imports (`journey-canvas-interaction`, `event-bindings`) — these are intentional and not `@legacy/*` retirements.

**Verification (per the 4 commits):** `npm run check` 0 errors, `svelte-check` 0/0, dismiss-in-complete-state-contract pass, surface-contract-check pass. Headed Playwright with `?demo=force` shows no visual regression.

### ✅ Ticket 4: Svelte-unification analysis for the 3 dual-impl functions — CLOSED

**Closed by:**
- `4074ae1 refactor(unification): port syncSemanticDiveUi to src/lib/journey/semantic-dive.ts (Ticket 4)` — created the Svelte-track port, ported the 251-line legacy impl, redirected all 4 callers
- `b93e077 refactor(unification): port semantic-guide to src/lib/journey/semantic-guide.ts (Ticket 4)` — created the Svelte-track port, ported the 302-line legacy impl + 6 exports, redirected all 2 callers
- `2cb6db2 chore(unification): delete legacy semantic-dive-ui.ts and semantic-guide.ts (Ticket 4)` — retired the legacy files

**Verdicts applied (per `docs/svelte-unification-analysis-2026-06-13.md`):**
- `normalizeRelationshipRole` (+3 related): **Coexistence now** — Svelte path is a SUPERSET (220 lines, 27 roles); legacy is a 66-line subset (8 roles) for trail/peer semantics. Documented migration plan: `journey-thread-settler → thread-inspector → journey-focus-ui → semantic-threads → journey-thread-model`. Both files kept for now; deletion gated on last UI consumer migration.
- `syncSemanticDiveUi` (+1 init): **Port legacy to Svelte path** — DONE in `4074ae1`.
- `requestSemanticGuide` / `setSemanticGuideButtonState` (+5 related): **Port legacy to Svelte path** — DONE in `b93e077` + `2cb6db2`.

**Verification:** contract tests pass (5.93s), svelte-check 0 new errors (1 pre-existing in `rerank.ts` unrelated), npm run test:unit 10/11 pass (1 pre-existing in `search-rerank.test.ts`), ast-grep cross-checks all 6 importers redirected.

### ✅ Ticket 5: search-engine single-track migration — CLOSED

**Closed by `28faffc`:** "feat(search): port all consumers to src/lib/search-engine single-track (Ticket 5)" — `js/modules/search-state.js` DELETED (zero importers confirmed), `js/modules/search-state.ts` retained as canonical orchestration layer (marked `@deprecated`).

**Key architectural change:** The dual-path through `semantic-search-api-cache.ts` is eliminated. The `search()` orchestration function now calls `performSearch()` from `search-engine.ts`, which goes through the canonical `search-cache.ts` cache. Unifies the search execution path and prepared for the rerank integration in Ticket 6.

**Verification:** npm run qa:contract:all ✅, svelte-check 0/0 ✅.

### ✅ Ticket 6: Search-rerank feature — CLOSED

**Closed by:**
- `2a5c590 feat(search-rerank): add NIM rerank step to search result ranking (Ticket 6)` — created `src/lib/utils/rerank.ts`, wired into `_executeSearch()` in `src/lib/search-engine.ts` as a conditional post-processing step between result fetching and cache storage, gated behind `?rerank=1` / localStorage / store flag (off by default)
- `2612ba3 test(search-rerank): add rerank unit tests and live verification (Ticket 6)` — `tests/unit-active/search-rerank.test.ts` + `reports/nvidia-capabilities/rerank-integration-verification.md`

**Live NIM call verified:** 200 OK via nvidia-capabilities MCP, rankings match proof doc (semantic explorer at +3.998 logit, geographic matches at -7.73 to -14.9).

**NIM gotchas confirmed:**
- Schema: `query: {text: ...}` and `passages: [{text: ...}]` (dicts, not strings) ✅
- Model: `nvidia/rerank-qa-mistral-4b` works ✅
- Cost: $0 via 5 nvapi keys ✅

**Cross-seam finding for production:** NIM endpoint doesn't send `Access-Control-Allow-Origin` headers. Direct browser fetches from localhost are blocked. For production, the rerank call should go through a same-origin proxy (e.g., `/api/rerank`). Documented in the verification report.

**Browser QA:** `?rerank=1&nodemo=1` confirmed — search completed (`data-search-status="results"`), CORS expected in local dev, graceful fallback confirmed.

**Design-doc discrepancy caught:** the design doc code sketch uses `rerank_results` as the response field name, but the actual NIM proof doc shows `rankings` (or `data.rankings`). The worker prompt's Phase 0 verification caught this; the live call confirmed `rankings` is the correct field.

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

### ✅ Ticket 8: Port 2 LIVE stub-mis-wires in thread-settler-adapter.ts — CLOSED

**Closed by:**
- `442a85f fix(journey): port traverseNeighbor and previewInsideNextThread to Svelte track (Ticket 8)` — rewrote both functions in `src/lib/journey/thread-settler-adapter.ts` as proper delegating shims, updated all 12 callers to import from the Svelte-track path
- `d80a2aa test(journey): add cross-seam caller tests for traverseNeighbor + previewInsideNextThread (Ticket 8)` — new test file asserting all 8 caller files route through the adapter

**Verification:**
- `npm run check` ✅ 0 errors
- `svelte-check` ✅ 0 errors, 0 warnings
- `npm run lint` ✅ 0 errors
- `npm run test:unit` ✅ 12 files, 100 tests pass (was 11/83 before; new test file added)
- `rg "traverseNeighbor" js/modules src/lib` ✅ All imports from adapter
- `rg "previewInsideNextThread" js/modules src/lib` ✅ All imports from adapter
- All 12 LIVE call sites updated; the `js/modules/journey-thread-settler.ts:312` call is a self-call within the same file (no import update needed)

**Import routing (8 files, 12 callers):**
- `traverseNeighbor`: `src/lib/orchestration/triggers.ts`, `src/lib/journey/journey.ts`, `src/lib/journey/thread-settler.ts`, `js/modules/lifecycle.ts`, `js/modules/bindings/utility-bindings.ts`, `js/modules/bindings/journey-bindings.ts`, `js/modules/keyboard-help.ts`, `js/modules/journey.ts`
- `previewInsideNextThread`: `src/lib/journey/journey.ts`, `js/modules/journey.ts`

**No cross-seam findings.** Worker used the same delegating-shim pattern as `c5a04a3` (Ticket 1), preserving the BOTH chain (`js/modules/X.js` → `src/lib/journey/X.ts` → `@legacy/modules/X` real impl). Vite's `.ts-first resolution` picks the real impl at runtime.

**The BOTH-pattern follow-up queue is now fully empty.**

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

## Suggested sequencing (post-2026-06-13 close-out)

1. ~~**Ticket 1 + 2** (Part A + C)~~ — **CLOSED** (`c5a04a3`)
2. ~~**Ticket 3** (Part D) — the big retirement~~ — **CLOSED** (`1eae33f`, `f1176bc`, `d8b3a63`, `8102c06`)
3. ~~**Ticket 4** (Svelte unification)~~ — **CLOSED** (`4074ae1`, `b93e077`, `2cb6db2`)
4. ~~**Ticket 5** (search-engine single-track)~~ — **CLOSED** (`28faffc`)
5. ~~**Ticket 6** (search-rerank feature)~~ — **CLOSED** (`2a5c590`, `2612ba3`)
6. ~~**Ticket 8** (12-caller follow-up in thread-settler-adapter.ts)~~ — **CLOSED** (`442a85f`, `d80a2aa`)
7. **Ticket 7** (lost subagent lanes) — 10 min manual OR skip

**Net remaining work:** BOTH-pattern follow-up queue is **fully empty**. Ticket 7 is optional (a 10-min manual gap-fill for the 2 lost subagent lanes from the original round-2 investigation).

**BOTH-pattern exit criteria met** (per `docs/both-pattern-exit-criteria.md`):
- No more two-source shims
- No more LIVE stub-mis-wires in Svelte-track files
- All `@legacy/*` retirements in three-engine.ts, camera-choreography, orchestration complete
- All dual-impl Svelte/legacy functions have a documented verdict (port, delete, or coexist)

Future work in this repo is now Svelte-track feature work, not BOTH-pattern migration.

**Signal #4 satisfied:** `docs/legacy-runtime-retirement.md` exists naming the retirement commits, consumer surface, and verification (Ticket 9E, 2026-06-13).
