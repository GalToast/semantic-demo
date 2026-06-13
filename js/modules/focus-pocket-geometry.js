/**
 * focus-pocket-geometry.js — Delegation shim to canonical implementation.
 *
 * Legacy tests import from js/modules/focus-pocket-geometry.js.
 * All logic lives in js/modules/focus-pocket-geometry.ts (BOTH pattern).
 */
export {
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
  buildFocusedPocketStagedPositions,
  buildFocusedSemanticPocket,
} from './focus-pocket-geometry.ts';
