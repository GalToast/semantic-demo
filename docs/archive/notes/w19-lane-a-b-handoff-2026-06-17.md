# W19 Lane A + B Handoff — Main Lane 2026-06-17 (Updated)

## Status (current session, end of lane A + B)

- **Lane A bridge rewire**: `src/lib/engine/lifecycle-bridge.ts:22` → `@lib/orchestration/lifecycle` ✅ STAGED, all 13 re-exports verified via multi-line export block
- **Lane B source rewires**:
    - `src/lib/engine/cursor.ts:27` → split to `@lib/journey/point-color` + `@lib/journey/selected-card` ✅ (re-applied after parallel session WIP reset)
    - `src/lib/engine/demo-choreography.ts:28` → split to `@lib/journey/point-color` + `@lib/journey/selected-card` + call site updates ✅ (re-applied)
    - `src/lib/engine/scene-reveal.ts:18` → `@lib/journey/focus-ui` ✅ (re-applied after parallel session silently reverted)
    - `tests/unit-active/demo-choreography-exports.test.ts:73-77` → updated assertion to expect split canonicals ✅
- **5 "dead" file deletions**: ❌ BLOCKED — internal `js/modules/→js/modules/` cross-imports
- **js/modules/lifecycle.ts deletion**: ❌ BLOCKED — 4 internal consumers (thread-inspector, journey-thread-settler, journey-focus-ui, lifecycle-modes/reset)

## The recon miss (key lesson)

The original recon said these files were "dead code":

- `map-state`, `view-controller`, `composition-state`, `loading-ui`, `journey`, `scene-reveal`
- `js/modules/lifecycle.ts`

**This was WRONG.** All 6 files have internal `js/modules/` cross-imports:

| File                              | Internal js/modules/ importers (BLOCKERS)                                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `js/modules/map-state.ts`         | `journey-compass-controller.ts`, `view-controller.ts`                                                                              |
| `js/modules/view-controller.ts`   | `lifecycle.ts`, `lifecycle-reset.ts`, `map-state.ts`, `url-state.ts`                                                               |
| `js/modules/composition-state.ts` | `lifecycle-modes.ts`, `lifecycle.ts`, `view-controller.ts`                                                                         |
| `js/modules/loading-ui.ts`        | `view-controller.ts`                                                                                                               |
| `js/modules/journey.ts`           | `journey-webgl.ts` (via journey-semantic-overlay), `journey-route-trace.ts`, `journey-arrival-handoff.ts`, etc.                    |
| `js/modules/lifecycle.ts`         | `thread-inspector.ts:20`, `journey-thread-settler.ts:12`, `journey-focus-ui.ts:19`, plus composition-state → lifecycle-modes/reset |

**Correct recon command for future:** `rg "from.*['\"](\\.\\./)*js/modules" js/modules` BEFORE deleting.

**Corrected posture:** Lane B deletions must include rewiring all internal importers first — outside the scope of "Lane A + B" as currently defined.

## Specific lessons (tool quirks + repo conventions)

1. **Multi-line `export { ... }` blocks hide exports from `rg "^export.*\\bfn\\b"` checks.** Always verify with `rg -B 5 "\\bfn\\b" file` for multi-line re-exports. The user's `@lib/orchestration/lifecycle` has 13 functions in multi-line blocks — single-line grep FALSE-negatives.

2. **`import * as nsModule from a path that doesn't have the symbols` breaks the build silently.** The parallel session's earlier `@lib/journey/journey` rewire was BROKEN for this exact reason.

3. **`git commit --only pathspec` for staged+tracked files avoids polluting the commit with unrelated parallel-session WIP.**

4. **Parallel session WIP cycle silently drops edits.** Their WIP resets undid my edits once before. If you see `cursor.ts:27` / `demo-choreography.ts:28` / `scene-reveal.ts:18` still pointing at `js/modules/journey` in a new session, re-apply immediately.

5. **Cosmetic-only diffs can mask substantive reverts.** When the parallel session reset `scene-reveal.ts`, the file came back with formatting changes (semicolons removed) — the import path was silently reverted. The diff was non-substantive-looking but the file state was wrong. Always `rg` the substantive identifier, don't trust the diff stat alone.

