/**
 * audio-scape.ts
 *
 * Canonical port of js/modules/audio-scape.ts.
 * Phase 3: Generative Audio Scape (Reactive)
 * Uses Web Audio API to create a low-amplitude 'data hum'
 * that reacts to camera velocity and local mycelium density.
 */

import { appState as _state } from '@lib/state/app.svelte'
const state = _state as any
import { debugWarn } from '@lib/utils/diagnostic-adapter'

// ── Local boundary types ────────────────────────────────────────────────────

/** Minimal camera shape used by this module. */
interface CameraLike {
    position: { clone(): Vector3Like; distanceTo(v: Vector3Like): number }
}

/** Minimal 3D vector shape used by this module. */
interface Vector3Like {
    x: number
    y: number
    z: number
    distanceTo?(v: Vector3Like): number
}

// ── Module-scoped mutable state ─────────────────────────────────────────────

/** Lightweight point shape for audio density lookups. */
interface AudioPoint {
    cluster?: number
    x?: number
    y?: number
    z?: number
}

/**
 * Module-scoped mutable state, consolidated into one object so the audio
 * engine can be reasoned about as a unit. Replaces 8 separate `let` bindings
 * that previously polluted the module scope. A future bite can promote
 * this to a proper `class AudioEngine` with encapsulation and test
 * isolation; for now, the consolidated object is the documented seam.
 */
const audioState = {
    audioCtx: null as AudioContext | null,
    mainOsc: null as OscillatorNode | null,
    gainNode: null as GainNode | null,
    filterNode: null as BiquadFilterNode | null,
    rafId: null as number | null,
    lastCameraPos: null as Vector3Like | null,
    currentVelocity: 0,
    smoothVelocity: 0
}

// ── Public API (export parity with audio-scape.js) ──────────────────────────

export function initAudio(): void {
    if (audioState.audioCtx) return
    if (navigator.webdriver) return

    // Start context on user interaction
    const startEvents = ['mousedown', 'keydown', 'touchstart'] as const
    startEvents.forEach((evt) => {
        document.addEventListener(evt, startAudioContext, { once: true })
    })

    document.addEventListener('visibilitychange', handleVisibilityChange)
}

function handleVisibilityChange(): void {
    if (document.visibilityState === 'visible' && audioState.audioCtx && audioState.audioCtx.state === 'suspended') {
        audioState.audioCtx.resume().catch((err: unknown) => {
            debugWarn('[audio] AudioContext resume failed on visibility change', err)
        })
    }
}

function startAudioContext(): void {
    if (audioState.audioCtx) return

    try {
        audioState.audioCtx = new (
            (window as unknown as { AudioContext: typeof AudioContext }).AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        )()

        audioState.mainOsc = audioState.audioCtx.createOscillator()
        audioState.mainOsc.type = 'sine'
        audioState.mainOsc.frequency.setValueAtTime(55, audioState.audioCtx.currentTime) // Low A

        audioState.gainNode = audioState.audioCtx.createGain()
        audioState.gainNode.gain.setValueAtTime(0, audioState.audioCtx.currentTime)

        audioState.filterNode = audioState.audioCtx.createBiquadFilter()
        audioState.filterNode.type = 'lowpass'
        audioState.filterNode.frequency.setValueAtTime(200, audioState.audioCtx.currentTime)

        audioState.mainOsc.connect(audioState.filterNode)
        audioState.filterNode.connect(audioState.gainNode)
        audioState.gainNode.connect(audioState.audioCtx.destination)

        audioState.mainOsc.start()

        debugWarn('[audio] Reactive scape initialized.')
        audioState.rafId = requestAnimationFrame(updateAudio)
    } catch (e: unknown) {
        debugWarn('[audio] Web Audio API initialization failed.', e)
    }
}

