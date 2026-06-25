# Session Findings — 2026-06-25

## Contract runner: server-churn diagnosis

### Symptom

`npm run test:contract` (64 contracts) takes >5 min and exceeds the default 300s timeout. The output shows `[server] prior failure detected - restarting owned static server` on nearly every contract.

### Root cause

`tests/run-all-contracts.js` → `createServerLease` calls `markFailed()` after **any** non-passing contract, including test assertion failures. The server lease interprets this as "the server is in an unknown state" and kills/restarts the Python HTTP server before the next contract. Since many contracts currently fail (W48-Phase-3 refactor campaign), the server is restarted almost every time.

### Fix applied

Added `isServerRelatedFailure()` helper that checks for genuine server/browser connectivity errors (`ECONNRESET`, `ECONNREFUSED`, `net::ERR_*`, `[RUNNER TIMEOUT]`, `Target page/context/browser closed`). Changed the outer `markFailed()` to only trigger on server-related failures, not on test assertion failures.

The retry block's `markFailed()` is unchanged — it correctly restarts the server before retrying a browser contract that failed with a connectivity error.

**File:** `tests/run-all-contracts.js`

### Expected improvement

Server restarts drop from ~1 per contract to only when a genuine server/browser connectivity failure occurs. Estimated runtime: 64 contracts → ~2-3 min (vs >5 min before).

---

## Typecheck error cluster map

`npm run typecheck` → 92 errors (down from 118 at session start, but the parallel W48-Phase-3 campaign is mid-flight and the count fluctuates).

### Errors grouped by fix leverage

| #   | Cluster                                                                               | Files                                                                                                                         | Errors | Root cause                                                                         | Fix shape                                |
| --- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------- | ---------------------------------------- |
| 1   | Window bridge eraser type                                                             | `window-test-bridge.ts` + `window-actions.ts`                                                                                 | ~31    | `(...args: unknown[])=>unknown` erases typed functions                             | Type the bridge registry                 |
| 2   | Point→BusinessRecord migration                                                        | 10 files (cursor, focus, journey, thread-inspector, thread-settler, etc.)                                                     | ~15    | Rename `450ca65b` moved the type but not all call-sites                            | Mechanical sweep                         |
| 3   | `neighborhood.ts` manifest                                                            | `neighborhood.ts`                                                                                                             | 12     | `buildNeighborhoodManifest` returns `{}`/`unknown`                                 | Type the manifest return                 |
| 4   | `search/mapper.ts` state                                                              | `mapper.ts`                                                                                                                   | 5      | Search state object typed as `unknown`                                             | Type the search state                    |
| 5   | Missing-name refactor leftovers                                                       | `event-bus`, `app-init`, `thread-lens`, `thread-model`, `focus.svelte`, `navigation-state`, `semantic-dive`, `legacy-exports` | ~8     | Imports not added after refactors                                                  | Add missing `import` statements          |
| 6   | `semantic-overlay.ts` FocusConnectionSegment                                          | `semantic-overlay.ts`                                                                                                         | 4      | `FocusConnectionSegment` missing `layer` property + incompatible with `ThreadEdge` | Add `layer`, add index signature or cast |
| 7   | Misc (three-engine, three-postprocessing, compass-state, focus-pocket-geometry, etc.) | various                                                                                                                       | ~17    | Assorted                                                                           | Per-file                                 |

### Which files are being actively edited by the parallel session

Based on `git status --short` (21 dirty files as of 2026-06-25 19:15):

- `window-test-bridge.ts`, `window-actions.ts`, `selected-card.ts`, `adapter-deps.ts`, `adapters.ts`
- `suggestion-bindings.ts`, `debug.ts`, `InfoPanel.svelte`, `Header.svelte`, `SearchBar.svelte`
- `mapper.ts`, `app.svelte.ts`, `three-engine.ts`, `three-postprocessing.ts`, `demo-choreography.ts`
- Plus several test files and CSS

**Do not edit these files** — the parallel session is actively modifying them.

### Safe files (not dirty, abordable now)

These have errors but are NOT in the parallel session's dirty list:

- `neighborhood.ts` (12 errors, biggest single-file win)
- `semantic-overlay.ts` (4 errors)
- `compass-state.ts` (1 error)
- `focus-pocket-geometry.ts` (1 error)
- `legacy-exports.ts` (1 error)
- `semantic-dive.ts` (1 error)
- `navigation.svelte.ts` (2 errors)
- `camera.svelte.ts` (1 error)
- `journey.svelte.ts` (1 error)
- Point→BusinessRecord files: `cursor.ts`, `focus.ts`, `journey.ts`, `connection-analysis-adapter.ts`, `thread-inspector.ts`, `thread-settler.ts`, `cluster-ui-accent.ts`

---

## Parallel-session coordination

The W48-Phase-3 refactor campaign is active (10 commits in the last hour, 20+ in 90 min). Per `AGENTS.md`:

> If 5+ unseen commits landed since last verified HEAD, queue work but do not commit until the stream quiesces.

**Status:** Stream is active but slowing (dirty files dropped from 58→21). Wait for the commit rate to drop below ~1/hour before starting new work.

The session lock (`node scripts/session-lock.mjs`) is released.

---

## Contract suite status

The full contract suite has never completed within the 300s timeout. The pass/fail rate is **unknown** — the runner was killed before printing the `--- Results ---` summary. After the server-churn fix, the suite should complete in ~2-3 min. Run:

```bash
node tests/run-all-contracts.js
```

to get the first real pass/fail tally.
