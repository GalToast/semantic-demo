/**
 * scene-static-tracker.test.ts — W49-H conditional render-skip helper
 *
 * Locks in the contract for src/lib/engine/renderer/scene-static-tracker.ts.
 * The animate loop calls `shouldSkipNextRender(...)` before
 * `renderer.render(scene, camera)`. We test every branch:
 *
 *  1. First call (prev=null) → never skip (no baseline to compare)
 *  2. animatingNow=true → never skip (user-driven animation in flight)
 *  3. Previous snapshot is identity pose (all zeros) → never skip
 *     (no real baseline)
 *  4. Same camera pos + quat as previous → SKIP
 *  5. Camera pos drifted by >EPSILON → do not skip
 *  6. Camera quat drifted by >EPSILON → do not skip
 *  7. Sub-epsilon drift → SKIP (within tolerance)
 *  8. Caller gets the current snapshot back as `nextSnapshot` so
 *     they can pass it on the next call
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { shouldSkipNextRender, type SceneStaticSnapshot } from '../../src/lib/engine/renderer/scene-static-tracker'

const coreSource = readFileSync(resolve(process.cwd(), 'src/lib/engine/three-engine-core.ts'), 'utf8')

const sample1: SceneStaticSnapshot = {
    cameraPos: [1.234, 5.678, 9.012],
    cameraQuat: [0.1, 0.2, 0.3, 0.9274] // unit-ish quat, w > x/y/z
}

const sample1BumpedPos: SceneStaticSnapshot = {
    cameraPos: [1.235, 5.678, 9.012], // +0.001 in x → above EPSILON
    cameraQuat: [0.1, 0.2, 0.3, 0.9274]
}

const sample1BumpedQuat: SceneStaticSnapshot = {
    cameraPos: [1.234, 5.678, 9.012],
    cameraQuat: [0.1, 0.2001, 0.3, 0.9274] // +0.0001 in y → above EPSILON
}

const sample1DriftedFar: SceneStaticSnapshot = {
    cameraPos: [10, 20, 30], // huge movement
    cameraQuat: [0.5, 0.5, 0.5, 0.5]
}

const identity: SceneStaticSnapshot = {
    cameraPos: [0, 0, 0],
    cameraQuat: [0, 0, 0, 0]
}

describe('shouldSkipNextRender (W49-H)', () => {
    it('never skips on first call (prev=null)', () => {
        const r = shouldSkipNextRender(null, sample1, false)
        expect(r.shouldSkip).toBe(false)
        expect(r.nextSnapshot).toBe(sample1)
    })

    it('never skips when animatingNow=true (even if camera is identical)', () => {
        const r = shouldSkipNextRender(sample1, sample1, true)
        expect(r.shouldSkip).toBe(false)
    })

    it('never skips when prev is identity pose (no real baseline)', () => {
        const r = shouldSkipNextRender(identity, sample1, false)
        expect(r.shouldSkip).toBe(false)
    })

    it('SKIPS when prev and curr are exactly equal and animatingNow=false', () => {
        const r = shouldSkipNextRender(sample1, sample1, false)
        expect(r.shouldSkip).toBe(true)
    })

    it('does NOT skip when camera position drifts above EPSILON', () => {
        const r = shouldSkipNextRender(sample1, sample1BumpedPos, false)
        expect(r.shouldSkip).toBe(false)
    })

    it('does NOT skip when camera quaternion drifts above EPSILON', () => {
        const r = shouldSkipNextRender(sample1, sample1BumpedQuat, false)
        expect(r.shouldSkip).toBe(false)
    })

    it('SKIPS when drift is below EPSILON (sub-pixel camera noise)', () => {
        const microDrift: SceneStaticSnapshot = {
            cameraPos: [1.2340000001, 5.6780000001, 9.0120000001],
            cameraQuat: [0.1, 0.2, 0.3000000001, 0.9274]
        }
        const r = shouldSkipNextRender(sample1, microDrift, false)
        expect(r.shouldSkip).toBe(true)
    })

    it('returns the curr snapshot so the caller can chain it', () => {
        const r = shouldSkipNextRender(sample1, sample1DriftedFar, false)
        expect(r.nextSnapshot).toBe(sample1DriftedFar)
        // And a follow-up call with the returned snapshot works.
        const r2 = shouldSkipNextRender(r.nextSnapshot, sample1DriftedFar, false)
        expect(r2.shouldSkip).toBe(true)
    })

    it('table-driven: common scenarios', () => {
        const cases: Array<{
            label: string
            prev: SceneStaticSnapshot | null
            curr: SceneStaticSnapshot
            animating: boolean
            expected: boolean
        }> = [
            { label: 'first call', prev: null, curr: sample1, animating: false, expected: false },
            { label: 'animation in flight', prev: sample1, curr: sample1, animating: true, expected: false },
            { label: 'identity prev', prev: identity, curr: sample1, animating: false, expected: false },
            { label: 'static scene', prev: sample1, curr: sample1, animating: false, expected: true },
            { label: 'pos drift', prev: sample1, curr: sample1BumpedPos, animating: false, expected: false },
            { label: 'quat drift', prev: sample1, curr: sample1BumpedQuat, animating: false, expected: false },
            { label: 'huge move', prev: sample1, curr: sample1DriftedFar, animating: false, expected: false }
        ]
        for (const c of cases) {
            const r = shouldSkipNextRender(c.prev, c.curr, c.animating)
            expect(r.shouldSkip, c.label).toBe(c.expected)
        }
    })

    it('wires the render-skip gate into the live animate loop (exact-statement source check)', () => {
        expect(coreSource.includes('sceneVisualsNeedRender(')).toBe(true)
        expect(coreSource.includes('shouldSkipNextRenderHelper(engineState.lastCameraSnapshot')).toBe(true)
        expect(coreSource.includes('webglContext.renderer.render(')).toBe(true)
    })
})
