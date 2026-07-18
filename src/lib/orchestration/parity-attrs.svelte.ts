/**
 * @lib/orchestration/parity-attrs.svelte.ts
 *
 * Single source of truth for the body DOM state that the legacy
 * production shell (archived at docs/archive/vector-explorer-polished-legacy.html) requires: body
 * data-* attributes (focus-search, journey-compass, semantic-dive,
 * navigation, viewport, filter, etc.) AND the body classes that
 * gate mobile CSS rules (surface-{value}, view-{value},
 * navigation-{value}, focus-transition). See `applyParityAttributes`
 * for context.
 *
 * Phase B3d removed the `is-active` body class (redundant with
 * surface-{value}: is-active ≡ panelSurface !== 'idle').
 *
 * Migrated to Svelte 5 runes: uses $effect.root() for reactive DOM sync
 * instead of manual .subscribe() calls. The $effect auto-tracks all rune
 * reads inside its callback, so any change to any store automatically
 * triggers a recompute + DOM write.
 *
 * This module is intentionally SSR-safe: every DOM write is guarded.
 */

// ── Store Imports (re-exported for consumers) ─────────────────────────────────

import { navStore } from '@lib/stores/navigation.svelte'
// NavState type removed after direct store reads were inlined
import { journeyStore } from '@lib/stores/journey.svelte'
import { focusStore } from '@lib/stores/focus.svelte'
import { searchStore } from '@lib/stores/search.svelte'
import { filterState } from '@lib/stores/filter.svelte'
import { viewport } from '@lib/stores/viewport.svelte'
import { cameraStore } from '@lib/stores/camera.svelte'
import { demoStore } from '@lib/stores/demo.svelte'
import { graphicsModeStore, loadingPhaseStore } from '@lib/data-store'
import { engineReady } from '@lib/stores/engine-ready.svelte'
import { appState } from '@lib/state/app.svelte'

// ── Decomposition: pure resolvers for computeParityAttributes() ───────────
//
// The 245-LOC IIFE body was decomposed into 13 pure resolvers (plus the
// context bundle) on 2026-06-28, following the neighborhood.ts template
// (commit 300906d9). See parity/parity-context.ts and parity/parity-resolvers.ts.

