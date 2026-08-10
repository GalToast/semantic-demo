/**
 * thread-settler-adapter-port.test.ts — Cross-seam caller tests for
 * traverseNeighbor + previewInsideNextThread (Ticket 8)
 *
 * Post a3a0d94f ("fold adapter archipelago — 5 deleted, 8 re-pointed"):
 * thread-settler-adapter.ts and thread-inspector-adapter.ts were
 * deliberately retired; the canonical home for traverseNeighbor +
 * previewInsideNextThread is now `./thread-settler` (and the
 * `@lib/journey/thread-settler` alias). These tests lock in the
 * post-fold routing — every consumer must import from the canonical
 * source, not from a shim or the legacy `@legacy/modules/...` path.
 */

import { describe, it, expect } from 'vitest'
// @ts-ignore
import { readFileSync } from 'fs'
// @ts-ignore
import { join } from 'path'

// @ts-ignore
const ROOT = join(import.meta.dirname, '..', '..')

function readFile(relPath: string): string {
    return readFileSync(join(ROOT, relPath), 'utf-8')
}

describe('traverseNeighbor import routing', () => {
    const files = ['src/lib/journey/journey.ts', 'src/lib/journey/thread-settler.ts']

    for (const file of files) {
        it(`${file} does not import traverseNeighbor from @legacy/modules/journey-thread-settler`, () => {
            const src = readFile(file)
            // Check that there is no direct import of traverseNeighbor from the legacy path
            const legacyImportPattern =
                /import\s*\{[^}]*traverseNeighbor[^}]*\}\s*from\s*['"]@legacy\/modules\/journey-thread-settler['"]/
            expect(src).not.toMatch(legacyImportPattern)
        })
    }

    it('src/lib/orchestration/triggers.ts no longer routes keyboard/thread navigation', () => {
        // f0bceb84 moved thread-keyboard handling out of triggers.ts (event-bus-only now).
        // Lock this in so future callers don't accidentally reintroduce a legacy-path import.
        const src = readFile('src/lib/orchestration/triggers.ts')
        expect(src).not.toContain('traverseNeighbor')
    })

    it('src/lib/orchestration/window-actions.ts imports traverseNeighbor from thread-settler', () => {
        const src = readFile('src/lib/orchestration/window-actions.ts')
        const bridgeImport = /import\s*\{[^}]*traverseNeighbor[^}]*\}\s*from\s*['"]@lib\/journey\/thread-settler['"]/
        expect(src).toMatch(bridgeImport)
    })
})

describe('previewInsideNextThread import routing', () => {
    it('src/lib/journey/journey.ts imports previewInsideNextThread from canonical thread-settler, not the retired adapter', () => {
        const src = readFile('src/lib/journey/journey.ts')
        // Post a3a0d94f, journey.ts imports directly from the relative
        // ./thread-settler path (which itself re-exports via the canonical
        // ThreadSettler class). The previous adapter shim was deleted by
        // the fold-adapter-archipelago wave; locking the new path here.
        const canonicalImport =
            /import\s*\{[^}]*previewInsideNextThread[^}]*\}\s*from\s*['"]\.\/thread-settler['"]/
        expect(src).toMatch(canonicalImport)
    })

    it('src/lib/journey/journey.ts does not import previewInsideNextThread from retired adapter', () => {
        const src = readFile('src/lib/journey/journey.ts')
        const retiredAdapterImport =
            /import\s*\{[^}]*previewInsideNextThread[^}]*\}\s*from\s*['"]\.\/thread-settler-adapter['"]/
        expect(src).not.toMatch(retiredAdapterImport)
    })

    it('src/lib/journey/journey.ts does not import previewInsideNextThread from @legacy', () => {
        const src = readFile('src/lib/journey/journey.ts')
        const legacyImportPattern =
            /import\s*\{[^}]*previewInsideNextThread[^}]*\}\s*from\s*['"]@legacy\/modules\/journey-thread-settler['"]/
        expect(src).not.toMatch(legacyImportPattern)
    })
})

describe('thread-settler owns the canonical implementations', () => {
    it('thread-settler.ts exports traverseNeighbor as a top-level function', () => {
        // Post a3a0d94f: the delegating shim was deleted; traverseNeighbor
        // is now a top-level export of thread-settler itself, backed by the
        // ThreadSettler class instance.
        const src = readFile('src/lib/journey/thread-settler.ts')
        expect(src).toMatch(/export function traverseNeighbor\(step: number\)/)
    })

    it('thread-settler.ts exports previewInsideNextThread as a top-level function', () => {
        const src = readFile('src/lib/journey/thread-settler.ts')
        expect(src).toMatch(/export function previewInsideNextThread/)
    })

    it('thread-settler.ts does not re-export from a retired adapter path', () => {
        const src = readFile('src/lib/journey/thread-settler.ts')
        const retiredAdapterReExport =
            /export\s*\{\s*(?:traverseNeighbor|previewInsideNextThread)\s*\}\s*from\s*['"]\.\/thread-settler-adapter['"]/
        expect(src).not.toMatch(retiredAdapterReExport)
        const legacyReExport =
            /export\s*\{\s*(?:traverseNeighbor|previewInsideNextThread)\s*\}\s*from\s*['"]@legacy/
        expect(src).not.toMatch(legacyReExport)
    })
})
