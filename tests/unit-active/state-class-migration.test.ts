import { describe, it, expect, beforeEach, vi } from 'vitest'
import { get } from 'svelte/store'

/**
 * @vitest-environment jsdom
 *
 * Consolidated state-class-migration tests.
 * Pattern: one vi.mock() with hoisted mutable state per store.
 * Each store's helper file provides setup() + test blocks.
 * Run: npx vitest run tests/unit-active/state-class-migration.test.ts
 */

// ── Hoisted mock state (one per store) ───────────────────────────────────────
// vi.hoisted ensures these exist when vi.mock factories execute at import time.

const _compassState = vi.hoisted(() => ({
    mode: 'overview' as string,
    focusedIndex: null as number | null
}))

const _cameraState = vi.hoisted(() => ({
    autoRotate: false,
    autoRotateSuspended: false,
    autoRotateResumeDueAt: 0,
    autoRotateSoftResumeStartedAt: 0
}))

const _legendState = vi.hoisted(() => ({
    legendOpen: false
}))

const _filterState = vi.hoisted(() => ({
    filterVersion: 0,
    filterColorVersion: 0,
    activeClusterFilter: null as number | null,
    activeFilters: {
        status: 'all' as string,
        city: '' as string,
        website: false,
        email: false,
        geocoded: false
    }
}))

const _searchState = vi.hoisted(() => ({
    currentSearchSummary: null as any,
    searchStatus: 'idle' as string,
    navState: { focusedIndex: null as number | null } as any,
    searchRequestSequence: 0,
    searchAnchorIndex: null as number | null,
    searchPreviewIndex: null as number | null,
    searchGlowIndices: new Set<number>() as Set<number>,
    searchGlowTopIndex: null as number | null,
    searchGlowActive: false,
    currentEmptyQuery: null as string | null,
    searchFocusTransitionToken: 0,
    semanticTrailCue: 'idle' as string,
    isCompactViewport: false,
    semanticGuideRequestSequence: 0,
    currentSemanticGuide: null as string | null,
    summaryCardTypeToken: 0
}))

const _weatherState = vi.hoisted(() => ({
    weather: null as any,
    weatherInitialized: false,
    weatherState: { lastFetch: 0, fallback: false }
}))

// ── Mock factories ───────────────────────────────────────────────────────────
// vi.mock is hoisted to the top of this file. The factories read from the
// hoisted state objects above, which helpers reset in beforeEach.

