/**
 * @lib/orchestration/parity-attrs.svelte.ts
 *
 * Single source of truth for the body DOM state that the legacy
 * production shell (archived at docs/archive/vector-explorer-polished-legacy.html) requires: body
 * data-* attributes (focus-search, journey-compass, semantic-dive,
 * navigation, viewport, filter, etc.) AND the body classes that
 * gate mobile CSS rules (`is-active` is the main one — see
 * `applyParityAttributes` for context).
 *
 * Migrated to Svelte 5 runes: uses $effect.root() for reactive DOM sync
 * instead of manual .subscribe() calls. The $effect auto-tracks all rune
 * reads inside its callback, so any change to any store automatically
 * triggers a recompute + DOM write.
 *
 * This module is intentionally SSR-safe: every DOM write is guarded.
 */

// ── Store Imports (re-exported for consumers) ─────────────────────────────────

import { get } from 'svelte/store'
import { navStore } from '@lib/stores/navigation.svelte'
// NavState type removed after direct store reads were inlined
import { journeyStore } from '@lib/stores/journey.svelte'
import { focusStore } from '@lib/stores/focus.svelte'
import { searchStore } from '@lib/stores/search.svelte'
import { filterState } from '@lib/stores/filter.svelte'
import { viewport } from '@lib/stores/viewport.svelte'
import { cameraStore } from '@lib/stores/camera.svelte'
import { demoStore, demoPhase as demoPhaseGetter } from '@lib/stores/demo.svelte'
import { graphicsModeStore, loadingPhaseStore } from '@lib/data-store'
import { engineReady } from '@lib/stores/engine-ready.svelte'
import { getJourneyCompassState } from './compass-state'
import { getJourneyCompassPresentationState, type CompassPresentationState } from './compass-controller'
import type { LoadingPhase } from '@lib/types/state'

// ── Attribute Manifest ──────────────────────────────────────────────────────
//
// Each entry maps a body data-attr key to its current desired value and a
// short description of who reads it. The manifest is exported so the focused
// test can assert that the parity layer covers everything the legacy shell
// expects.

export interface ParityAttributeDescriptor {
    /** Body data-attr key (without the `data-` prefix). */
    readonly key: string
    /** What the value means / who reads it. */
    readonly description: string
    /** Which store slice is the source of truth. */
    readonly source: string
}

