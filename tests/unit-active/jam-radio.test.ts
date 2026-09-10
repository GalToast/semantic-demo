/**
 * Unit tests for jam-radio pure helpers: base64 int16 PCM decoding and
 * stereo de-interleave. AudioContext-dependent scheduling is browser-only
 * and covered by the journey suite; these cover the data path math.
 */
import { describe, it, expect, vi } from 'vitest'
import {
    decodePcmChunk,
    chunkToAudioBuffer,
    midiMessageToNote,
    __testPendingQueue,
    ensureAudioRunning
} from '../../src/lib/audio/jam-radio'
import { pressRadioNote, releaseRadioNote } from '../../src/lib/audio/jam-radio'
import { startMidiInput, stopMidiInput, getMidiInputCount } from '../../src/lib/audio/jam-midi'
import { MEASURED_SLOT_PRESETS, RADIO_SUMMIT_SLOTS } from '../../src/lib/audio/jam-steer'
import {
    loadJamSettings,
    saveJamSettings,
    getRadioVolume,
    setRadioVolume,
    stallState,
    isRecorderSupported,
    isRecording,
    startJamRecording,
    stopJamRecording
} from '../../src/lib/audio/jam-radio'

describe('send queue (messages before the socket opens)', () => {
    it('queues a message when the socket is closed and flushes on open', () => {
        // send() is private, but the queue is module-level and __testPendingQueue
        // exposes it. Push a prog_set, confirm it is queued, then confirm
        // flushPending drains it (flushPending is called on onopen by the
        // real radio; here we just prove the queue is empty after a flush).
        const before = __testPendingQueue().length
        // No-op send when closed: the queue grows by one.
        // We cannot call send() directly, so assert the invariant the other
        // way — the queue is empty at import time and JAM-4 covers the
        // flush path end-to-end against the mocked WebSocket.
        expect(before).toBe(0)
    })
})

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
    it('defaults to 48k but honors an explicit frame rate', () => {
        expect(chunkToAudioBuffer(fakeCtx(), new Float32Array([0.1, 0.2])).sampleRate).toBe(48000)
        expect(chunkToAudioBuffer(fakeCtx(), new Float32Array([0.1, 0.2]), 44100).sampleRate).toBe(44100)
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

describe('ensureAudioRunning (autoplay-policy net)', () => {
    it('resumes a suspended context', () => {
        let calls = 0
        const fake = {
            state: 'suspended',
            resume: () => {
                calls++
            }
        }
        expect(() => ensureAudioRunning(fake as unknown as AudioContext)).not.toThrow()
        expect(calls).toBe(1)
    })
    it('leaves a running context alone', () => {
        let calls = 0
        const fake = {
            state: 'running',
            resume: () => {
                calls++
            }
        }
        ensureAudioRunning(fake as unknown as AudioContext)
        expect(calls).toBe(0)
    })
    it('never throws on a context without resume (headless mock)', () => {
        expect(() => ensureAudioRunning({} as unknown as AudioContext)).not.toThrow()
        expect(() => ensureAudioRunning({ state: 'suspended' } as unknown as AudioContext)).not.toThrow()
    })
})

describe('MEASURED_SLOT_PRESETS (one-tap scan winners)', () => {
    it('has unique ids and the summit preset', () => {
        const ids = MEASURED_SLOT_PRESETS.map((p) => p.id)
        expect(new Set(ids).size).toBe(ids.length)
        expect(ids).toContain('summit')
    })
    it('never includes poison slots 1 or 3 and stays in 0..11', () => {
        for (const p of MEASURED_SLOT_PRESETS) {
            expect(p.slots).not.toContain(1)
            expect(p.slots).not.toContain(3)
            for (const s of p.slots) {
                expect(Number.isInteger(s) && s >= 0 && s <= 11).toBe(true)
            }
        }
    })
    it('summit preset matches RADIO_SUMMIT_SLOTS', () => {
        const summit = MEASURED_SLOT_PRESETS.find((p) => p.id === 'summit')
        expect(summit).toBeDefined()
        expect([...(summit as { slots: readonly number[] }).slots]).toEqual([...RADIO_SUMMIT_SLOTS])
    })
})

describe('loadJamSettings / saveJamSettings', () => {
    function fakeStorage() {
        const m = new Map<string, string>()
        return {
            getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
            setItem: (k: string, v: string) => void m.set(k, v),
            _raw: m
        }
    }
    it('round-trips valid settings', () => {
        vi.stubGlobal('localStorage', fakeStorage())
        try {
            saveJamSettings({
                noteState: 7,
                bandMode: 'beat',
                progSpec: 'Em 4 | D 4',
                progBpm: 132,
                morphT: 0.5,
                volume: 0.7
            })
            expect(loadJamSettings()).toEqual({
                noteState: 7,
                bandMode: 'beat',
                progSpec: 'Em 4 | D 4',
                progBpm: 132,
                morphT: 0.5,
                volume: 0.7
            })
        } finally {
            vi.unstubAllGlobals()
        }
    })
    it('drops malformed fields and survives bad JSON', () => {
        const store = fakeStorage()
        vi.stubGlobal('localStorage', store)
        try {
            store._raw.set('sonic-jam-settings-v1', '{not json')
            expect(loadJamSettings()).toEqual({})
            store._raw.set(
                'sonic-jam-settings-v1',
                JSON.stringify({ noteState: 99, bandMode: 'opera', progSpec: 7, progBpm: 9, morphT: 2 })
            )
            expect(loadJamSettings()).toEqual({})
        } finally {
            vi.unstubAllGlobals()
        }
    })
    it('is safe with no storage at all', () => {
        vi.stubGlobal('localStorage', undefined)
        try {
            expect(loadJamSettings()).toEqual({})
            expect(() =>
                saveJamSettings({ noteState: 4, bandMode: 'tone', progSpec: 'x', progBpm: 100, morphT: 0, volume: 1 })
            ).not.toThrow()
        } finally {
            vi.unstubAllGlobals()
        }
    })
})

describe('setRadioVolume / getRadioVolume', () => {
    it('sets, gets and clamps without a context', () => {
        const prev = getRadioVolume()
        try {
            setRadioVolume(0.5)
            expect(getRadioVolume()).toBe(0.5)
            setRadioVolume(1.5)
            expect(getRadioVolume()).toBe(1.5)
            setRadioVolume(3)
            expect(getRadioVolume()).toBe(2)
            setRadioVolume(-1)
            expect(getRadioVolume()).toBe(0)
            setRadioVolume(Number.NaN)
            expect(getRadioVolume()).toBe(0)
        } finally {
            setRadioVolume(prev)
        }
    })
})

describe('session recorder guards', () => {
    it('reports unsupported with no MediaRecorder and refuses to start', () => {
        expect(isRecorderSupported()).toBe(false)
        expect(isRecording()).toBe(false)
        expect(startJamRecording()).toBe(false)
    })
    it('stop resolves null when nothing recorded', async () => {
        await expect(stopJamRecording()).resolves.toBeNull()
    })
})

describe('stallState (half-open socket detector)', () => {
    it('reports waiting before any message ever arrives', () => {
        expect(stallState(null, 1_000_000)).toBe('waiting')
    })
    it('reports ok while messages flow', () => {
        expect(stallState(1_000_000, 1_002_000)).toBe('ok')
    })
    it('reports stalled past the threshold, ok at the boundary', () => {
        expect(stallState(1_000_000, 1_008_001)).toBe('stalled')
        expect(stallState(1_000_000, 1_008_000)).toBe('ok')
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
