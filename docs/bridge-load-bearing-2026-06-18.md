# Bridge Load-Bearing Audit — 2026-06-18

**Audit Date:** 2026-06-18  
**Bridge Files Scanned:** 42  
**Baseline:** `npm run check:bridges` → ✅ All bridge imports resolve to real files

---

## Classification Summary

| Category | Count | Percentage |
|----------|-------|------------|
| **LOAD-BEARING** | 42 | 100% |
| **CANDIDATE-RETIREMENT** | 0 | 0% |
| **DEAD** | 0 | 0% |

---

## Top 5 Retirement Candidates

Despite all bridges meeting minimum load-bearing criteria, these 5 have the **lowest caller counts** and represent the best candidates for future consolidation or retirement:

### 1. data-worker-url-bridge.ts

> Superseded 2026-06-20: the Vite `?worker&url` boundary was moved to
> `src/lib/workers/data-worker-url.ts`, outside the engine bridge inventory.

- **Callers:** 1 (src/lib/semantic-threads.ts)
- **Exports:** `workerUrl` (default re-export from data-worker.ts)
- **Commits (60d):** 2
- **Docs Refs:** 0
- **Risk:** Single-caller bridge. If semantic-threads.ts is refactored, this bridge becomes dead.

### 2. micro-demo-choreography-bridge.ts

