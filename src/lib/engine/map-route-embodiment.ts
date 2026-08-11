import { appState } from '@lib/state/app.svelte.ts'
import type { Point, ActiveFilters } from '@lib/state/state-types'
import { useSearchSummary } from '@lib/ui/use-search-summary.svelte'
import { pointHasGeocode, isPointVisible } from '@lib/utils/geo-data'
import { formatBusinessName } from '@lib/utils/dom-formatters'
import { showExperienceToast } from '@lib/orchestration/toast'
import { focusOnPoint } from '@lib/orchestration/lifecycle'
import { hideViewHandoff } from '@lib/orchestration/view-controller'
import { isMobileViewport } from '@lib/utils/environment'
import { debugWarn } from '@lib/utils/debug'
import { getRouteDirectorState } from './map-director'
import { getLeafletMap } from './map-leaflet-runtime'
import type { LeafletMarker } from './map-leaflet-runtime'

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
            // V2 (W53): honor a per-session dismiss so users browsing the raw
            // county markers aren't blocked by the centered empty-state.
            const mapEmptyDismissed = (() => {
                try {
                    return sessionStorage.getItem('mco:map-empty-dismissed') === '1'
                } catch {
                    return false
                }
            })()
            if (container && !container.querySelector('.map-empty-state') && !mapEmptyDismissed) {
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
                    'Search or select a business in the scene, then open Map to see its nearby businesses here.'
                emptyEl.appendChild(note)

                // V2 (W53): jurors flagged this centered empty-state obscuring
                // the densest marker cluster with no dismiss affordance (D4 +
                // M4, both models). Add a ✕ that hides it for the rest of the
                // map session (persisted via sessionStorage). The parent
                // .map-empty-state is pointer-events:none, so the button opts
                // back in with pointer-events:auto (see css/shell.css).
                const closeBtn = document.createElement('button')
                closeBtn.className = 'map-empty-state-close'
                closeBtn.type = 'button'
                closeBtn.setAttribute('aria-label', 'Dismiss and explore the county map')
                closeBtn.textContent = '✕'
                closeBtn.addEventListener('click', () => {
                    try {
                        sessionStorage.setItem('mco:map-empty-dismissed', '1')
                    } catch {
                        /* sessionStorage unavailable — still hide immediately */
                    }
                    emptyEl.style.setProperty('display', 'none', 'important')
                })
                emptyEl.appendChild(closeBtn)

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
    if (routeLatLngs.length >= 2) {
        const bounds = (window.L! as {
            latLngBounds: (latLngs: Array<[number, number]>) => unknown
        }).latLngBounds(routeLatLngs)
        getLeafletMap()?.fitBounds(bounds, {
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
