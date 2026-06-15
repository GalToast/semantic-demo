/**
 * @lib/engine/lifecycle-bridge.ts — Bridge for lifecycle and binding functions.
 *
 * Re-exports engine-kernel symbols consumed by Svelte journey modules
 * so that journey-layer code does not import directly from js/.
 */

export { setSemanticDiveMode } from '../../../js/modules/lifecycle';
export { getPreviouslyFocusedFocusStage, setPreviouslyFocusedFocusStage } from '../../../js/modules/journey-lifecycle-adapter';
export { revealSelectedBusinessCard } from '../../../js/modules/bindings/panel-bindings';
export { applyClusterUiAccent } from '../../../js/modules/cluster-ui-accent';
export { selectedPointStore as legacySelectedPointStore } from '../../../js/modules/stores';
