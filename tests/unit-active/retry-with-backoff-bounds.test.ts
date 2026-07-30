import { describe, it, expect } from 'vitest'
import { computeBackoffDelay } from '@lib/utils/retry-with-backoff'

/**
 * W60 regression: computeBackoffDelay jitter clamp.
 *
 * Pre-fix the impl did `Math.round(capped * (0.5 + Math.random()))` AFTER capping
 * exponential at maxDelay. Since `(0.5 + Math.random())` ranges [0.5, 1.5), the
 * result could reach up to ~1.5x `maxDelay` whenever exponential >= maxDelay —
 * violating the maxDelay contract (param name + JSDoc promise a hard ceiling).
 * Fix: a second `Math.min(jittered, maxDelay)` clamp. This pins the result to
 * <= maxDelay for every attempt / every random draw.
 */
describe('computeBackoffDelay — maxDelay contract (W60 fix)', () => {
    it('never exceeds maxDelay for any attempt (pre-fix could reach ~1.5x)', () => {
        const base = 400
        const max = 8000
        for (let attempt = 0; attempt < 25; attempt++) {
            for (let s = 0; s < 300; s++) {
                const d = computeBackoffDelay(attempt, base, max)
                expect(d).toBeGreaterThanOrEqual(0)
                expect(d).toBeLessThanOrEqual(max)
            }
        }
    })

    it('never exceeds a small maxDelay cap even at low exponential', () => {
        const max = 100
        for (let attempt = 0; attempt < 30; attempt++) {
            for (let s = 0; s < 300; s++) {
                expect(computeBackoffDelay(attempt, 400, max)).toBeLessThanOrEqual(max)
            }
        }
    })

    it('preserves the [0.5,1.5) jitter spread for low attempts (unclamped regime)', () => {
        // attempt 0 -> exponential = base = 400 (< maxDelay 8000) so the second
        // clamp never bites: result ranges [round(400*0.5), round(400*1.5)) =
        // [200, 600). Confirm the observed floor is >= base*0.5.
        let min = Infinity
        const base = 400
        for (let s = 0; s < 8000; s++) {
            min = Math.min(min, computeBackoffDelay(0, base, 8000))
        }
        // capped * 0.5 = 200 is the exact floor; round(>=200) >= 200.
        expect(min).toBeGreaterThanOrEqual(200)
    })

    it('clamps at the ceiling for high attempts (regression for the overshoot)', () => {
        // attempt 6 -> exponential = 400 * 64 = 25600 >> maxDelay 8000, so capped
        // = maxDelay = 8000. Post-fix the clamp guarantees <= 8000; pre-fix the
        // [0.5,1.5) multiplier could return up to ~12000.
        for (let s = 0; s < 4000; s++) {
            expect(computeBackoffDelay(6, 400, 8000)).toBeLessThanOrEqual(8000)
        }
    })
})
