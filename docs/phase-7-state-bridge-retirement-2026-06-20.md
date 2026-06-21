# Phase 7 Charter — Final Bridge Retirement (state-bridge)

**Wave:** Post-W11 / Phase 7
**Status (2026-06-20):** Pre-scoped, ready for next-agent pickup
**Total bridges remaining:** 1 (down from 34 at start of W7 era)

## Why this charter exists

The W5 → W11 wave cycle retired 33 of 34 original `*-bridge.ts` files. One remains:

1. **`src/lib/engine/state-bridge.ts`** — Re-export of canonical `appState` under the legacy alias `state`, plus re-export of `withStateMutation`. Currently consumed by **20+ files** in `src/lib/` and `src/orchestration/`. The trivial 3-line bridge is documented in the file as "transition passthrough — future waves migrate consumers to use `appState` directly".

The former **`src/lib/engine/data-worker-url-bridge.ts`** is already retired as bridge debt. The required Vite `?worker&url` boundary remains centralized at `src/lib/workers/data-worker-url.ts`, outside `src/lib/engine/*-bridge.ts`.

This charter documents the **consumer migration** required to retire `state-bridge.ts`.

## Scope (Phase 7)

**Goal:** Eliminate `src/lib/engine/state-bridge.ts` as a passthrough by migrating all ~58 consumers to use `appState` and `withStateMutation` from canonical homes.

**Acceptance criteria:**

- `src/lib/engine/state-bridge.ts` removed
- `tests/unit-active/svelte-bridge-import-contract.test.ts` passes (no unexpected dead bridges); `state-bridge.ts` added to `KNOWN_RETIRED_BRIDGES` set
- `tests/unit-active/bridge-import-graph-invariant.test.ts` passes
- `npm run test:unit` green
- `npm run check:bridges` green
- `npm run check:nav-mirror` green (multi-line `appState.navState` field assignments already handled)
- No matching `from '@lib/engine/state-bridge'` text anywhere in `src/` or `tests/`

## Migration recipe (mechanical)

For each consumer file currently doing:

```ts
import { state as legacyState } from '@lib/engine/state-bridge'
// ... uses legacyState.X
```

Replace with the canonical path:

```ts
import { appState } from '@lib/state/app.svelte'
// ... uses appState.X
```

For consumers doing both state and mutation:

```ts
import { state as legacyState, withStateMutation } from '@lib/engine/state-bridge'
// OR
import { state, withStateMutation } from '@lib/engine/state-bridge'
```

Replace with:

```ts
import { withStateMutation } from '@lib/state/with-state-mutation'
import { appState } from '@lib/state/app.svelte'
// (and rename `legacyState` → `appState` at call sites, or keep alias `const state = appState` if minimizes churn)
```

**Recommended:** use `const state = appState;` local alias _inside each consumer file_ when migration scope is large — keeps downstream equations identical (e.g., `state.X = state.Y + 1`).

## Consumer enumeration (~58 files, alphabetical)

These currently `from '@lib/engine/state-bridge'` for `state` (or `legacyState` alias):

1. `src/App.svelte` (uses `legacyState` alias)
2. `src/main.ts` (uses `legacyState` alias)
3. `src/lib/data-loader.ts`
4. `src/lib/audio/audio-scape.ts`
5. `src/lib/data-store.ts` (consumer of `state.records/dataStore`)
6. `src/lib/orchestration/triggers.ts`
7. `src/lib/orchestration/window-actions.ts`
8. `src/lib/orchestration/semantic-lane.ts`
9. `src/lib/orchestration/adapter-deps.ts`
10. `src/lib/orchestration/cluster-filter-controller.ts`
11. `src/lib/journey/journey.ts` (4 imports from bridges)
12. `src/lib/journey/focus-pocket-geometry.ts`
13. `src/lib/journey/search-trail-cue-renderer.ts`
14. `src/lib/journey/semantic-guide-payload-adapter.ts`
15. `src/lib/journey/point-color.ts`
16. `src/lib/journey/focus-anchor-indicator.ts`
17. `src/lib/journey/webgl-utils.ts`
18. `src/lib/journey/route-trace.ts`
19. `src/lib/journey/selected-card.ts`
20. `src/lib/journey/semantic-dive.ts`
21. `src/lib/journey/focus-ui.ts`
22. `src/lib/journey/thread-inspector-webgl.ts`
23. `src/lib/journey/thread-settler.ts`
24. `src/lib/journey/thread-model.ts`
25. `src/lib/journey/semantic-overlay.ts`
26. `src/lib/journey/connection-analysis-adapter.ts`
27. `src/lib/journey/thread-inspector.ts`
28. `src/lib/journey/semantic-guide.ts`
29. `src/lib/journey/compass-state.ts` (TYPE only)
30. `src/lib/journey/arrival-handoff.ts`
31. `src/lib/utils/map-flattening-layout.ts`
32. `src/lib/utils/weather.ts`
33. `src/lib/utils/role-label.ts`
34. `src/lib/utils/strand-continuity.ts`
35. `src/lib/state/mutators.ts`
36. `src/lib/ui/journey-bindings.ts`
37. `src/lib/ui/suggestion-bindings.ts`
38. `src/lib/ui/mode-bindings.ts`
39. `src/lib/ui/onboarding-bindings.ts`
40. `src/lib/ui/cluster-ui-accent.ts`
41. `src/lib/ui/legend-bindings.ts`
42. `src/lib/ui/view-bindings.ts`
43. `src/lib/ui/semantic-lane-bindings.ts`
44. `src/lib/ui/global-bindings.ts`
45. `src/lib/ui/utility-bindings.ts`
46. `src/lib/ui/event-bindings.ts`
47. `src/lib/ui/ui-feedback.ts` (TYPE + lifecycle)
48. `src/lib/engine/camera-controls-core.svelte.ts`
49. `src/lib/engine/camera-controls-restore.svelte.ts`
50. `src/lib/engine/camera-choreography/framing-utils.ts`
51. `src/lib/engine/camera-choreography/cursor.ts` (also imports journey-compass-controller)
52. `src/lib/engine/camera-choreography/orbit-slack.ts`
53. `src/lib/engine/mycelium-engine.ts`
54. `src/lib/engine/three-search-animations.ts`
55. `src/lib/engine/node-manager.ts` (also imports state-bridge indirectly)
56. `src/lib/engine/thread-manager.ts`
57. `src/lib/engine/three-interaction-visuals.ts`
58. `src/lib/engine/three-engine.ts`

