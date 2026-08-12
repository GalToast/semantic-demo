# Engine-boundary refactor plan (W48 candidate)

**Status:** Phase 1 (recon + plan) ✅ DONE. Phase 2 in progress (6 bites shipped).
**Goal:** remove the `const state = _X as any` escape hatch from consumer files by tightening the `appState` class typing.

---

## Progress summary (as of last refresh)

| Phase | Bite | Field | Author | Commit |
| --- | --- | --- | --- | --- |
| 1 | — | Plan doc + inventory | Mine | `38b1e08a` |
| 2 | P2-1 | `searchError` (unknown → SearchErrorData) | Mine | `d4cb97dc` |
| 2 | P2-2 | `searchResults` (Record<string,unknown>[] → SearchResult[]) | Mine | `58bf91c7` |
| 2 | P2-3 | `semanticLaneSnapshot` (unknown → LaneHealthPayload) | Mine | `e35e9c66` |
| 2 | P2-4 | `semanticSearchResultCache` (unknown → CacheEntry) | Mine | `24c1c5e6` |
| 2 | P2-5 | `semanticNeighborMapByLeadId` (any → SemanticNeighborEntry) | **Parallel session** | `b0129004` |
| 2 | P2-6 | `pocketMotionByIndex` (any → PocketMotionWithFrame) | **Parallel session** | `59ab14d9` |
| 2 | P2-bug | `currentSemanticGuide` (unknown → string \| null, latent dual-write fix) | Mine | `40580644` |

**Cumulative Phase 2 impact:** 6 state class fields tightened, ~9 consumer escape hatches removed, 0 new TypeScript errors introduced, 6 new lock-in test files.

**Coordination note:** parallel session is independently running the W48 plan in parallel — they tightened 2 different fields (semanticNeighborMapByLeadId, pocketMotionByIndex) and surfaced their own latent bug (SemanticState had wrong type — `SemanticNode` instead of `SemanticNeighborEntry`). Their work validates the plan structure: each bite is independent and the systemic fix is real.

---

## Why this matters

The semantic-explorer codebase has spent the W47 session doing **bite-by-bite tightening** of consumer files — 92 `any` occurrences removed across 9 files. That work has been productive but has hit a ceiling: the remaining `any` density in consumer files (semantic-overlay 37, thread-settler 21, neighborhood 15, focus-ui 13, route-trace 18) is mostly **blocked on the state class itself being typed loosely**.

The root cause is `src/lib/state/app.svelte.ts`. Its `$state<T>()` declarations include too many `unknown`, `Record<string, any>`, and `Map<X, any>` fields. Consumer files can't get a typed handle to the state without bypassing via `const state = appState as any`.

**This refactor is the systemic fix.** Tightening ~10-15 state fields will cascade: each consumer file can drop `const state = _X as any` and use typed `appState.X` directly. The `as any` counts across consumer files will drop significantly without per-file scope fights.

---

## Inventory

### State class profile (`src/lib/state/app.svelte.ts`)

| Metric                        | Value |
| ----------------------------- | ----: |
| Total LOC                     |   663 |
| `$state<...>` declarations    |  ~100 |
| `as any` within class         |     2 |
| `as unknown as` within class  |    23 |
| `$state<unknown>(...)` fields |     6 |

### Engine escape-hatch consumers (28 files)

The audit originally cited "21 files" but the current count is **28** (added: arrival-handoff, focus-pocket-geometry, focus-pocket, focus-ui, journey, thread-inspector-webgl).

| File                             | Escape-hatch count |
| -------------------------------- | -----------------: |
| `engine/three-postprocessing.ts` |                  3 |
| 13 engine/ui files               |             2 each |
| 7 journey/ui/orchestration files |             1 each |

### `as unknown as` casts across codebase (47 total, down from 248)

