/**
 * @lib/engine/legend-ui-bridge.ts - Bridge adapter for legacy legend UI module.
 *
 * Re-exports the subset of js/modules/legend-ui consumed by
 * src/components/Legend.svelte, keeping the direct legacy import behind
 * the engine boundary.
 */

export { initLegendEventBusSubscriptions } from '../../../js/modules/legend-ui';
