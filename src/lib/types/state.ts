/**
 * @lib/types/state.ts — Full application state types
 *
 * Discriminated unions for state machine phases. NO `any` types.
 * Mirrors the slices from js/state.js with proper TS narrowing.
 */

import type { BusinessRecord } from '@lib/types/business'
import type { NeighborhoodPersonality } from '@lib/focus/pocket-personality'

// ── Navigation State ──────────────────────────────────────────────────────────

export type NavMode = 'overview' | 'search' | 'trail' | 'focus' | 'inside' | 'map' | 'bridge'

export type PanelSurface =
    | 'idle'
    | 'search'
    | 'trail'
    | 'focus'
    | 'focus-search'
    | 'map'
    | 'map-trail'
    | 'map-focus'
    | 'map-focus-search'
    | 'inside'
    | 'thread-inspect'
    | 'walking'
    | 'arriving'
    | 'settling'

export interface NavState {
    mode: NavMode
    surface: PanelSurface
    previousSurface: PanelSurface
    focusedIndex: number | null
    trailSeedIndex: number | null
    trailNeighborIndices: readonly number[]
    trailCursor: number
    trailDepth: number
    walkHistoryIndices: readonly number[]
    lastTraversalReason: string | null
    threadCandidates: ThreadCandidateRef[] // Matches kernel and engine
    threadReasonByIndex: Map<number, string>
    threadSource: string
    focusPocketIndices: readonly number[]
    focusPocketMeta: FocusPocketMeta | null
    focusPocketRoleByIndex: Map<number, string>
    focusFramingMeta: FocusFramingMeta | null
    currentPersonality: NeighborhoodPersonality | null
    neighborhoodIndices: readonly number[]
    explorationHistoryIndices: readonly number[]
    /** Optional: per-index semantic reason for the neighborhood manifest.
     *  Populated by neighborhood.ts buildNeighborhoodManifest for inspection UI. */
    neighborhoodReasonByIndex?: Map<number, string>
    /** Optional: serialized neighborhood manifest (set by neighborhood.ts). */
    neighborhoodManifest?: unknown
    /** Optional: source string for the current neighborhood (e.g. 'semantic', 'geometric'). */
    neighborhoodSource?: string
    /** Optional: anchor index for the bounded neighborhood (set by neighborhood.ts). */
    neighborhoodAnchorIndex?: number | null
    // Extended fields used by navigation.svelte.ts
    currentView: 'galaxy' | 'map'
    myceliumMode: string
    autoRotate: boolean
    autoRotateSuspended: boolean
    trailDepthFromExploration: number
    sceneRevealActive: boolean
    sceneRevealStartedAt: number
    loadingPhaseKey: string
    applyingUrlState: boolean
    restoringBrowserHistory: boolean
    urlStateRestoreToken: number
    activeStoryPrompt: string | null
}

export interface FocusPocketMeta {
    motif: string
    label: string
    directLift: number
    supportLift: number
    directPriority: number
    supportPriority: number
    braid: number
    [key: string]: unknown
}

export interface FocusFramingMeta {
    targetPosition: [number, number, number]
    targetLookAt: [number, number, number]
    distance: number
}

// ── Search State ──────────────────────────────────────────────────────────────

export type SearchStatus = 'idle' | 'searching' | 'focusing' | 'results' | 'empty' | 'error'

export interface SearchState {
    query: string
    results: readonly SearchResult[]
    activeResultId: string | null
    summary: SearchSummary | null
    status: SearchStatus
    hasQuery: boolean
    resultsRendered: boolean
    degraded: boolean
}

// SearchResult + SearchResultPoint now live canonically in
// @lib/state/types/search-types.ts (merged from 3 duplicate declarations).
// Import for local use (SearchState picks up SearchResult) + re-export for
// backward compatibility with the many consumers that import from
// '@lib/types/state'.
import type { SearchResult, SearchResultPoint } from '../state/types/search-types'
export type { SearchResult, SearchResultPoint }

