/**
 * @lib/engine/journey-text-helpers-bridge.ts — Bridge for journey text helper functions.
 *
 * Re-exports engine-kernel symbols consumed by src/lib/journey/journey.ts
 * so that journey-layer code does not import directly from js/.
 */

export {
  truncateMicrocopy,
  getSharedTrailTopicLabel,
} from '../../../js/modules/journey-text-helpers';
