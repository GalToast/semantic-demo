/**
 * @lib/engine/map-state.ts — Leaflet map state, route embodiment, terrain handoff
 *
 * Port of
 * Manages Leaflet map initialization, marker refresh, route embodiment,
 * terrain handoff, and route director state synchronization.
 */
import { appState } from '@lib/state/app.svelte.ts'
import { withStateMutation } from '@lib/state/with-state-mutation'
import type { Point, ActiveFilters } from '@lib/state/state-types'
import { subscribeKeyed, EVENTS } from '@lib/orchestration/event-bus'
import { pointHasGeocode, isPointVisible } from '@lib/utils/geo-data'
import { formatBusinessName } from '@lib/utils/dom-formatters'
import { showExperienceToast } from '@lib/orchestration/toast'
import { focusOnPoint } from '@lib/orchestration/lifecycle'
import { hideTooltip } from '@lib/ui/tooltip'
import { hideViewHandoff } from '@lib/orchestration/view-controller'
import { isMobileViewport } from '@lib/utils/environment'
import { debugWarn } from '@lib/utils/debug'
import { useSearchSummary } from '@lib/ui/use-search-summary.svelte'

export const LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
export const LEAFLET_JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'

/**
 * Leaflet mutates the DOM container at runtime to attach _leaflet_id.
 * The HTMLElement type doesn't include this property; structural cast is required.
 */
interface LeafletContainer extends HTMLElement {
    _leaflet_id?: number
}

/**
 * Leaflet's fitBounds signature isn't exposed in a way TS can infer from
 * the loose Record<string, unknown> type on appState.map. This interface
 * lets us call fitBounds without a complex conditional-parameter cast.
 */
interface LeafletMapWithFitBounds {
    fitBounds(bounds: unknown, options?: Record<string, unknown>): void
}

interface LeafletMarker {
    setStyle(style: Record<string, unknown>): void
    addTo(layer: unknown): LeafletMarker
    on(event: string, handler: () => void): void
    bindTooltip(name: string, options: Record<string, unknown>): LeafletMarker
    openTooltip(): void
    bringToFront?(): void
    bringToBack?(): void
}

interface TerrainHandoffOptions {
    routeCount?: number
    from?: string
    to?: string
    settleAfterMs?: number
    settlePhase?: string
}

/**
 * Shape of the map subsystem's view of appState. Accessed via getMapState()
 * which consolidates the typed cast in one place. Kept as an explicit shape
 * (rather than accessing `state` directly) because it documents which fields
 * the map subsystem depends on, and because some fields use intentionally-loose
 * types (e.g. `map: Record<string, unknown>` for Leaflet-mutated DOM data).
 */
interface MapStateShape {
    mapInitialized?: boolean
    map: Record<string, unknown> | null
    markersLayer: Record<string, unknown> | null
    mapRouteLayer: Record<string, unknown> | null
    pointMarkers: Array<{ marker: LeafletMarker; index: number }> | unknown[]
    COLORS: readonly string[]
    points: Point[] | undefined
    currentView?: string
    focusedNode: number | null
    searchState?: {
        currentSearchSummary?: {
            resultIndices?: number[]
            anchorIndex?: number | null
            topIndex?: number | null
        } | null
    }
    focusState?: {
        selectedPoint?: Point | null
        inspectedThreadIndex?: number | null
        pinnedThreadIndex?: number | null
        nodesAreSettling?: boolean
        focusTransitionMode?: string
        focusTransitionStartedAt?: number
    }
    activeClusterFilter: number | null
    activeFilters: ActiveFilters | null
    selectedPoint: Point | null
    navState: {
        focusedIndex: number | null
        walkHistoryIndices: readonly number[]
        trailNeighborIndices: readonly number[]
        mode: string
    }
    semanticDiveMode?: boolean
    routeTraceDiagnostics: { mapPointCount: number; mapPathActive: boolean }
}

/**
 * Typed view of appState restricted to the map subsystem's fields.
 * Replaces inline `state as unknown as MapStateShape` casts at the
 * initMap / refreshMapMarkers / destroyMap call sites.
 */
function getMapState(): MapStateShape {
    return appState as unknown as MapStateShape
}

let leafletAssetsPromise: Promise<unknown> | null = null

