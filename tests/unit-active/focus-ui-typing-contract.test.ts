/**
 * focus-ui — typing contract test
 *
 * Lock-in: ensures the W47-Bite-E type-safety tightening pass on
 * src/lib/journey/focus-ui.ts does not regress, AND the W48 Phase 2
 * state-class cascade that further reduced the count.
 *
 * What got tightened (20 → 13 `any` occurrences in W47-Bite-E):
 *   - Removed 7× `(document.body as any)?.dataset?.X` casts in
 *     `shouldUseSingleNeighborFocusRail` (3 sites),
 *     `shouldSuppressSelectedBusinessNeighborRail` (3 sites), and
 *     `updateFocusNeighborRail` (1 site).
 *   - Each cast was unnecessary because `HTMLElement.dataset` is
 *     typed as `DOMStringMap | undefined` and `document.body` is
 *     `HTMLElement | null`. The optional chain `document.body?.dataset?.X`
 *     gives the same runtime safety with proper typing.
 *
 * W48 Phase 2 cascade (13 → 11 `any` occurrences):
 *   - Tightened `appState.semanticNeighborMapByLeadId` from
 *     `Map<string, any>` to `Map<string, SemanticNeighborEntry>` in
 *     src/lib/state/app.svelte.ts (see commit ac9bf69f + W48 Phase 2).
 *   - As a result, `state.semanticNeighborMapByLeadId.get(leadId)`
 *     is now `SemanticNeighborEntry | undefined` instead of `any`,
 *     letting 2× `as any` casts on the record's field accesses be
 *     dropped from this file.
 *
 * Deferred (documented for future bites):
 *   - `(candidate: any)` callbacks at L141, L142, L164: need a
 *     richer local candidate type. Existing `ThreadCandidateRef`
 *     doesn't include all runtime fields.
 *   - `(points[X] as any)` at L168, L183: array index narrowing.
 *   - `(nav as any).X` at L175, L521: navState has loose typing.
 *   - `(appState.semanticLaneSnapshot as any)` at L482-483: the
 *     snapshot type might be incomplete.
 *   - `} as any` at L384: return type narrowing.
 *   - File-level escape hatch at L32: matches the W47 project pattern.
 *
 * What this guards:
 *   1. any count is exactly 11 (post-W48-Phase-2 baseline; was 13)
 *   2. No `(document.body as any)?.dataset?.X` casts remain
 *   3. The 3 functions that previously had the cast use the typed
 *      `document.body?.dataset?.X` pattern instead
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
const SRC_PATH = resolve(__dirname, '../../src/lib/journey/focus-ui.ts')

function readSource(): string {
    return readFileSync(SRC_PATH, 'utf-8')
}

function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('focus-ui — typing contract (W47-Bite-E tightening)', () => {
    const src = readSource()
    const stripped = stripComments(src)

    it('any occurrence count is 11 (post-W48-Phase-2 baseline; was 13)', () => {
        const matches = src.match(/: any\b| as any\b|<any>| any\[\]/g) ?? []
        // 11 = post-W48-Phase-2 baseline (was 13 after W47-Bite-E; the
        // 2 reduction came from the state.semanticNeighborMapByLeadId
        // cascade — see file header). If a future contributor adds a
        // new any, this test fails and forces them to either tighten
        // or update the documented baseline.
        expect(matches.length).toBe(11)
    })

    it('no `(document.body as any)?.dataset?.X` casts remain', () => {
        // The pattern we tightened. Each occurrence was removed in
        // Bite-E. A regression that re-introduces them would fail here.
        const badPattern = /document\.body\s+as\s+any\)\??\.dataset/g
        expect(stripped.match(badPattern), 'old `(document.body as any)?.dataset` pattern still present').toBeNull()
    })

    it('shouldUseSingleNeighborFocusRail uses typed document.body?.dataset pattern (3 accesses)', () => {
        // The function used `(document.body as any)?.dataset?.panelSurface`
        // 3 times. After tightening: `document.body?.dataset?.panelSurface`.
        // The function body should still read 3 dataset attributes
        // (panelSurface, focusPanelMode, threadInspectSurface).
        const body = extractFunctionBody(stripped, 'shouldUseSingleNeighborFocusRail')
        // Count `document.body?.dataset?.` accesses
        const accesses = (body.match(/document\.body\?\.dataset\?\./g) || []).length
        expect(accesses).toBe(3)
    })

    it('shouldSuppressSelectedBusinessNeighborRail uses typed document.body?.dataset pattern (3 accesses)', () => {
        const body = extractFunctionBody(stripped, 'shouldSuppressSelectedBusinessNeighborRail')
        const accesses = (body.match(/document\.body\?\.dataset\?\./g) || []).length
        expect(accesses).toBe(3)
    })

    it('updateFocusNeighborRail uses typed document.body?.dataset pattern (1 access)', () => {
        const body = extractFunctionBody(stripped, 'updateFocusNeighborRail')
        const accesses = (body.match(/document\.body\?\.dataset\?\./g) || []).length
        expect(accesses).toBeGreaterThanOrEqual(1)
    })
})

/**
 * Extract the body of a function declaration: from `function NAME`
 * (or `export function NAME`) up to its matching closing brace.
 */
function extractFunctionBody(src: string, name: string): string {
    const re = new RegExp(`((?:export\\s+)?function\\s+${name}\\b[^{]*\\{)`, 'm')
    const m = re.exec(src)
    if (!m) throw new Error(`Could not find function ${name} in source`)
    const start = m.index + m[0].length
    let depth = 1
    let i = start
    while (i < src.length && depth > 0) {
        const c = src[i]
        if (c === '{') depth++
        else if (c === '}') depth--
        i++
    }
    return src.slice(start, i - 1)
}
