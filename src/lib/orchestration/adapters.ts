/**
 * @lib/orchestration/adapters.ts — Adapter initialization contracts.
 *
 * W12-T8: removed @ts-nocheck and tightened types. Any remaining `unknown`
 * parameters reflect a real type contract (rest-args, setters accepting
 * arbitrary data, or external bridge layer where the concrete type is
 * not yet available in the Svelte layer).
 */
import { initJourneyLifecycleAdapter } from '@lib/journey/lifecycle-adapter'
import { initJourneyCompassAdapter } from '@lib/orchestration/compass-controller'
import { initJourneySelectedCard } from '@lib/journey/selected-card'
import { initSemanticDiveUiSubscriptions } from '@lib/journey/semantic-dive'
import { initFocusNeighborRailSubscriptions } from '@lib/journey/focus-ui'
import { initThreadInspectorAdapter } from '@lib/journey/thread-inspector-adapter'
import { initMapStateSubscriptions } from '@lib/engine/map-state'
import { initViewControllerAdapter } from '@lib/orchestration/view-controller'
import { setupMobileSearchSheetToggle } from '@lib/search/search-panel-adapter'
import type { ThreadCandidate, WalkCandidateOptions } from '@lib/journey/thread-model'

/**
 * Loose 3D point — matches the structural shape of the legacy
 * `Point3D` in `` (optional x/y/z).
 * The strict `Point3D` in `@lib/types/webgl` is required x/y/z, which is
 * narrower than the bridge contract. Use this loose form for adapter
 * bridges until the consumer is tightened.
 */
export type LoosePoint3D = { x?: number; y?: number; z?: number }

/**
 * Loose neighbor candidate — matches the structural shape of the legacy
 * `NeighborCandidate` in ``. The
 * legacy type allows `reason?: string` and arbitrary extra fields.
 */
export type LooseNeighborCandidate = { reason?: string; [key: string]: unknown }

/**
 * Loose business point — used where the legacy `Point` type from
 * `js/state.ts` is consumed. No direct Svelte-5 equivalent exists yet;
 * `BusinessRecord` from `@lib/types/business` is the canonical
 * replacement once the consumer is tightened.
 */
export type LoosePoint = Record<string, unknown>

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Dependencies for the journey lifecycle adapter (14+ functions).
 * These bridge journey, focus, search, and rendering concerns.
 *
 * `unknown` types are kept for:
 * - Rest-args functions (`...args: unknown[]`) — variadic input
 * - Setters (`(val: unknown) => void`) — generic store writers
 * - Boolean-like setters (`(mode: unknown) => void`) — accepts coerced boolean
 * - Bridge layers where the concrete type is not yet available
 */
export interface JourneyLifecycleDeps {
    previewInsideNextThread: (options?: unknown) => void
    getNextWalkCandidateForIndex: (currentIndex: number, options?: WalkCandidateOptions) => ThreadCandidate | null
    setSemanticDiveMode: (mode: unknown) => void
    getInterestingBusinessNote: (point: LoosePoint) => string | null
    buildSelectedMatchNarrative: (point: LoosePoint) => string
    hasColdDegradedSemanticFallback: () => boolean
    getColdDegradedRouteCopy: () => null
    getSelectedBusinessRoleLabel: (point: unknown) => string
    isFieldNodeFocusContext: () => boolean
    revealSelectedBusinessCard: (...args: unknown[]) => void
    describeThreadLensForPoint: (point: unknown) => unknown
    hydrateLeadContext: (point: unknown, options: unknown) => void
    shouldUseFloatingFocusJourneyOnly: () => boolean
    setLastCanvasNodePick: (val: unknown) => void
    setLastCanvasNodeHover: (val: unknown) => void
    setLastCanvasNodeFocusPick: (val: unknown) => void
}

/**
 * Dependencies for the cluster filter adapter (4 functions).
 */
