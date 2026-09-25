/**
 * @lib/engine/lifecycle-bridge.ts — Bridge for lifecycle, binding, and UI rendering functions.
 *
 * Re-exports engine-kernel symbols consumed by Svelte journey modules
 * so that journey-layer code does not import directly from js/.
 */

export {
    copyCurrentViewLink,
    exploreInsideToNextStop,
    hideSummaryCard,
    probeSemanticLane,
    refreshCompositionState,
    resetExperienceState,
    resetExplorationFocus,
    resetNodePositions,
    returnToOverview,
    setSemanticDiveMode,
    setTrailDepth,
    switchView,
    updateExplorationUi
} from '@lib/orchestration/lifecycle'
export {
    getPreviouslyFocusedFocusStage,
    setPreviouslyFocusedFocusStage
} from '../journey/lifecycle-adapter'
export { revealSelectedBusinessCard } from '@lib/ui/panel-bindings'
export { applyClusterUiAccent } from '../ui/cluster-ui-accent'
export { selectedPointStore as legacySelectedPointStore } from '../stores/legacy-stores'

// Relocated legacy re-exports from semantic-guide-bridge & semantic-dive-bridge
export { buildSemanticGuideRequestPayload } from '../journey/semantic-guide-payload'
export { updateLegendGuideState } from '@lib/stores/legend-panel.svelte.ts'
export { showSemanticThreadsDetail } from '../journey/connection-analysis'
export { semanticGuideStateStore } from '../stores/legacy-stores'
export { getNextWalkCandidateForIndex } from '../journey/lifecycle-adapter'
export { ensureFocusStageAuxiliaryDom, ensureDiveButton } from '../journey/focus-stage-dom'

// Relocated legacy re-exports from ui-renderers-bridge
// (directly from source modules since the ui-renderers shim is retired)
export { setActiveSearchResultRow } from '../search/result-renderer'
export { updateSearchTrailCue } from '../journey/search-trail-cue-renderer'
export {
    updateSelectedCardHeading,
    renderSelectedMetaStrip,
    renderSelectedMatchPanel,
    renderSelectedActionRow,
    syncSelectedCardContentVariant
} from '../journey/focus-stage-renderer'
