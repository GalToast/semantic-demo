/**
 * @lib/search/cache.ts — In-memory result cache for semantic search.
 *
 * The dead IndexedDB-backed semantic-search payload cache half
 * (initSearchCache / getCachedSemanticSearchPayload /
 * storeSemanticSearchPayload / getSemanticSearchCacheDiagnostics IDB variant /
 * CacheEntry / SearchPayload / CacheDiagnosticsSnapshot) was removed: it had
 * no production callers. Only the live in-memory result cache below (used by
 * search-engine.ts) remains.
 */

import type { SearchResult } from '@lib/types/state'

// ── Cache Key ────────────────────────────────────────────────────────────────

/** Composite cache key: query hash + pagination offset. */
export interface SearchCacheKey {
    /** Lowercase trimmed query string. */
    query: string
    /** 0-based page index. */
    page: number
    /** Result offset (e.g. 0 for first page, 18 for second page). */
    offset: number
}

/** String form of the cache key for Map lookup. */
function cacheKeyToString(key: SearchCacheKey): string {
    // Bug #4 (bugsweep): use only effective offset in the cache key.
    // Different (page, offset) pairs that normalize to the same offset
    // produce the same API call, so the cache key must not distinguish them.
    return `${key.query}\0${key.offset}`
}

// ── Hash Helper ──────────────────────────────────────────────────────────────

/**
 * Simple DJB2 hash for generating lock-file-safe strings from query text.
 * Not cryptographic — just fast and collision-resistant enough for filenames.
 */
export function qHash(query: string): string {
    let hash = 5381
    for (let i = 0; i < query.length; i++) {
        hash = ((hash << 5) + hash + query.charCodeAt(i)) >>> 0
    }
    return hash.toString(36)
}

// ── Cache Entry ──────────────────────────────────────────────────────────────

interface SearchCacheEntry {
    results: SearchResult[]
    timestamp: number
    /** Provenance: live API results vs local fallback (index/mock) results. */
    source?: 'api' | 'fallback'
}

// ── Cache State ──────────────────────────────────────────────────────────────

/** Default TTL: 5 minutes. */
const DEFAULT_TTL_MS = 5 * 60 * 1000

/** Max entries before LRU eviction. */
const MAX_ENTRIES = 128

/** In-memory cache store. */
const _cache = new Map<string, SearchCacheEntry>()

/** In-flight deduplication: prevents concurrent cold-start fetches for the same key.
 *  Tracks promises by key so identical concurrent requests can share one fetch.
 *  If a caller provides an AbortSignal, it is recorded alongside the promise so
 *  later callers with a different signal do not accidentally share an abortable
 *  promise they did not create.
 */
const _pending = new Map<string, { promise: Promise<SearchResult[]>; signal?: AbortSignal }>()

let _ttlMs = DEFAULT_TTL_MS

// ── LRU Eviction ────────────────────────────────────────────────────────────

function evictIfNeeded(): void {
    if (_cache.size <= MAX_ENTRIES) return
    // Evict oldest entries first
    const entries = Array.from(_cache.entries())
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp)
    const toEvict = entries.slice(0, entries.length - MAX_ENTRIES)
    for (const [key] of toEvict) {
        _cache.delete(key)
    }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get cached search results for a given query + page + offset.
 * Returns null on miss or expiry.
 */
export function getCachedSearch(
    query: string,
    page: number,
    offset: number,
    opts?: { allowFallbackSource?: boolean }
): SearchResult[] | null {
    const key = cacheKeyToString({ query, page, offset })
    const entry = _cache.get(key)
    if (!entry) return null
    if (Date.now() - entry.timestamp > _ttlMs) {
        _cache.delete(key)
        return null
    }
    // W71-H2: fallback-sourced entries (local index / mock) are only valid
    // while the API is known-unreachable. Once the bypass flag clears, drop
    // them so the next search re-hits the live API instead of serving stale
    // fallback data cached during the outage window.
    if (entry.source === 'fallback' && !opts?.allowFallbackSource) {
        _cache.delete(key)
        return null
    }
    return entry.results
}

/**
 * Store search results in the cache.
 */
export function setCachedSearch(
    query: string,
    page: number,
    offset: number,
    results: SearchResult[],
    source: 'api' | 'fallback' = 'api'
): void {
    const key = cacheKeyToString({ query, page, offset })
    _cache.set(key, { results, timestamp: Date.now(), source })
    evictIfNeeded()
}

