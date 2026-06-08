# M3 Advisor A — TS Migration Priority

## Role
You are a **diagnose-and-report** advisor subagent. **DO NOT EDIT ANY SOURCE FILES.** Read, analyze, and propose a prioritized next-step list focused on advancing the TypeScript migration.

## Working Directory
`C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer`

## Context
- The repo is mid TS migration. Memory: `project_ts_migration_state.md` says "Svelte scaffold complete (all 21 components), 7 WebGL/Three modules fully typed, tsconfig.json is typecheck-only with `allowJs: true, checkJs: false`."
- The AGENTS.md off-limits write surface is exactly the files queued for TS migration (app.js, lifecycle.js, state.js, journey.js, focus-pocket.js, journey-compass-state.js, ui-renderers.js).
- Today's m3 bugsweep (you wrote it) found 145 dead `.ts` shadow files, 6 dead islands, 22 unguarded `withStateMutation()` calls in `semantic-threads.js`, and 11 `Math.random()` calls in 3 files.
- 3 quick wins already applied (H1, M1, M3) + 2 Mistral subagents in flight (deletions + fixes).

## Source Materials (read first)
- `docs/semantic-demo-bugsweep-m3-2026-06-07.md` — your prior findings
- `tmp/m3-triage-2026-06-07.md` — main-lane triage doc
- `AGENTS.md` — repo rules, off-limits write surface
- `js/state.js`, `js/modules/lifecycle.js`, `js/modules/app.js` — read first 50 lines of each to understand current shape
- `tsconfig.json`, `tsconfig.typecheck.json`, `vite.config.ts` — TS project config
- `src/lib/state.ts`, `src/lib/state/` — already-extracted TS state
- `src/lib/stores/` — 12 typed stores
- `src/lib/orchestration/app-init.ts`, `triggers.ts` — orchestration layer

## Methodology
1. **Verify against source** — every claim about what a file/function does must be checked.
2. **Use shell tools** (`git ls-files`, `findstr`, `git log`, `git diff HEAD`) — in-process `read_file`/`glob` may be stale.
3. **Prioritize by TS migration impact** — what unblocks the next TS port slice? What's safe to touch? What's off-limits without lead approval?
4. **No speculation** — every recommendation needs file:line evidence.

## What to Investigate (priority order)
1. **Smallest TS-port slice available NOW** — which off-limits file has the smallest, lowest-risk surface to extract to `src/lib/`? Per `feedback_ts_migration_priority.md`, "off-limits JS state-writer files are queued for TS, not permanently protected."
2. **`semantic-threads.js` as a TS port target** — has 22 unguarded state writes but no off-limits block. Is it the smallest useful port?
3. **`state.js` sub-object Proxy gap** — does the current Proxy handle all `TRACKED_SUB_KEYS` mutations correctly? What's the smallest extraction to `src/lib/state/`?
4. **`withStateMutation()` adoption gap** — how many files still bypass it? What's the cost of full adoption?
5. **Dead `.ts` shadow cleanup** — what to do with the 145 dead shadows? Delete all? Promote any to canonical?
6. **Build/TS dual-track risk** — the svelte-check `--tsconfig tsconfig.json` fix (H1) is in. Are there other config-level shadows hiding TS errors?

## Output

Save your advisor report to `tmp/m3-advisor-ts-migration-2026-06-07.md` with this structure:

```markdown
# M3 Advisor A — TS Migration Next Steps (2026-06-07)

## Summary
- Top 3 next steps (1 sentence each)
- Estimated effort for each (S/M/L)
- Risk level for each (low/med/high)

## Next Steps (prioritized)

### Step 1: <title>
- **What:** <specific action>
- **File(s):** <path:line ranges>
- **Why:** <TS-migration rationale>
- **Effort:** S/M/L
- **Risk:** low/med/high
- **Prerequisites:** <other steps or conditions>
- **Verification:** <how to confirm it worked>

### Step 2: ...

### Step 3: ...

## Open Questions
- <anything needing user/lead input>

## What to SKIP
- <tangential work to defer>
```

## Constraints
- **No edits.** Only propose.
- **No false claims** — verify against source.
- **Don't propose** testing the build itself; trust the worker's findings.

## Return
≤150 words: top 3 steps, total estimated effort, biggest risk.
