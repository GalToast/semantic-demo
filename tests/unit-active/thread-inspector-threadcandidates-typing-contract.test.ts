/**
 * @file thread-inspector-threadcandidates-typing-contract.test.ts
 *
 * Lock-in test for the W47-Bite-Continued (consumer-side) tightening of
 * src/lib/journey/thread-inspector.ts (23 → 17 any occurrences).
 *
 * This bite focuses on the threadCandidates access pattern, which was
 * typed as `any[]` despite state-types.ts declaring it as
 * `ThreadCandidateRef[]`. Three reader sites and two callbacks were
 * tightened:
 *
 *   L114:  const candidate = (appState.navState.threadCandidates as any[])?.find(...)
 *   L115:      (item: any) => item && (typeof item === 'number' ? item === index : item.index === index)
 *   L514:  const candidates = appState.navState.threadCandidates as any[]
 *   L646:  const candidate = (appState.navState.threadCandidates as any[])?.find(...)
 *   L647:      (item: any) => item && (typeof item === 'number' ? item === index : item.index === index)
 *
 * Plus a 6th removal: the `id as any` cast at L573 when assigning the
 * setTimeout handle to appState.canvasThreadInspectionClearTimer (already
 * typed as ReturnType<typeof setTimeout> | null in appState:370).
 *
 * Replaced with:
 *   - threadCandidates as ThreadCandidateRef[] (matches state-types.ts:41)
 *   - (item: ThreadCandidateRef) callback (TypeScript narrows the callback
 *     parameter; the typeof check remains as defensive code for legacy
 *     numeric entries)
 *   - appState.canvasThreadInspectionClearTimer = id (no cast needed)
 *
 * Run: npx vitest run tests/unit-active/thread-inspector-threadcandidates-typing-contract.test.ts
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(__dirname, '..', '..')

function readSource(rel: string): string {
    return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}

function countAnyOccurrences(source: string): number {
    const matches = source.match(/:\s*any\b|\bas\s+any\b|\bas\s+unknown\s+as\b/g) || []
    return matches.length
}

describe('W47-Bite-Continued / thread-inspector.ts / threadCandidates typing', () => {
    it('any count is reduced from 23 baseline to ≤17 (post-tightening baseline)', () => {
        const source = readSource('src/lib/journey/thread-inspector.ts')
        const count = countAnyOccurrences(source)
        // Tightened to 17 in this bite (was 23, a 26% reduction).
        // Lock-in: must not regress back to the 23 baseline.
        expect(count, `thread-inspector.ts has ${count} any occurrences (lock-in target ≤17)`).toBeLessThanOrEqual(17)
    })

    it('all 3 reader sites use ThreadCandidateRef[] (no longer `as any[]`)', () => {
        const source = readSource('src/lib/journey/thread-inspector.ts')
        // The old pattern must be gone everywhere
        expect(source).not.toMatch(/appState\.navState\.threadCandidates\s+as\s+any\[\]/)
        // All 3 sites use ThreadCandidateRef[]
        const typedReads = source.match(/appState\.navState\.threadCandidates\s+as\s+ThreadCandidateRef\[\]/g) || []
        expect(typedReads.length, `expected 3 typed reads, got ${typedReads.length}`).toBe(3)
    })

    it('both (item: any) callbacks are tightened', () => {
        const source = readSource('src/lib/journey/thread-inspector.ts')
        // No (item: any) should remain
        expect(source).not.toMatch(/\(item:\s*any\)/)
        // Both callbacks now use untyped item (inferred from ThreadCandidateRef[])
        const inferredItem = source.match(/\.find\(\s*\(item\)/g) || []
        expect(inferredItem.length, `expected 2 typed find callbacks, got ${inferredItem.length}`).toBe(2)
    })

    it('ThreadCandidateRef type is imported from @lib/types/state', () => {
        const source = readSource('src/lib/journey/thread-inspector.ts')
        expect(source).toMatch(
            /import\s+type\s*\{[^}]*\bThreadCandidateRef\b[^}]*\}\s+from\s+['"][^'"]*types\/state['"]/
        )
    })

    it('appState.canvasThreadInspectionClearTimer = id (no `as any`)', () => {
        const source = readSource('src/lib/journey/thread-inspector.ts')
        expect(source).not.toMatch(/appState\.canvasThreadInspectionClearTimer\s*=\s*id\s+as\s+any/)
        // Plain assignment
        expect(source).toMatch(/appState\.canvasThreadInspectionClearTimer\s*=\s*id\b/)
    })

    it('preserved: typeof item === "number" defensive check (legacy numeric entries)', () => {
        // The runtime data path might still have legacy numeric entries;
        // keep the typeof check as defensive code even though TypeScript
        // narrows item to ThreadCandidateRef
        const source = readSource('src/lib/journey/thread-inspector.ts')
        expect(source).toMatch(/typeof\s+\w+\s*===\s*['"]number['"]/)
    })

    it('lock-in: 6 specific occurrences removed (3 + 2 + 1)', () => {
        const source = readSource('src/lib/journey/thread-inspector.ts')
        const count = countAnyOccurrences(source)
        // 23 baseline - 6 removed = 17. Lock-in: must be ≤17.
        expect(count).toBeLessThanOrEqual(17)
    })
})
