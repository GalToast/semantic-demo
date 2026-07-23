# pi-ai local patch: arg-transport-drop wedge

## Problem
Subagent tool calls on `router-nvidia/z-ai/glm-5.2` arrive with all params as `{}`.
No-arg tools still work because they use schema defaults.

Worker `ocw_c6c1add6` confirmed: every tool call from the agent lost its args.

## Root cause (confirmed in bundled pi-ai)
1. `pi-ai/dist/utils/json-parse.js`: `parseStreamingJson()` silently returns `{}`
   on any parse failure instead of surfacing the error.
2. `pi-ai/dist/api/openai-completions.js`: streaming tool-call args are only
   accumulated from `toolCall.function.arguments`. Providers that emit args at
   top-level `toolCall.arguments` never populate `partialArgs`, so parse
   returns `{}` on the empty string.

## Local patches (applied 2026-07-23)
- `json-parse.js`: throw on malformed/non-object parse results, with `[pi-ai patch]`
  prefix in error message. Agents now see tool-call errors instead of silent empty args.
- `openai-completions.js`: fallback to `toolCall.arguments` when
  `toolCall.function.arguments` is absent.

## Re-apply
Run: `node tmp/patch-pi-ai-args.js`
Safe to run multiple times (idempotent string-replace on known anchors).

## Upstream
Do not upstream. These are local overrides to bundled `pi-ai` dist.
