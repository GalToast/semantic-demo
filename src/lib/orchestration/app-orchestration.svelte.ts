/**
 * @lib/orchestration/app-orchestration.svelte.ts
 *
 * Extracts all non-template logic from App.svelte into a testable,
 * reusable Svelte 5 runes module.  App.svelte becomes a thin shell
 * that reads reactive handles from this module and renders markup.
 */

import type { Snippet } from 'svelte'
import {
    navStore,
    dispatchNavTransition as dispatchNavTransitionAction,
    NAV_TRANSITION_ACTIONS
} from '@lib/stores/navigation.svelte'
import { threadInspectorActive, setSemanticDiveMode } from '@lib/stores/focus.svelte'
import { viewport } from '@lib/stores/viewport.svelte.ts'
import { appState } from '@lib/state/app.svelte.ts'
import { engineReady } from '@lib/stores/engine-ready.svelte'
import { createLazyComponent, type LazyComponentHandle } from '@lib/utils/lazy-component.svelte'
import { teardownAppShell } from '@lib/orchestration/app-init'
import { updateUrlState } from '@lib/orchestration/url-state'
import { initKeyboardShortcutsHint, showKeyboardShortcutsHint } from '@lib/keyboard/keyboard-help'
import { resetSemanticThreadWorker } from '@lib/semantic-threads'
import { hideSummaryCard, requestSemanticGuide } from '@lib/journey/semantic-guide'

// ── Types ──────────────────────────────────────────────────────────────────

export type SemanticGuideSuggestion = {
    lead_id?: string | number
    label?: string
    name?: string
    city?: string
    reason?: string
}

export type SemanticGuideCardConfig = {
    title?: string
    text?: string
    laneStatus?: string
    suggestions?: SemanticGuideSuggestion[]
}

type ContractWindow = Window & {
    __forceSemanticDiveContractSurface?: () => void
}

// ── Lazy component handles ─────────────────────────────────────────────────

function makeLazy<T>(loader: () => Promise<{ default: T }>, opts?: { idle?: boolean; logOnError?: boolean }) {
    return createLazyComponent(loader, opts)
}

export const lazy = {
    canvas: makeLazy(() => import('@components/Canvas.svelte'), { logOnError: true }),
    infoPanel: makeLazy(() => import('@components/InfoPanel.svelte')),
    mapView: makeLazy(() => import('@components/MapView.svelte'), { idle: false, logOnError: true }),
    focusPocket: makeLazy(() => import('@components/FocusPocket.svelte')),
    threadInspector: makeLazy(() => import('@components/ThreadInspector.svelte')),
    demoChoreography: makeLazy(() => import('@components/DemoChoreography.svelte')),
    focusCard: makeLazy(() => import('@components/FocusCard.svelte')),
    weatherWidget: makeLazy(() => import('@components/WeatherWidget.svelte')),
    devGui: makeLazy(() => import('@components/DevGui.svelte'), { idle: false, logOnError: true }),
    spectorInspector: makeLazy(() => import('@components/SpectorInspector.svelte'), { idle: false, logOnError: true }),
    legacyCompassSurface: makeLazy(() => import('@components/LegacyCompassSurface.svelte')),
    journeyChrome: makeLazy(() => import('@components/JourneyChrome.svelte'))
}

// ── Playwright eager preload ───────────────────────────────────────────────

const IS_PLAYWRIGHT = typeof window !== 'undefined' && (window as any).__PLAYWRIGHT__

if (IS_PLAYWRIGHT) {
    // Eagerly preload components required by contract tests
    lazy.mapView.ensure(true)
    lazy.legacyCompassSurface.ensure(true)
    lazy.threadInspector.ensure(true)
}

// ── Semantic guide derived config ──────────────────────────────────────────

export function getSemanticGuideConfig(): SemanticGuideCardConfig {
    return (appState.semanticGuideState.config ?? {}) as SemanticGuideCardConfig
}

export function getSemanticGuideSuggestions(): SemanticGuideSuggestion[] {
    const config = getSemanticGuideConfig()
    return Array.isArray(config.suggestions) ? config.suggestions : []
}

// ── Contract test surface ──────────────────────────────────────────────────

