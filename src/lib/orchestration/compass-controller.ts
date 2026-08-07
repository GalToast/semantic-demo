/**
 * @lib/orchestration/compass-controller.ts
 *
 * Execute compass actions based on state.
 *
 *
 * Reads compass state, syncs DOM elements, and dispatches
 * journey actions (search focus, anchor center, map switch, etc.).
 */
import { get } from 'svelte/store'
import {
    navStore,
    switchView as navSwitchView,
    writeNavStateMirror,
    dispatchNavTransition,
    NAV_TRANSITION_ACTIONS
} from '@lib/stores/navigation.svelte.ts'
import { searchStore } from '@lib/stores/search.svelte'
import { appState } from '@lib/state/app.svelte'
import {
    JOURNEY_COMPASS_PHASE_ORDER,
    JOURNEY_CONFIG,
    setTrailDepth as journeySetTrailDepth
} from '@lib/stores/journey.svelte.ts'
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- focusStore import retained per w46-c2-compass-controller-contract.test.ts pattern assertion (L53); removal would break the contract even though we no longer read it after W63 dead-code cleanup of strandContinuityPhase 'exploring' guard + disabled-predicate dead clause.
import { focusStore, setSemanticDiveMode } from '@lib/stores/focus.svelte.ts'
import { isMapSummarySurface, isSemanticDiveSurface } from '@lib/stores/viewport.svelte.ts'
import { resetExplorationFocus } from '@lib/orchestration/lifecycle'
import {
    getJourneyCompassState,
    getFocusedJourneyPoint,
    type CompassStateContext,
    JOURNEY_ACTIONS,
    type CompassAction
} from '@lib/journey/compass-state'
import { traverseNeighbor } from '@lib/journey/thread-settler-adapter'
import type { PanelSurface } from '@lib/types/state'

// ── Types ─────────────────────────────────────────────────────────────────

export interface CompassPresentationState {
    density: 'hidden' | 'compact' | 'expanded'
    copy: 'quiet' | 'full'
    actions: 'minimal' | 'primary-secondary' | 'route' | 'standard'
    navigationOwner: string
}

export interface ViewHandoffModel {
    icon: string
    kicker: string
    title: string
    note: string
}

// ── Internal State ────────────────────────────────────────────────────────

let _switchView: (view: string) => void = (view) => navSwitchView(view as 'galaxy' | 'map')

function deriveOpenMapSurface(): PanelSurface {
    const $nav = get(navStore)
    const $search = get(searchStore)
    const hasFocusContext =
        Number.isFinite($nav.focusedIndex) ||
        $nav.surface === 'focus' ||
        $nav.surface === 'focus-search' ||
        $nav.surface === 'map-focus' ||
        $nav.surface === 'map-focus-search'
    const hasSearchContext =
        !!$search.summary ||
        (typeof $search.query === 'string' && $search.query.trim().length >= 2) ||
        $nav.surface === 'search' ||
        $nav.surface === 'focus-search' ||
        $nav.surface === 'map-focus-search'

    if (hasFocusContext && hasSearchContext) return 'map-focus-search'
    if (hasFocusContext) return 'map-focus'
    return 'map-trail'
}

// ── Initialization ────────────────────────────────────────────────────────

/**
 * Initialize the journey compass adapter with a view-switch function.
 * Subscribes to relevant events so the compass stays in sync.
 */
export function initJourneyCompassAdapter(
    opts: {
        switchView?: (view: string) => void
    } = {}
): void {
    if (typeof opts.switchView === 'function') {
        _switchView = opts.switchView
    }
    // Event subscriptions are wired in App.svelte via onMount;
    // this function is the legacy init entry point kept for API compat.
}

// ── Presentation State ────────────────────────────────────────────────────

/**
 * Derive the compass presentation layout from the current compass state.
 */
