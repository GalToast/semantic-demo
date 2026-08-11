import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * @vitest-environment jsdom
 *
 * Pin coverage for focus.svelte.ts thread-setters + semantic-dive toggle —
 * the GAP flagged in tmp/stores-contract-coverage.md §1.3.
 *
 * Real-store pattern (proven by state-class-migration-3-focus.test.ts):
 * mock @lib/state/app.svelte.ts so the factory-bound bridge writes land on
 * hoisted mutable references we can assert. The store itself is the production
 * code under test.
 */

// NOTE: vi.hoisted factories run BEFORE imports resolve, so they cannot
// reference imported defaults — inline the literal shapes here (mirrors
// tests/helpers/app-state-mock.ts DEFAULT_NAV_STATE/DEFAULT_FOCUS_STATE).
const _navState = vi.hoisted(() => ({
    mode: 'overview',
    surface: 'idle',
    previousSurface: 'idle',
    focusedIndex: null,
    trailSeedIndex: null,
    trailNeighborIndices: [],
    trailCursor: 0,
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
    neighborhoodReasonByIndex: new Map(),
    currentView: 'galaxy',
    myceliumMode: '',
    autoRotate: false,
    autoRotateSuspended: false,
    trailDepthFromExploration: 0,
    sceneRevealActive: false,
    sceneRevealStartedAt: 0,
    loadingPhaseKey: '',
    applyingUrlState: false,
    restoringBrowserHistory: false,
    urlStateRestoreToken: 0,
    activeStoryPrompt: null
}))
const _focusDiag = vi.hoisted(() => ({
    active: false,
    source: '',
    index: null,
    focusedIndex: null,
    segmentCount: 0,
    braidCount: 0,
    endpointCount: 0
}))
const _focusState = vi.hoisted(() => ({
    selectedPoint: null,
    inspectedThreadIndex: null,
    pinnedThreadIndex: null,
    inspectedStrandDiagnostics: _focusDiag,
    threadInspectorPointerInside: false,
    pocketMotionByIndex: new Map(),
    pocketTransitionStartedAt: 0,
    infoPanelOpen: true,
    pocketListVisible: false,
    pocketRoleFilter: 'all',
    focusTransitionMode: 'idle',
    focusTransitionStartedAt: 0,
    nodesAreSettling: false
}))

vi.mock('@lib/state/app.svelte.ts', () => ({
    appState: {
        navState: _navState,
        focusState: _focusState
    }
}))

vi.mock('@lib/stores/navigation.svelte.ts', () => ({
    writeNavStateMirror: (patch: Record<string, unknown>) => Object.assign(_navState, patch)
}))

vi.mock('@lib/data-store', () => ({ getBusinessRecords: () => [] }))

// ── Imports (must appear AFTER vi.mock) ──────────────────────────────────────

import {
    focusStore,
    pinThread,
    unpinThread,
    setSemanticDiveMode,
    pinnedThreadIndex,
    threadInspectorActive,
    semanticDiveMode
} from '@lib/stores/focus.svelte.ts'

function resetNav() {
    Object.assign(_navState, {
        mode: 'overview',
        surface: 'idle',
        focusedIndex: null,
        trailSeedIndex: null,
        trailNeighborIndices: [],
        trailCursor: 0,
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
        neighborhoodReasonByIndex: new Map(),
        currentView: 'galaxy',
        myceliumMode: ''
    })
    _focusDiag.active = false
    _focusDiag.source = ''
    _focusState.pinnedThreadIndex = null
    _focusState.inspectedThreadIndex = null
}

describe('focus store — thread-setters + semantic-dive toggle (audit §1.3 GAP pin)', () => {
    beforeEach(() => resetNav())

    it('(a) pinThread(x) sets focusStore().pinnedThreadIndex === x', () => {
        pinThread(5)
        expect(focusStore().pinnedThreadIndex).toBe(5)
        expect(pinnedThreadIndex()).toBe(5)
        // withFocusNotify invariant: threadInspector.pinnedIndex mirrors pinnedThreadIndex
        expect(focusStore().threadInspector.pinnedIndex).toBe(5)
    })

    it('(b) unpinThread() clears pinnedThreadIndex back to null', () => {
        pinThread(5)
        unpinThread()
        expect(focusStore().pinnedThreadIndex).toBeNull()
        expect(pinnedThreadIndex()).toBeNull()
        expect(focusStore().threadInspector.pinnedIndex).toBeNull()
    })

    it('(c) setSemanticDiveMode(true) flips semanticDiveMode true; (false) flips back', () => {
        // Toggle on (single test so module-level store state can't leak across
        // expectations — the real store keeps semanticDiveMode at module scope).
        setSemanticDiveMode(true)
        expect(semanticDiveMode()).toBe(true)
        expect(focusStore().semanticDiveMode).toBe(true)
        // Toggle off in the same test.
        setSemanticDiveMode(false)
        expect(semanticDiveMode()).toBe(false)
        expect(focusStore().semanticDiveMode).toBe(false)
    })

    it('(e) threadInspectorActive reader proxies appState.focusState.inspectedStrandDiagnostics.active', () => {
        _focusDiag.active = false
        expect(threadInspectorActive()).toBe(false)
        _focusDiag.active = true
        expect(threadInspectorActive()).toBe(true)
    })
})