export const PARITY_ATTRIBUTES: readonly ParityAttributeDescriptor[] = [
    // Journey compass (legacy #journey-compass + .journey-compass CSS hooks)
    { key: 'journeyCompass', description: 'Legacy alias for journey compass lifecycle phase', source: 'compass.phase' },
    {
        key: 'journeyCompassPhase',
        description: 'Journey compass lifecycle phase (idle|checking|synthesizing|active|interrupted)',
        source: 'compass.phase'
    },
    {
        key: 'journeyCompassDensity',
        description: 'Compass density (hidden|compact|expanded)',
        source: 'compass.presentationState'
    },
    { key: 'journeyCompassCopy', description: 'Compass copy mode (quiet|full)', source: 'compass.presentationState' },
    {
        key: 'journeyNavigationOwner',
        description: 'Who owns navigation chrome (journey-compass|map-trail-strip|map-controls|scene|inside-walk)',
        source: 'compass.presentationState'
    },

    // Navigation (legacy navigation-state.js)
    { key: 'navMode', description: 'Navigation mode (overview|search|trail|focus|inside)', source: 'navStore.mode' },
    {
        key: 'navSurface',
        description:
            'Navigation surface (idle|search|focus|focus-search|map|map-trail|map-focus|map-focus-search|inside|thread-inspect|semantic-dive)',
        source: 'navStore.surface'
    },
    {
        key: 'panelSurface',
        description: 'Mirrors navSurface; some legacy code reads this name',
        source: 'navStore.surface'
    },
    {
        key: 'panelSurfaceMode',
        description: 'Mode of the panel surface (focus-search|semantic-dive|...)',
        source: 'derived'
    },
    {
        key: 'panelSurfaceDetail',
        description:
            'Info panel surface detail (none|expanded|peek) — used by mobile_premium__state.css to switch the info panel layout on search/focus-search',
        source: 'derived from panelSurfaceMode + mobileSearchSheet'
    },
    { key: 'activeView', description: 'Current view (galaxy|map)', source: 'navStore.currentView' },
    { key: 'viewMode', description: 'Mirrors activeView for legacy code', source: 'navStore.currentView' },
    {
        key: 'focusedNode',
        description: 'Currently focused node index, or removed when null',
        source: 'navStore.focusedIndex'
    },
    {
        key: 'graphContext',
        description: 'Graph context label (idle|counties|corridor|focus|inside|map)',
        source: 'derived'
    },
    {
        key: 'mapContext',
        description: 'Map context label (idle|search|focus|focus-search|trail)',
        source: 'derived'
    },
    { key: 'routeExploration', description: 'Route exploration phase', source: 'journeyStore.routeExplorationPhase' },

    // Trail (legacy lifecycle.js + setTrailDepth)
    { key: 'trailDepth', description: 'Current trail depth (0|1|2+)', source: 'journeyStore.trailDepth' },
    { key: 'trailState', description: 'Trail state (inactive|active)', source: 'derived' },

    // Semantic dive (legacy semantic-dive-ui.js)
    {
        key: 'semanticDive',
        description: 'Semantic dive state (inactive|transitioning|active)',
        source: 'focusStore.semanticDiveMode'
    },
    {
        key: 'insideWalkState',
        description: 'Inside walk state (idle|walking|exploring|...)',
        source: 'focusStore.strandContinuityPhase'
    },

    // Focus transition (legacy camera-controls.js / focus.ts)
    {
        key: 'focusTransition',
        description: 'Focus transition mode (idle|entering|settling|inside|exiting)',
        source: 'focusStore.transitionMode'
    },

    // Search status (legacy lifecycle-modes.js / search-state.js)
    {
        key: 'searchStatus',
        description: 'Search lifecycle status (idle|searching|focusing|results|empty|error)',
        source: 'searchStore.status'
    },

    // Strand journey (legacy strand-continuity.js — CSS journey_steps.css reads data-strand-journey)
    {
        key: 'strandJourney',
        description: 'Strand journey phase (idle|preview|pinned|exploring|arrived|returning)',
        source: 'focusStore.strandContinuityPhase'
    },
    {
        key: 'threadInspect',
        description: 'Whether the thread inspector is active',
        source: 'focusStore.threadInspector'
    },
    {
        key: 'threadInspectSurface',
        description: 'Thread inspector surface owner (idle|rail|canvas|pinned|inside-cue)',
        source: 'focusStore.threadInspector'
    },
    {
        key: 'inspectedThreadIndex',
        description: 'Currently inspected thread index, or removed when inactive',
        source: 'focusStore.threadInspector'
    },

    // Journey phase
    {
        key: 'journeyPhase',
        description:
            'Journey phase lifecycle (idle|overview|search|focus|inside|map|thread-inspect|walking|arriving|settling)',
        source: 'journeyStore.phase'
    },
    {
        key: 'terrainHandoff',
        description: 'Terrain handoff phase (idle|prelude|transition|settle)',
        source: 'journeyStore.terrainHandoffPhase'
    },
    { key: 'demoPhase', description: 'Demo choreography phase', source: 'demoStore.phase' },

    // Filters (legacy filter-state.js)
    { key: 'filtersActive', description: 'Whether any filter is active', source: 'filterState' },

    // Viewport
    { key: 'reducedMotion', description: 'OS-level reduced motion preference', source: 'viewport.reducedMotion' },
    {
        key: 'compact',
        description: 'Whether viewport is at or below the mobile breakpoint',
        source: 'viewport.isCompact'
    },
    { key: 'mobile', description: 'Whether viewport is mobile (alias of compact)', source: 'viewport.isMobile' },
    { key: 'mode', description: 'Current visual mode (overview|focus|inside|map)', source: 'navStore.mode' },

    // Loading / scene readiness (all derived from loadingPhaseStore + graphicsModeStore)
    { key: 'loadingOverlay', description: 'Loading overlay visibility (hidden|visible)', source: 'loadingPhaseStore' },
    { key: 'loadingPhase', description: 'Loading phase (records|scene|restore|launch)', source: 'loadingPhaseStore' },
    { key: 'sceneReady', description: 'Whether the WebGL scene is ready', source: 'loadingPhaseStore' },
    {
        key: 'viewHandoffActive',
        description: 'Whether a view-handoff animation is in progress',
        source: 'loadingPhaseStore'
    },
    { key: 'cameraAssist', description: 'Camera assistance state (free|suspended)', source: 'loadingPhaseStore' },
    { key: 'graphicsMode', description: 'Graphics mode (webgl|fallback)', source: 'graphicsModeStore' },
    { key: 'testReady', description: 'Test readiness flag (true once parity is installed)', source: 'derived' },
    {
        key: 'engineState',
        description: 'Engine init state (deferred|ready) — mirrors engineReady.value for CSS/contract tests',
        source: 'engineReady.value'
    },

    // Camera orbit slack (legacy camera-orbit-slack.js / camera.ts)
    {
        key: 'cameraSlack',
        description: 'Camera orbit slack phase (idle|active|settling)',
        source: 'cameraStore.orbitSlack.phase'
    },
    {
        key: 'cameraSlackReason',
        description: 'Reason string for the current camera orbit slack phase',
        source: 'cameraStore.orbitSlack.reason'
    }
] as const

