# Harness Ablation Runner (Upgraded)

Measures the **harness delta** for one fixed model across arms:
  A (loop with test feedback, up to MAX_STEPS), B (one-shot), C (pi-worker stub).
Same model, same tasks — only the loop differs.

## CLI Flags

```
node tools/harness-ablation/run.mjs [flags]
```

| Flag | Values | Default | Env fallback |
|---|---|---|---|
| `--arm` | `A` \| `B` \| `C` \| `both` (A,B) \| `all` (A,B,C) | `both` | — |
| `--task` | `all` \| `task-N` | `all` | — |
| `--repeats` | `N` (>=1) | `1` | `REPEATS` |
| `--max-steps` | `N` | `5` | `MAX_STEPS` |
| `--model` | model id | `nvidia/thinkingmachines/inkling` | `MODEL_ID` |
| `--base-url` | URL | `http://127.0.0.1:8788/nvidia/v1` | `OPENAI_BASE_URL` |
| `--api-key` | key | `sk-none` | `OPENAI_API_KEY` |

Examples:
```bash
node tools/harness-ablation/run.mjs --arm=both --task=task-1 --repeats=1
node tools/harness-ablation/run.mjs --arm=all --repeats=3 --max-steps=5
MODEL_ID=router-abc node tools/harness-ablation/run.mjs --arm=A --task=all
```

## Tasks

`tasks/task-N/{README.md,src/task.js,test/test.js}` — tiny bug fixtures.
Arm A iterates with test feedback; arm B gets one shot; arm C returns a placeholder failure (`TODO: wire real pi worker`). Score = test pass.

## Output

Console table (`task | arm | pass | steps | ms | tokens`) + per-arm summary (`passRate`, `meanMs`, `meanTokens`, `min/max`).

`results/latest.json` (archive saved to `results/archive-timestamp>.json` before overwrite) contains:
- `model`, `repeats`, `arms`, `maxSteps`
- `rows`: per-run records (`task`, `arm`, `run`, `pass`, `steps`, `ms`, `tokens`, `note`)
- `summaries`: per-arm `passRate`, `meanTokens`, `meanMs`, `minMs`/`maxMs`, `minTokens`/`maxTokens`

## Backward Compatibility

Default behavior (`--arm=both`, `--repeats=1`) matches the original MVP output structure, extended with token estimates and archive copies. Existing `runTest()` temp-copy + `package.json` (`type=commonjs`) + `node test` logic is preserved unchanged.