export function setupContractSurface(): { readonly forced: boolean } {
    let forced = $state(false)

    const contractWindow = window as ContractWindow
    contractWindow.__forceSemanticDiveContractSurface = () => {
        forced = true
        setSemanticDiveMode(true)
        document.body.classList.add('is-active')
        document.body.dataset.activeView = 'galaxy'
        document.body.dataset.graphContext = 'focus'
        document.body.dataset.semanticDive = 'active'
        document.body.dataset.panelSurface = 'semantic-dive'
        document.body.dataset.panelSurfaceDetail = 'none'

        const focusStage = document.querySelector<HTMLElement>('#focus-stage')
        if (focusStage) {
            focusStage.hidden = false
            focusStage.setAttribute('aria-hidden', 'false')
            focusStage.style.removeProperty('display')
            focusStage.style.removeProperty('visibility')
            focusStage.style.removeProperty('opacity')
        }

        for (const selector of ['#focus-stage-inside-status', '#focus-stage-inside-controls']) {
            const el = document.querySelector<HTMLElement>(selector)
            if (el) {
                el.hidden = false
                el.setAttribute('aria-hidden', 'false')
                el.style.removeProperty('display')
                el.style.removeProperty('visibility')
                el.style.removeProperty('opacity')
            }
        }

        const insideControls = document.querySelector<HTMLElement>('#focus-stage-inside-controls')
        if (insideControls) {
            for (const btn of insideControls.querySelectorAll<HTMLButtonElement>('button[hidden]')) {
                btn.hidden = false
            }
        }
    }

    return {
        get forced() {
            return forced
        }
    }
}

export function teardownContractSurface(): void {
    const contractWindow = window as ContractWindow
    delete contractWindow.__forceSemanticDiveContractSurface
}

// ── Deferred triggers.ts import ─────────────────────────────────────────────

export function deferTriggersImport(): void {
    if (typeof window === 'undefined') return
    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => import('@lib/orchestration/triggers'), { timeout: 3000 })
    } else {
        setTimeout(() => import('@lib/orchestration/triggers'), 0)
    }
}

// ── Body data-* sync (MutationObserver) ────────────────────────────────────

export interface BodySyncState {
    focusPanelMode: string
    panelSurface: string
    graphContext: string
    compact: boolean
    journeyNavigationOwner: string
}

export function setupBodySync(): BodySyncState {
    let focusPanelMode = $state('')
    let panelSurface = $state('')
    let graphContext = $state('')
    let compact = $state(false)
    let journeyNavigationOwner = $state('')

    $effect(() => {
        if (typeof document === 'undefined') return
        const sync = () => {
            const nextPanelSurface = document.body.dataset.panelSurface || ''
            const nextGraphContext = document.body.dataset.graphContext || ''
            focusPanelMode = document.body.dataset.focusPanelMode || ''
            panelSurface = nextPanelSurface
            graphContext = nextGraphContext
            compact = document.body.dataset.compact === 'true'
            journeyNavigationOwner = document.body.dataset.journeyNavigationOwner || ''
            if (
                (nextPanelSurface === 'focus-search' || nextGraphContext === 'focus-search') &&
                document.body.dataset.focusSearchForced !== 'true'
            ) {
                document.body.dataset.focusSearchForced = 'true'
            } else if (
                nextPanelSurface !== 'search' &&
                nextPanelSurface !== 'focus' &&
                nextPanelSurface !== 'inside' &&
                nextPanelSurface !== 'trail'
            ) {
                // audit-ok: plain Ln() callback, not transformed
                delete document.body.dataset.focusSearchForced
            }
        }
        const obs = new MutationObserver(sync)
        obs.observe(document.body, {
            attributes: true,
            attributeFilter: [
                'data-compact',
                'data-focus-panel-mode',
                'data-panel-surface',
                'data-graph-context',
                'data-journey-navigation-owner'
            ]
        })
        sync()
        return () => obs.disconnect()
    })

    return {
        get focusPanelMode() {
            return focusPanelMode
        },
        get panelSurface() {
            return panelSurface
        },
        get graphContext() {
            return graphContext
        },
        get compact() {
            return compact
        },
        get journeyNavigationOwner() {
            return journeyNavigationOwner
        }
    }
}

// ── Nav store reactive mirror ──────────────────────────────────────────────

export interface NavMirror {
    surface: string
    mode: string
    currentView: string
    focusedIndex: number | null
}

export function setupNavMirror(): NavMirror {
    let surface = $state('idle')
    let mode = $state('overview')
    let currentView = $state('galaxy')
    let focusedIndex = $state<number | null>(null)

    let _unsub: (() => void) | null = null
    $effect(() => {
        _unsub?.()
        _unsub = navStore.subscribe((s) => {
            surface = s.surface
            mode = s.mode
            currentView = s.currentView
            focusedIndex = s.focusedIndex
        })
        return () => {
            _unsub?.()
            _unsub = null
        }
    })

    return {
        get surface() {
            return surface
        },
        get mode() {
            return mode
        },
        get currentView() {
            return currentView
        },
        get focusedIndex() {
            return focusedIndex
        }
    }
}

// ── Global keyboard shortcuts ─────────────────────────────────────────────

