/**
 * @lib/types/events.ts — Typed event map for custom application events
 *
 * Replaces the stringly-typed event-bus with compile-time checked payloads.
 */

// ── Event Payload Types ───────────────────────────────────────────────────────

export interface SearchSuccessPayload {
    query: string
    resultCount: number
    anchorIndex: number | null
}

export interface SearchEmptyPayload {
    query: string
}

export interface SearchFocusRequestedPayload {
    point: { name: string; index: number }
    index: number
}

export interface CameraNodeFocusedPayload {
    point: { name: string; index: number }
    options: Record<string, unknown>
}

export interface ViewChangedPayload {
    view?: string
    myceliumMode?: string
}

export interface ExplorationDepthChangedPayload {
    depth: number
}

export interface NavigationTransitionPayload {
    action: string
    index?: number
    skipHistory?: boolean
}

export interface CompositionUpdatedPayload {
    // No payload — notification only
}

export interface StateResetPayload {
    reason: string
    options?: Record<string, unknown>
}

export interface DiveModeRequestedPayload {
    enabled: boolean
}

export interface OverviewRequestedPayload {
    // No payload — notification only
}

export interface TrailDepthUpdateRequestedPayload {
    depth: number
    options?: Record<string, unknown>
}

export interface UiNotificationPayload {
    title: string
    message: string
    type: 'info' | 'warning' | 'error' | 'success'
}

export interface SearchUiSyncRequestedPayload {
    resultsEl: HTMLElement
    statusEl: HTMLElement
    results: readonly unknown[]
    renderContext: Record<string, unknown>
}

export interface SemanticLaneStateRequestedPayload {
    laneState: string
    options?: Record<string, unknown>
}

export interface SummaryCardHideRequestedPayload {
    // No payload — notification only
}

export interface UrlSyncRequestedPayload {
    params: Record<string, string>
    reason: string
    mode?: string
}

// ── Event Map ─────────────────────────────────────────────────────────────────

export interface EventMap {
    SEARCH_SUCCESS: SearchSuccessPayload
    SEARCH_EMPTY: SearchEmptyPayload
    SEARCH_STARTED: Record<string, never>
    SEARCH_CLEARED: Record<string, never>
    SEARCH_FOCUS_REQUESTED: SearchFocusRequestedPayload
    SEARCH_FOCUS_TRANSITION_STARTED: Record<string, never>
    SEARCH_FOCUS_TRANSITION_SETTLED: Record<string, never>
    SEARCH_STATE_RESET_REQUESTED: Record<string, unknown>
    SEARCH_STATUS_SYNC_REQUESTED: { point: unknown; options: Record<string, unknown> }
    SEARCH_UI_SYNC_REQUESTED: SearchUiSyncRequestedPayload
    CAMERA_NODE_FOCUSED: CameraNodeFocusedPayload
    VIEW_CHANGED: ViewChangedPayload
    COMPOSITION_UPDATED: CompositionUpdatedPayload
    STATE_RESET: StateResetPayload
    DIVE_MODE_REQUESTED: DiveModeRequestedPayload
    OVERVIEW_REQUESTED: OverviewRequestedPayload
    TRAIL_DEPTH_UPDATE_REQUESTED: TrailDepthUpdateRequestedPayload
    EXPLORATION_DEPTH_CHANGED: ExplorationDepthChangedPayload
    EXPLORATION_FOCUS_SYNC: { index: number }
    EXPLORATION_RESET_REQUESTED: Record<string, unknown>
    SEMANTIC_LANE_STATE_REQUESTED: SemanticLaneStateRequestedPayload
    SUMMARY_CARD_HIDE_REQUESTED: SummaryCardHideRequestedPayload
    URL_SYNC_REQUESTED: UrlSyncRequestedPayload
    SEMANTIC_GUIDE_BUTTON_STATE_REQUESTED: {
        button: HTMLElement
        mode: string
        options?: Record<string, unknown>
    }
    UI_NOTIFICATION: UiNotificationPayload
}

// ── Type-safe event emitter helpers ───────────────────────────────────────────

/** Extract the payload type for a given event name */
export type EventPayload<K extends keyof EventMap> = EventMap[K]

/** Type-safe handler signature */
export type EventHandler<K extends keyof EventMap> = (payload: EventMap[K]) => void
