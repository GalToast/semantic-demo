/**
 * @lib/engine/journey-canvas-interaction-bridge.ts - Bridge for journey canvas interaction functions.
 *
 * Re-exports Svelte-5-port functions from @lib/journey/canvas-interaction
 * so that journey-layer code does not import directly from js/.
 */

export {
  initJourneyCanvasInteractionAdapter,
  isThreadCandidateVisibleOnCanvas,
  ensureCanvasNodeInteractionBindings,
  disposeCanvasNodeInteractionBindings,
} from '@lib/journey/canvas-interaction';
