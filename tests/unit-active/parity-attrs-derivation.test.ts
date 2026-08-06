import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * @vitest-environment jsdom
 *
 * Unit tests for the IIFE derivation closures inside computeParityAttributes()
 * at src/lib/orchestration/parity-attrs.svelte.ts.
 *
 * Previously, computeParityAttributes() was only integration-tested via the
 * live probe at port 4174. The W15 regression in the journeyPhase IIFE would
 * have been caught by direct unit tests. This file fills that gap.
 *
 * Strategy: mock every store module that parity-attrs.svelte.ts imports,
 * provide synthetic snapshots via vi.hoisted mutable refs, and assert each
 * derivation branch.
 */

// ── Hoisted mutable snapshots ───────────────────────────────────────────────
// Each ref is an object that tests mutate before calling computeParityAttributes().
// The mock functions capture these by reference, so mutations are visible.

const _nav = vi.hoisted(() => ({
    mode: 'overview' as string,
    surface: 'idle' as string,
    focusedIndex: null as number | null,
    currentView: 'galaxy' as string,
    trailDepth: 0,
    walkHistoryIndices: [] as number[]
}))

const _journey = vi.hoisted(() => ({
    phase: 'overview' as string,
    depth: 0,
    compass: { phase: 'idle' as string },
    terrainHandoffPhase: 'idle' as string,
    routeExplorationPhase: 'idle' as string,
    trailDepth: 0
}))

const _focus = vi.hoisted(() => ({
    semanticDiveMode: false,
    strandContinuityPhase: 'idle' as string,
    transitionMode: 'idle' as string,
    selectedBusiness: null as any,
    threadInspector: {
        active: false,
        source: 'rail' as string,
        inspectedIndex: null as number | null
    }
}))

const _search = vi.hoisted(() => ({
    query: '',
    summary: null as any,
    status: 'idle' as string
}))

const _filter = vi.hoisted(() => ({
    status: 'all' as string,
    city: '',
    website: false,
    email: false,
    geocoded: false
}))

const _viewport = vi.hoisted(() => ({
    isCompact: false,
    isMobile: false,
    reducedMotion: false,
    width: 1024,
    height: 768,
    dpr: 1,
    isLandscape: true,
    isCompactLandscape: false,
    isUltraCompactPortrait: false
}))

const _camera = vi.hoisted(() => ({
    orbitSlack: { phase: 'idle' as string, reason: '' as string | null },
    routeExplorationPhase: 'idle' as string
}))

const _loadingPhase = vi.hoisted(() => ({ value: 'launch' as string }))
const _appState = vi.hoisted(() => ({
    focusCameraAssistActive: false as boolean,
    focusCameraAssistUntil: 0 as number
}))
const _graphicsMode = vi.hoisted(() => ({ value: 'webgl' as string }))
const _demoPhase = vi.hoisted(() => ({ value: 'IDLE' as string }))

const _compassState = vi.hoisted(() => ({
    phase: 'idle' as string,
    kicker: '',
    title: '',
    note: '',
    primaryAction: { label: '', action: 'none' },
    secondaryAction: null,
    tertiaryAction: null
}))

const _compassPresentation = vi.hoisted(() => ({
    density: 'expanded' as string,
    copy: 'full' as string,
    navigationOwner: 'journey-compass' as string
}))

// ── Module mocks ────────────────────────────────────────────────────────────

vi.mock('@lib/stores/navigation.svelte', () => ({
    navStore: () => _nav
}))

vi.mock('@lib/stores/journey.svelte', () => ({
    journeyStore: () => _journey
}))

vi.mock('@lib/stores/focus.svelte', () => ({
    focusStore: () => _focus
}))

vi.mock('@lib/stores/search.svelte', () => ({
    searchStore: {
        subscribe: (fn: (v: typeof _search) => void) => {
            fn(_search)
            return () => {}
        }
    }
}))

vi.mock('@lib/stores/filter.svelte', () => ({
    filterState: {
        subscribe: (fn: (v: typeof _filter) => void) => {
            fn(_filter)
            return () => {}
        }
    }
}))

vi.mock('@lib/stores/viewport.svelte', () => ({
    viewport: () => _viewport
}))