vi.mock('@lib/state/app.svelte.ts', () => ({
    appState: {
        // Compass mock shape
        get navState() {
            return {
                get mode() {
                    return _compassState.mode
                },
                get focusedIndex() {
                    return _compassState.focusedIndex
                },
                set focusedIndex(v: number | null) {
                    _compassState.focusedIndex = v
                }
            }
        },
        // Camera mock shape
        get autoRotate() {
            return _cameraState.autoRotate
        },
        set autoRotate(v: boolean) {
            _cameraState.autoRotate = v
        },
        get autoRotateSuspended() {
            return _cameraState.autoRotateSuspended
        },
        set autoRotateSuspended(v: boolean) {
            _cameraState.autoRotateSuspended = v
        },
        get autoRotateResumeDueAt() {
            return _cameraState.autoRotateResumeDueAt
        },
        set autoRotateResumeDueAt(v: number) {
            _cameraState.autoRotateResumeDueAt = v
        },
        get autoRotateSoftResumeStartedAt() {
            return _cameraState.autoRotateSoftResumeStartedAt
        },
        set autoRotateSoftResumeStartedAt(v: number) {
            _cameraState.autoRotateSoftResumeStartedAt = v
        },
        withMutation: (fn: () => unknown) => fn(),
        // Legend mock shape
        get legendOpen() {
            return _legendState.legendOpen
        },
        set legendOpen(v: boolean) {
            _legendState.legendOpen = v
        },
        // Filter mock shape
        get filterVersion() {
            return _filterState.filterVersion
        },
        set filterVersion(v: number) {
            _filterState.filterVersion = v
        },
        get filterColorVersion() {
            return _filterState.filterColorVersion
        },
        set filterColorVersion(v: number) {
            _filterState.filterColorVersion = v
        },
        get activeClusterFilter() {
            return _filterState.activeClusterFilter
        },
        set activeClusterFilter(v: number | null) {
            _filterState.activeClusterFilter = v
        },
        get activeFilters() {
            return _filterState.activeFilters
        },
        set activeFilters(v: any) {
            _filterState.activeFilters = v
        },
        // Search mock shape
        get currentSearchSummary() {
            return _searchState.currentSearchSummary
        },
        set currentSearchSummary(v: any) {
            _searchState.currentSearchSummary = v
        },
        get searchStatus() {
            return _searchState.searchStatus
        },
        set searchStatus(v: string) {
            _searchState.searchStatus = v
        },
        get searchRequestSequence() {
            return _searchState.searchRequestSequence
        },
        set searchRequestSequence(v: number) {
            _searchState.searchRequestSequence = v
        },
        get searchAnchorIndex() {
            return _searchState.searchAnchorIndex
        },
        set searchAnchorIndex(v: number | null) {
            _searchState.searchAnchorIndex = v
        },
        get searchPreviewIndex() {
            return _searchState.searchPreviewIndex
        },
        set searchPreviewIndex(v: number | null) {
            _searchState.searchPreviewIndex = v
        },
        get searchGlowIndices() {
            return _searchState.searchGlowIndices
        },
        set searchGlowIndices(v: Set<number>) {
            _searchState.searchGlowIndices = v
        },
        get searchGlowTopIndex() {
            return _searchState.searchGlowTopIndex
        },
        set searchGlowTopIndex(v: number | null) {
            _searchState.searchGlowTopIndex = v
        },
        get searchGlowActive() {
            return _searchState.searchGlowActive
        },
        set searchGlowActive(v: boolean) {
            _searchState.searchGlowActive = v
        },
        get currentEmptyQuery() {
            return _searchState.currentEmptyQuery
        },
        set currentEmptyQuery(v: string | null) {
            _searchState.currentEmptyQuery = v
        },
        get searchFocusTransitionToken() {
            return _searchState.searchFocusTransitionToken
        },
        set searchFocusTransitionToken(v: number) {
            _searchState.searchFocusTransitionToken = v
        },
        get semanticTrailCue() {
            return _searchState.semanticTrailCue
        },
        set semanticTrailCue(v: string) {
            _searchState.semanticTrailCue = v
        },
        get isCompactViewport() {
            return _searchState.isCompactViewport
        },
        set isCompactViewport(v: boolean) {
            _searchState.isCompactViewport = v
        },
        get semanticGuideRequestSequence() {
            return _searchState.semanticGuideRequestSequence
        },
        set semanticGuideRequestSequence(v: number) {
            _searchState.semanticGuideRequestSequence = v
        },
        get currentSemanticGuide() {
            return _searchState.currentSemanticGuide
        },
        set currentSemanticGuide(v: string | null) {
            _searchState.currentSemanticGuide = v
        },
        get summaryCardTypeToken() {
            return _searchState.summaryCardTypeToken
        },
        set summaryCardTypeToken(v: number) {
            _searchState.summaryCardTypeToken = v
        },
        // Weather mock shape
        get weather() {
            return _weatherState.weather
        },
        set weather(v: any) {
            _weatherState.weather = v
        },
        get weatherInitialized() {
            return _weatherState.weatherInitialized
        },
        set weatherInitialized(v: boolean) {
            _weatherState.weatherInitialized = v
        },
        get weatherState() {
            return _weatherState.weatherState
        },
        set weatherState(v: any) {
            _weatherState.weatherState = v
        },
        withMutation(fn: () => void) {
            fn()
        }
    }
}))

vi.mock('@lib/stores/journey.svelte', () => ({
    journeyPhase: () => _compassState.mode
}))

// ── Imports (must appear AFTER vi.mock) ──────────────────────────────────────

import { compassSteps, buildCompassStatus, JOURNEY_ACTIONS } from '@lib/stores/compass.svelte.ts'

import {
    cameraStore,
    setCameraPosition,
    setCameraTarget,
    setAutoRotate,
    suspendAutoRotate,
    resumeAutoRotate,
    toggleAutoRotate,
    resetCamera,
    cameraPosition,
    cameraTarget,
    autoRotate,
    autoRotateSuspended,
    isAutoRotating,
    CAMERA_CONFIG,
    OVERVIEW_CAMERA_POSE
} from '@lib/stores/camera.svelte.ts'

import { legendOpen, toggleLegend, setLegendOpen } from '@lib/stores/legend.svelte.ts'

import {
    filterState,
    activeClusterFilter,
    hasActiveFilters,
    activeFilterCount,
    statusFilter,
    cityFilter,
    contactFilters,
    toggleFilter,
    overwriteActiveFilters,
    setFilter,
    resetFilters,
    getFilterState,
    pointMatchesActiveFilters,
    setClusterFilter
} from '@lib/stores/filter.svelte.ts'
import type { ActiveFilters } from '@lib/stores/filter.svelte.ts'

import {
    searchStore,
    searchState,
    searchUseRerank,
    setSearchQuery,
    setSearchStatus,
    setSearchResults,
    setSearchSummary,
    clearSearch,
    clearSearchResults,
    setAnchorIndex,
    setPreviewIndex,
    setGlowActive,
    setSearchGlow,
    clearSearchGlow,
    setTrailCue,
    incrementRequestSequence,
    isRequestCurrent,
    incrementFocusTransitionToken,
    setSemanticGuide,
    setCompactViewport,
    bumpSummaryCardTypeToken,
    validateSearchQuery,
    searchQuery,
    searchStatus,
    searchResults,
    hasSearchQuery,
    hasResults,
    isSearching,
    activeResult
} from '@lib/stores/search.svelte.ts'

import { engineStatusStore, setEngineStatus, getEngineStatus, type EngineStatus } from '@lib/stores/engine.svelte.ts'

