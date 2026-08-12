import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mock handles (inline literals only) ────────────────────────────

const mockAppState = vi.hoisted(() => ({
    navState: {
        mode: 'overview',
        surface: 'idle',
        previousSurface: 'idle',
        focusedIndex: null as number | null,
        trailSeedIndex: null,
        trailNeighborIndices: [] as number[],
        trailCursor: -1,
        trailDepth: 0,
        walkHistoryIndices: [] as number[],
        lastTraversalReason: null,
        threadCandidates: [] as any[],
        threadReasonByIndex: new Map(),
        threadSource: '',
        focusPocketIndices: [] as number[],
        focusPocketMeta: null,
        focusPocketRoleByIndex: new Map(),
        focusFramingMeta: null,
        currentPersonality: null,
        neighborhoodIndices: [] as number[],
        explorationHistoryIndices: [] as number[],
        currentView: 'galaxy',
        myceliumMode: 'dormant',
        autoRotate: false,
        autoRotateSuspended: false,
        trailDepthFromExploration: 0,
        sceneRevealActive: false,
        sceneRevealStartedAt: 0,
        loadingPhaseKey: 'records',
        applyingUrlState: false,
        restoringBrowserHistory: false,
        urlStateRestoreToken: 0,
        activeStoryPrompt: null
    },
    trailDepth: 0,
    currentView: 'galaxy'
}))

const mockEventBus = vi.hoisted(() => ({
    publish: () => {},
    EVENTS: {}
}))

// ── Module mocks ───────────────────────────────────────────────────────────

vi.mock('@lib/state/app.svelte.ts', () => ({
    appState: new Proxy(mockAppState, {
        get(target, prop) {
            return target[prop as keyof typeof target]
        },
        set(target, prop, value) {
            ;(target as Record<string, unknown>)[prop as string] = value
            return true
        }
    })
}))

vi.mock('@lib/orchestration/event-bus', () => mockEventBus)

// ── Imports (must appear AFTER vi.mock) ─────────────────────────────────────

import {
    getLastCommittedView,
    describeNavDrift,
    refreshNavDriftBaseline,
    isOverview,
    isExploration,
    hasFocus,
    hasTrail,
    currentMode,
    currentSurface
} from '@lib/stores/navigation/navigation-state.svelte.ts'

// ── Tests ───────────────────────────────────────────────────────────────────

describe('navigation-store predicate/reader contract (nav coverage gap)', () => {
    beforeEach(() => {
        mockAppState.navState = {
            mode: 'overview',
            surface: 'idle',
            previousSurface: 'idle',
            focusedIndex: null,
            trailSeedIndex: null,
            trailNeighborIndices: [],
            trailCursor: -1,
            trailDepth: 0,
            walkHistoryIndices: [],
            lastTraversalReason: null,
            threadCandidates: [],
            threadReasonByIndex: new Map(),
            threadSource: '',
            focusPocketIndices: [],
            focusPocketMeta: null,
            focusPocketRoleByIndex: new Map(),
            focusFramingMeta: null,
            currentPersonality: null,
            neighborhoodIndices: [],
            explorationHistoryIndices: [],
            currentView: 'galaxy',
            myceliumMode: 'dormant',
            autoRotate: false,
            autoRotateSuspended: false,
            trailDepthFromExploration: 0,
            sceneRevealActive: false,
            sceneRevealStartedAt: 0,
            loadingPhaseKey: 'records',
            applyingUrlState: false,
            restoringBrowserHistory: false,
            urlStateRestoreToken: 0,
            activeStoryPrompt: null
        }
        mockAppState.trailDepth = 0
        mockAppState.currentView = 'galaxy'
    })

    it('(a) getLastCommittedView returns galaxy on the fresh/default state', async () => {
        vi.resetModules()
        const mod = await import('@lib/stores/navigation/navigation-state.svelte.ts')
        expect(mod.getLastCommittedView()).toBe('galaxy')
    })

    it('(b) describeNavDrift returns null when live nav == committed (no throw)', async () => {
        vi.resetModules()
        const mod = await import('@lib/stores/navigation/navigation-state.svelte.ts')
        const baseline = { ...(mockAppState.navState as Record<string, unknown>) } as any
        mod.refreshNavDriftBaseline(baseline)
        let threw = false
        let result: string | null
        try {
            result = mod.describeNavDrift(baseline)
        } catch (e) {
            threw = true
            result = null
        }
        expect(threw).toBe(false)
        expect(result === null || typeof result === 'string').toBe(true)
        expect(result).toBeNull()
    })

    it('(c) isOverview/isExploration/hasFocus/hasTrail are functions and return booleans for baseline state', async () => {
        vi.resetModules()
        const mod = await import('@lib/stores/navigation/navigation-state.svelte.ts')
        expect(typeof mod.isOverview).toBe('function')
        expect(typeof mod.isExploration).toBe('function')
        expect(typeof mod.hasFocus).toBe('function')
        expect(typeof mod.hasTrail).toBe('function')

        expect(mod.isOverview()).toBe(true)
        expect(mod.isExploration()).toBe(false)
        expect(mod.hasFocus()).toBe(false)
        expect(mod.hasTrail()).toBe(false)
    })

    it('(d) currentMode/currentSurface readers return the baseline on fresh state', async () => {
        vi.resetModules()
        const mod = await import('@lib/stores/navigation/navigation-state.svelte.ts')
        expect(mod.currentMode()).toBe('overview')
        expect(mod.currentSurface()).toBe('idle')
    })
})
