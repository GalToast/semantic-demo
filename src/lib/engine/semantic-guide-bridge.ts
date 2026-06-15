/**
 * @lib/engine/semantic-guide-bridge.ts — Thin bridge for semantic guide legacy imports.
 *
 * Re-exports engine-kernel symbols consumed by src/lib/journey/semantic-guide.ts
 * so that journey-layer code does not import directly from js/.
 */

export { buildSemanticGuideRequestPayload } from '../../../js/modules/semantic-guide-payload';
export { updateLegendGuideState } from '../../../js/modules/legend-ui';
export { showSemanticThreadsDetail } from '../../../js/modules/connection-analysis';
export { semanticGuideStateStore } from '../../../js/modules/stores';
