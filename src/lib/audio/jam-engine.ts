/**
 * @lib/audio/jam-engine.ts — One shared AudioContext + master chain.
 *
 * Replaces the 4-context sprawl (jam-radio, sonic-identity, jam-vocal, and
 * audio-scape each owned one): browsers cap ~6 contexts, so explorer + jam
 * + vocal + scape on mobile Safari was one context from silence. The chain
 * is `sources -> masterGain -> limiter(DynamicsCompressor) -> destination`,
 * so the +200% volume stage can push without harsh digital clipping.
 *
 * Volume is stored linear 0..2 (persisted rig setting) but applied as dB:
 * gain = v^2 (equal-power-ish taper, finer control at the quiet end where
 * live fragments live) through a fast-attack compressor. Headless / mocked
 * contexts degrade to a direct connection — never throw.
 */

let sharedCtx: AudioContext | null = null
let masterGain: GainNode | null = null
let limiter: DynamicsCompressorNode | null = null
let linearVolume = 1
let recStream: MediaStreamAudioDestinationNode | null = null
/** AnalyserNode tapped off the master chain for waveform / meter readout.
 * Null until the chain is built. JamView uses it for the live meter and
 * any future waveform visualizer without owning a second context. */
let analyser: AnalyserNode | null = null

function ctor(): typeof AudioContext | null {
    try {
        if (typeof window === 'undefined') return null
        const w = window as Window & {
            AudioContext?: typeof AudioContext
            webkitAudioContext?: typeof AudioContext
        }
        return w.AudioContext ?? w.webkitAudioContext ?? null
    } catch {
        return null
    }
}

/** The shared context, creating it on first use. Null when unavailable. */
export function sharedAudioContext(): AudioContext | null {
    if (sharedCtx) return sharedCtx
    const Ctor = ctor()
    if (!Ctor) return null
    try {
        sharedCtx = new Ctor()
    } catch {
        sharedCtx = null
    }
    return sharedCtx
}

/** Forget the shared context (tests, teardown). Does not close it. */
export function resetSharedAudioForTest(): void {
    sharedCtx = null
    masterGain = null
    limiter = null
    analyser = null
    recStream = null
}

/** Read-only access to the master analyser for waveform / meter surfaces.
 * Returns null when no real context is built (headless / mocked). */
export function getMasterAnalyser(): AnalyserNode | null {
    return analyser
}

/** Linear 0..2 -> gain. v^2 taper: 0.5->0.25 (-12dB), 1->1, 2->4 (+12dB
 * into the limiter, not into clipping). Pure — unit tested. */
export function volumeToGain(v: number): number {
    const c = Math.min(2, Math.max(0, Number(v) || 0))
    return c * c
}

/** Apply a linear 0..2 volume to the shared chain (and remember it). */
export function setSharedVolume(v: number): number {
    let c = Math.min(2, Math.max(0, Number(v) || 0))
    if (Number.isNaN(c)) c = 0
    linearVolume = c
    try {
        if (masterGain) masterGain.gain.value = volumeToGain(linearVolume)
    } catch {
        // headless — value still applies when the stage is built
    }
    return linearVolume
}

export function getSharedVolume(): number {
    return linearVolume
}

function buildChain(audioCtx: AudioContext): GainNode | null {
    try {
        if (typeof audioCtx.createGain !== 'function') return null
        masterGain = audioCtx.createGain()
        masterGain.gain.value = volumeToGain(linearVolume)
        if (typeof audioCtx.createDynamicsCompressor === 'function') {
            limiter = audioCtx.createDynamicsCompressor()
            limiter.threshold.value = -12
            limiter.knee.value = 20
            limiter.ratio.value = 12
            limiter.attack.value = 0.002
            limiter.release.value = 0.12
            masterGain.connect(limiter)
            limiter.connect(audioCtx.destination)
        } else {
            masterGain.connect(audioCtx.destination)
        }
        // Tap an analyser off the master chain so the meter / waveform
        // visualizer reads the ACTUAL output, not a pre-gain guess. It is
        // a pass-through node — it does not alter the signal path.
        if (typeof audioCtx.createAnalyser === 'function') {
            try {
                analyser = audioCtx.createAnalyser()
                analyser.fftSize = 2048
                analyser.smoothingTimeConstant = 0.8
                masterGain.connect(analyser)
            } catch {
                analyser = null
            }
        }
        return masterGain
    } catch {
        masterGain = null
        limiter = null
        analyser = null
        return null
    }
}

function attachRecorderTap(): void {
    try {
        if (masterGain && recStream) {
            try {
                masterGain.disconnect(recStream)
            } catch {
                // not connected yet — ignore
            }
            masterGain.connect(recStream)
        }
    } catch {
        // best-effort — never break playback
    }
}

/**
 * Master gain stage for a source on the shared context. Builds the
 * gain->limiter chain lazily; null means "connect direct" (headless /
 * mocked contexts). Re-taps the recorder on every build so a reconnect
 * never orphans the take.
 */
export function masterStageFor(audioCtx: AudioContext): GainNode | null {
    try {
        if (audioCtx !== sharedCtx) {
            const g = audioCtx.createGain?.()
            if (!g) return null
            g.gain.value = volumeToGain(linearVolume)
            try {
                g.connect(audioCtx.destination)
            } catch {
                // headless without destination — stage still sets gain
            }
            return g
        }
    } catch {
        return null
    }
    if (masterGain) {
        try {
            masterGain.gain.value = volumeToGain(linearVolume)
        } catch {
            // ignore — value applies on next build
        }
        return masterGain
    }
    const built = buildChain(audioCtx)
    if (built) attachRecorderTap()
    return built
}

/** Recorder tap hangs off master gain so takes match the monitor mix. */
export function recorderStreamFor(audioCtx: AudioContext): MediaStreamAudioDestinationNode | null {
    try {
        if (typeof audioCtx.createMediaStreamDestination !== 'function') return null
        if (!recStream) {
            recStream = audioCtx.createMediaStreamDestination()
            attachRecorderTap()
        }
        return recStream
    } catch {
        return null
    }
}

export function detachRecorderTap(): void {
    try {
        if (masterGain && recStream) masterGain.disconnect(recStream)
    } catch {
        // already torn down — ignore
    }
}
