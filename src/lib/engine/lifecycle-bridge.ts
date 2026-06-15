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

// Relocated legacy re-exports from semantic-guide-bridge & semantic-dive-bridge
export { buildSemanticGuideRequestPayload } from '../../../js/modules/semantic-guide-payload';
export { updateLegendGuideState } from '../../../js/modules/legend-ui';
export { showSemanticThreadsDetail } from '../../../js/modules/connection-analysis';
export { semanticGuideStateStore } from '../../../js/modules/stores';
export { getNextWalkCandidateForIndex } from '../../../js/modules/journey-lifecycle-adapter';
export { ensureFocusStageAuxiliaryDom, ensureDiveButton } from '../../../js/modules/focus-stage-dom';
