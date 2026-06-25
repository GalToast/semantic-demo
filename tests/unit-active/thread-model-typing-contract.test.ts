/**
 * thread-model — typing contract test
 *
 * Lock-in: ensures the W47-Bite-J type-safety tightening pass on
 * src/lib/journey/thread-model.ts does not regress.
 *
 * What got tightened (13 → 1 `any` occurrence):
 *   - L139: `buildSpatialGrid(0.12) as unknown as any` →
 *     `buildSpatialGrid(0.12)`. The triple-cast was bizarre;
 *     `state.projectedNeighborGrid` is typed `unknown` (top type),
 *     so `SpatialGrid` is directly assignable to it.
 *   - L265, L266, L271, L272 (legacy path 1):
 *     `(points[index] as any)?.X` → `points[index]?.X` (4 sites).
 *     `points` is typed `readonly BusinessRecord[]`, so `points[index]`
 *     is `BusinessRecord | undefined`. The `as any` was redundant.
 *   - L365: `(point as any)?.lead_id` → `point?.lead_id`. Same pattern.
 *   - L371: `(threadNode.neighbors as any[])` → `threadNode.neighbors`.
 *     `threadNode` is `any`, so `.neighbors` is `any`. The `as any[]`
 *     cast was redundant (`any` is assignable to anything).
 *   - L372: `(neighbor: any)` → `(neighbor: { leadId: string; ... })`.
 *     Inline structural type matching the fields the callback reads.
 *   - L439, L440, L445, L446 (legacy path 2):
 *     `(state.points[index] as any)?.X` → `state.points[index]?.X`
 *     (4 sites). Same pattern as legacy path 1.
 *   - L392: `.filter((c): c is ThreadCandidate => c !== null)` →
 *     `.filter((c: ThreadCandidate | null): c is ThreadCandidate => c !== null)`.
 *     The `c` parameter needed an explicit type after `.map()` stopped
 *     returning `any[]`.
 *
 * Deferred (kept as baseline):
 *   - L321: `Map<string, { neighbors: Array<any> }>` in the public
 *     overload signature. This is consumed by callers in other
 *     modules (focus personality, thread settler, semantic dive)
 *     and narrowing the inner type would require touching those.
 *
 * What this guards:
 *   1. any occurrence count is exactly 1 (post-Bite-J baseline)
 *   2. The 1 remaining `any` is the public overload signature
 *   3. No `(state.points[X] as any)?.X` pattern remains in legacy paths
 *   4. No `(points[X] as any)?.X` pattern remains in legacy paths
 *   5. No `as unknown as any` triple-cast remains
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
const SRC_PATH = resolve(__dirname, '../../src/lib/journey/thread-model.ts')

function readSource(): string {
    return readFileSync(SRC_PATH, 'utf-8')
}

function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('thread-model — typing contract (W47-Bite-J tightening)', () => {
    const src = readSource()
    const stripped = stripComments(src)

    it('any occurrence count is 0 (fully tightened; was 13 → 1 → 0)', () => {
        const matches = src.match(/: any\b| as any\b|<any>| any\[\]/g) ?? []
        // 0 = post-W48-Phase-3. The remaining `Array<any>` overload
        // signature was tightened to a concrete `Array<...>` type. A
        // future contributor who adds a new `any` will fail this test
        // and must either tighten or update the documented baseline.
        expect(matches.length).toBe(0)
    })

    it('the pure-path body destructure uses concrete Array<SemanticNeighborDetail>', () => {
        // The pattern was tightened in W48-Phase-3 from Array<any> to
        // Array<SemanticNeighborDetail>:
        //   const [points, semanticNeighborMapByLeadId, pointIndexByLeadId] = args as [
        //     ...
        //     Map<string, { neighbors: Array<SemanticNeighborDetail> }>,
        //     ...
        //   ];
        // The implementation body type was loose for historical reasons;
        // W48-Phase-3 narrowed it to the concrete element type.
        const overloadSignature = /Map<string,\s*\{\s*neighbors\s*:\s*Array<SemanticNeighborDetail>\s*\}>/
        expect(stripped.match(overloadSignature), 'pure-path Array<SemanticNeighborDetail> not found').toBeTruthy()
    })

    it('no `as unknown as any` triple-cast remains', () => {
        // L139 had this bizarre pattern. Removed in Bite-J.
        expect(stripped.match(/as\s+unknown\s+as\s+any/g), 'triple-cast still present').toBeNull()
    })

    it('no `(points[index] as any)?.X` pattern remains in legacy paths', () => {
        // The pure path already used `points[index]?.X` correctly.
        // The legacy path was inconsistent; both should now match.
        // Pattern variants: `(points[index] as any)`, `(points[otherIndex] as any)`
        const patterns = [/\(points\[index\]\s+as\s+any\)/g, /\(points\[otherIndex\]\s+as\s+any\)/g]
        patterns.forEach((p) => {
            expect(stripped.match(p), `legacy-path pattern ${p} still present`).toBeNull()
        })
    })

    it('no `(state.points[index] as any)?.X` pattern remains in legacy paths', () => {
        const patterns = [/\(state\.points\[index\]\s+as\s+any\)/g, /\(state\.points\[candidateIndex\]\s+as\s+any\)/g]
        patterns.forEach((p) => {
            expect(stripped.match(p), `legacy-path pattern ${p} still present`).toBeNull()
        })
    })

    it('legacy path 1 (getProjectedNeighborCandidates) uses typed `points[index]?.X`', () => {
        // The legacy path should now use `points[index]?.city` etc.
        // directly (no `as any` cast).
        const usesTypedAccess = /const\s+selfCity\s*=\s*points\[index\]\?\.city/
        expect(stripped.match(usesTypedAccess), 'typed legacy-path access not found').toBeTruthy()
    })

    it('legacy path 2 (getGeometricThreadCandidates) uses typed `state.points[index]?.X`', () => {
        const usesTypedAccess = /const\s+selfCity\s*=\s*normalizeCityForFilter\(state\.points\[index\]\?\.city\)/
        expect(stripped.match(usesTypedAccess), 'typed legacy-path access not found').toBeTruthy()
    })

    it('L371 `(threadNode.neighbors as any[])` cast removed', () => {
        // The `as any[]` was redundant since threadNode is already any.
        expect(stripped.match(/threadNode\.neighbors\s+as\s+any\[\]/g), '`as any[]` still present').toBeNull()
    })

    it('L372 neighbor callback is typed with inline structural type', () => {
        // The callback now uses an inline type with leadId and the
        // optional fields the callback reads. W48-Phase-3 reformatted
        // to multi-line so the regex allows whitespace between `.map(` and `(neighbor`.
        const usesTypedCallback = /\.map\s*\(\s*\(neighbor\s*:\s*\{\s*leadId\s*:\s*string/
        expect(stripped.match(usesTypedCallback), 'typed callback not found').toBeTruthy()
    })

    it('L392 .filter() callback has explicit `c: ThreadCandidate | null` type', () => {
        // After the tightening, the implicit any in the filter callback
        // had to be made explicit. This guards the explicit type.
        const usesTypedFilter = /\.filter\(\(c\s*:\s*ThreadCandidate\s*\|\s*null\)\s*:\s*c\s+is\s+ThreadCandidate/
        expect(stripped.match(usesTypedFilter), 'typed filter callback not found').toBeTruthy()
    })
})
