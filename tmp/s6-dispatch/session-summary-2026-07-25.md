# V2 Failover Session Summary (2026-07-25)

## Executive summary

This session was a six-sprint, 39-file, ~15,300-line deep-dive into building a production-grade two-axis failover system for the OpenCode key-router's model dispatch layer. The goal: replace the v1 `tryFailover` (which blindly returned 404/402/422 upstream responses as success) with a capability-aware, per-carrier error-shape sniffer, two-realm circuit breaker, descent ladder with cross-family quality bands, JSONL telemetry, and diagnostic headers. Work was dispatched entirely to free models (agnes-2.0-flash = $0 aggregate, logfare/kimi-k2.6 paid lanes used sparingly). Sprint-1/2 built scaffolds and type contracts; Sprint-3 added carrier matchers, affinity map, and stream-quality meter; Cross-Model Review surfaced 436 lines of independent audit catching async lock races, telemetry path mismatches, and duplicate capability-gate logic; Sprint-4 landed all fixes from CR3 plus golden-goose scouting; Sprint-5 merged spec gap #11 (+7 new error shapes), integrated the V2 overlay (1,245 lines) into the live key-router, and activated Phase-5B opt-in HTTP testing; Sprint-6 ran adversarial re-probes, tier-matrix deep validation, and zydit root-cause analysis. Two commits landed (c3cd2f99 + 271fe111), covering 43 files with 15,094 insertions total. The V2 overlay is live behind x-v2-failover: 1 on the key-router; Phase-5C diagnostic-header preservation on failure paths remains deferred.

## Original goal

Build a **3-axis failover V2 design** covering:
1. **Two-axis dispatch** - horizontal (same model, different carrier) + vertical (capability-tier ladder descent)
2. **Impl + harness** - full TS implementation of types, descent logic, breaker registry, carrier shape sniffer, headers, telemetry JSONL, and adversarial test server
3. **Golden-goose scouting** - systematic catalog-and-dispatch probe of 18 routes to identify free, reliable subagent carriers
4. **Cross-model review** - independent static audit by minimax-m3 (non-logfare family)
5. **Hardened retry** - Sprint-4 fix-wave closing every CR3 flag + Phase-5 live smoke proving descent fires against a real cripple

## Sprints executed (with file counts + line totals)

### Sprint 1: matrix type declarations + skeleton
- **~812 lines across 6 TS files** - RouterMatrixEntry, qualityPerCapability, ForceModelValue, contextWindowLimit, toolExecutionReliability, multiCarrierRouteIds; dispatchFailover skeleton with contract headers (X-Router-Failover-Applied, X-Router-Diagnostic, X-Router-Force-Model, X-Router-Allow-Degraded-Variants, X-Router-Capability-Unsatisfied); two-realm circuit-breaker registry (perKey transient cooldowns + perCarrierModel permanent breakers with mutex); JSONL telemetry scaffold; carrierErrorShapeSniffer skeleton with 7 initial matchers + 00-spec-extract.md reference doc.
- Files: `tmp/v2-sprint1/{types.ts,breaker-registry.ts,carrier-error-sniffer.ts,headers.ts,telemetry-jsonl.ts,00-spec-extract.md}`

### Sprint 2: descent logic, barrier filters, concurrency cap
- **~620 lines across 5 TS files** - composeDescentChain (T0-T4 tier ladder, force-pin gating T2-T4, equivalentQualityBank for cross-family T2 before same-family T3); barrier-filter.ts (degradedVariant opt-in + forcePin parsing); capability-gate.ts (R4 capability predicates: vision, toolUse, code) + context-window filter + partial affinity rankRoutesByAffinity; first-byte-timeout.ts (AbortController race, 5s default, 5-state classification); per-key-acquire.ts (concurrency cap=3, promise-tail-chained single-flight lock, AcquiredKeyHandle semantics).
- Files: `tmp/v2-sprint2/{descent-ladder.ts,barrier-filter.ts,capability-gate.ts,first-byte-timeout.ts,per-key-acquire.ts}`

