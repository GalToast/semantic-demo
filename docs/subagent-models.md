# Subagent Model Quick Reference

**Last verified:** 2026-07-22

## Primary

```
kilo/openrouter/owl-alpha
```

## Registered Alt

```
agnes-2.0-flash          ← bare ref, NO provider prefix
```

## Free Fallbacks

| Model ID                   | Provider Launch Ref(s)                                                                                          | Notes                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `laguna-s-2.1-free`        | `opencode-zen/laguna-s-2.1-free`, `kilo/poolside/laguna-s-2.1:free`                                             | Laguna S 2.1 Free; new free lane                                              |
| `laguna-xs-2.1-free`       | `opencode-zen/laguna-xs-2.1-free`, `kilo/poolside/laguna-xs-2.1:free`, `openrouter/poolside/laguna-xs-2.1:free` | Laguna XS 2.1 Free; verified free tier                                        |
| `mimo-v2.5-free`           | `opencode-zen/mimo-v2.5-free`                                                                                   | Fast free fallback                                                            |
| `deepseek-v4-flash-free`   | `opencode-zen/deepseek-v4-flash-free`                                                                           | Strong reasoning/tools on free tier                                           |
| `nemotron-3-ultra-free`    | `opencode-zen/nemotron-3-ultra-free`                                                                            | High context free fallback                                                    |
| `north-mini-code-free`     | `opencode-zen/north-mini-code-free`                                                                             | Code-focused free fallback                                                    |
| `hy3-free` / `tencent/hy3` | `opencode-zen/hy3-free`, `kilo/tencent/hy3`                                                                     | Prefer `tencent/hy3` where available; `hy3-free` is the OpenCode Zen bare ref |
| `qwen3.6-plus`             | `opencode-zen/qwen3.6-plus`, `kilo/qwen/qwen3.6-plus`                                                           | Long context free candidate                                                   |
| `qwen3.6-35b-a3b`          | `kilo/qwen/qwen3.6-35b-a3b`                                                                                     | Mid-size free candidate                                                       |
| `qwen3.6-flash`            | `opencode-zen/qwen3.6-flash`, `kilo/qwen/qwen3.6-flash`                                                         | Fast free candidate                                                           |
| `qwen3.6-27b`              | `kilo/qwen/qwen3.6-27b`                                                                                         | Compact free candidate                                                        |

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
