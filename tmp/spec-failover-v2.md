# Failover v2 Spec — Two-Axis Multi-Carrier Overlay

Author: main lane (2026-07-24)
Status: **DRAFT — pending user gap-inclusion confirmation** (`Open questions` at end)
Source citations are file:line — currently cite the v1 patch landscape. v2 implementation may re-locate them; this spec is the contract.

## Goals (R1–R6)
- **R1 — Honor requested model ID**: dispatcher's `requested_model` is tier-0 implicit. Failover candidates are *<= capability*, NEVER a stronger model. Original-model-attempt is always first.
- **R2 — Passive re-elevation**: harness retry-loop keeps re-asking the original `requested_model` ID on the same route; the matrix naturally re-finds capacity when it re-opens. No active "circuit-healer promote-up" needs in v2.
- **R3 — Quality bands are cross-family not within-family, scoped per-capability**: descent ranks on the *requested* capability axis. `gap(glm-5.2→kimi-k2.7-code)` may be SMALLER than `gap(glm-5.2→glm-5.1)` — so descent may step to an equivalent-quality model from a different family BEFORE stepping down to a same-family lower-tier model.
- **R4 — Capability gating**: vision requests failover ONLY to vision-capable candidates; toolUse requests → toolUse-capable candidates only. Unmatched permanent → respond with `X-Router-Capability-Unsatisfied: true` + 422-style narrative; do NOT silently degrade capability.
- **R5 — Circuit breaker for perf only**: skip broken `(carrier,model)` combos to reduce latency; the breaker is NOT a trigger for cross-tier promotion. Cross-tier promotion is governed by the perpendicular-axes descent below.
- **R6 — No mid-stream recovery**: a stream that has started (first byte received) either succeeds or terminates with diagnostic. On-Atlantic carrier-swap of an in-flight stream is deferred to v3.

## Two-axis overlay

### Horizontal axis — same model id, different carrier routes
For each (model_id), the matrix records `multiCarrierRouteIds`: the routes that all serve the SAME upstream model. For laguna-s-2.1:free, that pool is confirmed today as:
- `router-kilo/poolside/laguna-s-2.1:free` (alive 21:23 UTC, 200 in 1997ms; 429 by 21:59 UTC → Poolside bucket exhausted, 1–2h cadence)
- `router-opencode-zen/laguna-s-2.1-free` (re-alerts; 429 today per bench 21:23 UTC; per prior 2026-07-24 session was the only route that escaped Poolside cap — needs re-bench after UTC midnight)
- `router-openrouter/poolside/laguna-s-2.1:free` (auto-suffix appended by openrouter; 429 today)

For laguna-xs-2.1 (paid-pricing on free NIM lanes):
- `router-nvidia/poolside/laguna-xs-2.1` (200 in 969ms — alive, free NIM) ← golden fallback when Poolside free is locked
- `router-zydit/poolside/laguna-xs-2.1` (200 in 920ms — alive)
- `router-openrouter/poolside/laguna-xs-2.1:free` (200 in 3444ms) — alive
- `router-kilo/poolside/laguna-xs-2.1:free` (200 in 3037ms) — alive

### Vertical axis — tier ladder per-capability descent
Tier ordering:
- **T0**: the original `requested_model` — always tried first, never skipped
- **T1**: same `requested_model` on every other `multiCarrierRouteIds[model_id]` — horizontal retries inside family
- **T2**: cross-family equivalent-quality model ids within the same capability band (per `qualityPerCapability[requested_axis]`)
- **T3**: drop one band (per `requested_axis`) — within-the-family lower-tier if a same-family horizontal alternate with equivalent quality is unavailable
- **T4**: drop two bands (worst-case upper boundary; configurable via maxVerticalDescent header)

## Gaps to BAKE in (passed R1-R6 + selection rubric above)

- **#1 per-capability quality sub-scores**: BAKE. Matrix entries grow from `qualityScore:number` to `qualityPerCapability: {vision, toolUse, code, json, longContext, streamingSafe}`. Descent ranks on the requested capability axis only. (Initial seed from public-model family tier-1 docs; bootstrap by telemetry rollup λ.)