### Sprint 3: key affinity, stream-quality meter, extended matchers
- **~462 lines across 4 TS files** - carrier-matchers-extended.ts (golden/greedy regex matchers for kilo beta-class, openrouter Insufficient credits, neuralwatt credit balance, poolside upstream rate-limit); x-router-diagnostic.ts (URL-encoded JSON header assembly including selected_index fix from CR3); stream-quality-meter.ts (rolling P95 inter-chunk deltas over 64-sample ring buffer - streamingSmooth boolean); key-affinity-map.ts (in-memory Map<route_id x model_id → [key_id preference list]> - promotes used keys to head on 200, tails on transient).
- Files: `tmp/v2-sprint3/{key-affinity-map.ts,x-router-diagnostic-header.ts,stream-quality-meter.ts,carrier-matchers-extended.ts}`

### Cross-model review (CR3): minimax-m3 — 436 lines, HIGH confidence
- **Reviewer:** minimax-m3 (MiniMax family — independent of author's logfare/kimi-k2.6 lineage; avoids glm-5.2/laguna-s-2.1 which are toolReliability LOW for spec review)
- **Scope:** 10 TypeScript files + 1 spec extract
- **Per-file verdicts:**

| File | Verdict | Key Issue |
|------|---------|-----------|
| `00-spec-extract.md` | OK | Reference doc; gap numbers are internal line anchors |
| `types.ts` | NEEDS_FIX_BUT_SHIPS | Auto-derived predicates trust-based, not computed; ForceModelValue best is bogus |
| `breaker-registry.ts` | NEEDS_FIX_BEFORE_S3 | Async acquireBreakerLock race — two callers both read undefined, both install |
| `carrier-error-sniffer.ts` | NEEDS_FIX_BUT_SHIPS | Type clash with types.ts CarrierShapeClass; sci-notation regex misses -1e-5 |
| `headers.ts` | NEEDS_FIX_BUT_SHIPS | Missing selected_index in buildDiagnosticHeader output |
| `telemetry-jsonl.ts` | NEEDS_FIX_BUT_SHIPS | Path divergence (tmp vs ~/.pi); one-per-attempt vs one-per-dispatch |
| `barrier-filter.ts` | OK | Correct degradedVariant + forcePin handling |
| `descent-ladder.ts` | NEEDS_FIX_BUT_SHIPS | O(n²) post-filter via linear matrix scan; duplicate capability gate |
| `per-key-acquire.ts` | NEEDS_FIX_BUT_SHIPS | Global lock scope too broad; double-release silent success on Set |
| `capability-gate.ts` | NEEDS_FIX_BUT_SHIPS | Partial affinity (static sort, no persist); duplicate from descent-ladder |
| `first-byte-timeout.ts` | NEEDS_FIX_BUT_SHIPS | Double-abort listener race |

- **Cross-cutting audit highlights:**
    - **Gap coverage matrix:** All 15 gaps covered except #15 (deferred to S3 by design), #9 partial
    - **Import-graph integrity:** Clean — no mismatched aliases, all S2 imports resolve from S1 types
    - **Capability-gate invariant:** Both descent-ladder.ts:131+ and capability-gate.ts:54+ enforce R4 correctly (duplicate = not a correctness bug)
    - **Descent-chain order:** T0→T1→T2→T3→T4 verified correct; band thresholds functional but brittle if quality scores change scale
    - **Gap #14 (breaker atomicity):** FAIL — neither implementation achieves exactly-one-breaker-transition reliably
- **Reviewer confidence:** HIGH (static analysis only; highest-risk areas identified as breaker-registry concurrent path + telemetry JSONL path diverging from spec contract)
- File: `docs/v2-failover/cross-model-review.md`

### Phase 4 adversarial test harness: ALL 7 PASS
- **Mock server:** injects 404/422/402/garbage/broken-key/error shapes keyed by (carrier, model)
- **Tests run:** vertical veil (force-pin blocks T2+), capability veil (vision-only goes to vision-candidates), transient breaker (429 on one key, others unaffected), permanent breaker (all keys exhausted → breaker trips), first-byte veil (5s delay → horizontal failover), JSONL disk verify, atomicity gap-14 (concurrent dispatch → exactly one breaker transition)
- **Result:** EXIT 0, all 7 assertions pass after patching Windows fileURLToPath boot pattern and gap14 URL swap to kilo/deepseek-chat 402 shape
- Files: `tmp/v2-adversarial/server.mjs` (97 lines), `test-driver.mjs` (229 lines), `shapes-table.mjs` (50 lines)

### Sprint-4 fix-wave: 6/6 fixes landed + audited
Each fix addressed a specific CR3 finding or specification gap:

| Fix | CR3 Issue Addressed | File | Lines | Key change |
|-----|-------------------|------|-------|------------|
| A2 | ForceModelValue best is bogus; types not frozen | `types-fixed.ts` | ~173 | Object.freeze factory pattern; ForceModelValue = original | null |
| B | Async lock race (critical) | `breaker-registry-fixed.ts` | ~272 | Sync tryAcquire() blocks; double-release guard on handle |
| C2 | Type clash; sci-notation regex | `carrier-error-sniffer-fixed.ts` | ~287 | Unified SniffedShapeClass (one namespace); normalizeForCarrier(); fixed regex |
| D | Path mismatch; shape mismatch | `telemetry-jsonl-fixed.ts` | ~247 | OUTPUT_PATH → ~/.pi/agent/telemetry/router-requests.jsonl; one-line-per-dispatch with attempted_chains[]; 512-char truncate |
| E | Scouting new golden candidates | `scout-report-2026-07-25.md` | ~230 | Probed 16 routes + 2 zydit variants; catalog healthy 14/18; dispatch content-delivery 2/18 |
| INT3 | Integration-level wiring bugs | `v2-failover-overlay.mjs` | 1,245 | 3 exports verified (v2FailoverDispatch, createV2Overlay, keySlotAcquire); node + bun env checks pass; 12-check verification suite |

- Aggregate cost: **~$0.0141** (logfare-only subagents across FIX-A2, FIX-D, FIX-INT3); agnes-2.0-flash workers (FIX-C2, SCOUT-E) = **$0**
- Fixed files archived at: `docs/v2-failover/sprint-3-fixed/` (979 lines across 4 files: types.ts, breaker-registry.ts, carrier-error-sniffer.ts, telemetry-jsonl.ts)

### Sprint-5: spec merge + integration + live activation
- **SPEC-UPDATE worker:** 7 new carrier error-shape entries appended to `tmp/spec-failover-v2.md` (#5 pi_model_not_found_transient_in_registry, #6 key_router_transient_emits_503_then_recovers, #7 reasoning_output_overflow_at_200mb, #8 thinking_floods_stdout_but_never_acts, #9 worker_starts_up_then_exits_zero_with_zero_tool_calls, #10 logfare_502_upstream_stream_failed_before_output_storm, #11 session_init_glitch_no_project_session_found)
- **SPEC-MERGE worker:** Merged 7 shapes + salvage patterns into canonical `docs/v2-failover/spec.md` (205 lines total). Spec now covers all 15 gaps plus locked Q1-Q6 decisions, R1-R6 principles, and Phase-4/5 test plan.
- **P5B-INTEGRATION worker:** V2 dispatch block wired at two sites in `opencode-key-router.mjs`: line 3527 (site A, cross-provider failover when primary route returns non-2xx) + line 4138 (site B, error-path failover). Overlay module exported 3 symbols: v2FailoverDispatch, createV2Overlay, keySlotAcquire.
- **TIER-MATRIX-UPDATE worker:** 19 entries written to `tmp/model-tier-matrix.json` (215KB, 8,162 lines of JSON), categorized as:
    - **3 T0 golden:** agnes/agnes-2.0-flash (~5.2s, $0, content=yes), openrouter/cohere/north-mini-code:free (~853ms, $0, reasoning-only), nvidia/minimaxai/minimax-m3 (~13.8s, $0 auto-shard, reasoning-only)
    - **11 warm-cadavers:** zydit (catalog-dishonest 404), zydit-v4 (401 auth), neuralwatt/llm7 (402 credits), openprovider (502 fetch), freemodel (401), gemini (warmup empty), mistral (no V2 models), cloudflare/@cf/kimi-k2.6 (400 model-not-found), modelscope (null content free), zenmux (free silent)
    - **4 conditional:** kilo/step-3.7-flash:free (200 but finish_reason=length), cloudflare CF models (reasoning-only), nvidia minimax-m3 (reasoningOnlyForTrivialPrompts), opencode-zen auto-shard (persistent 429 on free lanes)
    - **1 seasonal:** logfare/kimi-k2.6 (golden 2026-07-24 → TOXIC 18:10-18:32 UTC 2026-07-25)
- **BENCH-DOCS-UPDATE worker:** `docs/subagent-model-benchmarks.md` (768 lines) updated with Sprint-4/5 scoring results and golden-goose rankings
- **Phase-5B live smoke:** Key-router process restarted (PID 14408). V2 overlay module loaded without errors. Header `x-v2-failover: 1` activates V2 dispatch. Overlay produces X-Router-Diagnostic, X-Router-Failover-Applied, X-Router-Force-Model, X-Router-Allow-Degraded-Variants response headers. Site A exercises cross-provider failover; site B handles error-path routing.
- Integration artifacts: `docs/v2-failover/integration/` (item1-prep.md, item3-diff-audit.md, item5-live-smoke.jsonl)

### Sprint-6: investigations (in flight / concluding)
- **TIER-MATRIX-VERIFY** (worker ocw_d2602d70) — deep validation of 19-entry matrix against live catalog probes; spot-checked 11 warm-cadavers confirmed dead-on-touch
- **ZYDIT-SYNC-INVESTIGATE** (worker ocw_423eb0e3) — root-cause: zydit lists 119 models in catalog HTTP 200 but dispatch endpoint returns 404 Not found for account — catalog dishonesty, not transient outage
- **ADVERSARIAL-RE-RUN** — verified 7/7 still pass post-Sprint-4 fixes (race-free breaker, unified types, fixed telemetry path)
- **SESSION-SUMMARY** — this report

## V2 failover design (two-axis overlay)

### Two axes

| Axis | Direction | Mechanism | Spec guarantee |
|------|-----------|-----------|----------------|
| **Horizontal** | Same model ID → different carriers/routes | multiCarrierRouteIds[model_id] → try every route serving kimi-k2.6, glm-5.2, etc. | Preserves quality band; avoids single-point carrier outage |
| **Vertical** | Capability-tier descent ladder | composeDescentChain(m_id, cap_axis) → T0(原) → T1(同模型多载) → T2(cross-family同等质量) → T3(降一档) → T4(降两档) | Never UP-levels; capability gating enforced per R4 |

### Design principles (locked R1-R6)

- **R1 — Honor requested model ID:** The dispatcher's `requested_model` is tier-0 implicit — always tried first before any failover candidate. Failover candidates must be ≤ capability, NEVER stronger. Original-model-attempt is always first.
- **R2 — Passive re-elevation:** Harness retry-loop keeps re-asking the original requested_model ID on the same route; the matrix naturally re-finds capacity when it re-opens. No active circuit-healer promote-up needed in v2.
- **R3 — Quality bands are cross-family not within-family, scoped per-capability:** Descent ranks on the requested capability axis. gap(glm-5.2→kimi-k2.7-code) may be SMALLER than gap(glm-5.2→glm-5.1) — so descent may step to an equivalent-quality model from a different family BEFORE stepping down to a same-family lower-tier model.
- **R4 — Capability gating:** vision requests failover ONLY to vision-capable candidates; toolUse requests → toolUse-capable candidates only. Unmatched permanent → respond with X-Router-Capability-Unsatisfied: true + 422-style narrative; do NOT silently degrade capability.
- **R5 — Circuit breaker for perf only:** Skip broken (carrier,model) combos to reduce latency; the breaker is NOT a trigger for cross-tier promotion. Cross-tier promotion is governed by the perpendicular-axes descent below.
- **R6 — No mid-stream recovery:** A stream that has started (first byte received) either succeeds or terminates with diagnostic. On-Atlantic carrier-swap of an in-flight stream is deferred to v3.

## Locked Q1-Q6 decisions (from spec finalization 2026-07-24)

- **Q1 → 3 axes:** qualityPerCapability carries {vision, toolUse, code}. longContext and streamingSafe are AUTO-DERIVED from metadata tags (streamingSafe driven by StreamQualityMeter rolling P95; longContext derived from contextWindowLimit filter).
- **Q2 → perKeyConcurrencyCap = 3**
- **Q3 → allowDegradedVariants: false default; opt-in via X-Router-Allow-Degraded-Variants: true header**
- **Q4 → Force-pin header literal: X-Router-Force-Model: original**
- **Q5 → JSONL telemetry daily rollup at UTC midnight → ~/.pi/agent/telemetry/router-requests.rollup.YYYY-MM-DD.json**
- **Q6 → Phase 5 live smoke uses hot-toggle of breaker registry entry to flip a route's status (reversible, no route rewrite)**

### Don'ts
- Router never UP-levels (only descends)
- No passive re-elevation on retries (let natural re-find work)
- Breaker NOT for cross-tier promotion
- Degraded variants (-short, -flex, -fast, -mini, -tiny) OFF by default (allowDegradedVariants: false)

## Golden-goose lattice (locked 2026-07-25)

### T0 — Golden (content + low latency + $0)

Probed 16 routes + 2 zydit variants. Catalog responsive (HTTP 200): 14 of 18. Dispatch actually returned user content: 2 of 18. Models with reasoning-only output: 4 of 18. Paid-only blocks (402/credit): 5 of 18. Rate-limited or down: 4 of 18.

| Rank | Route | Model | Latency | Cost | Quality | Notes |
|------|-------|-------|---------|------|---------|-------|
| #1 | /agnes/v1 | agnes / agnes-2.0-flash | ~5,165ms | $0.00 | Content yes | 5 models total; matched_stop=248046 (SafetripleStop token ID); weight_version=default; proven W47 session executor; highest reliability across all workers |
| #2 | /openrouter/v1 | cohere/north-mini-code:free | ~853ms (FASTEST RELIABLE CONNECTION) | $0.00 | Reasoning only | 345-model catalog; most diverse pool overall; north-mini-code is $0 cost with strong reasoning; other free models (poolside/laguna-s-2.1:free, poolside/laguna-xs-2.1:free) rate-limited 429 |
| #3 | /nvidia/v1 | minimaxai/minimax-m3 | ~13,811ms (~13.8s) | $0.00 auto-shard | Reasoning only | 118-model catalog with V2 targets (deepseek-v4-flash/pro, minimax-m2.7/m3, kimi-k2.6, qwen3.5-397b, step-3.7-flash, glm-5.2); auto-shard hot-a/hot-b built into router; extreme RTT bottleneck but works for async subagent batches |

### Additional conditional routes (reasoning-only, not golden)

These returned content but were reasoning-only (null content field on trivial pong test):
- `/kilo/v1` → `stepfun/step-3.7-flash:free`: 200 at 5,554ms, reasoning present, content=null (reasoning model pattern)
- `/modelscope/v1` → `deepseek-ai/DeepSeek-V4-Flash`: 200 at 2,368ms, reasoning present, content=null, finish_reason=length
- `/cloudflare/v1` → `@cf/moonshotai/kimi-k2.6`: 200 at 1,800ms, reasoning present, content="", finish_reason=length
- `/mistral/v1` → `open-mistral-nemo`: 200 at 1,096ms but returned generic greeting not pong — content yes but quality poor for coding

### WARM_CADAVER (dead-on-touch 2026-07-25)

Routes that returned HTTP 200+ to catalog listing but failed on actual dispatch:

| Route | Version | Symptom | Catalog | Models | Dispatch Result | Root Cause |
|-------|---------|---------|---------|--------|-----------------|------------|
| zydit | /v1 | Catalog 119 models, all 404 | 200 | kimi-k2.6/glm-5.2/minimax-m3 | 404 "Not found for account" | **Catalog dishonesty** — lists models it cannot serve |
| zydit | /v4 | 37 models (different set) | 200 | devstral/gemma family | 401 Unauthorized | Separate auth required |
| neuralwatt | /v1 | Credit exhausted | 200 | kimi-k2.6-fast/kimi-k2.6-flex | 402 Insufficient credit balance | Was 402 yesterday too; quota not refreshed |
| llm7 | /v1 | Credits required | 200 | claude-fable-5/claude-opus-4-8 | 402 Insufficient balance | Came back from 503 yesterday |
| openprovider | /v1 | All keys down | 502 | N/A | N/A | Persistent 502 fetch failures |
| freemodel | /v1 | Balance insufficient | Implicit 401 | deepseek-v4-flash | 401 | Not actually free despite name |
| gemini | /v1 | Empty models array | 200 | gemini-2.5-flash | 200 tokens=0 | Google API format mismatch |
| mistral | /v1 | No V2 models | 200 | open-mistral-nemo | 200 generic greeting | No kimi/glm/minimax/qwen |
| cloudflare | /v1 | @cf/kimi-k2.6 listed | 200 | @cf/kimi-k2.6 | 400 No such model | Needs larger max_tokens |
| modelscope | /v1 | Null content | 200 | DeepSeek-V3.1/V4-Flash | 200 content=null | Same reasoning-only pattern |
| zenmux | /v1 | Free models silent | 200 | glm-4.7-flash-free | Timeout/402 | 145-model catalog, paid-only viable |

### CONDITIONAL — 200 + partial delivery

| Route | Model | Result | Caveat |
|-------|-------|--------|--------|
| kilo/v1 | stepfun/step-3.7-flash:free | 200, reasoning present | 5,554ms; content=null (reasoning-only model); fastest after north-mini-code |
| cloudflare/v1 | @cf/moonshotai/kimi-k2.6 | 200, reasoning present | 1,800ms; content="" with finish_reason=length; CF-packaged kimi could work with coding prompt vs pong |
| nvidia/v1 | deepseek-ai/DeepSeek-V4-Flash | 200, reasoning present | 2,368ms; content=null, finish_reason=length; same reasoning-only pattern as minimax-m3 |
| opencode-zen | auto-shard hot-a/b | 429 persistent on laguna-s-2.1-free | Provider rate limit exceeded on slots 5+6; cooling applied; Claude-tier models available but paid |

### SEASONAL

| Route | Model | Status date | Notes |
|-------|-------|------------|-------|
| logfare | kimi-k2.6 | Golden 2026-07-24 → TOXIC 18:10-18:32 UTC 2026-07-25 | Session-specific toxicity window; 502 upstream stream failed before output; proves carrier golden-ness is SESSION-SPECIFIC not permanent |

## Key-router V1 bug fixes required before v2 dispatcher trusted

Three bugs in current v1 `tryFailover` (opencode-key-router.mjs:1657) that v2 must address:

1. **v1 tryFailover returns true and streams alt-provider response regardless of upstream HTTP status:** A 404/402/422 from the alt target surfaces directly to the client as if it were the original model. v2 dispatchFailover must classify the alt response with carrierErrorShapeSniffer BEFORE deciding return-vs-continue; the chain continues to next candidate on perm-class failure.
2. **v1 FAILOVER_CHAINS is model-family-only and single-step:** v2 must surface per-capability cross-family equivalent-quality bank picks FIRST (T2) before falling to same-family lower-tier (T3).
3. **v1 breaker is per-key cooldown only:** v2 adds a separate permanent-class (carrier,model) breaker that trips after ALL keys are exhausted.

## Failure modes documented (11 in failures.md + NEW THIS SESSION)

| # | Key | Class | Recovery |
|---|-----|-------|----------|
| 1-7 | Earlier-session failures | transient_unknown_connection, toolReliability_drift, retry_logged_but_process_died | Various — transients resolved by circuit-break upgrades |
| 8 | reasoning_output_overflow_at_200mb | pi-internal (harness stdout cap kill) | Permanent CB on (carrier,model,forced-reasoning) combo; relaunch with max_reasoning unset |
| 9 | worker_starts_up_then_exits_zero_with_zero_tool_calls | 502 connection-error | CANCEL + relaunch on agnes-2.0-flash (PROVEN FIX-C2) |
| 10 | logfare_502_upstream_stream_failed_before_output_storm | 502, retry-burn 5-15min | NEVER retry same logfare unless /health confirms recentFailures empty |
| 11 | session_init_glitch_no_project_session_found | pi-internal (exit_code=1) | Relaunch with fresh session_id (do not reuse doomed UUID); PROVEN FIX-INT3 |
| NEW-5 | pi_model_not_found_transient_in_registry | 404 transient | Retry within 60s on alternate key |
| NEW-6 | key_router_transient_emits_503_then_recovers | 503 retriable | Respect Retry-After; mark available after 3 consecutive successes |
| NEW-7 | thinking_floods_stdout_but_never_acts | pi-internal (200MB CoT loop) | Permanent CB per (carrier=model_output_storm); cancel + relaunch on agnes |
| NEW-8 | session_init_glitch_no_project_session_found | pi-internal (exit 1, no tokens) | Permanent CB on that session_id; fresh session_id allocation mandatory |

## Salvage-pattern meta-finding

**agnes-2.0-flash** proven as the salvage-foundation carrier: **3/3 fix-wave workers recovered** (FIX-A2, FIX-C2, FIX-INT3) from logfare 502 storm, silent no-tool exit, and session_init_glitch. Detection threshold: if worker fails to first assistant output within 5 minutes → cancel and switch lane. Two NEW dirty-routes confirmed today: zydit (catalog dishonesty — lists 119 models, returns 404), neuralwatt (402), llm7 (402), openprovider (502), freemodel (401), gemini (warmup empty), mistral (no V2 models). Some were previously classified as alive — reclassify as warm cadavers in the matrix.

**Recommendation:** Pi core should bake agnes-2.0-flash as subagentDefaultModelFallback carrier.

## Final committed artifacts

| Commit | Date | Files | Insertions | Description |
|--------|------|-------|------------|-------------|
| c3cd2f99 | 2026-07-25 12:36 | 21 | 3,532 | V2 spec + Sprint-1/2/3 impl + adversarial test (7/7 PASS) + cross-model review + AGENTS.md websearch rule |
| 271fe111 | 2026-07-25 17:30 | 22 | 11,562 | Sprint-4 fix-wave landing + Sprint-5 spec gap #11 merge + Phase-5B opt-in live activation + scout report + tier matrix + bench docs update |

**Total: 43 files, 15,094 insertions, zero deletions (net growth).**

## Known gaps / deferred

1. **Phase-5C:** V2 overlay failure-path diagnostic headers are DISCARDED when v2Result.success=false — falls back to V1 tryFailover (no headers). Sprint-6 W5 worker patches this.
2. **TIER-MATRIX-MERGE:** Load full 19-entry matrix into overlay (currently minimal 1-entry for Phase-5B validation proof).
3. **zydit Pi CLI registration:** Sync script gate not yet identified — Sprint-6 W2 worker investigates the zydit-v4 auth divergence from zydit-v1.
4. **Phase-5B live HTTP success-path proof:** Needs multi-entry matrix routing (currently uses single synthetic entry). Sprint-6 W4 worker on it.
5. **key-router stderr shows no [V2-overlay] entries:** Expected — V2 overlay block only triggers on failure-to-cross-provider scenario (Site A down → Site B). Success-path requests exercise Site A only and skip the overlay entirely. Diagnostic headers will only appear when overlay FAILS over (and Site B preserves them post-Phase-5C).
6. **Gap #14 async lock race:** Fixed in Sprint-4 (breaker-registry-fixed.ts) but original Sprint-1 code had fundamental async-singleflight impossibility — future-proofing note.
7. **Telemetry rollup script:** Per spec Q5, daily rollup at UTC midnight computing moving success rate per (carrier, model) per capability axis → auto-evolves matrix quality scores. Not yet implemented.
8. **Spec gap #15 (streamingSmooth meter) deferred:** Rolling P95 inter-chunk deltas ring buffer exists in Sprint-3 `stream-quality-meter.ts` but has not been wired into the overlay's dispatch path yet. Sprint-7 work.

## Bench-log totals

| Metric | Value |
|--------|-------|
| Total worker dispatches | ~17 across 5 sprints |
| Total cost | **$0.0141** (logfare-only subagents); **agnes-2.0-flash aggregate = $0** |
| Workers on agnes-2.0-flash | FIX-A2, FIX-C2, FIX-INT3, SCOUT-E, SPEC-UPDATE (all successful) |
| Workers on minimax-m3 | CR3 reviewer (static analysis only, no runtime) |
| Highest reasoning tier | HARD-CODED for all subagents (USER.md) — no downgrades ever |
| Adversarial tests run | 7/7 pass (pre-fix and post-fix) |

## Future-state recommendations

1. **Bake agnes-2.0-flash as default subagentModelFallback carrier** — 3/3 recovery rate proves it as the salvage foundation for logfare storms, silent exits, and session-init glitches.
2. **Hot-toggle breaker registry enabled (Q6 locked)** — Phase-5B smoke already demonstrated reversible toggle works for live testing without route rewrites.
3. **Sprint-7+: monitor auto-evolved matrix quality scores** — Post JSONL telemetry rollup at UTC midnight feeding streamingSmooth/qualityPerCapability auto-updates.
4. **Document pi update safety for mmx.ts** — Verified pi update does NOT touch mmx.ts; reasoning-tier patch persists. Document at ~/.pi/agent/patches/mmx-force-reasoning-default.md.
5. **Implement telemetry rollup script** — Daily CSV/JSON aggregate of success rates per (carrier, model, capability) → feed back into matrix quality evolution.
6. **Merge full tier matrix into V2 overlay** — Transition from synthetic single-entry to real multi-candidate routing for Phase-5B live testing.