import { resolveParityContext } from './parity/parity-context'
import {
    resolveFocusContext,
    resolveSearchContext,
    resolveGraphContext,
    resolvePanelSurfaceMode,
    resolveMapContext,
    resolveMapTrailState,
    resolveSemanticDive,
    resolveThreadInspection,
    resolvePanelSurfaceDetail,
    resolveLaunchState,
    resolveCameraAssist,
    resolveFilterActive,
    resolveJourneyPhase
} from './parity/parity-resolvers'

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
    {
        key: 'journeyCompassPhase',
        description: 'Journey compass lifecycle phase (idle|checking|synthesizing|active|interrupted)',
        source: 'compass.phase'
    },
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

    // Mobile route peek (W47 migration: replaces bypass writes in results-ui.ts)
    {
        key: 'mobileRoutePeek',
        description: 'Mobile route field peek-in active state (active when truthy, absent otherwise)',
        source: 'appState.mobileRoutePeekActive'
    },
    {
        key: 'mobileRoutePeekReason',
        description: 'Optional reason string for the active mobile route peek (cleared when inactive)',
        source: 'appState.mobileRoutePeekReason'
    },

    // Strand journey (legacy strand-continuity.js — CSS journey_steps.css reads data-strand-journey)
    {
        key: 'strandJourney',
        description: 'Strand journey phase (idle|preview|pinned|exploring|arrived|returning)',
        source: 'focusStore.strandContinuityPhase'
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
    // ── Orchestrator: delegates to pure resolvers ─────────────────────────
    //
    // The 245-LOC IIFE body was decomposed into 13 pure resolvers (plus
    // the context bundle) on 2026-06-28. Each resolver is independently
    // testable and the orchestrator is now a thin wiring layer.

    const ctx = resolveParityContext()
    const { focusedNode, hasFocusContext } = resolveFocusContext(ctx)
    const { hasSearchContext } = resolveSearchContext(ctx)
    const { graphContext } = resolveGraphContext(ctx, hasFocusContext, hasSearchContext)
    const { panelSurfaceMode } = resolvePanelSurfaceMode(ctx, hasFocusContext, hasSearchContext)
    const { mapContext } = resolveMapContext(ctx, panelSurfaceMode)
    const { trailState } = resolveMapTrailState(ctx, hasFocusContext, hasSearchContext, panelSurfaceMode, graphContext)
    const { semanticDive } = resolveSemanticDive(ctx, hasFocusContext)
    const { threadInspectionActive, inspectedThreadIndex } = resolveThreadInspection(ctx)
    const { panelSurfaceDetail } = resolvePanelSurfaceDetail(panelSurfaceMode)
    const { loadingOverlay, sceneReady, viewHandoffActive } = resolveLaunchState(ctx)
    const { cameraAssist } = resolveCameraAssist()
    const { filtersActive } = resolveFilterActive(ctx)
    const { journeyPhase } = resolveJourneyPhase(ctx, hasFocusContext, hasSearchContext)

    const nav = ctx.nav
    const journey = ctx.journey
    const focus = ctx.focus
    const search = ctx.search
    const vp = ctx.viewport
    const presentation = ctx.presentation
    const loadingPhaseValue = ctx.loadingPhase
    const graphicsModeValue = ctx.graphicsMode
    const demoPhase = ctx.demoPhase
    const camera = ctx.camera
    const mode = nav.mode

    return {
        journeyCompassPhase: journey.compass?.phase ?? 'idle',
        journeyNavigationOwner: presentation.navigationOwner,

        navMode: nav.mode,
        navSurface: nav.surface,
        panelSurface: panelSurfaceMode,
        panelSurfaceMode,
        panelSurfaceDetail,
        activeView: nav.currentView,
        focusedNode,
        graphContext,
        mapContext,
        routeExploration: journey.routeExplorationPhase || 'idle',

        trailDepth: String(journey.depth),
        trailState,

        semanticDive,

        focusTransition: focus.transitionMode || 'idle',
        searchStatus: search.status || 'idle',

        mobileRoutePeek: appState.mobileRoutePeekActive ? 'active' : null,
        mobileRoutePeekReason: appState.mobileRoutePeekActive ? appState.mobileRoutePeekReason || null : null,

        strandJourney: focus.strandContinuityPhase || 'idle',
        threadInspectSurface: threadInspectionActive ? focus.threadInspector.source || 'rail' : 'idle',
        inspectedThreadIndex:
            threadInspectionActive && inspectedThreadIndex !== null ? String(inspectedThreadIndex) : null,
        journeyPhase,
        terrainHandoff: journey.terrainHandoffPhase || 'idle',
        demoPhase,

        filtersActive: String(filtersActive),

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

        cameraSlack: camera.orbitSlack.phase || 'idle',
        cameraSlackReason: camera.orbitSlack.reason || null
    }
}

// ── DOM Writer ──────────────────────────────────────────────────────────────

// ── applyParityAttributes helpers ─────────────────────────────────────────

/**
 * Write the computed parity map entries to body data-* attributes.
 * Null/undefined values remove the attribute; strings set it.
 */
function applyDataAttributes(map: ParityAttributeMap): void {
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
}

/**
 * Emit data-surface-settled once the surface layout is stable:
 * loading overlay hidden AND route settled (scene ready / view-handoff
 * finished / camera free / graphics fallback).
 */
function applySurfaceSettledSignal(map: ParityAttributeMap): void {
    const overlayHidden = map.loadingOverlay === 'hidden'
    const routeSettled =
        map.sceneReady === 'true' ||
        map.viewHandoffActive === 'false' ||
        map.cameraAssist === 'free' ||
        map.graphicsMode === 'fallback'
    if (overlayHidden && routeSettled) {
        const settled = map.panelSurface ?? map.navSurface ?? 'true'
        if (document.body.dataset.surfaceSettled !== settled) {
            document.body.dataset.surfaceSettled = settled
        }
    } else if (document.body.dataset.surfaceSettled !== undefined) {
        delete document.body.dataset.surfaceSettled
    }
}

/**
 * Keep body CSS classes in sync with data-* attributes. Manages:
 * - Value-based mirrors (panelSurface→surface-*, activeView→view-*, etc.)
 * - Static compound mirrors (surface-map-any, route-peek)
 */
