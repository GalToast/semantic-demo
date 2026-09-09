/**
 * Unit tests for jam-steer pure helpers: the /band_mask request-body
 * builder that mirrors the server contract {preset|slots} (commit 26bf210)
 * and the summit slot constants from the whine/mech/final scans
 * (mrt2 tmp/WHINE_SCAN_RESULTS.md, FINAL_SCAN_RESULTS.md).
 */
import { describe, it, expect } from 'vitest'
import { bandMaskBody, RADIO_SUMMIT_SLOTS } from '../../src/lib/audio/jam-steer'

describe('bandMaskBody', () => {
    it('wraps a named preset in the {preset} field', () => {
        expect(bandMaskBody('melodic')).toEqual({ preset: 'melodic' })
        expect(bandMaskBody('production')).toEqual({ preset: 'production' })
    })

    it('wraps explicit slots in the {slots} field as a plain array copy', () => {
        const slots = [2, 11]
        const body = bandMaskBody(slots)
        expect(body).toEqual({ slots: [2, 11] })
        // defensive copy: mutating the source afterwards must not leak in
        ;(slots as number[]).push(1)
        expect(body).toEqual({ slots: [2, 11] })
    })

    it('distinguishes preset vs slots by Array.isArray, not contents', () => {
        expect(bandMaskBody([])).toEqual({ slots: [] })
    })
})

describe('RADIO_SUMMIT_SLOTS', () => {
    it('is exactly the whine-clean summit {2,11}', () => {
        expect([...RADIO_SUMMIT_SLOTS].sort((a, b) => a - b)).toEqual([2, 11])
    })

    it('contains no poison slots (1 and 3 collapse the resonance)', () => {
        for (const poison of [1, 3]) {
            expect(RADIO_SUMMIT_SLOTS).not.toContain(poison)
        }
    })

    it('keeps slot 2 — the single-slot resonance carrier', () => {
        expect(RADIO_SUMMIT_SLOTS).toContain(2)
    })
})
