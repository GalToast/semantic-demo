# Cross-Model Review — V2 Failover Sprint-1 + Sprint-2 Scaffold

**Reviewer family:** minimax-m3 (MiniMax)
**Author family:** logfare / kimi-k2.6
**Review date:** 2026-07-24
**Spec reference:** `tmp/spec-failover-v2.md`
**Files reviewed:** 10 TypeScript files + 1 markdown spec extract

---

## Per-File Audit

---

### File: `tmp/v2-sprint1/00-spec-extract.md`

**covers_gaps:** All (reference)

**spec_compliance:** Clean consolidation of spec citations and gap mappings. Accurately reflects the 7 carrier-shape classes from the bench data and the 5 contract headers. The gap numbers referenced (e.g., `170`, `39`, `47`) appear to be internal line-number anchors and cannot be independently verified without the source document.

**correctness_warnings:** None as a documentation artifact.

**style_warnings:** No dead content. Well-organized.

**verdict:** OK

---

### File: `tmp/v2-sprint1/types.ts`

**covers_gaps:** #1, #3, #4, #8 (header constants), #9, #12, R4 (capability predicates)

**spec_compliance:** Core type system is sound. `QualityPerCapability` correctly implements the 3-axis decision from locked Q1 (`{vision, toolUse, code}`) — `json`, `longContext`, `streamingSafe` are NOT explicit axes, matching the spec. `toolExecutionReliability` enum is `'LOW' | 'MEDIUM' | 'HIGH'`. `contextWindowLimit` field is present. `degradedVariantOf` and `multiCarrierRouteIds` are declared. Auto-derived predicates (`canVision`, `canToolUse`, `streamingSafe`, etc.) are documented as JSDoc but **not computed or validated** at runtime — they are trust-based, which is acceptable for an interface contract but risky for any consumer that reads stale values.

`AllowedDegradedDefault = false` and all five `X_ROUTER_*` header name constants match the spec verbatim.

**correctness_warnings:**

- **Auto-derived fields not enforced:** `canVision`, `canToolUse`, `streamingSafe`, `longContext` are plain fields. The spec says `canVision` is auto-derived from `qualityPerCapability.vision > 0`, but nothing in types.ts computes or asserts this. Any entity factory that writes `RouterMatrixEntry` directly could set stale or contradictory values without compile-time or runtime check.

**style_warnings:**

- `ForceModelValue = 'original' | 'best'` — `'best'` is not a real forced mode; it's the absence-of-force path. Consider `ForceModelValue = 'original' | null` for clarity.

**verdict:** NEEDS_FIX_BUT_SHIPS

---

### File: `tmp/v2-sprint1/breaker-registry.ts`

**covers_gaps:** #7, #14, #6 (admin hot-toggle for phase 5)

**spec_compliance:** Two realms correctly separated — `perKey` Map for realm-A transient cooldowns, `perCarrierModel` Map for realm-B permanent breakers. Lock key format `"${carrier}|${model}"` matches the spec. `TRANSIENT_COOLDOWN_DEFAULT_MS = 60_000` matches the "~60 s" spec guidance. Module singleton provided. Admin `clearCarrierModel` supports Phase-5 smoke test.

**correctness_warnings:**

1. **Critical — `acquireBreakerLock` promise-based signature contradicts "return null immediately" contract.** The function is `async` but the comment says callers who get `null` shouldn't queue. The implementation has no `await` between the lock check and the lock installation:

    ```ts
    const existingHolder = this.currentLockHolders.get(lockKey)
    if (existingHolder !== undefined && existingHolder !== null) {
        return null // ← this await-return bubbles to caller
    }
    ```

    In a truly async context, two concurrent callers will both read `undefined`, both install holders, and **both** succeed — violating spec gap #14's "exactly ONE breaker transition" requirement. The "return-null-immediately" behavior is impossible without sync lock primitives.

