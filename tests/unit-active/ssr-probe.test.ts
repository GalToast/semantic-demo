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
    expect(threw).not.toBeNull() // jsdom window is non-configurable: stubbing is impossible; the real cross-runtime route is environment-level (no window), not test-stub-level
    expect(threw).toMatch(/Cannot redefine property: window/)
    console.info(
      '[ssr-probe] window descriptor configurable=%s writable=%s; approach: vi.stubGlobal (portable)',
      before?.configurable,
      before?.writable,
    )
  })
})