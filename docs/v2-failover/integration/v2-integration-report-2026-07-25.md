# V2 Failover Overlay — Integration Report

## 1. Compilation Approach

**Option B (co-bundle into single self-contained `.mjs`).**

The Sprint-1/2/3 TypeScript scaffold has cross-imports that are difficult to resolve with separate bun builds (types.ts is imported by breaker, sniffer, and headers; carrier-sniffer imports headers; per-key-acquire uses shared breaker state). Rather than wrestling with module resolution across multiple partial builds, all five sprint source files were hand-translated into a single monolithic JavaScript module. This avoids import-graph fragmentation and guarantees the file is a standalone ES module that Node.js 24+ or Bun can load directly.

### Source → Module mapping

| Sprint | TS File                       | JS Section (approx lines)                                                                           |
| ------ | ----------------------------- | --------------------------------------------------------------------------------------------------- |
| 1      | types.ts                      | Constants & JSDoc annotations (~55 lines)                                                           |
| 1      | headers.ts                    | urlEncodeJson, buildDiagnosticHeader, applyResponseHeaders, classifyStatusClass (~75 lines)         |
| 1      | breaker-registry.ts           | CircuitBreaker class + singleton (~80 lines)                                                        |
| 1      | carrier-error-sniffer.ts      | carrierErrorShapeSniffer with 7 matchers (~95 lines)                                                |
| 1      | telemetry-jsonl.ts            | writeTelemetryLine + DaySummary rollup helpers (~50 lines)                                          |
| 2      | barrier-filter.ts             | parseForceModelValue, isAllowingDegradedVariants, filterDegradedVariants, applyForcePin (~60 lines) |
| 2      | capability-gate.ts            | hasCapabilityForAxis, filterByCapability, buildCapabilityUnsatisfiedHeader (~70 lines)              |
| 2      | descent-ladder.ts             | composeDescentChain with T0-T4 tier builders (~140 lines)                                           |
| 2      | first-byte-timeout.ts         | postWithFirstByteTimeout (~45 lines)                                                                |
| 2      | per-key-acquire.ts            | acquireKey/releaseKey/keySlotAcquire with mutex (~80 lines)                                         |
| 3      | key-affinity-map.ts           | KeyAffinityMap + InMemoryKeyCooldownRegistry (~110 lines)                                           |
| 3      | stream-quality-meter.ts       | StreamQualityMeter with P95 ring buffer (~100 lines)                                                |
| 3      | carrier-matchers-extended.ts  | sniffCarrierErrorExtended for kilo/openrouter/neuralwatt/poolside (~70 lines)                       |
| 3      | x-router-diagnostic-header.ts | buildDiagnosticHeader (JSON payload with selected_index), appendHeader (~50 lines)                  |

**Total: ~1,055 lines, ~45 KB.**

---

## 2. Module Exports

Three named exports from the ES module:

| Export                                | Type             | Purpose                                                                |
| ------------------------------------- | ---------------- | ---------------------------------------------------------------------- |
| `v2FailoverDispatch(req, ctx)`        | `async function` | Main dispatch handler — the entry point for Phase 5B wiring            |
| `createV2Overlay(opts)`               | `function`       | Factory — creates `{ dispatch(reqCtx) }` with pre-bound runtime config |
| `keySlotAcquire(carrierKey, routeId)` | `async function` | Concurrency-guarded key slot acquisition (used externally if needed)   |

### `v2FailoverDispatch` signature

```javascript
/**
 * @param {{ headers: Headers, body: Record<string, unknown>, model: string }} req
 * @param {{
 *   modelMatrix: RouterMatrixEntry[],
 *   capabilityAxis: 'vision'|'toolUse'|'code',
 *   fetchUpstream?: Function,
 *   apiEndpointUrl?: string,
 *   keySlotAcquireFn?: Function,
 *   telemetryDir?: string
 * }} ctx
 * @returns {Promise<{ success: boolean, status: number, headers: Record<string,string>, body: string, selectedCandidate?: {modelId,routeId,tier} }>}
 */
export async function v2FailoverDispatch(req, ctx) { ... }
```

