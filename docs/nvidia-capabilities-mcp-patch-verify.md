# NVIDIA Capabilities MCP — Output Path Patch Verify

## Where the patched source lives

`tools/agent-runtime/mcp/nvidia-capabilities/index.mjs` (5-line change)
`tools/agent-runtime/mcp/nvidia-capabilities/test-outputpath-save.mjs` (new, 7-case regression test)

Both paths are gitignored at the repo level (`.git/info/exclude`). The MCP source
lives in a private config location — this repo is reference-only.

## The fix in one sentence

Calls to `nvidia_image_generate` (and the other named wrappers that pass
`outputPath`) no longer short-circuit to a raw-binary write when the upstream
response content-type is JSON. JSON-wrapped base64 (FLUX, OpenAI-style,
etc.) now flows through the postprocess pipeline and decodes to a real binary
file on disk. Other wrappers (tts, video, document, bio, climate) all flow
through the same patched function, so the fix generalizes.

## Verify the patch is live after MCP client restart

1. Restart the chat client that owns the nvidia-capabilities MCP node
2. Call `nvidia_image_generate` with `outputPath` set and a tiny prompt
3. In PowerShell, peek the saved file's first bytes:
   ```powershell
   Get-Content <output_path> -TotalCount 1 -Head 1
   ```
4. Should start with `FF D8 FF E0` (real JPEG) instead of `7B 22` (the `{` of JSON)

If you see JSON, the patch didn't load — check for a stale process and restart again.

## Run the regression test (no live API call, no quota)

```bash
node tools/agent-runtime/mcp/nvidia-capabilities/test-outputpath-save.mjs
```

Expect: 7 PASS lines and `ALL_PASS`. The test imports the patched source via a
temp shim, runs every code path offline, and never touches a real endpoint.

## Related log entry

`docs/nvidia-cool-shit-catalog.md` → Result Log has the timestamped row for
this fix (bug discovery, patch, audit verdict, OpenRouter cost probe, and
the durable OpenRouter `:free` rule).