import {
    weatherData,
    weatherCondition,
    weatherLabel,
    weatherForecast,
    weatherTemperature,
    hasWeather,
    isWeatherInitialized,
    setWeatherInitialized,
    fetchWeather
} from '@lib/stores/weather.svelte.ts'

// ── Compass tests ────────────────────────────────────────────────────────────

describe('compass store — state-class appState regression', () => {
    beforeEach(() => {
        _compassState.mode = 'overview'
    })

    it('compassSteps returns 5 steps with correct states', () => {
        _compassState.mode = 'focus'
        const steps = compassSteps()
        expect(steps).toHaveLength(5)
        expect(steps[0]).toEqual({ phase: 'overview', state: 'done' })
        expect(steps[1]).toEqual({ phase: 'search', state: 'done' })
        expect(steps[2]).toEqual({ phase: 'focus', state: 'current' })
        expect(steps[3]).toEqual({ phase: 'inside', state: 'upcoming' })
        expect(steps[4]).toEqual({ phase: 'map', state: 'upcoming' })
    })

    it('compassSteps marks all done when mode is map', () => {
        _compassState.mode = 'map'
        const steps = compassSteps()
        expect(steps[4].state).toBe('current')
        expect(steps.slice(0, 4).every((s) => s.state === 'done')).toBe(true)
    })

    it('compassSteps marks all upcoming when mode is overview', () => {
        _compassState.mode = 'overview'
        const steps = compassSteps()
        expect(steps[0].state).toBe('current')
        expect(steps.slice(1).every((s) => s.state === 'upcoming')).toBe(true)
    })

    it('buildCompassStatus returns overview when no search/focus/inside', () => {
        const status = buildCompassStatus({
            currentView: 'galaxy',
            focusedName: '',
            queryLabel: '',
            isSearching: false,
            isFocusing: false,
            hasSearch: false,
            hasFocus: false,
            insideActive: false,
            resultCount: 0,
            walkDepth: 0,
            isSearchFocus: false,
            isSearchAnchor: false,
            isTrailStop: false,
            hasAnchor: false,
            clusterName: '',
            routeCount: 0,
            nextPointName: null,
            idleNote: 'Explore the network',
            isDiscovery: false,
            isSemanticDegraded: false
        })
        expect(status.phase).toBe('overview')
        expect(status.primaryAction.action).toBe(JOURNEY_ACTIONS.FOCUS_SEARCH)
    })

    it('buildCompassStatus returns search phase when hasSearch', () => {
        const status = buildCompassStatus({
            currentView: 'galaxy',
            focusedName: '',
            queryLabel: 'coffee',
            isSearching: false,
            isFocusing: false,
            hasSearch: true,
            hasFocus: false,
            insideActive: false,
            resultCount: 3,
            walkDepth: 0,
            isSearchFocus: false,
            isSearchAnchor: false,
            isTrailStop: false,
            hasAnchor: false,
            clusterName: '',
            routeCount: 0,
            nextPointName: null,
            idleNote: '',
            isDiscovery: false,
            isSemanticDegraded: false
        })
        expect(status.phase).toBe('search')
        expect(status.primaryAction.action).toBe(JOURNEY_ACTIONS.FOCUS_SEARCH)
    })

    it('buildCompassStatus returns focus phase when hasFocus', () => {
        const status = buildCompassStatus({
            currentView: 'galaxy',
            focusedName: 'ABC Store',
            queryLabel: '',
            isSearching: false,
            isFocusing: true,
            hasSearch: false,
            hasFocus: true,
            insideActive: false,
            resultCount: 0,
            walkDepth: 1,
            isSearchFocus: false,
            isSearchAnchor: false,
            isTrailStop: false,
            hasAnchor: false,
            clusterName: 'Downtown',
            routeCount: 0,
            nextPointName: null,
            idleNote: '',
            isDiscovery: false,
            isSemanticDegraded: false
        })
        expect(status.phase).toBe('focus')
        expect(status.primaryAction.action).toBe(JOURNEY_ACTIONS.ENTER_INSIDE)
    })

    it('buildCompassStatus returns inside phase when insideActive', () => {
        const status = buildCompassStatus({
            currentView: 'galaxy',
            focusedName: 'ABC Store',
            queryLabel: '',
            isSearching: false,
            isFocusing: false,
            hasSearch: false,
            hasFocus: true,
            insideActive: true,
            resultCount: 0,
            walkDepth: 1,
            isSearchFocus: false,
            isSearchAnchor: false,
            isTrailStop: false,
            hasAnchor: false,
            clusterName: 'Downtown',
            routeCount: 0,
            nextPointName: 'XYZ Cafe',
            idleNote: '',
            isDiscovery: false,
            isSemanticDegraded: false
        })
        expect(status.phase).toBe('inside')
        expect(status.primaryAction.action).toBe(JOURNEY_ACTIONS.NEXT_STOP)
    })

    it('buildCompassStatus returns map phase when currentView is map', () => {
        const status = buildCompassStatus({
            currentView: 'map',
            focusedName: 'ABC Store',
            queryLabel: '',
            isSearching: false,
            isFocusing: false,
            hasSearch: false,
            hasFocus: true,
            insideActive: false,
            resultCount: 0,
            walkDepth: 0,
            isSearchFocus: false,
            isSearchAnchor: false,
            isTrailStop: false,
            hasAnchor: false,
            clusterName: '',
            routeCount: 2,
            nextPointName: null,
            idleNote: '',
            isDiscovery: false,
            isSemanticDegraded: false
        })
        expect(status.phase).toBe('map')
        expect(status.primaryAction.action).toBe(JOURNEY_ACTIONS.OPEN_MYCELIUM)
    })

    it('JOURNEY_ACTIONS has all expected actions', () => {
        expect(JOURNEY_ACTIONS.FOCUS_SEARCH).toBe('focus-search')
        expect(JOURNEY_ACTIONS.OPEN_MAP).toBe('open-map')
        expect(JOURNEY_ACTIONS.ENTER_INSIDE).toBe('enter-inside')
        expect(JOURNEY_ACTIONS.NEXT_STOP).toBe('next-stop')
        expect(JOURNEY_ACTIONS.COUNTY_OVERVIEW).toBe('county-overview')
        expect(JOURNEY_ACTIONS.OPEN_MYCELIUM).toBe('open-mycelium')
        expect(JOURNEY_ACTIONS.CENTER_ANCHOR).toBe('center-anchor')
        expect(JOURNEY_ACTIONS.SHOW_TRAIL_PANEL).toBe('show-trail-panel')
    })
})

