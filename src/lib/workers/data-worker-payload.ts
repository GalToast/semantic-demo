/**
 * data-worker-payload.ts — Runtime payload validation for data-worker messages.
 *
 * Isolated from the worker so it is unit-testable without a Worker global.
 * (Farm audit 2026-08-14: worker previously trusted `payload as {...}` blind
 * casts and would feed any string into fetch() — open fetch proxy for
 * file:/data:/javascript: and malformed payloads threw mid-handler.)
 */

/** Only http(s) URLs are fetchable from the worker. */
export function isFetchableUrl(value: unknown): value is string {
    if (typeof value !== 'string' || value.length === 0) return false
    // Pure-regex protocol check — no dependency on a URL global (works in
    // workers, node, jsdom, and vitest without URL polyfills).
    return /^https?:\/\//i.test(value)
}

export interface LoadThreadsPayload {
    urls: string[]
    attemptConfigs: (string | AttemptConfig)[]
}

export interface AttemptConfig {
    cache?: string
}

/** LOAD_RECORDS / LOAD_LEAD_ENRICHMENT: requires an http(s) `url` string. */
export function requireRecordUrl(payload: unknown, label: string): string {
    const url = (payload as { url?: unknown } | null)?.url
    if (!isFetchableUrl(url)) {
        throw new Error(`Worker: ${label} requires an http(s) \`url\` string.`)
    }
    return url
}

/** LOAD_THREADS: requires an array of http(s) `urls` (attemptConfigs optional/normalized). */
export function requireThreadPayload(payload: unknown): LoadThreadsPayload {
    const p = (payload ?? {}) as { urls?: unknown; attemptConfigs?: unknown }
    if (!Array.isArray(p.urls) || p.urls.length === 0 || p.urls.some((u) => !isFetchableUrl(u))) {
        throw new Error('Worker: LOAD_THREADS requires a non-empty array of http(s) `urls`.')
    }
    const attemptConfigs: (string | AttemptConfig)[] = Array.isArray(p.attemptConfigs)
        ? p.attemptConfigs.map((c) => {
              if (typeof c === 'string') return c
              if (
                  c &&
                  typeof c === 'object' &&
                  (typeof (c as AttemptConfig).cache === 'string' || (c as AttemptConfig).cache === undefined)
              ) {
                  return c as AttemptConfig
              }
              throw new Error(
                  'Worker: LOAD_THREADS attemptConfigs entries must be cache strings or { cache? } objects.'
              )
          })
        : []
    return { urls: p.urls as string[], attemptConfigs }
}
