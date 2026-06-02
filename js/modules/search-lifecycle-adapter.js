/**
 * search-lifecycle-adapter.js
 *
 * Injected adapter boundary: decouples search-state.js from raw global window
 * calls for five lifecycle-side-effect functions whose primary owners are
 * lifecycle.js and url-state.js.
 *
 * Ownership contract:
 *   - search-state.js must call adapter functions instead of window.<fn> directly.
 *   - This module is a leaf module. It does NOT import from search-state.js,
 *     cluster-filter.js, url-state.js, camera-controls.js, or lifecycle.js.
 *   - It does NOT import tooltip.js or lifecycle.js either; it receives
 *     live references injected from app.js at init time.
 *   - This breaks the potential cycle:
 *     search-state -> window -> lifecycle/url-state -> search-state
 *
 * Injection is done from app.js init, before any search-state function runs.
 *
 * Usage:
 *   import { initSearchLifecycleAdapter } from './search-lifecycle-adapter.js';
 *   // Called once from app.js init with all required function references.
 */

let _updateUrlState = null;
let _setSearchPanelState = null;
let _focusOnPoint = null;
let _updateExplorationUi = null;
let _resetNodePositions = null;
let _dispatchNavTransition = null;
let _syncSearchStatusForFocus = null;
let _updateJourneyCompass = null;
let _refreshCompositionState = null;
let _recordEmptySearch = null;

let _clearMobileRouteFieldPeek = null;
let _clearCompactSearchResultRevealTimers = null;
let _clearSearchPreviewHoverTimer = null;
let _settleCompactSearchFocusCard = null;
let _switchView = null;
let _updateSelectedBusiness = null;
let _syncMobileRoutePeek = null;
let _updateTrailIndices = null;
let _applyPointFilterColors = null;
let _refreshHoverSemanticOverlay = null;
let _resetExplorationFocus = null;
let _setSemanticLaneUiState = null;
let _clearSearch = null;
let _triggerSearchHeroMoment = null;
let _triggerCorridorNodeGlow = null;
let _triggerSearchCorridorAnimation = null;
let _hideSummaryCard = null;
let _setSemanticGuideButtonState = null;
let _scheduleCompactSearchResultReveal = null;
let _scheduleSearchFocusTask = null;

