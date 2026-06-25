/**
 * @file state-three-handles-typing-contract.test.ts
 *
 * Lock-in test for the engine-boundary refactor Tier D first bite:
 * Three.js handle field declarations in appState use direct Three.js types
 * (Scene, Points, PointsMaterial, InstancedMesh, Material) instead of
 * `SemanticState['X']` indirection.
 *
 * Background: state-types.ts has a [key: string]: unknown index signature on
 * SemanticState for Proxy compatibility. This made `SemanticState['scene']`
 * resolve through `WebGLContextState['scene']` indirection, which is
 * correct but opaque. The state class declarations
 * (`$state<SemanticState['scene']>(null as unknown as SemanticState['scene'])`)
 * were syntactically heavy and hid the actual type.
 *
 * Tier D first bite replaces the indirection with direct Three.js types:
 *   - scene: $state<Scene | null>(null)
 *   - pointsMesh: $state<Points | null>(null)
 *   - pointsMaterial: $state<PointsMaterial | null>(null)
 *   - nodeSporeMesh: $state<InstancedMesh | null>(null)
 *   - nodeSporeHitMesh: $state<InstancedMesh | null>(null)
 *   - nodeSporeMaterial: $state<Material | null>(null)
 *
 * Camera, renderer, controls were already typed via the `*Like` interfaces
 * (CameraLike, RendererLike, ControlsLike) in a prior session.
 *
 * What this unlocks (future Tier D bites):
 *   - Consumers can use direct Three.js types instead of casting through
 *     `as unknown as ChoreographyCamera` / `as unknown as OrbitSlackCamera`
 *   - The structural-type mismatch between CameraLike and the parallel
 *     ChoreographyCamera / OrbitSlackCamera interfaces can be resolved
 *     (the underlying types are now visible)
 *
 * Run: npx vitest run tests/unit-active/state-three-handles-typing-contract.test.ts
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(__dirname, '..', '..')
const APP_STATE_PATH = path.join(ROOT, 'src', 'lib', 'state', 'app.svelte.ts')

function readSource(rel: string): string {
    return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}

describe('engine-boundary refactor / Tier D first bite / Three.js handle typing', () => {
    it('Three.js types are imported in app.svelte.ts', () => {
        const source = readSource('src/lib/state/app.svelte.ts')
        expect(source).toMatch(/import\s+type\s*\{[^}]*\bScene\b[^}]*\}\s+from\s+['"]three['"]/)
        expect(source).toMatch(/import\s+type\s*\{[^}]*\bPoints\b[^}]*\}/)
        expect(source).toMatch(/import\s+type\s*\{[^}]*\bPointsMaterial\b[^}]*\}/)
        expect(source).toMatch(/import\s+type\s*\{[^}]*\bInstancedMesh\b[^}]*\}/)
        expect(source).toMatch(/import\s+type\s*\{[^}]*\bMaterial\b[^}]*\}/)
    })

    it('scene is typed as Scene | null (no longer SemanticState indirection)', () => {
        const source = readSource('src/lib/state/app.svelte.ts')
        // Must be direct Scene | null, not the verbose indirection
        expect(source).toMatch(/scene\s*=\s*\$state<Scene\s*\|\s*null>\(null\)/)
        // Must not have the old pattern
        expect(source).not.toMatch(/scene\s*=\s*\$state<SemanticState\['scene']>/)
    })

    it('pointsMesh is typed as Points | null', () => {
        const source = readSource('src/lib/state/app.svelte.ts')
        expect(source).toMatch(/pointsMesh\s*=\s*\$state<Points\s*\|\s*null>\(null\)/)
        expect(source).not.toMatch(/pointsMesh\s*=\s*\$state<SemanticState\['pointsMesh']>/)
    })

    it('pointsMaterial is typed as PointsMaterial | null', () => {
        const source = readSource('src/lib/state/app.svelte.ts')
        expect(source).toMatch(/pointsMaterial\s*=\s*\$state<PointsMaterial\s*\|\s*null>\(null\)/)
        expect(source).not.toMatch(/pointsMaterial\s*=\s*\$state<SemanticState\['pointsMaterial']>/)
    })

    it('nodeSporeMesh is typed as InstancedMesh | null', () => {
        const source = readSource('src/lib/state/app.svelte.ts')
        expect(source).toMatch(/nodeSporeMesh\s*=\s*\$state<InstancedMesh\s*\|\s*null>\(null\)/)
        expect(source).not.toMatch(/nodeSporeMesh\s*=\s*\$state<SemanticState\['nodeSporeMesh']>/)
    })

    it('nodeSporeHitMesh is typed as InstancedMesh | null', () => {
        const source = readSource('src/lib/state/app.svelte.ts')
        expect(source).toMatch(/nodeSporeHitMesh\s*=\s*\$state<InstancedMesh\s*\|\s*null>\(null\)/)
        expect(source).not.toMatch(/nodeSporeHitMesh\s*=\s*\$state<SemanticState\['nodeSporeHitMesh']>/)
    })

    it('nodeSporeMaterial is typed as Material | null', () => {
        const source = readSource('src/lib/state/app.svelte.ts')
        expect(source).toMatch(/nodeSporeMaterial\s*=\s*\$state<Material\s*\|\s*null>\(null\)/)
        expect(source).not.toMatch(/nodeSporeMaterial\s*=\s*\$state<SemanticState\['nodeSporeMaterial']>/)
    })

    it('camera uses direct Three.js type (not CameraLike)', () => {
        // Camera was changed from CameraLike to PerspectiveCamera | null
        const source = readSource('src/lib/state/app.svelte.ts')
        expect(source).toMatch(/camera\s*=\s*\$state<PerspectiveCamera\s*\|\s*null>/)
    })

    it('renderer/controls still use the *Like interfaces (not regressed)', () => {
        // These were already typed in a prior session and should remain
        const source = readSource('src/lib/state/app.svelte.ts')
        expect(source).toMatch(/renderer\s*=\s*\$state<RendererLike>/)
        expect(source).toMatch(/controls\s*=\s*\$state<ControlsLike>/)
    })

    it('no `null as unknown as SemanticState[...]` boilerplate remains for these 6 fields', () => {
        // The old pattern was verbose: `null as unknown as SemanticState['X']`.
        // The new pattern is just `null` with the explicit type in $state<T>.
        const source = readSource('src/lib/state/app.svelte.ts')
        expect(source).not.toMatch(/null\s+as\s+unknown\s+as\s+SemanticState\['scene']/)
        expect(source).not.toMatch(/null\s+as\s+unknown\s+as\s+SemanticState\['pointsMesh']/)
        expect(source).not.toMatch(/null\s+as\s+unknown\s+as\s+SemanticState\['pointsMaterial']/)
        expect(source).not.toMatch(/null\s+as\s+unknown\s+as\s+SemanticState\['nodeSporeMesh']/)
        expect(source).not.toMatch(/null\s+as\s+unknown\s+as\s+SemanticState\['nodeSporeHitMesh']/)
        expect(source).not.toMatch(/null\s+as\s+unknown\s+as\s+SemanticState\['nodeSporeMaterial']/)
    })
})
