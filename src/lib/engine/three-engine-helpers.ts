/**
 * @lib/engine/three-engine-helpers.ts — Pure helper functions extracted from three-engine-core.ts
 *
 * Phase 1 of the decomposition plan (docs/three-engine-decomposition-plan.md).
 * Each function is pure or data-dependent (no module-level state access).
 */

import type { LegacyState } from '@lib/state/legacy-state'

export function hasFiniteNodeIndex(value: unknown): boolean {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function sceneNeedsContinuousFrame(now: number, state: LegacyState | null): boolean {
    if (!state) return true
    const focusPocketMotion = state.focusPocketMotionByIndex as unknown
    const focusPocketMoving = Array.isArray(focusPocketMotion)
        ? focusPocketMotion.length > 0
        : (focusPocketMotion as Map<unknown, unknown>)?.size > 0
    const autoRotateActive = Boolean(state.autoRotate && !state.autoRotateSuspended)
    const autoRotateResumePending = typeof state.autoRotateResumeDueAt === 'number' && state.autoRotateResumeDueAt > now
    const routeTraceActive = Boolean(state.routeTraceLines)
    return Boolean(
        state.forceAnimate ||
        state.sceneRevealActive ||
        state.nodesAreSettling ||
        state.myceliumDirty ||
        routeTraceActive ||
        focusPocketMoving ||
        autoRotateActive ||
        autoRotateResumePending ||
        state.searchState?.searchGlowActive ||
        hasFiniteNodeIndex(state.hoverHighlightIndex) ||
        hasFiniteNodeIndex(state.focusedNode) ||
        hasFiniteNodeIndex(state.inspectedThreadIndex) ||
        hasFiniteNodeIndex(state.pinnedThreadIndex)
    )
}
