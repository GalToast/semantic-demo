# Agent Runtime Topology

This directory is the repo-local ownership boundary for the external agent stack used by Semantic Explorer.

The current runtime is still split across user config, the OpenCode repo, global Pi, and Codex MCP launchers. `runtime-topology.json` records the live non-secret locations and the intended migration target for each piece.

## Current Live Layout

- External subagent MCP source: `C:/Users/HP/repos/opencode/packages/opencode/src/mcp/mmx.ts`
- Local key router source: `C:/Users/HP/.config/opencode/routers/opencode-key-router.mjs`
- Pi harness CLI: `C:/Users/HP/AppData/Roaming/npm/node_modules/@earendil-works/pi-coding-agent/dist/cli.js`
- Browser MCP launchers: `C:/Users/HP/.codex/mcp-runtimes/`
- Web search MCP: `C:/Users/HP/.codex/mcp-servers/searxng-mcp/index.js`

## Migration Rule

Move one seam at a time. Do not copy secrets into this repo. Config files may reference env var names, local ports, model IDs, and launcher paths, but never token values.

## Doctor

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent-runtime-doctor.ps1
```

The doctor reports exact process/config locations and redacts secret-looking command-line values.
