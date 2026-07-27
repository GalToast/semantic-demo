# Bugsweep Bench — 2026-07-27 — Untested Model Sweep

## Goal

Test new models NOT in the AGENTS.md lane inventory (the 12-model "whitelisted" set), including models from the general catalogue (863 models in model-providers.json) that aren't normally used for subagents. Use bugsweep FIND tasks (report-only) on 5 empty areas as the workload: components, search, stores, navigation, lib-components.

## Subagent Catalogue Discovery

The external-subagents server returned its full `allowed_models` list (1574 lines, saved to `tmp/bugsweep-bench-2026-07-27/subagent-allowed-models.txt`). This is the actual "subagent catalogue" — far larger than the 12-model AGENTS.md lane inventory. It includes models from opencode, kilo, nvidia, mistral, qwen, minimax, modelscope, zydit, zenmux, logfare, cloudflare, openrouter, openprovider, google, and bare model names.

**Critical:** Some models in the allowed list are NOT in Pi's `model-providers.json` (e.g., `logfare/qwen-3.8-max`, `logfare/mimo-v2.5`). These pass the external-subagents validation but fail at Pi launch with "Model not found". Both catalogues must agree.

## Provider Route Health (2026-07-27)

| Route            | Status                    | Error                                                                   | Notes                                                                                             |
| ---------------- | ------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **kilo**         | ❌ DOWN                   | 402 "Credits Required" (balance: -0.00002) + 429 "no keys off cooldown" | ALL models fail — paid AND free. Account out of credits.                                          |
| **opencode-zen** | ❌ DOWN (for some models) | 402 (proxies to kilo for minimax-m3-free)                               | Free models that proxy through kilo also fail.                                                    |
| **zenmux**       | ❌ DOWN                   | 402 "reject_no_credit" (requires balance > 0)                           | Gemini models require paid account.                                                               |
| **zydit-v4**     | ❌ DOWN                   | 404 (no body) for kimi-k3                                               | Route broken for some models.                                                                     |
| **openrouter**   | ❌ DEGRADED               | 404 "unavailable for free" for kimi-k2.6:free; 429 cooldown (~6h)       | Free tier deprecated for kimi-k2.6. Key on cooldown.                                              |
| **modelscope**   | ⚠️ UNTESTED               | Cold-start stall (8 min silence, no assistant output)                   | Qwen3-Coder-30B never responded. Route may need warmup.                                           |
| **logfare**      | ⚠️ DEGRADED               | Connection errors after heavy 200MB run                                 | Was reliable (kimi-k2.6 PROVEN, deepseek-v4-flash PROVEN) but degraded after 200MB stdout strain. |

## Models Tested

### ✅ PROVEN (completed bugsweep report)

| Model                             | Route   | Area       | Report Lines | Cost   | Notes                                                                                                                                        |
| --------------------------------- | ------- | ---------- | ------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `stepfun/step-3.7-flash:free`     | kilo    | stores     | 107          | $0.005 | ✅ PROVEN. Needed steer-nudge at ~7min to write report. 46MB thinking stdout. Found searchStore.update sync bug.                             |
| `inclusionai/ling-3.0-flash:free` | kilo    | navigation | 224          | $0     | ✅ PROVEN. Timed out at 600s before writing — followup lane rescued. 52MB thinking stdout. Found setJourneyPhase/selectMode bug.             |
| `logfare/deepseek-v4-flash`       | logfare | search     | 277          | —      | ✅ PROVEN. Hit 200MB stdout cap — steer rescued at ~6min. Found 22+ bugs including AbortController leak, sticky bypass flag. Biggest report. |

### ❌ FAILED

| Model                                          | Route             | Error                            | Root Cause                                                             |
| ---------------------------------------------- | ----------------- | -------------------------------- | ---------------------------------------------------------------------- |
| `google/gemini-3.6-flash`                      | zenmux            | 402 "reject_no_credit"           | Zenmux requires balance > 0                                            |
| `kilo/google/gemini-3.6-flash`                 | kilo              | 402 "Credits Required"           | Kilo out of credits                                                    |
| `kilo/moonshotai/kimi-k3`                      | kilo              | 402 "Credits Required"           | Kilo out of credits                                                    |
| `opencode-zen/kimi-k3`                         | zydit-v4          | 404 (no body)                    | Zydit-v4 route broken for kimi-k3                                      |
| `opencode/minimax-m3-free`                     | opencode-zen→kilo | 402 "Credits Required"           | OpenCode Zen proxies to kilo (out of credits)                          |
| `moonshotai/kimi-k2.6:free`                    | direct-openrouter | 404 "unavailable for free"       | OpenRouter deprecated free tier                                        |
| `kilo/nvidia/nemotron-3-super-120b-a12b:free`  | kilo              | 400 context overflow             | **Config bug**: max_tokens=262144 (full context) → input+output > 262K |
| `kilo/kwaipilot/kat-coder-pro-v2.5:free`       | kilo              | 429 "no keys off cooldown"       | Kilo rate-limited                                                      |
| `modelscope/Qwen/Qwen3-Coder-30B-A3B-Instruct` | modelscope        | Cold-start stall (8 min)         | Model never responded — route may need warmup                          |
| `logfare/minimax-m3`                           | logfare           | Cold-start stall (8 min)         | Likely queued behind deepseek-v4-flash                                 |
| `logfare/qwen-3.8-max`                         | logfare           | "Model not found"                | NOT in Pi model-providers.json                                         |
| `logfare/mimo-v2.5`                            | logfare           | "Model not found" + 600s timeout | NOT in Pi model-providers.json                                         |
| `logfare/deepseek-v4-pro`                      | logfare           | "Connection error"               | Logfare degraded after 200MB run                                       |
| `logfare/kimi-k2.7-code`                       | logfare           | "Connection error" (retrying)    | Logfare degraded after 200MB run                                       |