/**
 * Dependencies for the thread inspector adapter (4 functions).
 *
 * `edge: unknown` is kept because the thread edge type is heterogeneous
 * across the legacy adapter layer (sometimes Edge, sometimes Record).
 */
export interface ThreadInspectorDeps {
    summarizeNeighborReason: (
        candidate: LooseNeighborCandidate,
        point: LoosePoint3D,
        focusPoint: LoosePoint3D
    ) => string
    getInsideRelationshipLabel: (
        candidate: LooseNeighborCandidate,
        point: LoosePoint3D,
        focusPoint: LoosePoint3D
    ) => string
    getCurrentTrailFocusIndex: () => number | null
}

/**
 * Top-level deps object for initAdapters().
 * Mirrors the dependency surface of the legacy initAdapters() in app.ts.
 */
export interface AdapterDeps {
    /** 14-function deps bag for journey lifecycle */
    journeyLifecycle: JourneyLifecycleDeps
    /** View-switch function for compass adapter */
    switchView: (view: string) => void
    /** Journey selected card deps */
    journeySelectedCard: {
        getStrandArrivalNote: (...args: unknown[]) => unknown
        updateTraversalUi: (...args: unknown[]) => void
        hydrateLeadContext: (point: unknown, options?: Record<string, unknown>) => void
    }
    /** 4-function deps bag for thread inspector */
    threadInspector: ThreadInspectorDeps
    /** Composition refresh for view controller */
    refreshCompositionState: () => void
    /** Compact-viewport predicate for mobile search */
    isCompactSearchViewport: () => boolean
}

// ── Module-level State ───────────────────────────────────────────────────────

let _adaptersInitialized = false

/**
 * Returns true if initAdapters() has been called in this session.
 */
export function areAdaptersInitialized(): boolean {
    return _adaptersInitialized
}

// ── Initialization ───────────────────────────────────────────────────────────

/**
 * Initialize all 11 engine-kernel adapter modules.
 *
 * Must be called once during app startup (from app-init.ts or App.svelte).
 * Subsequent calls are no-ops — adapters are wired once and stay wired
 * for the session lifetime.
 *
 * @param deps — Cross-module function references needed by the adapters.
 */
export function initAdapters(deps: AdapterDeps): void {
    if (_adaptersInitialized) return

    // 1. Journey lifecycle adapter (14 deps)
    initJourneyLifecycleAdapter(deps.journeyLifecycle)

    // 2. Journey compass adapter (view-switch)
    initJourneyCompassAdapter({ switchView: deps.switchView })

    // 3. Journey selected card adapter (3 deps)
    initJourneySelectedCard(deps.journeySelectedCard)

    // 4. Semantic dive UI subscriptions (no deps)
    initSemanticDiveUiSubscriptions()

    // 6. Focus neighbor rail subscriptions (no deps)
    initFocusNeighborRailSubscriptions()

    // 7. Route trace subscriptions (no deps)
    // W45: dynamic import — route-trace statically imports three (ShaderMaterial,
    // Color, etc.) for WebGL overlay rendering. Deferring keeps three out of the
    // cold-load modulepreload set. Fire-and-forget: subscriptions register before
    // the demo arrival phase (post-gesture) needs them.
    import('@lib/journey/route-trace')
        .then(({ initRouteTraceSubscriptions }) => initRouteTraceSubscriptions())
        .catch(() => {})

    // 8. Thread inspector adapter (4 deps)
    initThreadInspectorAdapter(deps.threadInspector)

    // 9. Map state subscriptions (no deps)
    initMapStateSubscriptions()

    // 10. View controller adapter (1 dep)
    initViewControllerAdapter({ refreshCompositionState: deps.refreshCompositionState })

    // 11. Mobile search sheet toggle (1 dep)
    setupMobileSearchSheetToggle({ isCompactSearchViewport: deps.isCompactSearchViewport })

    _adaptersInitialized = true
}
