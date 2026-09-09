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

import { JAM_WS_URL, JAM_HTTP_URL } from '@lib/audio/jam-config'
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
export interface RadioHeldNote {
    note: number
    state: number
}

const RADIO_HELD_NOTES: RadioHeldNote[] = [
    { note: 45, state: 4 },
    { note: 52, state: 4 },
    { note: 57, state: 4 },
    { note: 64, state: 4 },
    { note: 71, state: 4 }
]

/** Human labels for the 12 pitch-slot states. Single source for every
 * dial surface (SonicIdentity, JamView) so wording never drifts. */
export const STATE_LABELS: Record<number, string> = {
    0: 'silent',
    1: 'held',
    2: 'onset',
    3: 'free ★ documented',
    4: 'summit ★ 100/S',
    5: 'ghost',
    6: 'tremolo',
    7: 'roll',
    8: 'ping',
    9: 'swell',
    10: 'ladder 95/S',
    11: 'flare'
}

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
    for (let i = 0; i < i16.length; i++) f32[i] = (i16[i] ?? 0) / 32768
    return f32
}

/** Parse a raw Web MIDI message into a jam note message.
 * 0x9n = note-on (velocity 0 counts as off), 0x8n = note-off.
 * Returns null for non-note messages. Pure — unit tested. */
export function midiMessageToNote(data: ArrayLike<number>, state: number): NoteMessage | null {
    if (!data || data.length < 3) return null
    const statusByte = data[0]
    const note = data[1]
    const velocity = data[2]
    if (
        statusByte === undefined ||
        note === undefined ||
        velocity === undefined ||
        !Number.isInteger(statusByte) ||
        !Number.isInteger(note) ||
        !Number.isInteger(velocity) ||
        note < 0 ||
        note > 127
    )
        return null
    const status = statusByte & 0xf0
    if (status === 0x90 && velocity > 0) return { type: 'note_on', note, state }
    if (status === 0x80 || (status === 0x90 && velocity === 0)) return { type: 'note_off', note }
    return null
}

/** Wire the browser's Web MIDI inputs to the live jam: every physical MIDI
 * keyboard note becomes a jam note_on/note_off at `state` (summit default 4).
 * Resolves true when at least one MIDI input is bound. No-op where Web MIDI
 * is unavailable. */
export function enableJamMidi(state: number = DEFAULT_NOTE_STATE): Promise<boolean> {
    if (typeof window === 'undefined') return Promise.resolve(false)
    const nav = window as Window & {
        navigator?: { requestMIDIAccess?: (opts?: { sysex?: boolean }) => Promise<MIDIAccessLike> }
    }
    const req = nav.navigator?.requestMIDIAccess
    if (!req) return Promise.resolve(false)
    return req
        .call(nav.navigator, { sysex: false })
        .then((access) => {
            let bound = 0
            access.inputs.forEach((input) => {
                bound++
                input.onmidimessage = (ev: { data: Uint8Array }) => {
                    const note = midiMessageToNote(ev.data, state)
                    if (note) send(note)
                }
            })
            return bound > 0
        })
        .catch(() => false)
}

interface MIDIAccessLike {
    inputs: { forEach: (cb: (input: { onmidimessage: ((ev: { data: Uint8Array }) => void) | null }) => void) => void }
}

