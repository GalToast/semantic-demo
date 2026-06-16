/**
 * @lib/engine/window-actions-bridge.ts — Thin bridge for window action handlers.
 *
 * Consolidates the legacy engine-kernel symbols consumed by
 * src/lib/orchestration/window-actions.ts so the orchestration layer stays on
 * the sanctioned engine bridge side of the import contract.
 */

export { state, withStateMutation } from './state-bridge';
export { focusOnNode } from '@lib/engine/camera-choreography';
export { search, clearSearch } from './search-state-bridge';
export {
  switchView,
  setTrailDepth,
  setSemanticDiveMode,
  returnToOverview,
  resetExperienceState,
  resetExplorationFocus,
  refreshCompositionState,
} from '../../../js/modules/lifecycle.ts';
export { setTrailFromSeed } from '../../../js/modules/journey-neighborhood.ts';
export { traverseNeighbor, walkThreadNeighbor } from './journey-thread-settler-bridge';
export {
  inspectThreadNeighbor,
  pinThreadNeighbor,
  unpinThreadInspection,
  clearThreadInspection,
} from './thread-inspector-bridge';
export { showSemanticThreadsDetail } from './lifecycle-bridge';
