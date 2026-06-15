/**
 * @lib/engine/focus-pocket-bridge.ts - Legacy focus-pocket geometry/personality bridge.
 *
 * Consolidates focus-pocket-geometry and focus-pocket-personality re-exports
 * consumed by src/lib/journey/focus-pocket.ts.
 * Keeps direct legacy imports behind the engine boundary.
 */

export { normalizeCityForFilter } from '../../../js/modules/utils/geo-data';

export {
  buildFocusedPocketStagedPositions,
  buildFocusedSemanticPocket,
  clampNumber,
  easeOutQuint,
  seededUnit,
  safeUnitScore,
  getFocusViewBasis,
  getFocusConstellationMotif,
  getFocusConstellationMotifForPersonality,
  getFocusConstellationViewportProfile,
  getFocusBeaconDeclutterProfile,
  getDeclutteredFocusBeaconIndices,
  getFocusConstellationPlacement,
  applyRelationshipRolePlacementBias,
  getFocusThreadCurvePoint,
  type PocketEntry,
} from '../../../js/modules/focus-pocket-geometry';

export {
  getNeighborhoodPersonality,
  getSemanticCandidateSlice,
  type NeighborhoodPersonality,
} from '../../../js/modules/focus-pocket-personality';
