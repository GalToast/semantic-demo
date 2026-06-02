/**
 * timer-utils.js
 * 
 * Central registry for application-wide timeouts and intervals.
 * Ensures background tasks are cleanly flushed during state transitions 
 * to prevent memory leaks and race conditions.
 */

const _registry = new Map();

/**
 * Register a timer for central tracking.
 * @param {string} key - Unique identifier (e.g., 'view-prelude', 'toast-auto-hide')
 * @param {number} timerId - Return value from setTimeout or setInterval
 * @param {boolean} isInterval - True if id is from setInterval
 */
export function registerTimer(key, timerId, isInterval = false) {
    if (_registry.has(key)) {
        clearTimer(key);
    }
    _registry.set(key, { id: timerId, isInterval });
}

/**
 * Clear a specific timer by key.
 */
export function clearTimer(key) {
    const timer = _registry.get(key);
    if (!timer) return;

    if (timer.isInterval) {
        clearInterval(timer.id);
    } else {
        clearTimeout(timer.id);
    }
    _registry.delete(key);
}

/**
 * Clear all registered timers. Useful during global resets.
 */
export function clearAllTimers() {
    for (const key of _registry.keys()) {
        clearTimer(key);
    }
}

/**
 * Convenience wrapper for setTimeout that registers itself.
 */
export function setTrackedTimeout(key, fn, delay) {
    const id = setTimeout(() => {
        _registry.delete(key);
        fn();
    }, delay);
    registerTimer(key, id, false);
    return id;
}

/**
 * Convenience wrapper for setInterval that registers itself.
 */
export function setTrackedInterval(key, fn, delay) {
    const id = setInterval(fn, delay);
    registerTimer(key, id, true);
    return id;
}
