import { appState } from '@lib/state/app.svelte.ts'
import type { Point } from '@lib/state/state-types'
import { subscribeKeyed, EVENTS } from '@lib/orchestration/event-bus'
import { pointHasGeocode } from '@lib/utils/geo-data'
import { formatBusinessName } from '@lib/utils/dom-formatters'
import { showExperienceToast } from '@lib/orchestration/toast'
import { focusOnPoint } from '@lib/orchestration/lifecycle'
import { debugWarn } from '@lib/utils/debug'
import { useSearchSummary } from '@lib/ui/use-search-summary.svelte'
import { syncRouteDirectorState } from './map-director'
import { getRouteEmbodimentIndices, refreshMapRouteEmbodiment } from './map-route-embodiment'
import { loadLeafletAssets, type LeafletContainer, type LeafletMarker } from './map-leaflet-runtime'
import { refreshMapMarkers } from './map-markers'

export function initMapStateSubscriptions(): void {
    const sync = (payload: Record<string, unknown> = {}): void => {
        syncRouteDirectorState((payload.reason as string) || 'state')
        refreshMapMarkers()
        refreshMapRouteEmbodiment()
    }

    subscribeKeyed('map-state:camera-node-focused', EVENTS.CAMERA_NODE_FOCUSED, sync)
    subscribeKeyed('map-state:search-success', EVENTS.SEARCH_SUCCESS, sync)
    subscribeKeyed('map-state:search-cleared', EVENTS.SEARCH_CLEARED, sync)
    subscribeKeyed('map-state:view-changed', EVENTS.VIEW_CHANGED, sync)
    subscribeKeyed('map-state:state-reset', EVENTS.STATE_RESET, sync)
    subscribeKeyed('map-state:filter-changed', EVENTS.FILTER_CHANGED, sync)
    subscribeKeyed('map-state:composition-updated', EVENTS.COMPOSITION_UPDATED, sync)
    subscribeKeyed('map-state:exploration-depth-changed', EVENTS.EXPLORATION_DEPTH_CHANGED, sync)
}

export async function initMap(): Promise<void> {
    if (appState.mapInitialized && appState.map) return
    if (appState.mapInitialized && !appState.map) appState.mapInitialized = false

    if (!appState.mapInitialized && appState.map) {
        try {
            ;(appState.map as { remove(): void }).remove()
        } catch (error) {
            debugWarn('Removing stale map instance failed:', error)
        }
        appState.map = null
        appState.markersLayer = null
        appState.mapRouteLayer = null
        appState.pointMarkers = []
    }

    try {
        await loadLeafletAssets()
        if (typeof window.L === 'undefined' || !window.L) {
            throw new Error('Leaflet not loaded')
        }
        const container = document.getElementById('map-container')
        if (!container) throw new Error('Map container is missing')
        const leafletContainer = container as LeafletContainer
        if (leafletContainer._leaflet_id) {
            delete leafletContainer._leaflet_id
            leafletContainer.replaceChildren()
        }

        const L = window.L! as {
            map: (container: HTMLElement, options: Record<string, unknown>) => Record<string, unknown>
            tileLayer: (url: string, options: Record<string, unknown>) => { addTo(map: unknown): unknown }
            layerGroup: () => { addTo(map: unknown): unknown; clearLayers(): void }
            circleMarker: (latLng: [number, number], options: Record<string, unknown>) => LeafletMarker
        }
        appState.map = L.map(container, {
            center: [30.3119, -95.4561],
            zoom: 10,
            zoomControl: false
        })

        try {
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: 'OpenStreetMap | CARTO',
                maxZoom: 19
            }).addTo(appState.map)
        } catch (err) {
            debugWarn('tileLayer addTo failed:', err)
        }

        appState.markersLayer = L.layerGroup().addTo(appState.map) as Record<string, unknown>
        appState.mapRouteLayer = L.layerGroup().addTo(appState.map) as Record<string, unknown>
        appState.pointMarkers = []

        if (!appState.points || !Array.isArray(appState.points)) return
        const focusedNode = appState.focusedNode
        const search = useSearchSummary()
        appState.points.forEach((point: Point, index: number) => {
            if (!pointHasGeocode(point)) return
            const color = appState.COLORS[(point.cluster ?? 0) % appState.COLORS.length]
            const marker: LeafletMarker = L.circleMarker([point.lat!, point.lng!], {
                radius: 4,
                fillColor: color,
                color,
                weight: 1,
                opacity: 0.8,
                fillOpacity: 0.6
            })

            marker.on('mouseover', () => {
                const name = formatBusinessName(point.name)
                marker.bindTooltip(name, { direction: 'top', offset: [0, -5], className: 'glass_medium' }).openTooltip()
            })
            marker.on('mouseout', () => {
                // Tooltip state is refreshed by the marker styling pass.
            })
            marker.on('click', () => {
                const routeSet = new Set(getRouteEmbodimentIndices())
                const searchSet = new Set(search.resultIndices)
                const selectableInTrail =
                    !search.summary ||
                    searchSet.has(index) ||
                    routeSet.has(index) ||
                    search.anchorIndex === index ||
                    search.topIndex === index ||
                    focusedNode === index

                if (!selectableInTrail) {
                    showExperienceToast(
                        'Outside this path',
                        'Use County View to leave the current path, or choose one of the lit markers.'
                    )
                    return
                }
                focusOnPoint(point, { revealCard: true })
            })

            appState.pointMarkers.push({ marker, index })
            marker.addTo(appState.markersLayer)
        })

        appState.mapInitialized = true
        refreshMapMarkers()
        refreshMapRouteEmbodiment()

        const mapContainer = document.getElementById('map-container')
        if (mapContainer) {
            mapContainer.style.opacity = ''
            mapContainer.style.pointerEvents = ''
        }
    } catch (error) {
        debugWarn('initMap failed:', error)
        appState.mapInitialized = false
        appState.map = null
        appState.markersLayer = null
        appState.mapRouteLayer = null
        appState.pointMarkers = []
        throw error
    }
}

export function destroyMap(): void {
    if (appState.map) {
        try {
            ;(appState.map as { remove(): void }).remove()
        } catch (error) {
            debugWarn('destroyMap failed:', error)
        }
    }

    appState.mapInitialized = false
    appState.map = null
    appState.markersLayer = null
    appState.mapRouteLayer = null
    appState.pointMarkers = []
}
