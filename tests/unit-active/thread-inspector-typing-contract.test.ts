/**
 * thread-inspector — typing contract test
 *
 * Lock-in: ensures the W47-Bite-D type-safety tightening pass on
 * src/lib/journey/thread-inspector.ts does not regress.
 *
 * What got tightened (22 → 21 `any` occurrences):
 *   - Removed `(inspectionState as any)` cast at the call site of
 *     `syncInspectedStrandOverlay`. Replaced with a typed
 *     `as unknown as Parameters<typeof syncInspectedStrandOverlay>[0]`
 *     double-cast that documents the structural narrowing intent
 *     (ThreadInspectionState has fields beyond InspectionState).
 *   - Updated `syncInspectedStrandOverlay` in
 *     `thread-inspector-webgl.ts` to accept `InspectionState | null`
 *     (it already null-checks via `inspectionState?.active`, so the
 *     signature was over-restrictive — it was the reason the call
 *     site needed `as any`).
 *
 * Deferred (documented for future bites):
 *   - `(item: any)` callbacks (L115, L639) and `as any[]` for
 *     `appState.navState.threadCandidates` (L114, L506, L638): need
 *     a richer local type than the existing `ThreadCandidateRef`
 *     because runtime candidates have additional fields
 *     (`relationshipRole`, `source`, `role`) not in the type. Defer
 *     until a runtime-vs-type audit identifies whether the runtime
 *     is wrong or the type is wrong.
 *   - `(inspector as any)._pointerXListener` (6 sites): could be
 *     typed via a local `InspectorElement` interface, but requires
 *     that the listener callbacks accept `PointerEvent` (currently
 *     typed as `() => void`).
 *   - `(legacyState as any).canvasThreadInspectionClearTimer`
 *     (5 sites): legacy alias cast, matches the file-level escape
 *     hatch pattern documented in the type-system audit.
 *   - `} as any` return casts (L674, L685): require changes to
 *     downstream function signatures (dispatchNavTransition,
 *     focusOnPoint).
 *
 * What this guards:
 *   1. any count is exactly 21 (the post-Bite-D baseline)
 *   2. No `(inspectionState as any)` casts remain in renderThreadInspection
 *   3. syncInspectedStrandOverlay signature accepts `InspectionState | null`
 *   4. The typed double-cast uses `as unknown as` (not `as any`)
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
const SRC_PATH = resolve(__dirname, '../../src/lib/journey/thread-inspector.ts')
const WEBGL_SRC_PATH = resolve(__dirname, '../../src/lib/journey/thread-inspector-webgl.ts')

function readSource(path: string): string {
    return readFileSync(path, 'utf-8')
}

function stripComments(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
}

describe('thread-inspector — typing contract (W47-Bite-D tightening)', () => {
    const src = readSource(SRC_PATH)
    const stripped = stripComments(src)

    it('any occurrence count is 0 (post-W48-Phase-3 baseline; was 21)', () => {
        // Strip comments so prose like "as any" in docstrings doesn't count.
        const matches = stripped.match(/: any\b| as any\b|<any>| any\[\]/g) ?? []
        // 0 = post-W48-Phase-3 baseline (was 21 after Bite-D; the
        // full reduction came from W48-Phase-3 tightening wave —
        // ThreadCandidateRef.role/relationshipRole were added to
        // the canonical type, allowing all casts to be removed).
        expect(matches.length).toBe(0)
    })

    it('no `(inspectionState as any)` cast remains at the syncInspectedStrandOverlay call site', () => {
        // The exact line we tightened: renderThreadInspection previously
        // had `syncInspectedStrandOverlay(inspectionState as any, ...)`.
        // Now uses a typed `as unknown as Parameters<...>` double-cast.
        const badCast = /syncInspectedStrandOverlay\s*\(\s*inspectionState\s+as\s+any/
        expect(stripped.match(badCast), 'bad as any cast still present').toBeNull()
    })

    it('call site uses typed `as unknown as` (not `as any`)', () => {
        const goodCast = /syncInspectedStrandOverlay\s*\(\s*inspectionState\s+as\s+unknown\s+as/
        expect(stripped.match(goodCast), 'typed double-cast not found').toBeTruthy()
    })

    it('syncInspectedStrandOverlay accepts InspectionState | null (in the related webgl file)', () => {
        const webglSrc = readSource(WEBGL_SRC_PATH)
        const sig = /export\s+function\s+syncInspectedStrandOverlay\s*\(\s*inspectionState\s*:\s*([^,)]+)/
        const match = webglSrc.match(sig)
        expect(match, 'function signature not found').toBeTruthy()
        expect(match![1].trim()).toBe('InspectionState | null')
    })
})