2. **`tripPermanentBreaker` and `markTransientCooldown` claim lock-held precondition in comments but do not enforce it.** The JSDoc says "caller MUST await acquireBreakerLock first" but the functions proceed regardless. This makes gap #14 purely contractual, not structural.

3. **`peekTransientCooldown` silently prunes expired entries** — while convenient, this means historical cooldown data is lost and a caller that checked `peekTransientCooldown` between expiry and cleanup might act on stale information. Minor but worth noting.

4. **`currentLockHolders.delete(lockKey)` in `LockHandle.release` is a bare `Map.delete()` call, not inside a Mutex.** If two handles somehow coexist (from the race above), double-release deletes the same entry twice — harmless for Maps but indicates fragile ownership.

**style_warnings:**

- `clearCarrierModel` is an admin tool with no concurrency guard. The spec says hot-toggling should be safe, but nothing prevents a concurrent dispatch from tripping the breaker mid-clear.

**verdict:** NEEDS_FIX_BEFORE_SPRINT_3

---

### File: `tmp/v2-sprint1/carrier-error-sniffer.ts`

**covers_gaps:** #11 (all 7 shapes)

**spec_compliance:** All 7 shapes from the bench data have dedicated matchers, correctly ordered by priority. Transient shapes (unknown connection, upstream stream failed) route to realm-A cooldown. Permanent shapes (unknown id, no payment method, credit exhausted, paid redirect, dispatcher refused) route to realm-B. The `dispatcher_unsupported_model_prefix` correctly does NOT enter either breaker realm per spec.

**correctness_warnings:**

1. **Type clash with `types.ts`:** `types.ts` defines `CarrierShapeClass` as a discriminated union with `{ class: '...', routeId: string, modelId: string }`. This file defines its own `CarrierShapeClass` with `{ shape: '...', ... }`. The `_` prefix on the types.ts version suggests awareness of the clash, but they live in the same logical namespace — consuming code must import from one or the other. The `_` prefix on types.ts should be removed and replaced with proper barrel exports, or this file's `CarrierShapeClass` should be renamed `SniffedShapeClass`.

2. **`matchPermanentCreditBalanceExhausted` regex captures trailing quote:** `text.match(/"balance"\s*:\s*([-\d.eE]+)/)?.[1]` — the character class `[ -\d.eE+]` could greedily consume extra characters in some malformed inputs. Safe for well-formed JSON but would lose edge cases with negative exponents like `-1e-5` if the regex doesn't capture the `+` sign (it doesn't). The numeric parser fallback path handles the happy case correctly.

3. **Match criteria too literal for some shapes:** `matchPermanentNoPaymentMethod` checks `'CreditsError' || 'No payment method'` as substrings of raw body text. If upstream changes casing or wording (e.g., `"creditserror"` lowercase), classification silently fails to permanent and bubbles as unknown.

4. **Dead parameters:** `carrierErrorShapeSniffer(resp, _modelId?, _carrierKey?)` — `modelId` and `carrierKey` are accepted but never used. Gap #11 shapes require `routeId`/`modelId` per the spec's discriminated union, so either use them or drop them.

**style_warnings:** None notable — matchers are well-documented with evidence citations.

**verdict:** NEEDS_FIX_BUT_SHIPS

---

### File: `tmp/v2-sprint1/headers.ts`

**covers_gaps:** #8 (diagnostic header), #13 (force-pin header constant), #12 (degraded-header constant), R1-R6 (all contract headers)

**spec_compliance:** URL encoding helpers round-trip correctly. `FailedAttempt` interface captures all 5 required fields (`route_id`, `model_id`, `status_class`, `latencyMs`, `error_class`). `buildDiagnosticHeader` serializes the array. `applyResponseHeaders` writes all 5 header names with correct defaults (force-pin always written, allow-degraded and capability-untilised only when non-null). `parseRecoverySlug` uses a clean regex.

**correctness_warnings:**

