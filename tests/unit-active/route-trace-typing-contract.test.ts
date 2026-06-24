/**
 * route-trace — typing contract test
 *
 * Lock-in: ensures the W47-Bite-H type-safety tightening pass on
 * src/lib/journey/route-trace.ts does not regress.
 *
 * What got tightened (23 → 18 `any` occurrences):
 *   - L120 (.forEach() callback):
 *     `(candidate: any) => push(candidate?.index)`
 *     →
 *     `(candidate: { index: number }) => push(candidate.index)`
 *     appState.navState.threadCandidates is ThreadCandidateLike[]
 *     which has `index: number`. The optional chain on index was
 *     a defensive artifact — the field is required.
 *
 *   - L133 (DOM dataset assignment in setRouteChoreographyPhase):
 *     `(document.body.dataset as any).routeMotion = ...`
 *     →
 *     `document.body.dataset.routeMotion = ...`
 *     DOMStringMap (the dataset type) is `{ [name: string]: string | undefined }`.
 *     Writing a string to any property works without cast.
 *
 *   - L200-201 (ShaderMaterial uniforms in _refreshRouteTraceOverlayRaw):
 *     `(material.uniforms as any).baseOpacity.value = 0.34`
 *     →
 *     `material.uniforms.baseOpacity!.value = 0.34`
 *     (and same for opacity)
 *     Three.js types uniforms as `{ [name: string]: IUniform | undefined }`.
 *     Used non-null assertion (`!`) because buildRouteTraceMaterial()
 *     always sets baseOpacity and opacity in its uniforms object.
 *
 *   - L222 (DOM dataset assignment in _refreshRouteTraceOverlayRaw):
 *     `(document.body.dataset as any).routeMotion = ...`
 *     →
 *     `document.body.dataset.routeMotion = ...`
 *     Same as L133.
 *
 * Deferred (kept as baseline):
 *   - L102-106, L203-204, L207, L227-228 (8 sites):
 *     `(state as any).routeTraceLines` / `routeTraceConnectionPairs`
 *     — state fields are typed `unknown` in state-types.ts:650-651.
 *     Tightening requires state class typing refactor (multi-day).
 *   - L117: `appState.currentSearchSummary as any` — search summary
 *     typed loose in state class.
 *   - L125-129, L211-212 (7 sites):
 *     `(state as any).routeChoreographyState` — same state escape.
 *   - L253: `(state as any).semanticDiveMode` — same state escape.
 *   - L262: `debounceRAF(_refreshRouteTraceOverlayRaw as any)` — wrap
 *     of an internal function. Narrowing requires typing the debounce
 *     utility or wrapping with explicit parameter types.
 *
 * What this guards:
 *   1. any occurrence count is exactly 18 (post-Bite-H baseline)
 *   2. .forEach() callback uses typed `{ index: number }`
 *   3. dataset.routeMotion uses typed DOMStringMap access (no `as any`)
 *   4. material.uniforms uses non-null assertion (not `as any`)
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
const SRC_PATH = resolve(__dirname, '../../src/lib/journey/route-trace.ts')

function readSource(): string {
    return readFileSync(SRC_PATH, 'utf-8')
}

function stripComments(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
}

describe('route-trace — typing contract (W47-Bite-H tightening)', () => {
    const src = readSource()
    const stripped = stripComments(src)

    it('any occurrence count is 18 (post-Bite-H baseline; was 23)', () => {
        const matches = src.match(/: any\b| as any\b|<any>| any\[\]/g) ?? []
        expect(matches.length).toBe(18)
    })

    it('.forEach() callback uses typed `{ index: number }` (not `any`)', () => {
        // L120: was `(candidate: any) => push(candidate?.index)`
        // now `(candidate: { index: number }) => push(candidate.index)`
        const goodCallback = /\.forEach\(\(candidate\s*:\s*\{\s*index\s*:\s*number\s*\}\)\s*=>\s*push\(candidate\.index\)\)/
        const badCallback = /\.forEach\(\(candidate\s*:\s*any\)/
        expect(stripped.match(goodCallback), 'typed .forEach() callback not found').toBeTruthy()
        expect(stripped.match(badCallback), 'old `(candidate: any)` still present').toBeNull()
    })

    it('dataset.routeMotion uses typed DOMStringMap access (no `as any`)', () => {
        // L133, L222: both were `(document.body.dataset as any).routeMotion = ...`
        // Both now use `document.body.dataset.routeMotion = ...`
        // Pattern variants — must check both locations
        const typedAccess = /document\.body\.dataset\.routeMotion\s*=/g
        const typedMatches = stripped.match(typedAccess)
        expect(typedMatches, 'typed dataset access not found').toBeTruthy()
        expect(typedMatches!.length).toBeGreaterThanOrEqual(2)

        // No `as any` casts on dataset anywhere
        const badPattern = /document\.body\.dataset\s+as\s+any/g
        expect(stripped.match(badPattern), 'old `dataset as any` still present').toBeNull()
    })

    it('material.uniforms uses non-null assertion (not `as any`)', () => {
        // L200-201: were `(material.uniforms as any).baseOpacity.value = 0.34`
        // now `material.uniforms.baseOpacity!.value = 0.34`
        const goodAccess = /material\.uniforms\.baseOpacity!\.value\s*=\s*0\.34/
        const goodAccessOpacity = /material\.uniforms\.opacity!\.value\s*=\s*0\.34/
        const badAccess = /material\.uniforms\s+as\s+any/
        expect(stripped.match(goodAccess), 'typed material.uniforms.baseOpacity! not found').toBeTruthy()
        expect(stripped.match(goodAccessOpacity), 'typed material.uniforms.opacity! not found').toBeTruthy()
        expect(stripped.match(badAccess), 'old `material.uniforms as any` still present').toBeNull()
    })
})