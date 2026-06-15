/**
 * @lib/engine/focus-pocket-bridge.ts - Focus-pocket geometry/personality bridge.
 *
 * Re-exports the Svelte 5 port of focus geometry and the
 * Svelte-native personality derivation for consumers that have not
 * yet been migrated to import from @lib/focus/geometry /
 * @lib/focus/pocket-personality directly.
 *
 * The state/withStateMutation re-exports are kept here as the bridge
 * seam so legacy consumers can continue to read from js/state until
 * the journey/focus-pocket.ts consumer is migrated off the bridge.
 * Per the Wave 11 3-step retirement path, the bridge is only deleted
 * after zero consumers reference it.
 */

export { state, withStateMutation } from './state-bridge';
export type { NavFocusPocketMeta, Point, SemanticState } from './state-bridge';

export { normalizeCityForFilter } from '@lib/utils/geo-data';

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
} from '@lib/focus/geometry';

export {
  getNeighborhoodPersonality,
  getSemanticCandidateSlice,
  type NeighborhoodPersonality,
  type SemanticCandidate,
} from '@lib/focus/pocket-personality';
