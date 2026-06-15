/**
 * @lib/engine/thread-inspector-bridge.ts - Legacy thread inspector bridge.
 *
 * Keep direct legacy imports behind the engine boundary while the Svelte
 * journey layer is still being ported.
 */

export {
  getThreadInspectionState,
  renderThreadInspection,
  inspectThreadNeighbor,
  pinThreadNeighbor,
  unpinThreadInspection,
  scheduleCanvasThreadInspectionClear,
  clearThreadInspection,
} from '@lib/journey/thread-inspector';
