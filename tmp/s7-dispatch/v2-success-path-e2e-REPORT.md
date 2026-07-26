# S7-W4 — V2-SUCCESS-PATH E2E TEST — SPEC & REPORT

**Worker:** S7-W4 (test author; main-lane runner)  
**Depends on:** W1 slotHandle fix + W2 matrix-load patch landed + key-router restarted  
**Artifacts:**
- `tmp/s7-dispatch/v2-success-path-e2e.mjs` — test runner script
- `tmp/s7-dispatch/v2-success-path-e2e-REPORT.md` — this document
- `tmp/s7-dispatch/v2-success-path-results.jsonl` — produced at run time

---

## 1. What This Script Tests

The V2 failover overlay (`v2-failover-overlay.mjs`) is invoked from
`opencode-key-router.mjs` at two failover entry points:

| Site | Trigger condition | Location in opencode-key-router.mjs |
|------|-------------------|--------------------------------------|
| **Site A** | Provider has configured keys but `active.length === 0` (all disabled or on cooldown) → `tryFailover()` is called → V2 block fires | Inside `tryFailover()`, ~L4564 |
| **Site B** | All key attempts returned a FAILOVER_STATUS (400/404/502/503/504) → V2 block fires at the FAILOVER_STATUSES check | Inside `forward()`, ~L5412 |

Both sites check `x-v2-failover: 1` (case-insensitive) before invoking
`v2FailoverDispatch`. If the header is absent or ≠ `"1"`, V2 is skipped
and the request falls through to the legacy V1 `tryFailover` path.

**Important structural constraint (audited against current key-router source):**
The `forward()` function has an early return when `keys.length === 0`
(no configured keys at all): it returns HTTP 503
`"router has no configured keys"` immediately and **never reaches**
`tryFailover()` or the V2 block. Providers that have zero keys in their
key-loader (`zydit`, `zyditv4`, `openprovider`, `neuralwatt`, `llm7`,
`freemodel` in a default installation) are therefore **not usable** for
testing the V2 block via the normal `forward()` path.

To reach the V2 block, a provider must have keys configured but all of
them disabled (`activeKeyIndexes` returns `active=[]`). The router
supports this via the `OPENCODE_KEY_ROUTER_DISABLED_SLOTS_<PROVIDER>_*`
environment variable, which forces specific slot indices into the
disabled set before the active-key calculation runs.

**Success path:** `v2FailoverDispatch` iterates the matrix candidates;
when any upstream carrier returns HTTP 200, the function returns
`{ success: true, status: 200, headers: { "X-Router-Failover-Applied": … }, body }`.
The key-router writes those headers directly onto the HTTP response.

---

## 2. Classification Rules

The script classifies each test case into one of four buckets:

| Classification | Condition |
|----------------|-----------|
| **pass** | `status === 200` AND `X-Router-Failover-Applied === "true"` AND body non-empty |
| **partial** | `status === 200` AND `X-Router-Failover-Applied === "false"` (V2 activated, first carrier succeeded on first attempt — only one entry in `attempts[]`) |
| **fail** | `status >= 400` — V2 could not dispatch an alternative, or the alternative threw |
| **error** | Network error, timeout, or uncaught exception before a response was received |

> **Why "partial" is acceptable in early runs:**  
> `X-Router-Failover-Applied` is `"true"` only when `attempts.length > 1` —
> i.e., the first carrier in the matrix failed and a second one succeeded.
> Whether the first carrier fails depends on live upstream health (rate limits,
> auth state, etc.). A `partial` result proves V2 activated and dispatched
> successfully; it just didn't need to fall through to a second carrier.
> Main-lane should re-run after a fresh router boot (cold state) to maximise
> the chance of seeing a true multi-attempt `"true"` result.

---

## 3. Test Case Design

### 3.1 Environment Variable Strategy

The script itself does **not** set env vars or spawn the router.  Main-lane
must start the key-router with these four env vars set **before** running
the test script:

```cmd
set OPENCODE_KEY_ROUTER_DISABLED_SLOTS_OPENPROVIDER_ALL=all
set OPENCODE_KEY_ROUTER_DISABLED_SLOTS_NEURALWATT_ALL=all
set OPENCODE_KEY_ROUTER_DISABLED_SLOTS_LLM7_ALL=all
set OPENCODE_KEY_ROUTER_DISABLED_SLOTS_FREEMODEL_ALL=all
node C:/Users/HP/harness/servers/key-router/src/opencode-key-router.mjs
```

