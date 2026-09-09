/**
 * Unit tests for jam-radio pure helpers: base64 int16 PCM decoding and
 * stereo de-interleave. AudioContext-dependent scheduling is browser-only
 * and covered by the journey suite; these cover the data path math.
 */
import { describe, it, expect } from 'vitest'
import { decodePcmChunk, chunkToAudioBuffer, midiMessageToNote } from '../../src/lib/audio/jam-radio'
import { pressRadioNote, releaseRadioNote } from '../../src/lib/audio/jam-radio'
import { startMidiInput, stopMidiInput, getMidiInputCount } from '../../src/lib/audio/jam-midi'

/** Encode int16 samples to base64 of little-endian bytes (mirrors the server). */
function i16ToB64(samples: number[]): string {
    const bytes = new Uint8Array(samples.length * 2)
    const view = new DataView(bytes.buffer)
    samples.forEach((s, i) => view.setInt16(i * 2, s, true))
    let bin = ''
    bytes.forEach((b) => {
        bin += String.fromCharCode(b)
    })
    return btoa(bin)
}

describe('decodePcmChunk', () => {
    it('converts int16 PCM to float32 in [-1, 1)', () => {
        const f32 = decodePcmChunk(i16ToB64([16384, -16384, 32767, -32768]))
        expect(f32.length).toBe(4)
        expect(f32[0]).toBeCloseTo(0.5, 4)
        expect(f32[1]).toBeCloseTo(-0.5, 4)
        expect(f32[2]).toBeCloseTo(32767 / 32768, 4)
        expect(f32[3]).toBeCloseTo(-1, 4)
    })
    it('round-trips silence as zeros', () => {
        const f32 = decodePcmChunk(i16ToB64([0, 0, 0, 0]))
        expect(Array.from(f32)).toEqual([0, 0, 0, 0])
    })
})

describe('chunkToAudioBuffer', () => {
    // Structural AudioContext stand-in: real channel arrays so the
    // de-interleave is actually asserted.
    function fakeCtx() {
        return {
            createBuffer: (channels: number, frames: number, rate: number) => {
                const chans = Array.from({ length: channels }, () => new Float32Array(frames))
                return {
                    numberOfChannels: channels,
                    length: frames,
                    sampleRate: rate,
                    duration: frames / rate,
                    getChannelData: (i: number) => chans[i]
                }
            }
        } as unknown as AudioContext
    }

    it('de-interleaves an LRLR stream into L/R channels at 48kHz', () => {
        const interleaved = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6])
        const buf = chunkToAudioBuffer(fakeCtx(), interleaved)
        expect(buf.numberOfChannels).toBe(2)
        expect(buf.sampleRate).toBe(48000)
        expect(buf.length).toBe(3)
        expect(buf.duration).toBeCloseTo(3 / 48000, 8)
        const l = Array.from(buf.getChannelData(0))
        const r = Array.from(buf.getChannelData(1))
        expect(l[0]).toBeCloseTo(0.1, 6)
        expect(l[1]).toBeCloseTo(0.3, 6)
        expect(l[2]).toBeCloseTo(0.5, 6)
        expect(r[0]).toBeCloseTo(0.2, 6)
        expect(r[1]).toBeCloseTo(0.4, 6)
        expect(r[2]).toBeCloseTo(0.6, 6)
    })
    it('handles an odd-length chunk by dropping the trailing half-frame', () => {
        const buf = chunkToAudioBuffer(fakeCtx(), new Float32Array([0.1, 0.2, 0.3]))
        expect(buf.length).toBe(1)
    })
})

describe('pressRadioNote / releaseRadioNote guards', () => {
    it('accepts valid note+state without throwing (socket closed = silent no-op)', () => {
        expect(() => pressRadioNote(60, 4)).not.toThrow()
        expect(() => releaseRadioNote(60)).not.toThrow()
    })
    it('rejects out-of-range notes and states silently', () => {
        expect(() => pressRadioNote(-1, 4)).not.toThrow()
        expect(() => pressRadioNote(128, 4)).not.toThrow()
        expect(() => pressRadioNote(60, -1)).not.toThrow()
        expect(() => pressRadioNote(60, 12)).not.toThrow()
        expect(() => pressRadioNote(60.5, 4)).not.toThrow()
    })
    it('releasing an unknown note is a no-op', () => {
        expect(() => releaseRadioNote(77)).not.toThrow()
    })
})

describe('jam-midi lifecycle', () => {
    it('resolves -1 when Web MIDI is unavailable', async () => {
        // jsdom has navigator but no requestMIDIAccess.
        await expect(startMidiInput()).resolves.toBe(-1)
        expect(getMidiInputCount()).toBe(0)
    })
    it('stop is safe when idle', () => {
        expect(() => stopMidiInput()).not.toThrow()
        expect(getMidiInputCount()).toBe(0)
    })
})

describe('midiMessageToNote', () => {
    it('maps note-on (0x9n, velocity>0) to note_on with the given state', () => {
        expect(midiMessageToNote([0x90, 60, 100], 4)).toEqual({ type: 'note_on', note: 60, state: 4 })
    })
    it('maps note-on with velocity 0 to note_off (MIDI convention)', () => {
        expect(midiMessageToNote([0x90, 60, 0], 4)).toEqual({ type: 'note_off', note: 60 })
    })
    it('maps note-off (0x8n) to note_off', () => {
        expect(midiMessageToNote([0x80, 60, 64], 4)).toEqual({ type: 'note_off', note: 60 })
    })
    it('ignores control-change and short messages', () => {
        expect(midiMessageToNote([0xb0, 7, 100], 4)).toBeNull()
        expect(midiMessageToNote([0x90, 60], 4)).toBeNull()
        expect(midiMessageToNote([], 4)).toBeNull()
    })
})