- **#3 `toolExecutionReliability` capability axis**: BAKE — first-class axis. The over-thinking-no-finalize failure mode is **not** rare: confirmed today 2026-07-24 on glm-5.2 (48MB stdout, 600s, no write) AND poolside/laguna-s-2.1:free (185MB thinking, 13K events, died at 200MB stdout before artifact finalize). For file-write subagent tasks, `toolReliability:high` filter (e.g. proven: agnes-2.0-flash, minimax-m3, kilo/stepfun/step-3.7-flash:free).

- **#5 per-key concurrency preemption**: BAKE. Per key, track in-flight count; if a route has multiple keys, the dispatcher acquires the one with capacity. `perKeyConcurrencyCap: 3` default.

- **#6 firstByteTimeoutMs: 5000**: BAKE per candidate. Slow-start stalls are pre-first-byte, in scope for v2.

- **#7 two-realm circuit breaker**: BAKE.
  - **Per-key cooldown** for transient (429 / 502 / 503 / 504) — single key's breaker triggers independently.
  - **Per-`(carrier,model)` breaker** for permanent (404 / 422 / 402 / `garbage`/credit-exhausted) — trips ONLY after **ALL** keys for that (carrier,model) report permanent-class failure.
  - Each breaker realm tracks its own TTL + retained last-cause.

- **#10 JSONL telemetry**: BAKE. Every dispatch appends one line to `~/.pi/agent/telemetry/router-requests.jsonl`: `{ts, requested_model, requested_capability_axis, attempted_chains:[{route_id, model_id, status_class, latencyMs, tokensIn, tokensOut, error_class, error_shape_sample}], final_status_override}`. Daily rollup script computes moving success rate per `(carrier, model)` per capability axis → auto-evolves matrix quality scores.

- **#11 Carrier error-shape sniffing**: BAKE. Per-route shape parser maps raw carrier body to status_class:
  - kilo beta-class return: `{"title":"Paid Model - Credits Required","message":"Add credits to continue, or switch to a free model","balance":-0.00003,"buyCreditsUrl":"..."}` → buckets-class: `permanent_credit_balance_exhausted`
  - openrouter: `{"message":"Insufficient credits...","code":402}` → `permanent_insufficient_credits`
  - neuralwatt: `{"message":"Insufficient credit balance...","type":"insufficient_credits","code":"credit_balance_exhausted"}` → `permanent_credit_balance_exhausted`
  - poolside:free: `{"message":"Provider returned error","code":429,"metadata":{"raw":"poolside/laguna-s-2.1:free is temporarily rate-limited upstream. Please retry shortly, or add your own key to accumulate your rate limits...","provider_name":"Poolside","is_byok":false}}` → `transient_upstream_rate_limit` (per-key cooldown, not permanent)
  - unlistable-id 404 ("Unknown router path", "Invalid model id: ...", "Model not found for provider router-nvidia") → `permanent_unknown_id` (route-level breaker; not even attempted until matrix deprecated)

### Carrier error-shape sniffing — extended shapes (gap #11 discriminator extension)