`disabledSlotsEnvName("openprovider", "*")` → `OPENCODE_KEY_ROUTER_DISABLED_SLOTS_OPENPROVIDER_ALL`  
The value `"all"` is parsed into a Set of slot indices. When every index
(0, 1, …, n-1) is in the disabled set, `activeKeyIndexes()` returns
`active = []`, `nextReadyAt = undefined`, `routeBackoff = false`.  
`forward()` then calls `tryFailover()` → V2 block fires.

### 3.2 Why zydit/zyditv4 Are Excluded

`zydit` and `zyditv4` are disabled providers with zero configured keys
(`loadProviderKeys` returns `[]` from all sources). The early-return at
the top of `forward()` fires: HTTP 503, V2 never reached. Including them
in this test suite would produce guaranteed `fail` results that do not
test the V2 overlay at all. They belong in a separate "no-keys → 503"
contract test, not this V2-success-path suite.

### 3.3 Route Selection

| TC ID | Route | Provider | Trigger | Env var needed |
|-------|-------|----------|---------|----------------|
| TC-01 | `/openprovider/v1` | `openprovider` | Site A (all slots disabled) | `OPENPROVIDER_ALL=all` |
| TC-02 | `/neuralwatt/v1` | `neuralwatt` | Site A (all slots disabled) | `NEURALWATT_ALL=all` |
| TC-03 | `/llm7/v1` | `llm7` | Site A (all slots disabled) | `LLM7_ALL=all` |
| TC-04 | `/freemodel/v1` | `freemodel` | Site A (all slots disabled) | `FREEMODEL_ALL=all` |
| TC-05 | `/openprovider/v1` | `openprovider` | Site A (alt bogus model) | `OPENPROVIDER_ALL=all` |
| TC-06 | `/neuralwatt/v1` | `neuralwatt` | Site A (alt bogus model) | `NEURALWATT_ALL=all` |

### 3.4 Expected Alternative Carriers (Post-W2 Matrix)

After W2 loads `v2-overlay-matrix.json`, the 8-entry matrix is:

```
 0: agnes-2.0-flash        → carrierType: auto        T0  GOLDEN_GOOSE_#1
 1: north-mini-code:free   → carrierType: openrouter  T0  GOLDEN_GOOSE_#2_FASTEST
 2: minimax-m3             → carrierType: nvidia      T0  FREE_WITH_REASONING
 3: kilo-step-3.7-flash    → carrierType: kilo        CONDITIONAL
 4: cloudflare             → carrierType: cloudflare  CONDITIONAL
 5: nvidia-minimax-m3      → carrierType: nvidia      CONDITIONAL
 6: opencode-zen           → carrierType: opencode-zen CONDITIONAL
 7: logfare-kimi-k2.6      → carrierType: logfare     SEASONAL
```

V2 tries entries in matrix order. T0 entries (0, 1, 2) are tried first; if one
succeeds the chain short-circuits. T0 carriers are the most reliable for
producing `X-Router-Failover-Applied: "true"` because they are the most likely
to be live and respond quickly.

---

## 4. Per-Test-Case Rationale

| TC ID | Route | Rationale |
|-------|-------|-----------|
| TC-01 | `/openprovider/v1` | openprovider has keys but all slots are disabled via env var. `active=[]` → `tryFailover` → V2 block. The bogus model `nonexistent-XYZ-bogus` is forwarded as `model` in the request body to the first matrix carrier. First T0 carrier (agnes, idx 0) is most likely to succeed immediately → partial; if agnes is rate-limited, V2 falls through to north-mini-code:free (idx 1) → full pass. |
| TC-02 | `/neuralwatt/v1` | Same mechanism as TC-01 with a different provider. Confirms V2 activation is not specific to openprovider's configuration. |
| TC-03 | `/llm7/v1` | Third distinct provider. Validates V2 fires consistently across provider types. |
| TC-04 | `/freemodel/v1` | Fourth distinct provider. Increases confidence in cross-provider V2 reliability. |
| TC-05 | `/openprovider/v1` (alt model) | Uses `totally-invalid-model-zzz-999` instead of `nonexistent-XYZ-bogus`. Confirms V2 activation is model-name-independent — the bogus model does not need to match any real model for V2 to fire. |
| TC-06 | `/neuralwatt/v1` (alt model) | Same as TC-05 but for neuralwatt. Redundant but guards against TC-02 flake. |

---

## 5. Expected Response Shape

After a successful V2 dispatch the key-router emits these headers:

