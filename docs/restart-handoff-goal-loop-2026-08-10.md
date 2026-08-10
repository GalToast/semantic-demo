# Restart handoff v2 — unified goal extension + max-reasoning fixes (2026-08-10)

Author: main lane (second pass). WHY a restart: THREE harness changes only take
effect at boot — (1) the unified goal extension, (2) the router-logfare
REASONING_EFFORT_MAPS fix, (3) settings.json extension array change. This note is
the exact post-restart checklist. After all lanes pass, apply the "live-verified"
marks below and DELETE this file (per AGENTS.md transient-handoff rule).

## What changed since v1 (reconciliation, 2026-08-10)

- **goal.ts now owns the goal-loop contract.** Merged the proven file-state loop from
  `goal-loop.mjs` (deterministic `cond::cmd/file/judge/and/or` evaluator, `goal-state.json`,
  `agent_end` → `ctx.sendMessage({deliverAs:'nextTurn',triggerTurn:true})` source-verified
  continuation, budget/time rails) with the goal tool (agent-operated set/clear/status/
  pause/resume/note/tick + self-eval fallback + `model_select` max-reasoning re-assert).
    - `goal-loop.mjs` retired: renamed `goal-loop.mjs.deprecated-2026-08-10` on disk, removed
    from settings extensions. The unified file auto-discovers as `~/.pi/agent/extensions/*.ts`.
    - Canonical test: `node tools/goal-loop/fake-pi-test.mjs` → **11/11 pass** (goal.ts path).
    - Tool `goal set --condition` now mirrors the same `goal-state.json` the CLI + loop read.
- **router-logfare max-reasoning fix** (user's reported bug): `"router-logfare"` was MISSING
  from `REASONING_EFFORT_MAPS` in `~/.pi/agent/local-packages/pi-model-providers/index.ts`
  (line ~624) — a 2026-08-03 comment claimed it was added but the key never made it into the
  object. Result: `compat.supportsReasoningEffort` never set on router-logfare models, and
  pi's `openai-completions.js` skipped `reasoning_effort` entirely — logfare deepseek never
  reached max. Fixed (line 661, same ladder as kilo/zydit deepseek lanes).

## AFTER RESTART, do these in order

### 1. Verify the unified goal extension LOADED clean + loops LIVE

- `.pi` boot should import goal.ts (auto-discovered) with zero errors.
- FAST: `node --check C:/Users/HP/.pi/agent/extensions/goal.ts`
- Unit: `cd C:/Users/HP/repos/semantic-explorer && node tools/goal-loop/fake-pi-test.mjs` → 11/11.
- REAL LOOP (positive): set a goal whose condition will become true:
    node C:/Users/HP/repos/semantic-explorer/tools/goal-loop/goal.mjs set "cond::cmd: [ -f C:/Users/HP/repos/semantic-explorer/tmp/looped-trigger ] || exit 1" 6
  Then touch `tmp/looped-trigger` and take one normal turn. Expect: `goal.mjs status`
  → status:"met", turnCount>0, lastEvidence contains 'exit=0'. Main-lane saw ACHIEVED line.
- REAL LOOP (negative): set `cond::cmd: exit 1` budget 3; verify it fires
  `deliverAs:'nextTurn'` (agent begins another turn carrying the evidence) and STOPS
  (status: "cleared" after budget) — no infinite loop.

### 2. Verify the max-reason lint for router-logfare (user's interactive complaint)

With the fix active, the interactive picker for logfare deepseek should now offer
`max` in the thinking ladder (was capped at "high"). Direct probe (optional):
    node C:/Users/HP/repos/semantic-explorer/scripts/logfc-per-model-smoke.mjs logfare
Expect reasoning_effort:max accepted and deep output on a hard prompt.

### 3. Fire the cline deepseek-v4-flash lane (user: "best subagents")

    node C:/Users/HP/tmp/direct-mcp-worker.mjs --model clinefree/deepseek/deepseek-v4-flash \
      --name c1-validator --prompt "verify gate EXIT=0; write tmp/validator-c1.md" \
      --timeout 900 --log C:/Users/HP/tmp/c1-validator.out
(harness maps clinefree/* → router-clinefree; shim on :8793; verified 200/15.6s direct.)

### 4. Record + close

When 1–3 pass: append 'goal-loop live-verified' + 'cline-lane-live' to
docs/subagent-lane-inventory.md, update memory, then DELETE this file and the
AGENTS.md transient-handoff block.

## Context lock (before restart)

- unit gate GREEN 3687/3687 (EXIT=0 in /tmp/gate-final4.log).
- goal-loop build: tools/goal-loop/{evaluator,goal,fake-pi-test}.mjs; goal.ts owns contract.
- logfare upstream generation was OUT all session (router healthy, forwards, no reply) —
  while it recovers, nvidia/cline are the working lanes; also note logfare
  deepseek-v4-flash-0731 requires training opt-in on the API key (tier-2 premium);
  plain deepseek-v4-flash is tier-1 free.
- Runner: /c/Users/HP/tmp/direct-mcp-worker.mjs.