function updateAudio(): void {
    if (!audioState.audioCtx || audioState.audioCtx.state === 'closed') return
    if (!state.camera) {
        audioState.rafId = requestAnimationFrame(updateAudio)
        return
    }

    // 1. Calculate Camera Velocity
    const camera = state.camera as unknown as CameraLike
    const currentPos: Vector3Like = camera.position.clone()
    if (audioState.lastCameraPos) {
        const dist = camera.position.distanceTo(audioState.lastCameraPos)
        audioState.currentVelocity = Number.isFinite(dist) ? dist * 60 : 0 // Normalize to approx units/sec
    }
    audioState.lastCameraPos = currentPos

    // Smooth velocity to avoid audio pops
    // Guard: ensure audioState.smoothVelocity never becomes NaN/Infinity
    if (!Number.isFinite(audioState.smoothVelocity)) audioState.smoothVelocity = 0
    audioState.smoothVelocity += (audioState.currentVelocity - audioState.smoothVelocity) * 0.1
    if (!Number.isFinite(audioState.smoothVelocity)) audioState.smoothVelocity = 0

    // 2. Base Density & Path Proximity
    let density = 0.3
    let pathProximity = 0 // 0 (far) to 1 (near)
    let clusterFreqOffset = 0

    if (state.navState?.focusedIndex !== null) {
        density = 0.7
        if (state.semanticDiveMode) density = 0.9

        // Audio Symphony: Cluster-based frequency shift (Phase 3 refinement)
        const points = state.points as AudioPoint[]
        const point = points[state.navState.focusedIndex!]
        if (point && typeof point.cluster === 'number') {
            clusterFreqOffset = (point.cluster % 12) * 12
        }
    }

    // Path Proximity (Phase 3)
    // Boundary cast: activeRoutePath is dynamically added to navState at runtime
    // by route-choreography modules — not declared in the ambient NavState type.
    const navWithRoute = state.navState as unknown as { activeRoutePath?: Array<string | number> | null }
    if (navWithRoute.activeRoutePath && navWithRoute.activeRoutePath.length > 0 && state.pointIndexByLeadId) {
        const audioPoints = state.points as AudioPoint[]
        let minDist = Infinity
        navWithRoute.activeRoutePath.forEach((id: string | number) => {
            const idx = state.pointIndexByLeadId.get(String(id))
            if (idx !== undefined && audioPoints[idx]) {
                const p = audioPoints[idx]
                const target = { x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0 }
                const d = currentPos.distanceTo?.(target) ?? 0
                if (d < minDist) minDist = d
            }
        })
        pathProximity = Math.max(0, 1 - minDist / 2.0)
    }

    // 3. Map to Audio Parameters
    const baseFreq = 55 + clusterFreqOffset
    const freqMod = audioState.smoothVelocity * 50 + density * 20 + pathProximity * 110
    const rawTargetFreq = baseFreq + freqMod
    const targetFreq = Number.isFinite(rawTargetFreq) ? rawTargetFreq : 55

    const baseGain = 0.005
    const gainMod = audioState.smoothVelocity * 0.02 + density * 0.01 + pathProximity * 0.03
    const rawTargetGain = Math.min(0.06, baseGain + gainMod)
    const targetGain = Number.isFinite(rawTargetGain) ? rawTargetGain : 0.005

    const rawTargetFilter = 150 + density * 400 + audioState.smoothVelocity * 200 + pathProximity * 800
    const targetFilter = Number.isFinite(rawTargetFilter) ? rawTargetFilter : 200

    // Guard: audio nodes may be null after disposeAudio() races with RAF.
    if (!audioState.mainOsc || !audioState.gainNode || !audioState.filterNode || !audioState.audioCtx) {
        audioState.rafId = requestAnimationFrame(updateAudio)
        return
    }
    audioState.mainOsc.frequency.setTargetAtTime(targetFreq, audioState.audioCtx.currentTime, 0.1)
    audioState.gainNode.gain.setTargetAtTime(targetGain, audioState.audioCtx.currentTime, 0.1)
    audioState.filterNode.frequency.setTargetAtTime(targetFilter, audioState.audioCtx.currentTime, 0.1)

    audioState.rafId = requestAnimationFrame(updateAudio)
}

export function setAudioMuted(muted: boolean): void {
    if (!audioState.gainNode || !audioState.audioCtx) return
    audioState.gainNode.gain.setTargetAtTime(muted ? 0 : 0.01, audioState.audioCtx.currentTime, 0.2)
}

/**
 * 10/10 Polish: High-frequency 'shimmer' sound for corridor animations.
 */
export function triggerCorridorBloom(): void {
    if (!audioState.audioCtx || audioState.audioCtx.state === 'suspended') return

    try {
        const osc = audioState.audioCtx.createOscillator()
        const g = audioState.audioCtx.createGain()

        osc.type = 'sine'
        const freqWithRandom = 880 + Math.random() * 440
        osc.frequency.setValueAtTime(freqWithRandom, audioState.audioCtx.currentTime)
        const endFreqWithRandom = 1760 + Math.random() * 880
        osc.frequency.exponentialRampToValueAtTime(endFreqWithRandom, audioState.audioCtx.currentTime + 0.4)

        g.gain.setValueAtTime(0, audioState.audioCtx.currentTime)
        g.gain.linearRampToValueAtTime(0.012, audioState.audioCtx.currentTime + 0.05)
        g.gain.exponentialRampToValueAtTime(0.0001, audioState.audioCtx.currentTime + 0.8)

        osc.connect(g)
        g.connect(audioState.audioCtx.destination)

        osc.start()
        osc.stop(audioState.audioCtx.currentTime + 0.8)
    } catch {
        // Silent fail for transient audio
    }
}

/**
 * Trigger a named sound effect.
 * @param name - The name of the sound effect to trigger.
 */
export function trigger(name: string): void {
    if (name === 'corridor-bloom') {
        triggerCorridorBloom()
    }
}

export const play = trigger

/**
 * Dispose audio resources and cancel the RAF loop.
 * Called during engine deinit to prevent leaks across re-inits.
 */
export function disposeAudio(): void {
    document.removeEventListener('visibilitychange', handleVisibilityChange)

    if (audioState.rafId !== null) {
        window.cancelAnimationFrame(audioState.rafId)
        audioState.rafId = null
    }
    if (audioState.mainOsc) {
        try {
            audioState.mainOsc.stop()
        } catch {
            // oscillator may already be stopped — safe to ignore
        }
        audioState.mainOsc.disconnect()
        audioState.mainOsc = null
    }
    if (audioState.filterNode) {
        audioState.filterNode.disconnect()
        audioState.filterNode = null
    }
    if (audioState.gainNode) {
        audioState.gainNode.disconnect()
        audioState.gainNode = null
    }
    if (audioState.audioCtx && audioState.audioCtx.state !== 'closed') {
        try {
            audioState.audioCtx.close()
        } catch {
            // audioContext may already be closed — safe to ignore
        }
        audioState.audioCtx = null
    }
    audioState.lastCameraPos = null
    audioState.currentVelocity = 0
    audioState.smoothVelocity = 0
    debugWarn('[audio] Reactive scape disposed.')
}
