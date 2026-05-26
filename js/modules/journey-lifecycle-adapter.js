/**
 * adapter layer to decouple journey.js from globals
 */

let adapter = {
    previewInsideNextThread: (options) => {},
    getNextWalkCandidateForIndex: (currentIndex, options) => null,
    applyLocalNeighborhoodFocus: (seedIndex) => {},
    setSemanticDiveMode: (enabled) => {},
    getInterestingBusinessNote: (point) => null,
    buildSelectedMatchNarrative: (point) => '',
    hasColdDegradedSemanticFallback: () => false,
    getColdDegradedRouteCopy: () => '',
    getSelectedBusinessRoleLabel: (point) => '',
    isFieldNodeFocusContext: () => false,
    revealSelectedBusinessCard: () => {},
    describeThreadLensForPoint: (point) => '',
    hydrateLeadContext: (point, options) => Promise.resolve(),
    shouldUseFloatingFocusJourneyOnly: () => false,
    
    // global variables state
    getPreviouslyFocusedFocusStage: () => null,
    setPreviouslyFocusedFocusStage: (el) => {},
    
    setLastCanvasNodePick: (val) => {},
    setLastCanvasNodeHover: (val) => {},
    setLastCanvasNodeFocusPick: (val) => {}
};

export function initJourneyLifecycleAdapter(deps) {
    adapter = { ...adapter, ...deps };
}

export function previewInsideNextThread(options) { return adapter.previewInsideNextThread(options); }
export function getNextWalkCandidateForIndex(currentIndex, options) { return adapter.getNextWalkCandidateForIndex(currentIndex, options); }
export function applyLocalNeighborhoodFocus(seedIndex) { return adapter.applyLocalNeighborhoodFocus(seedIndex); }
export function setSemanticDiveMode(enabled) { return adapter.setSemanticDiveMode(enabled); }
export function getInterestingBusinessNote(point) { return adapter.getInterestingBusinessNote(point); }
export function buildSelectedMatchNarrative(point) { return adapter.buildSelectedMatchNarrative(point); }
export function hasColdDegradedSemanticFallback() { return adapter.hasColdDegradedSemanticFallback(); }
export function getColdDegradedRouteCopy() { return adapter.getColdDegradedRouteCopy(); }
export function getSelectedBusinessRoleLabel(point) { return adapter.getSelectedBusinessRoleLabel(point); }
export function isFieldNodeFocusContext() { return adapter.isFieldNodeFocusContext(); }
export function revealSelectedBusinessCard() { return adapter.revealSelectedBusinessCard(); }
export function describeThreadLensForPoint(point) { return adapter.describeThreadLensForPoint(point); }
export function hydrateLeadContext(point, options) { return adapter.hydrateLeadContext(point, options); }
export function shouldUseFloatingFocusJourneyOnly() { return adapter.shouldUseFloatingFocusJourneyOnly(); }

// State accessors
export function getPreviouslyFocusedFocusStage() { return adapter.getPreviouslyFocusedFocusStage(); }
export function setPreviouslyFocusedFocusStage(el) { adapter.setPreviouslyFocusedFocusStage(el); }

export function setLastCanvasNodePick(val) { adapter.setLastCanvasNodePick(val); }
export function setLastCanvasNodeHover(val) { adapter.setLastCanvasNodeHover(val); }
export function setLastCanvasNodeFocusPick(val) { adapter.setLastCanvasNodeFocusPick(val); }
