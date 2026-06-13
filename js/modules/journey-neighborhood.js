export * from './journey-neighborhood.ts';
import {
  primeBoundedSemanticNeighborhoodForTraversal,
  resetBoundedNeighborhood,
} from './journey-neighborhood.ts';

export function getSemanticNeighborRecordBetween() {
  return null;
}

export function ensureBoundedNeighborhoodFromActivePocket() {
  return false;
}

export function setTrailFromSeed(index) {
  return primeBoundedSemanticNeighborhoodForTraversal(index);
}

export function updateTrailIndices(_index) {}
export { resetBoundedNeighborhood };
