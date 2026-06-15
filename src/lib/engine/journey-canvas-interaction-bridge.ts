/**
 * @lib/engine/journey-canvas-interaction-bridge.ts — Bridge for journey canvas interaction functions.
 *
 * Re-exports engine-kernel symbols consumed by src/lib/journey/journey.ts
 * so that journey-layer code does not import directly from js/.
 */

export {
  ensureCanvasNodeInteractionBindings,
  isThreadCandidateVisibleOnCanvas,
  initJourneyCanvasInteractionAdapter,
} from '../../../js/modules/journey-canvas-interaction';