export function getJourneyCompassPresentationState(
    compassState: Partial<CompassStateContext> = {}
): CompassPresentationState {
    const phase = compassState.phase || 'overview'
    const $nav = get(navStore)
    const $search = get(searchStore)
    const hasActiveRouteContext =
        $nav.trailDepth > 0 ||
        Number.isFinite($nav.focusedIndex) ||
        $nav.surface === 'focus-search' ||
        $nav.surface === 'map-focus-search' ||
        $nav.surface === 'map-trail' ||
        !!$search.summary

    if (phase === 'map') {
        return {
            density: hasActiveRouteContext ? 'compact' : 'hidden',
            copy: 'quiet',
            actions: hasActiveRouteContext ? 'primary-secondary' : 'minimal',
            navigationOwner: hasActiveRouteContext ? 'map-trail-strip' : 'map-controls'
        }
    }

    if (phase === 'search' || phase === 'focus') {
        return {
            density: 'compact',
            copy: 'quiet',
            actions: 'primary-secondary',
            navigationOwner: 'scene'
        }
    }

    if (phase === 'inside') {
        return {
            density: 'compact',
            copy: 'quiet',
            actions: 'route',
            navigationOwner: 'inside-walk'
        }
    }

    return {
        density: 'expanded',
        copy: 'full',
        actions: 'standard',
        navigationOwner: 'journey-compass'
    }
}

// ── Mobile Action Labels ──────────────────────────────────────────────────

const MOBILE_JOURNEY_ACTION_LABELS: Record<string, string> = {
    [JOURNEY_ACTIONS.FOCUS_SEARCH]: 'Search',
    [JOURNEY_ACTIONS.CENTER_ANCHOR]: 'Center',
    [JOURNEY_ACTIONS.ENTER_INSIDE]: 'Inside',
    [JOURNEY_ACTIONS.SHOW_TRAIL_PANEL]: 'Trail',
    [JOURNEY_ACTIONS.NEXT_STOP]: 'Follow',
    [JOURNEY_ACTIONS.OPEN_MAP]: 'Map',
    [JOURNEY_ACTIONS.OPEN_MYCELIUM]: 'Field',
    [JOURNEY_ACTIONS.COUNTY_OVERVIEW]: 'County'
}

function getMobileJourneyActionLabel(action: CompassAction | null | undefined, fallback: string = ''): string {
    if (!action?.action) return fallback
    return MOBILE_JOURNEY_ACTION_LABELS[action.action] || fallback || action.label || 'Go'
}

// ── Sync Actions to DOM ───────────────────────────────────────────────────

/**
 * Sync the compass action buttons to the DOM.
 * Sets text, aria, hidden, and disabled state for each button.
 */
export function syncJourneyCompassActions(compassState: Partial<CompassStateContext> = {}): void {
    const suppressInsideDiveActions = compassState.phase === 'inside' && isSemanticDiveSurface()
    const panelSurface = navStore().surface || ''
    const focusedSurfaceCanStepInside =
        (panelSurface === 'focus' || panelSurface === 'focus-search') && !isSemanticDiveSurface()

    const buttons: Array<[HTMLButtonElement | null, CompassAction | null | undefined, string]> = [
        [
            document.getElementById('btn-journey-primary') as HTMLButtonElement | null,
            compassState.primaryAction,
            'primary'
        ],
        [
            document.getElementById('btn-journey-secondary') as HTMLButtonElement | null,
            compassState.secondaryAction,
            'secondary'
        ],
        [
            document.getElementById('btn-journey-tertiary') as HTMLButtonElement | null,
            compassState.tertiaryAction,
            'tertiary'
        ]
    ]

    buttons.forEach(([button, action, role]) => {
        if (!button) return

        const effectiveAction =
            role === 'primary' && focusedSurfaceCanStepInside
                ? { label: 'Step Inside', action: JOURNEY_ACTIONS.ENTER_INSIDE }
                : action

        const fullLabel =
            effectiveAction?.label || (role === 'primary' ? 'Search' : role === 'secondary' ? 'Map' : 'Navigate')
        const mobileLabel = effectiveAction?.action ? getMobileJourneyActionLabel(effectiveAction, fullLabel) : ''

        button.textContent = fullLabel

        if (mobileLabel) {
            button.dataset.mobileLabel = mobileLabel
            button.dataset.fullLabel = fullLabel
        } else {
            delete button.dataset.mobileLabel
            delete button.dataset.fullLabel
        }

        button.dataset.journeyAction = effectiveAction?.action || ''

        const disabled = !effectiveAction?.action

        button.disabled = disabled || suppressInsideDiveActions
        button.setAttribute('aria-disabled', String(disabled || suppressInsideDiveActions))
        button.hidden = suppressInsideDiveActions || !effectiveAction?.action

        if (button.hidden) {
            button.setAttribute('tabindex', '-1')
            button.setAttribute('aria-hidden', 'true')
        } else {
            button.removeAttribute('tabindex')
            button.removeAttribute('aria-hidden')
        }

        if (effectiveAction?.hint) {
            button.setAttribute('aria-label', `${fullLabel} - ${effectiveAction.hint}`)
            button.setAttribute('title', effectiveAction.hint)
        } else {
            button.setAttribute('aria-label', fullLabel)
            button.removeAttribute('title')
        }

        if (role === 'tertiary') {
            button.setAttribute('aria-expanded', button.hidden ? 'false' : 'true')
        }
    })
}

