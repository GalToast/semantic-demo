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
    { note: 45, state: 1 },
    { note: 52, state: 1 },
    { note: 57, state: 1 },
    { note: 64, state: 1 },
    { note: 71, state: 1 }
]

/** Default note state: 1 = held, matching Google's documented sampler output. */
const DEFAULT_NOTE_STATE = 1

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
