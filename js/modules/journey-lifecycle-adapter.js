/**
 * adapter layer to decouple journey.js from globals
 *
 * Retained wrappers (8 of original 17):
 *   - initJourneyLifecycleAdapter: called by app.js (off-limits)
 *   - previewInsideNextThread: used by app.js (off-limits)
 *   - getNextWalkCandidateForIndex: used by app.js + journey-compass-state.js (off-limits)
 *   - getInterestingBusinessNote: used by app.js + journey-compass-state.js (off-limits)
 *   - buildSelectedMatchNarrative: used by app.js (off-limits)
 *   - getPreviouslyFocusedFocusStage / setPreviouslyFocusedFocusStage: adapter-internal state
 *
 * Inlined into consumers (9 wrappers removed):
 *   - setSemanticDiveMode → journey-compass-controller.js imports journey.js directly
 *   - hasColdDegradedSemanticFallback → journey-focus-ui.js returns false directly
 *   - shouldUseFloatingFocusJourneyOnly → journey-focus-ui.js returns false directly
 *   - isFieldNodeFocusContext → journey-selected-card.js imports journey-focus-ui.js directly
 *   - revealSelectedBusinessCard → journey-selected-card.js imports event-bindings.js directly
 *   - describeThreadLensForPoint → SelectedBusinessDetails.svelte imports journey-point-color.js
 *   - hydrateLeadContext → journey-selected-card.js imports lifecycle.js directly
 *   - setLastCanvasNodePick / setLastCanvasNodeFocusPick → journey-canvas-interaction.js writes state directly
 *
 * Removed as dead code (no adapter consumer):
 *   - applyLocalNeighborhoodFocus, setLastCanvasNodeHover, getColdDegradedRouteCopy
 */

let previouslyFocusedFocusStage = null;

let adapter = {
    previewInsideNextThread: (_options) => {},
    getNextWalkCandidateForIndex: (_currentIndex, _options) => null,
    getInterestingBusinessNote: (_point) => null,
    buildSelectedMatchNarrative: (_point) => '',
    getPreviouslyFocusedFocusStage: () => previouslyFocusedFocusStage,
    setPreviouslyFocusedFocusStage: (el) => { previouslyFocusedFocusStage = el || null; },
};

export function initJourneyLifecycleAdapter(deps) {
    adapter = { ...adapter, ...deps };
}

export function previewInsideNextThread(options) { return adapter.previewInsideNextThread(options); }
export function getNextWalkCandidateForIndex(currentIndex, options) { return adapter.getNextWalkCandidateForIndex(currentIndex, options); }
export function getInterestingBusinessNote(point) { return adapter.getInterestingBusinessNote(point); }
export function buildSelectedMatchNarrative(point) { return adapter.buildSelectedMatchNarrative(point); }

// State accessors
export function getPreviouslyFocusedFocusStage() { return adapter.getPreviouslyFocusedFocusStage(); }
export function setPreviouslyFocusedFocusStage(el) { adapter.setPreviouslyFocusedFocusStage(el); }
