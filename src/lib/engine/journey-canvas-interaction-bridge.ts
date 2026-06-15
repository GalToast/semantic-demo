/**
 * @lib/engine/journey-canvas-interaction-bridge.ts - Legacy canvas interaction bridge.
 *
 * Keep direct legacy imports behind the engine boundary while the Svelte
 * journey layer is still being ported.
 */

export {
  ensureCanvasNodeInteractionBindings,
  isThreadCandidateVisibleOnCanvas,
  initJourneyCanvasInteractionAdapter,
} from '../../../js/modules/journey-canvas-interaction';
