# Agent Runtime Local Policy

`tools/agent-runtime/` and `tests/agent-runtime/` are local runtime workspaces on this machine.

They are intentionally ignored through `.git/info/exclude` instead of tracked `.gitignore` so machine-local launchers, parser experiments, and key-router wiring can live inside the repo folder without being easy to stage or push.

Do not stage or commit files from those paths unless they have been reviewed as sanitized source with no API keys, bearer tokens, JWTs, account IDs, local auth payloads, or secret-derived data.

Current intended split:

- Keep local runtime files in `tools/agent-runtime/` for day-to-day use.
- Keep secrets in user env/config only.
- Keep durable, shareable policy in tracked docs.
- If a sanitized runtime module should become tracked later, remove or narrow the local exclude rule in the same change and run a secret scan before staging.

Safe verification before staging any future runtime file:

```powershell
rg -n "sk-|nvapi-|tvly-|ydc-|eyJhbGci|api[_-]?key|bearer|token|secret" <candidate-path>
git status --short -- <candidate-path>
```