- **Shape #5 — pi_model_not_found_transient_in_registry**: Pi CLI model registry churns async mid-session; a route-model id that resolved at dispatch t=0 can 404 on mid-flight. Failure HTTP class: 404 transient Recovery: transient retryable within 60s (try alternate key on same carrier or route to next model_id on T1 ladder). Sniff pattern: response body contains "Model not found" OR "404 NOT_FOUND" AND prior dispatch of SAME model_id succeeded earlier in session. Source: failure entry key=pi_model_not_found_transient_in_registry (noted 2026-07-25; failures.md cross-referenced from worker_starts_up_then_exits_zero_with_zero_tool_calls diff note).
- **Shape #6 — key_router_transient_emits_503_then_recovers**: key router emits 503 with `retry-after: 30` then fully recovers within minutes; needs stats retriable to distinguish from contiguous outage. Failure HTTP class: 503 Recovery: transient retryable within 60s (respect Retry-After header; if recovery observed >3 consecutive retries then mark route as available). Sniff pattern: response body contains `"error":"Service Unavailable"` or HTTP header `Retry-After:` present AND status=503; subsequent requests to SAME route return 200 within N seconds (N < 300). Source: failure entry key=key_router_transient_emits_503_then_recovers (observed 2026-07-25 during logfare session toxicity window).
- **Shape #7 — reasoning_output_overflow_at_200mb**: forced max-reasoning causes model to dump a 200MB CoT tail; harness stdout cap truncates and worker aborts (402-class exit, per kill threshold). Confirmed in nvidia/laguna-xs-2.1 with long-prompts + forced reasoning (subagent workers at 200MB stdout cap, see failures.md lines 1300-1306). Failure HTTP class: pi-internal (harness cap kill) Recovery: permanent circuit-break for the (carrier,model,forced-reasoning) combo; relaunch with `max_reasoning_tokens` unset or lower. Sniff pattern: worker exit_code !== 0 AND stderr/stdout contains `200MB` OR `stdout cap` OR `KILLED_248` (SIGKILL from cap hit) OR metadata shows `reasoning_bytes` > 100MB with `toolCalls===[]`. Source: failure entry key=reasoning_output_overflow_at_200mb, failures.md stamp=2026-07-14 (lines 1300-1306 discuss 200MB stdout cap kills of reasoning output).
- **Shape #8 — thinking_floods_stdout_but_never_acts**: solo kimi-k2.6 (logfare) with a multi-KB prompt enters a never-acting 200MB-CoT loop. Concurrent dispatch (3+ workers each pending separately) throttles this naturally. DIFFERENT from worker_starts_up_then_exits_zero_with_zero_tool_calls (which had zero output at all); this one emits massive CoT but never fires tool calls. Failure HTTP class: pi-internal Recovery: permanent circuit-break per (carrier=model_output_storm); cancel worker + relaunch on agnes-2.0-flash. Sniff pattern: worker.output_state === 'logs_only' AND stdout.log size > 50MB AND toolCalls === [] AND elapsed > 300s. Source: failure entry key=thinking_floods_stdout_but_never_acts, failures.md stamp=2026-07-25 (referenced as discriminator in worker_starts_up entry, line 1637).
- **Shape #9 — worker_starts_up_then_exits_zero_with_zero_tool_calls**: worker exits cleanly (exit_code=0, stopReason='stop', willRetry=false) but with toolResults=[] and ~21K input tokens consumed. stderr logs `502 "Upstream stream failed before output" Connection error.` but Pi retries and each returns same 502 → process completes via stop reason with NO assistant pipeline forged. DIFFERENT from thinking_floods_stdout_but_never_acts (which had 200MB CoT but never tool-called). FAILS: recovery via CANCEL + relaunch on agnes-2.0-flash (PROVEN in FIX-C2). Failure HTTP class: 502 connection-error Recovery: transient retryable within 60s (but ONLY if on different carrier; same logfare retries burn 5-15min). Sniff pattern: worker.exit_code === 0 AND worker.toolCalls === [] AND worker.output_state === 'logs_only' AND stderr contains `'502'` AND usage.inputTokens > 5000. Source: failure entry key=worker_starts_up_then_exits_zero_with_zero_tool_calls_no_assistant_output, failures.md stamp=2026-07-25, line 1637.
- **Shape #10 — logfare_502_upstream_stream_failed_before_output_storm**: logfare upstream returns HTTP 502 "Upstream stream failed before output" before any token output → Pi enters retry loop maxAttempts=10 with delayMs scaling 4s→8s→16s→32s→60s→... (each retry returns same 502). Burns ~5-15 min wall clock + 0 artifact landfall. Logfare was golden yesterday but toxic today — proves carrier golden-ness is SESSION-SPECIFIC. Action: CANCEL + relaunch on agnes-2.0-flash (NEVER retry on same logfare unless /health curl shows recentFailures empty). Failure HTTP class: 502 Recovery: transient retryable ONLY if carrier health confirmed via /health check with recentFailures empty; otherwise permanent break from that carrier. Sniff pattern: stderr contains `"Upstream stream failed before output"` OR agent_end message contains `502`; or worker.error field contains `Connection error` + `502`. Source: failure entry key=logfare_502_upstream_stream_failed_before_output_storm, failures.md stamp=2026-07-25, line 1639.
- **Shape #11 — session_init_glitch_no_project_session_found**: worker fails with exit_code=1, stderr shows `Warning: No project session found with id "<uuid>"; creating a new session with that id.` then process directly exits 1 with zero tool calls + zero assistant_output. This is a pi-cli session creation race condition — NOT a carrier error. DIFFERENT from worker_starts_up... (exits 0 silent); this returns HARD failure. SALVAGE: RELAUNCH with same prompt_path on agnes-2.0-flash using brand-new session_id (don't reuse doomed pre-allocated one). VERIFIED by FIX-INT3 producing 45KB v2 file cleanly post-fix. Failure HTTP class: pi-internal (exit_code=1, no carrier error) Recovery: permanent circuit-break on that session_id only; relaunch MUST allocate fresh session_id (do not reuse doomed UUID). Sniff pattern: worker.exit_code === 1 AND worker.stderr contains `No project session found` AND no assistant tokens emitted. Source: failure entry key=session_init_glitch_no_project_session_found, failures.md stamp=2026-07-25, line 1649.

