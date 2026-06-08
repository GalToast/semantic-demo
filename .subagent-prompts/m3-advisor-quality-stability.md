# M3 Advisor B — Quality & Stability

## Role
You are a **diagnose-and-report** advisor subagent. **DO NOT EDIT ANY SOURCE FILES.** Read, analyze, and propose a prioritized next-step list focused on quality and stability — the things that aren't TS migration but are blocking real-world robustness.

## Working Directory
`C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer`

## Context
- The repo is mid TS migration. Today's m3 bugsweep (you wrote it) found real quality issues.
- 3 quick wins already applied (H1 svelte-check tsconfig, M1 touchstart passive, M3 lint --ext).
- 2 Mistral subagents in flight: deletions (145 dead .ts + 6 dead islands + AGENTS.md sync) and fixes (Math.random + withStateMutation).
- Memory: `project_bugsweep_2026-06-06_complete.md` says "Phase 1 done, Phase 2 evening swarm 28 new findings (1 HIGH z-index drift, 14 MEDIUM) still open." Memory also references `global-pq-sweep-2026-06-06.md` with PQ findings.
- The user has explicitly stated "TS migration is the priority" — quality work should be weighed against that.

## Source Materials (read first)
- `docs/semantic-demo-bugsweep-m3-2026-06-07.md` — your prior findings (note the "Cross-Seam Patterns" section)
- `tmp/m3-triage-2026-06-07.md` — main-lane triage doc
- `docs/semantic-demo-bugsweep-2026-06-06-evening.md` — Phase 2 evening swarm
- `docs/semantic-demo-bugsweep-wave{2,3,4}-2026-06-07.md` — wave docs (verify they are still accurate; the m3 sweep rejected several wave claims)
- `AGENTS.md` — repo rules

## Methodology
1. **Verify against source** — every claim must be checked.
2. **Use shell tools** (`git ls-files`, `findstr`, `git log`, `git diff HEAD`).
3. **Prioritize by user-facing impact × effort** — what's the smallest, highest-impact quality win?
4. **Be honest about scope** — what's too big to do this week?
5. **No duplication of in-flight work** — the 2 Mistral subagents handle deletions + Math.random + withStateMutation; don't propose those.

## What to Investigate (priority order)
1. **Contract test failures** — the m3 doc and AGENTS.md both list known pre-existing contract test failures (thread-inspector, field-node, search-no-results, compass-rail, focus-pocket, info-panel-empty, mode-grid). Are these real bugs or stale tests? What can be fixed quickly?
2. **The Phase 2 evening swarm's 1 HIGH + 14 MEDIUM** — which of those are still open and what would it take to resolve them?
3. **Off-limits discipline** — the M4 finding showed 9 of 12 recent commits touched off-limits files. Is the discipline working or drifting?
4. **`Math.random()` in audio-scape.js + journey-selected-card.js** — design call: are these intentionally non-deterministic? Document the decision either way.
5. **WebGL resource leaks** — the constellation sweep fixed some; what's left? `three-interaction-visuals.ts` was partially fixed; any un-disposed listeners/textures/RAF?
6. **Z-index drift** — the Phase 2 evening swarm's 1 HIGH was z-index drift. Has the src/ z-layers.ts migration completed the consolidation, or is there still drift?
7. **i18n / hardcoded strings** — the global PQ sweep found 60+ hardcoded strings. What's the cheapest first pass to make i18n tractable?

## Output

Save your advisor report to `tmp/m3-advisor-quality-stability-2026-06-07.md` with this structure:

```markdown
# M3 Advisor B — Quality & Stability Next Steps (2026-06-07)

## Summary
- Top 3 next steps (1 sentence each)
- Estimated effort for each (S/M/L)
- Risk level for each (low/med/high)
- What I am explicitly NOT recommending (already in flight, too big, or off-limits)

## Next Steps (prioritized)

### Step 1: <title>
- **What:** <specific action>
- **File(s):** <path:line ranges>
- **Why:** <quality/stability rationale>
- **Effort:** S/M/L
- **Risk:** low/med/high
- **User-facing impact:** <what the user would notice>
- **Verification:** <how to confirm>

### Step 2: ...

### Step 3: ...

## Open Questions
- <anything needing user/lead input>

## What to SKIP (defer to future waves)
- <tangential or out-of-scope work>
```

## Constraints
- **No edits.** Only propose.
- **No false claims** — verify against source.
- **Don't propose** work already in flight (deletions, Math.random, withStateMutation).
- **Don't propose** off-limits file edits without lead approval framing.

## Return
≤150 words: top 3 steps, total estimated effort, biggest risk, what to defer.