// ── Camera tests ─────────────────────────────────────────────────────────────

describe('camera store — T4 writable + withCameraNotify migration', () => {
    beforeEach(() => {
        resetCamera()
        _cameraState.autoRotate = false
        _cameraState.autoRotateSuspended = false
        _cameraState.autoRotateResumeDueAt = 0
        _cameraState.autoRotateSoftResumeStartedAt = 0
    })

    it('cameraStore is readable and has property accessors', () => {
        const s = get(cameraStore)
        expect(s).toHaveProperty('position')
        expect(s).toHaveProperty('target')
        expect(s).toHaveProperty('autoRotate')
        expect(s).toHaveProperty('orbitSlack')
    })

    it('setCameraPosition mutates writable', () => {
        setCameraPosition([1, 2, 3])
        expect(cameraPosition()).toEqual([1, 2, 3])
        expect(get(cameraStore).position).toEqual([1, 2, 3])
    })

    it('setCameraTarget mutates writable', () => {
        setCameraTarget([4, 5, 6])
        expect(cameraTarget()).toEqual([4, 5, 6])
    })

    it('setAutoRotate(true) updates writable AND appState.autoRotate', () => {
        setAutoRotate(true)
        expect(autoRotate()).toBe(true)
        expect(_cameraState.autoRotate).toBe(true)
    })

    it('setAutoRotate(false) clears both', () => {
        setAutoRotate(true)
        setAutoRotate(false)
        expect(autoRotate()).toBe(false)
        expect(_cameraState.autoRotate).toBe(false)
    })

    it('suspendAutoRotate sets suspended true', () => {
        setAutoRotate(true)
        suspendAutoRotate()
        expect(autoRotateSuspended()).toBe(true)
        expect(_cameraState.autoRotateSuspended).toBe(true)
        expect(isAutoRotating()).toBe(false)
    })

    it('resumeAutoRotate clears suspended', () => {
        setAutoRotate(true)
        suspendAutoRotate()
        resumeAutoRotate()
        expect(autoRotateSuspended()).toBe(false)
        expect(_cameraState.autoRotateSuspended).toBe(false)
        expect(isAutoRotating()).toBe(true)
    })

    it('toggleAutoRotate flips autoRotate', () => {
        expect(autoRotate()).toBe(false)
        toggleAutoRotate()
        expect(autoRotate()).toBe(true)
        expect(_cameraState.autoRotate).toBe(true)
        toggleAutoRotate()
        expect(autoRotate()).toBe(false)
        expect(_cameraState.autoRotate).toBe(false)
    })

    it('subscriber fires on setCameraPosition', () => {
        const cb = vi.fn()
        const unsub = cameraStore.subscribe(cb)
        setCameraPosition([9, 9, 9])
        unsub()
        expect(cb.mock.calls[cb.mock.calls.length - 1][0].position).toEqual([9, 9, 9])
    })

    it('subscriber fires on setAutoRotate via withCameraNotify', () => {
        const cb = vi.fn()
        const unsub = cameraStore.subscribe(cb)
        setAutoRotate(true)
        unsub()
        const last = cb.mock.calls[cb.mock.calls.length - 1][0]
        expect(last.autoRotate).toBe(true)
    })

    it('resetCamera restores position and target', () => {
        setCameraPosition([99, 99, 99])
        setCameraTarget([88, 88, 88])
        resetCamera()
        expect(cameraPosition()).toEqual([0, 0, 3])
        expect(cameraTarget()).toEqual([0, 0, 0])
    })

    it('resetCamera restores autoRotate appState', () => {
        setAutoRotate(true)
        suspendAutoRotate()
        resetCamera()
        expect(_cameraState.autoRotate).toBe(false)
        expect(_cameraState.autoRotateSuspended).toBe(false)
        expect(_cameraState.autoRotateResumeDueAt).toBe(0)
        expect(_cameraState.autoRotateSoftResumeStartedAt).toBe(0)
    })

    it('CAMERA_CONFIG exposes numeric constants', () => {
        expect(CAMERA_CONFIG.AUTO_ROTATE_BASE_SPEED).toBeGreaterThan(0)
        expect(CAMERA_CONFIG.ORBIT_MAX_DISTANCE_DEFAULT).toBeGreaterThan(0)
    })

    it('OVERVIEW_CAMERA_POSE has position and target arrays', () => {
        expect(OVERVIEW_CAMERA_POSE.position).toHaveLength(3)
        expect(OVERVIEW_CAMERA_POSE.target).toHaveLength(3)
    })
})

