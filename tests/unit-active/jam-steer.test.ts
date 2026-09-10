/**
 * Unit tests for jam-steer pure helpers: the /band_mask request-body
 * builder that mirrors the server contract {preset|slots} (commit 26bf210)
 * and the summit slot constants from the whine/mech/final scans
 * (mrt2 tmp/WHINE_SCAN_RESULTS.md, FINAL_SCAN_RESULTS.md).
 */
import { describe, it, expect } from 'vitest'
import { bandMaskBody, clampMorphT, MORPH_SAFE_ROUTE, RADIO_SUMMIT_SLOTS } from '../../src/lib/audio/jam-steer'

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

describe('clampMorphT', () => {
    it('passes values in the safe range through unchanged', () => {
        expect(clampMorphT(0)).toBe(0)
        expect(clampMorphT(0.5)).toBe(0.5)
        expect(clampMorphT(1)).toBe(1)
        expect(clampMorphT(0.72)).toBe(0.72)
    })
    it('routes the measured whine zone [0.74,0.82] to its safe target', () => {
        expect(MORPH_SAFE_ROUTE.target).toBe(0.75)
        expect(clampMorphT(0.78)).toBe(MORPH_SAFE_ROUTE.target)
        expect(clampMorphT(MORPH_SAFE_ROUTE.start)).toBe(MORPH_SAFE_ROUTE.target)
        expect(clampMorphT(MORPH_SAFE_ROUTE.end)).toBe(MORPH_SAFE_ROUTE.target)
    })
    it('clamps out-of-range and garbage input into [0,1]', () => {
        expect(clampMorphT(-1)).toBe(0)
        expect(clampMorphT(2)).toBe(1)
        expect(clampMorphT(NaN)).toBe(0)
    })
})
