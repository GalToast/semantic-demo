/**
 * @lib/engine/map-state.ts — Leaflet map state, route embodiment, terrain handoff
 *
 * Port of
 * Manages Leaflet map initialization, marker refresh, route embodiment,
 * terrain handoff, and route director state synchronization.
 */
import { appState } from '@lib/state/app.svelte.ts'
import type { Point, ActiveFilters } from '@lib/state/state-types'
import { subscribeKeyed, unsubscribeKeyed, EVENTS } from '@lib/orchestration/event-bus'
import { pointHasGeocode, isPointVisible } from '@lib/utils/geo-data'
import { formatBusinessName } from '@lib/utils/dom-formatters'
import { showExperienceToast } from '@lib/orchestration/toast'
import { hideViewHandoff } from '@lib/orchestration/view-controller'
import { isMobileViewport } from '@lib/utils/environment'
import { debugWarn } from '@lib/utils/debug'
import { useSearchSummary } from '@lib/ui/use-search-summary.svelte'
import type { LeafletContainer, LeafletMapWithFitBounds, LeafletMarker } from './map-leaflet-runtime'

// Leaflet is vendored locally under `public/vendor/leaflet/` (was: unpkg CDN
// with no SRI). Self-hosting removes the CDN supply-chain + offline dependency
// while preserving the lazy script/link injection (Leaflet stays out of the
// initial bundle). Relative paths resolve against the document base (app runs
// at the root path; same pattern as the `data.dat` fetch).
export const LEAFLET_VERSION = '1.9.4'
export const LEAFLET_CSS_URL = 'vendor/leaflet/leaflet.css'
export const LEAFLET_JS_URL = 'vendor/leaflet/leaflet.js'

// ── sibling imports ─────────────────────────────────────────────────────
import { loadLeafletAssets, getLeafletMap } from './map-leaflet-runtime'
import { refreshMapMarkers } from './map-markers'
import {
    getMapRoutePoints,
    refreshMapRouteEmbodiment,
    centerMapOnRouteAnchor,
    getRouteEmbodimentIndices,
    getRouteAnchorIndex
} from './map-route-embodiment'
import { getRouteDirectorState, syncRouteDirectorState, setTerrainHandoffState } from './map-director'

const MAP_STATE_SUBSCRIPTION_KEYS = [
    'map-state:camera-node-focused',
    'map-state:search-success',
    'map-state:search-cleared',
    'map-state:view-changed',
    'map-state:state-reset',
    'map-state:filter-changed',
    'map-state:composition-updated',
    'map-state:exploration-depth-changed'
]

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
    const mapState = appState

    if (mapState.mapInitialized && mapState.map) return
    if (mapState.mapInitialized && !mapState.map) mapState.mapInitialized = false

    if (!mapState.mapInitialized && mapState.map) {
        try {
            ;(mapState.map as { remove(): void }).remove()
        } catch (error) {
            debugWarn('Removing stale map instance failed:', error)
        }
        mapState.map = null
        mapState.markersLayer = null
        mapState.mapRouteLayer = null
        mapState.pointMarkers = []
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
            polyline: (
                latLngs: Array<[number, number]>,
                options: Record<string, unknown>
            ) => { addTo(layer: unknown): unknown }
            latLngBounds: (latLngs: Array<[number, number]>) => unknown
        }
        mapState.map = L.map(container, {
            center: [30.3119, -95.4561],
            zoom: 10,
            zoomControl: false
        })

        try {
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: 'OpenStreetMap | CARTO',
                maxZoom: 19
            }).addTo(mapState.map)
        } catch (err) {
            debugWarn('tileLayer addTo failed:', err)
        }

        mapState.markersLayer = L.layerGroup().addTo(mapState.map) as Record<string, unknown>
        mapState.mapRouteLayer = L.layerGroup().addTo(mapState.map) as Record<string, unknown>
        mapState.pointMarkers = []

        if (!mapState.points || !Array.isArray(mapState.points)) return
        const focusedNode = mapState.focusedNode
        const search = useSearchSummary()
        mapState.points.forEach((point: Point, index: number) => {
            if (!pointHasGeocode(point)) return
            const color = mapState.COLORS[(point.cluster ?? 0) % mapState.COLORS.length]
            const marker: LeafletMarker = L.circleMarker([point.lat!, point.lng!], {
                radius: 4,
                fillColor: color,
                color: color,
                weight: 1,
                opacity: 0.8,
                fillOpacity: 0.6
            })

            marker.on('mouseover', () => {
                const name = formatBusinessName(point.name)
                marker.bindTooltip(name, { direction: 'top', offset: [0, -5], className: 'glass_medium' }).openTooltip()
            })
            marker.on('mouseout', () => {
                // tooltip is updated by updateMapTooltip
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
                // Task 186 / P3-LCP: lifecycle barrel statically reaches
                // three.js; this runs on map-marker CLICK (post-boot by
                // definition), so import lazily at use-time.
                void import('@lib/orchestration/lifecycle').then((m) => m.focusOnPoint(point, { revealCard: true }))
            })

            mapState.pointMarkers.push({ marker, index })
            marker.addTo(mapState.markersLayer)
        })

        mapState.mapInitialized = true
        refreshMapMarkers()
        refreshMapRouteEmbodiment()

        const mapContainer = document.getElementById('map-container')
        if (mapContainer) {
            mapContainer.style.opacity = ''
            mapContainer.style.pointerEvents = ''
        }
    } catch (error) {
        debugWarn('initMap failed:', error)
        const ms = mapState
        ms.mapInitialized = false
        ms.map = null
        ms.markersLayer = null
        ms.mapRouteLayer = null
        ms.pointMarkers = []
        throw error
    }
}

export function zoomMap(multiplier: number): void {
    if (!appState.map) return
    if (multiplier < 1) {
        ;(appState.map as { zoomIn(): void }).zoomIn()
    } else {
        ;(appState.map as { zoomOut(): void }).zoomOut()
    }
}

export function destroyMap(): void {
    const mapState = appState

    if (mapState.map) {
        try {
            ;(mapState.map as { remove(): void }).remove()
        } catch (error) {
            debugWarn('destroyMap failed:', error)
        }
    }

    // M2 (engine-teardown audit): tear down the keyed event-bus subscriptions
    // registered in initMapStateSubscriptions so they don't keep firing as
    // no-ops after the map is destroyed. Without this, a destroy->re-init cycle
    // accumulates stale subscribers on the bus.
    for (const key of MAP_STATE_SUBSCRIPTION_KEYS) {
        unsubscribeKeyed(key)
    }

    mapState.mapInitialized = false
    mapState.map = null
    mapState.markersLayer = null
    mapState.mapRouteLayer = null
    mapState.pointMarkers = []
}

// ── re-exports from siblings ─────────────────────────────────────────────
export { loadLeafletAssets } from './map-leaflet-runtime'

export { showMapTooltip, refreshMapMarkers } from './map-markers'

export {
    getMapRoutePoints,
    refreshMapRouteEmbodiment,
    centerMapOnRouteAnchor,
    getRouteEmbodimentIndices,
    getRouteAnchorIndex
} from './map-route-embodiment'

export { getRouteDirectorState, syncRouteDirectorState, setTerrainHandoffState } from './map-director'