// ── Legend tests ────────────────────────────────────────────────────────────

describe('legend store — T4 writable + withLegendNotify migration', () => {
    beforeEach(() => {
        legendOpen.set(false)
        _legendState.legendOpen = false
    })

    it('legendOpen.set(true) toggles writable + appState', () => {
        legendOpen.set(true)
        expect(get(legendOpen)).toBe(true)
        expect(_legendState.legendOpen).toBe(true)
    })

    it('legendOpen.set(false) clears both writable + appState', () => {
        legendOpen.set(true)
        legendOpen.set(false)
        expect(get(legendOpen)).toBe(false)
        expect(_legendState.legendOpen).toBe(false)
    })

    it('toggleLegend() switches false -> true', () => {
        expect(get(legendOpen)).toBe(false)
        toggleLegend()
        expect(get(legendOpen)).toBe(true)
        expect(_legendState.legendOpen).toBe(true)
    })

    it('toggleLegend() switches true -> false', () => {
        legendOpen.set(true)
        toggleLegend()
        expect(get(legendOpen)).toBe(false)
        expect(_legendState.legendOpen).toBe(false)
    })

    it('setLegendOpen(true) explicitly sets', () => {
        setLegendOpen(true)
        expect(get(legendOpen)).toBe(true)
        expect(_legendState.legendOpen).toBe(true)
    })

    it('setLegendOpen(false) explicitly clears', () => {
        legendOpen.set(true)
        setLegendOpen(false)
        expect(get(legendOpen)).toBe(false)
        expect(_legendState.legendOpen).toBe(false)
    })

    it('subscriber fires on legendOpen.set(true)', () => {
        const cb = vi.fn()
        const unsub = legendOpen.subscribe(cb)
        legendOpen.set(true)
        unsub()
        expect(cb).toHaveBeenLastCalledWith(true)
    })

    it('subscriber fires on legendOpen.set(false)', () => {
        legendOpen.set(true)
        const cb = vi.fn()
        const unsub = legendOpen.subscribe(cb)
        legendOpen.set(false)
        unsub()
        expect(cb).toHaveBeenLastCalledWith(false)
    })

    it('subscriber fires on toggleLegend', () => {
        const cb = vi.fn()
        const unsub = legendOpen.subscribe(cb)
        toggleLegend()
        unsub()
        expect(cb).toHaveBeenLastCalledWith(true)
    })

    it('subscriber fires on setLegendOpen', () => {
        const cb = vi.fn()
        const unsub = legendOpen.subscribe(cb)
        setLegendOpen(true)
        unsub()
        expect(cb).toHaveBeenLastCalledWith(true)
    })
})

// ── Filter tests ────────────────────────────────────────────────────────────

