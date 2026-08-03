# Subagent Model Quick Reference

**Last verified:** 2026-07-30 (W58 campaign)

## Primary

Primary subagent route:
minimax-m3 (MiniMax-M3 - verified vision-capable 2026-07-15), routes: kilo/minimax, logfare, opencode-zen, minimax-direct
logfare/glm-5.2 - main lane via router-logfare
NOTE: kilo/openrouter/owl-alpha (former primary) is DEAD (404 on both kilo gateway and OpenRouter; absent from /v1/models - do not re-add; per AGENTS.md). Removed 2026-07-24.

## Registered Alt

```
agnes-2.0-flash          ← bare ref, NO provider prefix
```

## Free Fallbacks — Verified

| Model ID                          | Provider Launch Ref(s)                                                                             | Notes                                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `mimo-v2.5-free`                  | `opencode-zen/mimo-v2.5-free`                                                                      | ✅ Strong free find channel (W58). Reasoning-heavy; use conciseness steering. Best for bounded audits. |
| `ling-3.0-flash-free`             | `opencode-zen/ling-3.0-flash-free`, `kilo/inclusionai/ling-3.0-flash:free` (upstream Novita, fast) | ✅ Verified e2e audit carrier. Novita route is fastest.                                                |
| `deepseek-v4-flash-free`          | `opencode-zen/deepseek-v4-flash-free`                                                              | ⚠️ Can think-loop/timeout on heavy tasks, but surfaces real leads. Use short scopes.                   |
| `laguna-s-2.1-free`               | `opencode-zen/laguna-s-2.1-free`, `poolside/laguna-s-2.1` (direct, free to us)                     | ✅ Verified via direct poolside route. Premium free carrier; user calls it "a beast".                  |
| `nemotron-3-ultra-free`           | `opencode-zen/nemotron-3-ultra-free`                                                               | ✅ Strong deep audit; can CoT into content. Counts against Zen concurrency.                            |
| `kilo/kilo-auto/free`             | `kilo/kilo-auto/free` → resolves to `inclusionai/ling-3.0-flash:free`                              | ✅ Router healthy, all counts correct. Good free audit lane.                                           |
| `zenmux/z-ai/glm-4.7-flash-free`  | `zenmux/z-ai/glm-4.7-flash-free`                                                                   | ✅ Accurate, fast, free. `glm-4.6v-flash-free` currently rate-capped.                                  |
| `mistral/devstral-2512`           | `mistral/devstral-2512`                                                                            | ✅ Free to us; transport reliable. Minor count drift. Good for bounded reads/edits.                    |
| `mistral/mistral-small-latest`    | `mistral/mistral-small-latest`                                                                     | ✅ Free to us; transport reliable. Off-by-one counts.                                                  |
| `mistral/magistral-medium-latest` | `mistral/magistral-medium-latest`                                                                  | ✅ Free to us; transport reliable. Off-by-one counts.                                                  |
| `mistral/magistral-small-latest`  | `mistral/magistral-small-latest`                                                                   | ✅ Free to us; transport very fast (~7s). Off-by-one counts.                                           |
| `nvidia/thinkingmachines/inkling` | `nvidia/thinkingmachines/inkling`                                                                  | ✅ Free nvidia tier; all counts correct; fast. Strong free audit carrier.                              |
| `novita/tencent/hy3`              | `novita/tencent/hy3` (also `kilo/tencent/hy3`, `opencode-zen/hy3-free`)                            | ✅ Free via Novita; all counts correct; fast. Avoid OpenCode Zen route (429/cold stall).               |
| `freemodel/gpt-5.6-luna`          | `freemodel/gpt-5.6-luna`                                                                           | ✅ 3/3 real bugs found + fixed correctly (qwen harness).                                               |
| `logfare/qwen-3.6-35b-a3b`        | `logfare/qwen-3.6-35b-a3b`                                                                         | ✅ Passed real UX-copy audit. Currently degraded (429/503).                                            |

## Free Fallbacks — Conditional / Avoid