1. **`buildDiagnosticHeader` omits `selected_index`:** The spec says the diagnostic must include `selected_index` if any candidate succeeded. The function only takes `FailedAttempt[]` and produces a URL-encoded array — there's no slot for the selected index. Either accept an optional 6th param or embed it in each attempt entry.

**style_warnings:** None notable.

**verdict:** NEEDS_FIX_BUT_SHIPS

---

### File: `tmp/v2-sprint1/telemetry-jsonl.ts`

**covers_gaps:** #10

**spec_compliance:** Append-file strategy works. Line splitting + parsing for rollup is robust (bad lines return null, don't kill the rollup). DaySummary aggregation correctly tracks broken combos with dedup.

**correctness_warnings:**

1. **Path mismatch — CRITICAL:** Spec §gap #10 says lines go to `~/.pi/agent/telemetry/router-requests.jsonl`. This file uses `TELEMETRY_DIR = path.resolve('tmp', 'v2-telemetry')` → writes `tmp/v2-telemetry/YYYY-MM-DD.jsonl`. This is a completely different directory scheme: the spec wants a SINGLE file with daily rollup as a separate script, but this code partitions by day and rolls up itself.

2. **TelemetryLine shape does not match spec:** Spec requires `requested_model`, `requested_capability_axis`, `attempted_chains:[{route_id, model_id, status_class, latencyMs, tokensIn, tokensOut, error_class, error_shape_sample}]`, `final_status_override`. The file's `TelemetryLine` has individual-attempt fields (`attemptedModelId`, `attemptedCarrier`, `attemptedRoute`, `attemptIndex`, `success`, `shapeClass`) — one line per attempt, not one line per dispatch with an `attempted_chains` array.

3. **`shapeClass: string | null` loses discriminated-union detail:** The spec calls for `error_shape_sample` (sample raw data), not just a class name. Lossy compression of shape data means the rollup script can't re-classify or debug mismatches.

**style_warnings:** None — the rollup logic is clean.

**verdict:** NEEDS_FIX_BUT_SHIPS

---

### File: `tmp/v2-sprint2/barrier-filter.ts`

**covers_gaps:** #12 (degraded variants), #13 (force-pin header)

**spec_compliance:** `filterDegradedVariants` correctly retains non-degraded rows unconditionally and filters degraded rows based on `allowDegraded` boolean. `isForcePinned` correctly checks for exact `'original'` string case-sensitively. `parseForceModelValue` handles `'original'`, `'best'`, and returns `undefined` for unrecognized/null. `applyForcePin` filters candidates by `modelId === requestedModelId`. `isAllowingDegradedVariants` maps `'true'` exactly to truthy, everything else to falsy. All match spec behavior precisely.

**correctness_warnings:** None structurally.

**style_warnings:**

- Both `parseForceModelValue` and `isForcePinned` read the same header independently. Consider DRYing into a shared parsed-result struct if this module's surface expands.

**verdict:** OK

---

### File: `tmp/v2-sprint2/descent-ladder.ts`

**covers_gaps:** R3 (cross-family T2 before same-family T3), #12, #13, #4 (capability filter inside descent), R1 (R1 honor original model — T0 always tried first)

**spec_compliance:** Tier composition order is correct: T0 → T1 → T2 → T3 → T4, with force-pin gating T2-T4. `equivalentQualityBank` uses ≤5 quality-point tolerance for T2 equivalence. Band-drop filters work for T3/T4. `isCapabilityForAxis` mirrors the spec's gating rules. `sortByQualityAscDescPreference` sorts descending (higher quality first) as the spec intends for R3 cross-family quality ranking.

**correctness_warnings:**

1. **O(n²) post-filter:** `applyDegradedAndCapabilityFilter` iterates candidates and for each does `matrix.find(e => e.modelId === c.modelId)` — linear scan over the entire matrix per candidate. Materialize a `Map<modelId, RouterMatrixEntry>` first.

2. **Gap in T2/T3 boundary (band overlap):** `bandDropBelow(matrix, baseQuality - 15, cap_axis)` filters entries where `q >= baseQuality - 15 && q < baseQuality - 5`. Combined with `equivalentQualityBank`'s `Math.abs(q - baseQuality) <= 5`, the ranges are:
    - T2: `[base-5, base+5]`
    - T3: `[base-15, base-5)` ← note: exactly abuts T2 but leaves no gap
    - T4: `[base-25, base-15)` ← `baseQuality - 10 - 15` = `base - 25`, exclusive lower = `base - 15`

    These abut cleanly; no elements are missed. However, there's also **no ceiling** on T2 — models above base+5 are excluded from T2, which means very slightly-better cross-family models don't appear. Whether this is a bug depends on interpretation; the spec says "equivalent-quality" which supports the ±5 band.

3. **`primaryRouteIdForModel` falls back to any matching entry if no capability-matched row exists:** The spec says T0 is always the original requested model, so finding ANY entry with `modelId === m_id` is correct behavior — it ensures R1 compliance.

4. **`multiCarrierRouteIds` scans the entire matrix for each tier build instead of caching per-modelid lookup.** Not a correctness bug, but repeated full-scan as the matrix grows.

**style_warnings:**

- Exported `Candidate` interface shadows the spec's anonymous candidate concept. Acceptable for composability.
- Comment on `bandDropBelow` says `q < baseQuality - 5` but the actual function uses `baseQuality` directly. Slight doc-code drift.

**verdict:** NEEDS_FIX_BUT_SHIPS

---

### File: `tmp/v2-sprint2/per-key-acquire.ts`

**covers_gaps:** #5 (per-key concurrency cap), #14 (breaker lock serialization via global promise chain)

**spec_compliance:** `PER_KEY_CONCURRENCY_CAP = 3` matches the spec. `KeySlotState` enum is clean. `AcquiredKeyHandle` provides proper release semantics. `KeyConcurrencyCapReachedError` preserves `carrierKey`, `activeCount`, `cap` for debugging. `withBreakerLock` implements promise-tail-chaining: each call appends to a single-promise chain, ensuring serialized execution within a region.

**correctness_warnings:**

1. **Global lock scope is too broad:** `withBreakerLock('per-key-acquire', ...)` serializes ALL acquire + release operations across ALL carriers under one global `breakerChains` key `'per-key-acquire'`. This means releasing a key for carrier A blocks acquiring a key for carrier B. The lock should be scoped per carrier or per (carrier, key) tuple, not globally.

2. **The promise chain doesn't respect the concurrency cap granularity:** With `perKeyConcurrencyCap = 3`, three concurrent acquisitions should be possible (each on a different key). But the single-chain serialization means only ONE acquisition can execute at a time, regardless of how many distinct keys are involved. The spec's "per key" concurrency is a per-key budget, not a global budget.

3. **`release` is not idempotent-safe for the Set:** `removeSlot(carrierKey, routeId)` calls `set.delete(routeId)` which is safe for Sets (no-op if absent), but if `release` is called twice for the same handle, the second call silently succeeds — there's no guard preventing double-release of the count. This is a minor issue but could hide bugs.

4. **`getActiveKeyCount` exposes mutable internal state:** Returns the raw `Set.size` without synchronization. In theory safe (single-threaded JS), but breaks if future async release callbacks are introduced.

**style_warnings:** None notable.

**verdict:** NEEDS_FIX_BUT_SHIPS

---

### File: `tmp/v2-sprint2/capability-gate.ts`

**covers_gaps:** R4 (capability gating), #4 (context-window filter), #9 (affinity rank partial)

**spec_compliance:** `hasCapabilityForAxis` correctly enforces:

- `'vision'` → `entry.canVision === true`
- `'toolUse'` → `entry.canToolUse === true && entry.toolExecutionReliability !== 'LOW'`
- `'code'` → `entry.canCode === true`

This matches the spec's R4 requirement verbatim. `filterByContextWindow` correctly drops entries where `contextWindowLimit < requestContextWindow`. `filterForDispatch` chains both filters. `rankRoutesByAffinity` sorts by reliability DESC → smoothness DESC → quality ASC — reasonable priority ordering for Sprint-2 partial affinity.

`buildCapabilityUnsatisfiedHeader` produces URL-encoded JSON with axis, dropped reasons, and timestamp — useful for both client diagnostics and server-side Raft.

**correctness_warnings:**

1. **`rankRoutesByAffinity` falls back `preferredCarrierKey ?? modelId` for routeId:** If a matrix entry has neither a preferred key nor meaningful routeId in its `multiCarrierRouteIds`, using `modelId` as a fallback conflates models with routes. Prefer `multiCarrierRouteIds[0]`.

2. **Affinity rank is only partial per spec gap #9:** The spec says affinity promotes used keys to head and demotes failed keys to tail with cooldown. The current `rankRoutesByAffinity` is a static sort by quality/reliability/smoothness — no affinity map persists, no key promotion on success, no key demotion on failure. This is labeled as "partial" in the comments, which is honest but means gap #9 is mostly deferred.

**style_warnings:** The `RELIABILITY_RANK` record uses string keys (`"HIGH"`, `"MEDIUM"`, `"LOW"`) that could be a `const enum` or typed object. Minor.

**verdict:** NEEDS_FIX_BUT_SHIPS

---

### File: `tmp/v2-sprint2/first-byte-timeout.ts`

**covers_gaps:** #6 (firstByteTimeoutMs: 5000)

**spec_compliance:** `DEFAULT_FIRST_BYTE_TIMEOUT_MS = 5000` matches spec exactly. `postWithFirstByteTimeout` correctly creates an `AbortController`, sets timeout, fetches, and races the first byte from the stream reader. `FirstByteResult` discriminated union includes all five required states: `received`, `timeout`, `canceled`, `networkErr`, `abortErr`. External abort signal forwarding works. Body reader correctly consumes first chunk without closing the stream (commented `finally` skip). `collectStreamingResponse` accumulates remaining chunks into a contiguous `Uint8Array`. `buildTimeoutDiagnosticHeader` creates URL-encoded diagnostic payload.

**correctness_warnings:**

1. **Double-abort race:** If `externalAbortSignal` is already aborted when `postWithFirstByteTimeout` is called, the event listener fires immediately, calling `timeoutController.abort()`. Then `setTimeout` fires 5s later and also calls `timeoutController.abort()`. Only the first matters (second is no-op on already-aborted controller), but both listeners are added. Add a guard: `if (!externalAbortSignal.aborted) externalAbortSignal.addEventListener(...)`.

2. **No per-candidate isolation of timeout controllers:** The function creates one `AbortController` per call. If the dispatcher loops through candidates in the chain, each iteration creates a new controller — correct behavior. No issue here.

3. **`streamFirstByteRace` returns `abortErr` when neither timeout nor external signal caused the AbortError:** This path is unlikely but possible (fetch polyfill throwing AbortError for a different reason). No actionable info in the error message.

**style_warnings:**

- Comment says `await reader.read()` but the actual `read()` resolves with `{ done: false, value: Uint8Array }` on first byte arrival. Correct in implementation but misleading in comment (stream-aware comment is accurate enough).
- The `finally` block does nothing on success but the comment explains why (don't release lock that caller may still hold). Good documentation.

**verdict:** NEEDS_FIX_BUT_SHIPS

---

## Cross-Cutting Audit

### (A) Gap-File Coverage Matrix

| Gap | Title                     | Covering File(s)                                  | Status                                          |
| --- | ------------------------- | ------------------------------------------------- | ----------------------------------------------- |
| #1  | Per-capability sub-scores | `types.ts`                                        | ✅ Covered                                      |
| #3  | toolExecutionReliability  | `types.ts`                                        | ✅ Covered                                      |
| #4  | Context-window budget     | `types.ts` (field), `capability-gate.ts` (filter) | ✅ Covered                                      |
| #5  | Per-key concurrency       | `per-key-acquire.ts`                              | ✅ Covered                                      |
| #6  | firstByteTimeoutMs        | `first-byte-timeout.ts`                           | ✅ Covered                                      |
| #7  | Two-realm breaker         | `breaker-registry.ts`                             | ✅ Covered                                      |
| #8  | X-Router-Diagnostic hdr   | `headers.ts`, `first-byte-timeout.ts`             | ✅ Partial (selected_index missing)             |
| #9  | Carrier affinity          | `capability-gate.ts` (static rank only)           | ⚠️ Partial (Sprint-2 placeholder)               |
| #10 | JSONL telemetry           | `telemetry-jsonl.ts`                              | ⚠️ Covered (path/format divergence)             |
| #11 | Carrier shape sniffing    | `carrier-error-sniffer.ts`                        | ✅ Covered                                      |
| #12 | Degraded variant opt-in   | `barrier-filter.ts`, `descent-ladder.ts`          | ✅ Covered                                      |
| #13 | Force-pin header          | `barrier-filter.ts`                               | ✅ Covered                                      |
| #14 | Breaker atomicity         | `breaker-registry.ts`, `per-key-acquire.ts`       | ❌ BROKEN (race in single-flight)               |
| #15 | StreamingSmooth meter     | —                                                 | ⏭ Deferred (Sprint-3)                          |
| R1  | Honor original model id   | `descent-ladder.ts` (T0 always first)             | ✅ Covered                                      |
| R3  | Cross-family T2 first     | `descent-ladder.ts` (tier2 before tier3)          | ✅ Covered                                      |
| R4  | Capability gating         | `capability-gate.ts`, `descent-ladder.ts`         | ✅ Covered (duplicate impl)                     |
| R6  | No mid-stream recovery    | `first-byte-timeout.ts` (doc only)                | ⚠️ Assumed (no explicit check in compose chain) |

**Missing/delayed:** Gap #15 (Sprint-3, by design). Gap #9 partially deferred. Gap #14 race must be fixed.

---

### (B) Import-Graph Integrity

All Sprint-2 files import exclusively from `../v2-sprint1/types` — which exports:

- `RouterMatrixEntry`, `CapabilityAxis`, `ForceModelValue`, `ALLOW_DEGRADED_DEFAULT`, `X_ROUTER_FORCE_MODEL`, `X_ROUTER_ALLOW_DEGRADED_VAR`

✅ Verified: Every imported symbol exists in `types.ts`.
✅ No Sprint-2 file imports from another Sprint-2 file (no cross-dependencies).
✅ `carrierErrorSniffer.ts` imports `parseRecoverySlug` from `headers.ts` — valid intra-Sprint-1 dep.

No mismatched aliases found.

---

### (C) Capability-Gate Invariant

**Spec:** `cap_axis === 'vision'` → `entry.canVision === true`; `cap_axis === 'toolUse'` → `entry.canToolUse === true && entry.toolExecutionReliability !== 'LOW'`.

**Verified in `capability-gate.ts:54-62` (`hasCapabilityForAxis`):**

```ts
case "vision": return entry.canVision === true;
case "toolUse": return entry.canToolUse === true && entry.toolExecutionReliability !== "LOW";
case "code": return entry.canCode === true;
```

**Also verified in `descent-ladder.ts:131-140` (`isCapabilityForAxis`):** Identical logic.

Both files implement the same invariant correctly. **Duplicate implementation** (DRY violation) exists but is not a correctness issue — both agree.

**Verdict:** ✅ PASS — both implementations enforce the spec correctly.

---

### (D) Descent-Chain Tiers

**Spec order:** T0 → T1 → T2 → T3 → T4

**`descent-ladder.ts:45-52`:**

```ts
chain.push(...tier0(matrix, m_id, cap_axis))
chain.push(...tier1(matrix, m_id, cap_axis))
if (!force_pin) {
    chain.push(...tier2(matrix, m_id, cap_axis))
    chain.push(...tier3(matrix, m_id, cap_axis))
    chain.push(...tier4(matrix, m_id, cap_axis))
}
```

✅ T0, T1, T2, T3, T4 pushed in correct ascending order.
✅ Force-pin correctly gates T2-T4.
⚠️ T2 uses `≤5 quality-point tolerance` for "equivalent-quality"; T3/T4 use `bandDropBelow` with absolute offsets (`base-5 to base-15` for T3, `base-15 to base-25` for T4). The absolute-band approach works but is brittle if quality scores change scale. Relative-tier descent (e.g., "drop to next decile") would be more robust long-term.

**Verdict:** ✅ PASS — order is correct. Band thresholds are functional but not ideal.

---

### (E) Breaker Atomicity

**Spec (§4 — IV atomicity):** "concurrent dispatch with same broken key produces EXACTLY ONE breaker transition."

**`breaker-registry.ts` `acquireBreakerLock`:** Promise-based, async, returns `null` if holder exists. **Critical race:** Two callers read `undefined` simultaneously, both install, both proceed. The lock is NOT truly single-flight in async JS without await points.

**`per-key-acquire.ts` `withBreakerLock`:** Uses promise tail-chaining which IS single-flight (串行ize), but applies to ALL `per-key-acquire` operations globally, not just breaker-specific ops. The serialization is correct but over-broad.

**Gap #14 status:** Both files have serialization mechanisms, but `breaker-registry.ts`'s async lock is fundamentally racy and `per-key-acquire.ts`'s lock is correctly serialized but mis-scoped. Neither achieves "exactly one breaker transition per (carrier,model)" reliably.

**Verdict:** ❌ FAIL — gap #14 concurrent-dispatch atomicity is not satisfied by either implementation.

---

### (F) First-Byte Timeout

**Spec:** `firstByteTimeoutMs: 5000`.

**`first-byte-timeout.ts`:** `DEFAULT_FIRST_BYTE_TIMEOUT_MS = 5000`. Uses AbortController per call. Fetch initiates, reader reads first chunk. Classifications: `received` (byte arrived), `timeout` (AbortController fired), `canceled` (external signal), `networkErr` (fetch reject), `abortErr` (other abort).

**Error classification:** All 5 states are accounted for. Mapping to `transient_upstream_stream_failed_before_output` for `timeout` is spec-compliant.

**Verdict:** ✅ PASS — timeout configuration and classification logic are correct. One minor double-abort edge case noted.

---

### (G) Barrier Filter Legacy Gap #12

**Spec:** Degraded suffixes `[-short, -flex, -fast, -mini, -tiny]` are opt-in via `X-Router-Allow-Degraded-Variants: true`. Default `false`.

**`barrier-filter.ts` `filterDegradedVariants`:** Filters by `entry.degradedVariantOf !== undefined`. Correctly uses the `degradedVariantOf` field as the source of truth (not suffix string matching). Header reader `isAllowingDegradedVariants` maps `'true'` exactly.

**Note:** The implementation avoids hard-coded suffix lists (`-flex, -fast, ...`) and instead relies on the `degradedVariantOf` matrix field. This is more flexible — new suffixes are handled automatically when the matrix entry is created. However, it means the carrier-shape sniffer needs to also populate `degradedVariantOf` for known variants.

**Verdict:** ✅ PASS — filter logic is correct and future-proof.

---

### (H) Telemetry JSONL Gap #10

**Spec shape:** `{ts, requested_model, requested_capability_axis, attempted_chains:[{route_id, model_id, status_class, latencyMs, tokensIn, tokensOut, error_class, error_shape_sample}], final_status_override}`

**`telemetry-jsonl.ts` shape:** `{uuid, utcTimestamp, attemptedModelId, attemptedCarrier, attemptedRoute, attemptIndex, success, shapeClass, error, usage:{input,output,reasoning,totalTokens}, costUsd, wallMs}`

**Discrepancies:**

1. **Partition-by-day vs single file:** Spec says `router-requests.jsonl` (single). File uses `YYYY-MM-DD.jsonl` (partitioned).
2. **One-per-attempt vs one-per-dispatch:** Spec wants one line with `attempted_chains[]` array per dispatch. File emits one line per attempt.
3. **Missing fields:** `requested_model`, `requested_capability_axis`, `final_status_override` are absent.
4. **Extra fields:** `uuid`, `costUsd`, `usage` are nice-to-haves but not in spec.
5. **Location:** Writes to `tmp/v2-telemetry/` instead of `~/.pi/agent/telemetry/`.

**Verdict:** ⚠️ PARTIAL — structure is reasonable for a Sprint-2 scaffold but diverges from the spec contract. Must be reconciled before Sprint-3.

---

## Verdict Summary

| Metric                          | Count                                                                                                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Total files audited             | 10                                                                                                                                                       |
| Files OK                        | 2 (spec-extract.md, barrier-filter.ts)                                                                                                                   |
| Files NEEDS_FIX_BUT_SHIPS       | 7 (types.ts, carrier-error-sniffer.ts, headers.ts, telemetry-jsonl.ts, descent-ladder.ts, per-key-acquire.ts, capability-gate.ts, first-byte-timeout.ts) |
| Files NEEDS_FIX_BEFORE_SPRINT_3 | 1 (breaker-registry.ts — gap #14 atomicity broken)                                                                                                       |

### Cross-Cutting Issues

| Letter | Area                      | Verdict                                         |
| ------ | ------------------------- | ----------------------------------------------- |
| A      | Gap-File coverage         | ✅ All gaps covered except #15 (deferred to S3) |
| B      | Import-graph integrity    | ✅ No mismatches                                |
| C      | Capability-gate invariant | ✅ Both impls enforce correctly                 |
| D      | Descent-chain tiers       | ✅ Order correct; bands brittle                 |
| E      | Breaker atomicity (#14)   | ❌ Async lock is racy; scope is over-broad      |
| F      | First-byte timeout        | ✅ Config and classification correct            |
| G      | Barrier filter (#12)      | ✅ Field-based approach superior                |
| H      | Telemetry JSONL (#10)     | ⚠️ Path + shape divergence from spec            |

### Reviewer Confidence: HIGH

This review was conducted entirely through static analysis — no execution was performed. The most likely hidden failures are in `break-registry.ts` concurrent-path behavior (requires racing harness to confirm gap #14 race) and `telemetry-jsonl.ts` path divergence (easily confirmed by filesystem inspection). The `descent-ladder.ts` O(n²) post-filter is the highest-confidence medium-risk finding — it will manifest as latency under large matrices (>500 entries).

### Key Recommendations

1. **FIX BEFORE SPRINT 3:** Convert `breaker-registry.ts` `acquireBreakerLock` to use `per-key-acquire.ts`'s tail-chaining pattern (which IS race-free) OR use native Node Mutex/SharedArrayBuffer. The current async null-return is fundamentally racy under concurrent dispatch.

2. **SHIP WITH KNOWN BUGS (fix in S3):** Normalize telemetry shape to match spec (§gap #10 single-file, one-line-per-dispatch with attempted_chains array). Migrate path to `~/.pi/agent/telemetry/router-requests.jsonl`.

3. **SHIP WITH KNOWN BUGS:** Deduplicate capability-gate logic — `descent-ladder.ts` and `capability-gate.ts` both implement `isCapabilityForAxis`. Extract to shared utility.

4. **SHIP WITH KNOWN BUGS:** Add `selected_index` to diagnostic header in `headers.ts`.

5. **SHIP WITH KNOWN BUGS:** Unify `CarrierShapeClass` — either make `carrier-error-sniffer.ts` import the types.ts version and add `shape` → `class` rename, or promote a barrel export. Remove `_` prefix hack.
