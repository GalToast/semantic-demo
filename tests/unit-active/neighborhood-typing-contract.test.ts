/**
 * neighborhood — typing contract test
 *
 * Lock-in: ensures the W47-Bite-I type-safety tightening pass on
 * src/lib/journey/neighborhood.ts does not regress.
 *
 * What got tightened (22 → 15 `any` occurrences):
 *   - L815, L816: `(a as any).semanticScore` → `a.semanticScore`
 *     and `(b as any).semanticScore` → `b.semanticScore`. The sort
 *     callback operates on ThreadCandidate (the return type of
 *     getSemanticThreadCandidates / getGeometricThreadCandidates).
 *     ThreadCandidate.semanticScore is `number`.
 *   - L828: `(candidates[0] as any)?.source` → `candidates[0]?.source`.
 *     ThreadCandidate.source is `string`.
 *   - L829: `(candidate as any).reason` → `candidate.reason`.
 *     ThreadCandidate.reason is `string`.
 *   - L865, L770: `(candidate: any)` → `(candidate: unknown)`. The source
 *     data goes through `valueArray()` which returns `unknown[]`,
 *     so `unknown` is the honest type for both the .filter() and
 *     .map() callbacks. `candidateIndex()` accepts `unknown` and
 *     does internal narrowing.
 *   - L770 filter callback: `(candidate: any) => candidate?.source === 'semantic'`
 *     → `(candidate: unknown) => (candidate as { source?: string } | null)?.source === 'semantic'`.
 *     Used a typed local cast for the source read.
 *
 * Deferred (kept as baseline):
 *   - L353, L714: function return types `: any` (would require
 *     deriving typed return shapes from manifest structure)
 *   - L403, L445: `({} as any)` fallback for null candidate lookup
 *     (needs WalkCandidate-typed fallback object)
 *   - L475, L739, L831, L856: `(appState.navState as any)` escape
 *     hatch (matches W47 pattern)
 *   - L513, L726: `(neighbor: any)` callbacks in peer-edge iteration
 *     (needs inline semantic-neighbor type)
 *   - L744, L799: `(nav.focusPocketMeta as any)` spread
 *   - L756, L797: assignment casts
 *   - L764, L769: `(candidate: any)` callbacks in semantic-route
 *     extraction (needs WalkCandidate import)
 *
 * What this guards:
 *   1. any occurrence count is exactly 17 (post-Bite-I baseline)
 *   2. Sort callback uses `a.semanticScore` / `b.semanticScore` (not `as any`)
 *   3. Source check uses `candidates[0]?.source` (not `as any`)
 *   4. Reason map uses `candidate.reason` (not `as any`)
 *   5. .map() callback uses `unknown` (more honest than `any`)
 *   6. .filter() callback uses `unknown` (more honest than `any`)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const SRC_PATH = resolve(__dirname, '../../src/lib/journey/neighborhood.ts')

function readSource(): string {
    return readFileSync(SRC_PATH, 'utf-8')
}

function stripComments(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
}

describe('neighborhood — typing contract (W47-Bite-I tightening)', () => {
    const src = readSource()
    const stripped = stripComments(src)

    it('any occurrence count is 0 (post-W48-Phase-3 baseline; was 22 → 15)', () => {
        // Strip comments so prose like `as any` in docstrings doesn't count.
        const matches = stripped.match(/: any\b| as any\b|<any>| any\[\]/g) ?? []
        // 0 = post-W48-Phase-3 baseline (was 22 → 15 in W47-Bite-I;
        // the remaining 15 (TypedRecord + manifest scaffolding) were
        // tightened to a typed SemanticNeighborDetail scaffold).
        expect(matches.length).toBe(0)
    })

    it('sort callback uses typed `a.semanticScore` (not `(a as any).semanticScore`)', () => {
        // L815: was `(a as any).semanticScore || 0`, now `a.semanticScore || 0`
        const goodAccess = /const\s+as\s*=\s*a\.semanticScore\s*\|\|/
        const badAccess = /\(a\s+as\s+any\)\.semanticScore/
        expect(stripped.match(goodAccess), 'typed access not found').toBeTruthy()
        expect(stripped.match(badAccess), 'old `(a as any).semanticScore` still present').toBeNull()
    })

    it('sort callback uses typed `b.semanticScore` (not `(b as any).semanticScore`)', () => {
        const goodAccess = /const\s+bs\s*=\s*b\.semanticScore\s*\|\|/
        const badAccess = /\(b\s+as\s+any\)\.semanticScore/
        expect(stripped.match(goodAccess), 'typed access not found').toBeTruthy()
        expect(stripped.match(badAccess), 'old `(b as any).semanticScore` still present').toBeNull()
    })

    it('source check uses typed `candidates[0]?.source` (not `as any`)', () => {
        // L828: was `((candidates[0] as any)?.source || 'geometric-fallback')`
        const goodAccess = /candidates\[0\]\?\.source\s*\|\|\s*['"]geometric-fallback['"]/
        const badAccess = /\(candidates\[0\]\s+as\s+any\)/
        expect(stripped.match(goodAccess), 'typed access not found').toBeTruthy()
        expect(stripped.match(badAccess), 'old `(candidates[0] as any)` still present').toBeNull()
    })

    it('reason map uses typed `candidate.reason` (not `as any`)', () => {
        // L829: was `(candidate as any).reason || ''`, now `candidate.reason || ''`
        const goodAccess = /\[candidate\.index,\s*candidate\.reason\s*\|\|/
        const badAccess = /\(candidate\s+as\s+any\)\.reason/
        expect(stripped.match(goodAccess), 'typed access not found').toBeTruthy()
        expect(stripped.match(badAccess), 'old `(candidate as any).reason` still present').toBeNull()
    })

    it('.map() callback uses typed `unknown` (more honest than `any`)', () => {
        // L770, L865: was `.map((candidate: any) => candidateIndex(candidate))`,
        // now `.map((candidate: unknown) => candidateIndex(candidate))`.
        // The source goes through valueArray() which returns unknown[],
        // so `unknown` is the honest type. `candidateIndex()` accepts
        // unknown and does internal narrowing.
        const goodAccess = /\.map\(\(candidate\s*:\s*unknown\)\s*=>\s*candidateIndex/
        // The bad pattern check must be SPECIFIC to candidateIndex
        // sites (L770, L865). Other `(candidate: any)` callbacks
        // remain at L764, L769 — they are documented as deferred.
        const badAccess = /\.map\(\(candidate\s*:\s*any\)\s*=>\s*candidateIndex/
        expect(stripped.match(goodAccess), 'typed unknown callback not found').toBeTruthy()
        expect(stripped.match(badAccess), 'old `(candidate: any) => candidateIndex` still present').toBeNull()
    })

    it('.filter() callback uses typed `unknown` with typed source read', () => {
        // L770: was `.filter((candidate: any) => candidate?.source === 'semantic')`,
        // now `.filter((candidate: unknown) => (candidate as { source?: string } | null)?.source === 'semantic')`.
        const goodAccess = /\.filter\(\(candidate\s*:\s*unknown\)\s*=>\s*\(candidate\s+as/
        expect(stripped.match(goodAccess), 'typed unknown filter with typed cast not found').toBeTruthy()
    })
})