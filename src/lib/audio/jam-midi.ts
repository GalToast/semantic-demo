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

import { pressRadioNote, releaseRadioNote } from '@lib/audio/jam-radio'

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

function noteOn(note: number): void {
    heldKeys.add(note)
    deferredOff.delete(note)
    pressRadioNote(note, clampState(getState()))
}

function noteOff(note: number): void {
    heldKeys.delete(note)
    if (pedalDown) {
        deferredOff.add(note)
        return
    }
    releaseRadioNote(note)
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
    const data = ev.data
    if (!data || data.length < 2) return
    const status = data[0] & 0xf0
    if (status === 0x90 && data.length >= 3 && data[2] > 0) noteOn(data[1])
    else if (status === 0x80 || (status === 0x90 && data.length >= 3 && data[2] === 0)) noteOff(data[1])
    else if (status === 0xb0 && data.length >= 3) controlChange(data[1], data[2])
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
