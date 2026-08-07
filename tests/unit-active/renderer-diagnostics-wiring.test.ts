/**
 * renderer-diagnostics-wiring.test.ts — Prove the sampleScenePerformance
 * passthrough wiring for the renderer-diagnostics wave (2026-08-07).
 *
 * Tests that:
 *  - threadUpdateMs/overlayUpdateMs slots are consumed by sampleScenePerformance
 *  - nodeMotionMs is passed through
 *  - sampleCount caps at 600
 *  - active/reason semantics are preserved for webgl-fallback.ts
 *  - smoothDiagnosticValue math is correct
 *
 * No full-app boot; mocks @lib/state/app.svelte and webgl-context only.
 */
import { describe, it, expect, vi } from 'vitest'

const { mockState } = vi.hoisted(() => {
    return {
        mockState: {
            currentView: 'galaxy',
            renderer: {} as unknown,
            scene: {} as unknown,
            camera: {} as unknown,
            points: [],
            scenePerformanceDiagnostics: {
                active: false,
                reason: 'not-sampled',
                lastFrameAt: 0,
                sampleCount: 0,
                avgFrameMs: 0,
                maxFrameMs: 0,
                avgUpdateMs: 0,
                maxUpdateMs: 0,
                avgRenderMs: 0,
                maxRenderMs: 0,
                avgControlsMs: 0,
                avgNodeMotionMs: 0,
                avgThreadUpdateMs: 0,
                avgGlowMs: 0,
                avgLensMs: 0,
                avgOverlayUpdateMs: 0,
                maxOverlayUpdateMs: 0,
                myceliumCoreSegments: 0,
                myceliumWispySegments: 0,
                myceliumBridgeSegments: 0,
                lastThreadUpdateMs: 0,
                lastThreadUpdateDirtyNodes: 0,
                lastThreadUpdateDirtyPairs: 0
            }
        }
    }
})

vi.mock('@lib/state/app.svelte', () => ({
    appState: mockState
}))

vi.mock('@lib/engine/webgl-context', () => ({
    getLiveResourceCounts: () => ({
        geometries: 0,
        textures: 0,
        programs: 0
    })
}))

import { sampleScenePerformance, smoothDiagnosticValue } from '../../src/lib/engine/renderer/renderer-diagnostics'

describe('renderer-diagnostics wiring', () => {
    it('sampleScenePerformance consumes threadUpdateMs and smooths avgThreadUpdateMs', () => {
        // Pre-condition: avgThreadUpdateMs starts at 0.
        expect(mockState.scenePerformanceDiagnostics.avgThreadUpdateMs).toBe(0)

        sampleScenePerformance(16.7, {
            updateMs: 5.0,
            renderMs: 2.0,
            threadUpdateMs: 3.2
        })

        const d = mockState.scenePerformanceDiagnostics
        expect(d.sampleCount).toBe(1)
        // First sample: avg = 3.2 (sole sample)
        expect(d.avgThreadUpdateMs).toBeCloseTo(3.2, 1)

        // Second sample: avg converges toward 3.2
        sampleScenePerformance(16.7, {
            updateMs: 5.0,
            renderMs: 2.0,
            threadUpdateMs: 0.8
        })

        // After 2 samples, avgThreadUpdateMs = (3.2 * 1 + 0.8) / 2 = 2.0
        expect(d.avgThreadUpdateMs).toBeCloseTo(2.0, 1)
    })

    it('sampleScenePerformance consumes overlayUpdateMs and smooths avgOverlayUpdateMs + maxOverlayUpdateMs', () => {
        mockState.scenePerformanceDiagnostics.sampleCount = 0
        mockState.scenePerformanceDiagnostics.avgOverlayUpdateMs = 0
        mockState.scenePerformanceDiagnostics.maxOverlayUpdateMs = 0

        sampleScenePerformance(16.7, {
            updateMs: 5.0,
            renderMs: 2.0,
            overlayUpdateMs: 1.5
        })

        const d = mockState.scenePerformanceDiagnostics
        expect(d.avgOverlayUpdateMs).toBeCloseTo(1.5, 1)
        expect(d.maxOverlayUpdateMs).toBe(1.5)
    })

    it('maxOverlayUpdateMs uses decaying max (* 0.992)', () => {
        mockState.scenePerformanceDiagnostics.sampleCount = 0
        mockState.scenePerformanceDiagnostics.maxOverlayUpdateMs = 10.0

        sampleScenePerformance(16.7, {
            updateMs: 5.0,
            renderMs: 2.0,
            overlayUpdateMs: 1.0
        })

        // Decayed: max(1.0, 10.0 * 0.992) = max(1.0, 9.92) = 9.92
        expect(mockState.scenePerformanceDiagnostics.maxOverlayUpdateMs).toBeCloseTo(9.92, 2)
    })

    it('nodeMotionMs is passed through and smoothed', () => {
        mockState.scenePerformanceDiagnostics.sampleCount = 0
        mockState.scenePerformanceDiagnostics.avgNodeMotionMs = 0

        sampleScenePerformance(16.7, {
            updateMs: 5.0,
            renderMs: 2.0,
            nodeMotionMs: 1.3
        })

        expect(mockState.scenePerformanceDiagnostics.avgNodeMotionMs).toBeCloseTo(1.3, 1)
    })

    it('sampleCount caps at 600', () => {
        mockState.scenePerformanceDiagnostics.sampleCount = 599

        sampleScenePerformance(16.7, { updateMs: 5, renderMs: 2 })
        expect(mockState.scenePerformanceDiagnostics.sampleCount).toBe(600)

        sampleScenePerformance(16.7, { updateMs: 5, renderMs: 2 })
        // Cap: should not exceed 600
        expect(mockState.scenePerformanceDiagnostics.sampleCount).toBe(600)
    })

    it('active/reason: false when currentView is not galaxy', () => {
        mockState.currentView = 'map' as unknown
        sampleScenePerformance(16.7, { updateMs: 5, renderMs: 2 })
        expect(mockState.scenePerformanceDiagnostics.active).toBe(false)
        expect(mockState.scenePerformanceDiagnostics.reason).toBe('inactive-view')
        // Restore for other tests
        mockState.currentView = 'galaxy' as unknown
    })

    it('renderables is assigned with expected keys', () => {
        sampleScenePerformance(16.7, { updateMs: 5, renderMs: 2 })
        const r = mockState.scenePerformanceDiagnostics.renderables
        expect(r).toBeDefined()
        expect(typeof r.active).toBe('boolean')
        expect(typeof r.drawCalls).toBe('number')
        expect(typeof r.points).toBe('number')
    })
})

describe('smoothDiagnosticValue utility', () => {
    it('returns next on first sample', () => {
        expect(smoothDiagnosticValue(0, 5.0, 1)).toBeCloseTo(5.0, 1)
    })

    it('averages with divisor = sampleCount', () => {
        // current=4.0, next=2.0, sampleCount=3
        // = (4 * (3-1) + 2) / 3 = (8 + 2) / 3 = 10/3 ≈ 3.333
        expect(smoothDiagnosticValue(4.0, 2.0, 3)).toBeCloseTo(3.333, 2)
    })

    it('clamps divisor at 120', () => {
        // sampleCount=200 → divisor = 120
        // = (4 * 119 + 2) / 120 = 476/120 + 2/120 = 3.983...
        const result = smoothDiagnosticValue(4.0, 2.0, 200)
        expect(result).toBeCloseTo((4.0 * 119 + 2.0) / 120, 4)
    })
})
