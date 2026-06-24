/**
 * semantic-overlay — public API contract test
 *
 * Lock-in: ensures the public surface of semantic-overlay.ts remains
 * stable during refactor. Before this test existed, the file had 465
 * LOC, 34 `as any` occurrences, and no unit-level test coverage.
 *
 * Pattern mirrors tests/unit-active/three-engine-api-contract.test.ts
 * and tests/unit-active/three-interaction-visuals-api-contract.test.ts.
 */
import { describe, it, expect } from 'vitest'
import * as module from '../../src/lib/journey/semantic-overlay'

describe('semantic-overlay.ts public API contract', () => {
    const expectedFunctions = [
        'resetFocusThreadDiagnostics',
        'removeFocusSemanticOverlay',
        'refreshFocusSemanticOverlay',
        'updateFocusSemanticOverlayPositions',
        'getSemanticFocusCueProbeSnapshot'
    ]

    expectedFunctions.forEach((name) => {
        it(`exports ${name} as a function`, () => {
            expect(typeof (module as unknown as Record<string, unknown>)[name]).toBe('function')
        })
    })

    // ── Behavior locks (don't need a running engine — exercise pure logic) ─

    it('resetFocusThreadDiagnostics accepts a reason argument (length 0 or 1)', () => {
        // Default param `reason = 'inactive'` means length is 0.
        expect(module.resetFocusThreadDiagnostics.length).toBe(0)
    })

    it('updateFocusSemanticOverlayPositions accepts an optional `now` argument', () => {
        // Default param `now = performance.now()` means length is 0.
        expect(module.updateFocusSemanticOverlayPositions.length).toBe(0)
    })

    it('getSemanticFocusCueProbeSnapshot returns a plain object', () => {
        const probe = module.getSemanticFocusCueProbeSnapshot()
        expect(typeof probe).toBe('object')
        expect(probe).not.toBeNull()
    })

    it('getSemanticFocusCueProbeSnapshot returns an object with the documented keys', () => {
        const probe = module.getSemanticFocusCueProbeSnapshot()
        // All keys should be present (values may be null/0 in idle state).
        const expectedKeys = [
            'visible',
            'threadSource',
            'focusedIndex',
            'nextIndex',
            'lineNextIndex',
            'nextCueSegments',
            'focusThreadSegments',
            'threadDiagnostics'
        ]
        for (const key of expectedKeys) {
            expect(Object.prototype.hasOwnProperty.call(probe, key), `missing key: ${key}`).toBe(true)
        }
    })

    it('removeFocusSemanticOverlay is idempotent (no throw when called twice)', () => {
        // First call removes any existing overlay; second call is a no-op.
        // Both must not throw.
        expect(() => module.removeFocusSemanticOverlay()).not.toThrow()
        expect(() => module.removeFocusSemanticOverlay()).not.toThrow()
    })

    it('resetFocusThreadDiagnostics is idempotent (no throw, no return value)', () => {
        expect(() => module.resetFocusThreadDiagnostics()).not.toThrow()
        expect(() => module.resetFocusThreadDiagnostics('idle')).not.toThrow()
    })
})
