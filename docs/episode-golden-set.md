# Episode → Golden-Set Bridge

A lightweight flow that connects episodic memory to the eval-harness as regression inputs.

## Flow

1. **Session end** — distill 0–3 high-signal episodes from the session JSONL into `tmp/memory/episodes.jsonl`.
2. **Verify** — curate verified episodes (`verified: true`) with expected artifacts (`assertions`).
3. **Golden manifest** — emit verified episodes as an eval-harness manifest via `scripts/episode-golden-set.mjs --golden`.
4. **Regression** — pipe the manifest into `scripts/eval-harness.mjs --manifest=<file>` for CI gating.

## CLI

| Flag | Behavior |
|---|---|
| `--summarize` | Count episodes by `task_family` + verified ratio. |
| `--golden` | Print verified episodes as a JSON manifest array. |
| `--distill=<transcript.jsonl>` | Append up to 3 candidate episodes extracted from a transcript JSONL (`verified: false`). |

## Episode Schema

Each JSONL line is an episode tuple:

```json
{
  "id": "episode-20260805-9f3a",
  "trigger": "...",
  "action": "...",
  "outcome": "success",
  "lesson": "...",
  "task_family": "harness",
  "verified": true,
  "date": "2026-08-05",
  "assertions": [{ "type": "file_exists", "path": "tmp/reports/webgl-unlock.md" }]
}
```

## Golden Manifest Mapping

- `id` → episode `id`
- `model` → episode `task_family` (used as a model hint)
- `prompt_path` → `tmp/memory/episodes.jsonl#<id>`
- `timeout_seconds` → `300`
- `expected_files` → derived from episode `assertions` where `type === 'file_exists'`

## CI Example

```bash
# generate golden manifest
node scripts/episode-golden-set.mjs --golden > tmp/eval-golden-manifest.json

# validate against eval-harness
node scripts/eval-harness.mjs --manifest=tmp/eval-golden-manifest.json
```
