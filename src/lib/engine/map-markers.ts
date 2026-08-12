import { appState } from '@lib/state/app.svelte.ts'
import type { Point } from '@lib/state/state-types'
import { isPointVisible } from '@lib/utils/geo-data'
import { formatBusinessName } from '@lib/utils/dom-formatters'
import { useSearchSummary } from '@lib/ui/use-search-summary.svelte'
import type { LeafletMarker } from './map-leaflet-runtime'

export function showMapTooltip(point: Point, marker: { bindTooltip: Function; openTooltip: Function }): void {
    const name = formatBusinessName(point.name)
    marker.bindTooltip(name, { direction: 'top', offset: [0, -5], className: 'glass_medium' }).openTooltip()
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