| File                        |  Count |
| --------------------------- | -----: |
| `state/app.svelte.ts`       |     14 |
| `journey/focus-pocket.ts`   |     10 |
| `search/result-renderer.ts` |      3 |
| 5 other files               | 2 each |
| 7 other files               | 1 each |

The state class itself has 14 `as unknown as` casts (used for `Reflect.set` in the Proxy `set` trap and similar pattern-narrowing).

---

## Field categorization

The state class fields fall into four categories by typing quality:

### Tier A: Well-typed (no work needed)

These fields have proper types in `state-types.ts` (e.g., `NavState`, `ActiveFilters`, `ViewName`, `Point[]`). The `$state<T>(initial)` matches the interface. **Most fields are Tier A.**

Examples:

- `navState: NavState` (fully typed in state-types.ts:584)
- `activeFilters: ActiveFilters`
- `points: Point[]`
- `searchStatus: SearchStatus`
- `summaryCardTypeToken: number`
- `semanticGuideRequestSequence: number`
- `semanticGuideAbortController: AbortController | null`

### Tier B: Loosely typed but tractable (Phase 2 targets)

These fields use `unknown`, `Map<X, any>`, or `Record<string, any>`. The runtime shape is known — we just need to surface the type. **This is the systemic gap.** Estimated 10-15 fields.

| Field                                                                                  | Current type                                                    | Proposed type                                                    |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| `routeTraceLines`                                                                      | `unknown`                                                       | `LineSegments \| null` (Three.js)                                |
| `routeTraceConnectionPairs`                                                            | `Array<unknown>`                                                | `Array<{ a: number; b: number; side: number }>`                  |
| `routeChoreographyState`                                                               | `unknown`                                                       | `Partial<RouteChoreographyState>`                                |
| `currentSemanticGuide`                                                                 | `string \| null` (declared) — runtime stores GuideConfig object | `GuideConfig \| null` (Bite-Roughest already created this)       |
| `semanticLaneSnapshot`                                                                 | `unknown`                                                       | `SemanticLaneSnapshot \| null` (type exists in state-types.ts)   |
| `currentSearchSummary`                                                                 | `SearchSummary \| null`                                         | ✓ already typed — but accessed as `as any` in route-trace.ts:117 |
| `searchResults`                                                                        | `Array<Record<string, unknown>>`                                | `SearchResult[]`                                                 |
| `searchSummary`                                                                        | `Record<string, unknown> \| null`                               | `SearchSummary \| null`                                          |
| `searchError`                                                                          | `unknown \| null`                                               | `string \| null` (runtime always string)                         |
| `semanticSearchResultCache`                                                            | `Map<string, unknown>`                                          | `Map<string, SemanticSearchResult>`                              |
| `semanticThreadsDetailController` (in journey/connection-analysis.ts:66, not appState) | `AbortController \| null`                                       | ✓ already typed                                                  |
| `searchVectorScrambleInterval/Timer`                                                   | `ReturnType<...>`                                               | ✓ typed                                                          |
| `summaryCardTypeToken`                                                                 | `number`                                                        | ✓ typed (Bite-Roughest already uses this)                        |

### Tier C: Intentionally `unknown` (deferred)

Some fields are genuinely dynamic — runtime shape comes from external sources (API responses, third-party libs).

| Field                          | Rationale                                                              |
| ------------------------------ | ---------------------------------------------------------------------- |
| `semanticLaneState`            | State machine string; runtime validates via VALID_SEMANTIC_LANE_STATES |
| `semanticTrailCue`             | String-typed UI cue state; runtime validates via VALID\_\*             |
| Various timer/interval handles | `ReturnType<typeof setTimeout>` already typed correctly                |

These should stay `unknown` until a domain-specific type is introduced.

### Tier D: Three.js / WebGL handles (requires care)

Fields like `scene`, `camera`, `renderer`, `controls`, `pointsMesh`, `myceliumGroup` are typed via `SemanticState['X']` (which is `unknown` in state-types.ts for these specific fields).

