# Agent Runtime Topology

This directory is the repo-local ownership boundary for the external agent stack used by Semantic Explorer.

The current runtime is still split across user config, the OpenCode repo, global Pi, and Codex MCP launchers. `runtime-topology.json` records the live non-secret locations and the intended migration target for each piece.

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent-runtime-doctor.ps1
```

The doctor reports exact process/config locations and redacts secret-looking command-line values. Do not commit API keys, bearer tokens, account IDs, or secret file contents here.
