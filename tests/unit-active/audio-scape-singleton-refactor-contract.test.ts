/**
 * @file audio-scape-singleton-refactor-contract.test.ts
 *
 * Lock-in test for the audio-scape singleton refactor (Axis 4 priority,
 * per docs/engine-boundary-refactor-plan.md).
 *
 * Refactor: replaced 8 module-level `let` bindings with a single
 * `audioState` const object. This consolidates module-scoped mutable
 * state into one discoverable object, providing a clean seam for a
 * future bite to promote it to a `class AudioEngine` with proper
 * encapsulation and test isolation.
 *
 * Before (8 separate module-level lets):
 *   let audioCtx: AudioContext | null = null
 *   let mainOsc: OscillatorNode | null = null
 *   let gainNode: GainNode | null = null
 *   let filterNode: BiquadFilterNode | null = null
 *   let _audioRafId: number | null = null
 *   let lastCameraPos: Vector3Like | null = null
 *   let currentVelocity = 0
 *   let smoothVelocity = 0
 *
 * After (1 consolidated const):
 *   const audioState = {
 *     audioCtx: null as AudioContext | null,
 *     mainOsc: null as OscillatorNode | null,
 *     gainNode: null as GainNode | null,
 *     filterNode: null as BiquadFilterNode | null,
 *     rafId: null as number | null,
 *     lastCameraPos: null as Vector3Like | null,
 *     currentVelocity: 0,
 *     smoothVelocity: 0
 *   }
 *
 * Note: `_audioRafId` renamed to `rafId` (no underscore prefix needed
 * since the property is now encapsulated in audioState).
 *
 * Public API preserved:
 *   - initAudio()
 *   - setAudioMuted(muted)
 *   - triggerCorridorBloom()
 *   - trigger(name)
 *   - play (alias for trigger)
 *   - disposeAudio()
 *
 * Run: npx vitest run tests/unit-active/audio-scape-singleton-refactor-contract.test.ts
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(__dirname, '..', '..')
const AUDIO_SCAPE_PATH = path.join(ROOT, 'src', 'audio', 'audio-scape.ts')

function readSource(rel: string): string {
    return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}

describe('Axis 4 / audio-scape singleton refactor', () => {
    it('no module-level let declarations remain for audio state', () => {
        const source = readSource('src/lib/audio/audio-scape.ts')
        // None of the 8 module-level lets should remain
        expect(source).not.toMatch(/^let\s+audioCtx\b/m)
        expect(source).not.toMatch(/^let\s+mainOsc\b/m)
        expect(source).not.toMatch(/^let\s+gainNode\b/m)
        expect(source).not.toMatch(/^let\s+filterNode\b/m)
        expect(source).not.toMatch(/^let\s+_audioRafId\b/m)
        expect(source).not.toMatch(/^let\s+lastCameraPos\b/m)
        expect(source).not.toMatch(/^let\s+currentVelocity\b/m)
        expect(source).not.toMatch(/^let\s+smoothVelocity\b/m)
    })

    it('audioState const object is declared with all 8 properties', () => {
        const source = readSource('src/lib/audio/audio-scape.ts')
        expect(source).toMatch(/^const\s+audioState\s*=\s*\{/m)
        // All 8 properties declared inside
        expect(source).toMatch(/audioCtx:\s*null\s+as\s+AudioContext\s*\|\s*null/)
        expect(source).toMatch(/mainOsc:\s*null\s+as\s+OscillatorNode\s*\|\s*null/)
        expect(source).toMatch(/gainNode:\s*null\s+as\s+GainNode\s*\|\s*null/)
        expect(source).toMatch(/filterNode:\s*null\s+as\s+BiquadFilterNode\s*\|\s*null/)
        expect(source).toMatch(/rafId:\s*null\s+as\s+number\s*\|\s*null/)
        expect(source).toMatch(/lastCameraPos:\s*null\s+as\s+Vector3Like\s*\|\s*null/)
        expect(source).toMatch(/currentVelocity:\s*0/)
        expect(source).toMatch(/smoothVelocity:\s*0/)
    })

    it('all references use audioState.X (no bare audioCtx/mainOsc/etc)', () => {
        const source = readSource('src/lib/audio/audio-scape.ts')

        // Extract the audioState declaration block — this is the only place
        // where bare property names (audioCtx:, mainOsc:, etc.) are allowed
        const declMatch = source.match(/const\s+audioState\s*=\s*\{[\s\S]*?\n\}/m)
        expect(declMatch, 'audioState declaration not found').not.toBeNull()
        const declBlock = declMatch![0]

        // Outside the declaration, count audioState.X references
        const outside = source.replace(declBlock, '')
        const stateRefs =
            outside.match(
                /audioState\.(audioCtx|mainOsc|gainNode|filterNode|rafId|lastCameraPos|currentVelocity|smoothVelocity)\b/g
            ) || []
        expect(
            stateRefs.length,
            `expected ≥30 audioState references outside declaration, got ${stateRefs.length}`
        ).toBeGreaterThanOrEqual(30)
    })

    it('public API exports preserved (initAudio, setAudioMuted, etc)', () => {
        const source = readSource('src/lib/audio/audio-scape.ts')
        expect(source).toMatch(/export\s+function\s+initAudio\(/)
        expect(source).toMatch(/export\s+function\s+setAudioMuted\(/)
        expect(source).toMatch(/export\s+function\s+triggerCorridorBloom\(/)
        expect(source).toMatch(/export\s+function\s+trigger\(/)
        expect(source).toMatch(/export\s+const\s+play\s*=/)
        expect(source).toMatch(/export\s+function\s+disposeAudio\(/)
    })

    it('disposeAudio resets all audioState properties', () => {
        const source = readSource('src/lib/audio/audio-scape.ts')
        const fn = source.match(/export\s+function\s+disposeAudio[\s\S]*?\n\}/m)
        expect(fn, 'disposeAudio not found').not.toBeNull()
        const body = fn![0]
        // Should null out all handle properties
        expect(body).toMatch(/audioState\.mainOsc\s*=\s*null/)
        expect(body).toMatch(/audioState\.filterNode\s*=\s*null/)
        expect(body).toMatch(/audioState\.gainNode\s*=\s*null/)
        expect(body).toMatch(/audioState\.audioCtx\s*=\s*null/)
        expect(body).toMatch(/audioState\.lastCameraPos\s*=\s*null/)
        expect(body).toMatch(/audioState\.currentVelocity\s*=\s*0/)
        expect(body).toMatch(/audioState\.smoothVelocity\s*=\s*0/)
        expect(body).toMatch(/audioState\.rafId\s*=\s*null/)
    })

    it('rafId is the renamed raf handle (no underscore prefix)', () => {
        const source = readSource('src/lib/audio/audio-scape.ts')
        // The old underscore-prefixed name should be gone
        expect(source).not.toMatch(/_audioRafId\b/)
        // The renamed `rafId` should be used consistently
        const rafIdRefs = source.match(/audioState\.rafId\b/g) || []
        expect(rafIdRefs.length, `expected ≥2 rafId references, got ${rafIdRefs.length}`).toBeGreaterThanOrEqual(2)
    })
})
