/**
 * adapter layer to decouple journey.js from globals
 */

let previouslyFocusedFocusStage = null;

let adapter = {
    previewInsideNextThread: (_options) => {},
    getNextWalkCandidateForIndex: (_currentIndex, _options) => null,
    applyLocalNeighborhoodFocus: (_seedIndex) => {},
    setSemanticDiveMode: (_enabled) => {},
    getInterestingBusinessNote: (_point) => null,
    buildSelectedMatchNarrative: (_point) => '',
    hasColdDegradedSemanticFallback: () => false,
    getColdDegradedRouteCopy: () => '',
    getSelectedBusinessRoleLabel: (_point) => '',
    isFieldNodeFocusContext: () => false,
    revealSelectedBusinessCard: () => {},
    describeThreadLensForPoint: (_point) => '',
    hydrateLeadContext: (_point, _options) => Promise.resolve(),
    shouldUseFloatingFocusJourneyOnly: () => false,
    
    // global variables state
    getPreviouslyFocusedFocusStage: () => previouslyFocusedFocusStage,
    setPreviouslyFocusedFocusStage: (el) => { previouslyFocusedFocusStage = el || null; },
    
    setLastCanvasNodePick: (_val) => {},
    setLastCanvasNodeHover: (_val) => {},
    setLastCanvasNodeFocusPick: (_val) => {}
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
