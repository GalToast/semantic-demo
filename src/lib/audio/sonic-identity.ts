/**
 * @lib/audio/sonic-identity.ts — Playback for business-node sonic identities.
 *
 * Loads generated Magenta RT2 clips (via the sonic manifest) into a lazily
 * created AudioContext and exposes play/pause/stop. v2 playback:
 * - gapless looping (source.loop = true) instead of one-shot + retrigger
 * - short fades at edges to avoid clicks; loop seam stays seamless because
 *   loop=true restarts the buffer without re-scheduling
 * - respects the global audio mute state owned by audio-scape
 *   (`isAudioMuted`): playback is suppressed while muted, and an in-flight
 *   source is stopped when mute engages. This module owns NO mute state.
 */

import { isAudioMuted } from '@lib/audio/audio-scape'
import { loadSonicManifest, pickVariantForNode, type SonicClip } from '@lib/sonic/sonic-manifest'

interface WindowWithAudioContext extends Window {
    AudioContext: typeof AudioContext
    webkitAudioContext?: typeof AudioContext
}

let ctx: AudioContext | null = null
let currentSource: AudioBufferSourceNode | null = null
let currentGain: GainNode | null = null
/** Clip id currently playing (or null when stopped). */
let playingClipId: string | null = null
/** Buffer cache keyed by clip id — clips are tiny (≤8s stereo 48k ≈ 1.5MB). */
const bufferCache = new Map<string, AudioBuffer>()

function ensureCtx(): AudioContext | null {
    if (ctx) return ctx
    const w = window as unknown as Partial<WindowWithAudioContext>
    const Ctor = w.AudioContext ?? w.webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
    return ctx
}

async function fetchClipBuffer(clip: SonicClip): Promise<AudioBuffer | null> {
    const cachedBuf = bufferCache.get(clip.id)
    if (cachedBuf) return cachedBuf
    const c = ensureCtx()
    if (!c) return null
    try {
        const res = await fetch(`${import.meta.env.BASE_URL}${clip.file}`)
        if (!res.ok) return null
        const raw = await res.arrayBuffer()
        const buf = await c.decodeAudioData(raw)
        bufferCache.set(clip.id, buf)
        return buf
    } catch {
        return null
    }
}

/** Whether the given clip id is the one currently playing. */
export function isPlaying(clipId: string): boolean {
    return playingClipId === clipId
}

/**
 * Play the node's variant on gapless loop. Resolves true when playback began.
 * No-op (false) when audio is muted, the manifest/clip is unavailable, or the
 * Web Audio constructor is missing.
 */
export async function playSonicIdentity(
    clusterName: string | null | undefined,
    clipId: string,
    leadId?: string | null
): Promise<boolean> {
    if (isAudioMuted()) return false
    const manifest = await loadSonicManifest()
    if (!manifest) return false
    // Resolve by id across the node's variant set (clipId is the requested variant;
    // leadId refines per-node assignment when provided).
    const entry = clusterName ? manifest.clusters[clusterName] : undefined
    const variants = entry?.variants ?? manifest.clusters.__default?.variants ?? []
    const clip = variants.find((v) => v.id === clipId) ?? pickVariantForNode(manifest, clusterName, leadId ?? null)
    if (!clip) return false
    const c = ensureCtx()
    if (!c) return false
    const buf = await fetchClipBuffer(clip)
    if (!buf) return false
    if (isAudioMuted()) return false // re-check after async loads

    stopSonicIdentity()
    const src = c.createBufferSource()
    src.buffer = buf
    src.loop = true
    const gain = c.createGain()
    gain.gain.setValueAtTime(0.0001, c.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.55, c.currentTime + 0.25) // 250ms fade-in
    src.connect(gain)
    gain.connect(c.destination)
    src.onended = () => {
        if (playingClipId === clip.id) {
            playingClipId = null
            currentSource = null
            currentGain = null
        }
    }
    src.start()
    currentSource = src
    currentGain = gain
    playingClipId = clip.id
    return true
}

/** Stop any playing clip with a 150ms fade-out. Safe to call when idle. */
export function stopSonicIdentity(): void {
    const c = ctx
    const src = currentSource
    const gain = currentGain
    playingClipId = null
    currentSource = null
    currentGain = null
    if (!c || !src || !gain) return
    try {
        gain.gain.cancelScheduledValues(c.currentTime)
        gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), c.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.15)
        src.stop(c.currentTime + 0.16)
    } catch {
        src.stop() // already ended — best effort
    }
}
