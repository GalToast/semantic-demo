/**
 * @lib/orchestration/parity/parity-resolvers.ts
 *
 * Pure resolver functions for computeParityAttributes().
 * Extracted from parity-attrs.svelte.ts (2026-06-28) following the
 * neighborhood.ts decomposition template (commit 300906d9).
 *
 * Each resolver takes a ParityContext and returns a small typed object.
 * Two resolvers are intentionally impure (marked below):
 *   - resolvePanelSurfaceDetail — reads document.body.dataset.mobileSearchSheet
 *   - resolveCameraAssist — reads appState.focusCameraAssistActive
 */

import { appState } from '@lib/state/app.svelte'
import type { ParityContext } from './parity-context'

// ── focus focusedNode + hasFocusContext ────────────────────────────────────

export interface FocusContextResult {
    focusedNode: string | null
    hasFocusContext: boolean
}

export function resolveFocusContext(ctx: ParityContext): FocusContextResult {
    // Primary: Svelte navStore rune (set by Svelte-side focus flows).
    let focusedNode: string | null = null
    if (ctx.nav.focusedIndex !== null && Number.isFinite(ctx.nav.focusedIndex)) {
        focusedNode = String(ctx.nav.focusedIndex)
    } else if (ctx.legacyFocusedIndex !== null) {
        // Fallback: legacy window.__APP_STATE__.navState.focusedIndex.
        // The legacy cast lives in resolveParityContext(); this branch
        // simply consumes the pre-computed value.
        focusedNode = String(ctx.legacyFocusedIndex)
    }

    const hasFocusContext =
        focusedNode !== null ||
        (typeof ctx.focus.selectedBusiness === 'object' && ctx.focus.selectedBusiness !== null)

    return { focusedNode, hasFocusContext }
}

// ── search context ─────────────────────────────────────────────────────────

export interface SearchContextResult {
    hasSearchContext: boolean
}

export function resolveSearchContext(ctx: ParityContext): SearchContextResult {
    const hasSearchContext =
        !!ctx.search.summary ||
        (typeof ctx.search.query === 'string' && ctx.search.query.trim().length >= 2) ||
        ctx.nav.surface === 'focus-search' ||
        ctx.nav.surface === 'search'

    return { hasSearchContext }
}

// ── graph context ──────────────────────────────────────────────────────────

export interface GraphContextResult {
    graphContext: string
}

export function resolveGraphContext(
    ctx: ParityContext,
    hasFocus: boolean,
    hasSearch: boolean
): GraphContextResult {
    if (ctx.viewport.isCompact && ctx.camera.routeExplorationPhase === 'exploring') {
        return { graphContext: 'corridor' }
    }
    if (ctx.nav.currentView === 'map') return { graphContext: 'map' }
    if (ctx.nav.mode === 'inside') return { graphContext: 'inside' }
    if (hasFocus && hasSearch) return { graphContext: 'focus-search' }
    if (hasFocus) return { graphContext: 'focus' }
    if (hasSearch) return { graphContext: 'corridor' }
    if (ctx.nav.mode === 'search' || ctx.search.summary) return { graphContext: 'corridor' }
    if (ctx.nav.mode === 'overview') return { graphContext: 'idle' }
    return { graphContext: 'idle' }
}

// ── panel surface mode ─────────────────────────────────────────────────────

export interface PanelSurfaceModeResult {
    panelSurfaceMode: string
}

