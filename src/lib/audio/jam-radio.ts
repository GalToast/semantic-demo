/**
 * @lib/audio/jam-radio.ts — Browser client for the live MRT2 jam server
 * (ws://127.0.0.1:8083/). Turns the ambient clip player into a genuinely
 * generative radio: the jam server runs a 25 fps steering loop against the
 * ONNX MRT2 stack, decodes tokens through the RVQ decoder sidecar, and
 * streams PCM to this client.
 *
 * Wire contract (mrt2 tmp/jam_server.py, commit 03cd572 era):
 *  - server -> client, JSON text frames:
 *      {type:'audio',  data:<base64 of int16 interleaved stereo>, rate:48000}
 *      {type:'metrics', frameMs, droppedFrames, bufferAvail, bufferCap}
 *  - client -> server, JSON text frames (browser masks automatically):
 *      {type:'note_on', note:N}  {type:'note_off', note:N}
 *      {type:'uiReady'}          {type:'param', index, value}
 *  - one live session at a time server-side; the newest connection wins.
 *
 * Playback strategy: each audio chunk becomes an AudioBufferSourceNode
 * scheduled at a monotonically advancing `nextStart` timestamp, so bursty
 * WS arrival still yields gapless output. A starving stream (nextStart fell
 * behind wall clock) resynchronizes to now + a small lead.
 *
 * Endpoint: configurable via VITE_JAM_WS_URL (see jam-config.ts).
 */

import { JAM_WS_URL } from '@lib/audio/jam-config'
import { RADIO_SUMMIT_SLOTS, steerJamBandSlots } from '@lib/audio/jam-steer'

/** Radio's held notes: a soft A-minor add9 voicing (MIDI indices into the
 * model's 128-pitch vector) so the stream plays unattended.
 *
 * Each note carries a `state` 0..11 into the encoder's pitch embedding
 * (encoder.regular_embedding, [1536,256] = 128 slots x 12 trained states).
 * Google's sampler emits only 3 (silence/held/onset); states 3..11 are
 * trained but undocumented, and the live radio has been driving only 2 of
 * them. `state` is the dial that exposes the other 9.
 *
 * Wire contract (mrt2 tmp/jam_server.py steering_loop:131): the server
 * builds pr = zeros(128) then pr[note] = state, so any value 0..11 is
 * accepted as-is — no graph change, no re-export, no LM restart. */
const RADIO_HELD_NOTES: { note: number; state: number }[] = [
    { note: 45, state: 4 },
    { note: 52, state: 4 },
    { note: 57, state: 4 },
    { note: 64, state: 4 },
    { note: 71, state: 4 }
]

/** Default note state: 4 = the summit configuration (cond 11 + L2 band =
 * 100/100-S, first perfect score — see mrt2 tmp/SUMMIT_RESULTS.md).
 * State 1 (held) is Google's documented default; state 4 is the
 * super-additive discovery from the pitch ladder × band style cross-sweep. */
const DEFAULT_NOTE_STATE = 4

export type RadioState = 'idle' | 'connecting' | 'live'

export interface RadioMetrics {
    frameMs: number
    droppedFrames: number
    bufferAvail: number
    bufferCap: number
}

/** Note-on message payload. `state` is optional for backward compat with
 * clients that only send `{type:'note_on', note:N}` — it defaults to the
 * documented held state. */
export interface NoteMessage {
    type: 'note_on' | 'note_off'
    note: number
    state?: number
}

/** Decode a base64 PCM chunk into interleaved float32 [-1, 1). */
export function decodePcmChunk(b64: string): Float32Array {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const i16 = new Int16Array(bytes.buffer)
    const f32 = new Float32Array(i16.length)
    for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768
    return f32
}

