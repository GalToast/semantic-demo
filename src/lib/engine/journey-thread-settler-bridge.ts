/**
 * @lib/engine/journey-thread-settler-bridge.ts — Bridge for journey thread-settler traversal.
 *
 * Re-exports the subset of js/modules/journey-thread-settler consumed by
 * src/lib/journey/thread-settler-adapter.ts, keeping the direct legacy import
 * behind the engine boundary.
 */

export {
  traverseNeighbor,
  previewInsideNextThread,
} from '../../../js/modules/journey-thread-settler';
