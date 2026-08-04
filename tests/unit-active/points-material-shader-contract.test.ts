import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')

describe('points-material size-boost shader contract', () => {
    // The bug: node-manager's installPointMaterialShader used to `.replace()`
    // the string `gl_PointSize = clamp(size, 1.0, 128.0);`, but three r184's
    // points_vert emits `gl_PointSize = size;`. The replace was therefore a
    // silent no-op and `vSemanticPointBoost` never reached gl_PointSize —
    // hover/ripple/reveal/breath point-SIZE dynamics were dead (only the
    // fragment-alpha path consumed the varying). This contract pins the fix.

    it('three r184 points_vert emits `gl_PointSize = size;` (the replace target)', () => {
        const src = readFileSync(
            resolve(repoRoot, 'node_modules/three/src/renderers/shaders/ShaderLib/points.glsl.js'),
            'utf8'
        )
        expect(src).toContain('gl_PointSize = size;')
    })

    it('node-manager targets the real r184 line, not a dead clamp form', () => {
        const src = readFileSync(resolve(repoRoot, 'src/lib/engine/node-manager.ts'), 'utf8')
        // Must target the actual r184 line so the size boost applies.
        expect(src).toContain("'gl_PointSize = size;',")
        // The legacy dead target (which does not exist in three r184) must not linger.
        expect(src).not.toContain("'gl_PointSize = clamp(size, 1.0, 128.0);'")
    })
})
