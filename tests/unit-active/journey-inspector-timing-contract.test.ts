import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const _appState = vi.hoisted(() => ({
    navState: {
        threadCandidates: [] as any[],
        threadSource: null,
        focusPocketIndices: [] as any[],
        focusPocketRoleByIndex: new Map<number, string>()
    },
    focusState: {
        selectedPoint: null,
        inspectedThreadIndex: null as number | null,
        pinnedThreadIndex: null as number | null,
        threadInspectorPointerInside: false,
        inspectedStrandDiagnostics: {
            active: false,
            source: 'none',
            segmentCount: 0,
            braidCount: 0,
            endpointCount: 0
        }
    },
    canvasThreadInspectionClearTimer: null as ReturnType<typeof setTimeout> | null,
    strandContinuityState: { phase: 'idle' as string, targetIndex: null as number | null }
}))

const _focusStoreUpdates = vi.hoisted(() => [] as Array<{ next: unknown }>)

const _renderThreadInspection = vi.hoisted(() =>
    vi.fn(() => ({
        active: false,
        index: null,
        focusedIndex: null,
        focusName: '',
        targetName: '',
        reason: '',
        relationshipRole: '',
        relationshipTitle: '',
        role: '',
        source: '',
        pinned: false,
        journeyPhase: 'idle',
        surface: null,
        title: 'Select a nearby stop',
        copy: 'Click a neighbor below to preview why it belongs here, then pin or follow.',
        meta: 'Preview similar businesses',
        strandVisual: { active: false, source: 'none', segmentCount: 0, braidCount: 0, endpointCount: 0 },
        threadSource: null
    }))
)

// ── Module mocks ───────────────────────────────────────────────────────────

vi.mock('@lib/state/app.svelte.ts', () => ({ appState: _appState }))

vi.mock('@lib/stores/focus.svelte.ts', () => ({
    focusStore: {
        subscribe: (_run: (v: unknown) => void) => () => {},
        update: (fn: (s: unknown) => unknown) => {
            const prev = {}
            const next = fn(prev)
            _focusStoreUpdates.push({ next })
        },
        set: (_v: unknown) => {}
    }
}))

vi.mock('@lib/orchestration/event-bus', () => ({
    publish: () => {},
    subscribe: () => () => {},
    subscribeKeyed: () => () => {},
    EVENTS: { CAMERA_NODE_FOCUSED: 'CAMERA_NODE_FOCUSED' }
}))

vi.mock('@lib/journey/selected-card', () => ({ syncFocusStage: () => {} }))
vi.mock('@lib/journey/semantic-dive', () => ({ syncSemanticDiveUi: () => {} }))
vi.mock('@lib/utils/strand-continuity', () => ({ clearStrandContinuityState: () => {} }))
vi.mock('@lib/journey/thread-settler', () => ({ cancelAllThreadTimers: () => {} }))
vi.mock('@lib/journey/thread-inspector-render', () => ({ renderThreadInspection: _renderThreadInspection }))

vi.mock('@lib/stores/index.svelte.ts', () => ({
    getBusinessRecords: () => [],
    getFocusedIndex: () => null
}))

vi.mock('@lib/utils/dom-formatters', () => ({
    formatBusinessName: (s: string) => s,
    stripTerminalPunctuation: (s: string) => s
}))

vi.mock('@lib/utils/relationship-roles', () => ({
    getRelationshipRoleLabel: () => '',
    normalizeRelationshipRole: (s: string) => s
}))

vi.mock('@lib/journey/text-helpers', () => ({
    truncateMicrocopy: (s: string) => s
}))

vi.mock('@lib/types/state', () => ({}))
vi.mock('@lib/engine/camera-controls', () => ({ focusOnNode: () => {} }))
vi.mock('@lib/orchestration/lifecycle', () => ({ focusOnPoint: () => {} }))
vi.mock('@lib/orchestration/compass-controller', () => ({ updateJourneyCompass: () => {} }))
vi.mock('@lib/orchestration/toast', () => ({ showExperienceToast: () => {} }))
vi.mock('@lib/stores/navigation.svelte.ts', () => ({
    dispatchNavTransition: () => {},
    NAV_TRANSITION_ACTIONS: {},
    writeNavStateMirror: () => {}
}))