| Model ID                          | Provider Launch Ref(s)                                                       | Notes                                                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `north-mini-code-free`            | `opencode-zen/north-mini-code-free`                                          | ⚠️ Read-only FIND scout only; fabricates completion text on edits. Use with main-lane verification.        |
| `north-mini-code-free`            | `kilo/cohere/north-mini-code:free`, `openrouter/cohere/north-mini-code:free` | ⚠️ Viable for read-only audits via these routes.                                                           |
| `laguna-xs-2.1-free`              | `kilo/poolside/laguna-xs-2.1:free`, `openrouter/poolside/laguna-xs-2.1:free` | ⚠️ Rate-limit / empty-args issues historically. Direct poolside route preferred.                           |
| `hy3-free` / `tencent/hy3`        | `opencode-zen/hy3-free`                                                      | ❌ Avoid OpenCode Zen route: 429 / cold stall. **Novita route graduated 2026-07-30 (see Verified table).** |
| `qwen3.6-plus`                    | `opencode-zen/qwen3.6-plus`, `kilo/qwen/qwen3.6-plus`                        | ❌ Not free: opencode-zen 401 CreditsError; kilo 402 paid.                                                 |
| `mistral/codestral-latest`        | `mistral/codestral-latest`                                                   | ⚠️ Transport-viable; poor accuracy / fabricates evidence. Do not trust for autonomous FIND.                |
| `mistral/mistral-code-latest`     | `mistral/mistral-code-latest`                                                | ❌ Output-token cap too low (16 tokens) — cannot complete a `read` tool call.                              |
| `mistral/mistral-vibe-cli-latest` | `mistral/mistral-vibe-cli-latest`                                            | ❌ Hits `stopReason: length` mid-report.                                                                   |
| `mistral/mistral-medium-latest`   | `mistral/mistral-medium-latest`                                              | ❌ Pi CLI cannot resolve `router-mistral/mistral-medium-latest`. Registration gap.                         |
| `mistral/devstral-small-2:24b`    | `mistral/devstral-small-2:24b`                                               | ❌ `400 status code (no body)` — likely the `:` in model ID breaks launch.                                 |

## Untested Chat/General Models (still to evaluate)

After removing specialized model families (embeddings, moderation, OCR, translation, audio, image/video, vision-only, fill-in-the-middle code models) and models already tested, **≈1,297 chat/general models remain untested** across all providers. The `free_model_ids` flag below only marks a provider's explicit free tier; many non-flagged models (e.g., `poolside/laguna-s-2.1`, OpenCode Zen's full catalog) are still accessible and may be free to us.

Priority backlogs by provider:

| Provider       | Untested chat models | Top candidates to try first                                                                                                                                                                                                                                                   |
| -------------- | -------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `infron`       |                  378 | `moonshotai/kimi-k2.6:free` ❌ 404 on current route; `xiaomi/mimo-v2.5:free`, `minimax/minimax-m2.5:free`, `deepseek/deepseek-v4-pro:free`, `google/gemini-3.1-flash-lite`, `qwen/qwen3.5-27b-*` family                                                                       |
| `kilo`         |                  330 | `anthropic/claude-opus-5`, `openai/gpt-5.6-sol`, `deepseek/deepseek-v4-pro:discounted`, `qwen/qwen3.7-plus`, `thinkingmachines/inkling`, `minimax/minimax-m3`, `kwaipilot/kat-coder-pro-v2.5:free` ❌ 404 free-period-ended (kilo-auto/free is the only free kilo lane entry) |
| `zenmux`       |                  135 | `qwen/qwen3.7-flash` ❌ 410 Gone, `anthropic/claude-opus-5` ❌ 402 balance-required, `inclusionai/ling-3.0-flash`, `google/gemini-3.6-flash`, `moonshotai/kimi-k3`, `openai/gpt-5.6-luna/terra/sol`, `x-ai/grok-4.5`, `bytedance/doubao-seed-*`                               |
| `novita`       |                  134 | `tencent/hy3` ✅ graduated, `moonshotai/kimi-k3`, `moonshotai/kimi-k2.7-code` ❌ 400 bad model ID, `deepseek/deepseek-v4-*`, `inclusionai/ling-3.0-flash`, `minimax/minimax-m3`, `qwen/qwen3.7-max`                                                                           |
| `zydit`        |                   61 | `deepseek-ai/deepseek-v4-flash`, `google/gemma-4-31b-it`, `meta/llama-3.3-70b-instruct`, `meta/llama-3.1-70b-instruct`                                                                                                                                                        |
| `nvidia`       |                   54 | `deepseek-ai/deepseek-v4-flash`, `meta/llama-3.3-70b-instruct`, `meta/llama-3.1-70b-instruct`, `mistralai/mistral-large*`, `ai21labs/jamba-1.5-large-instruct`, `databricks/dbrx-instruct`                                                                                    |
| `opencode-zen` |                   49 | `claude-opus-5`, `claude-sonnet-5`, `gemini-3.6-flash`, `gpt-5.6-sol/luna`, `grok-4.5`, `deepseek-v4-pro`, `kimi-k2.7-code`                                                                                                                                                   |
| `modelscope`   |                   43 | `deepseek-ai/DeepSeek-V3.1`, `deepseek-ai/DeepSeek-V3.2-Exp`, `Qwen/Qwen3-235B-A22B`, `Qwen/Qwen3-14B`, `MiniMax/MiniMax-M1-80k`, `OpenGVLab/InternVL3_5-241B-A28B`                                                                                                           |
| `mistral`      |                   37 | `mistral-medium-2505`, `mistral-medium-2508`, `open-mistral-nemo` ❌ fabricated all 5 counts + never read/wrote, `codestral-2508`, `devstral-medium-latest` ⚠️ transport ok, counts inaccurate, `mistral-large-2512`, `ministral-3b/8b/14b-latest`                            |
| `zydit-v4`     |                   34 | `devstral-2:123b`, `gemma-4-31b-it`, `glm-4.7`, `kimi-2.6-thinking`, `kimi-k2-thinking`, `kimi-k2.5-thinking`                                                                                                                                                                 |
| `cloudflare`   |                   13 | `@cf/moonshotai/kimi-k2.6` ❌ 403 not launchable today, `@cf/openai/gpt-oss-120b`, `@cf/zai-org/glm-4.7-flash`, `@cf/nvidia/nemotron-3-120b-a12b`, `@cf/meta/llama-4-scout-17b-16e-instruct`                                                                                  |
| `logfare`      |                    8 | `minimax-m3`, `kimi-k2.6`, `kimi-k2.7-code`, `deepseek-v4-flash` (currently degraded)                                                                                                                                                                                         |
| `openrouter`   |                    7 | `poolside/laguna-xs-2.1:free`, `nvidia/nemotron-3-*:free`, `google/gemma-4-31b-it:free`                                                                                                                                                                                       |
| `groq`         |                   10 | `openai/gpt-oss-20b`, `qwen/qwen3.6-27b`, `llama-3.1-8b-instant`, `groq/compound`, `allam-2-7b`                                                                                                                                                                               |
| `kilo`         |                    5 | `stepfun/step-3.7-flash:free`, `nvidia/nemotron-3-*:free`, `openrouter/free`                                                                                                                                                                                                  |
| `poolside`     |                    1 | `poolside/laguna-xs-2.1` (free to us via direct route; `laguna-s-2.1` already verified)                                                                                                                                                                                       |
| `freemodel`    |                    2 | `gpt-5.6-terra` (luna verified; terra previously failed)                                                                                                                                                                                                                      |