/**
 * Set of attribute keys this module owns.
 * Useful for tests that want to assert "every legacy attr is covered".
 */
export const PARITY_ATTRIBUTE_KEYS: ReadonlySet<string> = new Set(PARITY_ATTRIBUTES.map((a) => a.key))

// ── Attribute Computation ────────────────────────────────────────────────────

/**
 * Compute the desired parity attribute map from current store snapshots.
 * Pure function — no side effects, no DOM access. Easy to test.
 */
export interface ParityAttributeMap {
    readonly [key: string]: string | null
}

export function computeParityAttributes(): ParityAttributeMap {
    // Direct reads from rune stores (auto-tracked when called inside $effect)
    const nav = navStore()
    const journey = journeyStore()
    const focus = focusStore()
    const search = get(searchStore)
    const filters = get(filterState)
    const vp = viewport()
    const demoPhaseValue: string = demoPhaseGetter()
    const camera = get(cameraStore)

    const compassStateVal = getJourneyCompassState()
    const presentation: CompassPresentationState = getJourneyCompassPresentationState(compassStateVal)

    // Loading/graphics state comes from the Svelte data-store. Canvas.svelte
    // advances this store to `launch` when WebGL is ready; nav.loadingPhaseKey
    // is a legacy mirror and can lag behind.
    const loadingPhaseValue: LoadingPhase = get(loadingPhaseStore)
    const graphicsModeValue = get(graphicsModeStore)

    const focusedNodeForAttrs = (() => {
        // Primary: Svelte navStore rune (set by Svelte-side focus flows).
        if (nav.focusedIndex !== null && Number.isFinite(nav.focusedIndex)) {
            return String(nav.focusedIndex)
        }
        // Fallback: legacy `__APP_STATE__.navState.focusedIndex`. Legacy
        // `applyLocalNeighborhoodFocus` writes to the legacy state but the
        // Svelte navStore is not updated by the legacy code path, so this
        // fallback is what actually carries the focus index in production.
        // Mirrors the same pattern in FocusCard.svelte::currentFocusedIdx.
        try {
            const w = window as unknown as { __APP_STATE__?: { navState?: { focusedIndex?: unknown } } }
            const legacy = w.__APP_STATE__?.navState?.focusedIndex
            if (typeof legacy === 'number' && Number.isFinite(legacy)) return String(legacy)
        } catch {
            /* ignore */
        }
        return null
    })()
    const hasFocusContext =
        focusedNodeForAttrs !== null || (typeof focus.selectedBusiness === 'object' && focus.selectedBusiness !== null) // audit-ok: typeof-guarded branch, not transformed
    const hasSearchContext =
        !!search.summary ||
        (typeof search.query === 'string' && search.query.trim().length >= 2) ||
        nav.surface === 'focus-search' ||
        nav.surface === 'search'

    // graph-context: legacy uses these values across CSS hooks
    const graphContext = (() => {
        if (vp.isCompact && camera.routeExplorationPhase === 'exploring') return 'corridor'
        if (nav.currentView === 'map') return 'map'
        if (nav.mode === 'inside') return 'inside'
        if (hasFocusContext && hasSearchContext) return 'focus-search'
        if (hasFocusContext) return 'focus'
        if (hasSearchContext) return 'corridor'
        if (nav.mode === 'search' || search.summary) return 'corridor'
        if (nav.mode === 'overview') return 'idle'
        return 'idle'
    })()

    const panelSurfaceMode = ((): string => {
        if (nav.currentView === 'map') {
            if (nav.surface === 'map-focus-search') return 'map-focus-search'
            if (nav.surface === 'map-trail') return 'map-trail'
            if (hasFocusContext && hasSearchContext) return 'map-focus-search'
            if (hasFocusContext) return 'map-focus'
            if (nav.surface === 'focus-search' || nav.surface === 'search' || search.summary) return 'map-search'
            if (nav.surface === 'focus') return 'map-focus'
            if (nav.surface === 'map') return 'map'
            return 'map-idle'
        }
        if (focus.semanticDiveMode) return 'semantic-dive'
        if (hasFocusContext && hasSearchContext) return 'focus-search'
        if (hasSearchContext) return 'search'
        if (nav.surface === 'focus-search') return 'focus-search'
        if (nav.surface === 'map-focus-search') return 'map-focus-search'
        if (nav.surface === 'map-trail') return 'map-trail'
        if (nav.surface === 'thread-inspect') return 'thread-inspect'
        if (nav.surface === 'search') return 'search'
        if (nav.surface === 'focus') return 'focus'
        if (nav.surface === 'inside') return 'inside'
        if (nav.surface === 'map') return 'map'
        return 'idle'
    })()

    const mapContext = ((): string => {
        if (nav.currentView !== 'map') return 'idle'
        if (panelSurfaceMode === 'map-focus-search') return 'focus-search'
        if (panelSurfaceMode === 'map-focus') return 'focus'
        if (panelSurfaceMode === 'map-search') return 'search'
        if (panelSurfaceMode === 'map-trail') return 'trail'
        return 'idle'
    })()

    const hasMapTrailIntent =
        nav.currentView === 'map' &&
        (nav.focusedIndex != null ||
            Boolean(search.summary) ||
            nav.surface === 'map-focus-search' ||
            nav.surface === 'map-trail')
    const trailState =
        journey.depth > 0 ||
        hasMapTrailIntent ||
        graphContext === 'focus-search' ||
        graphContext === 'focus' ||
        nav.mode === 'trail' ||
        presentation.navigationOwner === 'map-trail-strip'
            ? 'active'
            : 'inactive'
    const semanticDive =
        nav.currentView === 'galaxy'
            ? focus.semanticDiveMode && hasFocusContext
                ? 'active'
                : journey.depth >= 2 && hasFocusContext
                  ? 'transitioning'
                  : 'inactive'
            : 'inactive'
    const threadInspectionActive = focus.threadInspector.active
    const inspectedThreadIndex = focus.threadInspector.inspectedIndex

    const mode = nav.mode

    // panelSurfaceDetail: 'none' | 'expanded' | 'peek'. Mirrors the legacy
    // composition-state.ts → getPanelSurfaceDetailFromMobileSheet() logic,
    // which reads the mobileSearchSheet attr (set by setMobileSearchSheetMode
    // in search-panel-adapter.ts) and decides how the info panel renders
    // on search/focus-search. The mobile CSS rules at
    // mobile_premium__state.css:516+ gate on this attr. In the Svelte track
    // the mobileSearchSheet attr is typically not set (the legacy
    // setMobileSearchSheetMode() is not called from Svelte), so the
    // derived value is 'none' in the common case — but writing it
    // unconditionally keeps the parity contract symmetric with the
    // legacy code path and unblocks future Svelte-side sheet toggling.
    //
    // Note: we use `=== search || === focus-search` (positive form) and
    // an early return instead of the more natural `!== search && !==
    // focus-search` (negative form). Svelte 5 strict-mode compilation
    // has a bug where `!==` is incorrectly compiled to `$.strict_equals(a,
    // b, false)` (which is `===`), silently inverting the check. See the
    // audit at qa-screenshots/PARITY_GAP_AUDIT.md for the symptom and
    // the Svelte compiler gotcha.
    const panelSurfaceDetail: string = ((): string => {
        const isSearchContext = panelSurfaceMode === 'search' || panelSurfaceMode === 'focus-search'
        if (!isSearchContext) return 'none'
        const mobileSearchSheet = document.body.dataset.mobileSearchSheet
        if (!mobileSearchSheet) return 'none'
        return mobileSearchSheet === 'expanded' ? 'expanded' : 'peek'
    })()

    const demoPhase = demoPhaseValue

    const filterActive =
        filters.status !== 'all' || filters.city !== '' || filters.website || filters.email || filters.geocoded // audit-ok: intentional — || chain where bug inversion produces false-negatives not false-positives, per audit doc

    // Use positive equality here. This file is compiled by Svelte 5, and
    // nearby parity logic documents a strict-mode compiler bug where `!==`
    // can invert under rune compilation.
    const launchReady = loadingPhaseValue === 'launch'
    const loadingOverlay = launchReady ? 'hidden' : 'visible'
    const sceneReady = launchReady ? 'true' : 'false'
    const viewHandoffActive = launchReady ? 'false' : 'true'
    const cameraAssist = launchReady ? 'free' : 'loading'

    return {
        journeyCompass: journey.compass?.phase ?? 'idle',
        journeyCompassPhase: journey.compass?.phase ?? 'idle',
        journeyCompassDensity: presentation.density,
        journeyCompassCopy: presentation.copy,
        journeyNavigationOwner: presentation.navigationOwner,

        navMode: nav.mode,
        navSurface: nav.surface,
        panelSurface: panelSurfaceMode,
        panelSurfaceMode,
        panelSurfaceDetail,
        activeView: nav.currentView,
        viewMode: nav.currentView,
        focusedNode: focusedNodeForAttrs,
        graphContext,
        mapContext,
        routeExploration: journey.routeExplorationPhase || 'idle',

        trailDepth: String(journey.depth),
        trailState,

        semanticDive,
        insideWalkState: focus.strandContinuityPhase || 'idle',

        focusTransition: focus.transitionMode || 'idle',
        searchStatus: search.status || 'idle',

        strandJourney: focus.strandContinuityPhase || 'idle',
        threadInspect: threadInspectionActive ? 'active' : null,
        threadInspectSurface: threadInspectionActive ? focus.threadInspector.source || 'rail' : 'idle',
        inspectedThreadIndex:
            threadInspectionActive && inspectedThreadIndex !== null ? String(inspectedThreadIndex) : null,
        journeyPhase: ((): string => {
            // W15+ parity-attrs fix: journey.phase reads appState.navState.mode
            // (legacy), which the Svelte track never updates. Derive journeyPhase
            // directly from nav state + search intent so body data-journey-phase
            // reflects the focus state immediately after a search-result click.
            // Avoid `===` and `!==` here — Svelte 5 strict-mode compilation
            // incorrectly inverts `!==` to `===` (see canonical note at line 228).
            const _focusedIdx = nav.focusedIndex
            const _selBiz = focus.selectedBusiness
            const _hasFocus =
                (typeof _focusedIdx === 'number' && Number.isFinite(_focusedIdx)) ||
                (typeof _selBiz === 'object' && _selBiz !== null) // audit-ok: typeof-guarded branch, not transformed
            const _q = search.query
            const _hasSearchIntent = !!search.summary || (typeof _q === 'string' && _q.trim().length >= 2)
            const explicit = journey.phase as string
            // W15+ parity-attrs fix: trust derivation over `journey.phase`
            // (which reads appState.navState.mode). The Svelte track now
            // mirrors mode/surface to appState.navState (commit 37636fe),
            // but during the first focus click after navigation, journey.phase
            // can still race ahead of appState.navState.mode updates. The
            // derivation below handles every case correctly; we only fall
            // back to `explicit` for phases the derivation doesn't model
            // (e.g. 'walking', 'arrived', 'preview', 'pinned', 'settled',
            // 'returning', 'idle').
            if (_hasFocus && _hasSearchIntent) return 'focus-search'
            if (_hasFocus) return 'focus'
            if (_hasSearchIntent) return 'search'
            if (nav.mode === 'inside') return 'inside'
            if (nav.mode === 'trail') return 'walking'
            if (typeof explicit === 'string' && explicit.length > 0 && explicit !== 'idle') return explicit // audit-ok: typeof-guarded branch, not transformed
            return 'idle'
        })(),
        terrainHandoff: journey.terrainHandoffPhase || 'idle',
        demoPhase,

        filtersActive: String(filterActive),

        reducedMotion: String(vp.reducedMotion),
        compact: String(vp.isCompact),
        mobile: String(vp.isMobile),
        mode,

        loadingOverlay,
        loadingPhase: loadingPhaseValue,
        sceneReady,
        viewHandoffActive,
        cameraAssist,
        graphicsMode: graphicsModeValue,
        testReady: 'true',
        engineState: engineReady.value ? 'ready' : 'deferred',

        cameraSlack: camera.orbitSlack.phase || 'idle',
        cameraSlackReason: camera.orbitSlack.reason || null
    }
}

