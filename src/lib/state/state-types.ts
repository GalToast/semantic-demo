/**
 * @lib/state/state-types.ts — Type definitions for the Svelte 5 state class.
 *
 * W13-T5b Wave 1: Extracted from js/state.ts to centralize the shared app
 * state type surface for src/lib/state/app.svelte.ts and its consumers.
 *
 * **This file is now a thin re-export barrel.** The actual type definitions
 * live in @lib/state/types/ (split into core-types, search-types, engine-types,
 * navigation-types). All types are re-exported here for backward compatibility.
 *
 * Source: js/state.ts (lines 41-675, extracted 2026-06-16).
 */

// ── Core types ───────────────────────────────────────────────────────────────
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
    StateConfig,
} from './types/core-types'

// ── Search types ─────────────────────────────────────────────────────────────
export type {
    SearchSummary,
    SemanticGuideState,
    SearchErrorData,
    SearchResultPoint,
    SearchResult,
    SemanticSearchCacheDiagnostics,
    SearchAppState,
} from './types/search-types'

// ── Engine types ─────────────────────────────────────────────────────────────
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
    SemanticState,
} from './types/engine-types'

// ── Canonical type re-exports ────────────────────────────────────────────────
// `NavState` and `ActiveFilters` are defined ONCE in `@lib/types/state` (the
// canonical app-state type surface). This module previously carried divergent
// duplicate interfaces; they are now re-exported so existing importers
// (legacy-state.ts, mutators.ts, engine/map-state.ts) resolve to the single
// source of truth without edits. See tmp/bugsweep-2026-07-07 fix plan.
export type { NavState, ActiveFilters } from './types/engine-types'

// ── Navigation types ─────────────────────────────────────────────────────────
export type {
    FocusAppState,
    ViewportAppState,
} from './types/navigation-types'

// ── Cross-file re-exports ────────────────────────────────────────────────────
export type { LaneHealthPayload } from '../orchestration/semantic-lane'
export type { CacheEntry } from '../search/cache'