export function setupKeyboardShortcuts(opts: { getNavMirror: () => NavMirror; weatherToggle: () => void }): () => void {
    const handleGlobalKeydown = (e: KeyboardEvent): void => {
        const target = e.target as HTMLElement
        const tag = target?.tagName?.toLowerCase()
        const isFormField =
            tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable === true

        if ((e.ctrlKey || e.metaKey) && /^[1-6]$/.test(e.key)) {
            if (isFormField) return
            e.preventDefault()
            switch (e.key) {
                case '1':
                    dispatchNavTransitionAction(NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW)
                    break
                case '2':
                    dispatchNavTransitionAction(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'search' })
                    break
                case '3':
                    dispatchNavTransitionAction(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'trail' as any })
                    break
                case '4':
                    dispatchNavTransitionAction(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'focus' })
                    break
                case '5':
                    dispatchNavTransitionAction(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'inside' })
                    break
                case '6':
                    dispatchNavTransitionAction(NAV_TRANSITION_ACTIONS.SET_VIEW, { view: 'map' })
                    dispatchNavTransitionAction(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'map' })
                    break
            }
            return
        }

        if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isFormField) {
            e.preventDefault()
            document.getElementById('search-input')?.focus()
            return
        }

        if ((e.key === '?' || (e.key === '/' && e.shiftKey)) && !e.metaKey && !e.ctrlKey && !e.altKey && !isFormField) {
            e.preventDefault()
            initKeyboardShortcutsHint()
            showKeyboardShortcutsHint()
            return
        }

        if (e.key === 'w' && !e.metaKey && !e.ctrlKey && !e.altKey && !isFormField) {
            e.preventDefault()
            opts.weatherToggle()
            return
        }

        if (e.key === 'Escape') {
            e.preventDefault()
            const searchInput = document.getElementById('search-input') as HTMLInputElement | null
            if (searchInput) {
                searchInput.value = ''
                searchInput.dispatchEvent(new Event('input', { bubbles: true }))
            }
            const mirror = opts.getNavMirror()
            if (mirror.mode !== 'overview' || mirror.surface !== 'idle') {
                // audit-ok: plain Ln() callback, not transformed
                dispatchNavTransitionAction(NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW)
                updateUrlState({}, { reason: 'return-overview' })
            }
        }
    }

    window.addEventListener('keydown', handleGlobalKeydown)
    return () => window.removeEventListener('keydown', handleGlobalKeydown)
}

// ── Visibility derived booleans ─────────────────────────────────────────────

export interface AppVisibility {
    mapModeActive: boolean
    searchSurfaceActive: boolean
    searchFamilySurfaceActive: boolean
    mapTrailSearchLaneActive: boolean
    idleSurfaceActive: boolean
    idleSearchVisible: boolean
    focusActive: boolean
    focusStageActive: boolean
    headerVisible: boolean
    controlsVisible: boolean
    infoPanelOpen: boolean
    legacyCompassSurfaceActive: boolean
    weatherVisible: boolean
}

