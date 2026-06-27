# Subagent Model Quick Reference

**Last verified:** 2026-06-27

## Primary

```
kilo/openrouter/owl-alpha
```

## Registered Alt

```
agnes-2.0-flash          ← bare ref, NO provider prefix
```

## Free Fallbacks

```
deepseek-v4-flash-free
mimo-v2.5-free
nemotron-3-ultra-free
north-mini-code-free
qwen3.6-plus-free
```

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
