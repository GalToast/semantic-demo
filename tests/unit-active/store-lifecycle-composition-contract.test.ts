import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Hoisted mock state ───────────────────────────────────────────────────────

const _navSnapshot = vi.hoisted(() => ({
    trailDepth: 0,
    mode: 'overview' as const,
    surface: 'idle' as const
}))

const _focusState = vi.hoisted(() => ({ selectedBusiness: null as null, semanticDiveMode: false }))

const _searchState = vi.hoisted(() => ({ glowActive: false }))

// ── Module mocks ────────────────────────────────────────────────────────────

vi.mock('@lib/state/app.svelte.ts', () => ({
    appState: {
        navState: {},
        focusState: { selectedPoint: null }
    },
    legacyState: {
        focusState: { selectedPoint: null },
        navState: {}
    }
}))

vi.mock('@lib/stores/focus.svelte.ts', () => ({
    setSemanticDiveMode: (active: boolean) => {
        _focusState.semanticDiveMode = active
    },
    focusStore: {
        subscribe: (run: (v: unknown) => void) => {
            run(_focusState)
            return () => {}
        },
        update: () => {},
        set: () => {}
    },
    resetFocus: () => {}
}))

vi.mock('@lib/stores/search.svelte.ts', () => ({
    searchStore: {
        subscribe: (run: (v: unknown) => void) => {
            run(_searchState)
            return () => {}
        },
        update: () => {},
        set: () => {}
    },
    clearSearch: () => {},
    clearSearchGlow: () => {},
    setSearchStatus: () => {}
}))

vi.mock('@lib/stores/journey.svelte.ts', () => ({
    setTrailDepth: () => {},
    resetJourney: () => {}
}))

vi.mock('@lib/stores/navigation.svelte.ts', () => {
    const navStore = () => _navSnapshot
    navStore.subscribe = (run: (v: unknown) => void) => {
        run(_navSnapshot)
        return () => {}
    }
    navStore.update = (fn: (curr: unknown) => unknown) => {
        Object.assign(_navSnapshot, fn(_navSnapshot))
    }
    navStore.set = (val: unknown) => Object.assign(_navSnapshot, val)

    return {
        navStore,
        updateNavState: (patch: unknown) => Object.assign(_navSnapshot, patch),
        writeNavStateMirror: () => {},
        switchView: () => {},
        currentView: () => 'galaxy',
        setMyceliumMode: () => {}
    }
})

vi.mock('@lib/orchestration/event-bus', () => ({
    publish: () => {},
    EVENTS: { COMPOSITION_UPDATED: 'composition:updated' }
}))

vi.mock('@lib/journey/point-color', () => ({
    applyPointFilterColors: () => {}
}))

vi.mock('@lib/utils/focus-trap-bindings', () => ({
    registerOpenDialog: () => {},
    unregisterOpenDialog: () => {}
}))

vi.mock('@lib/orchestration/parity-attrs.svelte.ts', () => ({
    computeParityAttributes: () => ({}),
    applyParityAttributes: () => {}
}))

// ── Imports (must appear AFTER vi.mock) ──────────────────────────────────────

import { navStore } from '@lib/stores/navigation.svelte.ts'
import {
    derivePanelSurface,
    setTrailDepth,
    applyCompositionState,
    refreshCompositionState,
    updateExplorationUi
} from '@lib/stores/lifecycle'

// ── Tests ───────────────────────────────────────────────────────────────────

describe('store-lifecycle-composition-contract (lifecycle.ts 17% coverage pin)', () => {
    beforeEach(() => {
        _navSnapshot.trailDepth = 0
        _navSnapshot.mode = 'overview'
        _navSnapshot.surface = 'idle'
        _focusState.selectedBusiness = null
        _focusState.semanticDiveMode = false
        _searchState.glowActive = false
        vi.clearAllMocks()
        if (!document.body) {
            document.body = document.createElement('body')
        }
        delete (document.body.dataset as Record<string, string | undefined>).searchGlow
    })

    it('(a) derivePanelSurface is exported + returns a non-empty string for valid input', () => {
        const out = derivePanelSurface({
            view: 'focus',
            graphContext: 'focus',
            mapContext: 'search',
            semanticDive: 'inactive',
            hasSearchIntent: true,
            hasFocus: true,
            hasActiveTrailState: false
        })
        expect(typeof out).toBe('string')
        expect(out.length).toBeGreaterThan(0)
    })

    it('(b) setTrailDepth is exported + callable with depth 0..3 without throwing', () => {
        for (const depth of [0, 1, 2, 3]) {
            expect(() => setTrailDepth(depth)).not.toThrow()
            expect(navStore().trailDepth).toBe(depth)
        }
    })

    it('(c) setTrailDepth keeps the semantic-dive mirror aligned at depth 2', () => {
        setTrailDepth(2)
        expect(_focusState.semanticDiveMode).toBe(true)

        setTrailDepth(1)
        expect(_focusState.semanticDiveMode).toBe(false)
    })

    it('(d) applyCompositionState + refreshCompositionState are callable without throwing on cold baseline', () => {
        expect(() => applyCompositionState()).not.toThrow()
        expect(() => refreshCompositionState()).not.toThrow()
    })

    it('(e) updateExplorationUi is callable without throwing', () => {
        expect(() => updateExplorationUi()).not.toThrow()
    })
})
