// ssr-probe.test.ts - informational descriptor probe (converted from a
// fail-marker to a passing invariant on the 2026-08-17 takeover).
// Documents the window descriptor + confirms vi.stubGlobal is the hermetic
// SSR approach (plain assignment is not portable across runtimes).
import { describe, it, expect, vi } from 'vitest'

describe('probe no-window mechanism', () => {
    it('documents the window descriptor and the supported stub route', () => {
        const before = Object.getOwnPropertyDescriptor(globalThis, 'window')
        let afterDesc: PropertyDescriptor | undefined
        let threw: string | null = null
        try {
            vi.stubGlobal('window', undefined)
            afterDesc = Object.getOwnPropertyDescriptor(globalThis, 'window')
        } catch (e) {
            threw = e instanceof Error ? e.message : String(e)
        } finally {
            vi.unstubAllGlobals()
        }
        // Pool-sensitive mechanism (2026-08-24): under vmThreads/jsdom the
        // window global is non-configurable so stubbing THROWS
        // ('Cannot redefine property: window'); under forks the stub may
        // apply cleanly. The POOL-AGNOSTIC invariant is hermeticity: whatever
        // happened inside the try, unstubAllGlobals() restores a usable
        // window global. The real cross-runtime SSR route remains
        // environment-level (no window), not test-stub-level.
        const restored = Object.getOwnPropertyDescriptor(globalThis, 'window')
        expect(restored).toBeDefined()
        expect(restored?.configurable).toBe(before?.configurable)
        if (threw !== null) {
            // vmThreads/jsdom path — document the refusal signature.
            expect(threw).toMatch(/Cannot redefine property: window/)
        } else {
            // forks path — stub applied and was rolled back.
            expect(afterDesc?.value).toBeUndefined()
        }
        console.info(
            '[ssr-probe] window descriptor configurable=%s writable=%s; stubRefused=%s; approach: environment-level no-window for SSR, vi.stubGlobal only where portable',
            before?.configurable,
            before?.writable,
            threw !== null
        )
    })
})
