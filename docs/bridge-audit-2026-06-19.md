# Bridge retirement audit — 2026-06-19

**Run:** `node scripts/bridge-audit.mjs` (in-tree script, ~50ms)

## Headline

- **37 total bridges** in `src/lib/engine/*-bridge.ts`
- **0 orphan bridges** that have zero importers in `src/`
- **19 single-caller bridges** (≈ one direct consumer, candidate for inlining)
- **~34 KB of confidently dead code** sitting in one self-referential subfolder

## Single-caller bridges (1 ref each)

| Path                                             |  Bytes | Notes                                    |
| ------------------------------------------------ | -----: | ---------------------------------------- |
| `lib/engine/adapters/lifecycle-bridge.ts`        | 22,973 | The big one — see "dead subfolder" below |
| `lib/engine/adapters/camera-bridge.ts`           |  3,976 |                                          |
| `lib/engine/camera-orbit-slack-bridge.ts`        |    481 |                                          |
| `lib/engine/weather-ui-bridge.ts`                |    431 |                                          |
| `lib/engine/event-bindings-bridge.ts`            |    406 |                                          |
| `lib/engine/role-label-bridge.ts`                |    394 |                                          |
| `lib/engine/focus-pocket-bridge.ts`              |    368 |                                          |
| `lib/engine/scene-reveal-bridge.ts`              |    364 |                                          |
| `lib/engine/inspected-strand-overlay-bridge.ts`  |    354 |                                          |
| `lib/engine/focus-anchor-indicator-bridge.ts`    |    348 |                                          |
| `lib/engine/ui-feedback-bridge.ts`               |    346 |                                          |
| `lib/engine/route-arrival-overlay-bridge.ts`     |    342 |                                          |
| `lib/engine/loading-ui-bridge.ts`                |    302 |                                          |
| `lib/engine/map-flattening-layout-bridge.ts`     |    287 |                                          |
| `lib/engine/cluster-labels-bridge.ts`            |    286 |                                          |
| `lib/engine/mycelium-engine-bridge.ts`           |    284 |                                          |
| `lib/engine/audio-scape-bridge.ts`               |    279 |                                          |
| `lib/engine/three-interaction-visuals-bridge.ts` |    237 |                                          |
| `lib/engine/three-search-animations-bridge.ts`   |    229 |                                          |

## Multi-caller bridges (worth keeping as bridges)

| Path                                              | Refs | Bytes | Why keep                               |
| ------------------------------------------------- | ---: | ----: | -------------------------------------- |
| `lib/engine/state-bridge.ts`                      |   62 | 1,018 | Public state passthrough, high traffic |
| `lib/engine/lifecycle-bridge.ts` (top)            |   16 | 1,972 | Public lifecycle hook                  |
| `lib/engine/window-actions-bridge.ts`             |    7 | 1,035 | Window-bound action surface            |
| `lib/engine/thread-inspector-bridge.ts`           |    5 |   469 |                                        |
| `lib/engine/journey-thread-settler-bridge.ts`     |    5 |   436 |                                        |
| `lib/engine/journey-webgl-bridge.ts`              |    4 |   977 |                                        |
| `lib/engine/journey-compass-controller-bridge.ts` |    4 |   753 |                                        |
| `lib/engine/camera-controls-restore-bridge.ts`    |    4 |   675 |                                        |

## 🚨 Dead-code spot — `src/lib/engine/adapters/`

The five files under `src/lib/engine/adapters/` form a self-contained factory
pattern (`createEngineBridge()` composition root) that has **zero external
importers** in `src/`. The only thing the rest of the app imports from that
package surface is via `src/lib/engine/index.ts`, which re-exports
`createEngineBridge` from `./adapters/core`. There is no `createEngineBridge`
consumer anywhere in `src/` outside the index.ts re-export and the core's own
factory internals.

The `lifecycle.ts` already has the comment:

> "Replaces the lifecycle methods from src/lib/engine/adapters/lifecycle-bridge.ts"

…confirming the `adapters/lifecycle-bridge.ts` (the largest single-caller
bridge at 22.9 KB) has been superseded by the canonical migration. The other
three adapter files (`adapters/camera-bridge.ts`, `adapters/search-bridge.ts`,
`adapters/core.ts`) are pure internal consumers of each other — their only
external path is through `index.ts`.

`adapters-bridge.ts` (top-level, 2,051 B, **NOT** under `adapters/`) is
**active** — it has 2 importers (`src/lib/orchestration/adapters.ts`,
`src/main.ts`) and does not reference `adapters/*` either.

### Recommended retirement

| Action    | File                                          |       Bytes |
| --------- | --------------------------------------------- | ----------: |
| Delete    | `src/lib/engine/adapters/core.ts`             |       ≈ 200 |
| Delete    | `src/lib/engine/adapters/camera-bridge.ts`    |       3,976 |
| Delete    | `src/lib/engine/adapters/lifecycle-bridge.ts` |      22,973 |
| Delete    | `src/lib/engine/adapters/search-bridge.ts`    |       5,285 |
| Delete    | `src/lib/engine/adapters/types.ts`            |       ≈ 500 |
| **Total** |                                               | **~32,934** |

### Blocked step

The actual file deletion is **deferred** on this lane — the parallel session
is racing on `src/lib/engine/lifecycle-bridge.ts` and `state-bridge.ts` (live,
multi-tenant bridge files in the same directory). Any commit from this lane
that touches `src/lib/engine/**/*.ts` would race theirs.

**Coordination gate:** retire the `adapters/` subfolder after the parallel
session pushes their work and confirms no churn is expected near `core.ts`,
`camera-bridge.ts`, or `lifecycle-bridge.ts`.
