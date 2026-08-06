# W5 — OpenRouter Reasoning Format Fix Report

## Problem
OpenRouter rejects `reasoning: true` (boolean) with HTTP 400:
"reasoning: expected object, received boolean".

## Root Cause
The key-router (`src/opencode-key-router.mjs`) passes through the incoming
request body to OpenRouter WITHOUT converting the `reasoning` field format.
The Pi harness sends `reasoning: true` (boolean) via the model-providers cache's
`forceReasoningForModel()` flag (mmx.ts `FORCE_REASONING_DEFAULT = true`).
OpenRouter's API spec requires `reasoning` as an OBJECT: `{ type: "reasoning" }`.

## Fix Applied
File: `C:/Users/HP/harness/servers/key-router/src/opencode-key-router.mjs`
Lines: 4518-4531 (inserted after the NVIDIA diagnostic block, before `syntheticSseFromJson`)

```javascript
// OpenRouter reasoning field fix (Sprint-7 W5b, 2026-07-26):
if (providerKey === "openrouter" && upstreamRequest && upstreamRequest.body) {
    try {
        const orBody = JSON.parse(upstreamRequest.body.toString("utf8"));
        if (orBody.reasoning === true) {
            orBody.reasoning = { type: "reasoning" };
            upstreamRequest.body = Buffer.from(JSON.stringify(orBody));
        }
    } catch {
        // non-JSON body: leave untouched
    }
}
```

## Verification
- `node --check src/opencode-key-router.mjs` → SYNTAX-VALID
- grep `orBody.reasoning = { type: "reasoning" }` → line 4527
- Pattern mirrors the existing model-prefix-strip block (lines 4456-4474)

## Live Verification (2026-07-26 18:51 UTC)

### Smooth Restart via control.ps1 (watchdog-up-first protocol)
1. `control.ps1 -Action watchdog-start` -> watchdog PID 8236 running
2. `control.ps1 -Action restart` -> OLD PID 23920 stopped -> NEW PID 12136 started 18:51:13
3. `control.ps1 -Action status` -> running=true, healthy=true, port 8788, all 28 routes preserved

### Probe: `poolside/laguna-s-2.1:free` through key-router with `reasoning: true` (boolean)
```bash
curl -X POST http://127.0.0.1:8788/openrouter/v1/chat/completions \
  -d '{"model":"openrouter/poolside/laguna-s-2.1:free","messages":[{"role":"user","content":"hi"}],"reasoning":true,"max_tokens":50}'
```

**Result: HTTP 200 SUCCESS**
```json
{"model":"poolside/laguna-s-2.1:free","choices":[{"message":{"content":"Hello! How can I help you today?","reasoning":null},"finish_reason":"stop"}],"usage":{"prompt_tokens":45,"completion_tokens":10,"total_tokens":55,"cost":0}}
```

### Before fix (pre-restart, OLD PID 23920):
This same request returned HTTP 400:
```json
{"error":{"message":"reasoning: expected object, received boolean"}}
```

**The 400 "expected object, received boolean" error is GONE.** The key-router now
converts `reasoning: true` (boolean) -> `reasoning: { type: "reasoning" }` (object)
for OpenRouter requests. The fix is LIVE and verified.

## Commit
- `fbe0f2d` on branch `phase3-restoration-clean`
- Watchdog (PID 8236) ensures the key-router auto-recovers if it dies.
- The smooth restart via control.ps1 preserved all routes (28 total, autoShards config intact).

## Related Issues (4 reasoning format fixes)
1. OpenRouter boolean->object (W5b, THIS fix) — DONE + LIVE VERIFIED
2. NVIDIA NIM reasoning strip (W9) — verified, adapter strips for non-DeepSeek
3. vLLM/zydit effort collapse (W10) — code review confirms collapse logic at line 3560-3561
4. Moonshot/Kimi thinking field (W11b) — `openAiReasoningToKimiThinking()` at line 2984, DONE
