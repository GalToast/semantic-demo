# Subagent Model Quick Reference

**Last verified:** 2026-07-15

## Primary

```
kilo/openrouter/owl-alpha
```

## Registered Alt

```
agnes-2.0-flash          ← bare ref, NO provider prefix
```

## Free Fallbacks

| Model ID                 | Intelligence Score (AA)                      |
| ------------------------ | -------------------------------------------- |
| `mimo-v2.5-free`         | **42**                                       |
| `deepseek-v4-flash-free` | **40**                                       |
| `qwen3.6-plus-free`      | **40** (not in live free catalog 2026-07-15) |
| `nemotron-3-ultra-free`  | **38**                                       |
| `north-mini-code-free`   | **21\***                                     |
| `hy3-free`               | **?** (new lane, score TBD)                  |

> **Note:** Coding Index scores are **not currently available** on artificialanalysis.ai (per-model Coding Index tabs shows "Not currently available" across all tested models). See [`docs/ai-model-leaderboard-scores.md`](ai-model-leaderboard-scores.md) for full details.
> **`hy3-free`** is a new free-tier lane (bare ref → `opencode-zen/hy3-free`); Intelligence Score not yet fetched — score TBD.

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