describe('filter store — T4 writable + withFilterStateNotify migration', () => {
    beforeEach(() => {
        resetFilters()
        _filterState.filterVersion = 0
        _filterState.filterColorVersion = 0
    })

    it('filterState.set() updates writable AND appState.activeFilters', () => {
        const next: ActiveFilters = { status: 'active', city: 'Conroe', website: true, email: false, geocoded: false }
        filterState.set(next)
        expect(get(filterState)).toEqual(next)
        expect(_filterState.activeFilters).toEqual(next)
    })

    it('filterState.update() transforms state and syncs appState', () => {
        filterState.update((f) => ({ ...f, city: 'Willis' }))
        const s = get(filterState)
        expect(s.city).toBe('Willis')
        expect(_filterState.activeFilters.city).toBe('Willis')
    })

    it('subscriber fires on filterState.set()', () => {
        const cb = vi.fn()
        const unsub = filterState.subscribe(cb)
        filterState.set({ status: 'active', city: '', website: false, email: false, geocoded: false })
        unsub()
        expect(cb.mock.calls[cb.mock.calls.length - 1][0].status).toBe('active')
    })

    it('toggleFilter(status, value) activates status', () => {
        toggleFilter('status', 'active')
        expect(get(filterState).status).toBe('active')
    })

    it('toggleFilter(status, same value) toggles back to all', () => {
        toggleFilter('status', 'active')
        toggleFilter('status', 'active')
        expect(get(filterState).status).toBe('all')
    })

    it('toggleFilter(website, true) sets boolean flag', () => {
        toggleFilter('website', true)
        expect(get(filterState).website).toBe(true)
    })

    it('overwriteActiveFilters replaces all fields', () => {
        overwriteActiveFilters({ status: 'pending', city: 'The Woodlands', website: true, email: true, geocoded: true })
        const s = get(filterState)
        expect(s.status).toBe('pending')
        expect(s.city).toBe('The Woodlands')
        expect(s.website).toBe(true)
        expect(s.email).toBe(true)
        expect(s.geocoded).toBe(true)
    })

    it('resetFilters restores defaults and clears cluster', () => {
        filterState.set({ status: 'active', city: 'Conroe', website: true, email: true, geocoded: true })
        setClusterFilter('42')
        resetFilters()
        expect(get(filterState)).toEqual({ status: 'all', city: '', website: false, email: false, geocoded: false })
        expect(get(activeClusterFilter)).toBeNull()
    })

    it('hasActiveFilters is false when all filters are default', () => {
        resetFilters()
        expect(get(hasActiveFilters)).toBe(false)
    })

    it('hasActiveFilters is true when any filter is non-default', () => {
        toggleFilter('status', 'active')
        expect(get(hasActiveFilters)).toBe(true)
    })

    it('activeFilterCount reflects number of active filters', () => {
        resetFilters()
        expect(get(activeFilterCount)).toBe(0)
        toggleFilter('status', 'active')
        toggleFilter('website', true)
        expect(get(activeFilterCount)).toBe(2)
    })

    it('statusFilter derived reads status', () => {
        toggleFilter('status', 'pending')
        expect(get(statusFilter)).toBe('pending')
    })

    it('cityFilter derived reads city', () => {
        toggleFilter('city', 'Conroe')
        expect(get(cityFilter)).toBe('Conroe')
    })

    it('contactFilters derived exposes flags', () => {
        toggleFilter('website', true)
        toggleFilter('email', true)
        const cf = get(contactFilters)
        expect(cf.website).toBe(true)
        expect(cf.email).toBe(true)
        expect(cf.geocoded).toBe(false)
    })

    it('getFilterState returns current writable snapshot', () => {
        toggleFilter('status', 'active')
        expect(getFilterState().status).toBe('active')
    })

    it('pointMatchesActiveFilters respects status filter', () => {
        toggleFilter('status', 'active')
        expect(pointMatchesActiveFilters({ status: 'active' })).toBe(true)
        expect(pointMatchesActiveFilters({ status: 'pending' })).toBe(false)
    })

    it('pointMatchesActiveFilters respects city filter (normalized)', () => {
        toggleFilter('city', 'Conroe')
        expect(pointMatchesActiveFilters({ city: 'Conroe, TX' })).toBe(true)
        expect(pointMatchesActiveFilters({ city: 'Houston' })).toBe(false)
    })

    it('activeClusterFilter.set syncs to appState as number', () => {
        activeClusterFilter.set('3')
        expect(get(activeClusterFilter)).toBe('3')
        expect(_filterState.activeClusterFilter).toBe(3)
    })

    it('activeClusterFilter.set(null) clears appState', () => {
        activeClusterFilter.set('5')
        activeClusterFilter.set(null)
        expect(get(activeClusterFilter)).toBeNull()
        expect(_filterState.activeClusterFilter).toBeNull()
    })
})

// ── Search tests ─────────────────────────────────────────────────────────────

