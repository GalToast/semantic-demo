import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * @vitest-environment jsdom
 *
 * parity-attrs.svelte.ts Svelte 5 mock harness — Phase 6f (2026-06-26)
 *
 * Extends the Phase 6d/e harness pattern to parity-attrs.svelte.ts (670
 * LOC), which depends on 11 stores + 2 compass helpers. The pattern:
 *
 *   1. vi.hoisted() creates mutable mock state
 *   2. vi.mock for each store dep — CRITICAL: subscribe must call fn(value)
 *   3. import parity-attrs AFTER all mocks (so it sees stubbed deps)
 *   4. Tests exercise computeParityAttributes + applyParityAttributes +
 *      installParityAttributeSync lifecycle
 *
 * The MOST valuable function to test is computeParityAttributes — it reads
 * from 11 stores and produces the body-data-attr map that drives legacy
 * CSS hooks (see PARITY_ATTRIBUTES manifest). It is documented as "Pure
 * function — no side effects, no DOM access. Easy to test."
 */

// ── Mutable mock state ────────────────────────────────────────────────────────

const mockState = vi.hoisted(() => ({
    // Store snapshots — same reference shared across navStore() and get(navStore)
    navState: {
        mode: 'overview' as string,
        surface: 'idle' as string,
        currentView: 'galaxy' as string,
        focusedIndex: null as number | null,
        trailDepth: 0,
        trailNeighborIndices: [] as number[],
        neighborhoodIndices: [] as number[],
        activeStoryPrompt: null as string | null,
        myceliumMode: 'default' as string,
        surfaceOwner: 'journey-compass' as string
    },
    journeyState: {
        phase: 'overview' as string,
        depth: 0,
        compass: { phase: 'idle' as string },
        routeExplorationPhase: 'idle' as string,
        strandContinuityPhase: 'idle' as string
    },
    focusState: {
        selectedBusiness: null as unknown,
        semanticDiveMode: false,
        strandContinuityPhase: 'idle' as string,
        transitionMode: 'idle' as string,
        threadInspector: {
            active: false,
            source: 'rail' as string,
            inspectedIndex: null as number | null
        }
    },
    searchState: {
        query: '' as string,
        summary: null as unknown,
        status: 'idle' as string
    },
    filterState: {
        status: '' as string,
        city: '' as string,
        website: false,
        email: false,
        geocoded: false
    },
    viewportState: {
        width: 1200,
        height: 800,
        isMobile: false,
        isCompact: false,
        isShort: false,
        isTiny: false
    },
    demoPhase: 'IDLE' as string,
    cameraState: {
        position: [0, 0, 3] as [number, number, number],
        target: [0, 0, 0] as [number, number, number],
        routeExplorationPhase: 'idle' as string,
        orbitSlack: {
            phase: 'idle' as string,
            reason: '' as string
        }
    },
    compassState: {
        phase: 'overview' as string,
        kicker: '' as string,
        title: '' as string,
        note: '' as string,
        primaryAction: 'none' as string,
        secondaryAction: null as string | null,
        tertiaryAction: null as string | null,
        action: 'none' as string,
        density: 'hidden' as 'hidden' | 'compact' | 'expanded',
        navigationOwner: 'journey-compass' as string
    },
    loadingPhase: 'records' as string,
    graphicsMode: 'standard' as string,
    engineReadyValue: false,
    // Call tracking
    installParitySyncCalls: 0,
    resetParityCacheCalls: 0
}))

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@lib/state/app.svelte.ts', () => ({
    appState: {
        get navState() {
            return mockState.navState
        },
        set navState(v) {
            mockState.navState = v as typeof mockState.navState
        },
        get currentView() {
            return mockState.navState.currentView
        },
        set currentView(v) {},
        withMutation: (fn: () => unknown) => fn()
    }
}))

vi.mock('@lib/stores/navigation.svelte', () => ({
    navStore: Object.assign(() => mockState.navState, {
        update: (updater: (s: typeof mockState.navState) => typeof mockState.navState) => {
            const next = updater(mockState.navState)
            Object.assign(mockState.navState, next)
        },
        set: (v: typeof mockState.navState) => {
            mockState.navState = v
        },
        subscribe: (fn: (v: typeof mockState.navState) => void) => {
            fn(mockState.navState)
            return () => {}
        }
    })
}))

