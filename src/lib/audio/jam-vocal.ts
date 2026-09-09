/**
 * @lib/audio/jam-vocal.ts — Microphone vocal monitor for the live jam.
 *
 * Pitch from the singer, articulation from the dial (same separation as
 * MIDI: pitch+timing here, timbre there). Autocorrelation peak-picking
 * tracks voice fundamental at ~1-5 cents (scripts/pitch-detect-probe.py);
 * note identity only needs +-50c, so quantized MIDI notes are robust.
 *
 * Chain: getUserMedia -> AudioContext -> AnalyserNode (polled) ->
 * autocorrelation -> median smoothing -> MIDI note on change ->
 * pressRadioNote(note, dialState) / releaseRadioNote(note).
 * Silence (>300ms unvoiced) releases the note. Level (RMS) is exposed
 * for the dial meter. Style-upload (POST /style_audio) plugs in later;
 * until then the monitor plays through the MIDI tier, which works today.
 *
 * No-MIDI-style graceful degradation: no mic / denied permission resolves
 * false and the dial works regardless.
 */

import { pressRadioNote, releaseRadioNote } from '@lib/audio/jam-radio'

let ctx: AudioContext | null = null
let stream: MediaStream | null = null
let source: MediaStreamAudioSourceNode | null = null
let analyser: AnalyserNode | null = null
let timer: ReturnType<typeof globalThis.setInterval> | null = null
let startPromise: Promise<boolean> | null = null
let startToken = 0
let getState: () => number = () => 4
let currentNote: number | null = null
let silentSince = -1
let lastLevel = 0
let onPitchCb: ((midi: number | null, level: number) => void) | null = null

const WIN = 2048
const SR_HINT = 48000
const UNVOICED_RELEASE_MS = 300
const POLL_MS = 100
const MIN_RMS = 0.01
const MIN_PITCH_HZ = 60
const MAX_PITCH_HZ = 1200
const CORRELATION_STEP = 2

function freqToMidi(freq: number): number {
    return Math.round(69 + 12 * Math.log2(freq / 440))
}

/** Autocorrelation fundamental. Returns Hz, or 0 when unvoiced. */
export function detectPitch(buf: Float32Array, sampleRate: number): number {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0 || buf.length < 3) return 0
    let mean = 0
    for (let i = 0; i < buf.length; i++) {
        const sample = buf[i]
        if (sample === undefined || !Number.isFinite(sample)) return 0
        mean += sample
    }
    mean /= buf.length
    let e0 = 0
    const centered = new Float32Array(buf.length)
    for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] ?? 0) - mean
        centered[i] = v
        e0 += v * v
    }
    if (e0 < 1e-9) return 0
    const n = buf.length
    const lo = Math.max(2, Math.floor(sampleRate / MAX_PITCH_HZ))
    const hi = Math.min(n - 2, Math.ceil(sampleRate / MIN_PITCH_HZ))
    if (hi <= lo) return 0
    const correlations = new Float32Array(hi + 1)
    let best = -1
    let bestV = 0
    for (let lag = lo; lag <= hi; lag++) {
        let s = 0
        for (let i = 0; i + lag < n; i += CORRELATION_STEP) {
            s += (centered[i] ?? 0) * (centered[i + lag] ?? 0)
        }
        correlations[lag] = s / e0
    }
    // Choose the first credible local maximum rather than the largest raw
    // correlation. A low note's short lags are still highly correlated, but
    // the first local peak is its fundamental period (not a high-frequency
    // false positive). Fall back to the strongest peak for clipped/noisy
    // frames that do not produce a clean local maximum.
    for (let lag = lo + 1; lag < hi; lag++) {
        const previous = correlations[lag - 1] ?? 0
        const current = correlations[lag] ?? 0
        const next = correlations[lag + 1] ?? 0
        if (current >= 0.3 && current >= previous && current >= next) {
            best = lag
            bestV = current
            break
        }
    }
    if (best < 0) {
        for (let lag = lo; lag <= hi; lag++) {
            const current = correlations[lag] ?? 0
            if (current > bestV) {
                bestV = current
                best = lag
            }
        }
    }
    if (best < 0 || bestV < 0.3) return 0
    const left = correlations[best - 1] ?? bestV
    const center = correlations[best] ?? bestV
    const right = correlations[best + 1] ?? bestV
    const denominator = left - 2 * center + right
    const offset = denominator === 0 ? 0 : Math.max(-0.5, Math.min(0.5, 0.5 * (left - right) / denominator))
    return sampleRate / (best + offset)
}

