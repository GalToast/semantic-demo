/**
 * @lib/engine/strand-continuity-bridge.ts — Bridge for strand continuity state functions.
 *
 * Re-exports engine-kernel symbols consumed by src/lib/journey/journey.ts
 * so that journey-layer code does not import directly from js/.
 */

export {
  setStrandContinuityState,
  clearStrandContinuityState,
} from '../../../js/modules/strand-continuity';
