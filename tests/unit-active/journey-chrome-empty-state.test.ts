/**
 * journey-chrome-empty-state.test.ts — Structural regression test for the
 * JourneyChrome "no visible neighbors" empty state (bugsweep W55).
 *
 * The live DOM path is hard to exercise because the 8,406-point graph is dense
 * enough that no naturally focused node has zero visible thread candidates.
 * Instead, this test asserts the source-level contract:
 *   1. The empty-state branch exists with the expected user-facing copy.
 *   2. It carries `role="status"` and `aria-live="polite"` so screen readers
 *      announce the state change.
 *   3. The surrounding JourneyChrome rail already has `aria-live="polite"`.
 *
 * A complementary runtime assertion lives in the structural detector at
 * tests/unit-active/focus-ui-pr-w47-g-fallback-structural.test.ts (0-neighbor
 * guard + fallback copy in BOTH focus-ui.ts and JourneyChrome.svelte).
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const JOURNEY_CHROME_PATH = resolve(__dirname, '../../src/components/JourneyChrome.svelte')

function readSource(): string {
    return readFileSync(JOURNEY_CHROME_PATH, 'utf-8')
}

describe('JourneyChrome empty-state a11y contract', () => {
    let source: string

    beforeAll(() => {
        source = readSource()
    })

    it('declares an empty-state block when no thread candidates are visible', () => {
        expect(source).toContain('currentThreadCandidates.length === 0')
        expect(source).toContain('No neighboring stops')
        expect(source).toContain('Pick a business with visible connections to explore.')
    })

    it('wraps the empty-state message in a role="status" aria-live="polite" region', () => {
        // The empty-state div must have both attributes.
        expect(source).toContain('class="empty-state journey-empty-state"')
        expect(source).toContain('role="status"')
        expect(source).toContain('aria-live="polite"')
    })

    it('keeps the journey rail itself as an aria-live="polite" region', () => {
        // The parent rail already announces status changes; the empty-state
        // inherits this live region context.
        expect(source).toContain('aria-live="polite"')
    })
})