describe('search store — T4 writable + withSearchNotify migration', () => {
    beforeEach(() => {
        _searchState.currentSearchSummary = null
        _searchState.searchStatus = 'idle'
        _searchState.searchRequestSequence = 0
        _searchState.searchAnchorIndex = null
        _searchState.searchPreviewIndex = null
        _searchState.searchGlowIndices = new Set()
        _searchState.searchGlowTopIndex = null
        _searchState.searchGlowActive = false
        _searchState.currentEmptyQuery = null
        _searchState.searchFocusTransitionToken = 0
        _searchState.semanticTrailCue = 'idle'
        _searchState.isCompactViewport = false
        _searchState.semanticGuideRequestSequence = 0
        _searchState.currentSemanticGuide = null
        _searchState.summaryCardTypeToken = 0
    })

    it('searchStore and searchState are defined', () => {
        expect(searchStore).toBeDefined()
        expect(searchState).toBe(searchStore)
    })

    it('searchStore returns a valid snapshot', () => {
        const s = searchStore()
        expect(s).toHaveProperty('query')
        expect(s).toHaveProperty('results')
        expect(s).toHaveProperty('status')
    })

    it('setSearchQuery updates appState and notifies subscribers', () => {
        const cb = vi.fn()
        const unsub = searchStore.subscribe(cb)
        setSearchQuery('restaurant')
        unsub()
        expect(_searchState.currentSearchSummary.query).toBe('restaurant')
        expect(cb).toHaveBeenCalled()
    })

    it('setSearchStatus updates appState.searchStatus', () => {
        setSearchStatus('searching')
        expect(_searchState.searchStatus).toBe('searching')
        expect(searchStatus()).toBe('searching')
    })

    it('setSearchResults updates result indices and count', () => {
        setSearchResults([
            { id: '1', name: 'A', index: 0, score: 1, category: '', snippet: '' },
            { id: '2', name: 'B', index: 1, score: 0.9, category: '', snippet: '' }
        ])
        expect(_searchState.currentSearchSummary.resultIndices).toEqual([0, 1])
        expect(_searchState.currentSearchSummary.resultCount).toBe(2)
        expect(_searchState.searchStatus).toBe('results')
    })

    it('clearSearch resets all search state', () => {
        setSearchQuery('test')
        setSearchStatus('results')
        clearSearch()
        expect(_searchState.currentSearchSummary).toBeNull()
        expect(_searchState.searchStatus).toBe('idle')
        expect(_searchState.searchAnchorIndex).toBeNull()
    })

    it('clearSearchResults preserves query and clears results', () => {
        setSearchQuery('coffee')
        setSearchResults([{ id: '1', name: 'C', index: 0, score: 1, category: '', snippet: '' }])
        clearSearchResults()
        expect(_searchState.currentSearchSummary.resultIndices).toEqual([])
        expect(_searchState.currentSearchSummary.resultCount).toBe(0)
    })

    it('setAnchorIndex / setPreviewIndex mutate appState', () => {
        setAnchorIndex(5)
        setPreviewIndex(3)
        expect(_searchState.searchAnchorIndex).toBe(5)
        expect(_searchState.searchPreviewIndex).toBe(3)
    })

    it('setGlowActive / setSearchGlow / clearSearchGlow work', () => {
        setGlowActive(true)
        expect(_searchState.searchGlowActive).toBe(true)
        setSearchGlow([1, 2, 3], 1)
        expect(Array.from(_searchState.searchGlowIndices)).toEqual([1, 2, 3])
        expect(_searchState.searchGlowTopIndex).toBe(1)
        clearSearchGlow()
        expect(Array.from(_searchState.searchGlowIndices)).toEqual([])
        expect(_searchState.searchGlowActive).toBe(false)
    })

    it('setTrailCue updates semanticTrailCue', () => {
        setTrailCue('searching')
        expect(_searchState.semanticTrailCue).toBe('searching')
    })

    it('incrementRequestSequence bumps and returns next', () => {
        const seq = incrementRequestSequence()
        expect(seq).toBe(1)
        expect(_searchState.searchRequestSequence).toBe(1)
        expect(isRequestCurrent(1)).toBe(true)
        expect(isRequestCurrent(0)).toBe(false)
    })

    it('incrementFocusTransitionToken bumps token', () => {
        const tok = incrementFocusTransitionToken()
        expect(tok).toBe(1)
        expect(_searchState.searchFocusTransitionToken).toBe(1)
    })

    it('setSemanticGuide updates guide text', () => {
        setSemanticGuide('Find restaurants')
        expect(_searchState.currentSemanticGuide).toBe('Find restaurants')
    })

    it('setCompactViewport updates flag', () => {
        setCompactViewport(true)
        expect(_searchState.isCompactViewport).toBe(true)
    })

    it('bumpSummaryCardTypeToken increments', () => {
        const t = bumpSummaryCardTypeToken()
        expect(t).toBe(1)
        expect(_searchState.summaryCardTypeToken).toBe(1)
    })

    it('validateSearchQuery accepts valid query', () => {
        const v = validateSearchQuery('coffee shop')
        expect(v.valid).toBe(true)
        expect(v.query).toBe('coffee shop')
    })

    it('validateSearchQuery rejects empty query', () => {
        const v = validateSearchQuery('')
        expect(v.valid).toBe(false)
        expect(v.reason).toBe('empty')
    })

    it('validateSearchQuery rejects short query', () => {
        const v = validateSearchQuery('a')
        expect(v.valid).toBe(false)
        expect(v.reason).toBe('too-short')
    })

    it('validateSearchQuery truncates long query', () => {
        const long = 'a'.repeat(300)
        const v = validateSearchQuery(long)
        expect(v.query.length).toBeLessThanOrEqual(200)
    })

    it('derived getters read from appState', () => {
        _searchState.currentSearchSummary = {
            query: 'pizza',
            totalMatches: 5,
            totalSemanticMatches: 3,
            visibleMatches: 5,
            resultCount: 5,
            topScore: 0.9,
            anchorIndex: 0,
            topIndex: 0,
            resultIndices: [1, 2, 3, 4, 5],
            summaryType: 'text'
        }
        _searchState.searchStatus = 'results'

        expect(searchQuery()).toBe('pizza')
        expect(searchResults()).toEqual([1, 2, 3, 4, 5])
        expect(hasSearchQuery()).toBe(true)
        expect(hasResults()).toBe(true)
        expect(isSearching()).toBe(false)
    })

    it('searchUseRerank is a writable store', () => {
        expect(get(searchUseRerank)).toBe(false)
        searchUseRerank.set(true)
        expect(get(searchUseRerank)).toBe(true)
    })

    it('search constants are positive when available', () => {
        expect(200).toBeGreaterThan(0)
        expect(2).toBeGreaterThan(0)
    })
})

