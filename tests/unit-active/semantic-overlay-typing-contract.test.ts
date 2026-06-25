/**
 * semantic-overlay — typing contract test
 *
 * Lock-in: ensures the W47-Bite-C type-safety tightening pass on
 * src/lib/journey/semantic-overlay.ts does not regress.
 *
 * Before this pass the file had 34 `as any` occurrences. The
 * tightening tightened 2 of the safe-win signature any usages:
 *   - `getFocusCurvePointLocal(edge: any, t: number): Vector3`
 *     → `(edge: ThreadEdge, t: number): Vector3`
 *   - `buildFocusThreadLineMaterial(): any`
 *     → `(): LineMaterial`
 *
 * The remaining 32 `any` usages are at the engine-boundary escape
 * hatch (`const _state = state as any`) plus deliberate local
 * narrowings of untyped Three.js objects. They follow the W47
 * project pattern (see docs/type-system-smell-audit.md for the
 * multi-bite roadmap to address them).
 *
 * What this guards:
 *   1. any count is exactly 32, all at the engine escape hatch or
 *      inside `_state.X` accessor chains (NOT in function signatures)
 *   2. getFocusCurvePointLocal uses ThreadEdge (not any)
 *   3. buildFocusThreadLineMaterial returns LineMaterial (not any)
 *   4. ThreadEdge is imported from focus-pocket-geometry
 */
import { describe, it, expect } from 'vitest'
// @ts-ignore
import { readFileSync } from 'node:fs'
// @ts-ignore
import { fileURLToPath } from 'node:url'
// @ts-ignore
import { dirname, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const SRC_PATH = resolve(__dirname, '../../src/lib/journey/semantic-overlay.ts')

function readSource(): string {
    return readFileSync(SRC_PATH, 'utf-8')
}

// Strip block + line comments so regexes don't false-positive on prose.
function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('semantic-overlay — typing contract (W47-Bite-C tightening)', () => {
    const src = readSource()
    const stripped = stripComments(src)

    it('any occurrence count is 0 (post-W48 tightening)', () => {
        const matches = src.match(/: any\b| as any\b|<any>| any\[\]/g) ?? []
        // W48: Removed the _state escape-hatch alias, added typed
        // SemanticLineMaterial interface for LineMaterial custom uniforms,
        // and removed color-constant any casts. All 37 prior any usages
        // are now type-safe.
        expect(matches.length).toBe(0)
    })

    it('getFocusCurvePointLocal uses ThreadEdge (not any)', () => {
        const match = stripped.match(/function\s+getFocusCurvePointLocal\s*\(\s*edge\s*:\s*([^,)]+)/)
        expect(match, 'function signature not found').toBeTruthy()
        expect(match![1].trim()).toBe('ThreadEdge')
    })

    it('buildFocusThreadLineMaterial returns LineMaterial (not any)', () => {
        const match = stripped.match(/function\s+buildFocusThreadLineMaterial\s*\([^)]*\)\s*:\s*([^{]+)/)
        expect(match, 'function return type not found').toBeTruthy()
        expect(match![1].trim()).toBe('LineMaterial')
    })

    it('imports ThreadEdge from focus-pocket-geometry', () => {
        const match = src.match(
            /import\s+type\s*\{\s*ThreadEdge\s*\}\s*from\s*['"]@lib\/journey\/focus-pocket-geometry['"]/
        )
        expect(match, 'ThreadEdge type import not found').toBeTruthy()
    })

    it('no `_state as any` or inline `as any` remain (W48 fully tightened)', () => {
        // W48: The _state escape-hatch alias was removed in favor of
        // direct typed state access + a local SemanticLineMaterial
        // interface. All any casts were removed.
        const lines = src.split('\n')
        let aliasCount = 0
        let otherAsAny = 0
        for (const line of lines) {
            if (/const\s+_state\s*=\s*state\s+as\s+any/.test(line)) {
                aliasCount++
            } else if (/\bas\s+any\b/.test(line)) {
                otherAsAny++
            }
        }
        expect(aliasCount).toBe(0)
        expect(otherAsAny).toBe(0)
    })

    it('function-signature any usages are zero (signature-level type safety)', () => {
        // A "function-signature any" is `: any` or `: any[]` appearing
        // in a function declaration. This is the specific smell we
        // tightened for in this bite — future regressions should
        // fail this test.
        const fnDecl = /function\s+\w+\s*\([^)]*\)\s*:\s*any\b/g
        const matches = stripped.match(fnDecl) ?? []
        expect(matches.length).toBe(0)
    })
})
