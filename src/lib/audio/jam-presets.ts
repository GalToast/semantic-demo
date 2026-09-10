/**
 * @lib/audio/jam-presets.ts — Musician-language layer over lab measurements.
 *
 * The ear-scored summit data (state 4 + slots {2,11} = 100/100-S, whine
 * 2.6%) is real, but "Summit {2,11} — whine 2.6%" means nothing to a player.
 * These presets name sounds, not scores: Clean / Driving / Pulse. The lab
 * detail (states, slots, scores) rides along as structured data for the
 * Advanced disclosure — one source so wording never drifts between JamView
 * and SonicIdentity.
 */

import { RADIO_SUMMIT_SLOTS, type MeasuredSlotPreset } from '@lib/audio/jam-steer'
import { SUMMIT_STATE, type RadioBandMode } from '@lib/audio/jam-radio'

export interface MusicianPreset extends MeasuredSlotPreset {
    /** Player-facing name: "Clean", not "Summit {2,11}". */
    name: string
    /** One-line musical description, no scorer jargon. */
    musical: string
    state: number
    mode: RadioBandMode
}

export const MUSICIAN_PRESETS: readonly MusicianPreset[] = [
    {
        id: 'summit',
        label: 'Summit {2,11}',
        slots: RADIO_SUMMIT_SLOTS,
        blurb: '100/100-S, whine 2.6% — the whine-clean summit',
        name: 'Clean summit',
        musical: 'Open, ringing Am9 pad — the default voice.',
        state: SUMMIT_STATE,
        mode: 'tone'
    },
    {
        id: 'clean',
        label: 'Clean {2,7,11}',
        slots: [2, 7, 11],
        blurb: '93/89-A, whine 0.7% — cleanest tone',
        name: 'Glass',
        musical: 'Softest attack, glassy highs — for quiet rooms.',
        state: SUMMIT_STATE,
        mode: 'tone'
    },
    {
        id: 'beat',
        label: 'Beat {2,11,9}',
        slots: [2, 11, 9],
        blurb: '82/70-B, beat 0.821 — strongest pulse',
        name: 'Pulse',
        musical: 'Driving pulse, harder edge — for moving bodies.',
        state: SUMMIT_STATE,
        mode: 'beat'
    }
]

export function presetById(id: string): MusicianPreset | null {
    return MUSICIAN_PRESETS.find((p) => p.id === id) ?? null
}
