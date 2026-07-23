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

Run: `node scripts/pi-ai-patch/patch-pi-ai-args.js`
Safe to run multiple times (idempotent string-replace on known anchors).

## Companion local-package auto-apply (2026-07-23)

A Pi local-package sibling now auto-applies BOTH of these patches on every Pi
startup so they survive `npm install` re-pulls of pi-ai dist:

- Package: `~/.pi/agent/local-packages/pi-ai-arg-transport-drop-companion/`
- Registered in `~/.pi/agent/settings.json` packages array
- Uses byte-identical needle/replacement strings to THIS script, so both
  patchers stay mutually idempotent (either detects "already applied"
  via the same `[pi-ai patch]` / `?? toolCall.arguments;` markers and skips).

The in-repo script remains as the per-fresh-clone fallback when
`~/.pi/agent/local-packages/` isn't set up (e.g. CI, fresh checkout that
hasn't run Pi yet); the local-package sibling is the durable auto-apply
path on already-set-up dev machines.

Siblings that form the full empty-args wedge-family shield:

| Package                              | Dist layer patched                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `pi-mcp-args-coercion`               | pi-ai validation.js TypeBox `must be string` for object-valued args                                        |
| `pi-proxy-toolcall-end-reparse`      | pi-agent-core proxy.js toolcall_end final partialJson re-parse                                             |
| `pi-ai-arg-transport-drop-companion` | pi-ai json-parse.js parseStreamingJson throws + openai-completions.js `toolCall.arguments` legacy fallback |

All three co-fire cleanly (different dist layers, different bug corners of the
empty-args wedge family). See `~/.pi/agent/patches/pi-proxy-toolcall-end-reparse.md`
for the compositional-safety table.

## Upstream

Do not upstream. These are local overrides to bundled `pi-ai` dist.
