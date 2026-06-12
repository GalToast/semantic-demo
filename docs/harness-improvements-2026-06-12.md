# Pi Harness Self-Improvement Proposals — 2026-06-12

> Filed per `AGENTS.md` directive: "If the Pi harness, tooling, prompts, switchboard workflow, MCP setup, browser resource policy, or agent instructions create friction and there is a safe upgrade path, improve the harness rather than repeatedly working around it."

This document captures **2 durable improvements** identified during the 2026-06-12 semantic-explorer audit campaign. Each includes: friction observed, root cause, proposed fix, effort estimate, and verification steps.

---

## Improvement 1: Memory Consolidation Tool — Wire a Working Model

### Friction
`pi-hermes-memory` v0.7.15 exposes a `/memory-consolidate` slash command that spawns a child `pi -p --no-session` subprocess. The subprocess inherits `defaultProvider` and `defaultModel` from `settings.json` (currently `direct-minimax` / `MiniMax-M3`).

When the user's default model is broken or rate-limited, consolidation fails silently with:
```
Consolidation process exited with code 1: unknown error
```
This is opaque — the error is empty stderr from the child subprocess.

### Root Cause
- `src/handlers/auto-consolidate.ts:describeConsolidationFailure()` returns `"unknown error"` when stderr is empty
- The retry path (`retryWithoutOverrides: true`) only triggers on regex matches for "model", "not found", etc. — silent crashes don't match
- No way to point consolidation at a known-working model without editing source

### Proposed Fix
**Add a `llmModelOverride` to the hermes-memory config** that points consolidation at a known-working model. Two options:

**Option A (Quick fix — 5 min):** Add to `C:\Users\HP\.pi\agent\settings.json`:
```json
{
  "llmModelOverride": "opencode-zen/mimo-v2.5-free",
  "llmThinkingOverride": "off"
}
```
This works because:
- `mimo-v2.5-free` is a known-working model (validated end-to-end in audit campaign)
- The override only applies to the child `pi -p` subprocess
- Main session still uses `MiniMax-M3`

**Option B (Durable fix — 1-2 hours):** File a PR against `pi-hermes-memory` that:
1. Adds a "fallback model" config field
2. When the primary model fails, auto-retry with the fallback
3. Surfaces the actual error from the child process (no more "unknown error")
4. Logs consolidation attempts and results to a file for debugging

### Verification
- **A:** Run `/memory-consolidate` — should succeed for all 3 stores (memory, user, project)
- **B:** Run `/memory-consolidate` with broken primary model — should auto-fallback to working model
- **B:** Trigger consolidation with empty stderr failure mode — should report actual error, not "unknown error"

### Effort
- **A:** 5 min (config edit + verify)
- **B:** 1-2 hours (PR with tests)

---

## Improvement 2: Build Process Reversion Guard

### Friction
The `npm run build:legacy` and `chore(build):` commit process keeps reverting manual HTML/CSS edits and creating side branches ahead of master. Pattern observed:
1. Make edit to `vector-explorer-polished.html` (e.g., add controls-rail wrapper)
2. Build process stages changes on a side branch (`chore/astgrep-local-dep`, `chore/agent-runtime-local-policy`)
3. Push to master fails with "non-fast-forward"
4. Side branch has the edit, but master doesn't
5. Recovery requires `git checkout -f master` + `git cherry-pick <commit>` + `git pull --no-rebase` + `git checkout --theirs <files>`

This is a **recurring friction** — happened 3+ times during the 2026-06-12 audit.

### Root Cause
- The build process (`scripts/build-app.mjs`) copies `css/*.css` → `dist/svelte/css/*.css` and may re-stage changes
- Auto-format hooks (post-commit, pre-push) may revert manual edits
- Catch-all commits (`chore: catch-all commit for auto-format hook churn`) are too broad
- No pre-commit guard to ensure edits land on the intended branch

### Proposed Fix
**Add a pre-commit hook that:**
1. Checks `git branch --show-current` is `master` (or user's intended branch)
2. Warns if `git diff` includes changes to `vector-explorer-polished.html` or `css/mobile_*.css` (the files most often reverted)
3. After commit, reminds user to push immediately (`git push origin <branch>`)
4. Detects if working tree is on a side branch created by build process and offers to cherry-pick back to master

**Implementation:** Add to `.git/hooks/pre-commit` (or `package.json` `husky` config):
```bash
#!/bin/bash
BRANCH=$(git branch --show-current)
if [[ "$BRANCH" != "master" ]]; then
  echo "⚠️  WARNING: committing to '$BRANCH' (not master)"
  echo "   Build processes often create side branches. After commit, you may need to:"
  echo "   git checkout master && git cherry-pick HEAD && git push origin master"
  read -p "Continue? [y/N] " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then exit 1; fi
fi

# Check for high-risk file edits
if git diff --cached --name-only | grep -qE "vector-explorer-polished\.html|css/mobile_"; then
  echo "⚠️  WARNING: editing high-reversion-risk files. Commit and push immediately."
fi
```

### Verification
- Make an edit to a high-reversion-risk file
- Try to commit on a side branch — should warn
- Commit on master — should succeed with reminder to push
- Build process runs — should not silently revert master edits

### Effort
- **Hook:** 30 min (write + test)
- **Husky integration:** 1 hour (add to `package.json`, configure for team)

---

## How to Use This Document

1. **For quick wins:** Apply Option A of Improvement 1 (5 min) — unblocks memory consolidation today
2. **For durable fixes:** File PRs for Option B of both improvements (2-3 hours total)
3. **For tracking:** Add checkboxes to this doc as improvements ship
4. **For next campaign:** Reference this doc when similar friction arises

## Related Files

- `AGENTS.md` — harness self-upgrade directive
- `docs/semantic-demo-ui-ux-audit-matrix.md` — audit findings that surfaced this friction
- `docs/semantic-demo-atomic-coverage-protocol.md` — coverage gate
- `C:\Users\HP\.pi\agent\pi-hermes-memory\src\handlers\auto-consolidate.ts` — consolidation source
- `C:\Users\HP\.pi\agent\pi-hermes-memory\src\handlers\pi-child-process.ts` — subprocess spawn

## Audit Trail

- **2026-06-12** — Initial filing after audit campaign (this doc)
- TBD — PRs filed, improvements shipped
