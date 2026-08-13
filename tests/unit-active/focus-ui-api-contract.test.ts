/**
 * focus-ui — public API contract test
 *
 * Locks in the public surface of src/lib/journey/focus-ui.ts so
 * future tightening / refactor work doesn't accidentally rename
 * exported symbols (the legacy test was moved to tests/retired/
 * during the W47 journey cleanup).
 *
 * Pattern mirrors tests/unit-active/three-engine-api-contract.test.ts
 * and tests/unit-active/semantic-overlay-api-contract.test.ts.
 */
import { describe, it, expect, vi } from 'vitest'
import * as module from '../../src/lib/journey/focus-ui'

// Mock-leak guard (2026-08-12): sibling files mock '@lib/utils/environment'
// (wrapping importOriginal) and their mock can bleed into this file under the
// vmThreads pool in full-suite runs. Defining our OWN envelope HERE makes the
// module key owned by this file regardless of order — and preserves the real
// exports by spreading importOriginal.
vi.mock('@lib/utils/environment', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@lib/utils/environment')>()
    return { ...actual, isCompactLandscape: () => false }
})

describe('focus-ui.ts public API contract', () => {
    const expectedFunctions = [
        'isCondensedFocusStageViewport',
        'hasColdDegradedSemanticFallback',
        'shouldUseFloatingFocusJourneyOnly',
        'updateTraversalUi'
    ]

    expectedFunctions.forEach((name) => {
        it(`exports ${name} as a function`, () => {
            expect(typeof (module as unknown as Record<string, unknown>)[name]).toBe('function')
        })
    })

    // ── Behavior locks ────────────────────────────────────────────────────

    it('isCondensedFocusStageViewport returns a boolean', () => {
        // The function is the only "viewport query" that's exported;
        // it's read by Header.svelte to decide layout density. Pure
        // observer — no side effects.
        const result = module.isCondensedFocusStageViewport()
        expect(typeof result).toBe('boolean')
    })

    it('hasColdDegradedSemanticFallback returns a boolean', () => {
        const result = module.hasColdDegradedSemanticFallback()
        expect(typeof result).toBe('boolean')
    })

    it('shouldUseFloatingFocusJourneyOnly returns a boolean', () => {
        const result = module.shouldUseFloatingFocusJourneyOnly()
        expect(typeof result).toBe('boolean')
    })

    it('updateTraversalUi is a void-returning function', () => {
        expect(() => module.updateTraversalUi()).not.toThrow()
    })
})