export interface SearchRenderContext {
    trimmedQuery: string
    topIndex: number | null
    anchorIndex: number | null
    topScore: number
}

export interface SearchSummary {
    query: string
    totalMatches: number
    totalSemanticMatches: number
    visibleMatches: number
    resultCount: number
    topScore: number
    anchorIndex: number | null
    topIndex: number | null
    resultIndices: number[]
    summaryType: 'semantic' | 'text' | 'mixed'
    reason?: string
    renderContext?: SearchRenderContext
    mode?: string
}

// ── Journey State ─────────────────────────────────────────────────────────────

export type JourneyPhase =
    | 'idle'
    | 'overview'
    | 'search'
    | 'focus'
    | 'inside'
    | 'map'
    | 'thread-inspect'
    | 'walking'
    | 'arriving'
    | 'settling'
    | 'trail'
    | 'bridge'

export interface JourneyState {
    phase: NavMode
    trail: readonly TrailStop[]
    cursor: number
    depth: number
    threadCandidates: readonly ThreadCandidateRef[]
    threadReasonByIndex: Map<number, string>
    threadSource: string
    lastTraversalReason: string | null
    selectedId: string | null
    selectedStopIndex: number | null
    neighbors: readonly NeighborEntry[]
    compass: CompassState
    walkHistory: readonly WalkHistoryEntry[]
}

export interface TrailStop {
    index: number
    name?: string
    reason?: string
    visitedAt?: number | null
}

export interface NeighborEntry {
    index: number
    relationshipLabel: string
    reason: string
    score: number
}

export interface WalkHistoryEntry {
    fromIndex: number
    toIndex: number
    reason: string
    timestamp: number
}

// ── Compass State Machine ─────────────────────────────────────────────────────

export type CompassPhase = 'idle' | 'checking' | 'synthesizing' | 'active' | 'interrupted'

export type CompassAction = 'explore' | 'search' | 'focus' | 'inside' | 'map' | 'reset' | 'trail' | 'none'

export interface CompassState {
    phase: CompassPhase
    currentAction: CompassAction
    previousAction: CompassAction
    lastTransitionAt: number
}

// ── Focus State ───────────────────────────────────────────────────────────────

export type FocusTransitionMode = 'idle' | 'entering' | 'settling' | 'inside' | 'exiting'

export interface ThreadCandidateRef {
    index: number
    source: string
    reason: string
    /** Optional: relationship role for inspection UI (title pill, role badge). */
    relationshipRole?: string
    /** Optional: pocket role override for the focus-pocket animation. */
    role?: string
}

export interface PocketMotion {
    role: string
    delay: number
    duration: number
    speed: number
    personality?: string
    /** Breathing amplitude for the focus-pocket settle animation. Optional;
     *  consumers default to 0.02 when absent. */
    breatheAmp?: number
    /** Phase offset for the breathing oscillation. Optional; consumers
     *  default to 0 when absent. */
    phase?: number
}

export interface PocketMotionWithFrame extends PocketMotion {
    _preservePos?: { x: number; y: number; z: number }
    /** Legacy field kept for backward compatibility with motion objects
     *  produced by the geometry builder (focus-pocket-geometry.ts). The
     *  newer path prefers _preservePos. Both carry the same origin
     *  position; consumers should prefer _preservePos when both are set. */
    _originPos?: { x: number; y: number; z: number }
    _firstFrameApplied?: boolean
    /** Motif key for the focus constellation (set by geometry builder). */
    motif?: string
    /** Relationship role from the semantic candidate ref. */
    relationshipRole?: string
    /** Relationship axis for inspection UI rendering. */
    relationshipAxis?: string
    /** Human-readable reason for the role assignment. */
    roleReason?: string
}

