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

export type JamPole = 'beat' | 'best'

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