export function resolvePanelSurfaceMode(
    ctx: ParityContext,
    hasFocus: boolean,
    hasSearch: boolean
): PanelSurfaceModeResult {
    const nav = ctx.nav
    const focus = ctx.focus

    if (nav.currentView === 'map') {
        if (nav.surface === 'map-focus-search') return { panelSurfaceMode: 'map-focus-search' }
        if (nav.surface === 'map-trail') return { panelSurfaceMode: 'map-trail' }
        if (hasFocus && hasSearch) return { panelSurfaceMode: 'map-focus-search' }
        if (hasFocus) return { panelSurfaceMode: 'map-focus' }
        if (nav.surface === 'focus-search' || nav.surface === 'search' || ctx.search.summary) {
            return { panelSurfaceMode: 'map-search' }
        }
        if (nav.surface === 'focus') return { panelSurfaceMode: 'map-focus' }
        if (nav.surface === 'map') return { panelSurfaceMode: 'map' }
        return { panelSurfaceMode: 'map-idle' }
    }
    if (focus.semanticDiveMode) return { panelSurfaceMode: 'semantic-dive' }
    if (hasFocus && hasSearch) return { panelSurfaceMode: 'focus-search' }
    if (hasSearch) return { panelSurfaceMode: 'search' }
    if (nav.surface === 'focus-search') return { panelSurfaceMode: 'focus-search' }
    if (nav.surface === 'map-focus-search') return { panelSurfaceMode: 'map-focus-search' }
    if (nav.surface === 'map-trail') return { panelSurfaceMode: 'map-trail' }
    if (nav.surface === 'thread-inspect') return { panelSurfaceMode: 'thread-inspect' }
    if (nav.surface === 'search') return { panelSurfaceMode: 'search' }
    if (nav.surface === 'focus') return { panelSurfaceMode: 'focus' }
    if (nav.surface === 'inside') return { panelSurfaceMode: 'inside' }
    if (nav.surface === 'map') return { panelSurfaceMode: 'map' }
    return { panelSurfaceMode: 'idle' }
}

// ── map context ────────────────────────────────────────────────────────────

export interface MapContextResult {
    mapContext: string
}

export function resolveMapContext(ctx: ParityContext, panelSurfaceMode: string): MapContextResult {
    if (ctx.nav.currentView !== 'map') return { mapContext: 'idle' }
    if (panelSurfaceMode === 'map-focus-search') return { mapContext: 'focus-search' }
    if (panelSurfaceMode === 'map-focus') return { mapContext: 'focus' }
    if (panelSurfaceMode === 'map-search') return { mapContext: 'search' }
    if (panelSurfaceMode === 'map-trail') return { mapContext: 'trail' }
    return { mapContext: 'idle' }
}

// ── map trail intent + trail state ─────────────────────────────────────────

export interface MapTrailStateResult {
    hasMapTrailIntent: boolean
    trailState: 'active' | 'inactive'
}

export function resolveMapTrailState(
    ctx: ParityContext,
    _hasFocus: boolean,
    _hasSearch: boolean,
    panelSurfaceMode: string,
    graphContext: string
): MapTrailStateResult {
    const hasMapTrailIntent =
        ctx.nav.currentView === 'map' &&
        (ctx.nav.focusedIndex != null ||
            Boolean(ctx.search.summary) ||
            ctx.nav.surface === 'map-focus-search' ||
            ctx.nav.surface === 'map-trail')
    const trailState: 'active' | 'inactive' =
        ctx.journey.depth > 0 ||
        hasMapTrailIntent ||
        graphContext === 'focus-search' ||
        graphContext === 'focus' ||
        ctx.nav.mode === 'trail' ||
        ctx.presentation.navigationOwner === 'map-trail-strip'
            ? 'active'
            : 'inactive'

    return { hasMapTrailIntent, trailState }
}

// ── semantic dive ──────────────────────────────────────────────────────────

export interface SemanticDiveResult {
    semanticDive: 'inactive' | 'transitioning' | 'active'
}

export function resolveSemanticDive(ctx: ParityContext, hasFocus: boolean): SemanticDiveResult {
    const semanticDive: 'inactive' | 'transitioning' | 'active' =
        ctx.nav.currentView === 'galaxy'
            ? ctx.focus.semanticDiveMode && hasFocus
                ? 'active'
                : ctx.journey.depth >= 2 && hasFocus
                  ? 'transitioning'
                  : 'inactive'
            : 'inactive'
    return { semanticDive }
}

// ── thread inspection ──────────────────────────────────────────────────────

export interface ThreadInspectionResult {
    threadInspectionActive: boolean
    inspectedThreadIndex: number | null
}

export function resolveThreadInspection(ctx: ParityContext): ThreadInspectionResult {
    return {
        threadInspectionActive: ctx.focus.threadInspector.active,
        inspectedThreadIndex: ctx.focus.threadInspector.inspectedIndex
    }
}

// ── panel surface detail (IMPURE — reads DOM) ─────────────────────────────

export interface PanelSurfaceDetailResult {
    panelSurfaceDetail: 'none' | 'expanded' | 'peek'
}

/**
 * IMPURE: reads `document.body.dataset.mobileSearchSheet` directly.
 * The mobileSearchSheet attr is set by setMobileSearchSheetMode() in
 * search-panel-adapter.ts. In the Svelte track this attr is typically
 * not set, so the derived value is 'none' in the common case.
 */