(Plus sync the test contract's `KNOWN_RETIRED_BRIDGES` set and add `state-bridge.ts` to it.)

## Progress notes

- 2026-06-20 initial pass migrated low-risk type/utility consumers:
  - `src/lib/journey/compass-state.ts`
  - `src/lib/ui/ui-feedback.ts`
  - `src/lib/utils/map-flattening-layout.ts`
  - `src/lib/utils/role-label.ts`
  - `src/lib/utils/weather.ts`
  - `src/lib/state/mutators.ts`
- 2026-06-20 search subsystem pass migrated the missed `src/lib/search/*` consumers:
  - `api-cache.ts`, `cache.ts`, `mapper.ts`, `result-renderer.ts`, `results-ui.ts`, `legacy-exports.ts`
- Worker audit note: the original enumeration missed `src/lib/search/*`; keep future counts grounded in `rg "@lib/engine/state-bridge|\\.\\./engine/state-bridge" src tests`.

## Suggested ticket breakdown

**Ticket 7-A:** migrate `src/lib/state/*` (5 files) — small surface, no bridge re-exports inside (except `state-bridge.ts` itself which is the focus)
**Ticket 7-B:** migrate `src/lib/utils/*` (5 files) — low-risk utility layer
**Ticket 7-C:** migrate `src/lib/search/*` (6 files) — completed in the initial pass
**Ticket 7-D:** migrate `src/lib/ui/*` (10 files) — bindings layer, simpler patterns
**Ticket 7-E:** migrate `src/lib/journey/*` (~20 files) — bigger scope, has lots of inter-deps
**Ticket 7-F:** migrate `src/lib/engine/*` + `src/lib/orchestration/*` + `src/main.ts` + `src/App.svelte` (~15 files) — completion
**Ticket 7-G:** delete `src/lib/engine/state-bridge.ts`, update `KNOWN_RETIRED_BRIDGES`, run final test gates

Each ticket is atomic with mechanical recipe. Estimated ~250–400 LoC per ticket. Total ~1,200 LoC of consumer rewrite + 1 file retirement.

## Risks

- **Multi-line `appState.navState` field assignments** — caught by `ci-check-nav-mirror-pattern` test; verified already-breaking (currently in test:unit failure log but not regression). Make sure consumer rewrites use single-line `appState.navState.X = Y` patterns.
- **Stale `.d.ts` re-exports** — `state-bridge.ts` re-exports `type {} from '@lib/state/state-types'`. Consumers that use these as types should re-import directly from `@lib/state/state-types`.
- **`@lib/state/with-state-mutation`** is the canonical home for `withStateMutation`. Verify it exists (it does — already in src/lib/state/).

## Verification gates

```bash
# After each ticket:
npm run check:svelte
npm run typecheck
npm run check:bridges
npm run lint:nav-mirror
npm run test:unit

# After final ticket 7-F:
npm run test:contract -- --all
npm run qa:visual -- --all  # optional sanity
```

## Why not done in W11?

Parallel session's W11 wave aggressively retired 9 bridges in commit `13d7df74 refactor(w10): retire lifecycle-bridge`. The state-bridge was intentionally deferred because:

1. Total consumers (20+) make mechanical rewrite a separate chord
2. `appState` proxy semantics → global-instance sync had been fixed just before (`ff22e6c1 perf(appState)` and split-singleton work in `03a1341c`)
3. Cleaner to do Phase 7 after consumer-rewrite traffic settles

## Estimated time

Per ticket: 10–15 min mechanical rewrite + 5–10 min verification = ~20 min per ticket.
Tickets 7-A through 7-F: ~120 min total wall-clock time if executed in a single lane.

If split across 2–3 parallel lanes (one per ticket-clusters A–C, D–F), ~60 min wall-clock with merge coordination overhead.