## Salvage patterns learned (2026-07-25)

Agnes-2.0-flash established as the salvage-foundation carrier: 3/3 fix-wave recovery rate (FIX-C2 + FIX-A2 + FIX-INT3) proves rerouting to agnes on logfare storm, silent no-tool exit, and session_init_glitch consistently recovers. Detection threshold: if worker fails to first assistant output within 5 minutes, cancel and switch lane (cancellation + relaunch on agnes). Two NEW dirty-routes confirmed 2026-07-25: zydit (catalog dishonesty — lists 119 models it cannot dispatch, yielding 404 on dispatch), neuralwatt (402), llm7 (402), openprovider (502), freemodel (401), gemini (warmup empty), mistral (no V2 models). Some were previously classified as "alive" — reclassify as "warm cadavers" in the matrix.

- **#12 Degraded variant opt-in**: BAKE. Suffixes `[-short, -flex, -fast, -mini, -tiny]` are quantized/degraded variants, NOT equivalent. `allowDegradedVariants:false` (default) — descent skips degraded variants entirely; opt-in via caller header.

- **#13 Force-pin header**: BAKE. `X-Router-Force-Model: original` disables vertical descent entirely (T0 + T1 only). Useful for tests that want to assert a specific model is جامد unreachable rather than degraded.

- **#14 Breaker atomicity**: BAKE. Breaker state transitions are mutex-locked single-flight. Test harness must assert no race where two dispatches both flip the breaker on the same `(carrier,model)` key simultaneously.

## Additional gaps to BAKE in (user "pull all those gaps" 2026-07-24)

- **#4 context-window budget**: BAKE. Per-(carrier, model) matrix entry gains `contextWindowLimit` (input tokens admissible). Request side carries estimated `contextSize` (sum of input tokens + declared `max_tokens`). If `req.contextSize > matrix[(model, route)].contextWindowLimit`, dispatcher SKIPS the candidate horizontally (next route within same `model_id` T1) OR falls vertical (T2/T3) without attempting upstream. Telemetry records `gap_skip: "context_exceeds_model"` when this filter fires. Vertical descent must eventually land on a candidate with sufficient `contextWindowLimit` OR fail with `X-Router-Capability-Unsatisfied: context-window` + HTTP 422 narrative.

- **#8 X-Router-Diagnostic header**: BAKE. On every `dispatchFailover` response (success or final-narrative failure) attach `X-Router-Diagnostic: <URL-encoded JSON>` summarizing attempted chain: `[{route_id, model_id, status_class, latencyMs, error_class}, ...]` plus `selected_index` if any. Header doubles as debug aid for client AND consumes-side Raft for JSONL: same shape reused as the JSONL row's `attempted_chains`. Implement via `appendHeader()` (writes happen pre-stream-flush; no in-flight onto-stream swap).