// ── Imports (must appear AFTER vi.mock) ──────────────────────────────────────

import { clearThreadInspection, scheduleCanvasThreadInspectionClear } from '@lib/journey/thread-inspector-state'

// ── Tests ───────────────────────────────────────────────────────────────────

describe('thread-inspector-state timing/clear contract (GAP #2)', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.clearAllTimers()
        _renderThreadInspection.mockClear()
        _focusStoreUpdates.length = 0
        _appState.focusState.inspectedThreadIndex = null
        _appState.focusState.pinnedThreadIndex = null
        _appState.focusState.threadInspectorPointerInside = false
        _appState.canvasThreadInspectionClearTimer = null
        _appState.strandContinuityState.phase = 'idle'
        _appState.strandContinuityState.targetIndex = null
        delete (document.body.dataset as Record<string, string | undefined>).threadInspectSurface
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('(a) clearThreadInspection exists and resets inspection state', () => {
        _appState.focusState.inspectedThreadIndex = 5
        _appState.focusState.threadInspectorPointerInside = true

        const result = clearThreadInspection()

        expect(_appState.focusState.inspectedThreadIndex).toBeNull()
        expect(_appState.focusState.threadInspectorPointerInside).toBe(false)
        expect(result).not.toBeNull()
        expect(result?.active).toBe(false)
        expect(_focusStoreUpdates.length).toBeGreaterThan(0)
    })

    it('(b) scheduleCanvasThreadInspectionClear schedules a clear that fires on timer advance', () => {
        _appState.focusState.inspectedThreadIndex = 7
        _appState.focusState.threadInspectorPointerInside = false
        _appState.focusState.pinnedThreadIndex = null
        document.body.dataset.threadInspectSurface = 'canvas'

        scheduleCanvasThreadInspectionClear(1800)

        expect(_appState.canvasThreadInspectionClearTimer).not.toBeNull()
        expect(_renderThreadInspection).not.toHaveBeenCalled()

        vi.advanceTimersByTime(1800)

        expect(_appState.focusState.inspectedThreadIndex).toBeNull()
        expect(_appState.canvasThreadInspectionClearTimer).toBeNull()
    })

    it('(c) double-schedule advances once with exactly one effective clear', () => {
        _appState.focusState.inspectedThreadIndex = 9
        _appState.focusState.threadInspectorPointerInside = false
        _appState.focusState.pinnedThreadIndex = null
        document.body.dataset.threadInspectSurface = 'canvas'

        scheduleCanvasThreadInspectionClear(1800)
        scheduleCanvasThreadInspectionClear(1800)

        expect(_renderThreadInspection).not.toHaveBeenCalled()

        vi.advanceTimersByTime(1800)

        expect(_appState.focusState.inspectedThreadIndex).toBeNull()
        expect(_renderThreadInspection).toHaveBeenCalledTimes(1)
    })

    it('(d) force-clear before timer fire cancels the scheduled clear', () => {
        _appState.focusState.inspectedThreadIndex = 3
        _appState.focusState.threadInspectorPointerInside = false
        _appState.focusState.pinnedThreadIndex = null
        document.body.dataset.threadInspectSurface = 'canvas'

        scheduleCanvasThreadInspectionClear(1800)
        expect(_appState.canvasThreadInspectionClearTimer).not.toBeNull()

        clearThreadInspection({ force: true })

        expect(_appState.canvasThreadInspectionClearTimer).toBeNull()

        vi.advanceTimersByTime(1800)

        expect(_appState.focusState.inspectedThreadIndex).toBeNull()
        expect(_renderThreadInspection).toHaveBeenCalledTimes(1)
    })
})
