/**
 * @lib/orchestration/view-controller.ts — Galaxy ↔ Map view switching
 *
 * Port of:
 *
 * Handles view transitions between galaxy (3D mycelium) and map (Leaflet terrain),
 * including terrain preludes, handoff overlays, button state sync, and camera choreography.
 * Uses navStore from @lib/stores/navigation for all state mutations.
 */

import { get } from 'svelte/store'
import { navStore, updateNavState } from '@lib/stores/navigation.svelte.ts'
import { animateCameraToTerrainPrelude } from '@lib/engine/camera-controls'
import { applyMapFlatteningLayout } from '@lib/utils/map-flattening-layout'
import { publish, EVENTS } from '@lib/orchestration/event-bus'
import { DisposableRegistry } from '@lib/utils/disposable-registry'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ViewName = 'galaxy' | 'map'

export interface SwitchViewOptions {
    /** Skip terrain prelude animation when transitioning to map. */
    skipTerrainPrelude?: boolean
    /** Skip URL synchronization after view switch. */
    skipUrlSync?: boolean
    /** Silent handoff — suppresses the handoff overlay. */
    silentHandoff?: boolean
    /** Origin view for route layer handoff. */
    handoffFrom?: string
    /** History mode for URL sync: 'push' or 'replace'. */
    historyMode?: 'push' | 'replace'
    /** Skip the view handoff overlay entirely. */
    skipHandoff?: boolean
}

// ── Configuration ─────────────────────────────────────────────────────────────

const CONFIG = {
    MAP_HANDOFF_PRELUDE_MS: 430,
    VIEW_HANDOFF_OUT_MS: 1200,
    SHOW_VIEW_HANDOFF_DISMISS_MS: 2200,
    TERRAIN_LANDING_SETTLE_MS: 1200,
    TERRAIN_LANDING_SETTLE_LONG_MS: 1800
} as const

// ── Internal State ────────────────────────────────────────────────────────────

let _handoffDismissTimer: ReturnType<typeof setTimeout> | null = null
let _viewTransitionTimer: ReturnType<typeof setTimeout> | null = null
let _preludeTimer: ReturnType<typeof setTimeout> | null = null

// Module-level registry: tracks all one-shot DOM timers so teardownViewController()
// provides a safety-net disposeAll() in addition to the per-timer clearTimeout calls.
const vcRegistry = new DisposableRegistry({ label: 'view-controller' })

// Monotonically-increasing generation for the terrain-prelude timer. Each new
// _startTerrainPrelude (or any clear of _preludeTimer) bumps it so a timer
// callback that is ALREADY queued in the event loop cannot fire with stale
// closure state after the user cancelled or re-triggered the prelude.
let _preludeGeneration = 0
let _refreshCompositionState: () => void = () => {}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialize the view controller adapter with external dependencies.
 */
export function initViewControllerAdapter(opts: { refreshCompositionState?: () => void } = {}): void {
    if (typeof opts.refreshCompositionState === 'function') {
        _refreshCompositionState = opts.refreshCompositionState
    }
}

/**
 * Tear down the view controller. Clears all pending timers, resets handoff
 * state, removes the transitioning body class, and drops the composition
 * callback so HMR / unmount cannot fire orphaned timers.
 */
export function teardownViewController(): void {
    vcRegistry.disposeAll() // safety-net clear of all tracked timers
    if (_handoffDismissTimer !== null) {
        clearTimeout(_handoffDismissTimer)
        _handoffDismissTimer = null
    }
    if (_viewTransitionTimer !== null) {
        clearTimeout(_viewTransitionTimer)
        _viewTransitionTimer = null
    }
    if (_preludeTimer !== null) {
        clearTimeout(_preludeTimer)
        _preludeTimer = null
    }
    _preludeGeneration++ // invalidate any queued prelude callback

    _refreshCompositionState = () => {}

    document.body.classList.remove('view-transitioning')
    hideViewHandoff()
}

/**
 * Hide the view handoff overlay immediately.
 */
export function hideViewHandoff(): void {
    const handoff = document.getElementById('view-handoff')
    if (_handoffDismissTimer !== null) {
        clearTimeout(_handoffDismissTimer)
        _handoffDismissTimer = null
    }
    if (_preludeTimer !== null) {
        clearTimeout(_preludeTimer)
        _preludeTimer = null
    }
    _preludeGeneration++ // invalidate any queued prelude callback
    // body.dataset.viewHandoffActive is owned by parity-attrs.svelte.ts.
    if (!handoff) return
    handoff.classList.remove('active')
    handoff.setAttribute('aria-hidden', 'true')
}

/**
 * Show the view handoff overlay with icon/kicker/title/note from the handoff model.
 */
export function showViewHandoff(view: ViewName): void {
    const handoff = document.getElementById('view-handoff')
    if (!handoff) return

    const model = getViewHandoffModel(view)
    const runeEl = document.getElementById('view-handoff-rune')
    const kickerEl = document.getElementById('view-handoff-kicker')
    const titleEl = document.getElementById('view-handoff-title')
    const noteEl = document.getElementById('view-handoff-note')

    if (runeEl) {
        // Build the SVG rune via DOM API to avoid innerHTML. semanticGuideIcon
        // returns a <svg> string with escaped label/icon; we replicate the same
        // output via createElementNS to keep the DOM API invariant.
        const iconId = model.icon
        const label = view === 'map' ? 'Map view' : 'Network view'
        runeEl.replaceChildren()
        if (iconId) {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
            svg.classList.add('ui-icon')
            svg.setAttribute('aria-hidden', label ? 'false' : 'true')
            if (label) svg.setAttribute('aria-label', label)
            const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
            use.setAttribute('href', `#icon-${iconId}`)
            svg.appendChild(use)
            runeEl.appendChild(svg)
        }
    }
    if (kickerEl) kickerEl.textContent = model.kicker
    if (titleEl) titleEl.textContent = model.title
    if (noteEl) noteEl.textContent = model.note

    handoff.setAttribute('aria-hidden', 'false')
    handoff.classList.add('active')
    // body.dataset.viewHandoffActive is owned by parity-attrs.svelte.ts.

    if (_handoffDismissTimer !== null) {
        clearTimeout(_handoffDismissTimer)
        _handoffDismissTimer = null
    }
    _handoffDismissTimer = vcRegistry.schedule(CONFIG.SHOW_VIEW_HANDOFF_DISMISS_MS, () => {
        _handoffDismissTimer = null
        handoff.classList.remove('active')
        handoff.setAttribute('aria-hidden', 'true')
        // body.dataset.viewHandoffActive is owned by parity-attrs.svelte.ts.
    })
}

