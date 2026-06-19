# W6 Smell-Swarm — UI/Chrome Slice — Semantic Explorer (2026-06-19)

## Role

You are **Worker 3 of 3** in a coordinated bugsweep swarm. **DO NOT EDIT ANY SOURCE FILES.** Your job is to read, analyze, and report smells/bugs/tech-debt in your assigned slice. If you find a fix-worthy issue, document it with file:line; do not patch it. The main lane will synthesize all three reports and decide what to fix.

You are part of a "thorough accounting" pass: main lane wants a clear net-new vs. already-known split across the engine, state/data, and UI/chrome seams.

## Working Directory

`C:\Users\HP\repos\semantic-explorer`

## Pre-existing Sweep Docs (READ FIRST — non-negotiable)

- `docs/archive/semantic-demo-bugsweep-m3-2026-06-07.md`
- `docs/archive/semantic-demo-bugsweep-wave2-2026-06-07.md`
- `docs/archive/semantic-demo-bugsweep-wave3-2026-06-07.md`
- `docs/archive/semantic-demo-bugsweep-wave4-2026-06-07.md`
- `docs/archive/semantic-demo-ui-ux-audit-matrix.md`
- `docs/archive/wave-11-ux-audit-closure-2026-06-14.md`
- `docs/archive/a11y-audit-2026-06-14.md`
- `docs/archive/audit-reports/` (directory; skim for any UI-chrome work since 2026-06-14)
- `docs/semantic-demo-css-authority-map.md` (if present, otherwise `docs/archive/semantic-demo-css-authority-map.md`)
- `docs/semantic-demo-mobile-state-ownership.md` (if present, otherwise `docs/archive/semantic-demo-mobile-state-ownership.md`)
- `docs/semantic-demo-surface-style-matrix.md`
- `tmp/bridge-retirement-audit-2026-06-19.md` (most recent W5/W6 work)
- `tmp/bridge-audit-2026-06-18.md`

If a finding is already in one of these, mark it **CONFIRMED (known)** with the original finding id. If it is new since 2026-06-14, mark it **NEW**.

## Your Slice — UI, Chrome, Components, CSS, Svelte Modules

### Primary files (READ + ANALYZE)

- `src/components/*.svelte` (READ ONLY — do not analyze diffs on off-limits files; another session owns Canvas.svelte and Filters.svelte)
- `src/lib/ui/**`
- `src/lib/ui-renderers.ts`
- `src/lib/navigation-actions.ts`
- `src/lib/z-index.ts`
- `src/lib/keyboard/**`
- `src/lib/audio/**`
- `src/lib/demo/**` (micro-demo choreography)
- `css/**` (every file; per the CSS ownership map, ordered modules)
- `js/modules/**` (every file; bridge shims, focus stage, journey, etc.)
- `vector-explorer-polished.html` (read only — it is the app shell, large but important for ownership checks)
- `case-study.html` (read only — note any lingering cross-references to dead `js/` paths)
- `micro-demo.js` (legacy bundle entry)

### Off-limits (DO NOT OPEN OR ANALYZE IN DETAIL)

```
M src/components/Canvas.svelte          (parallel session owns)
M src/components/Filters.svelte         (parallel session owns)
M src/lib/orchestration/parity-attrs.svelte.ts
M src/lib/stores/lifecycle.ts
M tests/cluster-filter-city-filter-side-effect-contract.mjs
M tests/cluster-filter-contract.mjs
M tests/cluster-filter-dewindowing-contract.mjs
M tests/composition-state-invariant-contract.mjs
M tests/journey-thread-inspector-contract.mjs
M tests/lifecycle-composition-contract.mjs
M tests/step-inside-state-sync-contract.mjs
M tests/surface-contract-check.mjs
M tests/thread-inspector-dewindowing-contract.mjs
M tests/verify-svelte-migration.mjs
M vite.config.ts
?? tmp_check_dive.mjs, tmp_check_dive2.mjs, tmp_check_dive3.mjs, tmp_check_search.mjs, tmp_lc_diag.mjs
```

## Methodology

