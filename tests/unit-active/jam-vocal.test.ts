/** Pure pitch-detector coverage for the microphone tier.
 * Browser permission, Web Audio wiring, and note lifecycle are exercised by
 * the standalone jam journey; these tests pin the signal-processing boundary.
 */
import { afterEach, describe, it, expect, vi } from 'vitest'
import {
    detectPitch,
    getVocalLevel,
    isVocalMonitoring,
    startVocalMonitor,
    stopVocalMonitor
} from '../../src/lib/audio/jam-vocal'

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

describe('vocal monitor lifecycle', () => {
    const audioWindow = window as Window & { AudioContext?: typeof AudioContext }
    const originalAudioContext = audioWindow.AudioContext
    const originalMediaDevices = navigator.mediaDevices

    afterEach(() => {
        stopVocalMonitor()
        vi.useRealTimers()
        Object.defineProperty(window, 'AudioContext', {
            configurable: true,
            value: originalAudioContext
        })
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: originalMediaDevices
        })
    })

    it('stops the timer, disconnects the source, and releases every media track', async () => {
        vi.useFakeTimers()
        const track = { stop: vi.fn() }
        const stream = { getTracks: () => [track] } as unknown as MediaStream
        const disconnect = vi.fn()
        const connect = vi.fn()
        const analyser = {
            fftSize: 2048,
            getFloatTimeDomainData: (buf: Float32Array) => buf.fill(0)
        }
        class FakeAudioContext {
            sampleRate = 48000
            destination = {}
            createMediaStreamSource() {
                return { connect, disconnect }
            }
            createAnalyser() {
                return analyser
            }
        }
        Object.defineProperty(window, 'AudioContext', { configurable: true, value: FakeAudioContext })
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia: vi.fn(async () => stream) }
        })

        await expect(startVocalMonitor(() => 4)).resolves.toBe(true)
        expect(isVocalMonitoring()).toBe(true)
        expect(connect).toHaveBeenCalledWith(analyser)
        vi.advanceTimersByTime(100)
        expect(getVocalLevel()).toBe(0)

        stopVocalMonitor()
        expect(isVocalMonitoring()).toBe(false)
        expect(disconnect).toHaveBeenCalledTimes(1)
        expect(track.stop).toHaveBeenCalledTimes(1)
    })

    it('cancels a pending permission request and stops a late stream', async () => {
        let resolveStream: ((stream: MediaStream) => void) | undefined
        const getUserMedia = vi.fn(
            () =>
                new Promise<MediaStream>((resolve) => {
                    resolveStream = resolve
                })
        )
        const track = { stop: vi.fn() }
        const stream = { getTracks: () => [track] } as unknown as MediaStream
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia }
        })

        const pending = startVocalMonitor()
        stopVocalMonitor()
        resolveStream?.(stream)

        await expect(pending).resolves.toBe(false)
        expect(track.stop).toHaveBeenCalledTimes(1)
        expect(isVocalMonitoring()).toBe(false)
    })
})
