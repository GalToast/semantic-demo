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

/**
 * Inject the lifecycle function references. Called once from app.js init.
 *
 * @param {object} deps
 * @param {Function|null} deps.updateUrlState
 * @param {Function|null} deps.setSearchPanelState
 * @param {Function|null} deps.focusOnPoint
 * @param {Function|null} deps.updateExplorationUi
 * @param {Function|null} deps.resetNodePositions
 * @param {Function|null} deps.dispatchNavTransition
 * @param {Function|null} deps.syncSearchStatusForFocus
 * @param {Function|null} deps.updateJourneyCompass
 * @param {Function|null} deps.refreshCompositionState
 */
export function initSearchLifecycleAdapter({
    updateUrlState,
    setSearchPanelState,
    focusOnPoint,
    updateExplorationUi,
    resetNodePositions,
    dispatchNavTransition,
    syncSearchStatusForFocus,
    updateJourneyCompass,
    refreshCompositionState,
} = {}) {
    _updateUrlState = typeof updateUrlState === 'function' ? updateUrlState : null;
    _setSearchPanelState = typeof setSearchPanelState === 'function' ? setSearchPanelState : null;
    _focusOnPoint = typeof focusOnPoint === 'function' ? focusOnPoint : null;
    _updateExplorationUi = typeof updateExplorationUi === 'function' ? updateExplorationUi : null;
    _resetNodePositions = typeof resetNodePositions === 'function' ? resetNodePositions : null;
    _dispatchNavTransition = typeof dispatchNavTransition === 'function' ? dispatchNavTransition : null;
    _syncSearchStatusForFocus = typeof syncSearchStatusForFocus === 'function' ? syncSearchStatusForFocus : null;
    _updateJourneyCompass = typeof updateJourneyCompass === 'function' ? updateJourneyCompass : null;
    _refreshCompositionState = typeof refreshCompositionState === 'function' ? refreshCompositionState : null;
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