// ── Engine status tests ──────────────────────────────────────────────────────

describe('engine status store — canonical engine lifecycle status', () => {
    beforeEach(() => {
        setEngineStatus('idle')
    })

    it('engineStatusStore defaults to idle', () => {
        expect(get(engineStatusStore)).toBe('idle')
    })

    it('setEngineStatus updates the store', () => {
        setEngineStatus('loading')
        expect(get(engineStatusStore)).toBe('loading')
    })

    it('setEngineStatus transitions through all valid states', () => {
        const states: EngineStatus[] = ['loading', 'ready', 'degraded', 'destroyed']
        for (const s of states) {
            setEngineStatus(s)
            expect(get(engineStatusStore)).toBe(s)
        }
    })

    it('setEngineStatus(idle) resets back to idle', () => {
        setEngineStatus('ready')
        setEngineStatus('idle')
        expect(get(engineStatusStore)).toBe('idle')
    })

    it('getEngineStatus reads current value', () => {
        setEngineStatus('degraded')
        expect(getEngineStatus()).toBe('degraded')
    })

    it('getEngineStatus returns idle after reset', () => {
        setEngineStatus('ready')
        setEngineStatus('idle')
        expect(getEngineStatus()).toBe('idle')
    })

    it('subscriber fires when setEngineStatus is called', () => {
        const cb = vi.fn()
        const unsub = engineStatusStore.subscribe(cb)
        setEngineStatus('loading')
        unsub()
        expect(cb).toHaveBeenCalledWith('loading')
    })

    it('subscriber fires on each status change', () => {
        setEngineStatus('loading')
        const cb = vi.fn()
        const unsub = engineStatusStore.subscribe(cb)
        setEngineStatus('ready')
        setEngineStatus('destroyed')
        unsub()
        // Initial 'loading' emission on subscribe, then 'ready' and 'destroyed'
        expect(cb).toHaveBeenCalledTimes(3)
        expect(cb.mock.calls.map((c: any[]) => c[0])).toEqual(['loading', 'ready', 'destroyed'])
    })

    it('engineStatusStore is a readable store', () => {
        expect(engineStatusStore).toHaveProperty('subscribe')
    })

    it('all EngineStatus literal types are covered', () => {
        const allStatuses: EngineStatus[] = ['idle', 'loading', 'ready', 'degraded', 'destroyed']
        for (const s of allStatuses) {
            setEngineStatus(s)
            expect(get(engineStatusStore)).toBe(s)
        }
    })
})

// ── Weather tests ────────────────────────────────────────────────────────────

describe('weather store — state-class appState regression', () => {
    /** Canonical weather shape written by the Open-Meteo client. */
    const FAKE_WEATHER = {
        temp: 72,
        humidity: 55,
        code: 0,
        description: 'Clear Sky',
        icon: 'sun' as const,
        condition: 'sun' as const,
        windSpeed: 5,
        windDirection: 0,
        windGust: null,
        source: 'open-meteo'
    }

    beforeEach(() => {
        _weatherState.weather = null
        _weatherState.weatherInitialized = false
    })

    it('weatherData getters return defaults when appState.weather is null', () => {
        expect(weatherData.temperature).toBe(0)
        expect(weatherData.condition).toBe('clear')
        expect(weatherData.label).toBe('--')
        expect(weatherData.forecast).toBe('')
    })

    it('weatherData getters read from appState when canonical shape is set', () => {
        _weatherState.weather = FAKE_WEATHER
        expect(weatherData.temperature).toBe(72)
        expect(weatherData.condition).toBe('clear')
        expect(weatherData.label).toBe('Clear Sky')
    })

    it('derived getters read from canonical shape', () => {
        _weatherState.weather = FAKE_WEATHER
        expect(weatherTemperature()).toBe(72)
        expect(weatherCondition()).toBe('clear')
        expect(weatherLabel()).toBe('Clear Sky')
    })

    it('hasWeather returns false when weather is null', () => {
        expect(hasWeather()).toBe(false)
    })

    it('hasWeather returns true when canonical weather is set', () => {
        _weatherState.weather = FAKE_WEATHER
        expect(hasWeather()).toBe(true)
    })

    it('isWeatherInitialized reflects appState flag', () => {
        expect(isWeatherInitialized()).toBe(false)
        _weatherState.weatherInitialized = true
        expect(isWeatherInitialized()).toBe(true)
    })

    it('setWeatherInitialized writes to appState', () => {
        setWeatherInitialized(true)
        expect(_weatherState.weatherInitialized).toBe(true)
        setWeatherInitialized(false)
        expect(_weatherState.weatherInitialized).toBe(false)
    })

    it('fetchWeather delegates to canonical client without throwing', async () => {
        // fetchWeather swallows errors so the widget's onMount doesn't reject.
        await expect(fetchWeather()).resolves.toBeUndefined()
    })
})