export function initSearchLifecycleAdapter(deps = {}) {
    _updateUrlState = typeof deps.updateUrlState === 'function' ? deps.updateUrlState : null;
    _setSearchPanelState = typeof deps.setSearchPanelState === 'function' ? deps.setSearchPanelState : null;
    _focusOnPoint = typeof deps.focusOnPoint === 'function' ? deps.focusOnPoint : null;
    _updateExplorationUi = typeof deps.updateExplorationUi === 'function' ? deps.updateExplorationUi : null;
    _resetNodePositions = typeof deps.resetNodePositions === 'function' ? deps.resetNodePositions : null;
    _dispatchNavTransition = typeof deps.dispatchNavTransition === 'function' ? deps.dispatchNavTransition : null;
    _syncSearchStatusForFocus = typeof deps.syncSearchStatusForFocus === 'function' ? deps.syncSearchStatusForFocus : null;
    _updateJourneyCompass = typeof deps.updateJourneyCompass === 'function' ? deps.updateJourneyCompass : null;
    _refreshCompositionState = typeof deps.refreshCompositionState === 'function' ? deps.refreshCompositionState : null;
    _recordEmptySearch = typeof deps.recordEmptySearch === 'function' ? deps.recordEmptySearch : null;

    _clearMobileRouteFieldPeek = typeof deps.clearMobileRouteFieldPeek === 'function' ? deps.clearMobileRouteFieldPeek : null;
    _clearCompactSearchResultRevealTimers = typeof deps.clearCompactSearchResultRevealTimers === 'function' ? deps.clearCompactSearchResultRevealTimers : null;
    _clearSearchPreviewHoverTimer = typeof deps.clearSearchPreviewHoverTimer === 'function' ? deps.clearSearchPreviewHoverTimer : null;
    _settleCompactSearchFocusCard = typeof deps.settleCompactSearchFocusCard === 'function' ? deps.settleCompactSearchFocusCard : null;
    _switchView = typeof deps.switchView === 'function' ? deps.switchView : null;
    _updateSelectedBusiness = typeof deps.updateSelectedBusiness === 'function' ? deps.updateSelectedBusiness : null;
    _syncMobileRoutePeek = typeof deps.syncMobileRoutePeek === 'function' ? deps.syncMobileRoutePeek : null;
    _updateTrailIndices = typeof deps.updateTrailIndices === 'function' ? deps.updateTrailIndices : null;
    _applyPointFilterColors = typeof deps.applyPointFilterColors === 'function' ? deps.applyPointFilterColors : null;
    _refreshHoverSemanticOverlay = typeof deps.refreshHoverSemanticOverlay === 'function' ? deps.refreshHoverSemanticOverlay : null;
    _resetExplorationFocus = typeof deps.resetExplorationFocus === 'function' ? deps.resetExplorationFocus : null;
    _setSemanticLaneUiState = typeof deps.setSemanticLaneUiState === 'function' ? deps.setSemanticLaneUiState : null;
    _clearSearch = typeof deps.clearSearch === 'function' ? deps.clearSearch : null;
    _triggerSearchHeroMoment = typeof deps.triggerSearchHeroMoment === 'function' ? deps.triggerSearchHeroMoment : null;
    _triggerCorridorNodeGlow = typeof deps.triggerCorridorNodeGlow === 'function' ? deps.triggerCorridorNodeGlow : null;
    _triggerSearchCorridorAnimation = typeof deps.triggerSearchCorridorAnimation === 'function' ? deps.triggerSearchCorridorAnimation : null;
    _hideSummaryCard = typeof deps.hideSummaryCard === 'function' ? deps.hideSummaryCard : null;
    _setSemanticGuideButtonState = typeof deps.setSemanticGuideButtonState === 'function' ? deps.setSemanticGuideButtonState : null;
    _scheduleCompactSearchResultReveal = typeof deps.scheduleCompactSearchResultReveal === 'function' ? deps.scheduleCompactSearchResultReveal : null;
    _scheduleSearchFocusTask = typeof deps.scheduleSearchFocusTask === 'function' ? deps.scheduleSearchFocusTask : null;
}

/**
 * Returns true when all lifecycle dependencies are resolved.
 * @returns {boolean}
 */
export function isSearchLifecycleAdapterReady() {
    return (
        _updateUrlState !== null
        && _setSearchPanelState !== null
        && _focusOnPoint !== null
        && _updateExplorationUi !== null
        && _resetNodePositions !== null
        && _dispatchNavTransition !== null
        && _syncSearchStatusForFocus !== null
        && _updateJourneyCompass !== null
        && _refreshCompositionState !== null
    );
}

/**
 * Delegate to the injected updateUrlState implementation.
 * Safe to call when unready; no-op.
 *
 * @param {object} params
 * @param {object} [options]
 */
export function updateUrlState(params, options) {
    if (_updateUrlState) _updateUrlState(params, options);
}

/**
 * Delegate to the injected setSearchPanelState implementation.
 * Safe to call when unready; no-op.
 *
 * @param {object} state
 */
export function setSearchPanelState(state) {
    if (_setSearchPanelState) _setSearchPanelState(state);
}

/**
 * Delegate to the injected focusOnPoint implementation.
 * Safe to call when unready; no-op.
 *
 * @param {object} point
 * @param {object} [options]
 */
export function focusOnPoint(point, options) {
    if (_focusOnPoint) _focusOnPoint(point, options);
}

/**
 * Delegate to the injected updateExplorationUi implementation.
 * Safe to call when unready; no-op.
 */
export function updateExplorationUi() {
    if (_updateExplorationUi) _updateExplorationUi();
}

/**
 * Delegate to the injected resetNodePositions implementation.
 * Safe to call when unready; no-op.
 *
 * @param {object} [options]
 */
export function resetNodePositions(options) {
    if (_resetNodePositions) _resetNodePositions(options);
}

/**
 * Delegate to the injected dispatchNavTransition implementation.
 * Used by search-state to route navState.mode/focusedIndex clears through
 * lifecycle's canonical navState reducer instead of writing directly.
 * Safe to call when unready; no-op.
 *
 * @param {string} action - One of NAV_TRANSITION_ACTIONS
 * @param {object} [payload={}]
 */
