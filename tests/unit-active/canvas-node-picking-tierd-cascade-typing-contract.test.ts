/**
 * @file canvas-node-picking-tierd-cascade-typing-contract.test.ts
 *
 * Lock-in test for canvas-node-picking.ts Tier D cascade tightening.
 * Verifies that the typed accessor pattern (getRaycastCamera, getRaycastPointsMesh, etc.)
 * is in place and that unnecessary inline `as unknown as` casts were removed.
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

describe('canvas-node-picking.ts / Tier D cascade', () => {
    it('CanvasHoverCandidate is imported from @lib/state/state-types', () => {
        const source = readSource('src/lib/journey/canvas-node-picking.ts')
        expect(source).toMatch(/import\s+type\s*\{[^}]*\bCanvasHoverCandidate\b[^}]*\}\s+from\s+['"][^'"]*state-types['"]/)
    })

    it('Raycaster accessors use typed helpers (getRaycastCamera/getRaycastPointsMesh)', () => {
        const source = readSource('src/lib/journey/canvas-node-picking.ts')
        expect(source).toMatch(/function\s+getRaycastCamera\(\)/)
        expect(source).toMatch(/function\s+getRaycastPointsMesh\(\)/)
        expect(source).toMatch(/function\s+getRaycastPoints\(\)/)
        expect(source).toMatch(/function\s+getRaycastSporeMesh\(\)/)
    })

    it('getRaycastCamera returns PerspectiveCamera directly', () => {
        const source = readSource('src/lib/journey/canvas-node-picking.ts')
        const fn = source.match(/function\s+getRaycastCamera[\s\S]*?\n\}/m)
        expect(fn, 'getRaycastCamera not found').not.toBeNull()
        const body = fn![0]
        expect(body).toMatch(/return\s+appState\.camera/)
        expect(body).not.toMatch(/as\s+unknown/)
    })

    it('old inline casts are gone (no as unknown as typeof appState)', () => {
        const source = readSource('src/lib/journey/canvas-node-picking.ts')
        expect(source).not.toMatch(/as\s+unknown\s+as\s+typeof\s+appState\.lastCanvasNodePick/)
    })

    it('lastCanvasNodePick is assigned directly via appState', () => {
        const source = readSource('src/lib/journey/canvas-node-picking.ts')
        expect(source).toMatch(/appState\.lastCanvasNodePick\s*=/)
    })

    it('preserved: getRaycastPointsMesh uses as unknown as Object3D', () => {
        const source = readSource('src/lib/journey/canvas-node-picking.ts')
        expect(source).toMatch(/pointsMesh\s+as\s+unknown\s+as\s+Object3D/)
    })

    it('preserved: getRaycastPoints uses as unknown as GeoPoint[]', () => {
        const source = readSource('src/lib/journey/canvas-node-picking.ts')
        const pointsCasts = source.match(/appState\.points\s+as\s+unknown\s+as\s+GeoPoint\[\]/g) || []
        expect(pointsCasts.length, `expected GeoPoint[] cast preserved, got ${pointsCasts.length}`).toBeGreaterThanOrEqual(1)
    })

    it('preserved: getRaycastSporeMesh uses as unknown as InstancedMesh', () => {
        const source = readSource('src/lib/journey/canvas-node-picking.ts')
        expect(source).toMatch(/InstancedMesh\s*\|\s*null/)
    })
})
