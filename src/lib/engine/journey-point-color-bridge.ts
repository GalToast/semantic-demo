/**
 * @lib/engine/journey-point-color-bridge.ts — Bridge for journey point color functions.
 *
 * Re-exports engine-kernel symbols consumed by src/lib/journey/journey.ts
 * so that journey-layer code does not import directly from js/.
 */

export {
  applyPointFilterColors,
  describeThreadLensForPoint,
} from '@lib/journey/point-color';