/**
 * Register an in-flight search promise for deduplication.
 * If a pending request already exists for this key AND the caller's AbortSignal
 * matches the original signal, returns the existing promise instead of creating
 * a duplicate fetch. Callers with different or new signals get their own promise
 * so their cancellation does not abort an unrelated in-flight request.
 *
 * @returns The existing promise if already in-flight with a compatible signal,
 *          or null if this caller should proceed with a fresh fetch.
 */
export function getPendingSearch(
    query: string,
    page: number,
    offset: number,
    signal?: AbortSignal
): Promise<SearchResult[]> | null {
    const key = cacheKeyToString({ query, page, offset })
    const entry = _pending.get(key)
    if (!entry) return null
    // Only share an in-flight promise when the caller owns the exact same
    // signal. This prevents a no-signal caller from accidentally piggybacking
    // on an abortable promise, and prevents callers with distinct controllers
    // from being serialized onto a single request they did not create.
    if (signal !== entry.signal) return null
    return entry.promise
}

/**
 * Store an in-flight search promise for deduplication.
 * The optional AbortSignal is recorded so later callers can detect whether
 * their cancellation would affect this in-flight request.
 */
export function setPendingSearch(
    query: string,
    page: number,
    offset: number,
    promise: Promise<SearchResult[]>,
    signal?: AbortSignal
): void {
    const key = cacheKeyToString({ query, page, offset })
    const entry = { promise, signal }
    _pending.set(key, entry)
    // Auto-remove when settled. Use then(success, failure) instead of finally()
    // so a rejected search promise does not create an unhandled child promise.
    void promise.then(
        () => {
            const current = _pending.get(key)
            if (current && current.promise === promise) {
                _pending.delete(key)
            }
        },
        () => {
            const current = _pending.get(key)
            if (current && current.promise === promise) {
                _pending.delete(key)
            }
        }
    )
}

/**
 * Clear the pending entry for a key (e.g. on error).
 */
export function clearPendingSearch(query: string, page: number, offset: number): void {
    const key = cacheKeyToString({ query, page, offset })
    _pending.delete(key)
}

/**
 * Clear the entire cache.
 */
export function clearSearchCache(): void {
    _cache.clear()
    _pending.clear()
}

/**
 * Get cache diagnostics (for debug overlay).
 */
export function getSearchCacheDiagnostics(): {
    size: number
    pending: number
    ttlMs: number
} {
    return {
        size: _cache.size,
        pending: _pending.size,
        ttlMs: _ttlMs
    }
}

/**
 * Override the TTL (for testing).
 */
export function setSearchCacheTTL(ms: number): void {
    _ttlMs = ms
}

// ── Advisory Lock (Node.js test environments) ────────────────────────────────

/**
 * Acquire an advisory filesystem lock for a search page.
 * Only functional in Node.js environments (not browser).
 * Uses mkdir-based lockfiles at `.cache/locks/<qHash>-<page>.lock`.
 *
 * @returns A release function, or a no-op release if lock unavailable.
 */
export async function acquireSearchLock(query: string, page: number, timeoutMs = 5000): Promise<() => void> {
    // Browser environment: no filesystem access, return no-op release
    if (typeof window !== 'undefined' || typeof process === 'undefined') {
        return () => {}
    }

    try {
        const importNodeModule = new Function('specifier', 'return import(specifier)') as <T>(
            specifier: string
        ) => Promise<T>
        const fs = await importNodeModule<typeof import('node:fs/promises')>('node:fs/promises')
        const path = await importNodeModule<typeof import('node:path')>('node:path')
        const lockDir = path.join('.cache', 'locks')
        const lockFile = path.join(lockDir, `${qHash(query)}-${page}.lock`)

        await fs.mkdir(lockDir, { recursive: true })

        const deadline = Date.now() + timeoutMs
        while (Date.now() < deadline) {
            try {
                // mkdir is atomic: only one caller succeeds
                await fs.mkdir(lockFile)
                return () => {
                    fs.rm(lockFile, { recursive: true }).catch(() => {})
                }
            } catch {
                // eslint-disable-next-line no-restricted-syntax -- one-shot timer scoped to local promise / effect cleanup
                await new Promise((r) => setTimeout(r, 50))
            }
        }
        // Timeout: yield gracefully, no error to caller
        return () => {}
    } catch {
        // FS not available: yield gracefully
        return () => {}
    }
}