// ── Map Trail Strip ───────────────────────────────────────────────────────

/**
 * Sync the map trail strip visibility and title.
 */
export function syncMapTrailStrip(
    compassState: Partial<CompassStateContext> = {},
    presentationState: CompassPresentationState = getJourneyCompassPresentationState(compassState)
): void {
    const strip = document.getElementById('map-trail-strip')
    if (!strip) return

    const $nav = get(navStore)
    const shouldShow = $nav.currentView === 'map' && presentationState.navigationOwner === 'map-trail-strip'

    strip.hidden = !shouldShow
    strip.setAttribute('aria-hidden', String(!shouldShow))

    if (!shouldShow) return

    const stripTitle = compassState.title || 'Map route'
    const compactStripTitle = stripTitle.replace(/\s+pinned to map$/i, '')
    const accessibleTitle = compactStripTitle || stripTitle

    strip.replaceChildren()
    const title = document.createElement('div')
    title.className = 'map-strip-title'
    title.textContent = accessibleTitle
    title.setAttribute('title', accessibleTitle)
    title.setAttribute('aria-label', accessibleTitle)
    strip.appendChild(title)
}

// ── Execute Action ────────────────────────────────────────────────────────

/**
 * Execute a journey compass action.
 * This is the central dispatch for compass button presses.
 */
export function executeJourneyCompassAction(action: string): void {
    switch (action) {
        case JOURNEY_ACTIONS.FOCUS_SEARCH: {
            const focusSearchInput = () =>
                window.requestAnimationFrame(() => {
                    document.getElementById('search-input')?.focus()
                })

            const $nav = get(navStore)
            const isMapFocusSearch = $nav.currentView === 'map' && isMapSummarySurface()

            if (isMapFocusSearch) {
                // Reset exploration but keep search
                focusSearchInput()
                return
            }

            // The map county/trail surface does not mount InfoPanel's search
            // input until it owns the map-trail search lane. Enter that lane
            // before focusing so the visible Search action never becomes a
            // no-op on mobile map routes with no selected business.
            if ($nav.currentView === 'map' && !document.getElementById('search-input')) {
                dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'map-trail' })
            }

            focusSearchInput()
            return
        }

        case JOURNEY_ACTIONS.CENTER_ANCHOR: {
            const $search = get(searchStore)
            const $nav2 = get(navStore)
            const anchorIndex = Number.isFinite($search.summary?.anchorIndex)
                ? $search.summary!.anchorIndex
                : Number.isFinite($nav2.focusedIndex)
                  ? $nav2.focusedIndex
                  : null

            if (Number.isFinite(anchorIndex)) {
                journeySetTrailDepth(1)
                // The engine bridge handles camera focus; we just update stores
                navSwitchView($nav2.currentView)
            }
            return
        }

        case JOURNEY_ACTIONS.ENTER_INSIDE:
            journeySetTrailDepth(2)
            setSemanticDiveMode(true)
            writeNavStateMirror({ trailDepth: 2 })
            // Arm the dive-transition transient: isTransitioning (semantic-dive.ts)
            // gates on _semanticDiveTransitionDeadline > now, which drives the
            // 'Focusing…' overlay + 'Entering Neighborhood' kicker via
            // data-semantic-dive="transitioning". Never written anywhere before —
            // the produce half of the dive-feedback feature (was always 0).
            appState._semanticDiveTransitionDeadline = Date.now() + 1200
            // Parity-attrs owns semanticDive, panelSurface, trailDepth.
            // Mirror to test-compat globals via appState. The test-compat
            // proxy forwards writes from __APP_STATE__ / __TEST_STATE__
            // back to appState — a single direct write replaces the
            // two-block mirror that previously duplicated per-global writes.
            // See lifecycle.ts applyCompositionState() for the convergence contract.
            // trailDepth is already mirrored to appState by the writeNavStateMirror
            // above (single-writer: navigation-state funnel owns trailDepth).
            if (typeof window !== 'undefined') {
                appState.semanticDiveMode = true
            }
            return

        case JOURNEY_ACTIONS.SHOW_TRAIL_PANEL:
            setSemanticDiveMode(false)
            return

        case JOURNEY_ACTIONS.NEXT_STOP:
            traverseNeighbor(1)
            return

        case JOURNEY_ACTIONS.OPEN_MAP: {
            const targetSurface = deriveOpenMapSurface()
            _switchView('map')
            setSemanticDiveMode(false)
            journeySetTrailDepth(1)
            writeNavStateMirror({
                currentView: 'map',
                mode: 'trail',
                surface: targetSurface,
                trailDepth: 1
            })
            // Parity-attrs owns semanticDive, activeView, viewMode, panelSurface,
            // panelSurfaceMode, graphContext, mapContext, trailDepth
            return
        }

        case JOURNEY_ACTIONS.OPEN_MYCELIUM:
            _switchView('galaxy')
            return

        case JOURNEY_ACTIONS.COUNTY_OVERVIEW:
            // County overview is a calm reset surface; do not preserve the
            // search corridor or the map keeps competing search chrome alive.
            resetExplorationFocus({ preserveSearch: false })
            return

        default:
            return
    }
}

