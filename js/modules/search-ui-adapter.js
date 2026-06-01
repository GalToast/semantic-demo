/**
 * search-ui-adapter.js
 *
 * Injected adapter boundary: decouples search-state.js from raw global window
 * calls for UI side-effect functions whose primary owners are tooltip.js
 * and lifecycle.js.
 *
 * Ownership contract:
 *   - search-state.js must call adapter functions instead of window.tooltip
 *     and window.lifecycle helpers directly.
 *   - This module is a leaf module. It does NOT import from search-state.js,
 *     cluster-filter.js, url-state.js, camera-controls.js, or lifecycle.js.
 *   - It does NOT import tooltip.js or lifecycle.js either; it receives
 *     live references injected from app.js at init time.
 *   - This breaks the potential cycle:
 *     search-state -> window -> (tooltip|lifecycle) -> search-state
 *
 * Injection is done from app.js init, before any search-state function runs.
 *
 * Usage:
 *   import { initSearchUiAdapter } from './search-ui-adapter.js';
 *   // Called once from app.js init with all required function references.
 */

import { publish, EVENTS } from './event-bus.js';

let _positionTooltip = null;
let _updateTooltipContent = null;

/**
 * Inject the UI function references. Called once from app.js init.
 *
 * @param {object} deps
 * @param {Function|null} deps.positionTooltip
 * @param {Function|null} deps.updateTooltipContent
 */
export function initSearchUiAdapter({ positionTooltip, updateTooltipContent } = {}) {
    _positionTooltip = typeof positionTooltip === 'function' ? positionTooltip : null;
    _updateTooltipContent = typeof updateTooltipContent === 'function' ? updateTooltipContent : null;
}

/**
 * Returns true when all tooltip dependencies are resolved.
 * @returns {boolean}
 */
export function isSearchUiAdapterReady() {
    return (
        _positionTooltip !== null
        && _updateTooltipContent !== null
    );
}

/**
 * Delegate to the injected tooltip hide implementation.
 * Safe to call when unready; no-op.
 */
export function hideTooltip() {
    publish(EVENTS.TOOLTIP_HIDE_REQUESTED);
}

/**
 * Delegate to the injected tooltip positioning implementation.
 * Safe to call when unready; no-op.
 *
 * @param {number} x
 * @param {number} y
 */
export function positionTooltip(x, y) {
    if (_positionTooltip) _positionTooltip(x, y);
}

/**
 * Delegate to the injected tooltip content implementation.
 * Safe to call when unready; no-op.
 *
 * @param {object} point
 */
export function updateTooltipContent(point) {
    if (_updateTooltipContent) _updateTooltipContent(point);
}
