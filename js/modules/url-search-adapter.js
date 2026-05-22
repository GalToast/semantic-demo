/**
 * url-search-adapter.js
 *
 * Injected search adapter for url-state.js.
 *
 * Breaks the potential cycle:
 *   search-state.js → camera-controls.js → url-state.js → search-state.js
 *
 * by providing a leaf module that url-state.js can import without reaching back.
 * app.js injects the real search module at init time, before applyUrlState runs.
 *
 * Ownership contract:
 *   - This module OWNS the adapter slot for search functions consumed by url-state.
 *   - It does NOT own the search logic itself — that belongs to search-state.js.
 *   - It does NOT import from camera-controls or url-state (cycle prevention).
 */

/** @type {object|null} */
let _searchModule = null;

/**
 * Inject the search module reference. Called once from app.js after all modules
 * are loaded, before applyUrlState runs.
 *
 * @param {object} searchMod - the search-state.js namespace object
 */
export function initUrlSearchAdapter(searchMod) {
    _searchModule = searchMod && typeof searchMod === 'object' ? searchMod : null;
}

/**
 * Returns the current search module reference.
 * All accessors below are null-guarded so url-state.js call sites remain safe.
 *
 * @returns {object|null}
 */
export function getUrlSearchAdapter() {
    return _searchModule;
}

// Accessors use lazy resolution to prevent premature coupling.

export function search(...args) {
    return typeof _searchModule?.search === 'function'
        ? _searchModule.search(...args)
        : undefined;
}

export function applyFilters(...args) {
    return typeof _searchModule?.applyFilters === 'function'
        ? _searchModule.applyFilters(...args)
        : undefined;
}

export function getFilteredIndices(...args) {
    return typeof _searchModule?.getFilteredIndices === 'function'
        ? _searchModule.getFilteredIndices(...args)
        : undefined;
}

export function activateSearchGlow(...args) {
    return typeof _searchModule?.activateSearchGlow === 'function'
        ? _searchModule.activateSearchGlow(...args)
        : undefined;
}

export function syncSearchStatusForFocus(...args) {
    return typeof _searchModule?.syncSearchStatusForFocus === 'function'
        ? _searchModule.syncSearchStatusForFocus(...args)
        : undefined;
}

export function updateSearchStatusMessage(...args) {
    return typeof _searchModule?.updateSearchStatusMessage === 'function'
        ? _searchModule.updateSearchStatusMessage(...args)
        : undefined;
}

export function updateSearchTrailCue(...args) {
    return typeof _searchModule?.updateSearchTrailCue === 'function'
        ? _searchModule.updateSearchTrailCue(...args)
        : undefined;
}