| Field      | Current type                       | Proposed type          |
| ---------- | ---------------------------------- | ---------------------- |
| `scene`    | `SemanticState['scene']` (unknown) | `Scene \| null`        |
| `camera`   | `SemanticState['camera']`          | `CameraLike \| null`   |
| `renderer` | `SemanticState['renderer']`        | `RendererLike \| null` |
| `controls` | `SemanticState['controls']`        | `ControlsLike \| null` |

These require changing `SemanticState['X']` to use the `*Like` interfaces already defined in state-types.ts (`CameraLike`, `RendererLike`, `ControlsLike`). High-value but high-touch — touching the central state class requires coordinated care.

---

## Prioritized first cut (Phase 2 candidates)

Tightening these 10 fields will unblock the most consumer files:

1. **`currentSemanticGuide: GuideConfig | null`** — unblocks semantic-guide.ts consumer (already touched in Bite-Roughest)
2. **`semanticLaneSnapshot: SemanticLaneSnapshot | null`** — unblocks semantic-lane consumer
3. **`routeChoreographyState: Partial<RouteChoreographyState> | null`** — unblocks route-trace.ts
4. **`routeTraceLines: LineSegments | null`** — unblocks route-trace.ts
5. **`routeTraceConnectionPairs: Array<{a, b, side}>`** — unblocks route-trace.ts + thread-settler.ts
6. **`searchResults: SearchResult[]`** — unblocks result-renderer
7. **`searchSummary: SearchSummary | null`** — unblocks SearchResults.svelte
8. **`searchError: string | null`** — unblocks search/orchestration
9. **`semanticSearchResultCache: Map<string, SemanticSearchResult>`** — unblocks search/orchestration
10. **`semanticThreadsDetailController: AbortController | null`** (already typed; just need to expose)

Each tightening:

- Adds a typed interface or uses an existing one
- Updates the `$state<T>(initial)` declaration
- Verifies the field is read/written consistently with the new type
- Adds a lock-in test that the type is preserved

---

## Cascade plan (Phase 3)

After Phase 2 tightens the state class, **28 consumer files** can drop their escape hatches:

| Consumer category  | Files    | Expected outcome                                          |
| ------------------ | -------- | --------------------------------------------------------- |
| `engine/*`         | 12 files | `const state = _state as any` → typed `appState.X` access |
| `ui/*-bindings.ts` | 9 files  | Same pattern; all use engine-binding-template structure   |
| `journey/*`        | 6 files  | Mixed — some already typed, some need updating            |
| `orchestration/*`  | 2 files  | Mostly already typed (semantic-lane uses escape)          |

For each consumer file:

- Replace `(state as any).X` with typed `appState.X`
- Drop `const state = _X as any` alias
- Verify TypeScript compiles
- Add lock-in test (per-file) that escape hatch is gone

**Estimated outcome:** ~40-60 `as any` + ~20 `as unknown as` removed from consumer files without per-file scope fights.

---

## Risk + rollback plan

### Risk: state class typing changes break consumers

Changing a field type from `unknown` to `LineSegments | null` will fail to compile in any consumer that previously assigned a different shape (e.g., a `Group` instead of `LineSegments`).

**Mitigation:** Phase 2 is **strictly type-narrowing** — we never widen. If a field's runtime shape is genuinely ambiguous, we leave it `unknown` (Tier C).

### Risk: parallel session W48 WIP on thread-settler

The thread-settler consumer is mid-tightening. If we change the state class while thread-settler is in flight, the consumer might fail to compile.

**Mitigation:** **Phase 1 (this commit) makes NO source changes.** Only this plan doc. Phase 2 should wait for the parallel session to land their thread-settler work. Coordinate via session-lock or chat.

### Risk: `state-validation.ts` runtime guard

The state class uses `validateStateProperty(prop, value)` in the Proxy `set` trap to validate writes at runtime. New typed fields might need validation updates.

