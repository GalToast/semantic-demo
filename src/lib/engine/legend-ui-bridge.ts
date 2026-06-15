/**
 * @lib/engine/legend-ui-bridge.ts - Bridge adapter for legacy legend UI module.
 *
 * Re-exports the subset of Svelte-side legend UI functions, keeping
 * the direct legacy import behind the engine boundary.
 */

export { initLegendEventBusSubscriptions } from '@lib/journey/legend-ui';