```
HTTP/1.1 200 OK
Content-Type: application/json
X-Router-Failover-Applied: true|false   ← primary assertion target
X-Router-Force-Model: default
X-Router-Allow-Degraded-Variants: false
X-Router-Diagnostic: <base64-encoded telemetry blob>
```

`X-Router-Failover-Applied: "true"` is emitted only when the V2 dispatch
loop made **more than one attempt** (first carrier failed, second succeeded).

`X-Router-Failover-Applied: "false"` is emitted when the first carrier
succeeded on its first attempt (only one entry in the `attempts` array).
This is still a valid V2 success — the overlay activated, dispatched, and
the first carrier responded.

When V2 dispatch fails or throws, the V1 fallback responder may emit:
```
HTTP/1.1 429/502/503/...
X-Router-Diagnostic: <failure telemetry>
Retry-After: <seconds>
```
**Note:** `X-Router-Failover-Applied` is absent in the failure path. The
script checks for `null`/`undefined` and classifies accordingly.

---

## 6. JSONL Output Format

Each line appended to `v2-success-path-results.jsonl` is a JSON object.
Per-test lines follow this shape:

```jsonc
{
  "testId": "TC-01-openprovider-disabled-slots",
  "route": "/openprovider/v1",
  "suffix": "/v1/chat/completions",
  "model": "nonexistent-XYZ-bogus",
  "provider": "openprovider",
  "expectedSite": "A",
  "url": "http://127.0.0.1:8788/openprovider/v1/v1/chat/completions",
  "status": 200,
  "statusOk": true,
  "failoverApplied": "true",
  "failoverAppliedOk": true,
  "bodySnippet": "{\"choices\":[...]}",
  "xRouterHeaders": {
    "X-Router-Failover-Applied": "true",
    "X-Router-Diagnostic": "...",
    "Content-Type": "application/json"
  },
  "classification": "pass",
  "error": null,
  "durationMs": 1247,
  "ts": "2026-07-26T03:15:00.000Z"
}
```

The final line in the file is a summary record:

```jsonc
{
  "__summary": true,
  "total": 6,
  "passed": 3,
  "partial": 2,
  "failed": 1,
  "durationMs": 18420,
  "startedAt": "2026-07-26T03:14:41.000Z",
  "finishedAt": "2026-07-26T03:15:00.000Z",
  "exitCode": 1,
  "results": [ /* per-test summaries */ ]
}
```

---

## 7. Running the Script

```bash
# Prerequisites:
#   1. W1 patch applied: slotHandle declared in v2-failover-overlay.mjs
#   2. W2 patch applied: v2-overlay-matrix.json (8 entries) loaded at Site A + Site B
#   3. Key-router running on 127.0.0.1:8788 with disabled-slot env vars set:
#
#      set OPENCODE_KEY_ROUTER_DISABLED_SLOTS_OPENPROVIDER_ALL=all
#      set OPENCODE_KEY_ROUTER_DISABLED_SLOTS_NEURALWATT_ALL=all
#      set OPENCODE_KEY_ROUTER_DISABLED_SLOTS_LLM7_ALL=all
#      set OPENCODE_KEY_ROUTER_DISABLED_SLOTS_FREEMODEL_ALL=all
#      node C:/Users/HP/harness/servers/key-router/src/opencode-key-router.mjs

node tmp/s7-dispatch/v2-success-path-e2e.mjs
```

**Exit codes:**
- `0` — all test cases classified as `pass`
- `1` — at least one `fail` or `error` classification
- `2` — runner itself threw (uncaught exception, or router not reachable)

**Environment notes:**
- No interactive readline — pure batch execution
- No test-framework dependencies — uses only Node built-in `http` module
- ESM syntax (`import`, no `require`)
- `REQUEST_TIMEOUT_MS = 45000` per case; adjust upward if T0 carriers are slow on first boot
- `max_tokens: 1` in request body minimises upstream token cost if a carrier charges per call

---

## 8. Patch Verification Checklist (Main-Lane)

Before running this script, main-lane should confirm W1 + W2 are in place:

```bash
# W1 slotHandle fix (v2-failover-overlay.mjs)
grep -n "slotHandle" C:/Users/HP/harness/servers/key-router/src/v2-failover-overlay.mjs
# Expected: 3 lines — declaration + two release guards
# (line ~1149: const slotHandle = null;  lines ~1242, ~1301: release guards)

# W2 matrix load (Site A + Site B in opencode-key-router.mjs)
grep -n "v2ModelMatrix" C:/Users/HP/harness/servers/key-router/src/opencode-key-router.mjs
# Expected: 3+ lines — Site A load, Site B load, dispatch call site

# W2 matrix file exists + correct size
ls -la C:/Users/HP/harness/servers/key-router/src/v2-overlay-matrix.json
# Expected: 4725 bytes, 8 entries

# Node syntax check on patched router
node --check C:/Users/HP/harness/servers/key-router/src/opencode-key-router.mjs
# Expected: exit 0

# Router running
curl -s http://127.0.0.1:8788/ 2>/dev/null || echo "Router not responding"
# Expected: any HTTP response < 500
```

