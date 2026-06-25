/**
 * thread-settler — typing contract test
 *
 * Lock-in: ensures the W47-Bite-F type-safety tightening pass on
 * src/lib/journey/thread-settler.ts does not regress.
 *
 * What got tightened (26 → 21 `any` occurrences):
 *   - L236: `(item: any) => item && (typeof item === 'number' ? item === index : item.index === index)`
 *     → `(item: { index: number }) => item.index === index`
 *     walkHistoryIndices is number[] in modern state shape, but
 *     nav.threadCandidates is ThreadCandidateLike[] (which always has
 *     index: number). The defensive `typeof item === 'number'` check
 *     was for a legacy format that the current types no longer expose.
 *
 *   - L273: `renderThreadInspection(null, { force: true, surface: 'idle' } as any)`
 *     → `renderThreadInspection(null, { force: true, surface: 'idle' })`
 *     ThreadInspectionOptions has both `force?: boolean` and
 *     `surface?: string | null`, so the object IS a valid
 *     ThreadInspectionOptions. The `as any` was unnecessary.
 *
 *   - L484: `inspectThreadNeighbor(nextCandidate.index, { ...options, force: true,
 *     preserveJourney: true, surface: 'inside-cue' } as any)`
 *     → `inspectThreadNeighbor(nextCandidate.index, { ...options, force: true,
 *     preserveJourney: true, surface: 'inside-cue' })`
 *     All spread + additional fields are valid ThreadInspectionOptions.
 *
 *   - L463 (class method): `previewInsideNextThread(options): any`
 *     → `previewInsideNextThread(options): ThreadInspectionState | null`
 *     The function returns `null` on early-out paths and
 *     `inspectThreadNeighbor(...)` on the success path, which returns
 *     `ThreadInspectionState | null`. The `: any` return type was wrong.
 *
 *   - L508 (functional export): same return type change applied to
 *     the module-level `previewInsideNextThread` export (delegates to
 *     the class method).
 *
 * Added import: `import type { ThreadInspectionState } from './thread-inspector'`
 *
 * Deferred (kept as baseline):
 *   - L255-257, L316-319, L338-342: `(legacyState as any).X = null`
 *     (12 sites). Legacy state escape hatch matches W47 pattern.
 *   - L276, L300, L311, L324, L333: `(legacyState.navState as any).X`
 *     (5 sites). Same legacy state escape hatch.
 *   - L288: `focusOnPoint(targetPoint, { ... invalid options ... } as any)`.
 *     focusOnPoint only accepts `{ skipUrlSync?, revealCard? }` but
 *     the call site passes `fromTraversal`, `appendHistory`,
 *     `restoreHistory`, `fromIndex`. Tightening requires either
 *     widening focusOnPoint's signature or filtering the options
 *     at the call site. Out of scope for Bite-F.
 *   - L339: `(legacyState as any).selectedPoint`. Same legacy escape.
 *
 * What this guards:
 *   1. any occurrence count is exactly 21 (post-Bite-F baseline)
 *   2. .find() callback uses typed `{ index: number }` (not `any`)
 *   3. renderThreadInspection options use ThreadInspectionOptions shape (no `as any`)
 *   4. inspectThreadNeighbor spread options use ThreadInspectionOptions shape (no `as any`)
 *   5. previewInsideNextThread return type is `ThreadInspectionState | null` (not `any`)
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
const SRC_PATH = resolve(__dirname, '../../src/lib/journey/thread-settler.ts')

function readSource(): string {
    return readFileSync(SRC_PATH, 'utf-8')
}

function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('thread-settler — typing contract (W47-Bite-F tightening)', () => {
    const src = readSource()
    const stripped = stripComments(src)

    it('any occurrence count is 0 (post-W48 fully tightened)', () => {
        const matches = src.match(/: any\b| as any\b|<any>| any\[\]/g) ?? []
        expect(matches.length).toBe(0)
    })

    it('.find() callback uses typed `{ index: number }` (not `any`)', () => {
        // L236: was `(item: any) => item && (typeof item === 'number' ? ...)`
        // now `(item: { index: number }) => item.index === index`
        const goodCallback =
            /\.find\(\s*\(item\s*:\s*\{\s*index\s*:\s*number\s*\}\)\s*=>\s*item\.index\s*===\s*index\s*\)/
        const badCallback = /\(item\s*:\s*any\)/
        expect(stripped.match(goodCallback), 'typed .find() callback not found').toBeTruthy()
        expect(stripped.match(badCallback), 'old `(item: any)` still present').toBeNull()
    })

    it('renderThreadInspection options use ThreadInspectionOptions shape (no `as any`)', () => {
        // L273: was `renderThreadInspection(null, { force: true, surface: 'idle' } as any)`
        // now `renderThreadInspection(null, { force: true, surface: 'idle' })`
        const goodCall = /renderThreadInspection\(null,\s*\{\s*force\s*:\s*true,\s*surface\s*:\s*['"]idle['"]\s*\}\s*\)/
        const badCall = /renderThreadInspection\(null,\s*\{[^}]*\}\s*as\s+any/
        expect(stripped.match(goodCall), 'clean renderThreadInspection call not found').toBeTruthy()
        expect(stripped.match(badCall), 'old `renderThreadInspection(...) as any` still present').toBeNull()
    })

    it('inspectThreadNeighbor spread options use ThreadInspectionOptions shape (no `as any`)', () => {
        // L484: was `} as any)` after the spread options object
        // now no `as any` after the closing brace
        const goodCall =
            /inspectThreadNeighbor\(nextCandidate\.index,\s*\{\s*\.\.\.options,\s*force\s*:\s*true,\s*preserveJourney\s*:\s*true,\s*surface\s*:\s*['"]inside-cue['"]\s*\}\s*\)/
        const badCall = /inspectThreadNeighbor\(nextCandidate\.index,\s*\{[^}]*\}\s*as\s+any/
        expect(stripped.match(goodCall), 'clean inspectThreadNeighbor call not found').toBeTruthy()
        expect(stripped.match(badCall), 'old `inspectThreadNeighbor(...) as any` still present').toBeNull()
    })

    it('previewInsideNextThread class method return type is ThreadInspectionState | null', () => {
        // L463: was `): any {`
        // now `): ThreadInspectionState | null {`
        const goodReturn =
            /previewInsideNextThread\(options:\s*PreviewInsideOptions\s*=\s*\{\}\)\s*:\s*ThreadInspectionState\s*\|\s*null\s*\{/
        const badReturn = /previewInsideNextThread\(options:\s*PreviewInsideOptions\s*=\s*\{\}\)\s*:\s*any\s*\{/
        expect(stripped.match(goodReturn), 'typed return type not found').toBeTruthy()
        expect(stripped.match(badReturn), 'old `: any` return type still present').toBeNull()
    })

    it('previewInsideNextThread functional export return type is ThreadInspectionState | null', () => {
        // L508: was `): any {`
        // now `): ThreadInspectionState | null {`
        const goodReturn =
            /export\s+function\s+previewInsideNextThread\(options:\s*PreviewInsideOptions\s*=\s*\{\}\)\s*:\s*ThreadInspectionState\s*\|\s*null\s*\{/
        const badReturn =
            /export\s+function\s+previewInsideNextThread\(options:\s*PreviewInsideOptions\s*=\s*\{\}\)\s*:\s*any\s*\{/
        expect(stripped.match(goodReturn), 'typed return type not found').toBeTruthy()
        expect(stripped.match(badReturn), 'old `: any` return type still present').toBeNull()
    })

    it('imports ThreadInspectionState type from thread-inspector', () => {
        // The new return type requires importing ThreadInspectionState
        const importLine = /import\s+type\s*\{\s*ThreadInspectionState\s*\}\s+from\s+['"]\.\/thread-inspector['"]/
        expect(stripped.match(importLine), 'ThreadInspectionState type import not found').toBeTruthy()
    })
})
