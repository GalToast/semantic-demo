# PHASE-5C Overlay-Header-Preservation Patch — MAIN-LANE CORRECTION NOTE

> Status: **CORRECTED + LIVE-VERIFIED** on 2026-07-25 23:30 UTC
>
> Worker `S6-W5-PHASE-5C-OVERLAY-HEADER-PATCH` (ocw_7dd755ff) initially landed a patch but it broke the live key-router — main-lane caught it, restored from backup, and re-applied with correct scoping. This file documents the broken attempt and the working fix.

## W5 Worker's Initial (BROKEN) Patch

Worker placed `let v2diag;` at Site A line 3528 and Site B line 4142 — INSIDE the `if (!routeBackoff) { ... }` (Site A) / `if (FAILOVER_STATUSES...)` (Site B) blocks. The spread `...v2diag,` was inserted at the bottom 429 responder lines 3608 (Site A) and 4196 (Site B) — OUTSIDE those blocks (in the function-body level where the bottom 429 responders actually live).

Result: `ReferenceError: v2diag is not defined` on every request that hit FAILOVER_STATUSES path. Confirmed via live smoke — BOTH the X-V2-Failover:1 + openprovider test AND the no-header control test returned `{"error":"v2diag is not defined"}`.

## Main-Lane Correction (CLEANED UP)

File restored from `opencode-key-router.mjs.bak-pre-p5c-2026-07-25` (171520 bytes — known-good pre-W5-patch state).

Then applied the corrected patch via single `edit` call with 5 edits:

1. **Declaration**: `let v2diag = null;` at function scope, inserted between `if (autoShard) { ... }` block close (~line 3520) and `const { active, nextReadyAt, ... } = activeKeyIndexes(...)` (~line 3521). Hoisted to outermost function-body scope — visible to BOTH Site A's 429 responder (line ~3618) AND Site B's 429 responder (line ~4205). Initialized to `null` so spread `...(null || {})` gracefully no-ops for any path that doesn't pass through the V2 overlay block (i.e., normal-traffic requests without `x-v2-failover: 1`).

2. **Site A V2 capture** (line 3575, 12sp indent): inside the existing `if (v2Flag === '1') { try { ... } }` block, after the `if (v2Result && v2Result.success) { ... return; }` early-return commit, inserts `v2diag = v2Result?.headers || null;` before the catch.

3. **Site A spread** (line 3618, inside the bottom-of-function 429 responder headers argument):
   ```
   respondAdapterJson(res, upstreamRequest, 429, JSON.stringify(payload), modelScope, "application/json", {
     "Retry-After": String(retryAfterSeconds),
     ...(v2diag || {}),
   })
   ```
   (was just `Retry-After: ...` previously)

4. **Site B V2 capture** (line 4189, 10sp indent): same as #2 but inside Site B's V2 block.

5. **Site B spread** (line 4205 transformation):
   ```
   respondAdapterJson(res, upstreamRequest, lastStatus, payload, modelScope, "application/json", { ...allFailedHeaders, ...(v2diag || {}) })
   ```
   (was just `allFailedHeaders` previously)

## Verification — LIVE on the running key-router

- `node --check opencode-key-router.mjs` → exit 0 ✓
- v2diag pattern grep: exactly 5 occurrences at lines 3529 (decl), 3575 (A capture), 3618 (A spread), 4189 (B capture), 4205 (B spread) ✓
- Restarted key-router cleanly: stopped PID 4628 → new wrapper PID 21336 → real node PID **22008**, `/health` ok=true routes=17
- **Control test** (no X-V2-Failover:1) on POST /agnes/v1 → HTTP 200, NO `x-router-*` headers ✓ (proves P5C is correctly gated — doesn't leak diagnostic headers into non-V2 traffic)
- **Site B P5C test** (X-V2-Failover:1 + POST /openprovider/v1 with `gpt-4o-mini`): HTTP 502 with all 4 V2 diagnostic headers visible:
  - `X-Router-Diagnostic: {"attemptedChains":[],"forcedPin":false,"capabilityAxis":"toolUse","totalLatencyMs":0,"detectedAtGmt":...}`
  - `X-Router-Failover-Applied: false`
  - `X-Router-Force-Model: default`
  - `X-Router-Allow-Degraded-Variants: false`
  ✓ — Phase-5C GOAL ACHIEVED for Site B
- **Site A P5C test** (X-V2-Failover:1 + POST /zydit/v4 + `nonexistent-model-XYZ-nonexistent-31337`): HTTP 429 with `Retry-After: 2951` AND all 4 diagnostic headers visible ✓ — Phase-5C GOAL ALSO ACHIEVED for Site A
- Body confirms W2's finding: `{"error":"Zydit v4 router has no keys currently off cooldown","keys":2,"nextReadyInMs":2950634,"oldestCoolingSlot":2,"routeBackoff":false}` — activeKeys=0 confirms `if (!active.length)` Site A branch fired as designed

## Backup files preserved

- `opencode-key-router.mjs.bak-pre-p5c-2026-07-25` (171520 bytes) — pre-W5-patch known-good
- `opencode-key-router.mjs.p5c-fixed-2026-07-25` (172518 bytes) — current known-good corrected patch (running live as PID 22008)

## Outstanding sprint-7 backlog (per W4 worker report)

1. **slotHandle undeclared** bug in `v2-failover-overlay.mjs` lines 900 & 941 — `let slotHandle = null;` declaration needed inside the `for (let i = 0; i < chain.length; i++)` loop. Without this fix, the V2 SUCCESS PATH (where V2 actually dispatches to an alternative carrier and gets 200) cannot work end-to-end; all V2 dispatches hit this ReferenceError before reaching actual upstream alternatives, get caught by the V2 try/catch, and fall through to V1. (NOTE: my Phase-5C test surfacing diagnostic headers works because matrix-mismatch cases fail EARLY in `v2FailoverDispatch` via `buildFailureResponse` BEFORE reaching the `slotHandle` code — so my P5C patch is sufficient for the failure-preservation case.)
2. **Multi-candidate matrix**: minimal matrix installed in VS block only has `agnes-2.0-flash` (one entry, same URL as primary) — for true V2 success path proof, load W3's `tmp/v2-overlay-matrix.json` (8 entries with diverse URL prefixes per carrier) into both Site A and Site B's `v2ModelMatrix` const declarations.
3. **Now-after disarm note**: the harness-side opencode-key-router.mjs diff against harness HEAD `0e81379` shows +3359/-251 = the Sprint-4/5 P5B integration blocks + ALL accumulated v2-failover effective code from this session. The harness commit needs to land this in the harness repo (branch `phase3-restoration-clean`).

---

PHASE-5C-OVERLAY-HEADER-PATCH — MAIN-LANE CORRECTION — FINAL REPORT
- W5 initial broken patch: COMPLETE FAILURE (broke key-router for 15 min between restarts)
- Main-lane correction: ✓ 5-edit single-call
- node --check: ✓ exit 0
- Live verification: BOTH Site A (429) AND Site B (502) report X-Router-Diagnostic headers in HTTP ✓
- Cost: $0 (agnes-2.0-flash, $0)
- Time to recover: ~8 minutes (capture-broken-grep + restore-from-backup + corrected-patch-edit + restart + verify)
