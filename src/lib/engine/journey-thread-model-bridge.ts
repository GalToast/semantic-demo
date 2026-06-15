/**
 * @lib/engine/journey-thread-model-bridge.ts — Bridge for journey thread model functions.
 *
 * Re-exports native port symbols consumed by src/lib/journey/journey.ts
 * so that journey-layer code does not import directly from js/.
 */

export {
  normalizeLeadId,
  buildSpatialGrid,
  buildProjectedNeighborGrid,
  getProjectedNeighborCandidates,
  getGeometricThreadCandidates,
  getSemanticThreadCandidates,
  getThreadCandidatesForIndex,
} from '@lib/journey/thread-model';
