# Eval Harness

Lightweight eval / A-B rerun harness for subagent dispatches. No framework, no randomness, plain-node ESM using only `node:fs`.

## Files

- `scripts/eval-harness.mjs` — CLI
- `tmp/eval-harness-log.jsonl` — append-only A/B run log
- `tmp/eval-manifest.example.json` — example manifest

## Manifest Schema

Pass a manifest path with `--manifest=<path>`. The harness validates it and prints missing fields + duplicate ids.

```json
[
  {
    "id": "smoke",
    "model": "kilo/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "prompt_path": "tmp/subagent-benchmark/prompt-threadinspector-dom-audit.md",
    "timeout_seconds": 240,
    "expected_evidence": "REPORT DONE MARKER",
    "expected_files": ["tmp/reports/thread-inspector-dom-audit.md"]
  }
]
```

Required fields per run:
- `id` — experiment name
- `model` — provider/model slug
- `prompt_path` — prompt file path
- `timeout_seconds` — numeric timeout

Optional:
- `expected_evidence` — string or regex expected in worker output
- `expected_files` — array of files that must exist after run

## Recording Runs

From the main lane, record each dispatch outcome with `--record`:

```bash
node scripts/eval-harness.mjs --record='{
  "id":"smoke",
  "model":"kilo/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "startedAt":"2026-08-05T00:00:00.000Z",
  "finishedAt":"2026-08-05T00:03:47.210Z",
  "elapsedMs":227210,
  "exit":0,
  "success":true,
  "tokensIn":1200,
  "tokensOut":3400,
  "cost":0.002,
  "notes":"completed"
}'
```

Required fields: `id`, `model`, `startedAt`, `finishedAt`, `elapsedMs`, `exit`, `success`.

Optional: `tokensIn`, `tokensOut`, `cost`, `notes`.

Rows are appended to `tmp/eval-harness-log.jsonl`.

## Summarizing

```bash
node scripts/eval-harness.mjs --summarize
```

Output table (sorted by success rate desc, then latency asc):

```
eval-harness summary
model                                       n   success   latency_ms cost
kilo/nvidia/nemotron-3-nano-omni-30b-a3b...  1    100.0%       227210 0.0020
nvidia/deepseek-ai/deepseek-v4-flash         3      0.0%       245000 -
```

## A/B Protocol

1. **Same prompt, two lanes.** Use the same `prompt_path` and `expected_evidence` across lanes.
2. **Three or more runs each.** Collect ≥3 runs per model/lane before comparing. Treat `n < 3` as anecdotal.
3. **Compare success rate + latency + cost.** Run `--summarize` after each batch.
4. **Deterministic.** No randomness. Failures are rows with `exit != 0` or `success === false`, not exceptions.

## Example Session

```bash
# validate manifest
node scripts/eval-harness.mjs --manifest=tmp/eval-manifest.example.json

# record runs from main lane after dispatch
node scripts/eval-harness.mjs --record='{"id":"a","model":"x","startedAt":"t","finishedAt":"t2","elapsedMs":1,"exit":0,"success":true}'
node scripts/eval-harness.mjs --record='{"id":"a","model":"x","startedAt":"t","finishedAt":"t2","elapsedMs":2,"exit":1,"success":false}'

# summarize
node scripts/eval-harness.mjs --summarize
```
