/**
 * cluster-filter-adapter.js
 *
 * Injected adapter boundary: decouples cluster-filter.js from raw global window calls.
 *
 * Ownership contract:
 *   - cluster-filter.js must call adapter functions instead of window.applyFilters,
 *     window.clearSearchGlow, window.updateUrlState directly.
 *   - The adapter delegates to the real implementations injected by app.js.
 *   - This module does NOT import from cluster-filter.js, url-state.js, or search-state.js
 *     (leaf module that breaks the cluster-filter/window/url-state cycle).
 *
 * Usage:
 *   import { initClusterFilterAdapter } from './cluster-filter-adapter.js';
 *   // Called once from app.js init, after window bridges are established.
 */

let _applyFilters = null;
let _clearSearchGlow = null;
let _updateUrlState = null;

/**
 * Inject the function references. Called once from app.js init.
 *
 * @param {object} deps
 * @param {Function} deps.applyFilters
 * @param {Function} deps.clearSearchGlow
 * @param {Function} deps.updateUrlState
 */
export function initClusterFilterAdapter({ applyFilters, clearSearchGlow, updateUrlState } = {}) {
    _applyFilters = typeof applyFilters === 'function' ? applyFilters : null;
    _clearSearchGlow = typeof clearSearchGlow === 'function' ? clearSearchGlow : null;
    _updateUrlState = typeof updateUrlState === 'function' ? updateUrlState : null;
}

/**
 * Returns true when all three dependencies are resolved.
 * @returns {boolean}
 */
export function isClusterFilterAdapterReady() {
    return (
        _applyFilters !== null
        && _clearSearchGlow !== null
        && _updateUrlState !== null
    );
}

/**
 * Delegate to the injected search filter implementation.
 * Safe to call when unready; no-op.
 */
export function applyFilters() {
    if (_applyFilters) _applyFilters();
}

/**
 * Delegate to the injected search glow cleanup.
 * Safe to call when unready; no-op.
 */
export function clearSearchGlow() {
    if (_clearSearchGlow) _clearSearchGlow();
}

/**
 * Delegate to the injected URL-state writer.
 * Safe to call when unready; no-op.
 *
 * @param {object} extra
 * @param {object} options
 */
export function updateUrlState(extra, options) {
    if (_updateUrlState) _updateUrlState(extra, options);
}