vi.mock('@lib/stores/camera.svelte', () => ({
    cameraStore: {
        subscribe: (fn: (v: typeof _camera) => void) => {
            fn(_camera)
            return () => {}
        }
    }
}))

vi.mock('@lib/stores/demo.svelte', () => ({
    demoStore: () => ({ phase: _demoPhase.value }),
    demoPhase: () => _demoPhase.value,
    isDemoActive: () => _demoPhase.value !== 'IDLE'
}))

vi.mock('@lib/state/app.svelte', () => ({
    appState: {
        get focusCameraAssistActive() {
            return _appState.focusCameraAssistActive
        },
        get focusCameraAssistUntil() {
            return _appState.focusCameraAssistUntil
        }
    }
}))

vi.mock('@lib/data-store', () => ({
    loadingPhaseStore: {
        subscribe: (fn: (v: string) => void) => {
            fn(_loadingPhase.value)
            return () => {}
        }
    },
    graphicsModeStore: {
        subscribe: (fn: (v: string) => void) => {
            fn(_graphicsMode.value)
            return () => {}
        }
    }
}))

vi.mock('@lib/journey/compass-state', () => ({
    getJourneyCompassState: () => _compassState
}))

vi.mock('@lib/orchestration/compass-controller', () => ({
    getJourneyCompassPresentationState: () => _compassPresentation
}))

// ── Import under test (must appear AFTER vi.mock) ───────────────────────────

// @ts-ignore
import { computeParityAttributes } from '@lib/orchestration/parity-attrs.svelte'

// ── Helpers ─────────────────────────────────────────────────────────────────