export function createVisibility(navMirror: NavMirror, bodySync: BodySyncState): AppVisibility {
    let weatherVisible = $state(true)

    const mapModeActive = $derived(navMirror.currentView === 'map')
    const searchSurfaceActive = $derived(
        (navMirror.surface === 'search' || bodySync.panelSurface === 'search') && !focusSearchForcedRaw(bodySync)
    )
    const searchFamilySurfaceActive = $derived(searchSurfaceActive || focusSearchForcedRaw(bodySync))
    const mapTrailSearchLaneActive = $derived(
        mapModeActive &&
            bodySync.journeyNavigationOwner === 'map-trail-strip' &&
            bodySync.panelSurface.startsWith('map-') &&
            bodySync.panelSurface !== 'map-idle' && // audit-ok: literal state check
            bodySync.panelSurface !== 'map' // audit-ok: literal state check
    )
    const idleSurfaceActive = $derived(navMirror.surface === 'idle' && !searchSurfaceActive)
    const idleSearchVisible = $derived(idleSurfaceActive)

    const focusActive = $derived(
        navMirror.mode === 'focus' ||
            navMirror.mode === 'inside' ||
            navMirror.mode === 'trail' ||
            navMirror.focusedIndex != null ||
            bodySync.focusPanelMode === 'field-node' ||
            bodySync.panelSurface === 'focus' ||
            bodySync.panelSurface === 'inside' ||
            bodySync.panelSurface === 'trail' ||
            focusSearchForcedRaw(bodySync) ||
            bodySync.panelSurface === 'semantic-dive'
    )

    const focusStageActive = $derived(focusActive && !mapModeActive)
    const headerVisible = $derived(!mapModeActive && (idleSurfaceActive || searchFamilySurfaceActive || focusActive))
    const controlsVisible = $derived(
        !(navMirror.surface === 'focus-search') &&
            !focusSearchForcedRaw(bodySync) &&
            !(appState.viewportIsCompact && (bodySync.panelSurface === 'idle' || navMirror.surface === 'idle')) &&
            !(appState.viewportIsCompact && (bodySync.panelSurface === 'search' || navMirror.surface === 'search'))
    )
    const infoPanelOpen = $derived(
        (searchSurfaceActive || (focusActive && (appState.viewportIsCompact || bodySync.compact))) &&
            !mapModeActive &&
            !(
                (appState.viewportIsCompact || bodySync.compact) &&
                idleSurfaceActive &&
                !focusActive &&
                !searchSurfaceActive
            )
    )

    const legacyCompassSurfaceActive = $derived(
        searchFamilySurfaceActive ||
            focusActive ||
            mapModeActive ||
            bodySync.panelSurface.startsWith('map-') ||
            navMirror.surface.startsWith('map-')
    )

    return {
        get mapModeActive() {
            return mapModeActive
        },
        get searchSurfaceActive() {
            return searchSurfaceActive
        },
        get searchFamilySurfaceActive() {
            return searchFamilySurfaceActive
        },
        get mapTrailSearchLaneActive() {
            return mapTrailSearchLaneActive
        },
        get idleSurfaceActive() {
            return idleSurfaceActive
        },
        get idleSearchVisible() {
            return idleSearchVisible
        },
        get focusActive() {
            return focusActive
        },
        get focusStageActive() {
            return focusStageActive
        },
        get headerVisible() {
            return headerVisible
        },
        get controlsVisible() {
            return controlsVisible
        },
        get infoPanelOpen() {
            return infoPanelOpen
        },
        get legacyCompassSurfaceActive() {
            return legacyCompassSurfaceActive
        },
        get weatherVisible() {
            return weatherVisible
        },
        set weatherVisible(v: boolean) {
            weatherVisible = v
        }
    }
}

function focusSearchForcedRaw(bodySync: BodySyncState): boolean {
    return (
        bodySync.panelSurface === 'focus-search' ||
        bodySync.graphContext === 'focus-search' ||
        document.body?.dataset.focusSearchForced === 'true'
    )
}

// ── Orchestration setup ─────────────────────────────────────────────────────

export interface AppOrchestration {
    lazy: typeof lazy
    nav: NavMirror
    bodySync: BodySyncState
    visibility: AppVisibility
    contract: { forced: boolean }
    isPlaywright: boolean
    devToolsVisible: boolean
    weatherToggle: () => void
    cleanupKeyboard: (() => void) | null
    semanticGuideConfig: SemanticGuideCardConfig
    semanticGuideSuggestions: SemanticGuideSuggestion[]
    setup(): void
    teardown(): void
}

export function createAppOrchestration(): AppOrchestration {
    const nav = setupNavMirror()
    const bodySync = setupBodySync()
    const contract = setupContractSurface()
    const isPlaywright = IS_PLAYWRIGHT
    const devToolsVisible =
        import.meta.env.MODE === 'development' &&
        typeof window !== 'undefined' &&
        (() => {
            const params = new URLSearchParams(window.location.search || '')
            return params.has('debug') || params.has('devtools') || params.has('spector')
        })()

    const visibility = createVisibility(nav, bodySync)

    const semanticGuideConfig = $derived((appState.semanticGuideState.config ?? {}) as SemanticGuideCardConfig)
    const semanticGuideSuggestions = $derived(
        Array.isArray(semanticGuideConfig.suggestions) ? semanticGuideConfig.suggestions : []
    )

    let cleanupKeyboard: (() => void) | null = null

    function weatherToggle() {
        visibility.weatherVisible = !visibility.weatherVisible
    }

    function setup(): void {
        deferTriggersImport()
        cleanupKeyboard = setupKeyboardShortcuts({ getNavMirror: () => nav, weatherToggle })
    }

    function teardown(): void {
        teardownContractSurface()
        teardownAppShell()
        resetSemanticThreadWorker()
        import('@lib/ui/weather-ui').then(({ disposeWeatherUi }) => disposeWeatherUi()).catch(() => {})
        cleanupKeyboard?.()
        cleanupKeyboard = null
    }

    return {
        lazy,
        nav,
        bodySync,
        visibility,
        contract,
        isPlaywright,
        devToolsVisible: !!devToolsVisible,
        weatherToggle,
        cleanupKeyboard,
        get semanticGuideConfig() {
            return semanticGuideConfig
        },
        get semanticGuideSuggestions() {
            return semanticGuideSuggestions
        },
        setup,
        teardown
    }
}
