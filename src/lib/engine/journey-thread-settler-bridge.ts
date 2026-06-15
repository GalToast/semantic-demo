/**
 * @lib/engine/journey-thread-settler-bridge.ts — Bridge for journey thread-settler traversal.
 *
 * Flipped to export directly from the native Svelte 5 implementation under @lib/journey/thread-settler.
 */

export {
  initJourneyTimerAdapter,
  getStrandArrivalNote,
  getInsideRelationshipLabel,
  summarizeNeighborReason,
  walkThreadNeighbor,
  traverseNeighbor,
  previewInsideNextThread,
} from '../journey/thread-settler';
