# Micro-Demo Specification (v1.0)

> ⚠️ **Historical spec (2026-05) — partially superseded by W46/W47 refactor.** Line references to `js/modules/*`, `state.points`, `setSemanticDiveMode`, `__demoReset`, `__demoFocusSetup`, and the GLIDING/ARRIVED/PULLBACK/RETURNING phase enum no longer describe the runtime. **Live canonical source:**
>
> - Entry: `src/lib/demo/choreography.ts` (`startMicroDemo`, `shouldRunMicroDemo`)
> - Guards: `src/lib/demo/guards.ts` (`SESSION_STORAGE_KEY = 'moco_mycelium_demo_session_v1'`)
> - Phase state: `src/lib/stores/demo.svelte.ts` (`DemoPhase` string union, `demoPhase()` accessor)
> - Overlay: `src/lib/demo/ui.ts` (`#micro-demo-blocker`)
> - Camera: `src/lib/demo/camera.ts`
> - Step script: `src/lib/demo/demo-script.ts`
> - State access: `appState` from `src/lib/state/app.svelte.ts` (replaces `state.points`, `state.focusedNode`, etc.)
> - Demo API calls live in `src/lib/stores/index.svelte.ts`; consumers go through `setInfoPanelOpen(...)` from `src/lib/stores/focus.svelte.ts`
>
> This doc is retained as the **behavioral intent reference** — what the demo *does*. The reactive phase enum has been replaced by a single `DemoPhase` string union (`IDLE | OVERVIEW | SEARCH | FOCUS | THREADS | NEIGHBORS | TRAIL | DIVE | FILTER | MAP`) plus a `runDemo(cancelMicroDemo)` worker in `demo-choreography.ts`. If you need exact timings, read `src/lib/demo/demo-script.ts`. If you need eligibility rules, read `src/lib/demo/guards.ts`.

## Overview

The Micro-Demo (`src/lib/demo/choreography.ts`) is a 9-second guided first-time interaction designed to show new users the core interaction loop of the Semantic Explorer without requiring them to read a tutorial. It runs automatically on the first visit to the application.

## Core Mechanics

### Eligibility & Triggers

The micro-demo relies on a guard function `shouldRunMicroDemo()` before initiating `startMicroDemo()`.
It fires **only** when all of these conditions are met:

1. `sessionStorage.getItem('moco_mycelium_demo_session_v1')` is NOT set (unless `?demo=force` is used).
2. The application is in the `galaxy` overview state.
3. The loading overlay has been dismissed.
4. Data (`appState.points` from `src/lib/state/app.svelte.ts`) has populated.
5. No node is currently focused.

### Demo Node Selection

The system automatically picks a node to demo based on:

1. A hardcoded, curated `SHOWCASE_POOL` of preferred node indices. The array is shuffled once on load to ensure variety.
2. It verifies the selected node has a valid, non-generic name (length > 2) and is not `disqualified`.
3. If no curated node passes the checks, it falls back to the first available valid node in the general dataset.

## Choreography & Timings

The demo is driven by a linear sequence of timed callbacks coordinating `src/lib/demo/camera.ts` (camera moves), `src/lib/demo/ui.ts` (overlay + spotlight pill + `#micro-demo-blocker`), `src/lib/demo/demo-script.ts` (step transitions), and `src/lib/stores/demo.svelte.ts` (phase mirror). The phase enum that this doc previously described as `GLIDING | ARRIVED | CARD_VISIBLE | PULLBACK | WIDE_VIEW | RETURNING | COMPLETE` has been simplified to a single `DemoPhase` value; see live source for the current step machine.

## Guard and Cancellation

The demo is fragile and completely interrupts the user experience. To respect user agency, the runtime in `src/lib/demo/ui.ts` and `src/lib/demo/choreography.ts` implements strict cancellation conditions:

- **Global Input Interceptor**: A transparent `div` (`#micro-demo-blocker`) created in `src/lib/demo/ui.ts` captures all interactions on the canvas.
- **Immediate Cancel**: If the user clicks, taps, or presses `Escape` outside of an explicit button, `cancelMicroDemo('user-input')` from `src/lib/demo/choreography.ts` runs immediately.
- **Cancellation Routine**:
  - All pending timers are cleared (`_clearRetryTimer`, etc.).
  - The application resets to the overview state through `cancelChoreography()` in `src/lib/engine/demo-choreography.ts`.
  - The camera smoothly returns to the overview snapshot.
  - The "Demo" pill and `#micro-demo-blocker` overlay are removed.
  - Auto-rotation resumes.

## State Management Restrictions

- All demo-attributed state writes to return the app to idle must pass through the public demo cancellation helper.
- State is mirrored to `appState.demoPhase` (single mirror of `DemoPhase`) so the rest of the app can react.
- The phase mirror discipline is enforced by `src/lib/state/create-state-mirror.ts` and audited by `tests/unit-active/as-any-budget.test.ts` plus the demo-store contract.

## Storage

The micro-demo relies on `sessionStorage` under the key `moco_mycelium_demo_session_v1`. This constant is exported as `SESSION_STORAGE_KEY` from `src/lib/demo/guards.ts`. The choreography never runs twice in the same browsing session, even across reloads or user-driven skips.

The first-visit eligibility flag is owned by `src/lib/demo/guards.ts` (`shouldRunMicroDemo`). The two guards are intentionally separate: `shouldRunMicroDemo()` decides whether a first-visit demo is eligible, while `startMicroDemo()` prevents duplicate choreography within the active session.