## Key Bench Findings

### 1. Provider route health is the primary bottleneck

ALL major routes (kilo, opencode-zen, zenmux, zydit-v4, openrouter) are down or degraded. Only logfare was reliable, and it degraded after heavy use. **The external-subagents system needs multiple healthy routes to be useful.**

### 2. Thinking-heavy models need steer-nudge

All 3 PROVEN models (step-3.7-flash, ling-3.0-flash, deepseek-v4-flash) are thinking-heavy and produced 46-200MB of stdout. **All 3 needed a steer-nudge to write the report** — they would have timed out without it. The pattern: thinking-heavy models analyze deeply but don't write reports proactively. The steer-nudge pattern ("STOP analyzing. Write the REPORT.md NOW.") is essential for these models.

### 3. 200MB stdout cap is a real limit

deepseek-v4-flash hit the 200MB stdout cap (209,715,200 bytes). The worker was still alive and could write the report via the `write` tool (which doesn't depend on stdout), but the steer was needed to redirect it from thinking to writing. **The 200MB cap is not fatal — the worker can still write — but it needs steer intervention.**

### 4. External-subagents allowed list ≠ Pi model-providers.json

`logfare/qwen-3.8-max` and `logfare/mimo-v2.5` are in the external-subagents `allowed_models` list but NOT in Pi's `model-providers.json`. They pass the external-subagents validation but fail at Pi launch with "Model not found". **Both catalogues must be kept in sync.**

### 5. nemotron-3-super-120b:free has a max_tokens config bug

The model's `max_tokens` is set to 262,144 (the full context window). This causes a 400 error: input + output = 282,142 > 262,144. **Fix: set max_tokens to ~32,768 or ~65,536 to leave room for input.**

### 6. OpenRouter deprecated kimi-k2.6:free

The `moonshotai/kimi-k2.6:free` endpoint returns 404: "This model is unavailable for free. The paid version is available now - use this slug instead: moonshotai/kimi-k2.6". **The free tier was removed.**

## Bugsweep Reports Produced

| Area           | Lines   | Model                   | Route       | Severity Breakdown               |
| -------------- | ------- | ----------------------- | ----------- | -------------------------------- |
| keyboard       | 215     | (earlier)               | —           | —                                |
| utils          | 322     | (earlier)               | —           | —                                |
| engine         | 103     | (earlier)               | —           | —                                |
| orchestration  | 386     | (earlier)               | —           | —                                |
| css            | 118     | kimi-k2.6               | logfare     | 4 HIGH, 6 MED, 5 LOW             |
| **stores**     | **107** | **step-3.7-flash:free** | **kilo**    | NEW                              |
| **navigation** | **224** | **ling-3.0-flash:free** | **kilo**    | NEW                              |
| **search**     | **277** | **deepseek-v4-flash**   | **logfare** | NEW                              |
| components     | —       | —                       | —           | ⏳ Pending (all routes degraded) |
| lib-components | —       | —                       | —           | ⏳ Pending (all routes degraded) |

**8/10 areas completed.** 2 remaining (components, lib-components) blocked by route degradation.

## Recommendations

1. **Add credits to kilo account** — it's the primary route and serves both free and paid models
2. **Fix nemotron-3-super-120b:free max_tokens** — set to 32768, not 262144
3. **Sync external-subagents allowed list with model-providers.json** — add qwen-3.8-max and mimo-v2.5 to Pi config, OR remove them from the allowed list
4. **Add steer-nudge to bugsweep prompts** — "If you have <2 min left, STOP analyzing and write the report NOW" — for thinking-heavy models
5. **Stagger logfare dispatches** — don't run 2 heavy workers on logfare simultaneously; the route degrades under load
6. **Test modelscope route with warmup** — the 8-min cold-start stall might resolve with a pre-warmup ping
