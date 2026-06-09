---
name: EXTERNAL_SUBAGENT_PROMPT_WRAPPER_REGRESSION
description: Detect and work around external-subagent prompt replacement/regression where the launched worker receives a generic prelude instead of the requested task prompt, including model-specific wrapper behavior and minimal verification patterns.
source: auto-skill
extracted_at: '2026-06-09T05:55:20.000Z'
---

# External Subagent Prompt-Wrapper Regression

Use this when you dispatch an external worker and the on-disk/log evidence shows the worker did not receive the intended task prompt. It is specific to prompt-fidelity failures, not generic worker slowness or model-quality issues.

## When to Use

- A worker starts successfully but performs generic repo inspection instead of the scoped task.
- `prompt.txt` or launch `stdout` shows a short fixed prelude instead of your task prompt.
- The same MCP route/model family passes prompts correctly for one worker but not another.
- A model advertised as reliable for a task family is untrustworthy because the wrapper drops the user prompt before execution.

## When NOT to Use

- Worker received the prompt correctly but simply chose a bad plan.
- Worker failed because of missing tools, permissions, timeout, or `pid_alive: false`.
- The failure is in the model's reasoning quality, not the prompt-transport layer.

## Detection Checklist

1. Read the worker directory artifacts:
   - `prompt.txt`
   - `stdout.log` first 160 lines
   - `stderr.log`
2. Check the spawn-return `live.last_text_preview` and `command_preview` for the actual `--prompt` argument.
3. Confirm one of:
   - `prompt.txt` contains only a generic scaffold ("You are an external subagent...")
   - `last_text_preview` shows a replacement prompt instead of the task brief
   - Worker's first tool calls contradict the requested scope

## Minimal Proof Pattern (copy into notes)

```text
Worker: <worker_id>
Requested model: <model>
Spawned model: <model from spawn response>
Prompt file: <path>/prompt.txt
Prompt bytes: <file size>
Prompt text: <first 120 chars or "matches requested task">
Worker start evidence: <first action from stdout>
Expected vs actual first action: <mismatch summary>
Root cause: wrapper replacement / unchanged passthrough / transport truncation
```

## Why This Matters

The main lane can falsely classify a prompt-fidelity failure as a model-quality failure. The two share symptoms (worker does irrelevant work) but require opposite mitigations:

- Model-quality failure -> change model or shrink task scope.
- Prompt-wrapper failure -> change model, wrapper config, or transport route; do not just rerun unchanged.

## Fast Recovery

1. Cancel the affected worker.
2. Re-dispatch on a verified passthrough model (same MCP route, known to preserve prompts).
3. If the same wrapper acts on multiple models, treat the entire MCP node as unsafe for task-specific prompts until the shim is fixed.
4. Do not re-run the same prompt on the same wrapper unchanged.

## Related Skills

- SUBAGENT_DELEGATION_GUIDE — general dispatch and tier/scope decisions.
- DOUBLE_WORKER_VERIFICATION — verify worker claims on disk after dispatch.
