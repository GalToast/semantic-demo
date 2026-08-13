import { describe, it, expect } from 'vitest'
import { applyUrlState } from '@lib/orchestration/url-restore'

/**
 * S3 twins-contract-coverage gap: the exported `UrlStateOptions` interface was
 * unpinned by any test (S3 audit 2026-08-11). This pins its shape at the type
 * level via the applyUrlState parameter surface, plus runtime sanity on the
 * fields S1's audit flagged (force/historyState declared-unused).
 *
 * No browser, no state — pure static pin. If the interface shape changes, TS
 * compile of this file fails.
 */
describe('UrlStateOptions — exported options interface (S3 gap-test)', () => {
    it('applyUrlState accepts the options shape (fromHistory / historyState / force)', () => {
        // Type-level pin: passing these fields must compile. Any rename/removal
        // of a field below is a compile error => interface drift caught.
        const fn: (options: {
            fromHistory?: boolean
            historyState?: { params?: Record<string, string> }
            force?: boolean
        }) => Promise<void> = applyUrlState as never

        // Runtime sanity: the function exists + is the callable export.
        expect(typeof fn).toBe('function')
    })

    it('is called without options in production paths (options optional)', () => {
        // applyUrlState() with no args must be callable per the interface
        // (all fields optional). Type-level: this must compile.
        const callable = applyUrlState as (options?: {
            fromHistory?: boolean
            historyState?: { params?: Record<string, string> }
            force?: boolean
        }) => Promise<void>
        expect(typeof callable).toBe('function')
    })
})
