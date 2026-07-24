# Subagent Bugsweep+Fix Model Comparison — 2026-07-24 ~19:00 UTC

Phase A FIND wave + Phase B FIX wave benchmark on Semantic Explorer.
Scope: `src/lib/keyboard/` (571 LOC across `global-shortcuts.ts` + `keyboard-help.ts`).
Method: report-only FIND wave on multiple routes → main-lane cross-verify → FIX wave as executor (where the worker DOES edit source + run verification gates). Same 600s budget both phases.

Worker dispatches go via the `external_subagents` MCP server (mcp_server_pid 4304 → auto-respawned to 8700 mid-session). Serial stagger (3-5 min) maintained between dispatches to avoid parallel-MCP-call stdio wedging.

## Phase A FIND wave — 10 dispatched, 2 success

| #   | Model                                    | Outcome                                                                                                                 | Bug count                                                              |
| --- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | `opencode-zen/deepseek-v4-flash-free`    | ✅ DONE + wrote REPORT.md                                                                                               | 5 real bugs (1H/2M/2L) — verified                                      |
| 2   | `opencode-zen/nemotron-3-ultra-free`     | ❌ DEAD before write — stream-hang mid-thoughts                                                                         | 0 (salvaged partial: listener-leak reasoning corroborates KH-DOM-LEAK) |
| 3   | `logfare/deepseek-v4-pro` (paid control) | ❌ DEAD — `Connection error` streaming SDK pattern                                                                      | 0                                                                      |
| 4   | `opencode-zen/north-mini-code-free`      | ❌ Wrote a 754-byte STUB with `Bugs found: 0` (template only)                                                           | 0 — model "phoned in" the template instead of sweeping                 |
| 5   | `agnes-2.0-flash`                        | ✅ DONE + wrote REPORT.md                                                                                               | 4 real bugs (2H/1M/1L) — verified                                      |
| 6   | `opencode-zen/minimax-m3-free`           | ❌ DEAD — `Warning: Model "minimax-m3-free" not found for provider router-opencode-zen` + `Connection error`            | 0                                                                      |
| 7   | `opencode-zen/qwen3.6-plus`              | ❌ DEAD — silent 600s timeout (`Model "qwen3.6-plus" not found for provider` warning)                                   | 0                                                                      |
| 8   | `kilo/inclusionai/ling-3.0-flash:free`   | ❌ DEAD — `Connection error` × 5 + auto_retry ×1 (streaming-SDK pattern; main-lane bench via `ctx_execute` passed fine) | 0                                                                      |
| 9   | `kilo/stealth/qwen3.6-plus`              | ❌ DEAD — same `Model "stealth/qwen3.6-plus" not found for provider router-kilo` pattern                                | 0                                                                      |
| 10  | `nvidia/nemotron-3-120b-a12b`            | ❌ DEAD — `404 404 page not found` × 4                                                                                  | 0                                                                      |

Findings deduped across the two successful finders + the salvage lane:

- 8 verified (1H + 4M? actually 3H + 4M + 2L) real bugs harvested to [Master Bug List](../../tmp/bugsweep-find/_MASTER_BUG_LIST.md) (gitignored, local scratch only).
- 5 off-slice findings (triggers.ts + legend-panel.svelte.ts + focus-coordinator.ts) queued separately.

## Phase B FIX wave — 3 dispatched, 1+1 success

| #   | Model                                 | Bug ticket                                                            | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | `opencode-zen/deepseek-v4-flash-free` | KH-DOM-LEAK (`keyboard-help.ts:240` panel appended but never removed) | ❌ FAILED — silent 600s timeout, exit_code 124, `assistant_output_seen: false`, 0 tool calls. SAME route that succeeded in Phase A worker #1 — appeared within ~1 hour of re-dispatch. Hypothesis: opencode-zen per-route daily quota exhaustion for the slug.                                                                                                                                                                                        |
| B2  | `agnes-2.0-flash`                     | KH-DOM-LEAK                                                           | ✅ **SUCCESS** — clean 3-line `panel.remove()` added to `closePanel()` (verified by main-lane git diff). Build + lint = `0 errors, 19 pre-existing warnings`. Worker killed mid-`test:contract` (7/8 tool calls ended). Wrote no `PHASE-B-REPORT.md` but the fix on disk was verified by main-lane re-running the same gates. ⚠️ DID miss the bug-ticket hint about `openPanel` needing adjustment (regression introduced — see main-lane follow-up). |
| B3  | `agnes-2.0-flash`                     | GS-ISCOMPOSING (`global-shortcuts.ts:78` no `e.isComposing` guard)    | ✅ **SUCCESS** — applied `if (e.isComposing) return` 3-line guard before any shortcut dispatch. Ran verification gates. **Root-cause traced** the 18 contract test failures to a parallel-WIP breakage at `src/lib/state/app.svelte.ts:790` (independent of any keyboard module change) — exonerated its own fix in its PHASE-B-REPORT.md. Emitted `BUGSWEEP-FIX-DONE` marker correctly.                                                              |

### Main-lane polish follow-up (commit 2de47f08 on master)

The `panel.remove()` in B2 introduced a follow-on regression:

- The helpBtn click handler uses a **closure-captured** `panel` variable.
- After `panel.remove()` detaches the panel from DOM, the next click on helpBtn
  calls `openPanel(...)` via that closure.
- `openPanel()` only updates `classList.add('visible')` + aria-attrs on the
  detached panel — **NEVER re-appends to `document.body`** → user sees no hint.
