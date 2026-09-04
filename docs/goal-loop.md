# Goal loop architecture

The goal loop has one runtime owner: `C:/Users/HP/.pi/agent/extensions/goal.ts`.
It owns the reducer, condition parser/evaluator, file-state schema and
normalization, atomic state writes, transition logic, Pi tool/command hooks,
and `agent_end` continuation behavior. It is enabled by default in Pi settings.

The repo files are adapters and proof fixtures, not competing implementations:

- `tools/goal-loop/evaluator.mjs` is a compatibility facade over the exported
  engine in `goal.ts`.
- `tools/goal-loop/goal.mjs` is the CLI facade for the same state schema and
  transition function.
- `tools/goal-loop/fake-pi-test.mjs` is a runtime-contract fixture; it uses
  per-process files under `C:/tmp` and never touches the real inheritance mirror.
- `C:/Users/HP/.pi/agent/extensions/goal-loop.mjs.deprecated-2026-08-10` is
  archived only and is not registered.
- The external-subagents broker reads the legacy projection to seed a worker's
  own goal state and prompt. On Windows its default OpenCode route uses the
  native `opencode.exe` so prompt metacharacters cannot be re-parsed by
  `cmd.exe`; `mcp_profile:none` uses Qwen `--safe-mode` to prevent global MCP
  startup leakage.

## Invariants

- Branch/session entries are the interactive source of truth; the normalized
  `goal-state.json` file is the headless/CLI transport boundary.
- A worker gets its own state path. Only the main process updates the parent
  inheritance mirror; paused, cleared, and met states are never inherited as
  running work.
- State writes are bounded and use a same-directory temporary file plus rename.
  Invalid running records become cleared rather than phantom loops.
- Deterministic command/file checks are evaluated by the shared engine. Judges
  fail closed: no explicit `GOAL: MET` or `GOAL: NOT MET` means no budget burn and
  no automatic follow-up.
- Compound conditions preserve nesting and quoted commas and are capped at 16
  parts. Payloads are capped at 4,000 characters, evidence at 240 characters,
  and the ledger at 32 entries.
- A continuation is delivered as `followUp`, never the retired `nextTurn`+
  `triggerTurn` combination. Pending-message and in-flight guards prevent
  duplicate turns.
- The loop is capped at 50 turns or 30 minutes. Provider failures are not goal
  progress and do not trigger a second retry loop.

## Upgrade ledger — 2026-09-04 (v3: cross-dialect absolute-path resolution)

The current evolution plan is deliberately split between shipped invariants and
the one active seam that still needs a lane-owned implementation:

0. **Cross-dialect `cond::file` resolution — shipped 2026-09-04 (v3).** An
   absolute path written by the agent through the bash tool (Git Bash POSIX
   mount, e.g. `/c/tmp/x`) is not identical to the same file under Node's `fs`
   (`C:\tmp\x`), and both differ from the POSIX temp root (`/tmp/x`). The
   engine's `isAbsolute()` is `true` for all three, so the old single-form check
   reported `file MISSING` for artifacts the agent had just written and re-fired
   the goal loop every turn. `evaluateParsedCondition` now enumerates dialect
   variants of an absolute path (`absolutePathVariants`) and tries each before
   declaring a miss. Verified: `/c/tmp/...`, `C:/tmp/...`, and `/tmp/...` all
   resolve to the same artifact; a genuinely missing path still reports MISSING
   with the tried list. Test: `node tools/goal-loop/fake-pi-test.mjs` (11/11),
   plus a live `goal.mjs set cond::file:/c/tmp/...` + `step` round-trip.

1. Single runtime owner for goal reduction and continuation — shipped in
   `C:/Users/HP/.pi/agent/extensions/goal.ts`.
2. Default goal activation with an explicit extension-loader check — shipped.
3. Parent-goal inheritance with `inherit_goal=false` isolation for smoke,
   one-shot, and disabled-steering workers — shipped in the external broker.
4. Atomic state transport, branch/session separation, and stale-state clearing —
   shipped.
5. Deterministic condition DSL with fail-closed judge handling — shipped.
6. Duplicate-turn, pending-message, provider-error, stall, and budget guards —
   shipped and covered by focused tests.
7. CWD/session reset and adversarial false-positive coverage — shipped.
8. Machine-readable progress/telemetry and task integration — shipped; the next
   useful increment is optimistic state versioning for concurrent writers.
9. Switchboard direct-message attention, deduped doorbells, incremental inbox
   reads, and missed-doorbell recovery — shipped; durable attention is not a
   process wake-up.
10. Bounded idle-lane wake delivery — pending in the active lane extension:
    opt-in watcher, incremental cursor, message-id dedupe, busy/pending guard,
    cooldown, wake/goal budgets, TTL, acknowledgement, and explicit stop.

The next two independent hardening increments are optimistic state versions and
provider model-health evidence (catalog presence, route readiness, and recent
completion results as separate fields). Neither should be implemented as an
unbounded retry loop.

## Verification

Run the focused checks after changing the engine:

```text
node C:/Users/HP/.pi/agent/extensions/tests/verify-goal.mjs
node C:/Users/HP/.pi/agent/extensions/tests/test-goal-loop-hardening.mjs
node C:/Users/HP/.pi/agent/extensions/tests/test-goal-loop-continuation.mjs
node C:/Users/HP/.pi/agent/extensions/tests/test-goal-default-activation.mjs
node tools/goal-loop/fake-pi-test.mjs
```

Also load the extension through Pi's actual loader and confirm it reports one
extension and zero load errors. A fresh Pi reload is required before a running
session observes source changes; the external-subagents MCP process likewise
needs one targeted reload before it observes broker `src/mmx.ts`/`dist/mmx.js`
changes. Do not broad-restart active Pi or MCP process trees under memory
pressure.

## Frontier comparison boundary

This implementation is stronger than a basic continuation helper on runtime
state safety, deterministic checks, bounded persistence, provider-error
handling, and duplicate-turn prevention. It is not a claim of full Frontier
Infra ADL parity: ADL's separate contract/proof design adds signed Warden
proofs, independent witness logs, and a stop gate. Those are a future optional
evidence layer, not a second evaluator to embed here.