function applyBodyClassMirrors(map: ParityAttributeMap): void {
    // Value-based class mirrors
    const BODY_CLASS_MAP: Record<string, string> = {
        panelSurface: 'surface',
        activeView: 'view',
        journeyNavigationOwner: 'navigation',
        focusTransition: 'focus-transition'
    }

    for (const [attrKey, prefix] of Object.entries(BODY_CLASS_MAP)) {
        const value = map[attrKey]
        if (value === null || value === undefined || value === '') {
            // Remove any existing class with this prefix
            for (const cls of Array.from(document.body.classList)) {
                if (cls.startsWith(prefix + '-')) {
                    document.body.classList.remove(cls)
                }
            }
            continue
        }
        const desiredClass = `${prefix}-${String(value)}`
        // Remove stale siblings, add desired
        for (const cls of Array.from(document.body.classList)) {
            if (cls.startsWith(prefix + '-') && cls !== desiredClass) {
                document.body.classList.remove(cls)
            }
        }
        if (!document.body.classList.contains(desiredClass)) {
            document.body.classList.add(desiredClass)
        }
    }

    // Static compound class: surface-map-any
    const isMapSurface = typeof map.panelSurface === 'string' && (map.panelSurface as string).startsWith('map-')
    if (isMapSurface) {
        if (!document.body.classList.contains('surface-map-any')) {
            document.body.classList.add('surface-map-any')
        }
    } else if (document.body.classList.contains('surface-map-any')) {
        document.body.classList.remove('surface-map-any')
    }

    // Static class: route-peek
    const isRoutePeekActive = map.mobileRoutePeek === 'active'
    if (isRoutePeekActive) {
        if (!document.body.classList.contains('route-peek')) {
            document.body.classList.add('route-peek')
        }
    } else if (document.body.classList.contains('route-peek')) {
        document.body.classList.remove('route-peek')
    }
}

// ── Orchestrator ───────────────────────────────────────────────────────────

/**
 * Apply the parity attribute map to document.body.
 * SSR-safe (no-op when document/body is unavailable).
 * Idempotent: setting the same value is a no-op for browser.
 *
 * Also manages the body class list — the legacy composition-state.ts:106
 * line `root.classList.toggle('is-active', Boolean(surface))` was the
 * single source of truth for many mobile CSS rules (e.g.,
 * mobile_premium__layout.css:789 hides the welcome card on search
 * mode, gated on `body.is-active`). The Svelte parity port originally
 * scoped itself to data-* only and missed the class toggle, which
 * left dozens of CSS rules silently dormant. This function now owns
 * the class along with the data-* attrs so the parity contract is
 * complete.
 */