// ── DOM Writer ──────────────────────────────────────────────────────────────

/**
 * Apply the parity attribute map to document.body.
 * SSR-safe (no-op when document/body is unavailable).
 * Idempotent: setting the same value is a no-op for browser.
 *
 * Also manages the body class list — the legacy composition-state.ts:106
 * line `root.classList.toggle('is-active', Boolean(surface))` was the
 * single source of truth for many mobile CSS rules (e.g.,
 * mobile_premium__chrome.css:789 hides the welcome card on search
 * mode, gated on `body.is-active`). The Svelte parity port originally
 * scoped itself to data-* only and missed the class toggle, which
 * left dozens of CSS rules silently dormant. This function now owns
 * the class along with the data-* attrs so the parity contract is
 * complete.
 */
export function applyParityAttributes(map: ParityAttributeMap): void {
    if (typeof document === 'undefined' || !document.body) return

    for (const [key, value] of Object.entries(map)) {
        if (value === null || value === undefined) {
            if (document.body.dataset[key] !== undefined) {
                delete document.body.dataset[key]
            }
            continue
        }
        const str = String(value)
        if (document.body.dataset[key] !== str) {
            document.body.dataset[key] = str
        }
    }

    // Body class management. `is-active` is the meta-gate the legacy
    // composition-state.ts wrote on the body whenever the user was on
    // a non-idle surface. Many mobile CSS rules (including the
    // journey-compass hide rule) are gated on it.
    //
    // Note: we use `===` + `!` (positive form) instead of `!==` because
    // Svelte 5 strict-mode compilation has a bug where `!==` is
    // incorrectly compiled to `$.strict_equals(a, b, false)` (which is
    // `===`), silently inverting the check. See
    // qa-screenshots/PARITY_GAP_AUDIT.md for context.
    const isActive = Boolean(map.panelSurface) && !(map.panelSurface === 'idle')
    if (document.body.classList.contains('is-active') !== isActive) {
        document.body.classList.toggle('is-active', isActive)
    }
}

