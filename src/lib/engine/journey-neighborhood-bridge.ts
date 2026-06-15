/**
 * @lib/engine/journey-neighborhood-bridge.ts — Bridge for journey neighborhood functions.
 *
 * Re-exports engine-kernel symbols consumed by src/lib/journey/journey.ts
 * so that journey-layer code does not import directly from js/.
 */

export {
  initJourneyNeighborhoodAdapter,
  getSemanticThreadDisplayLimit,
  getNeighborhoodRouteIndices,
  isBoundedNeighborhoodActive,
  getNeighborhoodCandidateForIndex,
  getSemanticNeighborRecordBetween,
  buildNeighborhoodManifest,
  getBoundedNeighborhoodWalkCandidate,
  getNextWalkCandidateForIndex,
  getCurrentTrailFocusIndex,
  ensureBoundedNeighborhoodFromActivePocket,
  primeBoundedSemanticNeighborhoodForTraversal,
  setTrailFromSeed,
  updateTrailIndices,
} from '@lib/journey/neighborhood';