- **#9 carrier affinity**: BAKE. In-memory `keyAffinityMap: Map<route_id × model_id → [key_id preference list]>`. Each successful 200 promotes the used key to the head; transient failure moves the key to the tail + brief cool-down equivalent to the per-key cooldown (gap #7 realm A) — they SHARED the same TTL bookkeeping via a single `KeyCooldownRegistry`. Affinity reduces per-key rate-limit churn when one key has more capacity for that model. Affinity preference affects ONLY key-priority ordering; it MUST NOT skip fresh-key acquisition — if a known-affine key is circuit-broken, dispatcher falls back to ANY non-exhausted key without preference. Non-owning preference; never outweighs per-key cooldown TTL.

- **#15 numeric "smooth stream" definition**: BAKE. `streamingSmooth: boolean` per telemetry event with CONCRETE threshold: rolling window of last 64 inter-chunk deltas in milliseconds; if `interChunkDelta_P95_ms > 250ms` AND `lastChunkLatency_ms > 1500ms` ⇒ `streamingSmooth=false`. Each chunk event triggers `StreamQualityMeter.observe(timestampMs)` which is cheap (rolling buffer ring). Telemetry JSONL line carries `streamingSmoothMs` field name AND inferred P95. Used by circuit breaker performance tier: a route returning `streamingSmooth=false` over ≥5 consecutive dispatches earns `performance_degradation` flag which feeds the `streamingSafe` axis of `qualityPerCapability` (auto-evolving).

## V1 bug fix list (mandatory, before v2 dispatcher can be trusted)

1. `tryFailover` (current at opencode-key-router.mjs:1657) returns `true` and streams an alt-provider response regardless of upstream HTTP status: a 404/402/422 from the alt target surfaces directly to the client as if it were the original model. v2 `dispatchFailover` must classify the alt response with `carrierErrorShapeSniffer` BEFORE deciding to return-vs-continue; the chain continues to the next candidate on perm-class failure.
2. v1 `FAILOVER_CHAINS` is model-family-only and single-step; v2 must surface per-capability cross-family equivalent-quality bank picks FIRST (T2) before falling to same-family lower-tier (T3).
3. v1 breaker is per-key cooldown only; v2 adds a separate permanent-class (carrier,model) breaker that trips after all keys are exhausted.

## Implementation outline (v2 `dispatchFailover`)

```text
fn dispatchFailover(req):
  m_id        = req.requested_model         // honoring R1; bare id per request
  cap_axis    = req.router_capability_axis  // vision|toolUse|code|json|longContext|streamingSafe; default toolUse
  force_pin   = req.headers["x-router-force-model"] == "original"
  allow_dv    = req.headers["x-router-allow-degraded-variants"]  // default false

  chain = composeDescentChain(m_id, cap_axis, force_pin, allow_dv)
  attempted = []
  for candidate in chain:
    breaker_state = breakerRegistry.lookup(candidate.route_id, candidate.model_id, req.key_id_if_known)
    if breaker_state.isPermanentDead: continue        // skip per gap #14 atomic
    if not hasAvailableKey(candidate.route_id, req): continue
    key = acquireKey(candidate.route_id, cap=perKeyConcurrencyCap)   // gap #5
    resp = postToUpstream(candidate, key, firstByteTimeoutMs=5000)   // gap #6
    classification = carrierErrorShapeSniffer(resp)                  // gap #11
    attempted.push({candidate, status:resp.status, shape:classification})
    appendTelemetryEntry(req, attempted)                            // gap #10
    if classification.isOk:
      return resp.withHeader("x-router-failover-applied", attempted.length>1)
    if classification.transient:
      breakerRegistry.tripKey(key, cooldown_for_classification)      // gap #7 realm A
      continue
    if classification.permanent:
      breakerRegistry.markPermAttempt(candidate.route_id, candidate.model_id, key) // gap #7 realm B (atomic; only trips when ALL keys exhausted)
      continue
  // chain exhausted
  respondWithFinalNarrative(attempted, force_pin)  // returns 429 (transient pool-class) or 503 (perm exhausted or cap-unsatisfied)
```

