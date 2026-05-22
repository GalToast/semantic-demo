/**
 * url-navigation-adapter.js
 *
 * Injected navigation/UI adapter for url-state.js.
 *
 * Breaks direct window calls to lifecycle and event-bindings UI functions from
 * url-state.js. Uses the same injection pattern as url-search-adapter.js:
 *   app.js injects real module refs before applyUrlState runs.
 *
 * Ownership contract:
 *   - This module OWNS the adapter slot for navigation/lifecycle UI calls consumed by url-state.
 *   - It does NOT own the underlying logic; that belongs to lifecycle.js and event-bindings.js.
 *   - It does NOT import from camera-controls, url-state, or search-state (cycle prevention).
 */

/** @type {object|null} */
let _lifecycleModule = null;
/** @type {object|null} */
let _eventBindingsModule = null;

/**
 * Inject lifecycle and event-bindings module references.
 * Called once from app.js after all modules are loaded, before applyUrlState runs.
 *
 * @param {object} lifecycleMod - the lifecycle.js namespace (setMyceliumMode, updateExplorationUi, etc.)
 * @param {object} eventBindingsMod - the event-bindings.js namespace (updateHasQuery, etc.)
 */
export function initUrlNavigationAdapter(lifecycleMod = {}, eventBindingsMod = {}) {
    _lifecycleModule = lifecycleMod && typeof lifecycleMod === 'object' ? lifecycleMod : null;
    _eventBindingsModule = eventBindingsMod && typeof eventBindingsMod === 'object' ? eventBindingsMod : null;
}

/**
 * Returns the current navigation module reference.
 * @returns {object|null}
 */
export function getUrlNavigationAdapter() {
    return { lifecycle: _lifecycleModule, eventBindings: _eventBindingsModule };
}

export function focusOnPoint(...args) {
    return typeof _lifecycleModule?.focusOnPoint === 'function'
        ? _lifecycleModule.focusOnPoint(...args)
        : undefined;
}

export function updateExplorationUi(...args) {
    return typeof _lifecycleModule?.updateExplorationUi === 'function'
        ? _lifecycleModule.updateExplorationUi(...args)
        : undefined;
}

export function recordSemanticLaneSnapshot(...args) {
    return typeof _lifecycleModule?.recordSemanticLaneSnapshot === 'function'
        ? _lifecycleModule.recordSemanticLaneSnapshot(...args)
        : undefined;
}

export function updateHasQuery(...args) {
    return typeof _eventBindingsModule?.updateHasQuery === 'function'
        ? _eventBindingsModule.updateHasQuery(...args)
        : undefined;
}

export function applyStoryPrompt(...args) {
    return typeof _lifecycleModule?.applyStoryPrompt === 'function'
        ? _lifecycleModule.applyStoryPrompt(...args)
        : undefined;
}

export function showExperienceToast(...args) {
    return typeof _lifecycleModule?.showExperienceToast === 'function'
        ? _lifecycleModule.showExperienceToast(...args)
        : undefined;
}

/**
 * Joint adapter for the depth-2 restore path in applyUrlState.
 * Calls setSemanticDiveMode(true) first; falls back to setTrailDepth(2) if
 * setSemanticDiveMode is unavailable. Skips silently when neither is present.
 *
 * @param {object} options
 * @param {boolean} [options.fromUserGesture=true]
 * @param {boolean} [options.skipUrlSync=true]
 */
export function applyDeepTrailMode(options = {}) {
    const opts = { fromUserGesture: true, skipUrlSync: true, ...options };
    if (typeof _lifecycleModule?.setSemanticDiveMode === 'function') {
        _lifecycleModule.setSemanticDiveMode(true);
        return true;
    }
    if (typeof _lifecycleModule?.setTrailDepth === 'function') {
        _lifecycleModule.setTrailDepth(2, { fromUserGesture: opts.fromUserGesture, skipUrlSync: opts.skipUrlSync });
        return true;
    }
    return false;
}