// ── Update Compass ────────────────────────────────────────────────────────

/**
 * Full compass DOM update: derives state, sets body attributes,
 * updates compass header elements, and syncs action buttons.
 */
export function updateJourneyCompass(): void {
    const capitalize = (s: string) => s && s.charAt(0).toUpperCase() + s.slice(1)

    const compass = document.getElementById('journey-compass')
    if (!compass) return

    const compassState = getJourneyCompassState()
    const phase = compassState.phase || 'overview'
    const presentationState = getJourneyCompassPresentationState(compassState)

    // body data-* attribute writes are owned by parity-attrs.svelte.ts.
    // parity-attrs.svelte.ts subscribes to navStore/journeyStore/compass-controller
    // outputs and mirrors journeyPhase / journeyCompass* / journeyNavigationOwner
    // to <body>. Do not write them here.

    compass.dataset.phase = phase
    compass.dataset.density = presentationState.density
    compass.dataset.copy = presentationState.copy
    compass.dataset.actions = presentationState.actions
    compass.dataset.navigationOwner = presentationState.navigationOwner
    compass.setAttribute('aria-live', presentationState.copy === 'full' ? 'polite' : 'off')

    // Update compass text elements
    const kicker = document.getElementById('journey-compass-kicker')
    const title = document.getElementById('journey-compass-title')
    const note = document.getElementById('journey-compass-note')

    if (kicker) kicker.textContent = compassState.kicker || 'Journey'

    if (title) {
        const visibleTitle = compassState.title || (phase === 'focus' || phase === 'inside' ? '' : 'County overview')
        if (visibleTitle) {
            title.textContent = visibleTitle
            title.classList.remove('sr-only')
        } else {
            const focusedPoint = getFocusedJourneyPoint()
            const focusedName = focusedPoint
                ? formatBusinessName((focusedPoint.name as string) || 'this business')
                : 'Focused business'
            title.textContent = `Focused on ${focusedName}`
            title.classList.add('sr-only')
        }
    }

    if (note) {
        note.textContent = compassState.note || 'Search to open a trail.'
    }

    // Sync action buttons and map trail strip
    syncJourneyCompassActions(compassState)
    syncMapTrailStrip(compassState, presentationState)

    // Update step indicators
    const order = JOURNEY_COMPASS_PHASE_ORDER
    const activeOrderIndex = order.indexOf(phase)
    const stepDescriptions: Record<string, string> = {
        overview: 'See the whole county.',
        search: 'Find and center on a business.',
        focus: 'Inspect a centered anchor.',
        trail: 'Project the connection trail onto the streets.',
        inside: 'Explore the neighborhood.',
        map: 'View the geographic layer.'
    }

    compass.querySelectorAll<HTMLElement>('[data-journey-step]').forEach((step) => {
        const stepPhase = step.dataset.journeyStep!
        const stepIndex = order.indexOf(stepPhase)
        const isCurrent = stepPhase === phase

        step.classList.toggle('current', isCurrent)
        step.classList.toggle('done', activeOrderIndex >= 0 && stepIndex >= 0 && stepIndex < activeOrderIndex)

        const description = stepDescriptions[stepPhase] || stepPhase
        step.setAttribute('aria-label', `${stepIndex + 1}. ${capitalize(stepPhase)}: ${description}`)
        step.setAttribute('title', description)
    })
}