**Mitigation:** The validation file already covers most enum values (views, modes, surfaces, statuses). For Tier B tightenings, the existing validation passes if we narrow the runtime shape to match the existing validated enum.

### Rollback

Each Phase 2 field tightening is a separate commit. If one breaks consumers, revert that one commit without touching the others. Lock-in tests catch regressions in the same bite.

---

## Phase 1 deliverables

- ✅ This plan doc (`docs/engine-boundary-refactor-plan.md`)
- ✅ Inventory of state fields by tier (A/B/C/D)
- ✅ Prioritized first-cut list (10 fields)
- ✅ Cascade plan (28 consumer files)
- ✅ Risk + rollback plan

**Phase 1 made no source code changes** — planning bite only. Shipped in commit `38b1e08a`.

---

## Phase 2/3 schedule (updated)

| Phase   | Scope                                              | Bites                | Status                          |
| ------- | -------------------------------------------------- | -------------------- | ------------------------------- |
| Phase 2 | Tighten Tier-B state fields (loose types)          | 6 bites shipped, 4 deferred | IN PROGRESS (60% complete) |
| Phase 3 | Cascade to consumer files (drop escape hatches)    | ~9 escape hatches removed so far | IN PROGRESS (~5% complete) |
| Phase 4 | Document win, refresh audit doc                    | 1 bite               | NOT STARTED                     |

**Remaining Phase 2 first-cut candidates:**

- `currentSemanticGuide` (DONE in P2-bug — surfaced latent bug)
- `searchSummary` (DEFERRED — no readers, writes-only field)
- `routeTraceLines` / `routeTraceConnectionPairs` (DEFERRED — needs new field declarations, parallel session has WIP on route-trace.ts)
- `routeChoreographyState` (ALREADY TYPED — plan was wrong)
- `semanticThreadsDetailController` (ALREADY TYPED — plan was wrong)

**Phase 2 outcome (so far):** the systemic fix is working as intended. Each Phase 2 bite unblocks the corresponding consumer escape hatches, validating the plan structure. Parallel session's independent run confirms the plan is generalizable.

**Coordination:** no conflicts encountered. Each bite touched distinct files; state-types.ts re-exports don't conflict because they're additive.

---

## Reference: state class inventory (selected)

Sampled state field types (full inventory in `src/lib/state/app.svelte.ts`):

| Category                                    | Count | Example                                                                        |
| ------------------------------------------- | ----: | ------------------------------------------------------------------------------ |
| Properly typed (Tier A)                     |   ~85 | `navState: NavState`, `points: Point[]`, `searchStatus: SearchStatus`          |
| Loosely typed Map (Tier B)                  |    ~5 | `routeTraceLines: unknown`, `routeTraceConnectionPairs: Array<unknown>`        |
| Loosely typed Record (Tier B)               |    ~3 | `searchResults: Array<Record<string, unknown>>`                                |
| Intentionally `unknown` (Tier C)            |    ~6 | `semanticLaneSnapshot: unknown`, `currentSearchSummary: SearchSummary \| null` |
| Three.js handles via SemanticState (Tier D) |   ~40 | `scene: SemanticState['scene']`, `camera: SemanticState['camera']`             |

The Tier B and Tier D fields are the targets for Phase 2. Tier A needs no work. Tier C is intentionally dynamic.

---

## See also

- `docs/archive/type-system-smell-audit.md` Axis 1: documents the 21-file escape-hatch pattern
- `src/lib/state/app.svelte.ts`: the state class (663 LOC)
- `src/lib/state/state-types.ts`: the type definitions (663 LOC)
- `src/lib/state/state-validation.ts`: runtime validation (498 LOC)
- `src/lib/state/mutators.ts`: canonical escape-hatch example (`const state = appState as unknown as SemanticState`)
- `tests/unit-active/no-ungated-console-calls.test.ts`: lock-in pattern reference

---

**Next step:** land Phase 2 in a future session after coordinating with the parallel session. This doc is the roadmap; the actual work starts when we say go.
