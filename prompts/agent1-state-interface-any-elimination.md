# Agent 1 — State Interface Completion + `as any` Elimination

You are completing the TypeScript strictness sweep for the semantic-explorer project. Your job is twofold: (1) complete the `SemanticState` interface so every runtime property is typed, and (2) eliminate `as any` casts in `js/modules/` files by replacing them with properly typed accesses.

**Working directory:** `C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer`

## YOUR SCOPE — Non-overlapping with other agents

You own:
- `types/state.d.ts` — add missing runtime properties
- `types/three-engine.d.ts` — fix `[key: string]: any` escape hatch (Agent 2 handles the rest of this file)
- **~50 files in `js/modules/*.ts`** that have `as any` casts

You do NOT own:
- `src/lib/**/*.ts` — Agent 6 handles legacy import removal there
- `js/modules/three-engine.ts`, `three-node-manager.ts`, `three-thread-manager.ts`, `three-interaction-visuals.ts`, `three-search-animations.ts`, `thread-inspector-webgl.ts` — Agent 2 handles those
- `js/modules/weather-ui.js`, `audio-scape.js` — Agent 4 handles those
- Any files being deleted — Agent 3 handles dead code

## STEP 1 — Audit current `as any` casts

```bash
cd "C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer"
grep -rn "as any" js/modules/*.ts --include="*.ts" | grep -v "three-" | grep -v "thread-inspector-webgl" | wc -l
```

Then read `types/state.d.ts` (645 lines) to understand the current `SemanticState` interface. Compare it against the actual runtime usage patterns in `js/modules/` — the `(state as any).X` pattern means `X` is missing from the interface.

## STEP 2 — Complete `types/state.d.ts`

Based on the `as any` audit, add missing properties to `SemanticState`. Known gaps from the codebase:

| Missing Property | Where Used | Type to Add |
|---|---|---|
| `focusPocketMotionByIndex` | `focus-pocket.ts:79` | `Map<number, unknown>` |
| `focusPocketTransitionStartedAt` | `focus-pocket.ts:148` | `number` |
| `focusPocketAnimationFrameId` | `focus-pocket.ts:139` | `number \| null` |
| `canvasFieldHoverClearTimer` | `journey-canvas-hover.ts:13` | `ReturnType<typeof setTimeout> \| null` |
| `canvasThreadInspectionClearTimer` | `journey.ts:107` | `ReturnType<typeof setTimeout> \| null` |
| `inspectedThreadIndex` | `journey.ts:105` | `number \| null` |
| `pinnedThreadIndex` | `journey.ts:106` | `number \| null` |
| `threadInspectorPointerInside` | `journey.ts:108` | `boolean` |
| `signalScores` | `journey.ts:128` | `number[]` |
| `bridgeScores` | `journey.ts:129` | `number[]` |
| `bloomIndices` | `journey.ts:121` | `Set<number>` |
| `bridgeIndices` | `journey.ts:122` | `Set<number>` |
| `summaryCardTypeToken` | `semantic-guide.ts:135` | `number` |
| `semanticThreadsRetryAttempt` | `semantic-threads.ts:231` | `number` |
| `semanticThreadBundle` | `semantic-threads.ts:280` | `unknown` |
| `_showAllClusters` | `cluster-filter.ts:74` | `boolean` |
| `projectedNeighborGrid` | `journey-thread-model.ts:77` | `unknown` |

Also add to `NavState`:
| Missing Property | Where Used | Type |
|---|---|---|
| `explorationHistoryIndices` | `navigation-state.ts:49` | `number[]` |

Also check `types/three-engine.d.ts` — it has `[key: string]: any` as an escape hatch. Replace with specific dynamic properties that are actually used (e.g., `denseBundleMode`, `shader`, etc.).

## STEP 3 — Eliminate `as any` casts in `js/modules/`

For each file with `as any`, replace the cast with a properly typed access. The patterns you'll encounter:

### Pattern A: `(state as any).property` → `state.property`
If you added the property to `SemanticState` in Step 2, the cast is no longer needed.

### Pattern B: `(state.X as any[])[index]` → `state.X[index]`
If `X` is typed as `NodePosition[]` in the interface, the array access is already typed.

### Pattern C: `(element as any).dataset` → `(element as HTMLElement).dataset`
Use `HTMLElement` subtype for DOM element casts.

