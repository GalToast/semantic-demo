import { describe, it, expect } from 'vitest'
import { parseProgressionSpec } from '../../src/lib/audio/jam-radio'

// Reference: mrt2/tmp/chord_sequencer.py parse_prog / parse_chord. The client
// parser mirrors it so MIDI scheduling matches server-side LM steering —
// every expected value below was captured by running the canonical Python
// implementation against the same spec strings. Pinning the exact pitches
// (not just "3 notes") is the point: if the client voices a different chord
// than the server, the Sampler plays something the model never heard.
describe('parseProgressionSpec', () => {
    it('parses the default Am–F–C–G into 4 slots of 60 frames at 100bpm', () => {
        const slots = parseProgressionSpec('Am 4 | F 4 | C 4 | G 4', 100)
        expect(slots).not.toBeNull()
        expect(slots).toHaveLength(4)
        // 25 fps * 60 / 100 = 15 frames/beat * 4 beats = 60 frames/slot
        for (const s of slots!) expect(s.frames).toBe(60)
    })

    it('voices Am as [49, 52, 57]', () => {
        expect(parseProgressionSpec('Am 4', 100)![0].notes).toEqual([49, 52, 57])
    })

    it('voices F as [48, 53, 57]', () => {
        expect(parseProgressionSpec('F 4', 100)![0].notes).toEqual([48, 53, 57])
    })

    it('voices C as [48, 52, 55]', () => {
        expect(parseProgressionSpec('C 4', 100)![0].notes).toEqual([48, 52, 55])
    })

    it('voices G as [50, 55, 59]', () => {
        expect(parseProgressionSpec('G 4', 100)![0].notes).toEqual([50, 55, 59])
    })

    it('handles sharps and flats (F#min, Bb7) — client must match server', () => {
        expect(parseProgressionSpec('F#min 2', 100)![0].notes).toEqual([49, 54, 58])
        expect(parseProgressionSpec('Bb7 2', 100)![0].notes).toEqual([50, 53, 58])
    })

    it('handles per-chord beats inside a bar (Amin 2 Gmaj 2)', () => {
        const slots = parseProgressionSpec('Amin 2 Gmaj 2', 120)!
        expect(slots).toHaveLength(2)
        // 25 * 60 / 120 = 12.5 -> floor = 12 frames/beat * 2 = 24
        expect(slots[0].frames).toBe(24)
        expect(slots[1].frames).toBe(24)
        expect(slots[0].notes).toEqual([49, 52, 57])
        expect(slots[1].notes).toEqual([50, 55, 59])
    })

    it('frames scale with bpm (Am 4: 60 @100, 48 @120)', () => {
        expect(parseProgressionSpec('Am 4', 100)![0].frames).toBe(60)
        expect(parseProgressionSpec('Am 4', 120)![0].frames).toBe(48)
    })

    it('returns null for an empty spec', () => {
        expect(parseProgressionSpec('', 100)).toBeNull()
    })

    it('returns null for a bad bpm', () => {
        expect(parseProgressionSpec('Am 4', 0)).toBeNull()
        expect(parseProgressionSpec('Am 4', -10)).toBeNull()
    })

    it('throws on a bad root (server raises ValueError — client must agree)', () => {
        expect(() => parseProgressionSpec('Hmaj 4', 100)).toThrow()
    })
})
