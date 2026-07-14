/**
 * @lib/state/types/navigation-types.ts — Navigation and sub-aggregate state types.
 *
 * Extracted from state-types.ts (W13-T5b) to reduce file size.
 * Contains FocusAppState, ViewportAppState, and cross-cutting navigation types.
 */

import type { PocketMotionWithFrame } from '@lib/types/state'
import type { FocusTransitionMode } from '@lib/types/state'
import type { Point } from './core-types'
import type { InspectedStrandDiagnostics } from './engine-types'

/**
 * @lib/state/types/navigation-types.ts — FocusAppState sub-aggregate (Phase 6c)
 *
 * The 13 persistent focus-domain fields that the focus mirror reads
 * (focus.svelte.ts's `_readFocusSnapshot`). Plus related cross-cutting
 * fields that the focus store owns by convention (pocket metadata,
 * panel state, transition tracking).
 *
 * Fields match what was previously flat on AppState and what
 * focus.svelte.ts's `computeFromAppState` reads:
 *   - selectedPoint: the focused business record (narrowed via narrowToPoint)
 *   - inspectedThreadIndex: currently-inspected strand thread index
 *   - pinnedThreadIndex: user-pinned inspection index
 *   - nodesAreSettling: motion-settling flag (drives depth-of-field)
 *   - pocketMotionByIndex: per-pocket motion data
 *   - pocketTransitionStartedAt: timestamp of last pocket-mount transition
 *   - infoPanelOpen: focus info-panel visibility
 *   - pocketListVisible: pocket-list visibility
 *   - pocketRoleFilter: all|direct|support|civic filter
 *   - focusTransitionMode: idle|entering|settling|inside|exiting
 *   - focusTransitionStartedAt: timestamp of current transition
 *   - inspectedStrandDiagnostics: segment/braid/endpoint counts + source
 *   - threadInspectorPointerInside: hover-over-inspector flag
 *
 * Fields kept flat for now (future rounds):
 *   - Three.js mesh references (focusAnchorGroup, focusLens, etc.) —
 *     transient engine handles, not domain state
 *   - ripple/pulse animation state — visual effects
 *   - settling watchdog internals (`_settling*`) — engine telemetry
 */
export interface FocusAppState {
    selectedPoint: Point | null
    inspectedThreadIndex: number | null
    pinnedThreadIndex: number | null
    inspectedStrandDiagnostics: InspectedStrandDiagnostics
    threadInspectorPointerInside: boolean
    pocketMotionByIndex: Map<number, PocketMotionWithFrame>
    pocketTransitionStartedAt: number
    infoPanelOpen: boolean
    pocketListVisible: boolean
    pocketRoleFilter: 'all' | 'direct' | 'support' | 'civic'
    focusTransitionMode: FocusTransitionMode
    focusTransitionStartedAt: number
    nodesAreSettling: boolean
}

/**
 * @lib/state/types/navigation-types.ts — ViewportAppState sub-aggregate (Phase 6d)
 *
 * The 5 viewport-domain fields that the viewport mirror's
 * `bindings` map mirrors back to appState. These were previously flat
 * top-level fields; consolidating them into a sub-aggregate keeps
 * the viewport store's domain boundary explicit.
 *
 * Fields:
 *   - viewportWidth: current viewport width in CSS pixels
 *   - viewportHeight: current viewport height in CSS pixels
 *   - viewportDpr: device pixel ratio (window.devicePixelRatio)
 *   - viewportReducedMotion: prefers-reduced-motion media query
 *   - viewportIsCompact: compact-viewport breakpoint flag
 */
export interface ViewportAppState {
    viewportWidth: number
    viewportHeight: number
    viewportDpr: number
    viewportReducedMotion: boolean
    viewportIsCompact: boolean
}
