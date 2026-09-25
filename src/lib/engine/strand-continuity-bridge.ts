/**
 * @lib/engine/strand-continuity-bridge.ts — Bridge for strand continuity state functions.
 *
 * Re-exports canonical symbols from @lib/utils/strand-continuity (the bug-fixed
 * singleton-manager port) consumed by src/lib/journey/journey.ts and sibling
 * journey-layer modules, so that journey-layer code does not import directly
 * from js/ or bypass the bridge seam.
 */

export {
    setStrandContinuityState,
    clearStrandContinuityState,
    setTimer,
    clearTimer,
    disposeTimers,
    getStrandArrivalNote
} from '@lib/utils/strand-continuity'