/**
 * Switch between galaxy and map view.
 *
 * Orchestrates:
 * - Terrain prelude animation (galaxy → map)
 * - Button active state sync
 * - Canvas/map container visibility
 * - Camera choreography
 * - URL sync
 * - Composition state refresh
 */
export function switchView(view: ViewName, options: SwitchViewOptions = {}): void {
    const $nav = get(navStore)
    const previousView = $nav.currentView

    // Counter-switch detected: the in-flight handoff overlay from the
    // previous prelude is now stale — cancel it immediately so the
    // wrong "switching to map" overlay doesn't linger during a
    // galaxy→galaxy or map→galaxy reverse switch.
    if (_viewTransitionTimer !== null) {
        clearTimeout(_viewTransitionTimer)
        _viewTransitionTimer = null
    }
    hideViewHandoff()

    // Terrain prelude: galaxy → map with animated flattening
    const shouldPreludeToMap =
        view === 'map' &&
        previousView === 'galaxy' &&
        !options.skipTerrainPrelude &&
        !options.skipUrlSync &&
        !options.silentHandoff

    if (shouldPreludeToMap) {
        _startTerrainPrelude(view, options, $nav)
        return
    }

    // Commit the view switch to the store
    updateNavState({ currentView: view })
    // body.dataset.viewMode / .activeView are owned by parity-attrs.ts.

    // Transition choreography class
    document.body.classList.add('view-transitioning')

    // Auto-remove transitioning class after animation
    if (_viewTransitionTimer !== null) {
        clearTimeout(_viewTransitionTimer)
        _viewTransitionTimer = null
    }
    _viewTransitionTimer = vcRegistry.schedule(CONFIG.VIEW_HANDOFF_OUT_MS, () => {
        _viewTransitionTimer = null
        const current = get(navStore).currentView
        if (current !== view) return // Guard against rapid switching
        document.body.classList.remove('view-transitioning')
    })

    // Map-specific setup
    if (view === 'map') {
        hideViewHandoff()
    }

    // Leaving galaxy: apply the map flattening layout
    if (view !== 'galaxy') {
        applyMapFlatteningLayout(true)
    } else {
        applyMapFlatteningLayout(false)
    }

    // Container visibility
    _syncContainerVisibility(view)

    // URL sync
    if (!options.skipUrlSync) {
        _requestUrlSync('view')
    }

    // Composition + handoff
    _refreshCompositionState()
    if (!options.silentHandoff) {
        showViewHandoff(view)
    } else if (view === 'map') {
        hideViewHandoff()
    }
}

// ── Internal Helpers ──────────────────────────────────────────────────────────

function _startTerrainPrelude(_view: ViewName, options: SwitchViewOptions, _nav: ReturnType<typeof get>): void {
    // Show the handoff overlay
    showViewHandoff('map')
    animateCameraToTerrainPrelude({ duration: CONFIG.MAP_HANDOFF_PRELUDE_MS })

    if (_preludeTimer !== null) {
        clearTimeout(_preludeTimer)
        _preludeTimer = null
    }
    const generation = ++_preludeGeneration
    _preludeTimer = vcRegistry.schedule(CONFIG.MAP_HANDOFF_PRELUDE_MS, () => {
        _preludeTimer = null
        // Guard against a stale callback: if a counter-switch happened after this
        // timer was armed (or it was cleared and re-armed), the generation moved
        // on and this closure must not drive a view switch.
        if (generation !== _preludeGeneration) return
        const current = get(navStore).currentView
        if (current !== 'galaxy') return
        switchView('map', {
            ...options,
            skipTerrainPrelude: true,
            handoffFrom: options.handoffFrom
        })
    })
}

function _syncContainerVisibility(view: ViewName): void {
    const canvasContainer = document.getElementById('canvas-container')

    if (view === 'galaxy') {
        if (canvasContainer) canvasContainer.classList.remove('hidden')
    } else {
        if (canvasContainer) canvasContainer.classList.add('hidden')
    }
}

function _requestUrlSync(reason: string): void {
    publish(EVENTS.URL_SYNC_REQUESTED, {
        params: {},
        mode: 'push',
        reason
    })
}

// ── Handoff Model ─────────────────────────────────────────────────────────────

interface HandoffModel {
    icon: string
    kicker: string
    title: string
    note: string
}

/**
 * Returns the handoff overlay content model for the target view.
 */
export function getViewHandoffModel(view: ViewName): HandoffModel {
    if (view === 'map') {
        return {
            icon: 'map',
            kicker: 'Switching views',
            title: 'Entering map view',
            note: 'Geographic terrain is loading.'
        }
    }
    return {
        icon: 'mycelium',
        kicker: 'Switching views',
        title: 'Returning to the Network',
        note: 'Network view is restoring.'
    }
}

// semanticGuideIcon is imported from @lib/journey/semantic-guide (uses SVG sprite <use href>)