/** De-interleave a stereo chunk into an AudioBuffer scheduled for playback. */
export function chunkToAudioBuffer(ctx: AudioContext, interleaved: Float32Array): AudioBuffer {
    const frames = Math.floor(interleaved.length / 2)
    const buf = ctx.createBuffer(2, frames, 48000)
    const l = buf.getChannelData(0)
    const r = buf.getChannelData(1)
    for (let i = 0; i < frames; i++) {
        l[i] = interleaved[i * 2]
        r[i] = interleaved[i * 2 + 1]
    }
    return buf
}

interface JamRadioEvents {
    onState?: (state: RadioState) => void
    onMetrics?: (m: RadioMetrics) => void
    onProgStatus?: (s: RadioProgStatus) => void
}

/** Progression engine status, as reported by the jam server's prog_status
 * reply (see prog_engine.status()). prog_learned replies carry notes. */
export interface RadioProgStatus {
    type: string
    running?: boolean
    slots?: number
    idx?: number
    frame?: number
    bpm?: number
    notes?: number[]
    error?: string
}

/** Minimal scheduling state so chunk gaps never double-schedule. */
let ws: WebSocket | null = null
let ctx: AudioContext | null = null
let nextStart = 0
let state: RadioState = 'idle'
let events: JamRadioEvents = {}

function setState(s: RadioState): void {
    state = s
    events.onState?.(s)
}

export function getRadioState(): RadioState {
    return state
}

