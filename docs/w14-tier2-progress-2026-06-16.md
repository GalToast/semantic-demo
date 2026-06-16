# W14 Tier-2 Progress — 2026-06-16

> **Status:** 🚧 IN PROGRESS. W14 Tier-1 (js/modules/three-engine.ts retirement, 49 files, 917+/1594-) landed in `31a32f6` by the parallel session. Tier-2 is in flight across both lanes.

## What landed this turn (W14-dea-1 through W14-dea-4, by Fred)

The 131-LOC `js/modules/camera-controls.ts` death-bridge (left from W16 #4) is now functionally retired. 13 of 14 source consumers were rewired to canonical Svelte 5 paths.

| Commit | What | Files | Δ |
|---|---|---|---|
| `4c1d166` | **w14-dea-1**: 3 `js/modules/bindings/*` consumers | 3 | +3/-3 |
| `3e6ca58` | **w14-dea-2**: 5 single-function consumers | 6 (+config.ts deletion side-effect) | +5/-112 |
| `4898ec3` | **w14-dea-3**: 3 multi-function consumers (2-7 funcs each) | 4 (+environment.ts deletion) | +12/-151 |
| `d322cf7` | **w14-dea-4**: `demo-choreography` namespace refactor + test update | 2 | +6/-2 |

**Net effect:** 13 of 14 source consumers rewired. 1 remaining: `src/lib/engine/index.ts` (24 functions, 1 line).

## Per-file rewire map

```
# Function                            # Canonical path
# --------                             # --------------
toggleAutoRotate                      @lib/engine/camera-controls-restore-bridge
focusOnNode                           @lib/engine/camera-choreography
animateCameraToNode                   @lib/engine/camera-choreography
animateCameraToTerrainPrelude         @lib/engine/camera-choreography
animateCameraToSearchCorridor         @lib/engine/camera-choreography
cancelFocusCameraAnimation            @lib/engine/camera-choreography
settleCameraToOverviewPose            @lib/engine/camera-controls-restore-bridge
isCameraIdleOrbitAllowed              @lib/engine/camera-controls-restore-bridge
syncOrbitAutoRotate                   @lib/engine/camera-controls-restore-bridge
setAutoRotateSuspended                @lib/engine/camera-controls-restore-bridge
clearAutoRotateResumeTimer            @lib/engine/camera-controls-restore-bridge
scheduleAutoRotateResume              @lib/engine/camera-controls-restore-bridge
noteSceneInteraction                  @lib/engine/camera-controls-restore-bridge
updateAutoRotateSoftResume            @lib/engine/camera-controls-restore-bridge
OVERVIEW_CAMERA_POSE                  @lib/engine/camera-controls-restore-bridge
setFocusTransitionMode                @lib/engine/camera-controls-core
getFocusTransitionProgress            @lib/engine/camera-controls-core
startFocusCameraAssist                @lib/engine/camera-controls-core
releaseFocusCameraAssist              @lib/engine/camera-controls-core
focusCameraAssistIsActive             @lib/engine/camera-controls-core
syncCameraAssistDataset                @lib/engine/camera-controls-core
setCameraAssistChoreography           @lib/engine/camera-controls-core
setRouteExplorationState              @lib/engine/camera-controls-core
clearRouteExploration                 @lib/engine/camera-controls-core
markRouteExploration                  @lib/engine/camera-controls-core
shouldMarkRouteExploration            @lib/engine/camera-controls-core
getRouteLayerOrigin                   @lib/engine/camera-controls-core
```

## The 1 remaining consumer (deferred to parallel session or follow-up)

`src/lib/engine/index.ts` (24 functions, 1 line of import) — blocked by
concurrent parallel session modification. The file is being heavily
restructured (added/removed sections during my edit attempts). The
`─` (U+2500) box-drawing characters in section headers also break the
edit tool's exact-string matching.

**Suggested follow-up:** Once the parallel session's restructure
settles, change `} from './camera-controls';` to `};` and prepend 3
canonical imports above the export block. Then delete
`js/modules/camera-controls.ts` (131 LOC).

## Parallel session Tier-2 retirements (in same arc)

The parallel session also retired 4 legacy `js/modules/*.ts` files where
the canonical version already lived in `src/lib/`:

| Commit | What |
|---|---|
| `7a0a25e` | retire `js/modules/config.ts` (107 LOC) → `src/lib/engine/config.ts` |
| `127523e` | retire `js/modules/environment.ts` (144 LOC) → `src/lib/utils/environment.ts` |
| `adbc6fe` | retire `js/modules/focus-panel-mode.ts` (31 LOC) → `src/lib/utils/focus-panel-mode.ts` |
| `705e9b7` | retire `js/modules/cluster-labels.ts` (275 LOC) → `src/lib/ui/cluster-labels.ts` |

Pattern: same as the W14 charter's Tier-2 Bridge Teardown — Utilities &
Config section. The session is systematically retiring legacy `js/modules/`
files that have exact canonical counterparts in `src/lib/`.

## Verification gates

After my 4 commits (each verified before push):
- svelte-check: 0 errors, 0 warnings
- vitest: 60 files / 652 tests / 0 errors
- bridge contract: 5/5
- ts-js-drift: clean

## What remains for the camera-controls retirement

1. `src/lib/engine/index.ts` rewire (24 functions, 1 line, deferred)
2. `git rm js/modules/camera-controls.ts` (131 LOC, the final deletion)

After both land, the W16 #4 follow-up is complete and the
death-bridge pattern can be retired entirely.
