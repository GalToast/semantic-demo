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
 */

const JAM_WS_URL = 'ws://127.0.0.1:8083/'

/** Radio's held notes: a soft A-minor add9 voicing (MIDI indices into the
 * model's 128-pitch vector) so the stream plays unattended. */
const RADIO_HELD_NOTES = [45, 52, 57, 64, 71]

export type RadioState = 'idle' | 'connecting' | 'live'

export interface RadioMetrics {
    frameMs: number
    droppedFrames: number
    bufferAvail: number
    bufferCap: number
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
    events = evs
    if (state !== 'idle') return Promise.resolve(false)
    if (typeof WebSocket === 'undefined') return Promise.resolve(false)

    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
    const Ctor = w.AudioContext ?? w.webkitAudioContext
    if (!Ctor) return Promise.resolve(false)
    ctx = ctx ?? new Ctor()
    nextStart = 0
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
            for (const note of RADIO_HELD_NOTES) send({ type: 'note_on', note })
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
export function stopJamRadio(): void {
    for (const note of RADIO_HELD_NOTES) send({ type: 'note_off', note })
    try {
        ws?.close()
    } catch {
        // already closed — best effort
    }
    ws = null
    setState('idle')
}
