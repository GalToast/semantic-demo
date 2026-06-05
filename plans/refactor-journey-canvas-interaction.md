# Refactor Plan: journey-canvas-interaction.js

## Goal
Split `js/modules/journey-canvas-interaction.js` (466 lines) into focused modules while preserving the public export surface exactly.

## Current Public Exports (MUST be preserved in the facade)
- `initJourneyCanvasInteractionAdapter` (function, used by `journey.js`)
- `isThreadCandidateVisibleOnCanvas` (function, used by `journey-focus-ui.js`)
- `ensureCanvasNodeInteractionBindings` (function, used by `journey-focus-ui.js`)

## Current Imports
- `THREE` from `three`
- `state` from `../state.js`
- `* as adapter` from `./journey-lifecycle-adapter.js`
- `isPointVisible` from `./utils/geo-data.js`
- `focusOnNode`, `noteSceneInteraction`, `releaseFocusCameraAssist` from `./camera-controls.js`
- `getSemanticThreadDisplayLimit` from `./journey-neighborhood.js`
- `hasCoarsePointer` from `./environment.js`

## New Module Structure

### 1. `js/modules/journey-canvas-hit-test.js`
Extract 3D-to-screen projection and visibility checking:
- `isThreadCandidateVisibleOnCanvas` function (lines 43-68) — EXPORTED
- `getFocusThreadScreenCandidates` function (lines 70-116)
- `getNearestCanvasThreadCandidate` function (lines 118-130)
- `getCanvasPointerPosition` function (lines 132-145)
- `getCanvasFieldNodeClickRadius` function (lines 147-152)

Internal: `canvasInteractionAdapter` (lines 13-20) and `initJourneyCanvasInteractionAdapter` (lines 22-41) must live here since `getFocusThreadScreenCandidates` and `getNearestCanvasThreadCandidate` depend on the adapter.

Exports: `initJourneyCanvasInteractionAdapter`, `isThreadCandidateVisibleOnCanvas`, `getNearestCanvasThreadCandidate`, `getCanvasPointerPosition`, `getCanvasFieldNodeClickRadius`, `canvasInteractionAdapter`

### 2. `js/modules/journey-canvas-node-picking.js`
Extract node picking/raycasting logic:
- `canvasFieldRaycaster` (line 154)
- `compareCanvasNodePickCandidates` function (lines 156-168)
- `getCanvasNodePickingMode` function (lines 170-174)
- `getCanvasPointWorldThreshold` function (lines 176-183)
- `getCanvasNodeScreenCandidate` function (lines 185-202)
- `findRaycastCanvasFieldNode` function (lines 204-249)
- `findNearestCanvasFieldNode` function (lines 251-279)

Exports: `findNearestCanvasFieldNode`

Imports from `journey-canvas-hit-test.js`: `getCanvasPointerPosition`, `getCanvasFieldNodeClickRadius`, `canvasInteractionAdapter`

### 3. `js/modules/journey-canvas-hover.js`
Extract hover state management:
- `CANVAS_FIELD_HOVER_CLEAR_DELAY_MS` (line 10)
- `STABLE_HOVER_STICKY_PX` (line 11)
- `clearCanvasFieldHover` function (lines 281-297)
- `setCanvasFieldHover` function (lines 299-327)

Exports: `clearCanvasFieldHover`, `setCanvasFieldHover`

Imports from `journey-canvas-hit-test.js`: `canvasInteractionAdapter`

### 4. Facade: `js/modules/journey-canvas-interaction.js` (thin orchestrator)
- Import from the 3 new modules
- Re-export `initJourneyCanvasInteractionAdapter`, `isThreadCandidateVisibleOnCanvas`, `ensureCanvasNodeInteractionBindings`
- Keep `ensureCanvasNodeInteractionBindings` function (lines 329-466) inline — it's the event binding orchestrator that ties hit-test, node-picking, and hover together
- Keep `CANVAS_THREAD_INSPECTION_CLEAR_DELAY_MS` (line 9) here since it's only used in the event bindings

## Import Updates Required
- `journey.js` imports `initJourneyCanvasInteractionAdapter` from `./modules/journey-canvas-interaction.js` — NO CHANGE needed (facade re-exports)
- `journey-focus-ui.js` imports `ensureCanvasNodeInteractionBindings` and `isThreadCandidateVisibleOnCanvas` from `./modules/journey-canvas-interaction.js` — NO CHANGE needed

## Rules
1. Do NOT change any function signatures or return types.
2. Do NOT add comments unless they were already present in the source.
3. Do NOT reformat or restyle code that is merely being moved.
4. Each new module must import its own dependencies (THREE, state, adapter, etc.) as needed.
5. After creating the new modules and updating the facade, run `npm run lint` to verify.
6. Run `npm run test` and `npm run test:unit` to verify nothing is broken.
7. Return the list of files created/modified and any lint or test failures.
