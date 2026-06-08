# M3 Bugsweep — Semantic Explorer (2026-06-07)

## Role
You are a **diagnose-and-report** subagent. **DO NOT EDIT ANY SOURCE FILES.** Your job is to read, analyze, and report. If you find a fix-worthy issue, document it with file:line; do not patch it. The main lane will decide what to fix.

## Working Directory
`C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer`

## Context
- 3D semantic mycelium visualization for Montgomery County TX business relationships.
- Mid-TS-migration: legacy JS in `js/`, parallel Svelte/TS in `src/`. Islands track + src/ track both render InfoPanel.
- Recent activity: 4 bugsweep waves on 2026-06-06/07. **Read those first** to avoid duplicating known findings.
- TS migration is the priority. JS-side refactors that don't advance TS migration are out of scope.

## Pre-existing Sweep Docs (READ FIRST)
- `docs/semantic-demo-bugsweep-2026-06-06-evening.md`
- `docs/semantic-demo-bugsweep-2026-06-07.md`
- `docs/semantic-demo-bugsweep-wave2-2026-06-07.md`
- `docs/semantic-demo-bugsweep-wave3-2026-06-07.md`
- `docs/semantic-demo-bugsweep-wave4-2026-06-07.md`

## Methodology
1. **Adversarial review** (per repo QWEN.md): for every candidate finding, ask:
   - What would make this wrong?
   - What edge cases am I missing?
   - What does the evidence NOT support?
   - What simpler explanation exists?
2. **Verify against source**: every claim about what a function/file does MUST be checked against the actual source. If you claim `ensureFocusStageAuxiliaryDom()` creates 5 elements, open the file and count them. **Do not propagate cascading findings without source verification.**
3. **Use shell tools for verification** (`git diff HEAD`, `dir /B`, `findstr /N`, `git log`). In-process `read_file`/`glob` may return stale data.
4. **Quantify, don't narrate**: cite file:line for every claim. Avoid "may", "could", "possibly" — state what the code does.

## What to Sweep (priority order)
1. **TS migration blockers** in legacy JS state-writer files (`js/modules/app.js`, `js/modules/lifecycle.js`, `js/state.js`, `js/modules/journey.js`, `js/modules/focus-pocket.js`, `js/modules/journey-compass-state.js`, `js/modules/ui-renderers.js`). What is the smallest TS-migration-ready extraction?
2. **Dual-track drift**: `InfoPanel.svelte` (src/) vs `selected-details-svelte-island.ts`/`search-results-svelte-island.ts` (islands). Are both rendering the same DOM? Are their props and stores aligned?
3. **State proxy & withStateMutation gaps**: every `TRACKED_SUB_KEYS` write that bypasses `withStateMutation()`.
4. **WebGL/Three.js resource leaks**: un-disposed textures, geometries, listeners, RAF handles.
5. **Race conditions**: timer pools, AbortController usage, event-bus subscriptions, strand-continuity timers.
6. **CSS mobile cascade**: dead selectors, `!important` smells, ownership leaks, narrow-viewport regressions.
7. **Svelte/TS scaffold quality**: 50 svelte-check errors in legacy `js/modules/*.ts` — what are they? Will porting break the new src/?
8. **Contract test failures**: known pre-existing failures (thread-inspector, field-node, search-no-results, compass-rail, focus-pocket, info-panel-empty, mode-grid). Are these real or stale?
9. **Off-limits write surface violations**: did recent commits touch files in the AGENTS.md off-limits list without lead approval?
10. **Determinism**: any `Math.random()` in geometry/WebGL code (must be `seededUnit()`).
11. **i18n / hardcoded strings**: any new user-facing string that was added without i18n registration (per Global PQ Sweep 2026-06-06).

## Output

Save your findings to **`docs/semantic-demo-bugsweep-m3-2026-06-07.md`** with this structure:

```markdown
# M3 Bugsweep — 2026-06-07

## Summary
- Total findings: N (X HIGH, Y MEDIUM, Z LOW)
- New vs. already-known: N new, M confirmations
- Top 3 risks: ...

## HIGH
### H1: <title>
- File: <path>:<line>
- Verified against source: <function/line range>
- Evidence: <quote or describe>
- Impact: <user-facing or architectural>
- Suggested fix (1 sentence, do not apply)

## MEDIUM
...

## LOW
...

## Verification Notes
- Files actually opened: ...
- Findings rejected after source check: ...
- Open questions for main lane: ...
```

## Constraints
- **No edits.** If a finding tempts you to "just fix it", stop. Document and return.
- **No false regressions.** A function that creates 4 elements is not "missing 1 element" just because the docstring lists 5. Check the actual code.
- **No speculation.** If you cannot verify a claim against source, drop it or mark it "unverified".
- **Do not duplicate** the 4 existing wave docs unless you have *new* evidence.
- **Do not touch** the off-limits write surface in AGENTS.md (CSS mobile cascade, journey/UI state writers, app shell, focus stage, deploy scripts).

## Return
Return a short text summary (≤200 words) with:
1. Path to your findings doc
2. Total count by severity
3. Top 3 issues by impact
4. Any patterns or cross-cutting concerns
