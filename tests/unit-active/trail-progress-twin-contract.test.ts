/**
 * trail-progress-twin-contract.test.ts - Structural regression guarding the
 * journey trail progress string against twin drift.
 *
 * Background (2026-08-07): currentWalkHistory includes the CURRENT node as its
 * last element, so `.length` IS the current step number. JourneyChrome.svelte
 * used `length + 1` while focus-ui.ts had been fixed in W48 to use bare length.
 *
 * 2026-08-22 contract change (step-counter stability, live finding):
 *   The "of ${neighborCount}" total mixed two dimensions - steps TAKEN vs
 *   next-hop candidates from the CURRENT stop - and neighborCount itself is
 *   pipeline-dependent (triggers.ts manifest vs setTrailFromSeed memo,
 *   semantic vs geometric fallback), so one anchor rendered "Step 1 of 17" /
 *   "Step 1 of 18" / "Step 1 of 1" depending on which source won the boot
 *   race. Fix: BOTH twins render the bare, truthful "Stop N."; availability
 *   is carried by the Next-stop line. The setTrailFromSeed memo is
 *   invalidated when the thread artifact lands so late-loaded semantic
 *   neighbors converge instead of pinning a stale fallback.
 *
 * 2026-08-24 UX sweep: "Stop" → "Step" + nearby count for user clarity.
 *   Progress now reads `Step N · M nearby` instead of bare `Stop N.`
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const JOURNEY_CHROME_PATH = resolve(__dirname, '../../src/components/JourneyChrome.svelte')
const FOCUS_UI_PATH = resolve(__dirname, '../../src/lib/journey/focus-ui.ts')
const NEIGHBORHOOD_PATH = resolve(__dirname, '../../src/lib/journey/neighborhood.ts')
const THREADS_PATH = resolve(__dirname, '../../src/lib/engine/semantic-threads.ts')

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

    it('Svelte twin renders Step N with nearby count - no "of ${neighborCount}" total', () => {
        // Code-form only: comments may still cite the historical string.
        expect(chrome).not.toMatch(/`Step \$\{currentWalkHistory\.length\} of \$\{neighborCount\}`/)
        expect(chrome).not.toContain('Step ${currentWalkHistory.length + 1}')
        expect(chrome).toMatch(/`Step \$\{currentWalkHistory\.length\} ·/)
    })

    it('DOM twin renders the same rule - bare walkLength as stepNumber', () => {
        expect(focusUi).toMatch(/const stepNumber = walkLength/)
        expect(focusUi).not.toMatch(/stepNumber = walkLength \+ 1/)
        expect(focusUi).toContain('`Step ${stepNumber} ·')
    })

    it('both twins carry the no-more-nearby fallback without offset or total', () => {
        expect(chrome).toContain('no more nearby with these filters.')
        expect(focusUi).toContain('no more nearby with these filters.')
        expect(chrome).not.toContain('length + 1}. No more visible stops')
        expect(focusUi).not.toContain('stepNumber} of 0')
    })

    it('both twins guard walkLength 0 (fresh deep links) with an invite, not "Step 0."', () => {
        expect(chrome).toContain("'Choose a nearby business to start.'")
        expect(focusUi).toContain("'Choose a nearby business to start.'")
    })

    it('seed memo invalidation exists so late thread loads converge', () => {
        const neighborhood = readSource(NEIGHBORHOOD_PATH)
        const threads = readSource(THREADS_PATH)
        expect(neighborhood).toMatch(/export function invalidateTrailSeedCache/)
        expect(threads).toMatch(/invalidateTrailSeedCache\(\)/)
    })
})
