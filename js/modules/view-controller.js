import { state } from '../state.js'
import { publish, EVENTS } from './event-bus.js'
import { isMapSummarySurface } from './environment.js'
import {
    animateCameraToTerrainPrelude,
    focusOnNode,
    getRouteLayerOrigin,
    clearRouteExploration,
    animateCameraToNode,
    animateCameraToSearchCorridor,
    setCameraAssistChoreography
} from './camera-controls.js'
import { updateSelectedBusiness, setTrailFromSeed, syncFocusStage, setRouteChoreographyPhase } from './journey.js'
import { clearWeatherRefreshTimer, applyWeatherEffects } from './weather.js'
import { scheduleWeatherHydration } from './loading-ui.js'
import { applyCompositionState } from './composition-state.js'
import { initMap, getRouteEmbodimentIndices, setTerrainHandoffState } from './map-state.js'
import {
    invokeClearMobileRouteFieldPeek,
    scheduleMapRouteRefresh,
    getViewHandoffModel
} from './journey-compass-controller.js'
import { semanticGuideIcon } from './semantic-guide.js'
import { applyMapFlatteningLayout } from './map-flattening-layout.js';
import { setCurrentView } from './state-mutators.js'

let _refreshCompositionState = () => {}

export function initViewControllerAdapter({ refreshCompositionState } = {}) {
    if (typeof refreshCompositionState === 'function') {
        _refreshCompositionState = refreshCompositionState
    }
}

export function hideViewHandoff() {
    const handoff = document.getElementById('view-handoff')
    if (state.viewHandoffTimer) {
        window.clearTimeout(state.viewHandoffTimer)
        state.viewHandoffTimer = null
    }
    document.body.dataset.viewHandoffActive = 'false'
    if (!handoff) return
    handoff.classList.remove('active')
    handoff.setAttribute('aria-hidden', 'true')
}

export function showViewHandoff(view) {
    const handoff = document.getElementById('view-handoff')
    if (!handoff) return
    const model = getViewHandoffModel(view)
    const runeEl = document.getElementById('view-handoff-rune')
    const kickerEl = document.getElementById('view-handoff-kicker')
    const titleEl = document.getElementById('view-handoff-title')
    const noteEl = document.getElementById('view-handoff-note')

    if (runeEl) {
        runeEl.innerHTML = semanticGuideIcon(model.icon, view === 'map' ? 'Map view' : 'Mycelium view')
    }
    if (kickerEl) kickerEl.textContent = model.kicker
    if (titleEl) titleEl.textContent = model.title
    if (noteEl) noteEl.textContent = model.note

    if (state.viewHandoffTimer) {
        window.clearTimeout(state.viewHandoffTimer)
        state.viewHandoffTimer = null
    }

    handoff.setAttribute('aria-hidden', 'false')
    handoff.classList.add('active')
    document.body.dataset.viewHandoffActive = 'true'
    state.viewHandoffTimer = window.setTimeout(() => {
        handoff.classList.remove('active')
        handoff.setAttribute('aria-hidden', 'true')
        document.body.dataset.viewHandoffActive = 'false'
        state.viewHandoffTimer = null
    }, state.SHOW_VIEW_HANDOFF_DISMISS_MS)
}

function shouldShowViewHandoff(view, options = {}) {
    if (options.silentHandoff) return false
    const panelSurface = document.body?.dataset?.panelSurface
    if (
        view === 'map' &&
        panelSurface === 'map-focus-search' &&
        document.body?.dataset?.journeyNavigationOwner === 'map-trail-strip'
    ) {
        return false
    }
    if (
        view === 'map' &&
        isMapSummarySurface() &&
        document.body?.dataset?.journeyNavigationOwner === 'map-trail-strip'
    ) {
        return false
    }
    return true
}