vi.mock('@lib/stores/journey.svelte', () => ({
    journeyStore: Object.assign(() => mockState.journeyState, {
        update: (updater: (s: typeof mockState.journeyState) => typeof mockState.journeyState) => {
            const next = updater(mockState.journeyState)
            Object.assign(mockState.journeyState, next)
        },
        subscribe: (fn: (v: typeof mockState.journeyState) => void) => {
            fn(mockState.journeyState)
            return () => {}
        }
    })
}))

vi.mock('@lib/stores/focus.svelte', () => ({
    focusStore: Object.assign(() => mockState.focusState, {
        update: (updater: (s: typeof mockState.focusState) => typeof mockState.focusState) => {
            const next = updater(mockState.focusState)
            Object.assign(mockState.focusState, next)
        },
        subscribe: (fn: (v: typeof mockState.focusState) => void) => {
            fn(mockState.focusState)
            return () => {}
        }
    })
}))

vi.mock('@lib/stores/search.svelte', () => ({
    searchStore: Object.assign(() => mockState.searchState, {
        update: (updater: (s: typeof mockState.searchState) => typeof mockState.searchState) => {
            const next = updater(mockState.searchState)
            Object.assign(mockState.searchState, next)
        },
        set: (v: typeof mockState.searchState) => {
            mockState.searchState = v
        },
        subscribe: (fn: (v: typeof mockState.searchState) => void) => {
            fn(mockState.searchState)
            return () => {}
        }
    })
}))

vi.mock('@lib/stores/filter.svelte', () => ({
    filterState: Object.assign(() => mockState.filterState, {
        update: (updater: (s: typeof mockState.filterState) => typeof mockState.filterState) => {
            const next = updater(mockState.filterState)
            Object.assign(mockState.filterState, next)
        },
        subscribe: (fn: (v: typeof mockState.filterState) => void) => {
            fn(mockState.filterState)
            return () => {}
        }
    })
}))

vi.mock('@lib/stores/viewport.svelte', () => ({
    viewport: Object.assign(() => mockState.viewportState, {
        update: (updater: (s: typeof mockState.viewportState) => typeof mockState.viewportState) => {
            const next = updater(mockState.viewportState)
            Object.assign(mockState.viewportState, next)
        },
        subscribe: (fn: (v: typeof mockState.viewportState) => void) => {
            fn(mockState.viewportState)
            return () => {}
        }
    })
}))

vi.mock('@lib/stores/camera.svelte', () => ({
    cameraStore: Object.assign(() => mockState.cameraState, {
        update: (updater: (s: typeof mockState.cameraState) => typeof mockState.cameraState) => {
            const next = updater(mockState.cameraState)
            Object.assign(mockState.cameraState, next)
        },
        subscribe: (fn: (v: typeof mockState.cameraState) => void) => {
            fn(mockState.cameraState)
            return () => {}
        }
    })
}))

vi.mock('@lib/stores/demo.svelte', () => ({
    demoStore: Object.assign(() => ({}), {
        update: () => {},
        subscribe: (fn: () => void) => {
            fn()
            return () => {}
        }
    }),
    demoPhase: () => mockState.demoPhase,
    isDemoActive: () => mockState.demoPhase !== 'IDLE'
}))

vi.mock('@lib/stores/engine-ready.svelte', () => ({
    engineReady: {
        get value() {
            return mockState.engineReadyValue
        },
        subscribe: (fn: (v: boolean) => void) => {
            fn(mockState.engineReadyValue)
            return () => {}
        }
    }
}))

vi.mock('@lib/data-store', () => ({
    graphicsModeStore: Object.assign(() => mockState.graphicsMode, {
        update: () => {},
        set: (v: string) => {
            mockState.graphicsMode = v
        },
        subscribe: (fn: (v: string) => void) => {
            fn(mockState.graphicsMode)
            return () => {}
        }
    }),
    loadingPhaseStore: Object.assign(() => mockState.loadingPhase, {
        update: () => {},
        set: (v: string) => {
            mockState.loadingPhase = v
        },
        subscribe: (fn: (v: string) => void) => {
            fn(mockState.loadingPhase)
            return () => {}
        }
    })
}))

vi.mock('@lib/journey/compass-state', () => ({
    getJourneyCompassState: () => mockState.compassState
}))

