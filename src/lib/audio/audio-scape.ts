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

let audioCtx: AudioContext | null = null
let mainOsc: OscillatorNode | null = null
let gainNode: GainNode | null = null
let filterNode: BiquadFilterNode | null = null
let _audioRafId: number | null = null

let lastCameraPos: Vector3Like | null = null
let currentVelocity = 0
let smoothVelocity = 0

// ── Public API (export parity with audio-scape.js) ──────────────────────────

export function initAudio(): void {
    if (audioCtx) return
    if (navigator.webdriver) return

    // Start context on user interaction
    const startEvents = ['mousedown', 'keydown', 'touchstart'] as const
    startEvents.forEach((evt) => {
        document.addEventListener(evt, startAudioContext, { once: true })
    })

    document.addEventListener('visibilitychange', handleVisibilityChange)
}

function handleVisibilityChange(): void {
    if (document.visibilityState === 'visible' && audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch((err: unknown) => {
            debugWarn('[audio] AudioContext resume failed on visibility change', err)
        })
    }
}

function startAudioContext(): void {
    if (audioCtx) return

    try {
        audioCtx = new (
            (window as unknown as { AudioContext: typeof AudioContext }).AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        )()

        mainOsc = audioCtx.createOscillator()
        mainOsc.type = 'sine'
        mainOsc.frequency.setValueAtTime(55, audioCtx.currentTime) // Low A

        gainNode = audioCtx.createGain()
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime)

        filterNode = audioCtx.createBiquadFilter()
        filterNode.type = 'lowpass'
        filterNode.frequency.setValueAtTime(200, audioCtx.currentTime)

        mainOsc.connect(filterNode)
        filterNode.connect(gainNode)
        gainNode.connect(audioCtx.destination)

        mainOsc.start()

        debugWarn('[audio] Reactive scape initialized.')
        _audioRafId = requestAnimationFrame(updateAudio)
    } catch (e: unknown) {
        debugWarn('[audio] Web Audio API initialization failed.', e)
    }
}

function updateAudio(): void {
    if (!audioCtx || audioCtx.state === 'closed') return
    if (!state.camera) {
        _audioRafId = requestAnimationFrame(updateAudio)
        return
    }

    // 1. Calculate Camera Velocity
    const camera = state.camera as unknown as CameraLike
    const currentPos: Vector3Like = camera.position.clone()
    if (lastCameraPos) {
        const dist = camera.position.distanceTo(lastCameraPos)
        currentVelocity = Number.isFinite(dist) ? dist * 60 : 0 // Normalize to approx units/sec
    }
    lastCameraPos = currentPos

    // Smooth velocity to avoid audio pops
    // Guard: ensure smoothVelocity never becomes NaN/Infinity
    if (!Number.isFinite(smoothVelocity)) smoothVelocity = 0
    smoothVelocity += (currentVelocity - smoothVelocity) * 0.1
    if (!Number.isFinite(smoothVelocity)) smoothVelocity = 0

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
    const freqMod = smoothVelocity * 50 + density * 20 + pathProximity * 110
    const rawTargetFreq = baseFreq + freqMod
    const targetFreq = Number.isFinite(rawTargetFreq) ? rawTargetFreq : 55

    const baseGain = 0.005
    const gainMod = smoothVelocity * 0.02 + density * 0.01 + pathProximity * 0.03
    const rawTargetGain = Math.min(0.06, baseGain + gainMod)
    const targetGain = Number.isFinite(rawTargetGain) ? rawTargetGain : 0.005

    const rawTargetFilter = 150 + density * 400 + smoothVelocity * 200 + pathProximity * 800
    const targetFilter = Number.isFinite(rawTargetFilter) ? rawTargetFilter : 200

    // Guard: audio nodes may be null after disposeAudio() races with RAF.
    if (!mainOsc || !gainNode || !filterNode || !audioCtx) {
        _audioRafId = requestAnimationFrame(updateAudio)
        return
    }
    mainOsc.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.1)
    gainNode.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.1)
    filterNode.frequency.setTargetAtTime(targetFilter, audioCtx.currentTime, 0.1)

    _audioRafId = requestAnimationFrame(updateAudio)
}

export function setAudioMuted(muted: boolean): void {
    if (!gainNode || !audioCtx) return
    gainNode.gain.setTargetAtTime(muted ? 0 : 0.01, audioCtx.currentTime, 0.2)
}

/**
 * 10/10 Polish: High-frequency 'shimmer' sound for corridor animations.
 */
export function triggerCorridorBloom(): void {
    if (!audioCtx || audioCtx.state === 'suspended') return

    try {
        const osc = audioCtx.createOscillator()
        const g = audioCtx.createGain()

        osc.type = 'sine'
        const freqWithRandom = 880 + Math.random() * 440
        osc.frequency.setValueAtTime(freqWithRandom, audioCtx.currentTime)
        const endFreqWithRandom = 1760 + Math.random() * 880
        osc.frequency.exponentialRampToValueAtTime(endFreqWithRandom, audioCtx.currentTime + 0.4)

        g.gain.setValueAtTime(0, audioCtx.currentTime)
        g.gain.linearRampToValueAtTime(0.012, audioCtx.currentTime + 0.05)
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.8)

        osc.connect(g)
        g.connect(audioCtx.destination)

        osc.start()
        osc.stop(audioCtx.currentTime + 0.8)
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

    if (_audioRafId !== null) {
        window.cancelAnimationFrame(_audioRafId)
        _audioRafId = null
    }
    if (mainOsc) {
        try {
            mainOsc.stop()
        } catch {
            // oscillator may already be stopped — safe to ignore
        }
        mainOsc.disconnect()
        mainOsc = null
    }
    if (filterNode) {
        filterNode.disconnect()
        filterNode = null
    }
    if (gainNode) {
        gainNode.disconnect()
        gainNode = null
    }
    if (audioCtx && audioCtx.state !== 'closed') {
        try {
            audioCtx.close()
        } catch {
            // audioContext may already be closed — safe to ignore
        }
        audioCtx = null
    }
    lastCameraPos = null
    currentVelocity = 0
    smoothVelocity = 0
    debugWarn('[audio] Reactive scape disposed.')
}
