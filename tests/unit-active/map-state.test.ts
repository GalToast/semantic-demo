/**
 * @vitest-environment jsdom
 *
 * Direct unit coverage for src/lib/engine/map-state.ts — the 704-LOC Leaflet
 * map-state module that previously had 0 dedicated tests.
 *
 * Targets the 6 exports that are reachable without a full Leaflet runtime:
 *   - LEAFLET_CSS_URL / LEAFLET_JS_URL (constants)
 *   - getMapRoutePoints (primitives → primitives)
 *   - getRouteDirectorState (primitives → string)
 *   - getRouteEmbodimentIndices (primitives → number[])
 *   - getRouteAnchorIndex (primitives → number | null)
 *   - syncRouteDirectorState (delegates to getRouteDirectorState)
 *
 * The following Leaflet/DOM-coupled exports are deferred to integration tests:
 *   - initMap / initMapStateSubscriptions / loadLeafletAssets / refreshMapRouteEmbodiment
 *     / refreshMapMarkers / centerMapOnRouteAnchor / zoomMap / destroyMap
 *   Rationale: these call `window.L`, mutate DOM layers, or subscribe to event-bus
 *   keyed channels at module-load time. Mocking them faithfully would require a
 *   near-complete Leaflet stub + DOM channel bridge — that is the role of the
 *   playwright / live-probe integration suite, not a unit test. We cover the
 *   decision-logic spine (director state → route derivation → anchor selection)
 *   here; the visual/Leaflet layering is deferred.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mutable snapshots ───────────────────────────────────────────────

const _appState = vi.hoisted(() => ({
    points: [] as Array<Record<string, unknown> | null | undefined>,
    currentView: 'galaxy' as string,
    focusedNode: null as number | null,
    focusState: {
        selectedPoint: null as Record<string, unknown> | null
    },
    navState: {
        focusedIndex: null as number | null,
        walkHistoryIndices: [] as number[],
        trailNeighborIndices: [] as number[],
        mode: 'overview' as string
    },
    semanticDiveMode: false as boolean,
    searchState: {
        currentSearchSummary: null as {
            resultIndices?: number[]
            anchorIndex?: number | null
            topIndex?: number | null
        } | null
    },
    activeClusterFilter: null as number | null,
    activeFilters: {
        status: 'all',
        city: 'all',
        website: false,
        email: false,
        geocoded: false
    } as Record<string, unknown>,
    nodePositions: [] as Array<Record<string, unknown> | null>,
    originalPositions: [] as Array<Record<string, unknown> | null>,
    terrainHandoffState: { phase: 'idle', from: 'galaxy', to: 'galaxy', routeCount: 0, startedAt: 0 },
    terrainHandoffTimer: null as ReturnType<typeof setTimeout> | null
}))

// ── Module mocks ───────────────────────────────────────────────────────────

vi.mock('@lib/state/app.svelte', () => ({
    appState: _appState
}))

vi.mock('@lib/utils/geo-data', () => ({
    pointHasGeocode: (point: Record<string, unknown> | null | undefined): boolean => {
        if (!point) return false
        const lat = point.lat as number | null | undefined
        const lng = point.lng as number | null | undefined
        return (
            lat !== null &&
            lat !== undefined &&
            Number.isFinite(lat) &&
            lat >= 25.0 &&
            lat <= 37.0 &&
            lng !== null &&
            lng !== undefined &&
            Number.isFinite(lng) &&
            lng >= -107.0 &&
            lng <= -93.0
        )
    },
    isPointVisible: (
        index: number,
        points: readonly unknown[],
        activeClusterFilter: number | null,
        _activeFilters: Record<string, unknown>
    ): boolean => {
        if (index < 0 || index >= points.length) return false
        if (!points[index]) return false
        // In tests, cluster filter is null → treat all points as visible
        if (activeClusterFilter !== null) {
            const cluster = (points[index] as Record<string, unknown>)?.cluster
            if (Number.isFinite(Number(cluster)) && Number(cluster) !== activeClusterFilter) return false
        }
        return true
    }
}))

vi.mock('@lib/utils/dom-formatters', () => ({
    formatBusinessName: (name: unknown): string => (typeof name === 'string' && name.length > 0 ? name : '')
}))

vi.mock('@lib/utils/environment', () => ({
    isMobileViewport: (): boolean => false
}))

vi.mock('@lib/orchestration/event-bus', () => ({
    subscribeKeyed: vi.fn(),
    EVENTS: {}
}))

vi.mock('@lib/orchestration/lifecycle', () => ({
    focusOnPoint: vi.fn()
}))

vi.mock('@lib/ui/tooltip', () => ({
    hideTooltip: vi.fn()
}))

vi.mock('@lib/orchestration/view-controller', () => ({
    hideViewHandoff: vi.fn()
}))

vi.mock('@lib/utils/debug', () => ({
    debugWarn: vi.fn()
}))

vi.mock('@lib/ui/ui-feedback', () => ({
    showExperienceToast: vi.fn()
}))

// ── Import under test ─────────────────────────────────────────────────────

import {
    LEAFLET_CSS_URL,
    LEAFLET_JS_URL,
    getMapRoutePoints,
    getRouteDirectorState,
    syncRouteDirectorState,
    getRouteEmbodimentIndices,
    getRouteAnchorIndex,
    setTerrainHandoffState
} from '@lib/engine/map-state'

// ── Helpers ─────────────────────────────────────────────────────────────────

function makePoint(i: number, withGeocode = true): Record<string, unknown> {
    return {
        name: `Biz ${i}`,
        lat: withGeocode ? 29.7 + i * 0.01 : null,
        lng: withGeocode ? -95.4 - i * 0.01 : null,
        cluster: i % 4,
        status: 'active',
        lead_id: `lead-${i}`
    }
}

function resetAppState(): void {
    _appState.points = []
    _appState.currentView = 'galaxy'
    _appState.focusedNode = null
    _appState.focusState.selectedPoint = null
    _appState.navState = {
        focusedIndex: null,
        walkHistoryIndices: [],
        trailNeighborIndices: [],
        mode: 'overview'
    }
    _appState.semanticDiveMode = false
    _appState.searchState.currentSearchSummary = null
    _appState.activeClusterFilter = null
    _appState.activeFilters = {
        status: 'all',
        city: 'all',
        website: false,
        email: false,
        geocoded: false
    }
    _appState.nodePositions = []
    _appState.originalPositions = []
    _appState.terrainHandoffState = { phase: 'idle', from: 'galaxy', to: 'galaxy', routeCount: 0, startedAt: 0 }
    _appState.terrainHandoffTimer = null
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('map-state — constants', () => {
    it('LEAFLET_CSS_URL points to the vendored local CSS', () => {
        expect(LEAFLET_CSS_URL).toBe('vendor/leaflet/leaflet.css')
    })

    it('LEAFLET_JS_URL points to the vendored local JS', () => {
        expect(LEAFLET_JS_URL).toBe('vendor/leaflet/leaflet.js')
    })
})

describe('map-state — getRouteDirectorState', () => {
    beforeEach(resetAppState)

    it('returns "map-overview" when view is map with no focus or selection', () => {
        _appState.currentView = 'map'
        expect(getRouteDirectorState()).toBe('map-overview')
    })

    it('returns "map-trail" when view is map with a selected point', () => {
        _appState.currentView = 'map'
        _appState.focusState.selectedPoint = makePoint(0)
        expect(getRouteDirectorState()).toBe('map-trail')
    })

    it('returns "map-trail" when view is map with a focused node', () => {
        _appState.currentView = 'map'
        _appState.focusedNode = 2
        expect(getRouteDirectorState()).toBe('map-trail')
    })

    it('returns "inside-pocket" when semanticDiveMode + focusedNode', () => {
        _appState.semanticDiveMode = true
        _appState.focusedNode = 1
        expect(getRouteDirectorState()).toBe('inside-pocket')
    })

    it('returns "thread-walk" when walkHistory has >1 entries', () => {
        _appState.focusedNode = 1
        _appState.navState.walkHistoryIndices = [0, 1, 2]
        expect(getRouteDirectorState()).toBe('thread-walk')
    })

    it('returns "thread-walk" when navState.mode is trail', () => {
        _appState.focusedNode = 1
        _appState.navState.mode = 'trail'
        expect(getRouteDirectorState()).toBe('thread-walk')
    })

    it('returns "search-focus" when focusedNode + currentSearchSummary', () => {
        _appState.focusedNode = 1
        _appState.searchState.currentSearchSummary = { resultIndices: [1, 2], anchorIndex: 1, topIndex: 1 }
        expect(getRouteDirectorState()).toBe('search-focus')
    })

    it('returns "node-focus" when focusedNode without search summary', () => {
        _appState.focusedNode = 1
        expect(getRouteDirectorState()).toBe('node-focus')
    })

    it('returns "search-corridor" when only search summary is present', () => {
        _appState.searchState.currentSearchSummary = { resultIndices: [0, 1], anchorIndex: 0, topIndex: 0 }
        expect(getRouteDirectorState()).toBe('search-corridor')
    })

    it('returns "overview" as the default state', () => {
        expect(getRouteDirectorState()).toBe('overview')
    })
})

describe('map-state — syncRouteDirectorState', () => {
    beforeEach(resetAppState)

    it('delegates to getRouteDirectorState and returns its value', () => {
        _appState.currentView = 'map'
        _appState.focusedNode = 3
        expect(syncRouteDirectorState()).toBe('map-trail')
    })

    it('accepts a reason argument without throwing', () => {
        expect(() => syncRouteDirectorState('test-reason')).not.toThrow()
    })
})

describe('map-state — getRouteEmbodimentIndices', () => {
    beforeEach(resetAppState)

    it('returns empty array when points is empty', () => {
        _appState.points = []
        _appState.nodePositions = []
        _appState.originalPositions = []
        expect(getRouteEmbodimentIndices()).toEqual([])
    })

    it('returns empty array when no nodePositions or originalPositions exist', () => {
        _appState.points = [makePoint(0), makePoint(1)]
        _appState.nodePositions = []
        _appState.originalPositions = []
        expect(getRouteEmbodimentIndices()).toEqual([])
    })

    it('includes focusedIndex when focus owns the route', () => {
        _appState.points = [makePoint(0), makePoint(1), makePoint(2)]
        _appState.nodePositions = [{ x: 0 }, { x: 1 }, { x: 2 }]
        _appState.originalPositions = []
        _appState.focusedNode = 1
        const result = getRouteEmbodimentIndices()
        expect(result).toContain(1)
    })

    it('includes search anchor and top indices in non-focus mode', () => {
        _appState.points = [makePoint(0), makePoint(1), makePoint(2)]
        _appState.nodePositions = [{ x: 0 }, { x: 1 }, { x: 2 }]
        _appState.originalPositions = []
        _appState.searchState.currentSearchSummary = { resultIndices: [0, 1, 2], anchorIndex: 0, topIndex: 2 }
        const result = getRouteEmbodimentIndices()
        expect(result).toContain(0)
        expect(result).toContain(2)
    })

    it('deduplicates indices', () => {
        _appState.points = [makePoint(0), makePoint(1)]
        _appState.nodePositions = [{ x: 0 }, { x: 1 }]
        _appState.originalPositions = []
        _appState.focusedNode = 0
        _appState.navState.focusedIndex = 0
        _appState.navState.walkHistoryIndices = [0]
        const result = getRouteEmbodimentIndices()
        const zeroCount = result.filter((i) => i === 0).length
        expect(zeroCount).toBe(1)
    })

    it('respects the desktop cap of 12 indices', () => {
        const count = 20
        _appState.points = Array.from({ length: count }, (_, i) => makePoint(i))
        _appState.nodePositions = Array.from({ length: count }, (_, i) => ({ x: i }))
        _appState.originalPositions = []
        _appState.searchState.currentSearchSummary = {
            resultIndices: Array.from({ length: count }, (_, i) => i),
            anchorIndex: 0,
            topIndex: 1
        }
        const result = getRouteEmbodimentIndices()
        expect(result.length).toBeLessThanOrEqual(12)
    })
})

describe('map-state — getRouteAnchorIndex', () => {
    beforeEach(resetAppState)

    it('returns null when routeIndices is empty', () => {
        expect(getRouteAnchorIndex([])).toBeNull()
    })

    it('returns null only when routeIndices is empty (routeIndices[0] always matches otherwise)', () => {
        _appState.focusedNode = null
        _appState.navState.focusedIndex = null
        _appState.searchState.currentSearchSummary = null
        // With empty routeIndices, there is no routeIndices[0] candidate, so null
        expect(getRouteAnchorIndex([])).toBeNull()
    })

    it('returns routeIndices[0] as the fallback anchor when no focus/search candidate matches', () => {
        _appState.focusedNode = null
        _appState.navState.focusedIndex = null
        _appState.searchState.currentSearchSummary = null
        // No focus/search match, but searchCandidates includes routeIndices[0] = 5
        expect(getRouteAnchorIndex([5, 6, 7])).toBe(5)
    })

    it('prefers focus candidates when focus owns the route', () => {
        _appState.focusedNode = 2
        _appState.searchState.currentSearchSummary = { anchorIndex: 3, topIndex: 3, resultIndices: [2, 3] }
        // focusOwnsRoute = true → focus candidates first → 2 wins
        expect(getRouteAnchorIndex([2, 3])).toBe(2)
    })

    it('prefers search candidates when not in focus mode', () => {
        _appState.focusedNode = null
        _appState.searchState.currentSearchSummary = { anchorIndex: 3, topIndex: 4, resultIndices: [3, 4] }
        // focusOwnsRoute = false → search candidates first → 3 wins
        expect(getRouteAnchorIndex([3, 4])).toBe(3)
    })

    it('falls back to first routeIndices entry when no focus/search match', () => {
        _appState.focusedNode = null
        _appState.searchState.currentSearchSummary = null
        expect(getRouteAnchorIndex([7, 8, 9])).toBe(7)
    })
})

describe('map-state — getMapRoutePoints', () => {
    beforeEach(resetAppState)

    it('returns empty array when no points exist', () => {
        _appState.points = []
        _appState.nodePositions = []
        _appState.originalPositions = []
        expect(getMapRoutePoints()).toEqual([])
    })

    it('filters out points without valid geocodes', () => {
        _appState.points = [{ ...makePoint(0), lat: null, lng: null }, makePoint(1)]
        _appState.nodePositions = [{ x: 0 }, { x: 1 }]
        _appState.originalPositions = []
        _appState.searchState.currentSearchSummary = { resultIndices: [0, 1], anchorIndex: 0, topIndex: 1 }
        const result = getMapRoutePoints()
        // Point 0 has no geocode → filtered out
        expect(result.every((r) => r.point != null)).toBe(true)
        expect(result.some((r) => r.index === 0)).toBe(false)
    })

    it('caps at 10 points on desktop viewport', () => {
        const count = 15
        _appState.points = Array.from({ length: count }, (_, i) => makePoint(i))
        _appState.nodePositions = Array.from({ length: count }, (_, i) => ({ x: i }))
        _appState.originalPositions = []
        _appState.searchState.currentSearchSummary = {
            resultIndices: Array.from({ length: count }, (_, i) => i),
            anchorIndex: 0,
            topIndex: 1
        }
        const result = getMapRoutePoints()
        expect(result.length).toBeLessThanOrEqual(10)
    })

    it('returns entries with index and point shape', () => {
        _appState.points = [makePoint(0), makePoint(1)]
        _appState.nodePositions = [{ x: 0 }, { x: 1 }]
        _appState.originalPositions = []
        _appState.searchState.currentSearchSummary = { resultIndices: [0, 1], anchorIndex: 0, topIndex: 1 }
        const result = getMapRoutePoints()
        expect(result[0]).toHaveProperty('index')
        expect(result[0]).toHaveProperty('point')
        expect(typeof result[0].index).toBe('number')
    })
})

describe('map-state — setTerrainHandoffState', () => {
    beforeEach(resetAppState)

    it('sets terrainHandoffState with normalized phase', () => {
        setTerrainHandoffState('loading', { from: 'galaxy', to: 'map', routeCount: 5 })
        expect(_appState.terrainHandoffState.phase).toBe('loading')
        expect(_appState.terrainHandoffState.from).toBe('galaxy')
        expect(_appState.terrainHandoffState.to).toBe('map')
        expect(_appState.terrainHandoffState.routeCount).toBe(5)
    })

    it('normalizes phases with invalid characters', () => {
        // regex strips anything not [a-z0-9-] → 'load!ng@2' becomes 'loadng2'
        setTerrainHandoffState('load!ng@2', {})
        expect(_appState.terrainHandoffState.phase).toBe('loadng2')
    })

    it('defaults phase to idle when empty string is passed', () => {
        setTerrainHandoffState('', {})
        expect(_appState.terrainHandoffState.phase).toBe('idle')
    })

    it('uses currentView as default "to" when not provided', () => {
        _appState.currentView = 'map'
        // Reset terrainHandoffState.to so the fallback reads from currentView
        _appState.terrainHandoffState = { phase: 'idle', from: 'galaxy', to: '', routeCount: 0, startedAt: 0 }
        setTerrainHandoffState('loading', {})
        expect(_appState.terrainHandoffState.to).toBe('map')
    })

    it('clears existing timer when setTerrainHandoffState is called', () => {
        const fakeTimer = setTimeout(() => {}, 1000) as unknown as ReturnType<typeof setTimeout>
        _appState.terrainHandoffTimer = fakeTimer
        setTerrainHandoffState('loading', {})
        expect(_appState.terrainHandoffTimer).toBeNull()
        clearTimeout(fakeTimer as unknown as number)
    })
})
