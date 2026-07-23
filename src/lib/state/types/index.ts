/**
 * @lib/state/types/index.ts — Barrel re-export for split state types.
 *
 * All types from state-types.ts are re-exported here for backward
 * compatibility. Consumers can import from '@lib/state/types' or
 * from the specific sub-module they need.
 */

// Core types (geometry, renderer, config, data)
export type {
    Vector3Like,
    NodePosition,
    CameraLike,
    ControlsLike,
    RendererInfoMemory,
    RendererInfo,
    RendererLike,
    ClusterName,
    ViewName,
    CompassPhase,
    ThreadSource,
    LoadingPhaseKey,
    LoadingPhaseMeta,
    CanvasHoverCandidate,
    ThreadCandidateLike,
    ConstellationMotif,
    ConstellationMotifName,
    Point,
    SemanticNeighbor,
    SemanticNode,
    StateConfig
} from './core-types'

// Search types (summaries, results, errors, guides, SearchAppState)
export type {
    SearchSummary,
    SemanticGuideState,
    SearchErrorData,
    SearchResultPoint,
    SearchResult,
    SemanticSearchCacheDiagnostics,
    SearchAppState
} from './search-types'

// Engine types (performance diagnostics, SemanticState, route/strand state)
export type {
    ScenePerformanceDiagnostics,
    FocusConnectionSegment,
    FocusFrameDiagnostics,
    FocusThreadDiagnostics,
    RouteTraceDiagnostics,
    InspectedStrandDiagnostics,
    ArrivalHandoffDiagnostics,
    TerrainHandoffState,
    RouteExplorationState,
    RouteChoreographyState,
    StrandContinuityState,
    FocusOrbitSlackState,
    SemanticState
} from './engine-types'

// Canonical re-exports (NavState, ActiveFilters from @lib/types/state)
export type { NavState, ActiveFilters } from './engine-types'

// Navigation types (FocusAppState, ViewportAppState)
export type { FocusAppState, ViewportAppState } from './navigation-types'

// Cross-file re-exports (preserved from original state-types.ts)
export type { LaneHealthPayload } from '../../orchestration/semantic-lane'
export type { CacheEntry } from '../../search/cache'