function clampState(s: number): number {
    if (!Number.isInteger(s)) return 4
    return Math.min(11, Math.max(0, s))
}

function releaseAfterUnvoiced(now: number, level: number): void {
    if (currentNote === null) return
    if (silentSince < 0) silentSince = now
    if (now - silentSince < UNVOICED_RELEASE_MS) return
    releaseRadioNote(currentNote)
    currentNote = null
    onPitchCb?.(null, level)
}

function poll(): void {
    if (!analyser || !ctx) return
    const buf = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(buf)
    let rms = 0
    for (let i = 0; i < buf.length; i++) {
        const sample = buf[i] ?? 0
        rms += sample * sample
    }
    rms = Math.sqrt(rms / buf.length)
    lastLevel = rms
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    if (rms < MIN_RMS) {
        releaseAfterUnvoiced(now, rms)
        return
    }
    silentSince = -1
    const freq = detectPitch(buf.slice(0, WIN), ctx.sampleRate)
    if (freq <= 0) {
        releaseAfterUnvoiced(now, rms)
        return
    }
    const midi = Math.min(127, Math.max(0, freqToMidi(freq)))
    if (midi !== currentNote) {
        if (currentNote !== null) releaseRadioNote(currentNote)
        currentNote = midi
        pressRadioNote(midi, clampState(getState()))
        onPitchCb?.(midi, rms)
    } else {
        onPitchCb?.(midi, rms)
    }
}

/**
 * Start monitoring the microphone. getStateFn supplies the live dial
 * articulation state per new note. onPitch receives (midi|null, level).
 * Resolves true when streaming, false when mic is unavailable/denied.
 */
export async function startVocalMonitor(
    getStateFn?: () => number,
    onPitch?: (midi: number | null, level: number) => void
): Promise<boolean> {
    if (getStateFn) getState = getStateFn
    if (onPitch) onPitchCb = onPitch
    if (timer !== null) return true
    if (startPromise) return startPromise

    const token = ++startToken
    const run = (async (): Promise<boolean> => {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof window === 'undefined') return false
        let nextStream: MediaStream
        try {
            nextStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        } catch {
            return false
        }
        if (token !== startToken) {
            nextStream.getTracks().forEach((track) => track.stop())
            return false
        }
        const w = window as Window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
        const Ctor = w.AudioContext ?? w.webkitAudioContext
        if (!Ctor) {
            nextStream.getTracks().forEach((track) => track.stop())
            return false
        }
        try {
            stream = nextStream
            if (!ctx) {
                try {
                    ctx = new Ctor({ sampleRate: SR_HINT })
                } catch {
                    ctx = new Ctor()
                }
            }
            const resume = (ctx as AudioContext & { resume?: () => Promise<void> }).resume
            if (resume) await resume.call(ctx).catch(() => {})
            source = ctx.createMediaStreamSource(stream)
            analyser = ctx.createAnalyser()
            analyser.fftSize = WIN
            source.connect(analyser)
        } catch {
            try { source?.disconnect() } catch { /* ignore */ }
            source = null
            analyser = null
            try { stream?.getTracks().forEach((track) => track.stop()) } catch { /* ignore */ }
            stream = null
            return false
        }
        silentSince = -1
        lastLevel = 0
        timer = globalThis.setInterval(poll, POLL_MS)
        return true
    })()
    startPromise = run.finally(() => { startPromise = null })
    return startPromise
}

/** Stop monitoring, release the note and the mic. Safe when idle. */
export function stopVocalMonitor(): void {
    startToken += 1
    if (timer !== null) {
        globalThis.clearInterval(timer)
        timer = null
    }
    if (currentNote !== null) {
        releaseRadioNote(currentNote)
        currentNote = null
    }
    try { source?.disconnect() } catch { /* ignore */ }
    source = null
    try { stream?.getTracks().forEach((t) => t.stop()) } catch { /* ignore */ }
    stream = null
    analyser = null
    silentSince = -1
    lastLevel = 0
    onPitchCb = null
}

export function getVocalLevel(): number {
    return lastLevel
}

export function isVocalMonitoring(): boolean {
    return timer !== null
}
