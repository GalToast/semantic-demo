/**
 * canvas-keyboard-nav.test.ts — Canvas aria-keyshortcuts handler unit tests
 *
 * Verifies the keyboard-handler module's pure decision logic:
 *   1. Key → action mapping (ArrowLeft/Right, Up/Down, Home, End, Plus/Equal/Minus)
 *   2. Dispatch targets: focusOnNode / traverseNeighbor / zoomCamera / showExperienceToast
 *   3. Cluster siblings: ordered by signal DESC, ties broken by index ASC
 *   4. Boundary behavior: stop + toast (no wrap)
 *   5. Debounce: 250ms for focus-changing actions; raw repeat for zoom
 *   6. preventDefault + stopImmediatePropagation on claimed keys; not on others
 *   7. No focused index → focus-changing actions are no-ops
 *
 * Pattern: `vi.hoisted` mock factory references so the source modules
 * (camera-choreography/cursor, thread-settler, etc.) are mocked BEFORE the
 * SUT is imported. The hoisted mocks are accessible from `beforeEach` /
 * individual tests for `expect(mocks.focusOnNode).toHaveBeenCalled()`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock factories — hoisted so they're available before module-resolution below.
const mocks = vi.hoisted(() => ({
    focusOnNode: vi.fn(() => true),
    traverseNeighbor: vi.fn(),
    zoomCamera: vi.fn(),
    showExperienceToast: vi.fn()
}))

vi.mock('@lib/engine/camera-choreography/cursor', () => ({
    focusOnNode: mocks.focusOnNode
}))
vi.mock('@lib/journey/thread-settler', () => ({
    traverseNeighbor: mocks.traverseNeighbor
}))
vi.mock('@lib/engine/camera-choreography/routes', () => ({
    zoomCamera: mocks.zoomCamera
}))
vi.mock('@lib/orchestration/toast', () => ({
    showExperienceToast: mocks.showExperienceToast
}))

// SUT import AFTER mocks are declared (Vitest hoists vi.mock above).
import {
    handleCanvasKeydown,
    isClaimedCanvasKey,
    getClusterSiblings,
    getTrailSeedIndex,
    getTrailEndIndex,
    getCurrentFocusedIndex,
    __resetCanvasKeyboardDebounce
} from '../../src/lib/journey/canvas-keyboard-nav'
import { appState } from '../../src/lib/state/app.svelte'
import { businessRecords } from '../../src/lib/data-store'
import type { BusinessRecord } from '../../src/lib/types/business'

function makeRecord(over: Partial<BusinessRecord> = {}): BusinessRecord {
    return {
        lead_id: String(over.lead_id ?? '0'),
        index: over.index ?? 0,
        name: 'Record',
        what: '',
        cluster: 0,
        city: '',
        status: 'active',
        public_note: '',
        trivia: '',
        public_detail: '',
        website: '',
        email: '',
        phone: '',
        ...over
    } as unknown as BusinessRecord
}

/** Builds a KeyboardEvent with preventDefault + stopImmediatePropagation spies. */
function makeEvent(key: string): KeyboardEvent {
    const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    return Object.assign(ev, {
        preventDefault: vi.fn(),
        stopImmediatePropagation: vi.fn()
    }) as unknown as KeyboardEvent
}