function resetAllSnapshots(): void {
    _nav.mode = 'overview'
    _nav.surface = 'idle'
    _nav.focusedIndex = null
    _nav.currentView = 'galaxy'
    _nav.trailDepth = 0
    _nav.walkHistoryIndices = []

    _journey.phase = 'overview'
    _journey.depth = 0
    _journey.compass = { phase: 'idle' }
    _journey.terrainHandoffPhase = 'idle'
    _journey.routeExplorationPhase = 'idle'
    _journey.trailDepth = 0

    _focus.semanticDiveMode = false
    _focus.strandContinuityPhase = 'idle'
    _focus.transitionMode = 'idle'
    _focus.selectedBusiness = null
    _focus.threadInspector = { active: false, source: 'rail', inspectedIndex: null }

    _search.query = ''
    _search.summary = null
    _search.status = 'idle'

    _filter.status = 'all'
    _filter.city = ''
    _filter.website = false
    _filter.email = false
    _filter.geocoded = false

    _viewport.isCompact = false
    _viewport.isMobile = false
    _viewport.reducedMotion = false

    _camera.orbitSlack = { phase: 'idle', reason: '' }
    _camera.routeExplorationPhase = 'idle'

    _loadingPhase.value = 'launch'
    _graphicsMode.value = 'webgl'
    _demoPhase.value = 'IDLE'

    _compassState.phase = 'idle'
    _compassPresentation.density = 'expanded'
    _compassPresentation.copy = 'full'
    _compassPresentation.navigationOwner = 'journey-compass'

    // Reset legacy window state
    try {
        delete (window as any).__APP_STATE__
    } catch {
        /* ignore */
    }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('computeParityAttributes IIFE derivations', () => {
    beforeEach(() => {
        resetAllSnapshots()
    })

    // ── graphContext ──────────────────────────────────────────────────────

    describe('graphContext', () => {
        it('returns "corridor" when isCompact and routeExplorationPhase is "exploring"', () => {
            _viewport.isCompact = true
            _camera.routeExplorationPhase = 'exploring'
            const result = computeParityAttributes()
            expect(result.graphContext).toBe('corridor')
        })

        it('returns "map" when currentView is "map"', () => {
            _nav.currentView = 'map'
            const result = computeParityAttributes()
            expect(result.graphContext).toBe('map')
        })

        it('returns "inside" when mode is "inside"', () => {
            _nav.mode = 'inside'
            const result = computeParityAttributes()
            expect(result.graphContext).toBe('inside')
        })

        it('returns "focus" when mode is "focus"', () => {
            _nav.mode = 'focus'
            _nav.focusedIndex = 42
            const result = computeParityAttributes()
            expect(result.graphContext).toBe('focus')
        })

        it('returns "focus" when mode is "trail"', () => {
            _nav.mode = 'trail'
            _nav.focusedIndex = 42
            const result = computeParityAttributes()
            expect(result.graphContext).toBe('focus')
        })

        it('returns "corridor" when mode is "search"', () => {
            _nav.mode = 'search'
            const result = computeParityAttributes()
            expect(result.graphContext).toBe('corridor')
        })

        it('returns "corridor" when search.summary is set', () => {
            _nav.mode = 'overview'
            _search.summary = { query: 'test', totalMatches: 5 }
            const result = computeParityAttributes()
            expect(result.graphContext).toBe('corridor')
        })

        it('returns "idle" when mode is "overview"', () => {
            const result = computeParityAttributes()
            expect(result.graphContext).toBe('idle')
        })

        it('returns "idle" as default fallback', () => {
            _nav.mode = 'unknown-mode'
            const result = computeParityAttributes()
            expect(result.graphContext).toBe('idle')
        })
    })

    // ── panelSurfaceMode ──────────────────────────────────────────────────

    describe('panelSurfaceMode', () => {
        describe('map view surfaces', () => {
            beforeEach(() => {
                _nav.currentView = 'map'
            })

            it('returns "map-focus-search" when surface is "focus-search" and focus is active', () => {
                _nav.surface = 'focus-search'
                _nav.focusedIndex = 42
                const result = computeParityAttributes()
                expect(result.panelSurfaceMode).toBe('map-focus-search')
            })

            it('returns "map-search" when surface is "search"', () => {
                _nav.surface = 'search'
                const result = computeParityAttributes()
                expect(result.panelSurfaceMode).toBe('map-search')
            })

            it('returns "map-focus-search" when search.summary and focus are both set', () => {
                _nav.surface = 'idle'
                _nav.focusedIndex = 42
                _search.summary = { query: 'test', totalMatches: 3 }
                const result = computeParityAttributes()
                expect(result.panelSurfaceMode).toBe('map-focus-search')
                expect(result.mapContext).toBe('focus-search')
            })

            it('returns "map-search" when search.summary is set', () => {
                _nav.surface = 'idle'
                _search.summary = { query: 'test', totalMatches: 3 }
                const result = computeParityAttributes()
                expect(result.panelSurfaceMode).toBe('map-search')
                expect(result.mapContext).toBe('search')
            })

            it('returns "map-focus" when surface is "focus"', () => {
                _nav.surface = 'focus'
                const result = computeParityAttributes()
                expect(result.panelSurfaceMode).toBe('map-focus')
            })

            it('returns "map-focus-search" when surface is "map-focus-search"', () => {
                _nav.surface = 'map-focus-search'
                const result = computeParityAttributes()
                expect(result.panelSurfaceMode).toBe('map-focus-search')
            })

            it('returns "map-trail" when surface is "map-trail"', () => {
                _nav.surface = 'map-trail'
                const result = computeParityAttributes()
                expect(result.panelSurfaceMode).toBe('map-trail')
            })

            it('returns "map" when surface is "map"', () => {
                _nav.surface = 'map'
                const result = computeParityAttributes()
                expect(result.panelSurfaceMode).toBe('map')
            })

            it('returns "map-idle" as default for map view', () => {
                _nav.surface = 'idle'
                const result = computeParityAttributes()
                expect(result.panelSurfaceMode).toBe('map-idle')
                expect(result.mapContext).toBe('idle')
            })
        })

        describe('non-map view surfaces', () => {
            it('returns "focus-search" when surface is "focus-search"', () => {
                _nav.surface = 'focus-search'
                _nav.focusedIndex = 42
                const result = computeParityAttributes()
                expect(result.panelSurfaceMode).toBe('focus-search')
            })

            it('returns "semantic-dive" when semanticDiveMode is true', () => {
                _nav.surface = 'idle'
                _focus.semanticDiveMode = true
                const result = computeParityAttributes()
                expect(result.panelSurfaceMode).toBe('semantic-dive')
            })

            it('returns "semantic-dive" over stale focus-search surface when semanticDiveMode is true', () => {
                _nav.surface = 'focus-search'
                _nav.focusedIndex = 518
                _focus.semanticDiveMode = true
                const result = computeParityAttributes()
                expect(result.panelSurfaceMode).toBe('semantic-dive')
            })

            it('returns "map-focus-search" when surface is "map-focus-search"', () => {
                _nav.surface = 'map-focus-search'
                const result = computeParityAttributes()
                expect(result.panelSurfaceMode).toBe('map-focus-search')
            })

            it('returns "map-trail" when surface is "map-trail"', () => {
                _nav.surface = 'map-trail'
                const result = computeParityAttributes()
                expect(result.panelSurfaceMode).toBe('map-trail')
            })

            it('returns "thread-inspect" when surface is "thread-inspect"', () => {
                _nav.surface = 'thread-inspect'
                const result = computeParityAttributes()
                expect(result.panelSurfaceMode).toBe('thread-inspect')
            })

            it('returns "search" when surface is "search"', () => {
                _nav.surface = 'search'
                const result = computeParityAttributes()
                expect(result.panelSurfaceMode).toBe('search')
            })

            it('returns "focus" when surface is "focus"', () => {
                _nav.surface = 'focus'
                const result = computeParityAttributes()
                expect(result.panelSurfaceMode).toBe('focus')
            })

            it('returns "inside" when surface is "inside"', () => {
                _nav.surface = 'inside'
                const result = computeParityAttributes()
                expect(result.panelSurfaceMode).toBe('inside')
            })

            it('returns "map" when surface is "map"', () => {
                _nav.surface = 'map'
                const result = computeParityAttributes()
                expect(result.panelSurfaceMode).toBe('map')
            })

            it('returns "idle" as default fallback', () => {
                _nav.surface = 'unknown'
                const result = computeParityAttributes()
                expect(result.panelSurfaceMode).toBe('idle')
            })
        })
    })

    // ── panelSurfaceDetail ────────────────────────────────────────────────

    describe('panelSurfaceDetail', () => {
        it('returns "none" for non-search context', () => {
            _nav.surface = 'focus'
            const result = computeParityAttributes()
            expect(result.panelSurfaceDetail).toBe('none')
        })

        it('returns "none" when search context but no mobileSearchSheet attr', () => {
            _nav.surface = 'search'
            // document.body.dataset.mobileSearchSheet is not set by default
            const result = computeParityAttributes()
            expect(result.panelSurfaceDetail).toBe('none')
        })

        it('returns "expanded" when focus-search context and mobileSearchSheet is "expanded"', () => {
            _nav.surface = 'focus-search'
            document.body.dataset.mobileSearchSheet = 'expanded'
            const result = computeParityAttributes()
            expect(result.panelSurfaceDetail).toBe('expanded')
            delete document.body.dataset.mobileSearchSheet
        })

        it('returns "peek" when focus-search context and mobileSearchSheet is "peek"', () => {
            _nav.surface = 'focus-search'
            document.body.dataset.mobileSearchSheet = 'peek'
            const result = computeParityAttributes()
            expect(result.panelSurfaceDetail).toBe('peek')
            delete document.body.dataset.mobileSearchSheet
        })

        it('returns "expanded" when search context and mobileSearchSheet is "expanded"', () => {
            _nav.surface = 'search'
            document.body.dataset.mobileSearchSheet = 'expanded'
            const result = computeParityAttributes()
            expect(result.panelSurfaceDetail).toBe('expanded')
            delete document.body.dataset.mobileSearchSheet
        })
    })

    // ── focusedNode ───────────────────────────────────────────────────────

    describe('focusedNode', () => {
        it('returns String(focusedIndex) when nav.focusedIndex is a number', () => {
            _nav.focusedIndex = 42
            const result = computeParityAttributes()
            expect(result.focusedNode).toBe('42')
        })

        it('returns String(focusedIndex) for index 0 (edge case: falsy but valid)', () => {
            _nav.focusedIndex = 0
            const result = computeParityAttributes()
            expect(result.focusedNode).toBe('0')
        })

        it('falls back to window.__APP_STATE__.navState.focusedIndex when nav.focusedIndex is null', () => {
            _nav.focusedIndex = null
            ;(window as any).__APP_STATE__ = {
                navState: { focusedIndex: 99 }
            }
            const result = computeParityAttributes()
            expect(result.focusedNode).toBe('99')
            delete (window as any).__APP_STATE__
        })

        it('returns null when both nav.focusedIndex and legacy are null', () => {
            _nav.focusedIndex = null
            const result = computeParityAttributes()
            expect(result.focusedNode).toBeNull()
        })

        it('returns null when legacy focusedIndex is not a number', () => {
            _nav.focusedIndex = null
            ;(window as any).__APP_STATE__ = {
                navState: { focusedIndex: 'not-a-number' }
            }
            const result = computeParityAttributes()
            expect(result.focusedNode).toBeNull()
            delete (window as any).__APP_STATE__
        })
    })

    // ── journeyPhase (W15 critical) ───────────────────────────────────────

    describe('journeyPhase', () => {
        it('returns "focus-search" when hasFocus (focusedIndex) and hasSearchIntent (summary)', () => {
            _nav.focusedIndex = 10
            _search.summary = { query: 'cafe', totalMatches: 5 }
            const result = computeParityAttributes()
            expect(result.journeyPhase).toBe('focus-search')
        })

        it('returns "focus-search" when hasFocus (selectedBusiness) and hasSearchIntent (query >= 2 chars)', () => {
            _nav.focusedIndex = null
            _focus.selectedBusiness = { name: 'Test Cafe', index: 10 }
            _search.query = 'ca'
            _search.summary = null
            const result = computeParityAttributes()
            expect(result.journeyPhase).toBe('focus-search')
        })

        it('returns "focus" when hasFocus (focusedIndex) but no search intent', () => {
            _nav.focusedIndex = 5
            _search.query = ''
            _search.summary = null
            const result = computeParityAttributes()
            expect(result.journeyPhase).toBe('focus')
        })

        it('returns "focus" when hasFocus (selectedBusiness) but no search intent', () => {
            _nav.focusedIndex = null
            _focus.selectedBusiness = { name: 'Test', index: 5 }
            _search.query = ''
            _search.summary = null
            const result = computeParityAttributes()
            expect(result.journeyPhase).toBe('focus')
        })

        it('returns "search" when hasSearchIntent (summary) but no focus', () => {
            _nav.focusedIndex = null
            _focus.selectedBusiness = null
            _search.summary = { query: 'restaurant', totalMatches: 12 }
            const result = computeParityAttributes()
            expect(result.journeyPhase).toBe('search')
        })

        it('returns "search" when hasSearchIntent (query >= 2 chars) but no focus', () => {
            _nav.focusedIndex = null
            _focus.selectedBusiness = null
            _search.query = 'hello'
            _search.summary = null
            const result = computeParityAttributes()
            expect(result.journeyPhase).toBe('search')
        })

        it('returns "inside" when nav.mode is "inside"', () => {
            _nav.mode = 'inside'
            _nav.focusedIndex = null
            _focus.selectedBusiness = null
            _search.query = ''
            _search.summary = null
            const result = computeParityAttributes()
            expect(result.journeyPhase).toBe('inside')
        })

        it('returns "walking" when nav.mode is "trail"', () => {
            _nav.mode = 'trail'
            _nav.focusedIndex = null
            _focus.selectedBusiness = null
            _search.query = ''
            _search.summary = null
            const result = computeParityAttributes()
            expect(result.journeyPhase).toBe('walking')
        })

        it('returns explicit journey.phase when it is "arrived"', () => {
            _nav.mode = 'overview'
            _nav.focusedIndex = null
            _focus.selectedBusiness = null
            _search.query = ''
            _search.summary = null
            _journey.phase = 'arrived'
            const result = computeParityAttributes()
            expect(result.journeyPhase).toBe('arrived')
        })

        it('returns explicit journey.phase when it is "walking"', () => {
            _nav.mode = 'overview'
            _nav.focusedIndex = null
            _focus.selectedBusiness = null
            _search.query = ''
            _search.summary = null
            _journey.phase = 'walking'
            const result = computeParityAttributes()
            expect(result.journeyPhase).toBe('walking')
        })

        it('returns "idle" as last fallback when explicit is "idle"', () => {
            _nav.mode = 'overview'
            _nav.focusedIndex = null
            _focus.selectedBusiness = null
            _search.query = ''
            _search.summary = null
            _journey.phase = 'idle'
            const result = computeParityAttributes()
            expect(result.journeyPhase).toBe('idle')
        })

        it('returns "idle" as last fallback when explicit is empty', () => {
            _nav.mode = 'overview'
            _nav.focusedIndex = null
            _focus.selectedBusiness = null
            _search.query = ''
            _search.summary = null
            _journey.phase = ''
            const result = computeParityAttributes()
            expect(result.journeyPhase).toBe('idle')
        })

        // ── W15 regression test (THE critical case) ──────────────────────

        it('W15 regression: focusedIndex=522 + search.summary set + journey.phase=overview returns focus-search (NOT overview)', () => {
            // This is the exact scenario from the W15 bug: the user clicks a
            // search result, setting focusedIndex=522 and search.summary.
            // The old code read journey.phase (which was still 'overview' from
            // the legacy appState.navState.mode race) and returned 'overview'.
            // The fix derives journeyPhase from nav state + search intent,
            // which correctly returns 'focus-search'.
            _nav.mode = 'focus'
            _nav.surface = 'focus-search'
            _nav.focusedIndex = 522
            _search.summary = { query: 'coffee shops', totalMatches: 8 }
            _journey.phase = 'overview' // <-- the stale legacy value that caused the bug

            const result = computeParityAttributes()

            // MUST be 'focus-search', NOT 'overview'
            expect(result.journeyPhase).toBe('focus-search')
            expect(result.journeyPhase).not.toBe('overview')
        })

        it('W15 regression: focusedIndex=522 + summary + mode=focus returns focus-search', () => {
            _nav.mode = 'focus'
            _nav.focusedIndex = 522
            _search.summary = { query: 'test', totalMatches: 1 }
            _journey.phase = 'focus' // even if journey.phase is correct, derivation should still win

            const result = computeParityAttributes()
            expect(result.journeyPhase).toBe('focus-search')
        })

        it('W15 regression: focusedIndex set + short query (< 2 chars) + no summary returns focus (not search)', () => {
            _nav.focusedIndex = 100
            _search.query = 'c' // too short for search intent
            _search.summary = null

            const result = computeParityAttributes()
            expect(result.journeyPhase).toBe('focus')
        })
    })

    // ── searchStatus ──────────────────────────────────────────────────────

    describe('searchStatus', () => {
        it('returns "focusing" when search.status is "focusing"', () => {
            _search.status = 'focusing'
            const result = computeParityAttributes()
            expect(result.searchStatus).toBe('focusing')
        })

        it('returns "focused" when search.status is "focused"', () => {
            _search.status = 'focused'
            const result = computeParityAttributes()
            expect(result.searchStatus).toBe('focused')
        })

        it('returns "idle" when search.status is undefined/empty', () => {
            _search.status = ''
            const result = computeParityAttributes()
            expect(result.searchStatus).toBe('idle')
        })

        it('returns "searching" when search.status is "searching"', () => {
            _search.status = 'searching'
            const result = computeParityAttributes()
            expect(result.searchStatus).toBe('searching')
        })
    })

    // ── Additional derivation coverage ────────────────────────────────────

    describe('trailState', () => {
        it('returns "active" when journey.depth > 0', () => {
            _journey.depth = 1
            _journey.trailDepth = 1
            const result = computeParityAttributes()
            expect(result.trailState).toBe('active')
        })

        it('returns "active" when navigationOwner is "map-trail-strip"', () => {
            _compassPresentation.navigationOwner = 'map-trail-strip'
            const result = computeParityAttributes()
            expect(result.trailState).toBe('active')
        })

        it('returns "inactive" when depth is 0 and not trail strip', () => {
            const result = computeParityAttributes()
            expect(result.trailState).toBe('inactive')
        })
    })

    describe('semanticDive', () => {
        it('returns "active" when semanticDiveMode is true (no transient window)', () => {
            _nav.focusedIndex = 42
            _focus.semanticDiveMode = true
            const result = computeParityAttributes()
            expect(result.semanticDive).toBe('active')
        })

        it('returns "transitioning" only inside the armed deadline window (dive entrance )', () => {
            _nav.focusedIndex = 42
            _focus.semanticDiveMode = true
            ;(window as any).__APP_STATE__ = {
                focusState: { _semanticDiveTransitionDeadline: Date.now() + 1200 }
            }
            try {
                const result = computeParityAttributes()
                expect(result.semanticDive).toBe('transitioning')
            } finally {
                delete (window as any).__APP_STATE__
            }
        })

        it('returns "active" once the deadline window has lapsed', () => {
            _nav.focusedIndex = 42
            _focus.semanticDiveMode = true
            ;(window as any).__APP_STATE__ = {
                // Boundary: deadline set in the past (no longer in the 1200ms window)
                focusState: { _semanticDiveTransitionDeadline: Date.now() - 100 }
            }
            try {
                const result = computeParityAttributes()
                expect(result.semanticDive).toBe('active')
            } finally {
                delete (window as any).__APP_STATE__
            }
        })

        it('returns "inactive" when not diving', () => {
            const result = computeParityAttributes()
            expect(result.semanticDive).toBe('inactive')
        })
    })

    describe('loadingPhase / sceneReady / viewHandoffActive', () => {
        it('returns launch-ready state when loadingPhase is "launch"', () => {
            _loadingPhase.value = 'launch'
            const result = computeParityAttributes()
            expect(result.loadingOverlay).toBe('hidden')
            expect(result.sceneReady).toBe('true')
            expect(result.viewHandoffActive).toBe('false')
            expect(result.cameraAssist).toBe('free')
        })

        it('returns loading state when loadingPhase is "records"', () => {
            _loadingPhase.value = 'records'
            const result = computeParityAttributes()
            expect(result.loadingOverlay).toBe('visible')
            expect(result.sceneReady).toBe('false')
            expect(result.viewHandoffActive).toBe('true')
            // cameraAssist is decoupled from loadingPhase in W47+ tier-2 fix.
            // It's tied to appState.focusCameraAssistActive, not launchReady.
            expect(result.cameraAssist).toBe('free')
        })
    })

    describe('cameraAssist (camera-in-flight state, tier-2 fix)', () => {
        it('returns "free" when appState.focusCameraAssistActive is false', () => {
            _loadingPhase.value = 'records' // loading state, but camera not in flight
            _appState.focusCameraAssistActive = false
            const result = computeParityAttributes()
            expect(result.cameraAssist).toBe('free')
        })

        it('returns "arriving" when appState.focusCameraAssistActive is true', () => {
            _loadingPhase.value = 'launch' // launch state, AND camera in flight
            _appState.focusCameraAssistActive = true
            const result = computeParityAttributes()
            expect(result.cameraAssist).toBe('arriving')
        })

        it('returns "arriving" regardless of loadingPhase when camera is in flight', () => {
            // Verify decoupling: loading phase should not affect cameraAssist.
            _loadingPhase.value = 'records'
            _appState.focusCameraAssistActive = true
            const result = computeParityAttributes()
            expect(result.cameraAssist).toBe('arriving')
            // Other attrs still reflect loadingPhase
            expect(result.loadingOverlay).toBe('visible')
            expect(result.sceneReady).toBe('false')
        })
    })

    describe('filtersActive', () => {
        it('returns "true" when filter status is not "all"', () => {
            _filter.status = 'active'
            const result = computeParityAttributes()
            expect(result.filtersActive).toBe('true')
        })

        it('returns "true" when city is set', () => {
            _filter.city = 'Bethesda'
            const result = computeParityAttributes()
            expect(result.filtersActive).toBe('true')
        })

        it('returns "true" when website filter is on', () => {
            _filter.website = true
            const result = computeParityAttributes()
            expect(result.filtersActive).toBe('true')
        })

        it('returns "false" when no filters are active', () => {
            const result = computeParityAttributes()
            expect(result.filtersActive).toBe('false')
        })
    })

    describe('viewport attributes', () => {
        it('reflects compact viewport', () => {
            _viewport.isCompact = true
            _viewport.isMobile = true
            const result = computeParityAttributes()
            expect(result.compact).toBe('true')
            expect(result.mobile).toBe('true')
        })

        it('reflects reduced motion', () => {
            _viewport.reducedMotion = true
            const result = computeParityAttributes()
            expect(result.reducedMotion).toBe('true')
        })
    })

    describe('compass attributes', () => {
        // Note: bare `journeyCompass` and `journeyCompassDensity` were
        // retired in commit 501bc59f — they were declared but never read in
        // src/. journeyCompassPhase and journeyNavigationOwner carry the
        // same semantics. Tests below verify the surviving attributes.

        it('reflects compass phase from journey.compass', () => {
            _journey.compass = { phase: 'active' }
            const result = computeParityAttributes()
            expect(result.journeyCompassPhase).toBe('active')
        })

        it('defaults compass phase to "idle" when journey.compass is null', () => {
            _journey.compass = null as any
            const result = computeParityAttributes()
            expect(result.journeyCompassPhase).toBe('idle')
        })
    })

    describe('threadInspectSurface', () => {
        // Note: bare `threadInspect` attr was retired in commit 501bc59f —
        // threadInspectSurface carries the active state.

        it('returns "active" when threadInspector is active', () => {
            _focus.threadInspector = { active: true, source: 'canvas', inspectedIndex: 42 }
            const result = computeParityAttributes()
            expect(result.threadInspectSurface).toBe('canvas')
            expect(result.inspectedThreadIndex).toBe('42')
        })

        it('returns "idle" for threadInspectSurface when inactive', () => {
            const result = computeParityAttributes()
            expect(result.threadInspectSurface).toBe('idle')
            expect(result.inspectedThreadIndex).toBeNull()
        })
    })

    describe('navMode and mode', () => {
        it('mirrors nav.mode to both navMode and mode', () => {
            _nav.mode = 'focus'
            const result = computeParityAttributes()
            expect(result.navMode).toBe('focus')
            expect(result.mode).toBe('focus')
        })
    })

    describe('panelSurface mirrors navSurface', () => {
        it('panelSurface mirrors navSurface for the current surface', () => {
            _nav.surface = 'focus-search'
            const result = computeParityAttributes()
            expect(result.panelSurface).toBe(result.panelSurfaceMode)
        })
    })

    describe('activeView (viewMode was retired)', () => {
        it('mirrors nav.currentView to activeView only (viewMode was a pure alias)', () => {
            _nav.currentView = 'map'
            const result = computeParityAttributes()
            expect(result.activeView).toBe('map')
            // viewMode retired in 3f388412 — pure alias of activeView, only read by
            // one legacy contract test. The mirror now writes only activeView.
            expect(result.viewMode).toBeUndefined()
        })
    })

    describe('camera orbit slack', () => {
        it('returns orbit slack phase and reason', () => {
            _camera.orbitSlack = { phase: 'active', reason: 'search-focus' }
            const result = computeParityAttributes()
            expect(result.cameraSlack).toBe('active')
            expect(result.cameraSlackReason).toBe('search-focus')
        })

        it('defaults orbit slack to idle', () => {
            const result = computeParityAttributes()
            expect(result.cameraSlack).toBe('idle')
            expect(result.cameraSlackReason).toBeNull()
        })
    })

    describe('routeExploration', () => {
        it('returns journey.routeExplorationPhase', () => {
            _journey.routeExplorationPhase = 'searching'
            const result = computeParityAttributes()
            expect(result.routeExploration).toBe('searching')
        })

        it('defaults to "idle"', () => {
            _journey.routeExplorationPhase = ''
            const result = computeParityAttributes()
            expect(result.routeExploration).toBe('idle')
        })
    })

    describe('terrainHandoff', () => {
        it('returns journey.terrainHandoffPhase', () => {
            _journey.terrainHandoffPhase = 'transition'
            const result = computeParityAttributes()
            expect(result.terrainHandoff).toBe('transition')
        })
    })

    describe('testReady', () => {
        it('always returns "true"', () => {
            const result = computeParityAttributes()
            expect(result.testReady).toBe('true')
        })
    })
})