export function switchView(view, options = {}) {
    invokeClearMobileRouteFieldPeek()
    const previousView = state.currentView
    const handoffFrom = options.handoffFrom || getRouteLayerOrigin()

    if (state.viewSwitchPreludeTimer) {
        window.clearTimeout(state.viewSwitchPreludeTimer)
        state.viewSwitchPreludeTimer = null
    }

    const shouldPreludeToMap =
        view === 'map' &&
        previousView === 'galaxy' &&
        !options.skipTerrainPrelude &&
        !options.skipUrlSync &&
        !options.silentHandoff
    if (shouldPreludeToMap) {
        const routeCount = getRouteEmbodimentIndices().length
        setTerrainHandoffState('flattening', {
            from: handoffFrom,
            to: 'map',
            routeCount
        })
        setRouteChoreographyPhase('terrain-prelude', {
            reason: 'map-prelude',
            anchorIndex: state.currentSearchSummary?.anchorIndex ?? state.navState?.focusedIndex ?? null,
            indexCount: routeCount
        })
        animateCameraToTerrainPrelude({ duration: state.MAP_HANDOFF_PRELUDE_MS })

        // 10/10 Polish: Flatten Three.js nodes to map coordinates during prelude
        applyMapFlatteningLayout(true)

        showViewHandoff('map')
        state.viewSwitchPreludeTimer = window.setTimeout(() => {
            state.viewSwitchPreludeTimer = null
            if (state.currentView !== 'galaxy') return
            switchView('map', {
                ...options,
                skipTerrainPrelude: true,
                handoffFrom
            })
        }, state.MAP_HANDOFF_PRELUDE_MS)
        return
    }
    setCurrentView(view)

    // 10/10 Polish: Transition Choreography
    document.body.classList.add('view-transitioning')
    applyCompositionState({ state, root: document.body })
    setCameraAssistChoreography('arriving', 'view-handoff')

    // Auto-remove transitioning class after animation completes
    window.setTimeout(() => {
        if (state.currentView !== view) return // Guard against rapid switching
        document.body.classList.remove('view-transitioning')
        if (
            document.body.dataset.cameraAssist === 'arriving' &&
            document.body.dataset.cameraAssistReason === 'view-handoff'
        ) {
            setCameraAssistChoreography('free', 'view-handoff-complete')
        }
    }, state.VIEW_HANDOFF_OUT_MS)

    if (view === 'map') {
        hideViewHandoff()
        scheduleMapRouteRefresh()
    }
    if (view !== 'galaxy' && view !== 'map') {
        clearRouteExploration('map-handoff')
    } else if (view !== 'map') {
        // 10/10 Polish: Reset map flattening unconditionally if leaving map or aborting prelude
        applyMapFlatteningLayout(false)

        // returning to galaxy from map while focused: restore focus pocket camera depth
        if (previousView === 'map' && Number.isFinite(state.navState.focusedIndex)) {
            animateCameraToNode(state.navState.focusedIndex, {
                transitionStyle: state.semanticDiveMode ? 'dive' : 'focus',
                duration: 1100
            })
        }
    }

    const btnGalaxy = document.getElementById('btn-galaxy')
    const btnMap = document.getElementById('btn-map')
    if (btnGalaxy) {
        btnGalaxy.classList.toggle('active', view === 'galaxy')
        btnGalaxy.setAttribute('aria-pressed', String(view === 'galaxy'))
    }
    if (btnMap) {
        btnMap.classList.toggle('active', view === 'map')
        btnMap.setAttribute('aria-pressed', String(view === 'map'))
    }

    const canvasContainer = document.getElementById('canvas-container')
    const mapContainer = document.getElementById('map-container')
    if (state.viewSwitchPreludeTimer) {
        window.clearTimeout(state.viewSwitchPreludeTimer)
        state.viewSwitchPreludeTimer = null
    }

    // Clean up orphaned timers when leaving galaxy view
    if (view !== 'galaxy') {
        if (state.clockTimer) {
            window.clearInterval(state.clockTimer)
            state.clockTimer = null
        }
        clearWeatherRefreshTimer()
        if (state.semanticLaneMonitorTimer) {
            window.clearInterval(state.semanticLaneMonitorTimer)
            state.semanticLaneMonitorTimer = null
        }
        if (state.semanticLaneOpsRefreshTimer) {
            window.clearInterval(state.semanticLaneOpsRefreshTimer)
            state.semanticLaneOpsRefreshTimer = null
        }
    }

    if (view === 'galaxy') {
        if (previousView === 'map') {
            setTerrainHandoffState('returning', {
                from: state.terrainHandoffState?.from || 'map',
                to: 'galaxy',
                routeCount: getRouteEmbodimentIndices().length,
                settleAfterMs: state.TERRAIN_LANDING_SETTLE_MS,
                settlePhase: 'idle'
            })
        } else {
            setTerrainHandoffState('idle', { from: handoffFrom, to: 'galaxy' })
        }
        if (canvasContainer) canvasContainer.classList.remove('hidden')
        if (mapContainer) mapContainer.classList.remove('active', 'arriving')
        if (state.selectedPoint) {
            const selectedIndex = state.points.indexOf(state.selectedPoint)
            if (selectedIndex >= 0) {
                focusOnNode(selectedIndex, {
                    skipUrlSync: true,
                    fromSearchResult: !!state.currentSearchSummary,
                    restoreHistory: true,
                    preserveMode: true
                })
                setTrailFromSeed(selectedIndex)
            }
        } else if (
            state.currentSearchSummary?.anchorIndex !== null &&
            state.currentSearchSummary?.anchorIndex !== undefined
        ) {
            const anchorIndex = state.currentSearchSummary.anchorIndex
            setRouteChoreographyPhase('search-corridor', {
                reason: 'return-to-mycelium-search',
                anchorIndex,
                indexCount: state.currentSearchSummary.resultIndices?.length || 0
            })
            animateCameraToSearchCorridor(anchorIndex, state.currentSearchSummary.resultIndices || [], {
                reason: 'return-to-mycelium'
            })
            focusOnNode(anchorIndex, {
                skipUrlSync: true,
                fromSearchResult: true,
                restoreHistory: true,
                preserveMode: true
            })
            setTrailFromSeed(anchorIndex)
        } else {
            setRouteChoreographyPhase('overview', {
                reason: 'return-to-mycelium-overview',
                anchorIndex: null,
                indexCount: 0
            })
        }
    } else {
        const routeCount = getRouteEmbodimentIndices().length
        setTerrainHandoffState('landing', {
            from: handoffFrom,
            to: 'map',
            routeCount,
            settleAfterMs: state.TERRAIN_LANDING_SETTLE_LONG_MS,
            settlePhase: 'settled'
        })
        setRouteChoreographyPhase('terrain-landing', {
            reason: 'map-handoff',
            anchorIndex: state.currentSearchSummary?.anchorIndex ?? state.navState?.focusedIndex ?? null,
            indexCount: routeCount
        })
        initMap()
            .then(() => {
                if (state.currentView !== 'map') return
                if (state.map) {
                    setTimeout(() => {
                        state.map.invalidateSize()
                        scheduleMapRouteRefresh()
                    }, 100)
                }
                if (state.weather) applyWeatherEffects()
            })
            .catch((error) => {
                console.error('Map initialization failed:', error)
            })
        if (!state.weatherInitialized) {
            scheduleWeatherHydration()
        }
        if (canvasContainer) canvasContainer.classList.add('hidden')
        if (mapContainer) mapContainer.classList.add('active')
    }

    if (!options.skipUrlSync) {
        publish(EVENTS.URL_SYNC_REQUESTED, { params: {}, mode: options.historyMode || 'push', reason: 'view' })
    }

    publish(EVENTS.VIEW_CHANGED, { view, previousView })

    syncFocusStage(state.selectedPoint)
    if (!state.selectedPoint) {
        updateSelectedBusiness(null)
    }
    _refreshCompositionState()
    if (shouldShowViewHandoff(view, options)) {
        showViewHandoff(view)
    } else if (view === 'map') {
        hideViewHandoff()
    }
}
