/**
 * @file canvas-node-picking-tierd-cascade-typing-contract.test.ts
 *
 * Lock-in test for the W47-Bite-Continued (consumer-side) tightening of
 * src/lib/journey/canvas-node-picking.ts (16 → 13 any occurrences).
 *
 * This bite is the Tier D cascade: after Tier D first bite (dbd6f5c9)
 * tightened appState scene/pointsMesh/pointsMaterial/etc. and Wave 2b
 * (46cbc600) tightened CameraLike/ControlsLike, this consumer file
 * could drop several unnecessary `as unknown as` casts.
 *
 * Patterns tightened:
 *
 *   - `(projected as unknown as { z: number }).z` (1 site):
 *     `Vector3.clone().project()` returns Vector3 which already has .z;
 *     the cast was masking nothing.
 *
 *   - `appState.lastCanvasNodePick = X as unknown as typeof appState.lastCanvasNodePick`:
 *     Replaced 2x `as unknown as typeof ...` with `as unknown as CanvasHoverCandidate`
 *     (named type import from @lib/state/state-types). Same cast count,
 *     but the named type documents intent and survives renames of the
 *     `appState.lastCanvasNodePick` field type.
 *
 *   - `appState.camera as unknown as PerspectiveCamera | undefined`
 *     in `getCanvasPointWorldThreshold()` (1 site):
 *     The function only reads camera.position.distanceTo() and camera.fov.
 *     CameraLike has both, so the cast was unnecessary. Required a
 *     non-null assertion on `camera.fov!` since CameraLike declares
 *     fov?: number.
 *
 *   - `as unknown as typeof appState.lastCanvasNodePick` → removed
 *     for type-narrowing correctness (CanvasNodePickCandidate type
 *     doesn't satisfy CanvasHoverCandidate's [key: string]: unknown
 *     index signature; explicit type cast documents intent).
 *
 * Remaining patterns (intentionally kept):
 *   - camera as PerspectiveCamera | undefined / Camera | undefined in
 *     Raycaster-using functions (setFromCamera, intersectObject need
 *     Three.js Camera/Object3D types — CameraLike is structurally
 *     accurate but not assignable to Three.js Camera without cast)
 *   - pointsMesh as Object3D | undefined in Raycaster-using functions
 *   - points as GeoPoint[] — real type mismatch (Point has wider
 *     fields than GeoPoint; can't be tightened without changing
 *     one of the type definitions)
 *   - sporePickMesh as InstancedMesh | undefined — needed for Raycaster
 *     API and for the `??` operator coalescing the two mesh fields
 *
 * Run: npx vitest run tests/unit-active/canvas-node-picking-tierd-cascade-typing-contract.test.ts
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(__dirname, '..', '..')

function readSource(rel: string): string {
    return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}

function countAnyOccurrences(source: string): number {
    const matches = source.match(/:\s*any\b|\bas\s+any\b|\bas\s+unknown\s+as\b/g) || []
    return matches.length
}

describe('W47-Bite-Continued / canvas-node-picking.ts / Tier D cascade', () => {
    it('any count is reduced from 16 baseline to ≤13 (post-tightening baseline)', () => {
        const source = readSource('src/lib/journey/canvas-node-picking.ts')
        const count = countAnyOccurrences(source)
        expect(count, `canvas-node-picking.ts has ${count} any occurrences (lock-in target ≤13)`).toBeLessThanOrEqual(13)
    })

    it('dropped (projected as unknown as { z: number }) cast', () => {
        const source = readSource('src/lib/journey/canvas-node-picking.ts')
        expect(source).not.toMatch(/projected\s+as\s+unknown\s+as\s*\{\s*z:\s*number\s*\}/)
        // Direct access is now in place
        expect(source).toMatch(/projected\.z\s*<\s*-1/)
        expect(source).toMatch(/projected\.z\s*>\s*1/)
    })

    it('lastCanvasNodePick casts use named CanvasHoverCandidate type', () => {
        const source = readSource('src/lib/journey/canvas-node-picking.ts')
        // Old `as unknown as typeof appState.lastCanvasNodePick` should be gone
        expect(source).not.toMatch(/as\s+unknown\s+as\s+typeof\s+appState\.lastCanvasNodePick/)
        // New named type should be in place (2 sites)
        const namedCasts = source.match(/as\s+unknown\s+as\s+CanvasHoverCandidate/g) || []
        expect(namedCasts.length, `expected 2 named casts, got ${namedCasts.length}`).toBe(2)
    })

    it('CanvasHoverCandidate is imported from @lib/state/state-types', () => {
        const source = readSource('src/lib/journey/canvas-node-picking.ts')
        expect(source).toMatch(/import\s+type\s*\{[^}]*\bCanvasHoverCandidate\b[^}]*\}\s+from\s+['"][^'"]*state-types['"]/)
    })

    it('getCanvasPointWorldThreshold drops camera/pointsMesh casts (uses typed access)', () => {
        const source = readSource('src/lib/journey/canvas-node-picking.ts')
        const fn = source.match(/function\s+getCanvasPointWorldThreshold[\s\S]*?\n\}/m)
        expect(fn, 'getCanvasPointWorldThreshold not found').not.toBeNull()
        const body = fn![0]
        // Both local consts use typed access (no `as unknown as`)
        expect(body).toMatch(/const\s+camera\s*=\s*appState\.camera\b/)
        expect(body).toMatch(/const\s+pointsMesh\s*=\s*appState\.pointsMesh\b/)
        expect(body).not.toMatch(/appState\.camera\s+as\s+unknown/)
        expect(body).not.toMatch(/appState\.pointsMesh\s+as\s+unknown/)
    })

    it('camera.fov uses non-null assertion (!) since CameraLike declares fov?: number', () => {
        const source = readSource('src/lib/journey/canvas-node-picking.ts')
        expect(source).toMatch(/camera\.fov!/)
    })

    it('preserved: Raycaster-API casts for camera/pointsMesh/sporePickMesh', () => {
        // These casts ARE necessary because Raycaster.setFromCamera() and
        // intersectObject() require Three.js Camera/Object3D/InstancedMesh
        // types that CameraLike/Points/InstancedMesh don't satisfy
        // structurally (CameraLike is intentionally narrow)
        const source = readSource('src/lib/journey/canvas-node-picking.ts')
        expect(source).toMatch(/camera as unknown as PerspectiveCamera \| undefined/)
        expect(source).toMatch(/camera as unknown as Camera \| undefined/)
        expect(source).toMatch(/pointsMesh as unknown as Object3D \| undefined/)
    })

    it('preserved: points as GeoPoint[] (real type mismatch — Point wider than GeoPoint)', () => {
        const source = readSource('src/lib/journey/canvas-node-picking.ts')
        const pointsCasts = source.match(/appState\.points\s+as\s+unknown\s+as\s+GeoPoint\[\]/g) || []
        expect(pointsCasts.length, `expected GeoPoint[] casts preserved, got ${pointsCasts.length}`).toBeGreaterThanOrEqual(2)
    })
})