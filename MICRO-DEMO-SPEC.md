# Micro-Demo Specification (v1.0)

## Overview
The Micro-Demo (`js/modules/micro-demo.js`) is a 9-second guided first-time interaction designed to show new users the core interaction loop of the Semantic Explorer without requiring them to read a tutorial. It runs automatically on the first visit to the application.

## Core Mechanics

### Eligibility & Triggers
The micro-demo relies on a guard function `shouldRunMicroDemo()` before initiating `startMicroDemo()`.
It fires **only** when all of these conditions are met:
1. `sessionStorage.getItem('moco_mycelium_demo_session_v1')` is NOT set (unless `?demo=force` is used).
2. The application is in the `galaxy` overview state.
3. The loading overlay has been dismissed.
4. Data (`state.points`) has populated.
5. No node is currently focused.

### Demo Node Selection
The system automatically picks a node to demo based on:
1. A hardcoded, curated `SHOWCASE_POOL` of preferred node indices. The array is shuffled once on load to ensure variety.
2. It verifies the selected node has a valid, non-generic name (length > 2) and is not `disqualified`.
3. If no curated node passes the checks, it falls back to the first available valid node in the general dataset.

## Choreography & Timings

The demo is driven by a linear sequence of `setTimeout` callbacks mapped to a state machine (`PHASE`).

| Time (ms) | Phase | Action |
| --- | --- | --- |
| 0 | `GLIDING` | Overview camera pose is captured. Auto-rotation is disabled. Input interception begins. A temporary "Demo" pill appears at the top of the screen. |
| 200 | `GLIDING` | Ambient spotlight glow begins (dispatched via `micro-demo-node-highlight` custom event, phase: `glow`). |
| 800 | `GLIDING` | Camera begins its cinematic glide to the demo node over 1600ms via `animateCameraToNode`. Spotlight ring intensifies. |
| 2400 | `ARRIVED` | The camera arrives. `__demoFocusSetup()` is invoked, triggering the focus pocket layout, selecting the business, and showing the focus stage card. Spotlight ring enters `arrived` phase. |
| 3000 | `CARD_VISIBLE` | The focus stage card is now fully visible. The demo triggers a visual pulse on the business name (`micro-demo-name-pulse`). |
| 4500 | `CARD_VISIBLE` | A second visual pulse on the business name. |
| 6000 | `PULLBACK` | Camera begins pulling back to a wider neighborhood view via `animateCameraToNode` (distance 1.8x). |
| 7200 | `WIDE_VIEW` | Wide view reached. Spotlight dims (`wide_view` phase). Info card slides out (`setInfoPanelOpen(false)`). |
| 7800 | `RETURNING` | The demo orchestrates `_resetAppState()` (returning the app to idle overview state) and animates the camera back to the original overview snapshot over 1000ms. |
| 8800 | `COMPLETE` | Demo cleanup runs. The demo pill is removed and replaced by an auto-dismissing toast: "That's the basics — explore freely". Auto-rotation resumes. `demo-complete` event is dispatched. |

## Guard and Cancellation

The demo is fragile and completely interrupts the user experience. To respect user agency, it implements strict cancellation conditions:

- **Global Input Interceptor**: A transparent `div` (`#micro-demo-blocker`) captures all interactions on the canvas.
- **Immediate Cancel**: If the user clicks, taps, or presses `Escape` anywhere outside of an explicit button (like the skip button), the demo immediately calls `cancelMicroDemo('user-input')`.
- **Cancellation Routine**:
  - All pending timers are cleared.
  - The application resets to the overview state via `_resetAppState()`.
  - The camera smoothly returns to the overview snapshot (over 800ms).
  - The "Demo" pill and overlay are destroyed.
  - Auto-rotation resumes.

## State Management Restrictions

- All global state writes to return the app to idle **must** pass through the `__demoReset()` helper.
- All global state writes to focus a node during the demo **must** pass through the `__demoFocusSetup(nodeIndex)` helper.
- These helpers ensure side-effects (e.g., UI updates, journey compass state, filter colors) are synchronously aligned with the demo phase transitions.

## Storage
The micro-demo relies on `sessionStorage` under the key `moco_mycelium_demo_session_v1`. It guarantees the choreography never runs twice in the same browsing session, even across reloads or user-driven skips.

The outer `demo-controller.js` still owns the lifetime `localStorage.moco_mycelium_demo_v1` seen flag after completion or cancellation. The two guards are intentionally separate: `demo-controller.js` decides whether a first-visit demo is eligible, while `micro-demo.js` prevents duplicate choreography within the active session.
