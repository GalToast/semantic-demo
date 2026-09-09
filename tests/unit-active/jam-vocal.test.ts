/** Pure pitch-detector coverage for the microphone tier.
 * Browser permission, Web Audio wiring, and note lifecycle are exercised by
 * the standalone jam journey; these tests pin the signal-processing boundary.
 */
import { describe, it, expect } from 'vitest'
import { detectPitch } from '../../src/lib/audio/jam-vocal'

function sine(frequency: number, sampleRate = 48000, length = 2048): Float32Array {
    const samples = new Float32Array(length)
    for (let i = 0; i < samples.length; i++) {
        samples[i] = 0.4 * Math.sin((2 * Math.PI * frequency * i) / sampleRate)
    }
    return samples
}

describe('detectPitch', () => {
    it('finds the fundamental of a voiced 440Hz frame', () => {
        const pitch = detectPitch(sine(440), 48000)
        expect(pitch).toBeGreaterThan(438)
        expect(pitch).toBeLessThan(443)
    })

    it('tracks lower and upper voice-range fundamentals', () => {
        expect(detectPitch(sine(110), 48000)).toBeGreaterThan(100)
        expect(detectPitch(sine(110), 48000)).toBeLessThan(120)
        expect(detectPitch(sine(880), 48000)).toBeGreaterThan(840)
        expect(detectPitch(sine(880), 48000)).toBeLessThan(920)
    })

    it('returns unvoiced for silence, short frames, invalid rates, and non-finite samples', () => {
        expect(detectPitch(new Float32Array(2048), 48000)).toBe(0)
        expect(detectPitch(new Float32Array([0, 1]), 48000)).toBe(0)
        expect(detectPitch(sine(440), 0)).toBe(0)
        const invalid = sine(440)
        invalid[12] = Number.NaN
        expect(detectPitch(invalid, 48000)).toBe(0)
    })
})