export function applyParityAttributes(map: ParityAttributeMap): void {
    if (typeof document === 'undefined' || !document.body) return

    applyDataAttributes(map)
    applySurfaceSettledSignal(map)
    applyBodyClassMirrors(map)

    // Note: The `is-active` body class was removed in Phase B3d.3.
    // It was redundant with the surface-{value} classes (is-active
    // ≡ panelSurface !== 'idle' ≡ :not(.surface-idle)). All CSS
    // rules that previously used `body.is-active` have been migrated
    // to use surface-{value} classes directly.
    //
    // Test contract hooks (e.g., __forceSemanticDiveContractSurface)
    // may still add `is-active` directly to body for backward compat,
    // but parity-attrs no longer manages it.
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
 * Reactive rune-backed parity attribute map.
 *
 * Svelte 5 `$state` proxy that mirrors the current `ParityAttributeMap`
 * computed by `computeParityAttributes()`. Updated inside
 * `installParityAttributeSync()`'s `$effect.root()` block via
 * `Object.assign(parityMap, map)` so that any consumer reading
 * `parityMap.panelSurface` (etc.) inside a reactive context (template,
 * `$derived`, `$effect`) gets automatic re-runs when the underlying
 * rune stores change.
 *
 * Replaces the body-attr MutationObserver mirror pattern previously
 * duplicated in App.svelte, CompassRail, FocusCard, Legend, JourneyCompass,
 * and WeatherWidget. Those components now read `parityMap.x` directly
 * instead of mirroring body dataset attrs into local `$state`.
 *
 * Consumers MUST treat this as read-only. The write side is owned by
 * `installParityAttributeSync()`; mutating from outside will cause parity
 * to diverge from body. TypeScript does not enforce this — it's a
 * convention enforced by code review and the parity-attrs contract tests.
 *
 * The object is empty until `installParityAttributeSync()` runs
 * (i.e., after `app-init.ts:251` in the production app boot sequence).
 * Tests that read it before install must either call
 * `installParityAttributeSync({ initialSync: true })` first or read
 * `body.dataset` directly.
 */
export const parityMap: ParityAttributeMap = $state<ParityAttributeMap>({} as ParityAttributeMap)

// ── Bypass attribute accessors ────────────────────────────────────────

/**
 * Bypass body data-* attributes that are intentionally written by code
 * OUTSIDE parity-attrs (engine code, legacy orchestrators, search panel
 * adapter, bootstrap path). These are NOT owned by parity-attrs and
 * are NOT in PARITY_ATTRIBUTES — the writes are the canonical source.
 *
 * What parity-attrs DOES provide for these attrs:
 *   - A single shared MutationObserver on document.body that re-fires
 *     when any of these attrs changes (vs. each component running its
 *     own observer).
 *   - A reactive rune-backed snapshot so Svelte 5 components can read
 *     them via `$derived(getBypassAttr('focusPanelMode'))` without
 *     mirroring into local `$state`.
 *
 * Bypass attrs (and their canonical writers):
 *   - `focusPanelMode`   setFocusPanelMode()  src/lib/utils/focus-panel-mode.ts:27
 *   - `insideWalkState`  semantic-dive.ts setJourneyPhase()  src/lib/journey/semantic-dive.ts:123
 *   - `renderKind`       initial = main.ts:112; engine-ready = stores/engine-ready.svelte.ts:27
 *   - `mobileSearchSheet` setMobileSearchSheetMode()  src/lib/search/search-panel-adapter.ts:98
 */
export type BypassAttrKey = 'focusPanelMode' | 'insideWalkState' | 'renderKind' | 'mobileSearchSheet'

const _bypassSnapshot: Record<BypassAttrKey, string | null> = $state<Record<BypassAttrKey, string | null>>({
    focusPanelMode: null,
    insideWalkState: null,
    renderKind: null,
    mobileSearchSheet: null
})

let _bypassObserver: MutationObserver | null = null

/**
 * Read a bypass attr's current value reactively.
 *
 * The returned value updates whenever the shared MutationObserver in
 * `installParityAttributeSync()` fires (i.e., whenever any of the 4
 * bypass attrs changes on `body.dataset`). Components use this inside
 * `$derived` to react to changes without running their own observer.
 *
 * Returns null when the attr is unset.
 */
export function getBypassAttr(key: BypassAttrKey): string | null {
    return _bypassSnapshot[key]
}

/**
 * Single-source writer for the `renderKind` bypass attr.
 *
 * Main.ts and engine-ready.svelte.ts both need to flip `data-render-kind`
 * (and its `render-kind-*` CSS class twin). Writing directly to
 * `body.dataset` triggers the parity MutationObserver async, so when both
 * writers race the observer may set `_bypassSnapshot.renderKind` to a stale
 * value — visible flicker or wrong initial CSS state.
 *
 * This helper writes to `body.dataset`, syncs the body CSS class, AND
 * updates `_bypassSnapshot` in the same synchronous tick so callers never
 * observe the racer's intermediate state.
 */
export function setRenderKind(value: string): void {
    if (typeof document === 'undefined' || !document.body) return
    document.body.dataset.renderKind = value
    _bypassSnapshot.renderKind = value
    for (const cls of Array.from(document.body.classList)) {
        if (cls.startsWith('render-kind-')) document.body.classList.remove(cls)
    }
    document.body.classList.add(`render-kind-${value}`)
}

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
// ── installParityAttributeSync helpers ────────────────────────────────────

/**
 * Tear down any previous parity sync state (effect root + bypass observer).
 */
function cleanupPreviousParityState(): void {
    if (_effectRoot) {
        _effectRoot()
        _effectRoot = null
    }
    if (_bypassObserver) {
        _bypassObserver.disconnect()
        _bypassObserver = null
    }
}

/**
 * Install the shared MutationObserver for bypass attrs (focusPanelMode,
 * insideWalkState, renderKind, mobileSearchSheet). Each component used
 * to run its own observer with its own attributeFilter — consolidating
 * here means N components → 1 observer + 4 fast property reads on
 * each fire. _bypassSnapshot is $state so consumers reading
 * getBypassAttr() inside `$derived` automatically re-run.
 */
function installBypassObserver(): void {
    const syncBypassSnapshot = (): void => {
        _bypassSnapshot.focusPanelMode = document.body.dataset.focusPanelMode ?? null
        _bypassSnapshot.insideWalkState = document.body.dataset.insideWalkState ?? null
        _bypassSnapshot.renderKind = document.body.dataset.renderKind ?? null
        _bypassSnapshot.mobileSearchSheet = document.body.dataset.mobileSearchSheet ?? null
    }
    syncBypassSnapshot()
    _bypassObserver = new MutationObserver(syncBypassSnapshot)
    _bypassObserver.observe(document.body, {
        attributes: true,
        attributeFilter: [
            'data-focus-panel-mode',
            'data-inside-walk-state',
            'data-render-kind',
            'data-mobile-search-sheet'
        ]
    })
}

/**
 * Create the reactive sync effect body: subscribes to all parity feeds,
 * recomputes + applies parity attributes on change via microtask coalescing.
 * Returns the inner disposer that unsubscribes all store subscriptions.
 */
function createParitySyncEffectBody(initialSync: boolean): () => void {
    let scheduled = false
    // Phase 1 timing-maze fix: the mirror's single timing layer is
    // queueMicrotask(syncNow). This gives Svelte 5 reactivity time to
    // settle (Object.assign(parityMap, map) triggers $derived/$effect
    // cascades that may call back into store mutators) before we write
    // to body.dataset.
    //
    // The CALLERS' timing workarounds (cursor.ts queueMicrotask,
    // setTimeout 50ms/250ms) have been removed — the mirror's microtask
    // is the single source of truth for body.dataset writes.
    //
    // `scheduled` is reset in `finally` to guarantee it's cleared even
    // when the snapshot short-circuit returns early. This prevents the
    // mirror from being permanently disabled by a JSON-equal snapshot.
    const syncNow = (): void => {
        try {
            const map = computeParityAttributes()

            // Mirror the computed map into the rune-backed `parityMap` so
            // Svelte 5 components that read `parityMap.x` inside a
            // reactive context (template, $derived, $effect) get auto-
            // re-runs. Object.assign triggers per-key reactivity so
            // components only re-run when their specific key changes.
            //
            // Done BEFORE the snapshot short-circuit so consumers see
            // parityMap updates even when the DOM write is skipped (e.g.,
            // when two consecutive snapshots are JSON-equal).
            Object.assign(parityMap, map)

            // Cheap short-circuit: same JSON snapshot means no DOM changes needed.
            const snapshot = JSON.stringify(map)
            if (snapshot === _lastSnapshot) return
            _lastSnapshot = snapshot

            applyParityAttributes(map)
        } finally {
            // Always reset scheduled, even on early return, so the next
            // external store change can trigger a fresh sync.
            scheduled = false
        }
    }
    const scheduleSync = (): void => {
        if (scheduled) return
        scheduled = true
        // Coalesce multiple store updates in the same tick to avoid
        // redundant recomputes (e.g., when navigation fires both
        // navStore and journeyStore). The microtask gives Svelte 5
        // reactivity time to settle before the body.dataset write.
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
    const unsubViewport = viewport.subscribe(scheduleSync)
    const unsubDemo = demoStore.subscribe(scheduleSync)
    const unsubCamera = cameraStore.subscribe(scheduleSync)
    const unsubLoadingPhase = loadingPhaseStore.subscribe(scheduleSync)
    const unsubGraphicsMode = graphicsModeStore.subscribe(scheduleSync)
    const unsubEngineReady = engineReady.subscribe(scheduleSync)

    // M1 reactivity gap: track appState rune changes (mobileRoutePeekActive /
    // mobileRoutePeekReason) that are NOT served by store subscriptions.
    // appState is a $state class instance (not a Svelte store), so bare
    // reads inside computeParityAttributes() do NOT trigger scheduleSync.
    // This $effect inside the $effect.root() scope establishes reactive
    // tracking on the appState runes so parity sync fires when they change.
    $effect(() => {
        // Read appState runes to establish reactive dependency — scheduleSync
        // runs when either field changes, triggering a parity recompute.
        const _active = appState.mobileRoutePeekActive
        const _reason = appState.mobileRoutePeekReason
        scheduleSync()
    })

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
}

// ── Orchestrator ───────────────────────────────────────────────────────────

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

    cleanupPreviousParityState()
    installBypassObserver()

    _effectRoot = $effect.root(() => createParitySyncEffectBody(initialSync))

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