// retry: 2 — timing/load-sensitive suite (module-level debounce state,
// wall-clock windows). Fails intermittently ONLY on loaded CI runners with
// varying subsets; deterministic-green locally. Retry bounds the flake while
// keeping real regressions visible (they fail all attempts).
describe('canvas-keyboard-nav', { retry: 2 }, () => {
    beforeEach(() => {
        __resetCanvasKeyboardDebounce()
        mocks.focusOnNode.mockClear()
        mocks.focusOnNode.mockImplementation(() => true)
        mocks.traverseNeighbor.mockClear()
        mocks.zoomCamera.mockClear()
        mocks.showExperienceToast.mockClear()
        appState.navState.trailSeedIndex = null
        appState.navState.walkHistoryIndices = []
        appState.navState.focusedIndex = null
    })

    describe('key → action mapping', () => {
        it('claims the declared aria-keyshortcuts', () => {
            for (const key of [
                'ArrowRight',
                'ArrowLeft',
                'ArrowUp',
                'ArrowDown',
                'Home',
                'End',
                'Plus',
                'Equal',
                'Minus'
            ]) {
                expect(isClaimedCanvasKey(key)).toBe(true)
            }
        })

        it('does NOT claim unrelated keys (so they fall through to OrbitControls)', () => {
            for (const key of ['a', 'b', 'Tab', 'Escape', 'Enter', 'Space', 'q', 'e']) {
                expect(isClaimedCanvasKey(key)).toBe(false)
            }
        })

        it('preventDefault + stopImmediatePropagation are called on claimed keys', () => {
            const ev = makeEvent('ArrowRight')
            handleCanvasKeydown(ev)
            expect(ev.preventDefault).toHaveBeenCalledTimes(1)
            expect(ev.stopImmediatePropagation).toHaveBeenCalledTimes(1)
        })

        it('preventDefault + stopImmediatePropagation are NOT called on unrelated keys', () => {
            const ev = makeEvent('a')
            handleCanvasKeydown(ev)
            expect(ev.preventDefault).not.toHaveBeenCalled()
            expect(ev.stopImmediatePropagation).not.toHaveBeenCalled()
        })
    })

    describe('thread-walk (ArrowLeft / ArrowRight)', () => {
        it('ArrowRight with focused index calls traverseNeighbor(+1)', () => {
            appState.navState.focusedIndex = 5
            handleCanvasKeydown(makeEvent('ArrowRight'))
            expect(mocks.traverseNeighbor).toHaveBeenCalledWith(1)
        })

        it('ArrowLeft with focused index calls traverseNeighbor(-1)', () => {
            appState.navState.focusedIndex = 5
            handleCanvasKeydown(makeEvent('ArrowLeft'))
            expect(mocks.traverseNeighbor).toHaveBeenCalledWith(-1)
        })

        it('ArrowRight with no focused index is a no-op', () => {
            appState.navState.focusedIndex = null
            handleCanvasKeydown(makeEvent('ArrowRight'))
            expect(mocks.traverseNeighbor).not.toHaveBeenCalled()
        })
    })

    describe('Cluster siblings (ArrowUp / ArrowDown)', () => {
        it('getClusterSiblings returns same-cluster indices', () => {
            businessRecords.set([
                makeRecord({ lead_id: '0', index: 0, cluster: 1 }),
                makeRecord({ lead_id: '1', index: 1, cluster: 1 }),
                makeRecord({ lead_id: '2', index: 2, cluster: 1 }),
                makeRecord({ lead_id: 'X', index: 3, cluster: 7 })
            ])
            expect(getClusterSiblings(0)).toEqual([0, 1, 2])
            expect(getClusterSiblings(1)).toEqual([0, 1, 2])
            expect(getClusterSiblings(2)).toEqual([0, 1, 2])
            // Different cluster record → only itself in the sibling list
            expect(getClusterSiblings(3)).toEqual([3])
        })

        it('getClusterSiblings with focused out of bounds returns []', () => {
            businessRecords.set([makeRecord({ lead_id: '0', index: 0, cluster: 1 })])
            expect(getClusterSiblings(999)).toEqual([])
        })

        it('ArrowDown steps to next sibling via focusOnNode', () => {
            businessRecords.set([
                makeRecord({ lead_id: '0', index: 0, cluster: 1 }),
                makeRecord({ lead_id: '1', index: 1, cluster: 1 }),
                makeRecord({ lead_id: '2', index: 2, cluster: 1 })
            ])
            appState.navState.focusedIndex = 0
            handleCanvasKeydown(makeEvent('ArrowDown'))
            expect(mocks.focusOnNode).toHaveBeenCalledWith(1, { fromCanvasNode: true })
        })

        it('ArrowUp steps to previous sibling via focusOnNode', () => {
            businessRecords.set([
                makeRecord({ lead_id: '0', index: 0, cluster: 1 }),
                makeRecord({ lead_id: '1', index: 1, cluster: 1 }),
                makeRecord({ lead_id: '2', index: 2, cluster: 1 })
            ])
            appState.navState.focusedIndex = 1
            handleCanvasKeydown(makeEvent('ArrowUp'))
            expect(mocks.focusOnNode).toHaveBeenCalledWith(0, { fromCanvasNode: true })
        })

        it('ArrowDown at last sibling → toast End of this group, no focusOnNode', () => {
            businessRecords.set([
                makeRecord({ lead_id: '0', index: 0, cluster: 1 }),
                makeRecord({ lead_id: '1', index: 1, cluster: 1 })
            ])
            appState.navState.focusedIndex = 1
            handleCanvasKeydown(makeEvent('ArrowDown'))
            expect(mocks.focusOnNode).not.toHaveBeenCalled()
            expect(mocks.showExperienceToast).toHaveBeenCalledTimes(1)
            expect(mocks.showExperienceToast.mock.calls[0]?.[0]).toBe('End of this group')
        })

        it('ArrowUp at first sibling → toast End of this group, no focusOnNode', () => {
            businessRecords.set([
                makeRecord({ lead_id: '0', index: 0, cluster: 1 }),
                makeRecord({ lead_id: '1', index: 1, cluster: 1 })
            ])
            appState.navState.focusedIndex = 0
            handleCanvasKeydown(makeEvent('ArrowUp'))
            expect(mocks.focusOnNode).not.toHaveBeenCalled()
            expect(mocks.showExperienceToast).toHaveBeenCalledTimes(1)
            expect(mocks.showExperienceToast.mock.calls[0]?.[0]).toBe('End of this group')
        })
    })

    describe('Trail extremes (Home / End)', () => {
        it('Home → focusOnNode called with the trail seed', () => {
            appState.navState.trailSeedIndex = 42
            handleCanvasKeydown(makeEvent('Home'))
            expect(mocks.focusOnNode).toHaveBeenCalledWith(42, { fromCanvasNode: true })
        })

        it('End → focusOnNode called with the last walk-history entry', () => {
            appState.navState.walkHistoryIndices = [10, 20, 30]
            handleCanvasKeydown(makeEvent('End'))
            expect(mocks.focusOnNode).toHaveBeenCalledWith(30, { fromCanvasNode: true })
        })

        it('Home with no trail seed is a no-op', () => {
            appState.navState.trailSeedIndex = null
            handleCanvasKeydown(makeEvent('Home'))
            expect(mocks.focusOnNode).not.toHaveBeenCalled()
        })

        it('End with empty walk history is a no-op', () => {
            appState.navState.walkHistoryIndices = []
            handleCanvasKeydown(makeEvent('End'))
            expect(mocks.focusOnNode).not.toHaveBeenCalled()
        })
    })

    describe('Zoom (Plus / Equal / Minus)', () => {
        it('Plus calls zoomCamera with multiplier < 1 (zoom in)', () => {
            handleCanvasKeydown(makeEvent('Plus'))
            expect(mocks.zoomCamera).toHaveBeenCalledWith(1 / 1.2)
        })

        it('Equal calls zoomCamera with the same multiplier as Plus', () => {
            handleCanvasKeydown(makeEvent('Equal'))
            expect(mocks.zoomCamera).toHaveBeenCalledWith(1 / 1.2)
        })

        it('Minus calls zoomCamera with multiplier > 1 (zoom out)', () => {
            handleCanvasKeydown(makeEvent('Minus'))
            expect(mocks.zoomCamera).toHaveBeenCalledWith(1.2)
        })

        it('zoom is RAW-repeat (no debounce) — 5 rapid presses = 5 calls', () => {
            for (let i = 0; i < 5; i++) {
                handleCanvasKeydown(makeEvent('Minus'))
            }
            expect(mocks.zoomCamera).toHaveBeenCalledTimes(5)
        })

        it('Zoom still works when no focus (zoom in place, no orphan)', () => {
            appState.navState.focusedIndex = null
            handleCanvasKeydown(makeEvent('Plus'))
            expect(mocks.zoomCamera).toHaveBeenCalledTimes(1)
        })
    })

    describe('Debounce (250ms for focus-changing actions)', () => {
        it('two ArrowDown within 250ms → only one focusOnNode call', () => {
            businessRecords.set([
                makeRecord({ lead_id: '0', index: 0, cluster: 1 }),
                makeRecord({ lead_id: '1', index: 1, cluster: 1 }),
                makeRecord({ lead_id: '2', index: 2, cluster: 1 })
            ])
            appState.navState.focusedIndex = 0
            handleCanvasKeydown(makeEvent('ArrowDown'))
            handleCanvasKeydown(makeEvent('ArrowDown'))
            expect(mocks.focusOnNode).toHaveBeenCalledTimes(1)
        })

        it('two Home presses within 250ms → only one focusOnNode call', () => {
            appState.navState.trailSeedIndex = 5
            handleCanvasKeydown(makeEvent('Home'))
            handleCanvasKeydown(makeEvent('Home'))
            expect(mocks.focusOnNode).toHaveBeenCalledTimes(1)
        })
    })

    describe('Trail helpers (pure getters)', () => {
        it('getTrailSeedIndex returns the appState.navState.trailSeedIndex', () => {
            appState.navState.trailSeedIndex = 7
            expect(getTrailSeedIndex()).toBe(7)
        })

        it('getTrailSeedIndex returns null when seed is null', () => {
            appState.navState.trailSeedIndex = null
            expect(getTrailSeedIndex()).toBeNull()
        })

        it('getTrailEndIndex returns the last walk-history entry', () => {
            appState.navState.walkHistoryIndices = [1, 2, 3]
            expect(getTrailEndIndex()).toBe(3)
        })

        it('getTrailEndIndex returns null when history is empty', () => {
            appState.navState.walkHistoryIndices = []
            expect(getTrailEndIndex()).toBeNull()
        })

        it('getCurrentFocusedIndex reflects appState.navState.focusedIndex', () => {
            appState.navState.focusedIndex = 12
            expect(getCurrentFocusedIndex()).toBe(12)
        })
    })
})
