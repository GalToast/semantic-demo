import { describe, it, expect, vi } from 'vitest'

describe('probe no-window mechanism', () => {
    it('shows full descriptor AND testable approaches', () => {
        const before = Object.getOwnPropertyDescriptor(globalThis, 'window')
        // Force a visible failure carrying the descriptor + attempt results.
        const result = {
            beforeConfigurable: before?.configurable,
            beforeWritable: before?.writable,
            beforeHasGet: !!before?.get,
            typeofWindowBefore: typeof (globalThis as any).window,
            // attempt 1: plain assignment
            assignThrew: null as string | null,
            typeofAfterAssign: null as string | null,
            // attempt 2: vi.stubGlobal
            stubThrew: null as string | null,
            typeofAfterStub: null as string | null
        }
        try {
            // @ts-ignore
            globalThis.window = undefined as any
            result.typeofAfterAssign = typeof (globalThis as any).window
        } catch (e) {
            result.assignThrew = e instanceof Error ? e.message : String(e)
            result.typeofAfterAssign = typeof (globalThis as any).window
        }
        vi.unstubAllGlobals()
        try {
            vi.stubGlobal('window', undefined as any)
            result.typeofAfterStub = typeof (globalThis as any).window
        } catch (e) {
            result.stubThrew = e instanceof Error ? e.message : String(e)
            result.typeofAfterStub = typeof (globalThis as any).window
        } finally {
            vi.unstubAllGlobals()
        }
        expect(result).toBe('SHOW_ME')
    })
})
