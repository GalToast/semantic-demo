/**
 * @lib/engine/semantic-dive-bridge.ts — Thin bridge for semantic dive legacy imports.
 *
 * Re-exports engine-kernel symbols consumed by src/lib/journey/semantic-dive.ts
 * so that journey-layer code does not import directly from js/.
 */

export { getNextWalkCandidateForIndex } from '../../../js/modules/journey-lifecycle-adapter';
export { ensureFocusStageAuxiliaryDom, ensureDiveButton } from '../../../js/modules/focus-stage-dom';
