/**
 * @lib/journey/point-color.ts — Point color management: filter colors, thread lens description.
 *
 * Native port of js/modules/journey-point-color.ts.
 * Re-exports exactly the API surface consumed by the bridge and journey.ts.
 */
import { Color } from 'three'
import { appState as state } from '@lib/state/app.svelte'
import { publish, EVENTS } from '@lib/orchestration/event-bus'
import { isPointVisible } from '@lib/utils/geo-data'

const _state = state
const nodeSporeSyncColor = new Color()

function toIndexArray(value: unknown): number[] {
    if (Array.isArray(value)) return value.filter(Number.isFinite)
    if (value instanceof Set) return Array.from(value).filter(Number.isFinite) as number[]
    if (value && typeof (value as Iterable<unknown>)[Symbol.iterator] === 'function') {
        return Array.from(value as Iterable<unknown>).filter(Number.isFinite) as number[]
    }
    return []
}

function syncNodeSporeColorsFromPointColors(): void {
    if (!_state.nodeSporeMesh || !_state.pointsMesh?.geometry?.attributes?.color) return
    const colorAttr = _state.pointsMesh.geometry.attributes.color
    const colors = colorAttr.array
    for (let i = 0; i < _state.points.length; i++) {
        const colorOffset = i * 3
        nodeSporeSyncColor.setRGB(
            Math.min(1, (colors[colorOffset] ?? 0) * 1.62),
            Math.min(1, (colors[colorOffset + 1] ?? 0) * 1.62),
            Math.min(1, (colors[colorOffset + 2] ?? 0) * 1.62)
        )
        _state.nodeSporeMesh.setColorAt(i, nodeSporeSyncColor)
    }
    if (_state.nodeSporeMesh.instanceColor) _state.nodeSporeMesh.instanceColor.needsUpdate = true
}

export function applyPointFilterColors(): void {
    if (!_state.pointsMesh || !_state.pointBaseColors) return
    const trailNeighborIndices = toIndexArray(_state.navState.trailNeighborIndices)
    const focusPocketIndices = toIndexArray(_state.navState.focusPocketIndices)
    const walkHistoryIndices = toIndexArray(_state.navState.walkHistoryIndices)
    const colorStateKey = [
        _state.filterVersion,
        _state.navState.mode || 'overview',
        _state.navState.focusedIndex ?? 'none',
        _state.focusedNode ?? 'none',
        _state.trailDepth ?? 0,
        _state.myceliumMode || 'default',
        _state.navState.threadSource || 'none',
        trailNeighborIndices.slice(0, 12).join(','),
        focusPocketIndices.slice(0, 18).join(','),
        walkHistoryIndices.slice(-6).join(',')
    ].join('|')
    if (_state.filterColorStateKey === colorStateKey) return
    const colorAttr = _state.pointsMesh?.geometry?.attributes?.color
    if (!colorAttr) return
    const colors = colorAttr.array
    const focusLocalIndices =
        _state.navState.focusedIndex !== null
            ? new Set([_state.navState.focusedIndex, ...trailNeighborIndices.slice(0, 12), ...focusPocketIndices])
            : new Set<number>()

    const historySet = new Set(walkHistoryIndices)

    if (!_state.points || !_state.pointBaseColors || _state.pointBaseColors.length < _state.points.length * 3) return
    const signalScores: number[] = _state.signalScores || []
    const bridgeScores: number[] = _state.bridgeScores || []

    for (let i = 0; i < _state.points.length; i++) {
        const colorOffset = i * 3
        const baseR = _state.pointBaseColors[colorOffset] ?? 0
        const baseG = _state.pointBaseColors[colorOffset + 1] ?? 0
        const baseB = _state.pointBaseColors[colorOffset + 2] ?? 0
        const visible = isPointVisible(i, _state.points, null, _state.activeFilters)
        const isVisited = historySet.has(i)
        let factor = visible ? 1 : 0.08
        if (visible) {
            const nodeMinFloor = 0.65
            if (_state.navState.focusedIndex !== null) {
                const semanticFocus = _state.navState.threadSource === 'semantic'
                if (_state.navState.mode === 'trail') {
                    factor = _state.trailIndices.size
                        ? _state.trailIndices.has(i)
                            ? i === _state.navState.focusedIndex
                                ? 2.14
                                : semanticFocus
                                  ? 1.74
                                  : 1.48
                            : isVisited
                              ? 1.18
                              : semanticFocus
                                ? 0.24
                                : 0.18
                        : isVisited
                          ? 1.18
                          : 0.28
                } else {
                    const inPocket = focusPocketIndices.includes(i)
                    const role = _state.navState.focusPocketRoleByIndex?.get(i)
                    const raw = focusLocalIndices.has(i)
                        ? i === _state.navState.focusedIndex
                            ? 3.18
                            : role === 'primary'
                              ? 2.52
                              : role === 'support'
                                ? 1.78
                                : inPocket
                                  ? 2.1
                                  : semanticFocus
                                    ? 1.8
                                    : 1.34
                        : isVisited
                          ? 1.28
                          : semanticFocus
                            ? 0.32
                            : 0.22
                    factor = Math.max(raw, nodeMinFloor)
                }
            } else if (_state.myceliumMode === 'bloom') {
                factor = _state.bloomIndices.has(i)
                    ? 1.08
                    : Math.max(0.22, Math.min(0.66, 0.3 + (signalScores[i] ?? 0) * 0.08))
            } else if (_state.myceliumMode === 'bridge') {
                factor = _state.bridgeIndices.has(i)
                    ? 1.38
                    : Math.max(0.16, Math.min(0.88, 0.22 + (bridgeScores[i] ?? 0) * 0.32))
            } else if (_state.myceliumMode === 'trail') {
                factor = _state.trailIndices.size
                    ? _state.trailIndices.has(i)
                        ? i === _state.focusedNode
                            ? 1.48
                            : 1.18
                        : 0.12
                    : 0.34
            }
        }
        colors[colorOffset] = baseR * factor
        colors[colorOffset + 1] = baseG * factor
        colors[colorOffset + 2] = baseB * factor
    }
    if (_state.pointsMesh?.geometry?.attributes?.color) _state.pointsMesh.geometry.attributes.color.needsUpdate = true
    _state.pointColorStateVersion += 1
    _state.filterColorVersion = _state.filterVersion
    _state.filterColorStateKey = colorStateKey
    syncNodeSporeColorsFromPointColors()
    if (_state.searchGlowActive && _state.searchGlowIndices && _state.searchGlowIndices.size > 0) {
        _state.searchGlowRenderStateKey = ''
        const topIndex = _state.searchGlowTopIndex ?? _state.searchGlowIndices.values().next().value ?? -1
        const topPoint = Number.isFinite(topIndex) ? _state.points[topIndex] : null
        publish(EVENTS.SEARCH_STATUS_SYNC_REQUESTED, {
            point: topPoint,
            options: { fromSearchResult: true, skipTraversalUiUpdate: true }
        })
    }
}

// W45: describeThreadLensForPoint moved to thread-lens.ts (three-free) to break
// the entry chunk's static chain to three via this module's top-level `new Color()`.
export { describeThreadLensForPoint } from './thread-lens'