1. **Adversarial review**: for every candidate finding, ask "what would make this wrong?", "what edge case am I missing?", "what does the evidence NOT support?"
2. **Verify against source**: every claim about what a function/file does MUST be checked against the actual source.
3. **Cite file:line** for every claim. Avoid "may", "could", "possibly" — state what the code does.
4. **Use shell tools for verification** (`git diff HEAD`, `find`, `rg`). In-process reads may return stale data.

## What to Sweep (UI/chrome-specific priority)

1. **CSS ownership leaks**: per the css authority map, ordered modules. Find any selector that crosses module boundaries, any `!important` smell, any dead selector (no DOM match in the static HTML or Svelte templates), any narrow-viewport regression. **Verify dead-selector claims** by searching the Svelte templates and the static HTML — a selector in `css/foo.css` that has no match in any `.svelte` or `vector-explorer-polished.html` is a candidate; do not declare a regression without counting matches.
2. **Mobile cascade / state ownership**: any new mobile-state helper that overlaps with the existing mobile-state-ownership map. Verify against `docs/semantic-demo-mobile-state-ownership.md`.
3. **DOM listener leaks**: any `addEventListener` in `js/modules/**` or `src/lib/ui/**` without a paired `removeEventListener` on a known dispose path. Especially: scroll listeners, ResizeObservers, IntersectionObservers, focus/blur listeners on the document.
4. **Keyboard / a11y**: focus-trap correctness, ARIA roles/attributes, keyboard navigation parity, any a11y regression since the 2026-06-14 audit closure.
5. **Z-index / stacking**: any new z-index literal that doesn't appear in `z-index.ts`; any stacking-context regression in `info-panel`, `compass-rail`, `filters`, or `search-chrome`.
6. **Svelte component hygiene**: each `.svelte` file's `<script>` (lang=ts vs lang=js), `$state`/`$derived`/`$effect` correctness, `$:` legacy usage, mixed `onclick=` / `addEventListener` patterns, prop typing completeness.
7. **Surface contract tests**: `tests/surface-contract-check.mjs` is on the off-limits list. But the underlying surface contract claims live in `docs/semantic-demo-surface-style-matrix.md`. Identify any surface in the matrix that the contract test would now fail on (based on the static HTML and Svelte templates) — but report only, do not edit.
8. **i18n / hardcoded strings**: any new user-facing string added without i18n registration (per Global PQ Sweep 2026-06-06). Look at `js/modules/**`, `src/components/*.svelte`, `src/lib/ui/**`, and `vector-explorer-polished.html`.
9. **Micro-demo choreography**: `js/micro-demo.js` / `src/lib/demo/choreography.ts` owns first-visit eligibility. Verify the eligibility logic is sound (no double-fire, no missed fire, no state desync between legacy and TS paths).
10. **Audio / keyboard / focus** module dead exports, unused props, unreachable code paths.
11. **Off-limits touch check**: are any of the off-limits files in your slice? If so, hand them off to main lane — do not analyze.

## Output

Save your findings to **`tmp/smell-ui-2026-06-19.md`** with this structure:

```markdown
# UI & Chrome Smells — 2026-06-19

## Summary

- Total findings: N (X HIGH, Y MEDIUM, Z LOW)
- Net-new (not in prior sweeps): N
- Confirmations of prior findings: M
- Top 3 risks: ...

## Cross-reference to prior sweeps

| Finding | Prior sweep ref       | Status                    |
| ------- | --------------------- | ------------------------- |
| ...     | wave-11-2026-06-14 M3 | CONFIRMED (still present) |
| ...     | (none)                | NEW                       |

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
- **Do not duplicate** prior wave docs unless you have _new_ evidence.
- **Do not open or modify** anything in the off-limits list above.
- **Do not run `npm run build` or `npm test`** — you are read-only. If you need to verify a build, report it to main lane instead.
- **Wall budget: 3600s (1 hour).** Use the time to be thorough; do not race.

## Return

Return a short text summary (≤200 words) with:

1. Path to your findings doc
2. Total count by severity, with net-new vs. known split
3. Top 3 issues by impact
4. Any patterns or cross-cutting concerns that the other two workers should know about
