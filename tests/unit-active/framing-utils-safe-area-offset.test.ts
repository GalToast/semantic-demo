import { describe, it, expect } from 'vitest'
import { Vector3, PerspectiveCamera } from 'three'
import {
    computeSafeAreaCameraTargetOffset,
    type PocketBounds,
    type CanvasRegion
} from '../../src/lib/engine/camera-choreography/framing-utils'

/**
 * W61 F2 regression — computeSafeAreaCameraTargetOffset scale.
 *
 * The pre-fix code multiplied the dimensionless excess fraction
 * (|normX| - margin, a fraction of the region HALF-extent) by
 * `pixelsPerUnit` WITHOUT multiplying back by the half-extent in pixels.
 * Result: corrections of ~0.0003 world units (~a third of a pixel) that
 * always fell under the null threshold (lengthSq < 1e-6) — the safe-area
 * nudge NEVER fired. The fix scales the excess by halfW/halfH so the
 * offset reaches meaningful world units (up to the 0.12 clamp in focus.ts).
 */
describe('computeSafeAreaCameraTargetOffset', () => {
    // Region: 1500x900 → halfW=750, halfH=450, center (750, 450).
    const region: CanvasRegion = { x: 0, y: 0, width: 1500, height: 900 }
    // Camera at +Z looking at origin: rightVec = cross(up, target→camera) = +X.
    const camera = { position: new Vector3(0, 0, 0.88) } as unknown as PerspectiveCamera
    const controls = { target: new Vector3(0, 0, 0), update: () => {}, enabled: true }
    const focusDistance = 0.88

    function pocket(centerX: number, halfW: number, centerY = 450, halfH = 700): PocketBounds {
        return {
            minX: centerX - halfW,
            maxX: centerX + halfW,
            minY: centerY - halfH,
            maxY: centerY + halfH,
            centerX,
            centerY
        }
    }

    it('returns a MEANINGFUL offset when the pocket is off-center and constrained (F2)', () => {
        // Pocket half-width 700 > available 615 (halfW*0.82 - pocketHalfW < 0) →
        // constrained X. Pocket center 700px right of region center →
        // normX ≈ 0.933, excess beyond the 0.82 margin ≈ 0.113.
        const bounds = pocket(750 + 700, 700)
        const result = computeSafeAreaCameraTargetOffset(bounds, region, focusDistance, camera, controls)

        // Pre-fix: correction ≈ 0.113 * 0.001144 * 1.4 ≈ 0.00018 world units →
        // lengthSq < 1e-6 → null. Post-fix: 0.113 * 750 * 0.001144 * 1.4 ≈ 0.136.
        expect(result).not.toBeNull()
        expect(result!.length()).toBeGreaterThan(0.05)
        // Pocket right of center → frame nudges RIGHT (+rightVec = +X here) to
        // bring the pocket back toward the region center.
        expect(result!.x).toBeGreaterThan(0)
    })

    it('returns null when the pocket is centered (no nudge needed)', () => {
        const bounds = pocket(750, 700)
        const result = computeSafeAreaCameraTargetOffset(bounds, region, focusDistance, camera, controls)
        expect(result).toBeNull()
    })

    it('returns null when the pocket fits inside the margin (unconstrained)', () => {
        // Pocket half-width 100 → available 515 > 0 → not constrained.
        const bounds = pocket(750 + 700, 100)
        const result = computeSafeAreaCameraTargetOffset(bounds, region, focusDistance, camera, controls)
        expect(result).toBeNull()
    })

    it('scales the Y correction with halfH, not halfW', () => {
        // Pocket above center: centerY = 450 - 400 = 50, normY = -400/450 ≈ -0.889,
        // excess ≈ 0.069; constrained Y (pocketHalfH 700 > 369).
        const bounds = pocket(750, 100, 50, 700)
        const result = computeSafeAreaCameraTargetOffset(bounds, region, focusDistance, camera, controls)
        expect(result).not.toBeNull()
        // upVec = cross(viewDir, rightVec) = cross((0,0,1),(1,0,0)) = (0,1,0).
        // normY < 0 → +sign(normY) * upVec = +Y.
        expect(result!.y).toBeGreaterThan(0.01)
    })
})
