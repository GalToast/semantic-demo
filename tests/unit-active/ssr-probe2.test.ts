/** @vitest-environment node */
import { describe, it, expect } from 'vitest'
import { hydrateFromLegacyState } from '../../src/lib/data-store.ts'

describe('node-env probe', () => {
    it('hydrateFromLegacyState returns false without window', () => {
        expect(hydrateFromLegacyState()).toBe(false)
    })
})