function send(msg: Record<string, unknown>): void {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

/**
 * Connect to the jam server and start playing the live stream. Holds a soft
 * chord so the radio plays unattended. Resolves when the socket is open.
 * No-op (resolves false) when already live or WebSocket is unavailable.
 */
export function startJamRadio(evs: JamRadioEvents = {}): Promise<boolean> {
    return startJamRadioAt(evs, RADIO_HELD_NOTES)
}

/** Connect and hold an explicit note set. Used by the dial to drive a
 * specific pitch-slot state through the live jam. */
export function startJamRadioAt(evs: JamRadioEvents, notes: readonly NoteMessage[]): Promise<boolean> {
    events = evs
    if (state !== 'idle') return Promise.resolve(false)
    if (typeof WebSocket === 'undefined') return Promise.resolve(false)

    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
    const Ctor = w.AudioContext ?? w.webkitAudioContext
    if (!Ctor) return Promise.resolve(false)
    ctx = ctx ?? new Ctor()
    nextStart = 0
    heldNotes = notes
    setState('connecting')

    return new Promise<boolean>((resolve) => {
        let settled = false
        try {
            ws = new WebSocket(JAM_WS_URL)
        } catch {
            setState('idle')
            resolve(false)
            return
        }
        const fail = (): void => {
            if (!settled) {
                settled = true
                setState('idle')
                resolve(false)
            }
        }
        ws.onopen = () => {
            if (settled) return
            settled = true
            setState('live')
            send({ type: 'uiReady' })
            // Activate the summit band mask alongside the pitch state.
            // Slots {2,11} at cond 11 = 100/100-S with whine 2.6% and
            // tempo 137 — the whine-clean summit (mrt2 tmp/WHINE_SCAN_RESULTS.md),
            // superseding the original L2-only melodic preset (whine 12.8%).
            void steerJamBandSlots(RADIO_SUMMIT_SLOTS)
            bandMode = 'tone'
            for (const n of heldNotes) send({ type: 'note_on', note: n.note, state: n.state })
            resolve(true)
        }
        ws.onerror = fail
        ws.onclose = fail
        ws.onmessage = (ev) => {
            try {
                const msg = JSON.parse(ev.data as string) as Record<string, unknown>
                if (msg.type === 'audio' && typeof msg.data === 'string' && ctx) {
                    playChunk(ctx, msg.data)
                } else if (msg.type === 'metrics') {
                    events.onMetrics?.(msg as unknown as RadioMetrics)
                } else if (msg.type === 'prog_status' || msg.type === 'prog_learned') {
                    events.onProgStatus?.(msg as unknown as RadioProgStatus)
                }
            } catch {
                // malformed frame — ignore, keep the stream going
            }
        }
    })
}

/** Schedule one base64 chunk; called per audio message. */
function playChunk(audioCtx: AudioContext, b64: string): void {
    const interleaved = decodePcmChunk(b64)
    if (interleaved.length < 2) return
    const buf = chunkToAudioBuffer(audioCtx, interleaved)
    const now = audioCtx.currentTime
    // Resync when the schedule starved; otherwise chain seamlessly.
    nextStart = nextStart > now + 0.02 ? nextStart : now + 0.05
    const src = audioCtx.createBufferSource()
    src.buffer = buf
    src.connect(audioCtx.destination)
    src.start(nextStart)
    nextStart += buf.duration
}

/** Disconnect from the radio and release held notes. Safe when idle. */
let heldNotes: readonly NoteMessage[] = []

export function stopJamRadio(): void {
    for (const n of heldNotes) send({ type: 'note_off', note: n.note })
    try {
        ws?.close()
    } catch {
        // already closed — best effort
    }
    ws = null
    heldNotes = []
    setState('idle')
}

/** Drive the live jam's held notes to a single pitch-slot state.
 * Re-arms the chord at the new state without dropping the stream — the
 * server's steering loop picks up the new pr value on the next frame.
 * No-op when not live. */
export function setRadioNoteState(state: number): void {
    if (state < 0 || state > 11 || !Number.isInteger(state)) return
    heldNotes = heldNotes.map((n) => ({ ...n, state }))
    for (const n of heldNotes) send({ type: 'note_on', note: n.note, state })
}

/** Default progression: I–V–vi–IV in A minor at 100bpm, looped. The
 * summit was measured on a static A-minor drone; this is the harmonic-
 * movement experiment — does the 100/S survive chord changes? */
export const DEFAULT_PROG_SPEC = 'Am 4 | F 4 | C 4 | G 4'
export const DEFAULT_PROG_BPM = 100

/** Load a chord progression into the jam's prog engine (does not start
 * playback). Resolves the server's slot table, or null when not live. */
export function setRadioProg(spec: string = DEFAULT_PROG_SPEC, bpm: number = DEFAULT_PROG_BPM): void {
    if (!spec.trim() || !Number.isFinite(bpm) || bpm <= 0) return
    send({ type: 'prog_set', spec, bpm, loop: true })
}

/** Start the loaded progression. The engine presses/releases notes into
 * the shared held/onset sets at 25fps; downbeats hit onset state then
 * settle to each note's amp state (summit notes keep state 4). */
export function playRadioProg(): void {
    send({ type: 'prog_play' })
}

/** Stop the progression and release its notes. The radio chord stays. */
export function stopRadioProg(): void {
    send({ type: 'prog_stop' })
}

/** Ask the server for prog status (replied as a prog_status message). */
export function requestRadioProgStatus(): void {
    send({ type: 'prog_status' })
}

/** Band preset menu (whine-scan Pareto): 'tone' = slots {2,11}, 100/100-S
 * with whine 2.6% (clean tone, weaker beat 0.397); 'beat' = slots {2},
 * 100/100-S with beat 0.586 (stronger pulse, whine 12.8%). Same perfect
 * score, different surface — keyed by what the listener needs. */
export type RadioBandMode = 'tone' | 'beat'
export const RADIO_BAND_SLOTS: Record<RadioBandMode, readonly number[]> = {
    tone: RADIO_SUMMIT_SLOTS,
    beat: [2]
}
let bandMode: RadioBandMode = 'tone'
export function getRadioBandMode(): RadioBandMode {
    return bandMode
}
/** Switch the live jam's band preset. Fire-and-forget; the dial applies it
 * immediately server-side without dropping the stream. */
export function setRadioBandMode(mode: RadioBandMode): void {
    bandMode = mode
    void steerJamBandSlots(RADIO_BAND_SLOTS[mode])
}
