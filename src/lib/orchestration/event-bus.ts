/**
 * @lib/orchestration/event-bus.ts
 * 
 * Typed Pub/Sub event bus for decoupling application modules.
 * Replaces the fragile 'adapter_' pattern with typed, event-driven intent.
 */

// ── Event Manifest ─────────────────────────────────────────────────────────

export const EVENTS = {
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
} as const;

// Freeze at runtime for immutability
Object.freeze(EVENTS);

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

// ── Payload Types ─────────────────────────────────────────────────────────

export interface EventPayloads {
  [EVENTS.CAMERA_MOVED]: {
    position?: unknown;
    target?: unknown;
    reason?: string;
    index?: number;
    [key: string]: unknown;
  };
  [EVENTS.CAMERA_NODE_FOCUSED]: { point?: unknown; index?: number; options?: Record<string, unknown> };
  [EVENTS.TRANSITION_PHASE_CHANGED]: { phase: string; details?: Record<string, unknown>; options?: Record<string, unknown> };
  [EVENTS.EXPLORATION_FOCUS_SYNC]: { index: number; point?: unknown; skipHistory?: boolean };
  [EVENTS.DIVE_MODE_REQUESTED]: { enabled: boolean };
  [EVENTS.EXPLORATION_RESET_REQUESTED]: {
    preserveSearch?: boolean;
    skipSearchClearEvent?: boolean;
    skipUrlSync?: boolean;
  };
  [EVENTS.OVERVIEW_REQUESTED]: Record<string, never>;
  [EVENTS.TRAIL_DEPTH_UPDATE_REQUESTED]: { depth: number; options?: Record<string, unknown> };
  [EVENTS.SEARCH_STARTED]: Record<string, unknown>;
  [EVENTS.SEARCH_SUCCESS]: Record<string, unknown>;
  [EVENTS.SEARCH_EMPTY]: { query: string };
  [EVENTS.SEARCH_DEGRADED]: Record<string, unknown>;
  [EVENTS.SEARCH_CLEARED]: {
    preserveSearch?: boolean;
    preservedSearch?: boolean;
    summary?: unknown;
    [key: string]: unknown;
  };
  [EVENTS.SEARCH_FOCUS_TRANSITION_STARTED]: Record<string, unknown>;
  [EVENTS.SEARCH_FOCUS_TRANSITION_SETTLED]: Record<string, unknown>;
  [EVENTS.SEARCH_FOCUS_REQUESTED]: { index?: number; point?: unknown };
  [EVENTS.SEARCH_STATE_RESET_REQUESTED]: {
    preserveSearch?: boolean;
    skipUrlSync?: boolean;
    skipSearchClearEvent?: boolean;
  };
  [EVENTS.VIEW_CHANGED]: { view?: string; previousView?: string; myceliumMode?: string };
  [EVENTS.STATE_RESET]: { reason?: string; silent?: boolean; options?: Record<string, unknown> };
  [EVENTS.FILTER_CHANGED]: Record<string, unknown>;
  [EVENTS.COMPOSITION_UPDATED]: { reason?: string; [key: string]: unknown };
  [EVENTS.EXPLORATION_DEPTH_CHANGED]: { depth: number };
  [EVENTS.URL_SYNC_REQUESTED]: Record<string, unknown>;
  [EVENTS.SEARCH_UI_SYNC_REQUESTED]: Record<string, unknown>;
  [EVENTS.SEARCH_STATUS_SYNC_REQUESTED]: Record<string, unknown>;
  [EVENTS.SEMANTIC_LANE_STATE_REQUESTED]: Record<string, unknown>;
  [EVENTS.SUMMARY_CARD_HIDE_REQUESTED]: Record<string, never>;
  [EVENTS.SEMANTIC_GUIDE_BUTTON_STATE_REQUESTED]: Record<string, unknown>;
  [EVENTS.VIEW_CHANGE_REQUESTED]: { view: string };
  [EVENTS.TOOLTIP_HIDE_REQUESTED]: Record<string, never>;
  [EVENTS.TOOLTIP_POSITION_REQUESTED]: { x: number; y: number };
  [EVENTS.TOOLTIP_CONTENT_UPDATE_REQUESTED]: { content?: string; point?: unknown };
}

// ── Internal Storage ──────────────────────────────────────────────────────

type Callback<T = unknown> = (payload: T) => void;

const _subscribers = new Map<string, Set<Callback>>();
const _keyedSubscribers = new Map<string, { eventName: string; unsubscribe: () => void }>();

// ── Subscribe ─────────────────────────────────────────────────────────────

/**
 * Subscribe to an application event.
 * @param eventName - Key from EVENTS manifest
 * @param callback - Function to execute on publish
 * @returns Unsubscribe function
 */
export function subscribe<K extends EventName>(
  eventName: K,
  callback: Callback<EventPayloads[K]>
): () => void {
  if (!_subscribers.has(eventName)) {
    _subscribers.set(eventName, new Set());
  }

  const callbacks = _subscribers.get(eventName)!;
  callbacks.add(callback as Callback);

  return () => callbacks.delete(callback as Callback);
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
export function subscribeKeyed<K extends EventName>(
  key: string,
  eventName: K,
  callback: Callback<EventPayloads[K]>
): () => void {
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

// ── Publish ───────────────────────────────────────────────────────────────

/**
 * Publish an application event with payload.
 * @param eventName - Key from EVENTS manifest
 * @param payload - Optional data to pass to subscribers
 */
export function publish<K extends EventName>(
  eventName: K,
  payload: EventPayloads[K] = {} as EventPayloads[K]
): void {
  const callbacks = _subscribers.get(eventName);
  if (!callbacks || callbacks.size === 0) return;

  callbacks.forEach((callback) => {
    try {
      callback(payload);
    } catch (error) {
      console.error(`[EventBus] Error in subscriber for ${eventName}:`, error);
    }
  });
}

// ── Debug ─────────────────────────────────────────────────────────────────

/** Get the number of subscribers for a given event (for diagnostics). */
export function getSubscriberCount(eventName: EventName): number {
  return _subscribers.get(eventName)?.size ?? 0;
}

/** Clear all subscribers (for testing teardown). */
export function clearAllSubscribers(): void {
  _subscribers.clear();
  _keyedSubscribers.clear();
}
