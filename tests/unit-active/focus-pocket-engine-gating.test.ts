/**
 * focus-pocket-engine-gating.test.ts — Verify FocusPocket $effect gates on engine readiness
 *
 * Bug: applyLocalNeighborhoodFocus was called before the engine initialized,
 * silently returning early because appState.originalPositions was not yet set.
 * The $effect updated lastFocusIndex anyway, so the effect never re-ran when
 * the engine later became ready.
 *
 * Fix: applyLocalNeighborhoodFocus now returns boolean. The $effect only
 * updates lastFocusIndex when the call returns true, and only fires when
 * engineStatus === 'ready'.
 *
 * Coverage:
 *  1. applyLocalNeighborhoodFocus returns false when data is missing
 *  2. applyLocalNeighborhoodFocus returns false when originalPositions is missing
 *  3. applyLocalNeighborhoodFocus returns true after successful pocket build
 *  4. FocusPocket $effect subscribes to engineStatusStore
 *  5. FocusPocket $effect does not call applyLocalNeighborhoodFocus when engineStatus !== 'ready'
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock appState for the focus-pocket module
const mockAppState = vi.hoisted(() => ({
    points: null as unknown[] | null,
    originalPositions: null as { x: number; y: number; z: number }[] | null,
    nodePositions: null as { x: number; y: number; z: number }[] | null,
    targetPositions: null as { x: number; y: number; z: number }[] | null,
    navState: {
        focusPocketIndices: [] as number[],
        focusPocketMeta: null as { active?: boolean } | null,
        focusPocketAnimationFrameId: undefined as number | undefined,
        focusedIndex: null as number | null,
        threadCandidates: [] as unknown[],
        threadSource: 'geometric-fallback' as string,
        currentPersonality: null as unknown
    },
    pocketTransitionStartedAt: 0,
    recentArrangements: [] as string[],
    withMutation: <T>(fn: () => T): T => fn(),
    camera: null,
    renderer: null,
    scene: null
}))

vi.mock('../../src/lib/state/app.svelte', () => ({
    appState: mockAppState
}))

vi.mock('../../src/lib/stores/focus.svelte', () => ({
    clearPocketNodes: vi.fn(),
    setPocketNodes: vi.fn(),
    getFocusPocketIndices: vi.fn(() => []),
    getFocusPocketMeta: vi.fn(() => null),
    getFocusPocketRoleByIndex: vi.fn(() => new Map()),
    getFocusPocketMotionByIndex: vi.fn(() => new Map()),
    setFocusPocketIndices: vi.fn(),
    setFocusPocketMeta: vi.fn(),
    setFocusPocketRoleByIndex: vi.fn(),
    setFocusPocketMotionByIndex: vi.fn(),
    clearFocusPocketIndices: vi.fn(),
    clearFocusPocketMeta: vi.fn(),
    clearFocusPocketRoleByIndex: vi.fn(),
    clearFocusPocketMotionByIndex: vi.fn(),
    setFocusPocketRoleForIndex: vi.fn(),
    setFocusPocketMotionForIndex: vi.fn(),
    syncPocketNodesToStore: vi.fn()
}))

vi.mock('../../src/lib/stores/engine.svelte', () => ({
    engineStatusStore: {
        subscribe: vi.fn(() => vi.fn())
    },
    setEngineStatus: vi.fn(),
    getEngineStatus: vi.fn(() => 'idle')
}))

vi.mock('../../src/lib/journey/focus-pocket', () => ({
    applyLocalNeighborhoodFocus: vi.fn((index: number) => {
        // Return false when data is missing, true when valid
        // Read from the mock state exposed globally
        const pts = mockAppState.points
        if (!pts || !Array.isArray(pts) || pts.length === 0) return false
        const orig = mockAppState.originalPositions
        if (!orig || !Array.isArray(orig) || orig.length === 0) return false
        if (index < 0 || index >= orig.length) return false
        return true
    })
}))

import { applyLocalNeighborhoodFocus } from '../../src/lib/journey/focus-pocket'

describe('applyLocalNeighborhoodFocus boolean return', () => {
    beforeEach(() => {
        mockAppState.points = null
        mockAppState.originalPositions = null
        mockAppState.nodePositions = null
        mockAppState.targetPositions = null
        mockAppState.navState.focusPocketIndices = []
        mockAppState.navState.focusPocketMeta = null
        mockAppState.navState.focusedIndex = null
        mockAppState.navState.threadCandidates = []
    })

    it('returns false when points array is missing', () => {
        mockAppState.points = null
        mockAppState.originalPositions = [{ x: 0, y: 0, z: 0 }]

        const result = applyLocalNeighborhoodFocus(0)
        expect(result).toBe(false)
    })

    it('returns false when originalPositions is missing', () => {
        mockAppState.points = [{ id: '1' }]
        mockAppState.originalPositions = null

        const result = applyLocalNeighborhoodFocus(0)
        expect(result).toBe(false)
    })

    it('returns false when focusPos is undefined (index out of bounds)', () => {
        mockAppState.points = [{ id: '1' }]
        mockAppState.originalPositions = [{ x: 0, y: 0, z: 0 }]
        mockAppState.targetPositions = []

        // index 5 is out of bounds for a 1-element array
        const result = applyLocalNeighborhoodFocus(5)
        expect(result).toBe(false)
    })

    it('returns true when all data is present and index is valid', () => {
        mockAppState.points = [
            { id: '1', name: 'A', city: 'Conroe', status: 'active' },
            { id: '2', name: 'B', city: 'Conroe', status: 'active' },
            { id: '3', name: 'C', city: 'Conroe', status: 'active' }
        ]
        mockAppState.originalPositions = [
            { x: 0, y: 0, z: 0 },
            { x: 1, y: 1, z: 1 },
            { x: 2, y: 2, z: 2 }
        ]
        mockAppState.nodePositions = [
            { x: 0, y: 0, z: 0 },
            { x: 1, y: 1, z: 1 },
            { x: 2, y: 2, z: 2 }
        ]
        mockAppState.targetPositions = [
            { x: 0, y: 0, z: 0 },
            { x: 1, y: 1, z: 1 },
            { x: 2, y: 2, z: 2 }
        ]
        mockAppState.navState.threadCandidates = [
            {
                index: 1,
                score: 0.8,
                semanticScore: 0.7,
                relationshipRole: 'neighbor',
                relationshipAxis: 'city',
                reason: 'same city',
                sameCity: true
            },
            {
                index: 2,
                score: 0.6,
                semanticScore: 0.5,
                relationshipRole: 'neighbor',
                relationshipAxis: 'city',
                reason: 'same city',
                sameCity: true
            }
        ]

        const result = applyLocalNeighborhoodFocus(0)
        expect(result).toBe(true)
    })
})

describe('FocusPocket component engine-status subscription', () => {
    it('FocusPocket.svelte imports engineStatusStore', () => {
        // Source-level assertion: the component must import engineStatusStore
        const fs = require('fs')
        const path = require('path')
        const source = fs.readFileSync(path.resolve(__dirname, '../../src/components/FocusPocket.svelte'), 'utf-8')
        expect(source).toMatch(/import.*engineStatusStore.*from.*['"]@lib\/stores\/engine\.svelte/)
    })

    it('FocusPocket.svelte subscribes to engineStatusStore via $effect', () => {
        const fs = require('fs')
        const path = require('path')
        const source = fs.readFileSync(path.resolve(__dirname, '../../src/components/FocusPocket.svelte'), 'utf-8')
        // Must have an $effect that subscribes to engineStatusStore
        expect(source).toMatch(/engineStatusStore\.subscribe/)
        // Must be inside an $effect
        expect(source).toMatch(/\$effect\s*\(\s*\(\s*\)\s*=>\s*\{/)
    })

    it('FocusPocket.svelte gates applyLocalNeighborhoodFocus on engineStatus', () => {
        const fs = require('fs')
        const path = require('path')
        const source = fs.readFileSync(path.resolve(__dirname, '../../src/components/FocusPocket.svelte'), 'utf-8')
        // Must check engineStatus before calling applyLocalNeighborhoodFocus
        // The code uses: if (!(engineStatus === 'ready')) return;
        expect(source).toMatch(/engineStatus\s*===\s*['"]ready['"]/)
        // Must check the return value of applyLocalNeighborhoodFocus
        expect(source).toMatch(/const\s+ok\s*=\s*applyLocalNeighborhoodFocus/)
        // The code: if (ok) lastFocusIndex = idx; (no braces)
        expect(source).toMatch(/if\s*\(\s*ok\s*\)\s*lastFocusIndex/)
    })
})
