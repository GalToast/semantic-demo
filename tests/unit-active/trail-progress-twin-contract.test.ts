/**
 * trail-progress-twin-contract.test.ts — Structural regression guarding the
 * journey trail "Step N of M" progress string against twin drift.
 *
 * Background (2026-08-07, main-lane + delegated mimo worker diagnosis):
 *   currentWalkHistory ^= walkHistoryIndices includes the CURRENT node as its
 *   last element (thread-settler.ts walkThreadNeighbor pushes the target), so
 *   `.length` IS the current step number. JourneyChrome.svelte (Svelte twin)
 *   used `length + 1` — showing "Step 4 of 5" at node C of [A,B,C] — while
 *   focus-ui.ts (DOM twin) had already been fixed in W48 to use the bare
 *   length (`stepNumber = walkLength`). The +1 was the ONLY drift; no test
 *   pinned the string, so the bug shipped.
 *
 * This test asserts the DISPLAY RULE source-level in BOTH twins (the same
 * pattern as journey-chrome-empty-state.test.ts), so the two can never
 * diverge on this contract again. A runtime assertion on the live string is
 * impossible to mount generically (8,406-point graph has no naturally drained
 * walk), hence the source-level guarantee.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const JOURNEY_CHROME_PATH = resolve(__dirname, '../../src/components/JourneyChrome.svelte')
const FOCUS_UI_PATH = resolve(__dirname, '../../src/lib/journey/focus-ui.ts')

function readSource(p: string): string {
    return readFileSync(p, 'utf-8')
}

describe('trail progress string contract', () => {
    let chrome: string
    let focusUi: string

    beforeAll(() => {
        chrome = readSource(JOURNEY_CHROME_PATH)
        focusUi = readSource(FOCUS_UI_PATH)
    })

    it('Svelte twin (JourneyChrome) renders Step with currentWalkHistory.length (no +1)', () => {
        // `+ 1` after walkHistory.length would off-by-one the step counter
        expect(chrome).toContain('Step ${currentWalkHistory.length} of ${neighborCount}')
        // never the regressed form
        expect(chrome).not.toContain('Step ${currentWalkHistory.length + 1}')
    })

    it('DOM twin (focus-ui) renders the same rule — bare walkLength as stepNumber', () => {
        expect(focusUi).toMatch(/const stepNumber = walkLength/)
        // both twins derive the display from history length, never length+1
        expect(focusUi).not.toMatch(/stepNumber = walkLength \+ 1/)
    })

    it('both twins carry the no-more-stops fallback without the +1 offset', () => {
        expect(chrome).toContain('No more visible stops with these filters.')
        // the Svelte fallback branch must not reintroduce a +1
        expect(chrome).not.toContain('length + 1}. No more visible stops')
        expect(focusUi).not.toContain('stepNumber} of 0')
    })
})
