/**
 * @lib/engine/window-actions-bridge.ts — Thin bridge for window action handlers.
 *
 * Consolidates the legacy engine-kernel symbols consumed by
 * src/lib/orchestration/window-actions.ts so the orchestration layer stays on
 * the sanctioned engine bridge side of the import contract.
 */

export { state, withStateMutation } from './state-bridge'
export { focusOnNode } from '@lib/engine/camera-choreography'
export { search, clearSearch } from './search-state-bridge'
export {
    switchView,
    setTrailDepth,
    setSemanticDiveMode,
    returnToOverview,
    resetExperienceState,
    resetExplorationFocus,
    refreshCompositionState
} from './lifecycle-bridge'
export { setTrailFromSeed } from '@lib/journey/neighborhood'
export { traverseNeighbor, walkThreadNeighbor } from '@lib/journey/thread-settler'
export {
    inspectThreadNeighbor,
    pinThreadNeighbor,
    unpinThreadInspection,
    clearThreadInspection
} from '@lib/journey/thread-inspector'
export { showSemanticThreadsDetail } from './lifecycle-bridge'
