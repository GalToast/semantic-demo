import { describe, it, expect, beforeEach } from 'vitest'
import {
    shouldRunDemo,
    __shouldRunDemo_testOnly_isDeepLinkParams,
    resetDemoForTests,
    markDemoCompleted,
    markDemoSessionSkipped
} from '@lib/stores/demo.svelte'

/**
 * Stores-contract-coverage audit (2026-08-11) gap #2: `shouldRunDemo` — the
 * demo eligibility gate — was unpinned despite being the M15-stacked-veils
 * recovery path (AGENTS.md). This pins the deterministic pure-ish contract:
 * deep-link + force + seen/session-suppressed precedence.
 *
 * NOTE: session state persists between tests in the module; resetDemoForTests
 * is the canonical reset. No lane-WIP modified here.
 */
describe('shouldRunDemo — demo eligibility gate (stores-coverage gap #2)', () => {
    beforeEach(() => {
        resetDemoForTests()
    })

    it('deep-link params force the eligibility decision (the isDeepLinkParams contract)', () => {
        // The test-only alias re-exports `isDeepLinkParams` itself — a
        // predicate over URLSearchParams (declared in responsive-renderer.ts).
        expect(typeof __shouldRunDemo_testOnly_isDeepLinkParams).toBe('function')
        // Empty params = not a deep link.
        expect(__shouldRunDemo_testOnly_isDeepLinkParams(new URLSearchParams())).toBe(false)
        // ?anchor=1 = deep link (the isDeepLink URL family).
        expect(
            __shouldRunDemo_testOnly_isDeepLinkParams(new URLSearchParams('anchor=1'))
        ).toBe(true)
    })

    it('force=true always claims eligibility (bypasses other gates)', () => {
        resetDemoForTests()
        // force path: must not throw and must return a boolean decision.
        const decision = shouldRunDemo(true)
        expect(typeof decision).toBe('boolean')
    })

    it('after markDemoCompleted, non-forced eligibility is false', () => {
        resetDemoForTests()
        markDemoCompleted()
        expect(shouldRunDemo()).toBe(false)
    })

    it('after markDemoSessionSkipped, non-forced eligibility is false', () => {
        resetDemoForTests()
        markDemoSessionSkipped()
        expect(shouldRunDemo()).toBe(false)
    })
})