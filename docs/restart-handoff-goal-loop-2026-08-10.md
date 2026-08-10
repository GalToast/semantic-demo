# Restart handoff — close the goal-loop + cline lanes (2026-08-10)

Author: main lane. WHY: the goal-loop extension + cline provider-cache fix take
effect only after a pi restart (local-package + settings.json changes load at boot).
This note gives the post-restart session the exact first commands.

## AFTER RESTART, do these in order:

### 1. Load + observe the goal-loop extension LIVE (the remaining honest gate)
The extension is registered at C:/Users/HP/.pi/agent/settings.json (extensions array)
-> after a restart pi should load it (import + pi.on('agent_end') hooks registered).
VERIFY IT LOADED with zero errors:
   node --check C:/Users/HP/.pi/agent/extensions/goal-loop.mjs   # syntax
   (if a boot log exists, grep it for 'goal-loop' errors; none = good)
Then WATCH IT LOOP on a real goal:
   node C:/Users/HP/repos/semantic-explorer/tools/goal-loop/goal.mjs set "cond::cmd: [ -f C:/Users/HP/repos/semantic-explorer/tmp/looped-trigger ] || exit 1" 6
   THEN main-lane: create the trigger file (touch tmp/looped-trigger), and work a real
   turn; verify status goes met + the extension printed ACHIEVED. Expected evidence:
   node .../goal.mjs status → status:"met", turnCount>0, lastEvidence contains 'exit=0'.
   ALSO negative case: set a cond::cmd that exit(1)s; verify it fires deliverAs:nextTurn
   (the agent begins another turn carrying the evidence) and NOT an infinite loop
   (budget 6 stops it -> status cleared). Output the self-check too:
   node C:/Users/HP/tmp/goal-loop-selfcheck.mjs   # expects 3/3 PASS lines.
Note: the extension calls ctx.sendMessage({...},{deliverAs:'nextTurn',triggerTurn:true}).
Full chain was source-verified at agent-session.js (deliverAs nextTurn:1086,
inject pending nextTurn:887, agent_end handlers queue continuations:787).

2. Fire the cline deepseek-v4-flash lane (user: "best subagents")
Provider-cache fix staged (router-clinefree added to REASONING_EFFORT_MAPS in
~/.pi/agent/local-packages/pi-model-providers/index.ts). After restart:
   node C:/Users/HP/tmp/direct-mcp-worker.mjs --model clinefree/deepseek/deepseek-v4-flash \
     --name c1-validator --prompt "verify gate EXIT=0; write tmp/validator-c1.md" \
     --timeout 900 --log C:/Users/HP/tmp/c1-validator.out
Model string is clinefree/deepseek/deepseek-v4-flash (harness maps to router-clinefree;
the shim answers on 8793; verified 200/15.6s direct).

3. Update goal + memory when 1 & 2 pass: the goal-loop is definitively superior+observed;
   record 'goal-loop live-verified' + cline-lane-live in docs/subagent-lane-inventory.md.

## Context lock (before restarting/comparing)
- unit gate: GREEN 3687/3687 (EXIT=0 in /tmp/gate-final4.log) — verified main-lane.
- The goal-loop build: tools/goal-loop/evaluator.mjs + goal.mjs (committed a1763193, fd92cf02),
  extension ~/.pi/agent/extensions/goal-loop.mjs (registered), self-check 3/3.
- Runner: /c/Users/HP/tmp/direct-mcp-worker.mjs — the canonical worker launcher.
- logfare upstream generation has been OUT all session (router healthy, forwards,
  no reply) -> until the upstream recovers, nvidia/cline/e-z are the working lanes.