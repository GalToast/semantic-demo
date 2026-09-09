/**
 * @lib/audio/jam-config.ts — Endpoint configuration for the MRT2 jam server.
 *
 * Defaults target a same-box jam server (the semantic explorer and the jam
 * server currently ship together on one machine). Override via Vite env:
 *
 *   VITE_JAM_WS_URL   — WebSocket endpoint of the jam audio pump
 *                       (default: ws://127.0.0.1:8083/)
 *   VITE_JAM_HTTP_URL — HTTP base for /surf and /style steering
 *                       (default: http://127.0.0.1:8083)
 *
 * Trailing slashes are normalized so callers can append paths safely.
 */

function normalize(url: string): string {
    return url.replace(/\/+$/, '')
}

export const JAM_WS_URL: string = normalize(
    (import.meta.env.VITE_JAM_WS_URL as string | undefined) ?? 'ws://127.0.0.1:8083/'
)

export const JAM_HTTP_URL: string = normalize(
    (import.meta.env.VITE_JAM_HTTP_URL as string | undefined) ?? 'http://127.0.0.1:8083'
)
