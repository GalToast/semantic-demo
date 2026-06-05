# Plan: Refactor micro-demo.js

## Goal
Split `js/modules/micro-demo.js` (747 lines, god-module) into focused modules + thin facade preserving all public exports.

## Current Concerns Mixed
1. **State machine** - 9 phases (IDLE, GLIDING, ARRIVED, CARD_VISIBLE, PULLBACK, WIDE_VIEW, RETURNING, COMPLETE, CANCELLED)
2. **Eligibility guards** - seen-before, reduced-motion, WebGL, URL params, app readiness
3. **Camera choreography** - overview snapshot capture, camera tweening to/from overview
4. **DOM/UI manipulation** - veil, pill, toast, input blocker, CSS injection
5. **App state mutation** - focus setup, reset, navState manipulation
6. **Demo choreography** - the 8800ms timed sequence of phases in `_runDemo`

## Proposed Module Split

### 1. `js/modules/micro-demo-guards.js` (~120 lines)
- `isAppReadyForDemo()` — checks state.view, focus, loading, scene reveal
- `guardNotSeen()` — localStorage check
- `guardReducedMotion()` — prefers-reduced-motion + dev flag
- `guardWebGL()` — WebGL context + software renderer detection
- `guardUrlParam()` — nodemo URL param
- `recordCompletion()` — localStorage write
- `notifyDemoUnableToStart()` — CustomEvent dispatch
- `STORAGE_KEY`, `SESSION_STORAGE_KEY`

### 2. `js/modules/micro-demo-ui.js` (~170 lines)
- `showVeil(active)` / `hideVeil()` — veil DOM toggle
- `showPill(text)` — create and append demo pill with skip button + auto-dismiss timer
- `removePill()` — remove pill from DOM
- `showEndToast()` — create and append end toast with close button + auto-remove timer
- `bindInputInterceptor(cancelMicroDemo)` / `unbindInputInterceptor()` — create/remove micro-demo-blocker overlay, bind/unbind mousedown/touchstart/keydown listeners
- `injectMicroDemoStyles()` — CSS keyframe injection for microDemoPulse, microDemoPillIn, microDemoToastIn

### 3. `js/modules/micro-demo-camera.js` (~80 lines)
- `captureOverviewCameraSnapshot()` — capture state.camera.position + state.controls.target clones
- `getOverviewCameraSnapshot()` — return cloned snapshot or fallback defaults
- `animateCameraToOverview(duration)` — rAF tween from current to overview snapshot (respects prefers-reduced-motion)

### 4. `js/modules/micro-demo-orchestration.js` (~200 lines)
- `SHOWCASE_POOL`, shuffled pool
- `getDemoNode()` — pick demo node from shuffled pool + fallback scan
- `setupDemoFocus(demoNode)` — __demoFocusSetup equivalent: set selectedPoint, navState, updateSelectedBusiness, applyPointFilterColors, updateExplorationUi, updateJourneyCompass, refreshCompositionState, resetNodePositions, applyLocalNeighborhoodFocus
- `resetDemoAppState()` — __demoReset equivalent: clear selectedPoint, navState back to overview, clear focus pocket, update UI
- `runDemoSequence({ demoNode, onPhaseChange, onComplete })` — the _runDemo choreography: sets up timers, dispatches phases, triggers camera + UI at specific timestamps (200ms, 800ms, 2400ms, 3000ms, 4500ms, 6000ms, 7200ms, 7800ms, 8800ms). Accepts callbacks instead of direct module imports.
- `cleanupDemo()` — clear timers, hide veil, remove pill, unbind interceptor, reset phase state

### 5. `js/modules/micro-demo.js` (facade, ~150 lines)
Thin facade re-exporting public API from the 4 modules above:
- `initMicroDemo()` — runs guards, delegates to startMicroDemo
- `shouldRunMicroDemo()` — sessionStorage check + app readiness
- `startMicroDemo()` — eligibility checks, get demo node, run sequence
- `cancelMicroDemo(reason)` — cancel, reset state, animate back to overview
- `isMicroDemoRunning()` — boolean check
- Keeps module-level state: `_demoPhase`, `_demoNodeIndex`, `_demoTimers`, `_demoCancelled`, `_inputCleanup`, `_overviewCameraSnapshot`, `PHASE` constants, `_startRetryTimer`, `_startRetryDeadline`, `_startRetryCount`, `MAX_START_RETRIES`

## Exported Surface Preservation
Current exports from `micro-demo.js`:
1. `initMicroDemo()`
2. `shouldRunMicroDemo()`
3. `startMicroDemo()`
4. `cancelMicroDemo(reason)`
5. `isMicroDemoRunning()`

All 5 must remain available from `js/modules/micro-demo.js` with identical signatures.

## Import Chain
- `micro-demo.js` (facade) → imports from `micro-demo-guards.js`, `micro-demo-ui.js`, `micro-demo-camera.js`, `micro-demo-orchestration.js`
- `micro-demo-orchestration.js` → may import from `micro-demo-camera.js` for camera ops (or accept them as callback params)
- `micro-demo-guards.js` → no internal deps (only `state.js`, `environment.js`)
- `micro-demo-ui.js` → no internal deps (pure DOM)
- `micro-demo-camera.js` → `state.js`, `math-easing.js`

## Consumer Impact
No consumer changes needed. All external imports remain `from './micro-demo.js'`.

## Consumers (read only, do not edit)
- `js/modules/app.js` — `import { initMicroDemo } from './micro-demo.js'`
- `js/modules/bindings/panel-bindings.js` — `import { cancelMicroDemo } from '../micro-demo.js'`
- `js/modules/components/InfoPanelChrome.svelte` — `import { cancelMicroDemo } from '../micro-demo.js'`
- `js/modules/keyboard-help.js` — `import { cancelMicroDemo } from './micro-demo.js'`

## Verification Checklist
- [ ] `npm run lint` — 0 new errors
- [ ] `npm run test:unit` — all pass
- [ ] `npm run build` — succeeds
- [ ] All 5 exports available from `micro-demo.js` facade
- [ ] No consumer file changes needed (verify imports still work)

## Execution Order
1. Read `js/modules/micro-demo.js` fully
2. Create `micro-demo-guards.js`, extract guard functions
3. Create `micro-demo-camera.js`, extract camera helpers
4. Create `micro-demo-ui.js`, extract DOM helpers
5. Create `micro-demo-orchestration.js`, extract choreography
6. Rewrite `micro-demo.js` as thin facade, keep state + re-export public API
7. Verify all exports preserved
8. Run lint, tests, build
