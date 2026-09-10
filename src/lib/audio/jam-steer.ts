/**
 * @lib/audio/jam-steer.ts — Fire-and-forget steering of the live MRT2 jam
 * server (localhost:8083) from the sonic style dial.
 *
 * The jam server's POST /style accepts { pole: 'beat' | 'best' } and maps it
 * to PCA coordinates over the 2035-style-map genre anchors (beat = centroid
 * of techno+disco2+metal; best = the pop neutral anchor), then sets the live
 * style tokens through the same pipeline as /surf. When no jam session is
 * running the request fails silently — playback dial selection is unaffected.
 *
 * Contract mirror: mrt2 tmp/jam_server.py STYLE_POLE_XY (commit 03cd572).
 */

import { JAM_HTTP_URL } from '@lib/audio/jam-config'

const JAM_STYLE_URL = `${JAM_HTTP_URL}/style`
const JAM_BAND_MASK_URL = `${JAM_HTTP_URL}/band_mask`

export type JamPole = 'beat' | 'best'
export type JamBandPreset =
    | 'melodic'
    | 'beat'
    | 'production'
    | 'clean_melodic'
    | 'harmonic'
    | 'spectral'
    | 'all'
    | 'none'

/** New-summit band slots: {2,11} at cond 11 (radio state 4) = 100/100-S with
 * whine 2.6% (vs L2-alone's 12.8%) and a more musical tempo (137 bpm).
 * Slot 11 is the non-interfering companion discovered in the whine scan;
 * slots 1 and 3 are poison (never include) — mrt2 tmp/WHINE_SCAN_RESULTS.md
 * and FINAL_SCAN_RESULTS.md. */
export const RADIO_SUMMIT_SLOTS: readonly number[] = [2, 11]

/** One-tap measured slot presets (mrt2 scan results, Sep 2026). Poison
 * slots 1 and 3 are never included. Applied with pitch state 4 (cond 11).
 * Pure data — JamView renders one chip per entry. */
export interface MeasuredSlotPreset {
    id: string
    label: string
    slots: readonly number[]
    blurb: string
}
export const MEASURED_SLOT_PRESETS: readonly MeasuredSlotPreset[] = [
    {
        id: 'summit',
        label: 'Summit {2,11}',
        slots: RADIO_SUMMIT_SLOTS,
        blurb: '100/100-S, whine 2.6% — the whine-clean summit'
    },
    {
        id: 'clean',
        label: 'Clean {2,7,11}',
        slots: [2, 7, 11],
        blurb: '93/89-A, whine 0.7% — cleanest tone'
    },
    {
        id: 'beat',
        label: 'Beat {2,11,9}',
        slots: [2, 11, 9],
        blurb: '82/70-B, beat 0.821 — strongest pulse'
    }
]

/** Build the /band_mask request body. Accepts a named preset or explicit
 * per-RVQ-level slots (server contract: {preset|slots}, commit 26bf210).
 * Exported pure for unit testing. */
export function bandMaskBody(presetOrSlots: JamBandPreset | readonly number[]): Record<string, unknown> {
    return Array.isArray(presetOrSlots) ? { slots: [...presetOrSlots] } : { preset: presetOrSlots }
}

/** Steer any live jam session toward `pole`. Resolves true when accepted. */
export function steerJam(pole: JamPole): Promise<boolean> {
    return fetch(JAM_STYLE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pole })
    })
        .then((r) => r.ok)
        .catch(() => false)
}

/** Set the live jam's band-selectable style mask (per-RVQ-level conditioning).
 * Accepts a named preset or explicit slots. The summit config is
 * RADIO_SUMMIT_SLOTS ({2,11}); 'production' remains the legacy all-axes
 * fallback (88-A / 0.671 / 1.5%). */
export function steerJamBandMask(preset: JamBandPreset): Promise<boolean> {
    return fetch(JAM_BAND_MASK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bandMaskBody(preset))
    })
        .then((r) => r.ok)
        .catch(() => false)
}

/** Set the live jam's style mask to explicit per-RVQ-level slots (e.g. the
 * {2,11} summit). Same endpoint as steerJamBandMask with the slots field. */

/** Clamp a continuous-morph t value into the safe range: [0,1], with the
 * poison zone [0.74,0.82] (whine spike, fine map a4ebf93) snapped down to
 * 0.72. Pure — unit tested. */
export function clampMorphT(t: number): number {
    const v = Math.max(0, Math.min(1, Number(t) || 0))
    return v >= 0.74 && v <= 0.82 ? 0.72 : v
}

/** Continuous style morph: t in [0,1] between the current style's table
 * rows and the +500 companion rows. Server interpolates the style table
 * per frame; the poison zone is clamped client-side before sending. */
export function steerJamStyleInterp(t: number): Promise<boolean> {
    return fetch(`${JAM_HTTP_URL}/style_interp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: clampMorphT(t) })
    })
        .then((r) => r.ok)
        .catch(() => false)
}

export function steerJamBandSlots(slots: readonly number[]): Promise<boolean> {
    return fetch(JAM_BAND_MASK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bandMaskBody(slots))
    })
        .then((r) => r.ok)
        .catch(() => false)
}
