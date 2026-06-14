/**
 * camera-math-utils.ts — thin re-export shim
 *
 * Canonical source moved to @lib/utils/camera-math-utils.ts (Wave 11 T1a).
 * This shim preserves backward compatibility for js/ importers.
 */
export {
    computeTravelVectorHeading,
    computeOrbitBiasHeading,
    computeCameraArcControlPoints,
} from '@lib/utils/camera-math-utils';
export type { FramingParams, PersonalityParams, PocketProfile } from '@lib/utils/camera-math-utils';