> **W58 priority-provider probe results (2026-07-30):** Five requested quick probes landed: `infron/moonshotai/kimi-k2.6:free` ❌ 404; `zenmux/anthropic/claude-opus-5` ❌ 402 balance-required; `novita/tencent/hy3` ✅ graduated (accurate counts); `mistral/devstral-medium-latest` ⚠️ transport ok, counts inaccurate (scripts 100 vs 136); `cloudflare/@cf/moonshotai/kimi-k2.6` ❌ 403. Only Novita `tencent/hy3` added to the verified allowlist.
>
> **Note:** Coding Index scores are **not currently available** on artificialanalysis.ai (per-model Coding Index tabs shows "Not currently available" across all tested models). See [`docs/ai-model-leaderboard-scores.md`](ai-model-leaderboard-scores.md) for full details.
> **`hy3-free`** remains the OpenCode Zen bare ref, but Kilo/OpenRouter now expose `tencent/hy3` instead of `tencent/hy3:free`.

## Vision-Capable (for visual QA work)

```
google/gemini-3-flash
google/gemini-3.5-flash
google/gemini-2.5-flash
google/gemini-2.5-pro
anthropic/claude-3-7-ch-exp
anthropic/claude-opus-4-7
openai/gpt-5.5
openai/gpt-5.5-pro
meta/llama-3.2-90b-vision-instruct
meta/llama-3.2-11b-vision-instruct
kimi-k2.6
kimi-k2.5
MiniMax-M3
mimo-v2.5
```

## Tool Gotchas

- `external_subagent_start` model param: use **bare ref** for Agnes (`agnes-2.0-flash`), not `agnes/agnes-2.0-flash` or `sapiens-ai/agnes-2.0-flash`.
- `external_subagent_steer` requires `prompt_text` (not `message`).
- Live catalog: `external_subagent_free_models` returns 500+ lines; use `grep` or this doc instead of scrolling.
- Provider-qualified refs select the lane: `mistral/devstral-2512`, `poolside/laguna-s-2.1`, `nvidia/thinkingmachines/inkling`.
- `mcp_profile` for subagents must be `"subagent"`, not `"lean"`.
