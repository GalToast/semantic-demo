/**
 * @lib/audio/jam-steer.ts — Fire-and-forget steering of the live MRT2 jam
 * server (localhost:8083) from the sonic style dial.
 *
 * The jam server's POST /style accepts { pole: 'beat' | 'best' } and maps it
 * to PCA coordinates over the 2035-style-map genre anchors (beat = centroid
 * of techno+disco2+metal; best = the pop neutral anchor), then sets the live
 * style tokens through the same pipeline as /surf. When no jam session is
 * running the request returns a discriminated outcome — playback dial
 * selection is unaffected when the server is offline or another session owns
 * the lease.
 *
 * Contract mirror: mrt2 tmp/jam_server.py STYLE_POLE_XY (commit 03cd572).
 */

import { JAM_HTTP_URL, resolveJamUrls } from '@lib/audio/jam-config'
import {
    jamLeaseHeld,
    jamOffline,
    jamOk,
    jamRejected,
    type JamResult
} from '@lib/audio/jam-result'

function baseUrl(): string {
    // Runtime host override (connection screen) wins; env default otherwise.
    try {
        return resolveJamUrls().http
    } catch {
        return JAM_HTTP_URL
    }
}

function styleUrl(): string {
    return `${baseUrl()}/style`
}

function bandMaskUrl(): string {
    return `${baseUrl()}/band_mask`
}

function styleInterpUrl(): string {
    return `${baseUrl()}/style_interp`
}

async function postJson(url: string, body: Record<string, unknown>): Promise<JamResult<boolean>> {
    let res: Response
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
    } catch {
        return jamOffline()
    }
    if (res.ok) return jamOk(true)
    if (res.status === 409) return jamLeaseHeld()
    return jamRejected(res.status)
}

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

/** Steer any live jam session toward `pole`. Resolves a discriminated
 * JamResult — ok when accepted, offline when unreachable, lease-held on
 * HTTP 409 (another session owns the stream), rejected otherwise.
 * Legacy boolean callers: check `result.kind === 'ok'`. */
export function steerJam(pole: JamPole): Promise<JamResult<boolean>> {
    return postJson(styleUrl(), { pole })
}

/** Set the live jam's band-selectable style mask (per-RVQ-level conditioning).
 * Accepts a named preset or explicit slots. The summit config is
 * RADIO_SUMMIT_SLOTS ({2,11}); 'production' remains the legacy all-axes
 * fallback (88-A / 0.671 / 1.5%). */
export function steerJamBandMask(preset: JamBandPreset): Promise<JamResult<boolean>> {
    return postJson(bandMaskUrl(), bandMaskBody(preset))
}

/** Set the live jam's style mask to explicit per-RVQ-level slots (e.g. the
 * {2,11} summit). Same endpoint as steerJamBandMask with the slots field. */

/** Measured safe route for the continuous-morph whine zone.
 *
 * The fine map in `C:\\tmp\\style_interp\\pothole_scores.json` measured
 * t=.75 at 97/95 (v10/v7) with 12.3% whine, while t=.78 fell to 83/71 with
 * 20.8% whine. Keep the route explicit so the client and server can share
 * Measured 2026-09-10 (12-point fine map, ear_v10, deterministic):
 *   SAFE:   [0.60,0.66] (93-95 v10, whine 3-8%) · [0.72,0.74] (90-92, 8-9%)
 *   SUMMIT: 0.82 = 100/100-S, whine 9.7% (second perfect score, cf. cond11+L2)
 *   POISON: [0.68,0.70] (whine 16%) · [0.76,0.80] (whine 14-21%, 0.78 worst 20.8%)
 * clampMorphT snaps poison-zone slider positions to the nearest safe edge
 * and preserves access to the t=0.82 summit (the old blunt [0.74,0.82]→0.75
 * clamp blocked the summit — this map supersedes it; closes #224). */
export const MORPH_MEASURED_ZONES = Object.freeze({
    /** Contiguous safe ranges — pass through unchanged. */
    safe: Object.freeze([
        Object.freeze({ start: 0.6, end: 0.66 }),
        Object.freeze({ start: 0.72, end: 0.74 })
    ]),
    /** Poison ranges — snapped to the nearest safe edge. */
    poison: Object.freeze([
        Object.freeze({ start: 0.68, end: 0.70 }),
        Object.freeze({ start: 0.76, end: 0.8 })
    ]),
    /** t >= summitThreshold snaps to the 100/100-S summit. */
    summitT: 0.82,
    summitThreshold: 0.81,
    /** Fallback anchors for t below/above the measured span. */
    lowAnchor: 0.6,
    highAnchor: 0.82
} as const)

export function clampMorphT(t: number): number {
    const v = Math.max(0, Math.min(1, Number(t) || 0))
    const z = MORPH_MEASURED_ZONES
    if (v >= z.summitThreshold) return z.summitT
    for (const s of z.safe) if (v >= s.start && v <= s.end) return v
    for (const p of z.poison) {
        if (v >= p.start && v <= p.end) {
            const mid = (p.start + p.end) / 2
            const edge = (v < mid ? p.start - 0.02 : p.end + 0.02)
            return Math.round(edge * 100) / 100
        }
    }
    return v < z.lowAnchor ? z.lowAnchor : z.highAnchor
}

/** Continuous style morph: t in [0,1] between the current style's table
 * rows and the +500 companion rows. Server interpolates the style table
 * per frame. SINGLE MORPH TRUTH: the measured safe/poison zones are
 * routed client-side via clampMorphT before sending, so slider positions in
 * poison zones land on measured-safe edges and t≥0.81 reaches the 100/100-S
 * summit at 0.82 (closes #224). What the slider shows always routes through
 * clampMorphT, so the displayed value equals the sent value. */
export function steerJamStyleInterp(t: number): Promise<JamResult<boolean>> {
    return postJson(styleInterpUrl(), { t: clampMorphT(t) })
}

export function steerJamBandSlots(slots: readonly number[]): Promise<JamResult<boolean>> {
    return postJson(bandMaskUrl(), bandMaskBody(slots))
}