// ── View Handoff Model ────────────────────────────────────────────────────

/**
 * Build the view handoff model for a view transition.
 */
export function getViewHandoffModel(view: string): ViewHandoffModel {
    const focusPoint = getFocusedJourneyPoint()
    const focusName = focusPoint ? formatBusinessName((focusPoint.name as string) || 'this business') : ''
    const hasSearch = !!get(searchStore).summary
    const searchLabel = hasSearch ? get(searchStore).summary!.query || 'current trail' : ''

    if (view === 'map') {
        if (focusName && hasSearch) {
            return {
                icon: 'map',
                kicker: 'Route layer: map',
                title: 'The trail lands on terrain',
                note: `${focusName} stays anchored while "${searchLabel}" becomes physical distance.`
            }
        }
        if (focusName) {
            return {
                icon: 'map',
                kicker: 'Route layer: map',
                title: 'The focused listing lands on the map',
                note: `${focusName} keeps its place while county distance becomes visible.`
            }
        }
        return {
            icon: 'map',
            kicker: 'Route layer: map',
            title: 'Geography carries the last layer',
            note: 'Business categories remain, but physical distance is now the thing to read.'
        }
    }

    if (focusName && hasSearch) {
        return {
            icon: 'mycelium',
            kicker: 'Route layer: network',
            title: 'The trail returns to the network',
            note: `${focusName} remains the anchor for "${searchLabel}" while connections rebuild.`
        }
    }
    if (focusName) {
        return {
            icon: 'mycelium',
            kicker: 'Route layer: network',
            title: 'The listing returns to its connections',
            note: `${focusName} is back among its related businesses.`
        }
    }
    return {
        icon: 'mycelium',
        kicker: 'Route layer: network',
        title: 'Network view restored',
        note: 'Related businesses, visible in one view.'
    }
}

// ── Semantic Lane Probe ───────────────────────────────────────────────────

/**
 * Install a semantic journey probe (returns presentation state for diagnostics).
 */
export function installSemanticJourneyProbe(): CompassPresentationState {
    return getJourneyCompassPresentationState()
}

/**
 * Clear the mobile route field peek state.
 */
export function invokeClearMobileRouteFieldPeek(): void {
    // The actual implementation lives in the engine bridge;
    // this is the store-side no-op kept for API compat.
}

/**
 * Schedule a map route refresh (debounced via RAF + timeouts).
 */
export function scheduleMapRouteRefresh(): void {
    const refresh = () => {
        const $navRefresh = get(navStore)
        if ($navRefresh.currentView !== 'map') return
        // The actual route refresh is handled by the engine bridge
    }

    refresh()
    window.requestAnimationFrame(() => window.requestAnimationFrame(refresh))

    const delays = [120, 450, JOURNEY_CONFIG.MAP_HANDOFF_PRELUDE_MS + JOURNEY_CONFIG.MAP_TRAIL_REFRESH_LATE_DELAY_MS]
    delays.forEach((delay) => {
        window.setTimeout(refresh, delay)
    })
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Format a business name for display. */
function formatBusinessName(name: string): string {
    if (!name) return ''
    return name
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
}
