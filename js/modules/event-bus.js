/**
 * js/modules/event-bus.js
 * 
 * Central Pub/Sub event bus for decoupling application modules.
 * Replaces the fragile 'adapter_' pattern with typed, event-driven intent.
 */

export const EVENTS = Object.freeze({
    // Camera / Navigation
    CAMERA_MOVED: 'CAMERA_MOVED',
    CAMERA_NODE_FOCUSED: 'CAMERA_NODE_FOCUSED',
    CAMERA_ANIMATION_COMPLETE: 'CAMERA_ANIMATION_COMPLETE',
    TRANSITION_PHASE_CHANGED: 'TRANSITION_PHASE_CHANGED',
    EXPLORATION_FOCUS_SYNC: 'EXPLORATION_FOCUS_SYNC',
    NEIGHBORHOOD_DIVE_REQUESTED: 'NEIGHBORHOOD_DIVE_REQUESTED',
    DIVE_MODE_REQUESTED: 'DIVE_MODE_REQUESTED',
    EXPLORATION_RESET_REQUESTED: 'EXPLORATION_RESET_REQUESTED',
    OVERVIEW_REQUESTED: 'OVERVIEW_REQUESTED',
    TRAIL_DEPTH_UPDATE_REQUESTED: 'TRAIL_DEPTH_UPDATE_REQUESTED',

    // Search
    SEARCH_STARTED: 'SEARCH_STARTED',
    SEARCH_SUCCESS: 'SEARCH_SUCCESS',
    SEARCH_EMPTY: 'SEARCH_EMPTY',
    SEARCH_DEGRADED: 'SEARCH_DEGRADED',
    SEARCH_CLEARED: 'SEARCH_CLEARED',
    SEARCH_FOCUS_TRANSITION_STARTED: 'SEARCH_FOCUS_TRANSITION_STARTED',
    SEARCH_FOCUS_TRANSITION_SETTLED: 'SEARCH_FOCUS_TRANSITION_SETTLED',
    SEARCH_FOCUS_REQUESTED: 'SEARCH_FOCUS_REQUESTED',
    SEARCH_STATE_RESET_REQUESTED: 'SEARCH_STATE_RESET_REQUESTED',

    // Global State / Lifecycle
    VIEW_CHANGED: 'VIEW_CHANGED',
    STATE_RESET: 'STATE_RESET',
    FILTER_CHANGED: 'FILTER_CHANGED',
    COMPOSITION_UPDATED: 'COMPOSITION_UPDATED',
    EXPLORATION_DEPTH_CHANGED: 'EXPLORATION_DEPTH_CHANGED',
    URL_SYNC_REQUESTED: 'URL_SYNC_REQUESTED',
    SEARCH_UI_SYNC_REQUESTED: 'SEARCH_UI_SYNC_REQUESTED',
    SEARCH_STATUS_SYNC_REQUESTED: 'SEARCH_STATUS_SYNC_REQUESTED',
    SEMANTIC_LANE_STATE_REQUESTED: 'SEMANTIC_LANE_STATE_REQUESTED',
    SUMMARY_CARD_HIDE_REQUESTED: 'SUMMARY_CARD_HIDE_REQUESTED',
    SEMANTIC_GUIDE_BUTTON_STATE_REQUESTED: 'SEMANTIC_GUIDE_BUTTON_STATE_REQUESTED',
    VIEW_CHANGE_REQUESTED: 'VIEW_CHANGE_REQUESTED',
    
    // UI Interactions
    TOOLTIP_HIDE_REQUESTED: 'TOOLTIP_HIDE_REQUESTED',
    TOOLTIP_POSITION_REQUESTED: 'TOOLTIP_POSITION_REQUESTED',
    TOOLTIP_CONTENT_UPDATE_REQUESTED: 'TOOLTIP_CONTENT_UPDATE_REQUESTED',
    THEME_CHANGED: 'THEME_CHANGED'
});

const _subscribers = new Map();
const _keyedSubscribers = new Map();

/**
 * Subscribe to an application event.
 * @param {string} eventName - Key from EVENTS manifest
 * @param {Function} callback - Function to execute on publish
 * @returns {Function} - Unsubscribe function
 */
export function subscribe(eventName, callback) {
    if (!EVENTS[eventName]) {
        console.warn(`[EventBus] Unknown event name: ${eventName}`);
    }

    if (!_subscribers.has(eventName)) {
        _subscribers.set(eventName, new Set());
    }

    const callbacks = _subscribers.get(eventName);
    callbacks.add(callback);

    return () => callbacks.delete(callback);
}

/**
 * Subscribe with a stable ownership key. Reusing the same key replaces the
 * previous callback, preventing duplicate subscriptions across app re-init or
 * WebGL context restore.
 *
 * @param {string} key - Stable owner/event key.
 * @param {string} eventName - Key from EVENTS manifest.
 * @param {Function} callback - Function to execute on publish.
 * @returns {Function} - Unsubscribe function.
 */
export function subscribeKeyed(key, eventName, callback) {
    if (!key) return subscribe(eventName, callback);

    const existing = _keyedSubscribers.get(key);
    if (existing && typeof existing.unsubscribe === 'function') {
        existing.unsubscribe();
    }

    const unsubscribe = subscribe(eventName, callback);
    const keyedUnsubscribe = () => {
        unsubscribe();
        if (_keyedSubscribers.get(key)?.unsubscribe === keyedUnsubscribe) {
            _keyedSubscribers.delete(key);
        }
    };

    _keyedSubscribers.set(key, { eventName, unsubscribe: keyedUnsubscribe });
    return keyedUnsubscribe;
}

/**
 * Publish an application event with payload.
 * @param {string} eventName - Key from EVENTS manifest
 * @param {object} payload - Optional data to pass to subscribers
 */
export function publish(eventName, payload = {}) {
    if (!EVENTS[eventName]) {
        console.warn(`[EventBus] Unknown event name published: ${eventName}`);
        return;
    }

    const callbacks = _subscribers.get(eventName);
    if (!callbacks || callbacks.size === 0) return;

    callbacks.forEach(callback => {
        try {
            callback(payload);
        } catch (error) {
            console.error(`[EventBus] Error in subscriber for ${eventName}:`, error);
        }
    });
}