---

## 3. OPT-IN Integration Path (one-line require)

To opt the opencode-key-router into V2 failover, add this **single line** before the existing `tryFailover` call (around line 3515 or 4050 in `opencode-key-router.mjs`):

```javascript
// In opencode-key-router.mjs, before calling tryFailover():
const r = await import('./v2-failover-overlay.mjs')
const v2result = await r.v2FailoverDispatch(
    { headers: new Headers(Object.fromEntries(Object.entries(req.headers))), body: parsedBody, model: summary.model },
    {
        modelMatrix: myModelMatrix, // your runtime matrix
        capabilityAxis: resolvedAxis, // derived from request
        apiEndpointUrl: `${routePrefix}/chat/completions`
    }
)
if (v2result.success) {
    res.writeHead(v2result.status, v2result.headers)
    res.end(v2result.body)
    return
}
// Fall through to existing V1 tryFailover if v2 did not succeed
```

**Conditional opt-in via header** (recommended for phased rollout):

```javascript
if (req.headers['x-v2-failover'] === '1') {
    const r = await import('./v2-failover-overlay.mjs')
    // ... dispatch ...
}
```

---

## 4. What's Deferred to Phase-5B Live Activation

The following items require the actual runtime router context and are deferred to Phase 5B:

1. **Runtime model matrix population** — The overlay needs a populated `modelMatrix` array (RouterMatrixEntry[]). This must be built from `model-providers.json` + live API probes. Phase 5B will construct this.

2. **Per-(carrier,model) affinity warm-start** — The `KeyAffinityMap` starts empty on each dispatch. Phase 5B should seed it from the existing `activeKeyIndexes` registry in `opencode-key-router.mjs` so affinity preferences persist across requests.

3. **Upstream fetch delegation** — Currently `postWithFirstByteTimeout` calls `fetch()` directly. Phase 5B should inject a `fetchUpstream` callback that routes through the existing provider key selection logic (so authorization keys are correctly chosen per-provider).

4. **StreamQualityMeter real-chunk hooks** — The meter currently records timestamps only at start/end of each dispatch. Phase 5B should feed actual chunk timestamps via `meter.observe(chunkTimestamp)` for accurate P95 computation.

5. **KeySlotAcquire bridge to V1 concurrency state** — The overlay has its own `perKeySlots` Map. Phase 5B should wire it to V1's `activeKeyIndexes` tracking so both layers share the same concurrency state.

6. **Telemetry write path** — Currently writes to `~/.pi/agent/telemetry/` with a best-effort approach. Phase 5B should integrate with the existing JSONL pipeline used by `router-requests.jsonl`.

7. **HTTP response streaming** — Currently returns the body as a complete string. Phase 5B should support streaming responses (passthrough of the upstream ReadableStream) to handle large LLM outputs.

8. **Conditional activation behind header flag** — The one-line opt-in example above shows how to gate V2 behind `x-v2-failover: 1`. Phase 5B will make this a proper toggle in the router's config.

---

## 5. Verification Summary

| Check                                                            | Result                                       |
| ---------------------------------------------------------------- | -------------------------------------------- | ---- |
| File exists at target path                                       | PASS                                         |
| Node.js `--check` syntax validation                              | PASS                                         |
| Bun build transpilation                                          | PASS (5ms, 31.94 KB chunk)                   |
| Exports `v2FailoverDispatch`                                     | PASS                                         |
| Exports `createV2Overlay`                                        | PASS                                         |
| Exports `keySlotAcquire`                                         | No debug console statements                  | PASS |
| Force-pin (`x-router-force-model: original`) respects T0/T1 only | PASS                                         |
| Capability gate filters candidates                               | PASS                                         |
| T0+T1 chain composition on force-pin                             | PASS (2 candidates attempted on test matrix) |
| Failure response returns 503 with `X-Router-Diagnostic`          | PASS                                         |
| All 5 X-Router-\* headers present                                | PASS                                         |
| `createV2Overlay` factory returns `.dispatch()` method           | PASS                                         |
