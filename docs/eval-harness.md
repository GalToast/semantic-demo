# Eval Harness

Lightweight eval / A-B rerun harness for subagent dispatches. No framework, no randomness, plain-node ESM using only `node:fs`.

## Files

- `scripts/eval-harness.mjs` — CLI
- `tmp/eval-harness-log.jsonl` — append-only A/B run log
- `tmp/eval-manifest.example.json` — example manifest
- `tmp/eval-manifest.assertions.json` — example manifest exercising assertion types

## Manifest Schema

Pass a manifest path with `--manifest=<path>`. The harness validates it and prints missing fields + duplicate ids.

The manifest is a JSON **array** of run objects, or an object with a `runs` array and optional `min_success`:

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
- `assertions` — array of structured assertion objects (see below)
- `min_success` — per-model success-rate threshold for `--ci` (default: `0.8`)

### Assertions

Each run may include an `assertions[]` array. Supported types:

| Type | Required fields | Behavior |
|------|----------------|----------|
| `exact_match` | `target`, `value` | `record[target] === value` (strict equality) |
| `includes` | `target`, `value` | `String(record[target]).includes(value)` |
| `file_exists` | `target` | `existsSync(target)` — target is a file path |
| `json_schema` | `target` | JSON-parses `record[target]`, optionally validates `schema.type` / `schema.required`. Use `path` for dot-separated nested access (e.g. `result.count`). |
| `llm_judge` | `target`, `rubric` or `path` | **As-rubric placeholder.** No MCP dispatch in this harness; evaluated as UNSUPPORTED. |

Example assertions block:

```json
"assertions": [
  { "type": "exact_match", "target": "success", "value": true },
  { "type": "includes", "target": "notes", "value": "completed" },
  { "type": "file_exists", "target": "tmp/report.md" },
  { "type": "json_schema", "target": "output", "schema": { "type": "object", "required": ["result"] }, "path": "result.count" },
  { "type": "llm_judge", "target": "output", "rubric": "must mention the fix", "path": "score" }
]
```

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

## Running Assertions (`--run`)

Evaluate recorded rows against each run entry's assertions and built-in checks (`expected_files`, `elapsedMs <= timeout_seconds`):

```bash
node scripts/eval-harness.mjs --run=tmp/eval-manifest.assertions.json
```

Output:
```
assert-exact: PASS
  ✓ exact_match: success — ok
assert-includes: PASS
  ✓ includes: notes — ok
assert-file: PASS
  ✓ file_exists: tmp/eval-manifest.assertions.json — ok
...
```

If a run has no matching log row, it reports `FAIL` with `no matching log row found`.

## CI Regression Gate (`--ci`)

Same as `--run`, but exits non-zero when:

1. Any assertion or built-in check fails, **OR**
2. Any model's success rate across the full log falls below `min_success` (manifest-level or default `0.8`).

```bash
node scripts/eval-harness.mjs --ci=tmp/eval-manifest.assertions.json
```

On failure the command prints failing verdicts and the CI GATE summary, then exits `1`.

## CI Integration Recipe

Add an npm script to `package.json`:

```json
{
  "scripts": {
    "eval:ci": "node scripts/eval-harness.mjs --ci=tmp/eval-manifest.assertions.json"
  }
}
```

Use it in CI after recording rows:

```bash
# Record outcomes from dispatched runs
node scripts/eval-harness.mjs --record='{"id":"a","model":"x","startedAt":"t","finishedAt":"t2","elapsedMs":1,"exit":0,"success":true}'
node scripts/eval-harness.mjs --record='{"id":"b","model":"x","startedAt":"t","finishedAt":"t2","elapsedMs":2,"exit":1,"success":false}'

# Gate the pipeline
npm run eval:ci
```

For a pre-commit hook (optional), ensure the log is populated before running:

```bash
# .git/hooks/pre-commit
if [ -f tmp/eval-harness-log.jsonl ]; then
  node scripts/eval-harness.mjs --ci=tmp/eval-manifest.assertions.json || exit 1
fi
```

## A/B Protocol

1. **Same prompt, two lanes.** Use the same `prompt_path` and `expected_evidence` across lanes.
2. **Three or more runs each.** Collect ≥3 runs per model/lane before comparing. Treat `n < 3` as anecdotal.
3. **Compare success rate + latency + cost.** Run `--summarize` after each batch.
4. **Deterministic.** No randomness. Failures are rows with `exit != 0` or `success === false`, not exceptions.

## Example Session

```bash
# validate manifest
node scripts/eval-harness.mjs --manifest=tmp/eval-manifest.assertions.json

# record runs from main lane after dispatch
node scripts/eval-harness.mjs --record='{"id":"a","model":"x","startedAt":"t","finishedAt":"t2","elapsedMs":1,"exit":0,"success":true}'
node scripts/eval-harness.mjs --record='{"id":"a","model":"x","startedAt":"t","finishedAt":"t2","elapsedMs":2,"exit":1,"success":false}'

# run assertion evaluation
node scripts/eval-harness.mjs --run=tmp/eval-manifest.assertions.json

# ci gate
node scripts/eval-harness.mjs --ci=tmp/eval-manifest.assertions.json

# summarize
node scripts/eval-harness.mjs --summarize
```
