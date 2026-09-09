/**
 * @lib/audio/jam-midi.ts — Web MIDI input for the live MRT2 jam.
 *
 * Design (deliberate): MIDI supplies pitch + timing; the ladder dial
 * supplies articulation state. MIDI velocity is NOT mapped onto pitch-slot
 * states — those are categorical learned states (silent/held/onset + 9
 * undocumented), not loudness. Conflating them would be a category error.
 * So: note-on voices the key at the CURRENT dial state, note-off (or
 * sustain-pedal-up) releases it.
 *
 * Wire contract: pressRadioNote / releaseRadioNote on the radio socket —
 * no new server messages. Safe no-ops when the radio is closed.
 *
 * Needs a MIDI-capable browser (Chrome/Edge desktop). No-MIDI and
 * permission-denied both resolve -1 — the dial works regardless.
 */

import { pressRadioNote, releaseRadioNote, midiMessageToNote } from '@lib/audio/jam-radio'

/** Keys currently down (for sustain-pedal deferral). */
const heldKeys = new Set<number>()
const deferredOff = new Set<number>()
let pedalDown = false
let getState: () => number = () => 4
let inputs: MIDIInput[] = []
let access: MIDIAccess | null = null

function clampState(s: number): number {
    if (!Number.isInteger(s)) return 4
    return Math.min(11, Math.max(0, s))
}

function controlChange(cc: number, value: number): void {
    if (cc !== 64) return
    const down = value >= 64
    if (pedalDown && !down) {
        pedalDown = false
        for (const note of [...deferredOff]) {
            deferredOff.delete(note)
            releaseRadioNote(note)
        }
    } else {
        pedalDown = down
    }
}

function onMidiMessage(ev: MIDIMessageEvent): void {
    // Single parser for the whole codebase (jam-radio.midiMessageToNote,
    // also used by enableJamMidi). State is read live per keypress so
    // moving the dial retunes subsequently-pressed keys; already-held keys
    // keep the state they arrived with. Sustain is layered here, which the
    // raw binder (enableJamMidi) does not do — that binder snapshots state
    // at bind time and has no stop; this module is the managed lifecycle
    // the dial drives. Only one binder should be active at a time.
    const msg = midiMessageToNote(ev.data ?? [], clampState(getState()))
    if (!msg) {
        // Non-note messages: only sustain (CC64) is handled.
        const data = ev.data
        if (data && data.length >= 3 && (data[0] & 0xf0) === 0xb0) controlChange(data[1], data[2])
        return
    }
    if (msg.type === 'note_on') {
        heldKeys.add(msg.note)
        deferredOff.delete(msg.note)
        pressRadioNote(msg.note, msg.state ?? clampState(getState()))
    } else {
        heldKeys.delete(msg.note)
        if (pedalDown) {
            deferredOff.add(msg.note)
            return
        }
        releaseRadioNote(msg.note)
    }
}

/**
 * Attach all MIDI inputs. getStateFn supplies the live dial articulation
 * state per keypress (defaults to summit 4). Resolves the device count;
 * resolves -1 when MIDI is unavailable or denied. Repeat calls re-scan
 * inputs without duplicating handlers.
 */
export async function startMidiInput(getStateFn?: () => number): Promise<number> {
    if (getStateFn) getState = getStateFn
    if (typeof navigator === 'undefined') return -1
    const nav = navigator as Navigator & { requestMIDIAccess?: () => Promise<MIDIAccess> }
    if (typeof nav.requestMIDIAccess !== 'function') return -1
    try {
        access = access ?? (await nav.requestMIDIAccess())
    } catch {
        return -1
    }
    inputs = []
    access.inputs.forEach((input) => {
        input.onmidimessage = onMidiMessage
        inputs.push(input)
    })
    return inputs.length
}

/** Detach all inputs and release held keys. Safe when idle. */
export function stopMidiInput(): void {
    for (const input of inputs) {
        try {
            input.onmidimessage = null
        } catch {
            /* ignore */
        }
    }
    inputs = []
    for (const note of [...heldKeys]) releaseRadioNote(note)
    heldKeys.clear()
    deferredOff.clear()
    pedalDown = false
}

export function getMidiInputCount(): number {
    return inputs.length
}

/* ---- MIDI OUT bridge (radio -> sampler) ---- */

let outputs: MIDIOutput[] = []
let bridgeOn = false

/** List MIDI output ports by name. Empty when unavailable. */
export async function listMidiOutputs(): Promise<string[]> {
    if (typeof navigator === 'undefined') return []
    const nav = navigator as Navigator & { requestMIDIAccess?: () => Promise<MIDIAccess> }
    if (typeof nav.requestMIDIAccess !== 'function') return []
    try {
        access = access ?? (await nav.requestMIDIAccess())
    } catch {
        return []
    }
    const names: string[] = []
    access.outputs.forEach((o) => {
        names.push(o.name ?? o.id)
        outputs.push(o)
    })
    return names
}

function midiOut(): MIDIOutput | null {
    // Prefer a loopback/virtual port (app-to-app bridge); else first output.
    for (const o of outputs) {
        const n = (o.name ?? '').toLowerCase()
        if (n.includes('loop') || n.includes('virtual') || n.includes('midi 2.0')) return o
    }
    return outputs[0] ?? null
}

/** Mirror the radio chord to the MIDI out port at the dial state.
 * Call after connect and on every state change. Silent when unavailable. */
export function bridgeChordToMidi(notes: readonly { note: number; state: number }[]): void {
    if (!bridgeOn) return
    const out = midiOut()
    if (!out) return
    for (const n of notes) {
        try {
            // Velocity is presence-only (96): articulation lives in the
            // pitch-slot state, which the MIDI wire cannot carry — the
            // sampler voices with its own samples. No fake velocity map.
            out.send([0x90, n.note, 96])
        } catch {
            /* ignore */
        }
    }
}

/** Release all bridged notes. */
export function bridgeAllNotesOff(): void {
    const out = midiOut()
    if (!out) return
    for (let note = 0; note < 128; note++) {
        try {
            out.send([0x80, note, 0])
        } catch {
            /* ignore */
        }
    }
}

/** Enable the bridge (resolves false when no MIDI outputs exist). */
export async function startMidiBridge(): Promise<boolean> {
    const names = await listMidiOutputs()
    bridgeOn = names.length > 0
    return bridgeOn
}

export function stopMidiBridge(): void {
    bridgeAllNotesOff()
    bridgeOn = false
}

export function isMidiBridgeOn(): boolean {
    return bridgeOn
}
