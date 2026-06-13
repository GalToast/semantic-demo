/**
 * js/modules/event-bus.ts
 *
 * Central Pub/Sub event bus for decoupling application modules.
 * Replaces the fragile 'adapter_' pattern with typed, event-driven intent.
 */

import { debugWarn } from './diagnostic-adapter.ts';

/** All valid event names emitted by the application. */
export const EVENTS = Object.freeze({
    // Camera / Navigation
    CAMERA_MOVED: 'CAMERA_MOVED',
    CAMERA_NODE_FOCUSED: 'CAMERA_NODE_FOCUSED',
    TRANSITION_PHASE_CHANGED: 'TRANSITION_PHASE_CHANGED',
    EXPLORATION_FOCUS_SYNC: 'EXPLORATION_FOCUS_SYNC',
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
    TOOLTIP_CONTENT_UPDATE_REQUESTED: 'TOOLTIP_CONTENT_UPDATE_REQUESTED'
} as const);

/** Type-safe event name derived from the EVENTS manifest. */
type EventName = typeof EVENTS[keyof typeof EVENTS];

/** Callback signature for event subscribers. */
type EventCallback = (payload: Record<string, unknown>) => void;

const _subscribers: Map<string, Set<EventCallback>> = new Map();
const _keyedSubscribers: Map<string, { eventName: string; unsubscribe: () => void }> = new Map();

/**
 * Subscribe to an application event.
 * @param eventName - Key from EVENTS manifest
 * @param callback - Function to execute on publish
 * @returns Unsubscribe function
 */
export function subscribe(eventName: string, callback: EventCallback): () => void {
    if (!EVENTS[eventName as keyof typeof EVENTS]) {
        debugWarn(`[EventBus] Unknown event name: ${eventName}`);
    }

    if (!_subscribers.has(eventName)) {
        _subscribers.set(eventName, new Set());
    }

    const callbacks = _subscribers.get(eventName)!;
    callbacks.add(callback);

    return () => callbacks.delete(callback);
}

/**
 * Subscribe with a stable ownership key. Reusing the same key replaces the
 * previous callback, preventing duplicate subscriptions across app re-init or
 * WebGL context restore.
 *
 * @param key - Stable owner/event key.
 * @param eventName - Key from EVENTS manifest.
 * @param callback - Function to execute on publish.
 * @returns Unsubscribe function.
 */
export function subscribeKeyed(key: string, eventName: string, callback: EventCallback): () => void {
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
 * @param eventName - Key from EVENTS manifest
 * @param payload - Optional data to pass to subscribers
 */
export function publish(eventName: string, payload: Record<string, unknown> = {}): void {
    if (!EVENTS[eventName as keyof typeof EVENTS]) {
        debugWarn(`[EventBus] Unknown event name published: ${eventName}`);
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