export interface FocusState {
    pocketNodes: readonly FocusPocketNode[]
    pocketMeta: FocusPocketMeta | null
    pocketRoleByIndex: Map<number, string>
    pocketMotionByIndex: Map<number, PocketMotion>
    pocketTransitionStartedAt: number
    nodesAreSettling: boolean
    semanticDiveMode: boolean
    strandContinuityPhase: 'idle' | 'exploring' | 'arrived' | 'departing'
    inspectedStrandIndex: number | null
    pinnedThreadIndex: number | null
    threadInspectorPointerInside: boolean
    canvasThreadInspectionClearTimer: ReturnType<typeof setTimeout> | null
    selectedBusiness: BusinessRecord | null
    infoPanelOpen: boolean
    pocketListVisible: boolean
    pocketRoleFilter: 'all' | 'direct' | 'support' | 'civic'
    settling: boolean
    transitionMode: FocusTransitionMode
    transitionStartedAt: number
    orbitSlack: FocusOrbitSlackState
    threadInspector: ThreadInspectorState
}

export interface FocusPocketNode {
    index: number
    position: [number, number, number]
    role: 'direct' | 'support' | 'civic'
    score: number
    label: string
    rotationSeed: number
    scaleSeed: number
}

export interface FocusOrbitSlackState {
    phase: 'idle' | 'active' | 'settling'
    reason: string
    startedAt: number
    targetShift: number
    cameraShift: number
    distanceBefore: number
    distanceAfter: number
    maxDistance: number
    rotateSpeed: number
    panSpeed: number
}

export interface ThreadInspectorState {
    active: boolean
    source: string
    inspectedIndex: number | null
    pinnedIndex: number | null
    pointerInside: boolean
    segmentCount: number
    braidCount: number
    endpointCount: number
}

// ── Camera State ──────────────────────────────────────────────────────────────

export type CameraTransitionPhase = 'idle' | 'transitioning' | 'arrived'

export interface CameraState {
    position: [number, number, number]
    target: [number, number, number]
    transition: CameraTransition
    autoRotate: boolean
    autoRotateSuspended: boolean
    autoRotateSpeed: number
}

export interface CameraTransition {
    phase: CameraTransitionPhase
    token: number
    startedAt: number
    durationMs: number
    from: {
        position: [number, number, number]
        target: [number, number, number]
    }
    to: {
        position: [number, number, number]
        target: [number, number, number]
    }
}

// ── Viewport State ────────────────────────────────────────────────────────────

export interface ViewportState {
    width: number
    height: number
    dpr: number
    reducedMotion: boolean
    isCompact: boolean
    isMobile: boolean
    isLandscape: boolean
    isCompactLandscape: boolean
    isUltraCompactPortrait: boolean
}

// ── Strand Continuity State ───────────────────────────────────────────────────

export type StrandContinuityPhase = 'idle' | 'preview' | 'pinned' | 'exploring' | 'arrived' | 'returning'

export interface StrandContinuityState {
    phase: StrandContinuityPhase
    targetIndex: number | null
    fromIndex: number | null
    reason: string
    startedAt: number
    arrivalTimeoutId: ReturnType<typeof setTimeout> | undefined
    settleTimeoutId: ReturnType<typeof setTimeout> | undefined
}

// ── Filter State ──────────────────────────────────────────────────────────────

export interface ActiveFilters {
    status: string
    city: string
    website: boolean
    email: boolean
    geocoded: boolean
}

// ── Composition / Panel Surface ───────────────────────────────────────────────

export type ViewName = 'galaxy' | 'map'

// ── Loading State ─────────────────────────────────────────────────────────────

export type LoadingPhase = 'records' | 'scene' | 'restore' | 'launch'

export interface LoadingPhaseMeta {
    progress: number
    note: string
    foot: string
}

// ── Semantic Lane State ───────────────────────────────────────────────────────

export type SemanticLaneState =
    | 'checking'
    | 'healthy'
    | 'degraded'
    | 'offline'
    | 'stuck'
    | 'reconnecting'
    | 'unavailable'

// ── Derived State Flags ───────────────────────────────────────────────────────

export interface DerivedFlags {
    semanticDiveMode: boolean
    focusedNode: number | null
    isOverview: boolean
    isExploration: boolean
    hasFocus: boolean
    hasSearch: boolean
    hasTrail: boolean
}
