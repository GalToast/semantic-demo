# Subagent Model Latency + TTFT Findings

**Date:** 2026-07-23  
**Context:** While dispatching cleanup-plan audit workers, three consecutive workers on `opencode-zen/deepseek-v4-flash-free` silently hung after `message_end(user)` with no assistant output. Subsequent smoke tests clarified the failure mode is model/prompt-specific, not a harness or wedge-shield bug.

## Confirmed active wedge-shield patches

| Layer | Target file | Marker present |
|------|-------------|----------------|
| L1 | `pi-agent-core/dist/proxy.js` | `Proxy toolcall_end final re-parse patch` |
| L3A | `pi-ai/dist/utils/json-parse.js` | `[pi-ai patch] parseStreamingJson failed:` |
| L3B | `pi-ai/dist/api/openai-completions.js` | `const rawArgs = toolCall.function?.arguments ?? toolCall.arguments;` |

All three layers are live in the installed dist files. The empty-args wedge family is mitigated.

## Model behavior observations

| Model | Prompt type | Result | Notes |
|------|------------|--------|-------|
| `opencode-zen/deepseek-v4-flash-free` | simple text `pong` | `pong` | ~22s total, `turn_end` + `agent_settled` |
| `opencode-zen/deepseek-v4-flash-free` | simple tool call `bash echo tool-smoke-ok` | `tool-smoke-ok` | ~63s total, tool call executed successfully |
| `opencode-zen/deepseek-v4-flash-free` | multi-step audit: read file → follow exactly → write report | silent hang | `message_end(user)` → eternal silence, `assistant_output_seen: false` |
| `nvidia/deepseek-ai/deepseek-v4-flash` | any | 429 rate limit | Hit before first tool call earlier in session |

## Root-cause assessment

- **Not a harness bug:** tool-use path works for simple prompts
- **Not wedge-shield related:** Layer 1/3A/3B all active
- **Not universal model silence:** simple smoke tests pass
- **Most likely cause:** model/provider regression specific to longer multi-step file-I/O prompts on the opencode-zen route

## Recommendations

1. **For simple subtasks:** `opencode-zen/deepseek-v4-flash-free` is usable but slow; budget ~60s TTFT for tool-use tasks
2. **For complex read-file-execute-report workers:** do NOT use `opencode-zen/deepseek-v4-flash-free`; prefer `opencode-zen/mimo-v2.5-free` or `opencode-zen/north-mini-code-free` for now
3. **For nvidia route:** avoid `deepseek-ai/deepseek-v4-flash`; it returned 429 before first tool call in this session

## Next action

Run a 3-way subagent smoke benchmark across:

- `opencode-zen/mimo-v2.5-free`
- `opencode-zen/nemotron-3-ultra-free`
- `opencode-zen/north-mini-code-free`

Measure: time-to-first-token, time-to-tool-call, completion status.