/** De-interleave a stereo chunk into an AudioBuffer scheduled for playback. */
export function chunkToAudioBuffer(ctx: AudioContext, interleaved: Float32Array): AudioBuffer {
    const frames = Math.floor(interleaved.length / 2)
    const buf = ctx.createBuffer(2, frames, 48000)
    const l = buf.getChannelData(0)
    const r = buf.getChannelData(1)
    for (let i = 0; i < frames; i++) {
        l[i] = interleaved[i * 2] ?? 0
        r[i] = interleaved[i * 2 + 1] ?? 0
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

/** Current radio chord with a concrete articulation state on every note. */
export function getRadioHeldNotes(): readonly RadioHeldNote[] {
    return heldNotes
}

/** Messages queued before the socket opens. startJamRadio sends
 * uiReady + the held chord on onopen; anything the UI fired first
 * (prog_set/play, a state change) is flushed right after so it is not
 * lost. Without this, pressing prog before the radio settles is a no-op. */
const pendingQueue: object[] = []

/** Test-only view of the send queue. Exported so unit tests can assert
 * ordering without touching the real WebSocket. */
export function __testPendingQueue(): readonly object[] {
    return pendingQueue
}

function send(msg: object): void {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const payload = JSON.stringify(msg)
        if (payload !== undefined) ws.send(payload)
    } else if (state === 'connecting') {
        pendingQueue.push(msg)
    }
}

function flushPending(): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    while (pendingQueue.length) {
        const msg = pendingQueue.shift()
        if (!msg) continue
        const payload = JSON.stringify(msg)
        if (payload !== undefined) ws.send(payload)
    }
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
export function startJamRadioAt(
    evs: JamRadioEvents,
    notes: readonly { note: number; state?: number }[]
): Promise<boolean> {
    events = evs
    if (state !== 'idle') return Promise.resolve(false)
    if (typeof WebSocket === 'undefined' || typeof window === 'undefined') return Promise.resolve(false)

    const w = window as Window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
    const Ctor = w.AudioContext ?? w.webkitAudioContext
    if (!Ctor) return Promise.resolve(false)
    pendingQueue.length = 0
    ctx = ctx ?? new Ctor()
    nextStart = 0
    heldNotes = notes.map((note) => ({ note: note.note, state: note.state ?? DEFAULT_NOTE_STATE }))
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
                pendingQueue.length = 0
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
            flushPending()
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
let heldNotes: readonly RadioHeldNote[] = []
/** Notes pressed via MIDI (outside the radio chord), for release on stop. */
const midiNotes = new Set<number>()

export function stopJamRadio(): void {
    for (const n of heldNotes) send({ type: 'note_off', note: n.note })
    for (const note of midiNotes) send({ type: 'note_off', note })
    midiNotes.clear()
    try {
        ws?.close()
    } catch {
        // already closed — best effort
    }
    ws = null
    heldNotes = []
    setState('idle')
    pendingQueue.length = 0
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

/** One slot of a parsed progression: the chord to voice for `frames` ticks.
 * Mirrors chord_sequencer.parse_prog / parse_chord (same DSL, same voicing
 * 48..72) so the client can schedule MIDI without asking the server. */
export interface ProgSlot {
    notes: number[]
    frames: number
}

const PROG_NOTES: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11
}
const PROG_QUALS: Record<string, number[]> = {
    maj: [0, 4, 7],
    '': [0, 4, 7],
    min: [0, 3, 7],
    m: [0, 3, 7],
    '7': [0, 4, 7, 10],
    maj7: [0, 4, 7, 11],
    m7: [0, 3, 7, 10],
    dim: [0, 3, 6],
    sus4: [0, 5, 7],
    sus2: [0, 2, 7]
}

/** Parse the progression DSL into slots. Same grammar as the server's
 * chord_sequencer so client-side scheduling matches server-side LM steering.
 * Returns null on a malformed spec (caller falls back to the server's
 * prog_status reply, which carries the parsed slots). */
export function parseProgressionSpec(spec: string, bpm: number): ProgSlot[] | null {
    if (!spec.trim() || !Number.isFinite(bpm) || bpm <= 0) return null
    const bars: { chord: string; beats: number | null }[][] = []
    for (const part of spec.split('|')) {
        const trimmed = part.trim()
        const entries = trimmed ? trimmed.split(/\s+/) : []
        const chords: { chord: string; beats: number | null }[] = []
        for (const entry of entries) {
            if (/^\d/.test(entry)) {
                const last = chords[chords.length - 1]
                if (last) last.beats = parseInt(entry, 10)
            } else if (entry) {
                chords.push({ chord: entry, beats: null })
            }
        }
        if (chords.length) bars.push(chords)
    }
    if (!bars.length) return null
    const slots: ProgSlot[] = []
    const framesPerBeat = Math.floor((25 * 60) / bpm)
    for (const bar of bars) {
        const barBeats = bar.every((c) => c.beats !== null) ? bar.reduce((s, c) => s + (c.beats ?? 0), 0) : 4
        for (const c of bar) {
            const beats = c.beats ?? Math.floor(barBeats / bar.length)
            slots.push({ notes: parseProgChord(c.chord), frames: Math.round(beats * framesPerBeat) })
        }
    }
    return slots.length ? slots : null
}

function parseProgChord(spec: string): number[] {
    const tok = spec.trim()
    const rootCh = tok[0]?.toUpperCase()
    const rootNote = rootCh === undefined ? undefined : PROG_NOTES[rootCh]
    if (rootCh === undefined || rootNote === undefined) throw new Error('bad root in ' + spec)
    // NOTE: the server's parser consumes the whole token while counting
    // accidentals, then parses the empty remainder. That means quality and
    // octave suffixes are ignored, while '#'/'b' still affect the root. It
    // is a server quirk, but the server's slots are authoritative: the MIDI
    // scheduler must voice the same pitches as the model heard.
    let i = 1
    let acc = 0
    while (i < tok.length) {
        if (tok[i] === '#') acc += 1
        else if (tok[i] === 'b') acc -= 1
        i += 1
    }
    let rest = tok.slice(i)
    let qual = 'maj'
    for (const q of Object.keys(PROG_QUALS).sort((a, b) => b.length - a.length)) {
        if (rest.startsWith(q)) {
            qual = q
            rest = rest.slice(q.length)
            break
        }
    }
    const msh = rest.match(/([+-]?\d+)$/)
    const shiftText = msh?.[1]
    const octShift = shiftText === undefined ? 0 : parseInt(shiftText, 10)
    const rootPc = rootNote + acc
    const low = 48 + octShift * 12
    const midi: number[] = []
    const intervals = PROG_QUALS[qual] ?? PROG_QUALS.maj
    if (!intervals) throw new Error('bad quality in ' + spec)
    for (const off of intervals) {
        let p = rootPc + off
        while (p < low) p += 12
        while (p > low + 24) p -= 12
        midi.push(p)
    }
    return [...new Set(midi)].sort((a, b) => a - b)
}

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

/** Press one note at a pitch-slot state (MIDI path). Tracked separately
 * from the radio chord so stop releases both. Range-checked 0..127;
 * state clamped 0..11. Safe no-op when the socket is closed. */
export function pressRadioNote(note: number, state: number): void {
    if (!Number.isInteger(note) || note < 0 || note > 127) return
    if (!Number.isInteger(state) || state < 0 || state > 11) return
    midiNotes.add(note)
    send({ type: 'note_on', note, state })
}

/** Release one MIDI-pressed note. Safe no-op when idle or unknown. */
export function releaseRadioNote(note: number): void {
    if (!midiNotes.delete(note)) return
    send({ type: 'note_off', note })
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

/** Send a text vibe to the live jam. mrt2-lane's /style_text endpoint
 * matches the text against the 16 named style-map anchors (token overlap)
 * and applies the nearest anchor's tokens via the existing surf_tokens_for
 * path — live-verified ('funky techno' matched the funky anchor, tokens
 * identical to the standalone probe). Fire-and-forget; the dial applies it
 * immediately server-side without dropping the stream. Returns the matched
 * anchor name, or null on a network/parse failure. */
export async function sendStyleText(text: string): Promise<string | null> {
    if (!text.trim()) return null
    let res: Response
    try {
        res = await fetch(`${JAM_HTTP_URL}/style_text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text.trim() })
        })
    } catch {
        return null
    }
    if (!res.ok) return null
    try {
        const j = await res.json()
        return typeof j.anchor === 'string' ? j.anchor : null
    } catch {
        return null
    }
}

/** Measured-good pitch×band pairs (ear-scored, same seed/frames family).
 * The style×pitch interaction REVERSES SIGN across cond steps (c11: L2 +12,
 * all12 −11; c12: L2 −9, all12 +4), so unlisted combos are genuinely
 * unknown — the dials must not present them as summit-grade. */
export interface MeasuredPair {
    state: number
    mode: RadioBandMode
    score: string
}
export const MEASURED_PAIRS: readonly MeasuredPair[] = [
    { state: 4, mode: 'tone', score: '100/100-S whine 2.6%' },
    { state: 4, mode: 'beat', score: '100/100-S beat 0.586' }
]
export function isMeasuredPair(state: number, mode: RadioBandMode): boolean {
    return MEASURED_PAIRS.some((p) => p.state === state && p.mode === mode)
}
export const SUMMIT_STATE = 4

/** Continuous style morph: t in [0,1] between the current style's table
 * rows and the +500-offset companion rows. mrt2-lane wired /style_interp
 * live (msg 1606): t=0.0/0.5/1.0 all ack, poison zone [0.74,0.82] snaps to
 * 0.72 (a whine spike in the fine map). Fire-and-forget; the LM applies it
 * per frame. Returns true when the LM ack'd (ack byte 8). */
export async function setStyleMorph(t: number): Promise<boolean> {
    const tt = Math.max(0, Math.min(1, t))
    let res: Response
    try {
        res = await fetch(`${JAM_HTTP_URL}/style_interp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ t: tt }),
        })
    } catch {
        return false
    }
    return res.ok
}