- **Callers:** 3 (docs/archive/*, src/lib/demo/choreography.ts)
- **Exports:** Multiple choreography utilities
- **Commits (60d):** 4
- **Docs Refs:** 9
- **Risk:** Demo-only usage. Non-production path. Could be inlined into demo module.

### 3. journey-selected-card-bridge.ts

- **Callers:** 3 (src/lib/journey/journey.ts, docs/archive/*)
- **Exports:** Selected card state management
- **Commits (60d):** 4
- **Docs Refs:** 16
- **Risk:** Journey-specific. Low caller count suggests tight coupling to single consumer.

### 4. weather-ui-bridge.ts

- **Callers:** 3 (src/lib/utils/weather.ts, src/lib/ui/weather-ui.ts)
- **Exports:** Weather UI bindings
- **Commits (60d):** 2
- **Docs Refs:** 5
- **Risk:** Weather subsystem is self-contained. Bridge could be absorbed into weather-ui.ts.

### 5. camera-orbit-slack-bridge.ts

- **Callers:** 5 (docs/archive/*, src/lib/engine/*, src/lib/stores/camera.svelte.ts)
- **Exports:** Orbit slack behavior
- **Commits (60d):** 1
- **Docs Refs:** 12
- **Risk:** Camera subsystem bridge. Low commit activity suggests stable but possibly stagnant.

---

## Full Bridge Classification Table

| Bridge File | Callers | Classification | Commits (60d) | Docs Refs | Protected Imports |
|-------------|---------|----------------|---------------|-----------|-------------------|
| adapters-bridge.ts | 13 | LOAD-BEARING | 6 | 27 | — |
| audio-scape-bridge.ts | 6 | LOAD-BEARING | 3 | 13 | — |
| camera-controls-restore-bridge.ts | 19 | LOAD-BEARING | 3 | 21 | — |
| camera-orbit-slack-bridge.ts | 5 | LOAD-BEARING | 1 | 12 | — |
| cluster-labels-bridge.ts | 9 | LOAD-BEARING | 3 | 15 | — |
| data-worker-url-bridge.ts | 1 | LOAD-BEARING | 2 | 0 | — |
| event-bindings-bridge.ts | 8 | LOAD-BEARING | 2 | 28 | — |
| focus-anchor-indicator-bridge.ts | 8 | LOAD-BEARING | 2 | 17 | — |
| focus-pocket-bridge.ts | 15 | LOAD-BEARING | 10 | 60 | — |
| idb-service-bridge.ts | 5 | LOAD-BEARING | 3 | 7 | — |
| inspected-strand-overlay-bridge.ts | 5 | LOAD-BEARING | 2 | 5 | — |
| journey-compass-controller-bridge.ts | 12 | LOAD-BEARING | 1 | 26 | — |
| journey-focus-ui-bridge.ts | 6 | LOAD-BEARING | 5 | 22 | — |
| journey-neighborhood-bridge.ts | 6 | LOAD-BEARING | 4 | 18 | — |
| journey-point-color-bridge.ts | 4 | LOAD-BEARING | 4 | 13 | — |
| journey-selected-card-bridge.ts | 3 | LOAD-BEARING | 4 | 16 | — |
| journey-thread-model-bridge.ts | 8 | LOAD-BEARING | 4 | 14 | — |
| journey-thread-settler-bridge.ts | 14 | LOAD-BEARING | 6 | 27 | — |
| journey-webgl-bridge.ts | 9 | LOAD-BEARING | 5 | 18 | ✗ (3 refs) |
| lifecycle-bridge.ts | 96 | LOAD-BEARING | 13 | 80 | — |
| loading-ui-bridge.ts | 5 | LOAD-BEARING | 3 | 27 | — |
| map-flattening-layout-bridge.ts | 5 | LOAD-BEARING | 3 | 10 | — |
| micro-demo-choreography-bridge.ts | 3 | LOAD-BEARING | 4 | 9 | — |
| mycelium-engine-bridge.ts | 4 | LOAD-BEARING | 2 | 17 | — |
| role-label-bridge.ts | 4 | LOAD-BEARING | 2 | 7 | — |
| route-arrival-overlay-bridge.ts | 6 | LOAD-BEARING | 2 | 5 | — |
| scene-reveal-bridge.ts | 6 | LOAD-BEARING | 2 | 21 | — |
| search-panel-adapter-bridge.ts | 6 | LOAD-BEARING | 2 | 14 | — |
| search-state-bridge.ts | 16 | LOAD-BEARING | 5 | 40 | ✗ (3 refs) |
| search-trail-cue-renderer-bridge.ts | 6 | LOAD-BEARING | 2 | 7 | — |
| semantic-lane-bridge.ts | 11 | LOAD-BEARING | 2 | 20 | — |
| state-bridge.ts | 282 | LOAD-BEARING | 4 | 135 | ✗ (3 refs) |
| strand-continuity-bridge.ts | 14 | LOAD-BEARING | 5 | 20 | — |
| thread-inspector-bridge.ts | 28 | LOAD-BEARING | 6 | 51 | — |
| three-interaction-visuals-bridge.ts | 5 | LOAD-BEARING | 2 | 20 | — |
| three-search-animations-bridge.ts | 6 | LOAD-BEARING | 2 | 23 | — |
| tooltip-bridge.ts | 12 | LOAD-BEARING | 2 | 22 | — |
| ui-feedback-bridge.ts | 9 | LOAD-BEARING | 2 | 11 | ✗ (2 refs) |
| ui-presentation-bridge.ts | 28 | LOAD-BEARING | 2 | 6 | — |
| weather-bridge.ts | 16 | LOAD-BEARING | 4 | 35 | — |
| weather-ui-bridge.ts | 3 | LOAD-BEARING | 2 | 5 | — |
| window-actions-bridge.ts | 6 | LOAD-BEARING | 12 | 10 | ✗ (5 refs) |

---

## Parity vs `check:bridges` Baseline

| Check | Baseline | Audit Result | Status |
|-------|----------|--------------|--------|
| Import resolution | ✅ All resolve | ✅ All resolve | **PARITY** |
| Bridge count | 42 | 42 | **PARITY** |
| Load-bearing classification | N/A | 42 LOAD-BEARING | — |

---

## Evidence Paths

- **Caller counts:** Computed via `rg -l "from.*<pattern>" src/ docs/ tests/`
- **Commit history:** `git log --oneline --since="60 days ago" -- <file>`
- **Docs references:** `rg -l "<pattern>" docs/`
- **Protected imports:** `rg "from.*src/lib/(state|stores|types)/" <file>`

---

## Recommendations

1. **data-worker-url-bridge.ts** — Consider inlining into semantic-threads.ts if no future expansion planned.
2. **micro-demo-choreography-bridge.ts** — Demo-only. Could be relocated to `src/demo/` and excluded from production bundles.
3. **weather-ui-bridge.ts** — Self-contained subsystem. Bridge layer adds indirection without clear benefit.
4. **journey-selected-card-bridge.ts** — Tight coupling to journey.ts. Evaluate if card selection logic belongs in journey module directly.
5. **camera-orbit-slack-bridge.ts** — Low commit activity. Camera subsystem is stable; bridge may be unnecessary abstraction.

---

*Generated by bridge-load-bearing-audit.sh — 2026-06-18*
