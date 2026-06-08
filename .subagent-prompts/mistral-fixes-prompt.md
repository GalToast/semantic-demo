# Mistral Subagent 2 — Math.random() + withStateMutation Fixes

## Role
You are a **fix-and-verify** subagent. You will edit specific files within your scope. Use source verification before each change. Stay inside your scope.

## Working Directory
`C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer`

## Source of Truth
Read `docs/semantic-demo-bugsweep-m3-2026-06-07.md` sections **H4** (Math.random) and **M2** (semantic-threads) for evidence.

## Scope (you MAY touch)
1. `js/modules/weather-ui.js` (lines 222-257, 8 Math.random() calls)
2. `js/modules/journey-selected-card.js` (line 224, 1 Math.random() call)
3. `js/modules/audio-scape.js` (lines 149, 151, 2 Math.random() calls)
4. `js/modules/semantic-threads.js` (22 unguarded state writes)

## OUT OF SCOPE (do NOT touch)
- All other files
- `package.json`, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`
- The 145 dead `.ts` shadows and 6 dead island files (other subagent handles)
- TS migration queue files: `js/modules/app.js`, `js/state.js`, `js/modules/lifecycle.js`, `js/modules/journey.js`, `js/modules/focus-pocket.js`, `js/modules/journey-compass-state.js`, `js/modules/ui-renderers.js`

## What to SKIP
- Don't re-read the full findings doc. Read only H4 and M2.
- Don't re-verify "Math.random() is bad" — that decision is made. Just execute the fix per the canonical pattern.
- Don't refactor the surrounding code. Smallest change only.
- Don't run the full test suite. `npm run check:shell` as a final smoke test only.

## Canonical Pattern (read this once)
`js/modules/utils/seeded-random.js` exports `seededUnit(index, salt)`. The previous constellation sweep replaced Math.random in `js/modules/three-search-animations.js:126,135,137` with `seededUnit(index, salt)`. **Read that file first** to see the canonical import and call pattern.

For `withStateMutation`: import from `js/state.js`. Pattern:
```js
import { withStateMutation } from './state.js';

withStateMutation(() => {
  state.semanticThreadsStatus = 'loading';
  state.semanticThreadsLoadPromise = promise;
});
```

## Tasks

### Task 1 — Replace `Math.random()` in `js/modules/weather-ui.js`
8 calls at lines 222, 223, 224, 235, 236, 237, 238, 239, 257 (worker reported 8 instances).
For each call:
- **Per-element effect (rain/snow drop position/duration):** use `seededUnit(particleIndex, salt)` where `particleIndex` is a stable counter. Track the index per particle type.
- **One-off timing (lightning flash at line 257):** if it's user-visible determinism, use `seededUnit(globalCounter, 'lightning')`. If it's intentionally random (e.g., atmosphere), add an explicit comment `// intentionally non-deterministic` and keep `Math.random()`.

Add the import at the top: `import { seededUnit } from './utils/seeded-random.js';`

### Task 2 — Replace `Math.random()` in `js/modules/journey-selected-card.js:224`
1. Read line 224 to understand context (vector line generation per worker's mid-flight).
2. If deterministic-feasible (per-element): use `seededUnit(index, 'vector')`.
3. If intentionally non-deterministic: add explicit comment and keep `Math.random()`.

### Task 3 — Replace `Math.random()` in `js/modules/audio-scape.js:149,151`
1. Read context — these are audio frequencies.
2. Audio frequencies are **likely intentionally non-deterministic** (different each play).
3. If so, add explicit comment `// intentionally non-deterministic — audio playback variation` and keep `Math.random()`.
4. Only replace if there's evidence the audio needs to be deterministic.

### Task 4 — Wrap `semantic-threads.js` state writes in `withStateMutation()`
The worker found 22 unguarded state writes at lines 105, 106, 107, 158, 223, 228, 230, 239, 245, 246, 282, 283, 284, 319, 320, 327, 328, 329, 330, 331, 332, 334, 360, 370.

None write to `CRITICAL_KEYS`, so production is safe. The concern is **atomicity** at status transitions.

For each group of writes that are part of the same logical transition (e.g., setting status + load promise together), wrap in `withStateMutation(() => { ... })`:
- Group A (load start, lines 105-107): status='loading' + loadPromise
- Group B (load success, lines 282-284): status='ready' + manifest
- Group C (status updates, lines 327-334): any status transitions
- Other writes that are not part of transitions (e.g., single-field reads, computed assignments) can be left alone

Add the import at the top: `import { withStateMutation } from './state.js';`

## Time Budget
- 20 min total
- 3 min for canonical pattern read
- 7 min for Math.random fixes (Tasks 1-3)
- 8 min for withStateMutation (Task 4)
- 2 min smoke test + report

If you fall behind: prioritize Task 4 (biggest impact, fixes the most state writes), then Task 1 (8 calls), then Tasks 2-3.

## Methodology
1. **Read first** — open each file at the specific lines, understand context
2. **Verify the canonical pattern** — read `js/modules/three-search-animations.js` and `js/state.js` for `withStateMutation` usage
3. **Smallest change** — don't refactor, just fix the specific call
4. **Document non-determinism** — explicit comment when keeping `Math.random()` is the right call
5. **Final smoke**: `npm run check:shell`

## Output
Save your report to `tmp/m3-subagent2-fixes-report.md` with:
- For each Math.random() call: file:line, decision (replaced/kept-with-comment), rationale
- For withStateMutation: groups identified, wrap count, lines modified
- Import additions (one per file modified)
- Smoke test result (PASS/FAIL)
- Total time elapsed

## Return
≤120 words: count of Math.random() replaced vs kept, withStateMutation groups wrapped, any blockers or design questions for main lane.
