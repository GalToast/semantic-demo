/**
 * @file semantic-overlay-lineMaterial-callback-typing-contract.test.ts
 *
 * Lock-in test for the W47-Bite-Continued (consumer-side) tightening of
 * src/lib/journey/semantic-overlay.ts:
 *   - Removed 18× `(lineMaterial as any)` casts in buildFocusThreadLineMaterial()
 *     and refreshFocusSemanticOverlay(); Three.js LineMaterial.uniforms is
 *     Record<string, Uniform> so direct typed access works with non-null
 *     assertion (`!`) where the index signature returns IUniform | undefined.
 *   - Replaced 5× `(candidate: any)` callbacks with `ThreadCandidate` typed
 *     callbacks; the ThreadCandidate interface already exists in
 *     src/lib/journey/thread-model.ts.
 *   - Tightened `onBeforeCompile = (shader: any) => ...` to use Three.js's
 *     implicit shader type from LineMaterial.onBeforeCompile.
 *
 * Result: any count 33 → 9 (73% reduction). Largest single-bite reduction
 * of the W47 campaign (after Bite-Roughest at 41 → 3).
 *
 * Run: npx vitest run tests/unit-active/semantic-overlay-lineMaterial-callback-typing-contract.test.ts
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(__dirname, '..', '..')
const SEMANTIC_OVERLAY_PATH = path.join(ROOT, 'src', 'lib', 'journey', 'semantic-overlay.ts')

function readSource(rel: string): string {
    return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}

function countAnyOccurrences(source: string): number {
    const matches = source.match(/:\s*any\b|\bas\s+any\b|\bas\s+unknown\s+as\b/g) || []
    return matches.length
}

describe('W47-Bite-Continued / semantic-overlay.ts / lineMaterial + callback typing', () => {
    it('any count is reduced from 33 baseline to ≤10 (post-tightening baseline)', () => {
        const source = readSource('src/lib/journey/semantic-overlay.ts')
        const count = countAnyOccurrences(source)
        // Tightened to 10 in this bite (was 33, a 70% reduction). Lock-in:
        // must not regress back to the 33 baseline; future tightenings may
        // lower further.
        expect(count, `semantic-overlay.ts has ${count} any occurrences (lock-in target ≤10)`).toBeLessThanOrEqual(10)
    })

    it('no `(lineMaterial as any)` casts remain in buildFocusThreadLineMaterial', () => {
        const source = readSource('src/lib/journey/semantic-overlay.ts')
        const buildFn = source.match(/function\s+buildFocusThreadLineMaterial[\s\S]*?\n\}/m)
        expect(buildFn, 'buildFocusThreadLineMaterial not found').not.toBeNull()
        expect(buildFn![0]).not.toMatch(/lineMaterial\s+as\s+any/)
    })

    it('no `(lineMaterial as any)` casts remain in refreshFocusSemanticOverlay', () => {
        const source = readSource('src/lib/journey/semantic-overlay.ts')
        const refreshFn = source.match(/export\s+function\s+refreshFocusSemanticOverlay[\s\S]*?\n\}/m)
        expect(refreshFn, 'refreshFocusSemanticOverlay not found').not.toBeNull()
        expect(refreshFn![0]).not.toMatch(/lineMaterial\s+as\s+any/)
    })

    it('lineMaterial.uniforms.X uses non-null assertion (`!`) at the 4 set sites', () => {
        // We use `!` since Three.js's index signature returns IUniform | undefined,
        // but buildFocusThreadLineMaterial always sets these uniforms at runtime.
        const source = readSource('src/lib/journey/semantic-overlay.ts')
        const buildFn = source.match(/function\s+buildFocusThreadLineMaterial[\s\S]*?\n\}/m)
        expect(buildFn, 'buildFocusThreadLineMaterial not found').not.toBeNull()
        const body = buildFn![0]
        // 4 uniform copies to shader.uniforms.X use `!` after removal of `as any`
        const nonNullAsserts = body.match(/lineMaterial\.uniforms\.\w+!/g) || []
        expect(nonNullAsserts.length, `expected ≥4 non-null assertions, got ${nonNullAsserts.length}`).toBeGreaterThanOrEqual(4)
    })

    it('(candidate: any) callbacks are all replaced with ThreadCandidate typed callbacks', () => {
        const source = readSource('src/lib/journey/semantic-overlay.ts')
        // No `(candidate: any)` should remain
        expect(source).not.toMatch(/\(candidate:\s*any\)/)
        // The ThreadCandidate import must exist
        expect(source).toMatch(/import\s+type\s*\{[^}]*\bThreadCandidate\b[^}]*\}\s+from\s+['"][^'"]*thread-model['"]/)
        // At least 5 typed callbacks must be present
        const typedCallbacks = source.match(/\(candidate:\s*ThreadCandidate\)/g) || []
        expect(typedCallbacks.length, `expected ≥5 ThreadCandidate callbacks, got ${typedCallbacks.length}`).toBeGreaterThanOrEqual(5)
    })

    it('(edge: any) callback in pairs.forEach is tightened to a structural type', () => {
        const source = readSource('src/lib/journey/semantic-overlay.ts')
        expect(source).not.toMatch(/\(edge:\s*any\)/)
        // Typed shape includes the runtime fields used: t0, t1, cue, a, b, layer
        expect(source).toMatch(/\(edge:\s*\{\s*t0:\s*number;\s*t1:\s*number;\s*cue:\s*number;\s*a:\s*number;\s*b:\s*number;\s*layer:\s*number/)
    })

    it('onBeforeCompile callback uses Three.js implicit shader type (not (shader: any))', () => {
        const source = readSource('src/lib/journey/semantic-overlay.ts')
        // No `(shader: any)` should remain
        expect(source).not.toMatch(/\(shader:\s*any\)/)
        // onBeforeCompile should be assigned directly without explicit any annotation
        expect(source).toMatch(/lineMaterial\.onBeforeCompile\s*=\s*\(shader\)\s*=>/)
    })
})