export function dispatchNavTransition(action, payload) {
    if (_dispatchNavTransition) _dispatchNavTransition(action, payload);
}

/**
 * Delegate to the injected syncSearchStatusForFocus implementation.
 * Updates the search-status DOM element and trail cue when focus changes.
 * Safe to call when unready; no-op.
 *
 * @param {object} point
 * @param {object} [options]
 * @param {boolean} [options.fromSearchResult]
 * @param {boolean} [options.fromTraversal]
 */
export function syncSearchStatusForFocus(point, options) {
    if (_syncSearchStatusForFocus) _syncSearchStatusForFocus(point, options);
}

/**
 * Delegate to the injected updateJourneyCompass implementation.
 * Updates the journey-compass DOM element to reflect current navigation phase.
 * Safe to call when unready; no-op.
 */
export function updateJourneyCompass() {
    if (_updateJourneyCompass) _updateJourneyCompass();
}

/**
 * Delegate to the injected refreshCompositionState implementation.
 * Synchronizes the compass data-attributes based on active selections.
 * Safe to call when unready; no-op.
 */
export function refreshCompositionState() {
    if (_refreshCompositionState) _refreshCompositionState();
}

/**
 * Delegate to the injected empty-search recorder.
 * Safe to call when unready; no-op.
 *
 * @param {string} query
 */
export function recordEmptySearch(query) {
    if (_recordEmptySearch) _recordEmptySearch(query);
}

export function clearMobileRouteFieldPeek() { if (_clearMobileRouteFieldPeek) _clearMobileRouteFieldPeek(); }
export function clearCompactSearchResultRevealTimers() { if (_clearCompactSearchResultRevealTimers) _clearCompactSearchResultRevealTimers(); }
export function clearSearchPreviewHoverTimer() { if (_clearSearchPreviewHoverTimer) _clearSearchPreviewHoverTimer(); }
export function settleCompactSearchFocusCard() { if (_settleCompactSearchFocusCard) _settleCompactSearchFocusCard(); }
export function switchView(view) { if (_switchView) _switchView(view); }
export function updateSelectedBusiness(point) { if (_updateSelectedBusiness) _updateSelectedBusiness(point); }
export function syncMobileRoutePeek() { if (_syncMobileRoutePeek) _syncMobileRoutePeek(); }
export function updateTrailIndices() { if (_updateTrailIndices) _updateTrailIndices(); }
export function applyPointFilterColors() { if (_applyPointFilterColors) _applyPointFilterColors(); }
export function refreshHoverSemanticOverlay() { if (_refreshHoverSemanticOverlay) _refreshHoverSemanticOverlay(); }
export function resetExplorationFocus() { if (_resetExplorationFocus) _resetExplorationFocus(); }
export function setSemanticLaneUiState(state, options) {
    if (_setSemanticLaneUiState) {
        _setSemanticLaneUiState(state, options);
    } else if (typeof window !== 'undefined' && typeof window.setSemanticLaneUiState === 'function') {
        window.setSemanticLaneUiState(state, options);
    }
}
export function clearSearch() { if (_clearSearch) _clearSearch(); }
export function triggerSearchHeroMoment(anchorIndex) { if (_triggerSearchHeroMoment) _triggerSearchHeroMoment(anchorIndex); }
export function triggerCorridorNodeGlow(anchorIndex, resultIndices) { if (_triggerCorridorNodeGlow) _triggerCorridorNodeGlow(anchorIndex, resultIndices); }
export function triggerSearchCorridorAnimation(anchorIndex, resultIndices) { if (_triggerSearchCorridorAnimation) _triggerSearchCorridorAnimation(anchorIndex, resultIndices); }
export function hideSummaryCard() { if (_hideSummaryCard) _hideSummaryCard(); }
export function setSemanticGuideButtonState(btn, state, opts) { if (_setSemanticGuideButtonState) _setSemanticGuideButtonState(btn, state, opts); }
export function scheduleCompactSearchResultReveal(el, idx) { if (_scheduleCompactSearchResultReveal) _scheduleCompactSearchResultReveal(el, idx); }
export function scheduleSearchFocusTask(callback, delay = 0) {
    const scheduler = _scheduleSearchFocusTask || setTimeout;
    return scheduler(callback, delay);
}
