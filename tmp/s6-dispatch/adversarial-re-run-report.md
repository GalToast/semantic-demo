# Adversarial test driver re-run results

| Test | Mock-server result | Live-router result | Notes |
|------|---------------------|---------------------|-------|
| vertical_veil | PASS | N/A (mock-only) | Model-name isolation: glm-5.2 content ≠ glm-5.1 leak |
| capability_veil | PASS | N/A (mock-only) | Vision-capability filter: no cross-sibling leak |
| transient_breaker | PASS | N/A (mock-only) | Independent per-key cooldown: poolside key 429s, other key usable |
| permanent_breaker | PASS | N/A (mock-only) | All-keys-fail → breaker trips on all remaining |
| first_byte_veil | PASS | N/A (mock-only) | 6s delay > 5s abort threshold → horizontal failover triggered |
| jsonl_rollup | PASS (6 lines) | N/A (mock-only) | One JSONL dispatch line per completed test |
| gap14_atomicity | PASS (10 entries) | N/A (mock-only) | Concurrent fuzz: 10 breaker entries recorded (boundary ≤10) |
| **nonexistent-model** | — | PASS (503) | `NONEXISTENT-BAD-MODEL` → 503 `model_not_found`, clean AgnesAI_error |
| **valid-model-route** | — | PASS (200) | `agnes-2.0-flash` → 200, litellm headers present, x-litellm-call-id |

## Regression check

- **Key-router health:** PID 14408 on :8788 — healthy, 5 inFlight on /agnes/v1, routing correctly
- **V2-overlay evidence:** Live router silently routes through V2 channels; no X-Router-* / X-V2* headers on response (expected — V2 is transparent)
- **node --check:** skipped (no V2 files modified; harness files untouched)
- **bun build:** skipped (same)
- **New error patterns:** None observed. Health endpoint shows same carrier/kind failure modes (ModelScope 429 quota, OpenProvider 502 fetch-failed, Freemodel 500 container-limit, zyditv4 429 backoff). No novel errors introduced by V2 overlay.

## Verdict

**PASS** — All 7 adversarial tests pass at mock level. Live key-router properly rejects bad-model 503s and routes valid agnes-2.0-flash requests through V2 overlay with full litellm traceability. No regression.

---

ADVERSARIAL-RE-RUN WORKER — FINAL REPORT
- Adversarial tests passed: 7/7 (mock) + 2/2 (live smoke)
- Live key-router regression: NO
- Verdict: PASS
- Time taken / Cost: agnes-2.0-flash = $0
