# Agent Runtime Local Policy

`tools/agent-runtime/` and `tests/agent-runtime/` are local runtime workspaces on this machine.

They are intentionally ignored through `.git/info/exclude` instead of tracked `.gitignore` so machine-local launchers, parser experiments, and key-router wiring can live inside the repo folder without being easy to stage or push.

Do not stage or commit files from those paths unless they have been reviewed as sanitized source with no API keys, bearer tokens, JWTs, account IDs, local auth payloads, or secret-derived data.

Current intended split:

- Keep local runtime files in `tools/agent-runtime/` for day-to-day use.
- Keep secrets in user env/config only.
- Keep durable, shareable policy in tracked docs.
- If a sanitized runtime module should become tracked later, remove or narrow the local exclude rule in the same change and run a secret scan before staging.

## Key Router

The canonical local provider router is the universal router on `127.0.0.1:8788`.
It owns provider lanes such as OpenCode Zen, NVIDIA, Mistral, ModelScope, and Kilo.
Do not start a separate NVIDIA-only router on `8787`; that path is retired and should only remain as a compatibility forwarder to the universal router.

Local control lives under `tools/agent-runtime/key-router/` and is intentionally ignored. Use its control script for status/start/stop operations, and stop only exact PIDs proven to own the router port. Do not kill broad `node`, `pwsh`, `powershell`, Qwen, Pi, OpenCode, Codex, or MCP process trees by name.

Safe verification before staging any future runtime file:

```powershell
rg -n "sk-|nvapi-|tvly-|ydc-|eyJhbGci|api[_-]?key|bearer|token|secret" <candidate-path>
git status --short -- <candidate-path>
```
