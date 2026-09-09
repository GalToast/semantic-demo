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
export type JamBandPreset = 'melodic' | 'beat' | 'production' | 'clean_melodic' | 'harmonic' | 'spectral' | 'all' | 'none'

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
 * Presets from BAND_SELECTABLE_STYLE.md; 'production' is the only config with
 * quality (88-A), rhythm (0.671), AND spectral cleanliness (1.5%) together. */
export function steerJamBandMask(preset: JamBandPreset): Promise<boolean> {
    return fetch(JAM_BAND_MASK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset })
    })
        .then((r) => r.ok)
        .catch(() => false)
}