---

## 9. Mock-Test Plan (If the Live Router Refuses a Case)

If the live key-router on port 8788 does not behave as expected, the
main-lane should apply the following diagnostic steps **before**
declaring a hard failure:

### 9.1 Router Not Running

**Symptom:** `ECONNREFUSED 127.0.0.1:8788` for all test cases.  
**Action:** Start the key-router with W1+W2 patches + disabled-slot env vars
(see Section 7), then re-run the script.

### 9.2 W1/W2 Patches Not Yet Landed

**Symptom A:** `X-Router-Failover-Applied` header missing from all responses.  
**Meaning:** V2 dispatch threw `ReferenceError` (slotHandle) or returned
`{success: false}` (1-entry matrix).  
**Action:** Apply W1 + W2 patches, restart router, re-run.

**Symptom B:** V2 returns 200 but `X-Router-Failover-Applied` is absent.  
**Meaning:** V2 dispatch returned success but headers were not propagated.
Check `v2Result.headers` handling in opencode-key-router.mjs.

### 9.3 Provider Has Keys but Not Disabled

**Symptom:** HTTP 200 with a normal carrier response, no V2 headers.  
**Meaning:** The provider had active keys; V2 was never evaluated.  
**Action:** Set the disabled-slot env var for that provider and restart.

### 9.4 V2 Activates but All Matrix Carriers Fail

**Symptom:** Status ≥ 400, `X-Router-Failover-Applied` absent.  
**Meaning:** V2 tried all 8 matrix entries; every upstream returned an error.
Typically means all T0 carriers are rate-limited or temporarily down.  
**Action:** Check carrier health, wait for cooldown, re-run.

### 9.5 Partial Results Are Normal

A `partial` result (status 200, `X-Router-Failover-Applied: "false"`) means
V2 succeeded on the **first attempt**. This is a valid V2 success — the
overlay activated, dispatched, and the first carrier (agnes-2.0-flash,
T0 GOLDEN_GOOSE) responded. Main-lane should not treat partials as
failures for the purpose of confirming the V2 overlay is wired. They
confirm:
- The `x-v2-failover: 1` header is honored
- The V2 block is entered
- The matrix is loaded (at least one entry is dispatched)
- The alternative carrier returned HTTP 200

To convert a partial to a full pass, restart the router with a cold state
(no prior affinity/cooldown data) — if agnes is rate-limited at boot, V2
falls through to north-mini-code:free and `attempts.length > 1`.

### 9.6 Graceful Skip vs Hard-Fail Policy

| Situation | Action |
|-----------|--------|
| Router not running | Hard-fail; script exits 2 with diagnostic message |
| W1 not applied (slotHandle ReferenceError) | Hard-fail; V2 throws, falls to V1; check router stderr for `[V2-overlay] dispatch failed` |
| W2 not applied (1-entry matrix) | Hard-fail; V2 likely returns 429/503 for bogus models |
| Provider has keys, not disabled | Soft-skip; TC classified `partial` or `fail` with note |
| All matrix carriers down | Hard-fail; TC classified `fail`; main-lane checks carrier health |
| Network error during test | Hard-fail; TC classified `error`; main-lane retries once |
| Partial (V2 single-attempt success) | Not a failure — document as expected behavior |

---

## 10. Failure Post-Mortem Template

If the script returns `exit 1`, main-lane should append to
`tmp/v2-impl-bench-log.md` using this template:

```
## W4 E2E Run — <YYYY-MM-DDTHH:MM>

- Runner: node tmp/s7-dispatch/v2-success-path-e2e.mjs
- Exit: <0|1|2>
- Passed: <N>  Partial: <N>  Failed: <N>  Error: <N>
- Duration: <ms>

### Failing Cases
| TC ID | Route | Status | Failover | Error |
|-------|-------|--------|----------|-------|
| TC-XX | /...  | 503    | absent   | …     |

### Root-Cause Assessment
<one-paragraph diagnosis based on JSONL inspection>

### Remediation
<action taken>
```

---

*Generated by S7-W4 worker — test authoring only, not executed against live router.*
