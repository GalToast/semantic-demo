/**
 * Unit tests for jam-steer pure helpers: the /band_mask request-body
 * builder that mirrors the server contract {preset|slots} (commit 26bf210)
 * and the summit slot constants from the whine/mech/final scans
 * (mrt2 tmp/WHINE_SCAN_RESULTS.md, FINAL_SCAN_RESULTS.md).
 */
import { describe, it, expect } from 'vitest'
import { bandMaskBody, clampMorphT, MORPH_MEASURED_ZONES, RADIO_SUMMIT_SLOTS } from '../../src/lib/audio/jam-steer'

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
    it('passes measured-safe values through unchanged', () => {
        expect(clampMorphT(0.6)).toBe(0.6)
        expect(clampMorphT(0.64)).toBe(0.64)
        expect(clampMorphT(0.72)).toBe(0.72)
        expect(clampMorphT(0.74)).toBe(0.74)
    })
    it('snaps the t=0.82 summit (100/100-S) and anything above 0.81 to it', () => {
        expect(clampMorphT(0.82)).toBe(MORPH_MEASURED_ZONES.summitT)
        expect(clampMorphT(0.95)).toBe(MORPH_MEASURED_ZONES.summitT)
        expect(clampMorphT(1)).toBe(MORPH_MEASURED_ZONES.summitT)
    })
    it('routes poison zone [0.68,0.70] to nearest safe edge', () => {
        expect(clampMorphT(0.68)).toBe(0.66)
        expect(clampMorphT(0.69)).toBe(0.72)
        expect(clampMorphT(0.7)).toBe(0.72)
    })
    it('routes poison zone [0.76,0.80] to 0.74 or the summit', () => {
        expect(clampMorphT(0.76)).toBe(0.74)
        expect(clampMorphT(0.78)).toBe(0.82)
        expect(clampMorphT(0.8)).toBe(0.82)
    })
    it('anchors below-range input at 0.60 (lowest measured safe point)', () => {
        expect(clampMorphT(0.3)).toBe(0.6)
        expect(clampMorphT(0)).toBe(0.6)
        expect(clampMorphT(-1)).toBe(0.6)
        expect(clampMorphT(NaN)).toBe(0.6)
    })
})