export function resolvePanelSurfaceDetail(panelSurfaceMode: string): PanelSurfaceDetailResult {
    const isSearchContext = panelSurfaceMode === 'search' || panelSurfaceMode === 'focus-search'
    if (!isSearchContext) return { panelSurfaceDetail: 'none' }
    const mobileSearchSheet = typeof document !== 'undefined' ? document.body.dataset.mobileSearchSheet : undefined
    if (!mobileSearchSheet) return { panelSurfaceDetail: 'none' }
    return {
        panelSurfaceDetail: mobileSearchSheet === 'expanded' ? 'expanded' : 'peek'
    }
}

// ── launch state (loadingOverlay / sceneReady / viewHandoffActive) ─────────

export interface LaunchStateResult {
    loadingOverlay: 'hidden' | 'visible'
    sceneReady: 'true' | 'false'
    viewHandoffActive: 'true' | 'false'
}

export function resolveLaunchState(ctx: ParityContext): LaunchStateResult {
    const launchReady = ctx.loadingPhase === 'launch'
    return {
        loadingOverlay: launchReady ? 'hidden' : 'visible',
        sceneReady: launchReady ? 'true' : 'false',
        viewHandoffActive: launchReady ? 'false' : 'true'
    }
}

// ── camera assist (IMPURE — reads appState) ────────────────────────────────

export interface CameraAssistResult {
    cameraAssist: 'free' | 'arriving'
}

/**
 * IMPURE: reads `appState.focusCameraAssistActive` directly.
 * Tier-2 camera conflict fix: cameraAssist is the camera-in-flight state,
 * not launch-readiness. Source from appState.focusCameraAssistActive
 * (mirrored from camera-controls-core.svelte.ts:110).
 */
export function resolveCameraAssist(): CameraAssistResult {
    return {
        cameraAssist: appState.focusCameraAssistActive ? 'arriving' : 'free'
    }
}

// ── filter active ──────────────────────────────────────────────────────────

export interface FilterActiveResult {
    filtersActive: boolean
}

export function resolveFilterActive(ctx: ParityContext): FilterActiveResult {
    const f = ctx.filters
    return {
        filtersActive:
            f.status !== 'all' || f.city !== '' || f.website || f.email || f.geocoded
    }
}

// ── journey phase (nested IIFE) ────────────────────────────────────────────

export interface JourneyPhaseResult {
    journeyPhase: string
}

export function resolveJourneyPhase(
    ctx: ParityContext,
    hasFocus: boolean,
    hasSearch: boolean
): JourneyPhaseResult {
    // W15+ parity-attrs fix: journey.phase reads appState.navState.mode
    // (legacy), which the Svelte track never updates. Derive journeyPhase
    // directly from nav state + search intent so body data-journey-phase
    // reflects the focus state immediately after a search-result click.
    //
    // IMPORTANT: This function intentionally IGNORES the hasFocus/hasSearch
    // params passed by the orchestrator. The original IIFE recomputed these
    // values from scratch (using the same logic as resolveFocusContext +
    // resolveSearchContext, but inline). Passing them in would duplicate
    // the computation and risk divergence. They exist in the signature
    // solely to keep the resolver uniform with the other resolvers in
    // this module (future refactor may remove them).
    void hasFocus
    void hasSearch
    const focusedIdx = ctx.nav.focusedIndex
    const selBiz = ctx.focus.selectedBusiness
    const derivedHasFocus =
        (typeof focusedIdx === 'number' && Number.isFinite(focusedIdx)) ||
        (typeof selBiz === 'object' && selBiz !== null)
    const q = ctx.search.query
    const derivedHasSearch = !!ctx.search.summary || (typeof q === 'string' && q.trim().length >= 2)
    const explicit = ctx.journey.phase as string

    let journeyPhase: string
    if (derivedHasFocus && derivedHasSearch) {
        journeyPhase = 'focus-search'
    } else if (derivedHasFocus) {
        journeyPhase = 'focus'
    } else if (derivedHasSearch) {
        journeyPhase = 'search'
    } else if (ctx.nav.mode === 'inside') {
        journeyPhase = 'inside'
    } else if (ctx.nav.mode === 'trail') {
        journeyPhase = 'walking'
    } else if (typeof explicit === 'string' && explicit.length > 0 && explicit !== 'idle') {
        journeyPhase = explicit
    } else {
        journeyPhase = 'idle'
    }

    return { journeyPhase }
}