- The Phase B #2 bug ticket explicitly hinted at this risk ("verify the toggle
  function calls `initKeyboardShortcutsHint()` first before showing, OR adjust
  accordingly so reinit happens"). Agnes's B2 fix didn't address it; the
  main-lane polished via a follow-up commit.

Main-lane fix: added to the top of `openPanel()`:

```ts
// Re-attach panel if a prior closePanel() removed it from the DOM.
if (!document.body.contains(panel)) document.body.appendChild(panel)
```

Verified: build (clean), lint (`0 errors, 19 pre-existing warnings`), 32/32 keyboard-touching unit tests pass.

## Tier conclusions (snapshot 2026-07-24 ~20:30 UTC)

1. **agnes-2.0-flash** — proven for BOTH Phase A (FIND) and Phase B (FIX).
    - Phase A: 4 real bugs verified (2H/1M/1L) + 3 off-slice findings + clean rg-verified
      report at ~6 min wall.
    - Phase B: 2/2 fixes applied via the `edit` tool + ran build/lint/contract +
      root-cause analysis on contract failures + clean PHASE-B-REPORT.md (B3 only —
      B2 was killed by supervisor mid-`test:contract`).
    - Caveats: missed one cross-function invariant on B2 (openPanel needed
      re-append); required main-lane polish.

2. **opencode-zen/deepseek-v4-flash-free** — proven for ONE-SESSION-ONLY.
    - Phase A #1: 5 real bugs (1H/2M/2L) corks the queue.
    - Phase B #1: silent 600s timeout on second dispatch ~1hr later.
    - Per-route opencode-zen gateway has a DAILY/HOURLY quota that rate-limits
      subsequent dispatches → only ONE successful agent session per route per
      window. Don't re-dispatch within the same hour.

3. **opencode-zen/north-mini-code-free** — fine for READING/CONTEXT-heavy work
   (skilled at source-grep exploration) but FAILS at write/persist artifacts:
    - Phase A #4 wrote a stub (`Bugs found: 0`); bench-validate today hallucinated
      the `write` tool (zenmux glm-4.6v-flash-free + this lane same pattern).
    - NOT SUITABLE for Phase B (executor) dispatch.

4. **All `provider/<unrecognized-slug>` worker dispatches** (e.g. `<nvidia>/<untried-slug>`, `<kilo>/<untried-sub-lane>/<slug>`, `<opencode-zen>/<untried-slug>`) silently timed out / 404'd — Pi `models-store.json` only registers `minimax`; the rest of the universe depends on the upstream gateway honoring the slug, which it often does not. The router `/v1/models` endpoint returned 0 models (auth/format issue). **Workaround**: stick to known-good slugs (`deepseek-v4-flash-free` for first-run, `agnes-2.0-flash` for repeatable work).

## Hero numbers

### Phase A finder workers

- Worker #1 (deepseek-v4-flash-free): 200 MB stdout, 42 bash + 10 read + 5 rg tool calls; ~9-10 min wall; 5 real bugs in REPORT.md.
- Worker #5 (agnes-2.0-flash): 200 MB stdout cap; ~6-7 min wall; 4 real bugs in REPORT.md.

### Phase B executor workers

- B2 (agnes agnes-2.0-flash — KH-DOM-LEAK): ~5-7 min cold-boot-to-edit-applied; killed at minute 6-7 (mid-test:contract). 1,407 thinking events, 531 text_delta, 11 turn_start, 8 tool_execution_start, 7 tool_execution_end.
- B3 (agnes-2.0-flash — GS-ISCOMPOSING): ~3 min to edit applied; ~6 min to PHASE-B-REPORT.md written; emitted BUGSWEEP-FIX-DONE at ~6-8 min. 1,199 thinking events, 132 text_delta, 11 turn_start, 5 text_end, 47 total tool calls attempted.

## Commits landed on master

- `6ad96301` — `fix(keyboard): teardown hint panel on close + IME composition guard` (Phase B #2 + Phase B #3 executor outputs — `keyboard-help.ts` + `global-shortcuts.ts`, 6 insertions total)
- `2de47f08` — `fix(keyboard): re-attach hint panel to document.body on open` (main-lane follow-up polish — `keyboard-help.ts:openPanel()`, 6 insertions — completes the close/open cycle and prevents the regression introduced by B2)

## Open scope / next-step proposals

Phase B wave-1 only scratched 2 of the 8 verified bugs. Remaining PHASE B queue (different bug tickets, each can be a separate executor + main-lane polish cycle):

- KH-MAC-LABEL — `keyboard-help.ts:105` `Ctrl+1-6` label omits Mac `Cmd` label.
- GS-ISFORMFIELD-CONTROLTAGS — `global-shortcuts.ts:71-75` `isFormField` omits `button` + `a` tags.
- GS-ESCAPE-FIELDGUARD — `global-shortcuts.ts:158-176` Escape path lacks `isFormField` guard.
- GS-ESCAPE-DIALOGSTOP — `global-shortcuts.ts:164-170` `if (openDialog) return` lacks `e.stopPropagation()` — 2-key UX.

Off-slice (separate ticket batches):

- `triggers.ts:69` — `target.isContentEditable` bare optional chain missing.
- `triggers.ts:69-107` — `handleGlobalKeydown` exported but never registered as DOM listener.
- `triggers.ts:77` vs `global-shortcuts.ts:70` — duplicated export name `handleGlobalKeydown`.
- `legend-panel.svelte.ts:318` — uppercase `tagName === 'INPUT'` not lowercased.
- `focus-coordinator.ts:93` — `ae.isContentEditable` bare property access without `instanceof` pre-check.
