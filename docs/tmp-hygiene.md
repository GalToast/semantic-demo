# tmp/ Hygiene Policy

**Effective:** 2026-08-18  
**Owner:** Main lane + all subagent workers

---

## Rule

`tmp/` = **intransient working state**. Files here are scratch: probe scripts, JSONL logs, worker reports, debug notes. They belong on disk only — never in the index.

- **Durable artifacts** (reports, evidence, specs) → `docs/` or `docs/reports/`
- **Subagent worker outputs** → worker `out_dir` (specified in role file), not `tmp/`
- **Runtime script artifacts** (logs, manifests, health JSON) → OK in `tmp/` if written by `scripts/` at execution time, but **never committed**

**Never `git add -f tmp/`.** If a tmp/ file needs to be tracked, it has already graduated — move it to `docs/` first.

## Pre-Push Guard

Add this to your pre-push hook or CI gate:

```bash
#!/usr/bin/env bash
# Check: no tmp/ files should be tracked
TRACKED=$(git ls-files tmp/ 2>/dev/null)
if [ -n "$TRACKED" ]; then
  echo "ERROR: tmp/ contains tracked files (should be untracked):"
  echo "$TRACKED"
  echo ""
  echo "Fix: git rm --cached $(git ls-files tmp/)"
  exit 1
fi
```

Current tracked count at policy inception: **43 files** (see `tmp/swarm-tmp-audit-20260818/lane-a/cleanup-list.txt`).

## One-Command Sweep

To clear all currently-tracked tmp/ files in one shot:

```bash
git rm --cached $(git ls-files tmp/)
```

Files remain on disk. The `.gitignore tmp/` rule (present since repo creation, line 6 of `.gitignore`) will prevent future accidental re-tracking — unless someone runs `git add -f tmp/...`.

## Exceptions

The following runtime paths in `package.json` and `scripts/` are **expected** to write to `tmp/` at execution time. Their outputs are not tracked:

- `scripts/eval-harness.mjs` → `tmp/eval-harness-log.jsonl`
- `package.json:eval:ci` → `tmp/eval-manifest.ci.json`
- `package.json:models:capability-status` → `tmp/phone-model-parity/`, `tmp/phone-model-health/`

If you need to preserve an artifact from these scripts, copy it to `docs/` before the next sweep.
