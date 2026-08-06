# Phase-5B-Success-Path — Final Report

**Test script**: `tmp/s6-dispatch/phase5b-success-path.mjs`  
**Matrix source**: Inline from key-router hardcoded matrix (`agnes-2.0-flash` only, T0, toolUse-capable)

## Primary Carrier Chosen

Route `/openrouter/v1` — health shows mixed 502/429 responses. Also probed: neuralwatt, freemodel, logfare, zenmux, modelscope, mistral, llm7, cloudflare, nvidia, agnes. All produce identical patterns.

## Request Shape

```
POST /{route}/v1/chat/completions
Content-Type: application/json
X-V2-Failover: 1
Body: { "model": "test", "messages": [{ "role": "user", "content": "hi" }] }
```

## HTTP Response Status

Consistently **502 Bad Gateway** on first attempt → **429 Too Many Requests** (routeBackoff kicks in). No route ever returned 200 through V2 path.

## HTTP Response Headers (x-router-* present?)

| Header | Present? |
|--------|----------|
| X-Router-Diagnostic | ✗ NO — zero of 15+ probes |
| X-Router-Failover-Applied | ✗ NO |
| Access-Control-Expose-Headers | `content-type,retry-after` (missing x-router*) |

Body sample (58 chars): `{"error":"All router keys failed","detail":"fetch failed"}`  
Body length: 58 bytes (V1 exhaust-all-keys hardcoded message, NOT V2)  
Latency: 14–142ms first attempt, 17–37ms subsequent (consistent with direct key exhaustion, NOT V2 2-hop)

## ROOT CAUSE: Two Bugs in V2 Overlay Module

### Bug #1: `slotHandle` is undeclared ReferenceError

File: `v2-failover-overlay.mjs`, lines 900 & 941

```javascript
// Line ~793: NO declaration of slotHandle anywhere in dispatch loop
// Lines 900, 941: Referenced without declaration!
if (slotHandle) await slotHandle.release();  // ReferenceError!
```

Fix: Add `let slotHandle = null;` inside the `for (let i = 0; i < chain.length; i++)` loop (around line ~800), and assign via `ksAcquire?.(routeId, modelId)` when `keySlotAcquireFn` is provided.

**Impact**: Every V2 call throws `ReferenceError` → caught by V2 try/catch → falls to V1 → no diagnostic headers surface. This is why ALL live probes returned raw V1 error without any `X-Router-*` headers.

### Bug #2: `v2diag` spreads undefined into HTTP response body

File: `opencode-key-router.mjs`, line ~4196

```javascript
const payload = JSON.stringify({ error: "All router keys failed", detail: lastError.slice(0, 500) })
// ...
respondAdapterJson(res, upstreamRequest, lastStatus, payload, modelScope, "application/json", { ...v2diag, ...allFailedHeaders })
```

When V2 throws before setting `v2diag`, `{ ...undefined }` becomes `{}`, BUT the `v2diag` variable at site B (line ~4143) shadows a potentially different scope — after repeated V2 crashes, the key-router process shows `"v2diag is not defined"` in the body, confirming cross-contamination.

## Verdict: PARTIAL

- **Unit test confirmed**: V2 module loads successfully, exports are correct (`createV2Overlay`, `keySlotAcquire`, `v2FailoverDispatch`)
- **Unit test confirmed**: `buildFailureResponse` correctly emits `X-Router-Diagnostic` + `X-Router-Failover-Applied` even on complete failure
- **Live integration BLOCKED**: V2 overlay always crashes from `slotHandle` ReferenceError (Bug #1 above)
- **Even if fixed**: Success path unprovable because matrix has only 1 candidate (`agnes-2.0-flash`), same URL reused for alternative carrier, upstream requires auth that V2 strips

## Time taken / Cost

~3.5 seconds total | agnes-2.0-flash = $0

---

PHASE-5B-SUCCESS-PATH WORKER — FINAL REPORT

**Verdict**: PARTIAL  
**Diagnostic headers seen in HTTP response**: ✗ (0/15 probes with X-V2-Failover:1 header)  
**Layer that broke**: V2 overlay module — `slotHandle` is undeclared (ReferenceError at v2-failover-overlay.mjs lines 900/941), causing every V2 call to throw → caught by V2 try/catch → falls to V1 `tryFailover` → exhausts → generic error.  
**Time taken**: ~3.5s | **Cost**: agnes-2.0-flash = $0