`composeDescentChain(m_id, cap_axis, force_pin, allow_dv)`:
- T0: [(m_id, primary_route)]
- T1: for r in matrix.multiCarrierRouteIds(m_id): push (m_id, r) skipping the primary route
- if force_pin: return T0+T1
- T2: for cross_family_m_id in matrix.equivalentQualityBank(m_id, cap_axis):
  - for r in matrix.multiCarrierRouteIds(cross_family_m_id):
    - push (cross_family_m_id, r)
- T3: one band drop per `cap_axis`; degrade by descending `qualityPerCapability[cap_axis]` value within the cross-family equivalent quality matrix
- T4: same logic as T3, second band drop (bounded if caller pins via `X-Router-Max-Vertical-Descent`)
- After constructing all tiers, apply `allowDegradedVariants` filtering (gap #12) and capability gating (R4) before returning.

## Test plan

### Phase 4 — adversarial test harness
A mock HTTP server implementing all the error shapes cited above keyed by `(carrier, model)` → assert:
- **Vertical veil**: `X-Router-Force-Model: original` request on `glm-5.2` never returns content from any other model_id (T0+T1 only); without the header, it may step down to glm-5.1 or a cross-family equivalent.
- **Capability veil**: a `vision:true` request on a route whose primary model is vision-capable does NOT silently leak to a non-vision fallback candidate.
- **Two-realm breaker — transient**: replicate 429 on one key → that key cooldowns independently; other keys for the same (carrier,model) stay usable within the cooldown window.
- **Two-realm breaker — permanent**: all keys for `(carrier, model)` returning 402 / 404 / 422 trips the breaker; subsequent requests to that `(carrier, model)` short-circuit before reaching the upstream.
- **First-byte veil**: programmatic delay >5000ms before any byte → failover starts horizontal; telemetry records the stall.
- **JSONL on disk**: every dispatch appends a line; daily rollup file is updated by a separate script.
- **IV atomicity gap #14**: concurrent dispatch with the same primary broken simultaneously should produce exactly one breaker test transition, never two.

### Phase 4 — cross-model review
Hand off the v2 `dispatchFailover` diff (with v1 tryFailover comparison) to a SECOND model family for review: `minimax-m3` is the allowed paid exception. Alternative reviewer candidate: `modelscope/Qwen3-235B-A22B-Thinking-2507` via bench+subagent viewer. NOT glm-5.2 / poolside/laguna-s-2.1 — both are the unreliable-tool-finalize models this spec deprioritizes.

### Phase 5 — end-to-end live smoke
1. Cripple our primary model's primary route at the key-router by hot-toggling its breaker registry entry to "trip_perm".
2. Launch a real subagent via `external_subagent_start` with `requested_model` set to that crippled primary model.
3. Observer: subagent PID, first_output_at, attempted_models array (must show ≥2 model ids — prove descent actually happened).
4. Pass: worker produced an artifact (file, tool call, or terminal text) within 30 min; the FINAL model in `attempted_models` is the carrier that's healthy.
5. With `X-Router-Force-Model: original`: expect subagent now exits cleanly only because the perturbed route recovers, OR receives an aggregate 4/5xx — we measure the recovery.

## Locked decisions (user "pull all those gaps" + accepted all RECOMMENDs; 2026-07-24)

- **Q1 → 3 axes**: `qualityPerCapability` carries `{vision, toolUse, code}`. `longContext` and `streamingSafe` are AUTO-DERIVED from metadata tags (gap #15 StreamQualityMeter drives `streamingSafe`; gap #4 context-window filter feeds `longContext` derivation).
- **Q2 → `perKeyConcurrencyCap = 3`**.
- **Q3 → `allowDegradedVariants: false` default; opt-in via `X-Router-Allow-Degraded-Variants: true` header**.
- **Q4 → Force-pin header literal: `X-Router-Force-Model: original`**.
- **Q5 → JSONL telemetry daily rollup at UTC midnight → `~/.pi/agent/telemetry/router-requests.rollup.YYYY-MM-DD.json`**.
- **Q6 → Phase 5 live smoke uses hot-toggle of breaker registry entry to flip a route's status (reversible, no route rewrite)**.
- **ALL 4 previously-deferred gaps pulled in (#4, #8, #9, #15)** — see "Additional gaps to BAKE in" section.

## Clock sync to ambient state
- Poolside rate-limit today (2026-07-24) is hitting the gap window NOW per failures.md note 7. UTC-midnight tonight should reset; re-bench laguna-s-2.1 doable then.
- The dispatcher `external_subagent_start with mcp_profile:"none"` Layer-3 wedge bypass is proven for read-only / banded-write tasks; can be used to minimize the live-smoke subagent's bootstrap cost in Phase 5.
- The benchmark-measurement loop already validated: 5 ocw attempts today that hit the 600s cap were the dispatcher (us) passing `timeout_seconds:600` explicitly — NOT source default. v2 doesn't need to fix this — the spec REQUIRES dispatchers to omit `timeout_seconds` so 1800 default applies, OR pass `1800` explicitly. Memory `ext-subagent-600s-default` corrected + saved.

---

## Next-step order (LOCKED; spec finalized 2026-07-24)

1. ✅ Spec polished per user picks (this revision): all 4 previously-deferred gaps pulled in; all 6 Q's locked with RECOMMENDs.
2. **Dispatch builder worker (NOT glm-5.2 — toolReliability LOW; NOT laguna-s-2.1 — same trait on Poolside lane)** using proven-executor models from `failures.md` note 2: **PRIORITY-1**: `router-agnes-2.0-flash` (FREE, proven Phase B bugsweep executor 2026-07-24). **PRIORITY-2** (paid exception, for the largest build moments): `minimax-m3`.
  Implementation sprints (each ≤1800 s wall-clock per time-budget mastery rule):
  - **Sprint 1**: matrix type declarations (`RouterMatrixEntry`, `qualityPerCapability`, `contextWindowLimit`, `toolExecutionReliability`, `multiCarrierRouteIds`); `dispatchFailover` skeleton returning the contract headers (`X-Router-Failover-Applied`, `X-Router-Diagnostic`, `X-Router-Force-Model`, `X-Router-Allow-Degraded-Variants`, `X-Router-Capability-Unsatisfied`); circuit-breaker two-realm registry (`CircuitBreaker.perKey` + `CircuitBreaker.perCarrierModel`) with atomic mutex (#14); JSONL telemetry writer to `~/.pi/agent/telemetry/router-requests.jsonl`; `carrierErrorShapeSniffer` scaffold with one matcher per known shape.
  - **Sprint 2**: full descent logic (`composeDescentChain`), per-key acquisition with concurrency cap (#5), `firstByteTimeoutMs` (gap #6), capability gating (R4), degraded-variant filter (#12), force-pin (#13), breaker atomicity (#14), context-window filter (#4).
  - **Sprint 3**: complete `carrierErrorShapeSniffer` matchers for kilo/openrouter/neuralwatt/poolside; key affinity map (#9); `X-Router-Diagnostic` URL-encoded JSON body (#8); `StreamQualityMeter` rolling P95 (#15); JSONL `, rollup script + matrix auto-evolve from rollup.
3. Phase 4 adversarial test harness — mock HTTP server with programmatic per-(carrier, model) response shapes pivoted off the gap-#11 inspector: 200 stub + 401/402/403/404/422/429/500/502/503/504 each agent-shaped.
4. Cross-model review dispatched to a DIFFERENT model family (per multi-angle verification rule): `minimax-m3` (paid exception) OR `router-modelscope/Qwen3-235B-A22B-Thinking-2507`. NOT glm-5.2/laguna-s-2.1 (toolReliability LOW for spec review).
5. Phase 5 live end-to-end smoke — hot-toggle `breakerRegistry.perCarrierModel` to cripple primary; `external_subagent_start` with and WITHOUT `X-Router-Force-Model: original`; observe `attempted_models[]` array (≥2 model_ids ⇒ descent fired).
6. **EVERY worker dispatch logged** to `tmp/v2-impl-bench-log.md` with: timestamp, worker_id, model id, route, status, exit_code, tool_calls, latencyMs, tokensIN, tokensOUT, reasoning, cost, fail_mode (or success_note). Per-repo rule in AGENTS.md §"Pi Harness Notes".
7. Commit (key-router outside-repo file + bench artifacts + spec + `docs/subagent-model-benchmarks.md` updates onto a clean branch).