6. **Test the parallel session state before every commit.** Run `git log --since="3 hours ago" --oneline` and `git status --short` to detect drift.

7. **The canonical owl-alpha subagent model is `kilo/openrouter/owl-alpha`, not `openrouter/owl-alpha`.** Both routes reach the same `openrouter/owl-alpha` model, but only the kilo-prefixed form is the documented "owl-alpha subagent" in the external subagent catalogue. A W19 first dispatch used the unprefixed form and had to be cancelled + re-dispatched; the second round with the kilo-prefixed form completed in ~3.5 min wall-clock. Future subagent dispatches that target the owl-alpha model MUST use `kilo/openrouter/owl-alpha` as the `model` field. Other `kilo/*` routes follow the same pattern (`kilo/openrouter/<model>`, `kilo/mistral/<model>`, `kilo/nvidia/<model>`).

## Next arc (W20)

- **Wave 1** (DONE): Create canonicals in `@lib/orchestration/lifecycle`, `@lib/engine/map-state`, `@lib/orchestration/view-controller`, `@lib/ui/loading`, and `@lib/journey/*`
- **Wave 2** (THIS SESSION, in progress): Repoint Svelte-facing bridges + 3 stable consumers (cursor.ts, demo-choreography.ts, scene-reveal.ts) + test update
- **Wave 3** (NEW NEEDED): Repoint `js/modules/→js/modules/` cross-imports for the 6 files in the table above — this is its own arc, separate from "Lane A + B"
- **Wave 4**: Delete the 5 dead files + lifecycle.ts once Wave 3 is clean

## Files to read first in any new chat

1. `notes/w19-lane-a-b-handoff-2026-06-17.md` (this file)
2. `docs/w19-charter-2026-06-17.md` (parallel session's plan)
3. `git log --oneline -10`
4. `git status --short`
5. Verify `cursor.ts:27`, `demo-choreography.ts:28`, `scene-reveal.ts:18` all point to `@lib/journey/*` canonicals (NOT `js/modules/journey`) before any work

## Commit strategy for next chat

After verifying the 3 re-applied rewires are intact, commit in 2 atomic commits:

```bash
git add src/lib/engine/lifecycle-bridge.ts
git commit -m "chore(lane-a): repoint src/lib/engine/lifecycle-bridge.ts to @lib/orchestration/lifecycle

All 13 re-exports verified present via multi-line 'export {...}' block in canonical.
js/modules/lifecycle.ts kept — has 4 internal consumers (thread-inspector,
journey-thread-settler, journey-focus-ui, lifecycle-modes/reset) that need a
separate js/modules/ cross-import migration beyond Lane A scope." --only src/lib/engine/lifecycle-bridge.ts

git add src/lib/engine/camera-choreography/cursor.ts src/lib/engine/demo-choreography.ts src/lib/engine/scene-reveal.ts tests/unit-active/demo-choreography-exports.test.ts
git commit -m "chore(lane-b): repoint 3 journey consumers to canonicals + update test

- cursor.ts: applyPointFilterColors → @lib/journey/point-color, syncFocusStage → @lib/journey/selected-card
- demo-choreography.ts: split namespace import into direct point-color/selected-card imports; loadJourney() returns object literal
- scene-reveal.ts: updateTraversalUi → @lib/journey/focus-ui
- test: updated structural-invariant assertion to expect new canonical paths

js/modules/journey.ts kept — has internal cross-importers (journey-webgl,
journey-route-trace, journey-arrival-handoff, etc.) requiring separate
js/modules/ migration beyond Lane B scope." --only src/lib/engine/camera-choreography/cursor.ts src/lib/engine/demo-choreography.ts src/lib/engine/scene-reveal.ts tests/unit-active/demo-choreography-exports.test.ts

git push origin master
```

DO NOT:

- Touch any other file
- Commit anything
- Push anything

— Main lane, 2026-06-17 (updated post-recon)
