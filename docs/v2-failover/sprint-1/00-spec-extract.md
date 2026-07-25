# Sprint-1 Spec Extract — V2 Failover Architecture

<!-- Sprint-1 delivers the foundational type system, dispatch skeleton, circuit-breaker registry, JSONL telemetry writer, and carrier-error sniffer scaffold for the V2 two-axis multi-carrier failover overlay. It covers matrix type declarations (RouterMatrixEntry, qualityPerCapability, contextWindowLimit, toolExecutionReliability, multiCarrierRouteIds), the dispatchFailover skeleton with contract headers, the two-realm breaker registry with atomic transitions, per-request JSONL telemetry, and the gap-#11 carrierErrorShapeSniffer scaffold with one matcher per known shape. -->

## 6 Sprint-1 File Deliverables

1. **`00-spec-extract.md`** — This file: consolidated spec references and carrier-shape library extracted from the locked v2 spec and the 2026-07-24 bench results.
2. **`types.ts`** — Matrix type declarations: `RouterMatrixEntry`, `qualityPerCapability`, `contextWindowLimit`, `toolExecutionReliability`, and `multiCarrierRouteIds`.
3. **`headers.ts`** — Contract response-header constants: `X-Router-Failover-Applied`, `X-Router-Diagnostic`, `X-Router-Force-Model`, `X-Router-Allow-Degraded-Variants`, `X-Router-Capability-Unsatisfied`.
4. **`breaker-registry.ts`** — Two-realm circuit-breaker registry (`CircuitBreaker.perKey` + `CircuitBreaker.perCarrierModel`) with atomic mutex transitions.
5. **`telemetry-jsonl.ts`** — JSONL telemetry writer appending to `~/.pi/agent/telemetry/router-requests.jsonl` per dispatch.
6. **`carrier-error-sniffer.ts`** — `carrierErrorShapeSniffer` scaffold mapping raw carrier responses to status classes, seeded with the 7 gap-#11 shapes.

### Spec line citations

- **`types.ts`**
  - `170`: `matrix type declarations (RouterMatrixEntry, qualityPerCapability, contextWindowLimit, toolExecutionReliability, multiCarrierRouteIds)`
  - `39`: `qualityPerCapability: {vision, toolUse, code, json, longContext, streamingSafe}`
  - `41`: `toolExecutionReliability capability axis`
  - `69`: `contextWindowLimit (input tokens admissible)`
  - `18`: `matrix records multiCarrierRouteIds: the routes that all serve the SAME upstream model`

- **`headers.ts`**
  - `170`: `contract headers (X-Router-Failover-Applied, X-Router-Diagnostic, X-Router-Force-Model, X-Router-Allow-Degraded-Variants, X-Router-Capability-Unsatisfied)`
  - `11`: `X-Router-Capability-Unsatisfied: true + 422-style narrative`
  - `63`: `X-Router-Force-Model: original disables vertical descent entirely`
  - `71`: `X-Router-Diagnostic: <URL-encoded JSON> summarizing attempted chain`
  - `152`: `X-Router-Allow-Degraded-Variants: true header`

- **`breaker-registry.ts`**
  - `170`: `circuit-breaker two-realm registry (CircuitBreaker.perKey + CircuitBreaker.perCarrierModel) with atomic mutex (#14)`
  - `47`: `#7 two-realm circuit breaker: Per-key cooldown for transient ... Per-(carrier,model) breaker for permanent`

- **`telemetry-jsonl.ts`**
  - `170`: `JSONL telemetry writer to ~/.pi/agent/telemetry/router-requests.jsonl`
  - `52`: `#10 JSONL telemetry: Every dispatch appends one line to ... router-requests.jsonl`

- **`carrier-error-sniffer.ts`**
  - `170`: `carrierErrorShapeSniffer scaffold with one matcher per known shape`
  - `79`: `v2 dispatchFailover must classify the alt response with carrierErrorShapeSniffer BEFORE deciding to return-vs-continue`
  - `100`: `classification = carrierErrorShapeSniffer(resp) // gap #11`

## 7 confirmed gap-#11 carrier-shape classes

From `tmp/kimi-nvidia-bench-2026-07-24.md` Round 3:

1. **`transient_unknown_connection`** — Bare transport-layer outage (`Connection error.`, `willRetry:true`); triggers per-key cooldown (gap #7 realm A transient).
2. **`permanent_unknown_id`** — Registry gap: upstream returns `404` with empty body or `"Unknown router path"` / `"Invalid model id"`; route-level breaker trips permanently after all keys exhausted (gap #7 realm B).
3. **`permanent_no_payment_method`** — Billing gate: upstream returns `401` with `CreditsError` + payment-method enrollment URL; permanent-class breaker.
4. **`permanent_credit_balance_exhausted`** — Credits depleted: upstream returns `402` with `balance` negative and buy-credits URL; permanent-class breaker.
5. **`transient_upstream_stream_failed_before_output`** — Upstream stream terminates before first byte (`502`, `willRetry:true`); per-key cooldown, NOT permanent (may recover on retry).
6. **`permanent_404_unavailable_for_free_with_paid_redirect`** — OpenRouter auto-downgrades to `:free`, returns `404` with a body containing a recovery slug hint (`use this slug instead: ...`); sniffer should extract the slug for horizontal hop rather than tier descent.
7. **`dispatcher_unsupported_model_prefix`** — Client-side dispatcher refusal before carrier contact (`Unsupported external subagent model '...'`); surfaced upstream as a unified classifier even though it originates client-side.

## 5 X-Router-* response headers

Contract headers emitted on every outgoing `dispatchFailover` response:

1. **`X-Router-Failover-Applied`** — Boolean (`true` when the delivered response came from a candidate other than T0 primary).
2. **`X-Router-Diagnostic`** — URL-encoded JSON array of attempted chain entries (`route_id`, `model_id`, `status_class`, `latencyMs`, `error_class`) plus `selected_index` if any.
3. **`X-Router-Force-Model`** — Echoes back the incoming `X-Router-Force-Model` value (e.g. `original`) when vertical descent is suppressed.
4. **`X-Router-Allow-Degraded-Variants`** — Echoes back the incoming opt-in header value; default downstream behavior skips `-short`/`-flex`/`-fast`/`-mini`/`-tiny` suffixes.
5. **`X-Router-Capability-Unsatisfied`** — Set to `true` (or a capability-specific token such as `context-window`) when no candidate in the chain satisfies the requested capability axis, yielding a final 422-style narrative.
