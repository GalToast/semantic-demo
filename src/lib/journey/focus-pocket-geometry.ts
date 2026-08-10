// focus-pocket-geometry.ts
// HUB re-export module — preserved as the canonical public path for every
// focus-pocket geometry symbol. The implementation lives in focused sibling
// modules under src/lib/journey/; this file is a pure barrel to keep every
// existing `from '@lib/journey/focus-pocket-geometry'` call site working.
//
//   focus-pocket-math.ts          pure math (clamp / easing / seededUnit / safeUnitScore)
//   focus-pocket-profiles.ts      view basis, motif, viewport profile, placement, role bias
//   focus-pocket-thread-curve.ts  zero-alloc Bézier curve math + scratch pool
//   focus-pocket-builder.ts       PocketEntry shape + staged + semantic pocket assembly
//
// This file is a pure move refactor — no function bodies live here, no behavior
// is changed. See `tmp/god-file-focuspocket-REPORT.md` for the inventory table.

export { clampNumber, easeOutQuint, seededUnit, safeUnitScore } from './focus-pocket-math'

export {
    getFocusViewBasis,
    getFocusConstellationMotif,
    getFocusConstellationMotifForPersonality,
    getFocusConstellationViewportProfile,
    getFocusBeaconDeclutterProfile,
    getDeclutteredFocusBeaconIndices,
    getFocusConstellationPlacement,
    applyRelationshipRolePlacementBias,
    type FocusViewBasis,
    type ConstellationMotif,
    type ViewportProfile,
    type PlacementParams
} from './focus-pocket-profiles'

export { getFocusThreadCurvePointInto, getFocusThreadCurvePoint, type ThreadEdge } from './focus-pocket-thread-curve'

export {
    buildFocusedPocketStagedPositions,
    buildFocusedSemanticPocket,
    type PocketEntry,
    type PocketStagedResult,
    type SemanticPocketResult
} from './focus-pocket-builder'
