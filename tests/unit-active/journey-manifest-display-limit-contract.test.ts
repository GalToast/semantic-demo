/**
 * neighborhood-manifest — display-limit contract test
 *
 * Pins journey-coverage gap #1: getSemanticThreadDisplayLimit() and
 * getSemanticPeerThreadDisplayLimit() gate how many thread indicators
 * the user sees. Without this test, a UX-debt-sector regression could
 * silently change the cap and clutter the viewport.
 *
 * Spec: tmp/journey-contract-coverage.md gap #1.
 */
import { describe, it, expect } from 'vitest'
import * as module from '../../src/lib/journey/neighborhood-manifest'

describe('neighborhood-manifest.ts display-limit contract', () => {
    const { MAX_MANIFEST_CANDIDATES } = module

    it('exports MAX_MANIFEST_CANDIDATES as 18', () => {
        expect(MAX_MANIFEST_CANDIDATES).toBe(18)
    })

    it('exports getSemanticThreadDisplayLimit as a function', () => {
        expect(typeof module.getSemanticThreadDisplayLimit).toBe('function')
    })

    it('getSemanticThreadDisplayLimit() equals MAX_MANIFEST_CANDIDATES', () => {
        expect(module.getSemanticThreadDisplayLimit()).toBe(MAX_MANIFEST_CANDIDATES)
    })

    it('exports getSemanticPeerThreadDisplayLimit as a function', () => {
        expect(typeof module.getSemanticPeerThreadDisplayLimit).toBe('function')
    })

    // ── (b) boundary values ─────────────────────────────────────────────

    const cases: Array<{ input: number; expected: number; label: string }> = [
        { input: 0, expected: 0, label: '0 candidates' },
        { input: 1, expected: 0, label: '1 candidate (no peers)' },
        { input: 18, expected: 14, label: '18 candidates' },
        { input: 19, expected: 14, label: '19 candidates' },
        { input: 50, expected: 14, label: '50 candidates' },
        { input: -5, expected: 0, label: 'negative candidates' },
    ]

    cases.forEach(({ input, expected, label }) => {
        it(`getSemanticPeerThreadDisplayLimit(${input}) returns ${expected} (${label})`, () => {
            expect(module.getSemanticPeerThreadDisplayLimit(input)).toBe(expected)
        })
    })

    it('getSemanticPeerThreadDisplayLimit never exceeds MAX_MANIFEST_CANDIDATES', () => {
        // The peer cap is smaller than the manifest cap, but the invariant
        // is that display limits must never exceed the manifest ceiling.
        for (const count of [0, 1, 14, 18, 19, 50, -3]) {
            expect(module.getSemanticPeerThreadDisplayLimit(count)).toBeLessThanOrEqual(MAX_MANIFEST_CANDIDATES)
        }
    })

    // ── (c) invariant: display limit <= MAX_MANIFEST_CANDIDATES always ──

    it('getSemanticThreadDisplayLimit() always <= MAX_MANIFEST_CANDIDATES', () => {
        expect(module.getSemanticThreadDisplayLimit()).toBeLessThanOrEqual(MAX_MANIFEST_CANDIDATES)
    })
})
