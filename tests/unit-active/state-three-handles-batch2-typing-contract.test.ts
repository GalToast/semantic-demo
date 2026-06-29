/**
 * @file state-three-handles-batch2-typing-contract.test.ts
 *
 * Lock-in test for the engine-boundary refactor Tier D second bite:
 * direct Three.js types for 14 more state class handle fields.
 *
 * Fields tightened (Batch 2 — non-camera Three.js handles):
 *   myceliumLines, myceliumGroup, myceliumCoreLines, myceliumWispyLines,
 *   myceliumBridgeLines, focusSemanticLines, focusAnchorGroup,
 *   focusAnchorRingMesh, focusAnchorHaloSprite, semanticLensGroup,
 *   semanticLensGlow, semanticLensSpokes, hemiLight, dirLight
 *
 * Each field was previously typed via `SemanticState['X']` indirection
 * (which resolved through WebGLContextState['X'] to the correct Three.js
 * class). The indirection is replaced with direct Three.js type imports.
 *
 * Combined with Tier D first bite (dbd6f5c9, 6 fields) and the already-typed
 * camera/renderer/controls (CameraLike/RendererLike/ControlsLike), this
 * completes the Tier D state-class work — 23 of ~23 Three.js handles now
 * use direct types.
 *
 * Run: npx vitest run tests/unit-active/state-three-handles-batch2-typing-contract.test.ts
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(__dirname, '..', '..')
const APP_STATE_PATH = path.join(ROOT, 'src', 'lib', 'state', 'app.svelte.ts')

function readSource(rel: string): string {
    return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}

describe('engine-boundary refactor / Tier D second bite / Three.js handles batch 2', () => {
    it('Three.js types for batch 2 are imported', () => {
        const source = readSource('src/lib/state/app.svelte.ts')
        expect(source).toMatch(/import\s+type\s*\{[^}]*\bLineSegments\b[^}]*\}/)
        expect(source).toMatch(/import\s+type\s*\{[^}]*\bGroup\b[^}]*\}/)
        expect(source).toMatch(/import\s+type\s*\{[^}]*\bMesh\b[^}]*\}/)
        expect(source).toMatch(/import\s+type\s*\{[^}]*\bSprite\b[^}]*\}/)
        expect(source).toMatch(/import\s+type\s*\{[^}]*\bHemisphereLight\b[^}]*\}/)
        expect(source).toMatch(/import\s+type\s*\{[^}]*\bDirectionalLight\b[^}]*\}/)
    })

    const batchFields: Array<{ field: string; type: string }> = [
        { field: 'myceliumLines', type: 'LineSegments' },
        { field: 'myceliumGroup', type: 'Group' },
        // 2d4b210e refactor(engine): Line2 variable-width mycelium threads
        // — these mycelium fields are LineSegments2 (from three/examples/jsm/lines),
        // not the basic LineSegments from 'three'. The typing-contract test
        // should match the post-Line2 reality.
        { field: 'myceliumCoreLines', type: 'LineSegments2' },
        { field: 'myceliumWispyLines', type: 'LineSegments2' },
        { field: 'myceliumBridgeLines', type: 'LineSegments2' },
        { field: 'focusSemanticLines', type: 'LineSegments' },
        { field: 'focusAnchorGroup', type: 'Group' },
        { field: 'focusAnchorRingMesh', type: 'Mesh' },
        { field: 'focusAnchorHaloSprite', type: 'Sprite' },
        { field: 'semanticLensGroup', type: 'Group' },
        { field: 'semanticLensGlow', type: 'Mesh' },
        { field: 'semanticLensSpokes', type: 'LineSegments' },
        { field: 'hemiLight', type: 'HemisphereLight' },
        { field: 'dirLight', type: 'DirectionalLight' }
    ]

    for (const { field, type } of batchFields) {
        it(`${field} is typed as ${type} | null`, () => {
            const source = readSource('src/lib/state/app.svelte.ts')
            const re = new RegExp(`${field}\\s*=\\s*\\$state<${type}\\s*\\|\\s*null>\\(null\\)`)
            expect(source.match(re), `${field} should be typed as ${type} | null`).not.toBeNull()
            // Negative: should NOT have SemanticState indirection
            const oldRe = new RegExp(`${field}\\s*=\\s*\\$state<SemanticState\\['${field}']>`)
            expect(source.match(oldRe), `${field} still uses SemanticState['${field}'] indirection`).toBeNull()
        })
    }

    it('no `null as unknown as SemanticState[...]` boilerplate remains for batch 2 fields', () => {
        const source = readSource('src/lib/state/app.svelte.ts')
        expect(source).not.toMatch(/null\s+as\s+unknown\s+as\s+SemanticState\['myceliumLines']/)
        expect(source).not.toMatch(/null\s+as\s+unknown\s+as\s+SemanticState\['myceliumGroup']/)
        expect(source).not.toMatch(/null\s+as\s+unknown\s+as\s+SemanticState\['myceliumCoreLines']/)
        expect(source).not.toMatch(/null\s+as\s+unknown\s+as\s+SemanticState\['myceliumWispyLines']/)
        expect(source).not.toMatch(/null\s+as\s+unknown\s+as\s+SemanticState\['myceliumBridgeLines']/)
        expect(source).not.toMatch(/null\s+as\s+unknown\s+as\s+SemanticState\['focusSemanticLines']/)
        expect(source).not.toMatch(/null\s+as\s+unknown\s+as\s+SemanticState\['focusAnchorGroup']/)
        expect(source).not.toMatch(/null\s+as\s+unknown\s+as\s+SemanticState\['focusAnchorRingMesh']/)
        expect(source).not.toMatch(/null\s+as\s+unknown\s+as\s+SemanticState\['focusAnchorHaloSprite']/)
        expect(source).not.toMatch(/null\s+as\s+unknown\s+as\s+SemanticState\['semanticLensGroup']/)
        expect(source).not.toMatch(/null\s+as\s+unknown\s+as\s+SemanticState\['semanticLensGlow']/)
        expect(source).not.toMatch(/null\s+as\s+unknown\s+as\s+SemanticState\['semanticLensSpokes']/)
        expect(source).not.toMatch(/null\s+as\s+unknown\s+as\s+SemanticState\['hemiLight']/)
        expect(source).not.toMatch(/null\s+as\s+unknown\s+as\s+SemanticState\['dirLight']/)
    })

    it('Tier D batch 1 (scene/pointsMesh/etc) did not regress', () => {
        // Regression guard from Tier D first bite (dbd6f5c9)
        const source = readSource('src/lib/state/app.svelte.ts')
        expect(source).toMatch(/scene\s*=\s*\$state<Scene\s*\|\s*null>\(null\)/)
        expect(source).toMatch(/pointsMesh\s*=\s*\$state<Points\s*\|\s*null>\(null\)/)
        expect(source).toMatch(/pointsMaterial\s*=\s*\$state<PointsMaterial\s*\|\s*null>\(null\)/)
        expect(source).toMatch(/nodeSporeMesh\s*=\s*\$state<InstancedMesh\s*\|\s*null>\(null\)/)
        expect(source).toMatch(/nodeSporeMaterial\s*=\s*\$state<Material\s*\|\s*null>\(null\)/)
    })

    it('camera uses direct Three.js type (not CameraLike)', () => {
        const source = readSource('src/lib/state/app.svelte.ts')
        expect(source).toMatch(/camera\s*=\s*\$state<PerspectiveCamera\s*\|\s*null>/)
    })

    it('renderer/controls use real Three.js types (T-5 tightened)', () => {
        const source = readSource('src/lib/state/app.svelte.ts')
        expect(source).toMatch(/renderer\s*=\s*\$state<WebGLRenderer \| null>/)
        expect(source).toMatch(/controls\s*=\s*\$state<OrbitControls \| null>/)
        expect(source).not.toMatch(/renderer\s*=\s*\$state<RendererLike>/)
        expect(source).not.toMatch(/controls\s*=\s*\$state<ControlsLike>/)
    })
})