// ── Installer (rune-based) ─────────────────────────────────────────────────

/**
 * Internal: last-applied snapshot, used to short-circuit no-op writes.
 */
let _lastSnapshot: string | null = null

/**
 * Internal: root effect handle for cleanup.
 */
let _effectRoot: (() => void) | null = null

/**
 * Install the parity attribute sync layer.
 *
 * Subscribes to every Svelte store that feeds computeParityAttributes().
 * Note: calling a store's function form (e.g. `navStore()`) inside a
 * `$effect` is a snapshot read — Svelte 5's rune tracking does NOT
 * establish a reactive subscription on transient `get()` calls. We
 * therefore use explicit `.subscribe()` per store so the effect actually
 * re-runs on store changes. (See qa-screenshots/PARITY_GAP_AUDIT.md
 * for the Svelte 5 reactivity gotcha and how it bites this module.)
 *
 * Returns a cleanup function that stops all subscriptions.
 *
 * @param options.initialSync When true (default), performs an initial
 *   sync after subscription. Useful for tests that want a deterministic
 *   first read.
 */
export function installParityAttributeSync(options: { initialSync?: boolean } = {}): () => void {
    const { initialSync = true } = options

    if (typeof document === 'undefined' || !document.body) {
        return () => {}
    }

    // Clean up any previous root
    if (_effectRoot) {
        _effectRoot()
        _effectRoot = null
    }

    _effectRoot = $effect.root(() => {
        let scheduled = false
        const syncNow = (): void => {
            scheduled = false
            const map = computeParityAttributes()

            // Cheap short-circuit: same JSON snapshot means no DOM changes needed.
            const snapshot = JSON.stringify(map)
            if (snapshot === _lastSnapshot) return
            _lastSnapshot = snapshot

            applyParityAttributes(map)
        }
        const scheduleSync = (): void => {
            if (scheduled) return
            scheduled = true
            // Coalesce multiple store updates in the same tick to avoid redundant
            // recomputes (e.g., when navigation fires both navStore and journeyStore).
            queueMicrotask(syncNow)
        }

        // Explicit .subscribe() per store. Plain function-call reads
        // (e.g. `navStore()`) inside $effect are transient in Svelte 5 and
        // do NOT establish a dependency; .subscribe() does.
        const unsubNav = navStore.subscribe(scheduleSync)
        const unsubJourney = journeyStore.subscribe(scheduleSync)
        const unsubFocus = focusStore.subscribe(scheduleSync)
        const unsubSearch = searchStore.subscribe(scheduleSync)
        const unsubFilter = filterState.subscribe(scheduleSync)
        const unsubViewport = (viewport as any).subscribe(scheduleSync)
        const unsubDemo = (demoStore as any).subscribe(scheduleSync)
        const unsubCamera = (cameraStore as any).subscribe(scheduleSync)
        const unsubLoadingPhase = loadingPhaseStore.subscribe(scheduleSync)
        const unsubGraphicsMode = graphicsModeStore.subscribe(scheduleSync)
        const unsubEngineReady = engineReady.subscribe(scheduleSync)

        if (initialSync) {
            // Force an initial compute on install
            syncNow()
        }

        return () => {
            unsubNav()
            unsubJourney()
            unsubFocus()
            unsubSearch()
            unsubFilter()
            unsubViewport()
            unsubDemo()
            unsubCamera()
            unsubLoadingPhase()
            unsubGraphicsMode()
            unsubEngineReady()
        }
    })

    return () => {
        if (_effectRoot) {
            _effectRoot()
            _effectRoot = null
        }
        _lastSnapshot = null
    }
}

/**
 * Read the current parity attribute map from the DOM (for tests / probes).
 * Returns the live values written by applyParityAttributes.
 */
export function readParityAttributesFromBody(): ParityAttributeMap {
    if (typeof document === 'undefined' || !document.body) return {}
    const out: Record<string, string> = {}
    for (const desc of PARITY_ATTRIBUTES) {
        const v = document.body.dataset[desc.key]
        if (v !== undefined) out[desc.key] = v
    }
    return out
}

/**
 * Test/debug helper: reset the internal snapshot cache so the next
 * recompute is forced even if the data is identical.
 */
export function resetParityAttributeCache(): void {
    _lastSnapshot = null
}
