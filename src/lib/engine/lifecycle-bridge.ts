/**
 * @lib/engine/lifecycle-bridge.ts — Bridge for lifecycle functions.
 *
 * Re-exports engine-kernel symbols consumed by src/lib/journey/journey.ts
 * so that journey-layer code does not import directly from js/.
 */

export { setSemanticDiveMode } from '../../../js/modules/lifecycle';
