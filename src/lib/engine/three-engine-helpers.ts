/**
 * @lib/engine/three-engine-helpers.ts — Pure helper functions extracted from three-engine-core.ts
 *
 * Phase 1 of the decomposition plan (docs/three-engine-decomposition-plan.md).
 * Each function is pure or data-dependent (no module-level state access).
 */

import type { AppState } from '@lib/state/app.svelte'

export function hasFiniteNodeIndex(value: unknown): boolean {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/**
 * The render-skip gate must account for visual updates that do not require a
 * continuous 60fps loop. In normal motion mode the idle loop still advances
 * point time, pulse phase, and thread opacity, so its 8fps tick needs to
 * render. A hover flash can also decay after the continuous-frame flag clears.
 */
export function sceneVisualsNeedRender(
    sceneNeedsContinuous: boolean,
    prefersReducedMotion: boolean,
    hoverEmissiveFlash: number
): boolean {
    return Boolean(
        sceneNeedsContinuous ||
        !prefersReducedMotion ||
        (Number.isFinite(hoverEmissiveFlash) && hoverEmissiveFlash > 0.001)
    )
}

export function sceneNeedsContinuousFrame(
    now: number,
    state: AppState | null,
    autoRotateResumeDueAt: number | null = null
): boolean {
    if (!state) return true
    const focusPocketMotion = state.focusState.pocketMotionByIndex as unknown
    const focusPocketMoving = Array.isArray(focusPocketMotion)
        ? focusPocketMotion.length > 0
        : (focusPocketMotion as Map<unknown, unknown>)?.size > 0
    const autoRotateActive = Boolean(state.navState.autoRotate && !state.navState.autoRotateSuspended)
    const autoRotateResumePending =
        typeof autoRotateResumeDueAt === 'number' && autoRotateResumeDueAt > now
    const routeTraceActive = Boolean(state.routeTraceLines)
    return Boolean(
        state.sceneRevealActive ||
        state.focusState.nodesAreSettling ||
        state.myceliumDirty ||
        routeTraceActive ||
        focusPocketMoving ||
        autoRotateActive ||
        autoRotateResumePending ||
        state.searchState?.searchGlowActive ||
        hasFiniteNodeIndex(state.hoverHighlightIndex) ||
        hasFiniteNodeIndex(state.focusedNode) ||
        hasFiniteNodeIndex(state.focusState.inspectedThreadIndex) ||
        hasFiniteNodeIndex(state.focusState.pinnedThreadIndex)
    )
}
