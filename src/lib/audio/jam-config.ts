/**
 * @lib/audio/jam-config.ts — Endpoint configuration for the MRT2 jam server.
 *
 * Defaults target a same-box jam server (the semantic explorer and the jam
 * server currently ship together on one machine). Two override layers:
 *
 *   1. Vite env (build time): VITE_JAM_WS_URL / VITE_JAM_HTTP_URL
 *   2. Runtime host override (the JamView connection screen): persisted in
 *      localStorage as `sonic-jam-host-v1`, applied by resolveJamUrls().
 *      Lets a phone or a friend's laptop point at a jam server without a
 *      rebuild, and upgrades ws://→wss:// / http://→https:// automatically
 *      when the page itself is served over HTTPS (mixed-content would
 *      otherwise kill the socket silently).
 *
 * Trailing slashes are normalized so callers can append paths safely.
 */

function normalize(url: string): string {
    return url.replace(/\/+$/, '')
}

const DEFAULT_WS = 'ws://127.0.0.1:8083/'
const DEFAULT_HTTP = 'http://127.0.0.1:8083'
const HOST_KEY = 'sonic-jam-host-v1'
const RECENT_KEY = 'sonic-jam-recent-hosts-v1'
const MAX_RECENT = 5

export const JAM_WS_URL: string = normalize(
    (import.meta.env.VITE_JAM_WS_URL as string | undefined) ?? DEFAULT_WS
)

export const JAM_HTTP_URL: string = normalize(
    (import.meta.env.VITE_JAM_HTTP_URL as string | undefined) ?? DEFAULT_HTTP
)

export interface JamUrls {
    ws: string
    http: string
}

function readStorage(key: string): string | null {
    try {
        return localStorage.getItem(key)
    } catch {
        return null
    }
}

function writeStorage(key: string, value: string): void {
    try {
        localStorage.setItem(key, value)
    } catch {
        // private mode / no storage — the session default still works
    }
}

/** True for http(s)://host[:port][/path] or bare host[:port]. */
export function isPlausibleJamHost(raw: string): boolean {
    const v = raw.trim()
    if (!v) return false
    if (/\s/.test(v)) return false
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(v) ? v : `http://${v}`
    try {
        const u = new URL(withScheme)
        return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'ws:' || u.protocol === 'wss:'
    } catch {
        return false
    }
}

/**
 * Split a user-typed host into WS + HTTP urls. Accepts:
 *   127.0.0.1:8083 · http://box:8083 · ws://box:8083/ · https://box/jam
 * A bare host defaults to port 8083 and http/ws. When `securePage` is true
 * (page served over HTTPS) plain ws:/http: are upgraded to wss:/https: so
 * mixed-content policy doesn't silently kill the connection.
 */
export function jamUrlsFromHost(raw: string, securePage = false): JamUrls | null {
    const v = raw.trim()
    if (!isPlausibleJamHost(v)) return null
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(v) ? v : `http://${v}`
    let u: URL
    try {
        u = new URL(withScheme)
    } catch {
        return null
    }
    let httpProto = u.protocol === 'ws:' ? 'http:' : u.protocol === 'wss:' ? 'https:' : u.protocol
    let wsProto = httpProto === 'https:' ? 'wss:' : 'ws:'
    if (securePage) {
        if (httpProto === 'http:') httpProto = 'https:'
        if (wsProto === 'ws:') wsProto = 'wss:'
    }
    const host = u.hostname
    const port = u.port || '8083'
    const basePath = u.pathname && u.pathname !== '/' ? u.pathname.replace(/\/+$/, '') : ''
    const authority = `${host}:${port}`
    return {
        http: normalize(`${httpProto}//${authority}${basePath}`),
        ws: normalize(`${wsProto}//${authority}${basePath}/`)
    }
}

function envDefault(): JamUrls {
    return { ws: JAM_WS_URL, http: JAM_HTTP_URL }
}

/** Active endpoints: runtime host override wins, env default otherwise. */
export function resolveJamUrls(): JamUrls {
    const saved = readStorage(HOST_KEY)
    if (saved) {
        const secure = typeof location !== 'undefined' && location.protocol === 'https:'
        const parsed = jamUrlsFromHost(saved, secure)
        if (parsed) return parsed
    }
    return envDefault()
}

/** Remember a host string; returns the trimmed value, or null when invalid. */
export function saveJamHost(raw: string): string | null {
    const v = raw.trim()
    if (!isPlausibleJamHost(v)) return null
    writeStorage(HOST_KEY, v)
    rememberRecentHost(v)
    return v
}

export function getJamHost(): string | null {
    return readStorage(HOST_KEY)
}

export function clearJamHost(): void {
    try {
        localStorage.removeItem(HOST_KEY)
    } catch {
        // ignore
    }
}

export function getRecentJamHosts(): string[] {
    const raw = readStorage(RECENT_KEY)
    if (!raw) return []
    try {
        const arr = JSON.parse(raw) as unknown
        if (!Array.isArray(arr)) return []
        return arr.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENT)
    } catch {
        return []
    }
}

function rememberRecentHost(host: string): void {
    const list = [host, ...getRecentJamHosts().filter((h) => h !== host)].slice(0, MAX_RECENT)
    writeStorage(RECENT_KEY, JSON.stringify(list))
}

/** True when the runtime override (not just env) picks the endpoints. */
export function hasCustomJamHost(): boolean {
    return getJamHost() !== null
}