export async function loadLeafletAssets(): Promise<unknown> {
    if (window.L) return window.L
    if (leafletAssetsPromise) return leafletAssetsPromise

    leafletAssetsPromise = new Promise((resolve, reject) => {
        const finish = (): void => {
            if (window.L) {
                resolve(window.L)
            } else {
                reject(new Error('Leaflet failed to initialize'))
            }
        }

        if (!document.getElementById('leaflet-runtime-css')) {
            const link = document.createElement('link')
            link.id = 'leaflet-runtime-css'
            link.rel = 'stylesheet'
            link.href = LEAFLET_CSS_URL
            document.head.appendChild(link)
        }

        const existingScript = document.getElementById('leaflet-runtime-js')
        if (existingScript) {
            if (window.L) {
                resolve(window.L)
                return
            }
            existingScript.addEventListener('load', finish, { once: true })
            existingScript.addEventListener('error', () => reject(new Error('Leaflet script failed to load')), {
                once: true
            })
            return
        }

        const script = document.createElement('script')
        script.id = 'leaflet-runtime-js'
        script.src = LEAFLET_JS_URL
        script.async = true
        script.onload = finish
        script.onerror = () => reject(new Error('Leaflet script failed to load'))
        document.head.appendChild(script)
    })

    return leafletAssetsPromise.catch((e) => {
        leafletAssetsPromise = null
        throw e
    })
}

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
    const mapState = getMapState()

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
                if (typeof hideTooltip === 'function') {
                    // No-op: tooltip is updated by updateMapTooltip
                }
                const name = formatBusinessName(point.name)
                marker.bindTooltip(name, { direction: 'top', offset: [0, -5], className: 'glass_medium' }).openTooltip()
            })
            marker.on('mouseout', () => {
                if (typeof hideTooltip === 'function') hideTooltip()
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
                // focusOnPoint expects BusinessRecord | null; point is a Point (which has
                // [key: string]: unknown index sig). The double-hop through unknown is required
                // because Point has an index signature that conflicts with BusinessRecord's
                // explicit fields. Could be fixed by widening focusOnPoint's signature in
                // orchestration/lifecycle.ts, but that's out of scope for the type-laundering sweep.
                focusOnPoint(point as unknown as Parameters<typeof focusOnPoint>[0], { revealCard: true })
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

export function showMapTooltip(point: Point, marker: { bindTooltip: Function; openTooltip: Function }): void {
    if (typeof hideTooltip === 'function') hideTooltip()
    const name = formatBusinessName(point.name)
    marker.bindTooltip(name, { direction: 'top', offset: [0, -5], className: 'glass_medium' }).openTooltip()
}

export function getMapRoutePoints(): Array<{ index: number; point: Point }> {
    return getRouteEmbodimentIndices()
        .map((index: number) => ({ index, point: (appState.points as Point[])?.[index] }))
        .filter((entry): entry is { index: number; point: Point } => !!entry.point && pointHasGeocode(entry.point))
        .slice(0, isMobileViewport() ? 7 : 10)
}

export function refreshMapRouteEmbodiment(): void {
    if (!appState.map || !appState.mapRouteLayer) {
        appState.routeTraceDiagnostics.mapPointCount = 0
        appState.routeTraceDiagnostics.mapPathActive = false
        return
    }
    ;(appState.mapRouteLayer as { clearLayers(): void }).clearLayers()
    if (appState.currentView !== 'map') {
        appState.routeTraceDiagnostics.mapPointCount = 0
        appState.routeTraceDiagnostics.mapPathActive = false
        return
    }

    const routePoints = getMapRoutePoints()
    appState.routeTraceDiagnostics.mapPointCount = routePoints.length
    appState.routeTraceDiagnostics.mapPathActive = routePoints.length >= 2
    if (!routePoints.length) {
        const trailStateActive = document.body?.dataset?.trailState === 'active'
        if (appState.currentView === 'map' && !trailStateActive) {
            const container = document.getElementById('map-container')
            if (container && !container.querySelector('.map-empty-state')) {
                const emptyEl = document.createElement('div')
                emptyEl.className = 'map-empty-state'
                emptyEl.setAttribute('role', 'status')
                emptyEl.setAttribute('aria-live', 'polite')

                const iconContainer = document.createElement('div')
                iconContainer.className = 'map-empty-state-icon'
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
                svg.setAttribute('width', '28')
                svg.setAttribute('height', '28')
                svg.setAttribute('viewBox', '0 0 24 24')
                svg.setAttribute('fill', 'none')
                svg.setAttribute('stroke', 'currentColor')
                svg.setAttribute('stroke-width', '1.5')
                svg.setAttribute('aria-hidden', 'true')
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
                path.setAttribute('d', 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z')
                svg.appendChild(path)
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
                circle.setAttribute('cx', '12')
                circle.setAttribute('cy', '10')
                circle.setAttribute('r', '3')
                svg.appendChild(circle)
                iconContainer.appendChild(svg)
                emptyEl.appendChild(iconContainer)

                const title = document.createElement('div')
                title.className = 'map-empty-state-title'
                title.textContent = 'Choose a business to map its neighborhood'
                emptyEl.appendChild(title)

                const note = document.createElement('div')
                note.className = 'map-empty-state-note'
                note.textContent =
                    'Search or select a business in the mycelium view, then open Map to see its nearby records here.'
                emptyEl.appendChild(note)

                container.appendChild(emptyEl)
            }
        }
        return
    }

    const container = document.getElementById('map-container')
    if (container) {
        const emptyEl = container.querySelector('.map-empty-state')
        if (emptyEl) emptyEl.remove()
    }

    const latLngs: Array<[number, number]> = routePoints.map(({ point }: { point: Point }) => [point.lat!, point.lng!])
    const L = window.L! as {
        polyline: (
            latLngs: Array<[number, number]>,
            options: Record<string, unknown>
        ) => { addTo(layer: unknown): unknown }
        circleMarker: (latLng: [number, number], options: Record<string, unknown>) => LeafletMarker
    }
    if (latLngs.length >= 2) {
        L.polyline(latLngs, {
            className: 'semantic-map-route-line semantic-map-route-line-aura',
            color: '#79ebde',
            weight: 12,
            opacity: 0.1,
            interactive: false
        }).addTo(appState.mapRouteLayer)
        L.polyline(latLngs, {
            className: 'semantic-map-route-line',
            color: '#ffe58f',
            weight: 2.4,
            opacity: 0.68,
            dashArray: '1 14',
            lineCap: 'round',
            interactive: false
        }).addTo(appState.mapRouteLayer)
    }

    const anchorIndex = getRouteAnchorIndex(routePoints.map(({ index }: { index: number }) => index))
    routePoints.slice(0, 7).forEach(({ index, point }: { index: number; point: Point }, order: number) => {
        const isAnchor = index === anchorIndex
        L.circleMarker([point.lat!, point.lng!], {
            className: isAnchor ? 'semantic-map-route-pulse is-anchor' : 'semantic-map-route-pulse',
            radius: isAnchor ? 22 : Math.max(10, 17 - order),
            color: isAnchor ? '#ffe58f' : '#79ebde',
            weight: isAnchor ? 1.4 : 1,
            opacity: isAnchor ? 0.54 : 0.24,
            fillColor: isAnchor ? '#ffe58f' : '#79ebde',
            fillOpacity: isAnchor ? 0.08 : 0.035,
            interactive: false
        }).addTo(appState.mapRouteLayer)
    })
}

export function centerMapOnRouteAnchor(): boolean {
    if (!appState.points) return false
    if (!appState.map) return false
    const search = useSearchSummary()
    const focusIndex = appState.navState.focusedIndex
    const focusIdxValid = Number.isFinite(focusIndex) && focusIndex! >= 0 && focusIndex! < appState.points.length
    const anchorIdx = search.anchorIndex ?? undefined
    const anchorIdxValid = Number.isFinite(anchorIdx) && anchorIdx! >= 0 && anchorIdx! < appState.points.length
    const focusPoint =
        appState.focusState.selectedPoint ||
        (focusIdxValid ? (appState.points as Point[])[focusIndex!] : null) ||
        (anchorIdxValid ? (appState.points as Point[])[anchorIdx!] : null) ||
        getMapRoutePoints()[0]?.point ||
        null

    if (!focusPoint || !pointHasGeocode(focusPoint)) return false
    const routePoints = getMapRoutePoints()
    const routeLatLngs: Array<[number, number]> = routePoints.map(({ point }: { point: Point }) => [
        point.lat!,
        point.lng!
    ])
    const L = window.L! as {
        latLngBounds: (latLngs: Array<[number, number]>) => unknown
    }
    if (routeLatLngs.length >= 2) {
        const bounds = L.latLngBounds(routeLatLngs)
        ;(appState.map as unknown as LeafletMapWithFitBounds).fitBounds(bounds, {
            animate: true,
            maxZoom: 15,
            paddingTopLeft: [22, isMobileViewport() ? 250 : 96],
            paddingBottomRight: [22, 120]
        })
    } else {
        ;(
            appState.map as { setView: (latLng: [number, number], zoom: number, opts: Record<string, unknown>) => void }
        ).setView([focusPoint!.lat!, focusPoint!.lng!], 15, { animate: true })
    }
    return true
}

export function refreshMapMarkers(): void {
    if (!appState.points) return
    if (!appState.markersLayer) return
    ;(appState.markersLayer as { clearLayers(): void }).clearLayers()
    const search = useSearchSummary()
    const searchResultSet = new Set(search.resultIndices)
    const selectedLeadId =
        appState.focusState.selectedPoint?.lead_id !== undefined && appState.focusState.selectedPoint?.lead_id !== null
            ? String(appState.focusState.selectedPoint.lead_id)
            : null

    if (appState.pointMarkers && Array.isArray(appState.pointMarkers)) {
        const dimmedMarkers: LeafletMarker[] = []
        const trailMarkers: LeafletMarker[] = []
        const priorityMarkers: LeafletMarker[] = []

        ;(appState.pointMarkers as Array<{ marker: LeafletMarker; index: number }>).forEach(({ marker, index }) => {
            if (
                !isPointVisible(index, appState.points as Point[], appState.activeClusterFilter, appState.activeFilters)
            )
                return
            const point = (appState.points as Point[])[index]
            if (!point) return
            if (point.cluster === null || point.cluster === undefined || !Number.isFinite(point.cluster))
                point.cluster = 0
            const baseColor = (appState.COLORS as readonly string[])[
                point.cluster! % (appState.COLORS as readonly string[]).length
            ]
            const isFocused = appState.focusedNode === index
            const isSelected = selectedLeadId !== null && String(point.lead_id) === selectedLeadId
            const isAnchor = search.anchorIndex === index
            const isSearchMatch = searchResultSet.has(index)
            const isTrail = appState.trailIndices.has(index) || isSearchMatch

            let radius = 4
            let weight = 1
            let color = baseColor
            let fillColor = baseColor
            let opacity = 0.8
            let fillOpacity = 0.6

            if (search.summary) {
                if (isAnchor) {
                    radius = isFocused || isSelected ? 10 : 8.6
                    weight = 2.4
                    color = '#ffe58f'
                    fillColor = '#fff4bd'
                    opacity = 0.98
                    fillOpacity = 0.94
                    priorityMarkers.push(marker)
                } else if (isFocused || isSelected) {
                    radius = 8.2
                    weight = 2.1
                    color = '#92f3e4'
                    fillColor = '#d9fff8'
                    opacity = 0.96
                    fillOpacity = 0.9
                    priorityMarkers.push(marker)
                } else if (isTrail) {
                    radius = 5.6
                    weight = 1.6
                    opacity = 0.88
                    fillOpacity = 0.74
                    trailMarkers.push(marker)
                } else {
                    radius = 3.2
                    opacity = 0.45
                    fillOpacity = 0.28
                    dimmedMarkers.push(marker)
                }
            } else if (isFocused || isSelected) {
                radius = 9
                weight = 2
                color = '#92f3e4'
                fillColor = '#d9fff8'
                opacity = 0.96
                fillOpacity = 0.9
                priorityMarkers.push(marker)
            }

            marker.setStyle({ radius, weight, color, fillColor, opacity, fillOpacity })
            marker.addTo(appState.markersLayer)
        })

        dimmedMarkers.forEach((marker: LeafletMarker) => marker.bringToBack?.())
        trailMarkers.forEach((marker: LeafletMarker) => marker.bringToFront?.())
        priorityMarkers.forEach((marker: LeafletMarker) => marker.bringToFront?.())
    }
}

export function getRouteDirectorState(): string {
    const search = useSearchSummary()
    if (appState.currentView === 'map') {
        return appState.focusState.selectedPoint ||
            (appState.focusedNode !== null && appState.focusedNode !== undefined)
            ? 'map-trail'
            : 'map-overview'
    }
    if (appState.semanticDiveMode && appState.focusedNode !== null && appState.focusedNode !== undefined)
        return 'inside-pocket'
    if (appState.focusedNode !== null && appState.focusedNode !== undefined) {
        if ((appState.navState.walkHistoryIndices || []).length > 1 || appState.navState.mode === 'trail')
            return 'thread-walk'
        return search.summary ? 'search-focus' : 'node-focus'
    }
    if (search.summary) return 'search-corridor'
    return 'overview'
}

export function syncRouteDirectorState(_reason = 'state'): string {
    const directorState = getRouteDirectorState()
    // NOTE: body.dataset writes removed. routeDirector is not used by CSS or JS readers.
    // If needed, add to parity-attrs.svelte.ts with journeyStore as source.
    return directorState
}

export function setTerrainHandoffState(phase = 'idle', options: TerrainHandoffOptions = {}): void {
    const normalizedPhase = String(phase || 'idle').replace(/[^a-z0-9-]/gi, '') || 'idle'
    const routeCount = Number.isFinite(options.routeCount) ? options.routeCount : getRouteEmbodimentIndices().length

    withStateMutation(() => {
        appState.terrainHandoffState = {
            phase: normalizedPhase,
            from: options.from || appState.terrainHandoffState?.from || 'overview',
            to: options.to || appState.terrainHandoffState?.to || appState.currentView || 'galaxy',
            routeCount: routeCount!,
            startedAt: performance.now()
        }
    })

    // NOTE: body.dataset writes removed. parity-attrs.svelte.ts handles terrainHandoff sync.
    // The additional terrainHandoffFrom/To/RouteCount attrs are not used by CSS or JS readers.

    if (['idle', 'settled'].includes(normalizedPhase) && typeof hideViewHandoff === 'function') {
        hideViewHandoff()
    }

    if (appState.terrainHandoffTimer) {
        window.clearTimeout(appState.terrainHandoffTimer)
        appState.terrainHandoffTimer = null
    }

    if (Number.isFinite(options.settleAfterMs) && options.settleAfterMs! > 0) {
        // eslint-disable-next-line no-restricted-syntax -- raw setTimeout in dispose path: cleared via window.clearTimeout immediately below
        appState.terrainHandoffTimer = setTimeout(() => {
            const settlePhase = options.settlePhase || (appState.currentView === 'map' ? 'settled' : 'idle')
            setTerrainHandoffState(settlePhase, {
                routeCount,
                from: appState.terrainHandoffState.from,
                to: appState.terrainHandoffState.to
            })
        }, options.settleAfterMs)
    }
}

export function getRouteEmbodimentIndices(): number[] {
    if (!appState.points || !Array.isArray(appState.points)) return []
    const search = useSearchSummary()
    const ordered: number[] = []
    const pushIndex = (index: number | null | undefined): void => {
        if (
            !Number.isFinite(index) ||
            index === null ||
            index === undefined ||
            index < 0 ||
            index >= appState.points.length
        )
            return
        if (!isPointVisible(index, appState.points as Point[], null, appState.activeFilters)) return
        if (!(appState.nodePositions as unknown[])[index] && !(appState.originalPositions as unknown[])[index]) return
        if (!ordered.includes(index)) ordered.push(index)
    }

    const routeOwner = getRouteDirectorState()
    const focusOwnsRoute = ['search-focus', 'thread-walk', 'node-focus', 'inside-pocket', 'map-trail'].includes(
        routeOwner
    )

    if (focusOwnsRoute) {
        pushIndex(appState.navState.focusedIndex)
        pushIndex(appState.focusedNode)
        ;(appState.navState.walkHistoryIndices || []).forEach(pushIndex)
        ;(appState.navState.trailNeighborIndices || []).slice(0, 6).forEach(pushIndex)
        pushIndex(search.anchorIndex)
        pushIndex(search.topIndex)
        search.resultIndices.slice(0, 6).forEach(pushIndex)
    } else {
        pushIndex(search.anchorIndex)
        pushIndex(search.topIndex)
        search.resultIndices.slice(0, 10).forEach(pushIndex)
        ;(appState.navState.walkHistoryIndices || []).forEach(pushIndex)
        pushIndex(appState.navState.focusedIndex)
        pushIndex(appState.focusedNode)
        ;(appState.navState.trailNeighborIndices || []).slice(0, 4).forEach(pushIndex)
    }
    return ordered.slice(0, isMobileViewport() ? 8 : 12)
}

export function getRouteAnchorIndex(routeIndices: number[]): number | null {
    const routeOwner = getRouteDirectorState()
    const focusOwnsRoute = ['search-focus', 'thread-walk', 'node-focus', 'inside-pocket'].includes(routeOwner)
    const search = useSearchSummary()
    const focusCandidates = [appState.navState.focusedIndex, appState.focusedNode]
    const searchCandidates = [search.anchorIndex ?? undefined, search.topIndex ?? undefined, routeIndices?.[0]]
    const candidates = focusOwnsRoute
        ? [...focusCandidates, ...searchCandidates]
        : [...searchCandidates, ...focusCandidates]
    return candidates.find((index): index is number => Number.isFinite(index) && routeIndices.includes(index!)) ?? null
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
    const mapState = getMapState()

    if (mapState.map) {
        try {
            ;(mapState.map as { remove(): void }).remove()
        } catch (error) {
            debugWarn('destroyMap failed:', error)
        }
    }

    mapState.mapInitialized = false
    mapState.map = null
    mapState.markersLayer = null
    mapState.mapRouteLayer = null
    mapState.pointMarkers = []
}