vi.mock('@lib/orchestration/compass-controller', () => ({
    getJourneyCompassPresentationState: () => ({
        density: mockState.compassState.density,
        copy: 'quiet' as const,
        actions: 'standard' as const,
        navigationOwner: mockState.compassState.navigationOwner
    })
}))

// ── Import AFTER mocks ───────────────────────────────────────────────────────

import {
    PARITY_ATTRIBUTES,
    PARITY_ATTRIBUTE_KEYS,
    computeParityAttributes,
    applyParityAttributes,
    installParityAttributeSync,
    resetParityAttributeCache
} from '@lib/orchestration/parity-attrs.svelte'

// ── Test helpers ─────────────────────────────────────────────────────────────

function resetAllMockState(): void {
    mockState.navState = {
        mode: 'overview',
        surface: 'idle',
        currentView: 'galaxy',
        focusedIndex: null,
        trailDepth: 0,
        trailNeighborIndices: [],
        neighborhoodIndices: [],
        activeStoryPrompt: null,
        myceliumMode: 'default',
        surfaceOwner: 'journey-compass'
    }
    mockState.journeyState = { phase: 'overview' } as typeof mockState.journeyState
    mockState.focusState = {
        selectedBusiness: null,
        semanticDiveMode: false,
        strandContinuityPhase: 'idle',
        transitionMode: 'idle',
        threadInspector: {
            active: false,
            source: 'rail',
            inspectedIndex: null
        }
    }
    mockState.searchState = { query: '', summary: null } as typeof mockState.searchState
    mockState.filterState = {
        status: '',
        city: '',
        website: false,
        email: false,
        geocoded: false
    }
    mockState.viewportState = {
        width: 1200,
        height: 800,
        isMobile: false,
        isCompact: false,
        isShort: false,
        isTiny: false
    }
    mockState.demoPhase = 'IDLE'
    mockState.cameraState = {
        position: [0, 0, 3],
        target: [0, 0, 0],
        routeExplorationPhase: 'idle',
        orbitSlack: { phase: 'idle', reason: '' }
    }
    mockState.compassState = {
        phase: 'overview',
        kicker: '',
        title: '',
        note: '',
        primaryAction: 'none',
        secondaryAction: null,
        tertiaryAction: null,
        action: 'none',
        density: 'hidden',
        navigationOwner: 'journey-compass'
    }
    mockState.loadingPhase = 'records'
    mockState.graphicsMode = 'standard'
    mockState.engineReadyValue = false
    mockState.installParitySyncCalls = 0
    mockState.resetParityCacheCalls = 0
    // Clear body data attributes
    if (typeof document !== 'undefined' && document.body) {
        document.body.removeAttribute('data-journey-compass')
        document.body.removeAttribute('data-nav-mode')
        document.body.removeAttribute('data-loading-state')
        document.body.classList.remove('is-active')
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('parity-attrs.svelte.ts — Svelte 5 mock harness (Phase 6f)', () => {
    beforeEach(() => {
        resetAllMockState()
    })

    // ── PARITY_ATTRIBUTES manifest (already covered in 9de64ea8; regression checks) ──

    describe('PARITY_ATTRIBUTES manifest', () => {
        it('manifest is non-empty', () => {
            expect(PARITY_ATTRIBUTES.length).toBeGreaterThan(0)
        })

        it('PARITY_ATTRIBUTE_KEYS set matches manifest size', () => {
            expect(PARITY_ATTRIBUTE_KEYS.size).toBe(PARITY_ATTRIBUTES.length)
        })

        it('every descriptor has key, description, source', () => {
            for (const attr of PARITY_ATTRIBUTES) {
                expect(typeof attr.key).toBe('string')
                expect(typeof attr.description).toBe('string')
                expect(typeof attr.source).toBe('string')
            }
        })

        it('keys are unique', () => {
            const keys = PARITY_ATTRIBUTES.map((a) => a.key)
            expect(new Set(keys).size).toBe(keys.length)
        })
    })

    // ── computeParityAttributes ──────────────────────────────────────────────

    describe('computeParityAttributes', () => {
        it('returns a ParityAttributeMap (object with string values)', () => {
            const map = computeParityAttributes()
            expect(typeof map).toBe('object')
            expect(map).not.toBeNull()
        })

        it('reads navStore.mode into navMode attribute', () => {
            mockState.navState.mode = 'focus'
            const map = computeParityAttributes()
            expect(map['navMode']).toBe('focus')
        })

        it('reads navStore.surface into navSurface attribute', () => {
            mockState.navState.surface = 'focus-search'
            const map = computeParityAttributes()
            expect(map['navSurface']).toBe('focus-search')
        })

        it('reads navStore.currentView into activeView attribute', () => {
            mockState.navState.currentView = 'map'
            const map = computeParityAttributes()
            expect(map['activeView']).toBe('map')
        })

        it('reads navStore.focusedIndex into focusedNode when finite', () => {
            mockState.navState.focusedIndex = 42
            const map = computeParityAttributes()
            expect(map['focusedNode']).toBe('42')
        })

        it('returns null for focusedNode when null', () => {
            mockState.navState.focusedIndex = null
            const map = computeParityAttributes()
            expect(map['focusedNode']).toBeNull()
        })

        it('reads journeyStore.phase into journeyPhase', () => {
            mockState.journeyState.phase = 'search'
            const map = computeParityAttributes()
            expect(map['journeyPhase']).toBe('search')
        })

        it('reads compassState.navigationOwner into journeyNavigationOwner', () => {
            mockState.compassState.navigationOwner = 'map-trail-strip'
            const map = computeParityAttributes()
            expect(map['journeyNavigationOwner']).toBe('map-trail-strip')
        })

        it('reads searchStore.summary presence into graphContext', () => {
            mockState.searchState.summary = { resultIndices: [], anchorIndex: 0, query: 'test', dedupedResultCount: 1 }
            const map = computeParityAttributes()
            // graphContext reflects search context ('corridor' for search-only)
            expect(map['graphContext']).toBe('corridor')
        })

        it('reads filterState values into filtersActive', () => {
            mockState.filterState.status = 'open'
            mockState.filterState.city = 'conroe'
            const map = computeParityAttributes()
            expect(map['filtersActive']).toBe('true')
        })

        it('reads viewportState.isMobile into mobile attr', () => {
            mockState.viewportState.isMobile = true
            const map = computeParityAttributes()
            expect(map['mobile']).toBe('true')
        })

        it('reads demoPhase into demoPhase attribute', () => {
            mockState.demoPhase = 'NARRATING'
            const map = computeParityAttributes()
            expect(map['demoPhase']).toBe('NARRATING')
        })

        it('reads loadingPhase into loadingPhase attribute', () => {
            mockState.loadingPhase = 'scene'
            const map = computeParityAttributes()
            expect(map['loadingPhase']).toBe('scene')
        })

        it('reads graphicsMode into graphicsMode attribute', () => {
            mockState.graphicsMode = 'low'
            const map = computeParityAttributes()
            expect(map['graphicsMode']).toBe('low')
        })

        it('produces a stable snapshot — second call returns same values', () => {
            mockState.navState.mode = 'focus'
            const map1 = computeParityAttributes()
            const map2 = computeParityAttributes()
            expect(map1['navMode']).toBe(map2['navMode'])
        })
    })

    // ── applyParityAttributes ────────────────────────────────────────────────

    describe('applyParityAttributes', () => {
        it('writes data-* attributes to document.body', () => {
            const map = { navMode: 'focus', journeyPhase: 'search' }
            applyParityAttributes(map as never)
            expect(document.body.getAttribute('data-nav-mode')).toBe('focus')
        })

        it('clears attributes that are null', () => {
            document.body.setAttribute('data-nav-mode', 'stale')
            const map = { navMode: null }
            applyParityAttributes(map as never)
            expect(document.body.getAttribute('data-nav-mode')).toBeNull()
        })

        it('does not throw on empty map', () => {
            expect(() => applyParityAttributes({})).not.toThrow()
        })
    })

    // ── installParityAttributeSync ───────────────────────────────────────────

    describe('installParityAttributeSync', () => {
        it('returns a cleanup function', () => {
            const cleanup = installParityAttributeSync()
            expect(typeof cleanup).toBe('function')
            cleanup()
        })

        it('cleanup can be called without throwing', () => {
            const cleanup = installParityAttributeSync({ initialSync: false })
            expect(() => cleanup()).not.toThrow()
        })
    })

    // ── resetParityAttributeCache ────────────────────────────────────────────

    describe('resetParityAttributeCache', () => {
        it('can be called without throwing', () => {
            expect(() => resetParityAttributeCache()).not.toThrow()
        })
    })
})