### Pattern D: `(CONFIG as any).COLORS` → `CONFIG.COLORS`
If the constant is typed, remove the cast.

### Pattern E: `catch (err: any)` → `catch (err: unknown)` + type narrowing

### Pattern F: `(window as any).__X__` — KEEP THESE
Window global augmentation casts are acceptable. Do not change them. They represent the bridge between legacy JS and TS.

### Pattern G: Module facade casts in `camera-controls.ts` — KEEP THESE
The `(restore as any).fn()`, `(choreography as any).fn()`, `(core as any).fn()` pattern in `camera-controls.ts` is intentional — it delegates to sub-modules that aren't individually typed yet. Do not change these.

## STEP 4 — Focus on highest-impact files first

Priority order by `as any` count:
1. `journey-semantic-overlay.ts` — 78 casts (but mostly uniform pattern)
2. `journey-canvas-interaction.ts` — 45 casts
3. `journey-neighborhood.ts` — 39 casts
4. `focus-pocket.ts` — 29 casts
5. `thread-inspector-webgl.ts` — 22 casts (SKIP — Agent 2)
6. `thread-inspector.ts` — 20 casts
7. `journey-route-trace.ts` — 27 casts
8. `focus-pocket-geometry.ts` — 17 casts
9. `keyboard-help.ts` — 15 casts
10. `journey-thread-settler.ts` — 15 casts
11. `journey-thread-model.ts` — 15 casts
12. `focus-stage-renderer.ts` — 4 casts
13. `cluster-labels.ts` — 10 casts
14. `cluster-filter.ts` — 5 casts
15. `journey-selected-card.ts` — 9 casts
16. `journey-canvas-hit-test.ts` — 8 casts
17. `journey-canvas-node-picking.ts` — 9 casts
18. `journey-canvas-hover.ts` — 10 casts
19. `journey-compass-state.ts` — 3 casts
20. `journey-compass-controller.ts` — 2 casts
21. `journey-focus-ui.ts` — 10 casts
22. `navigation-state.ts` — 5 casts
23. `semantic-threads.ts` — 12 casts
24. `semantic-guide.ts` — 8 casts
25. `filter-state.ts` — 3 casts
26. `journey-arrival-handoff.ts` — 3 casts
27. `journey.ts` — 13 casts
28. `composition-state.ts` — 1 cast
29. `connection-analysis-adapter.ts` — 1 cast
30. `event-bindings.ts` — 3 casts
31. `diagnostic-adapter.ts` — 2 casts
32. `search-mapper.ts` — 2 casts
33. `search-trail-cue-renderer.ts` — 1 cast
34. `micro-demo-guards.ts` — 2 casts
35. `micro-demo-ui.ts` — 1 cast
36. `scene-reveal.ts` — 7 casts
37. `map-flattening-layout.ts` — 1 cast
38. `mycelium-engine.ts` — 1 cast
39. `view-controller.ts` — 1 cast
40. `app.ts` — 11 casts (mostly window globals — keep those)

## STEP 5 — Verify

1. `npm run typecheck` — must pass (note: pre-existing TS5042 is separate)
2. Count remaining `as any` in scope: `grep -rn "as any" js/modules/*.ts | grep -v "three-" | grep -v "thread-inspector-webgl" | wc -l` — target: < 50 (from ~300+)
3. `npm run build` — must succeed
4. `git diff --stat` — should show changes in `types/state.d.ts`, `types/three-engine.d.ts`, and ~30-40 `js/modules/*.ts` files

## STEP 6 — Report

```markdown
## Agent 1 — State Interface + Any Elimination Report

### types/state.d.ts changes
- Properties added to SemanticState: <count>
- Properties added to NavState: <count>
- types/three-engine.d.ts: <what changed>

### Cast elimination stats
- Files modified: <count>
- `as any` casts eliminated: <count> (from <original> to <remaining>)
- Remaining `as any` (acceptable — window globals, module facades): <count>

### Verification
- `npm run typecheck`: PASS/FAIL
- `npm run build`: PASS/FAIL
- `git diff --stat`: <summary>

### Cross-seam findings
- Anything in src/lib/ that needs type interface additions: <list>
- Anything in three-*.ts files that needs interface work: <list>
```
