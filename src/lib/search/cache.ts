/**
 * @lib/search/cache.ts — In-memory + IDB cache for semantic search payloads.
 *
 * Canonical home of the semantic search cache. The deprecated
 * `js/modules/semantic-search-cache.ts` shim and engine bridge were retired
 * after consumers moved to this module.
 */

import { appState } from '@lib/state/app.svelte'
import type { SemanticSearchCacheDiagnostics } from '@lib/state/state-types'
import { withStateMutation } from '@lib/state/with-state-mutation'
import { debugWarn } from '@lib/utils/debug'
import type { SearchResult } from '@lib/types/state'
import * as idb from '../utils/idb-service'

export const SEMANTIC_SEARCH_CACHE_MAX_ENTRIES: number = 8
export const SEMANTIC_SEARCH_CACHE_TTL_MS: number = 10 * 60 * 1000

export interface CacheEntry {
    storedAt: number
    lastAccessedAt: number
    payload: SearchPayload
}

export interface SearchPayload {
    ok: boolean
    results: Array<Record<string, unknown>>
    client_cache_hit?: boolean
    client_cache_age_ms?: number
    [key: string]: unknown
}

export interface CacheDiagnosticsSnapshot extends SemanticSearchCacheDiagnostics {
    size: number
    keys: string[]
    ttlMs: number
    maxEntries: number
}

export async function initSearchCache(): Promise<void> {
    if (!appState.searchState.semanticSearchResultCache) {
        withStateMutation(() => {
            appState.searchState.semanticSearchResultCache = new Map<string, CacheEntry>()
        })
    }
    if (!appState.searchState.semanticSearchCacheDiagnostics) {
        withStateMutation(() => {
            appState.searchState.semanticSearchCacheDiagnostics = {
                hits: 0,
                misses: 0,
                stores: 0,
                evictions: 0,
                lastKey: null,
                lastSource: null,
                lastAgeMs: null
            }
        })
    }
    try {
        const dbEntries = await idb.entries()
        const now = Date.now()
        for (const [key, entry] of dbEntries) {
            const cacheEntry = entry as CacheEntry
            if (!entry || typeof cacheEntry.storedAt !== 'number') continue
            const ageMs = now - cacheEntry.storedAt
            if (ageMs > SEMANTIC_SEARCH_CACHE_TTL_MS) {
                idb.remove(key as string).catch((err: unknown) => debugWarn('[idb-service] cleanup failed:', err))
            } else {
                appState.searchState.semanticSearchResultCache.set(key as string, cacheEntry)
            }
        }
    } catch (err) {
        debugWarn('[semantic-search-api-cache] Failed to initialize IDB cache:', err)
    }
}

function getSemanticSearchCacheKey(query: string, offset: number = 0): string {
    return (
        String(query || '')
            .trim()
            .normalize('NFC')
            .toLowerCase() +
        ':' +
        offset
    )
}

function cloneSemanticSearchPayload(payload: SearchPayload): SearchPayload {
    if (!payload || typeof payload !== 'object') return payload
    return {
        ...payload,
        results: Array.isArray(payload.results) ? [...payload.results] : payload.results
    }
}

function validatePayloadSchema(payload: SearchPayload): boolean {
    if (!payload?.ok || !Array.isArray(payload?.results)) return false
    for (const item of payload.results) {
        if (typeof item.lead_id === 'undefined' || typeof item.score === 'undefined') {
            return false
        }
    }
    return true
}

type CacheDiagnosticsPatch = Partial<Omit<SemanticSearchCacheDiagnostics, 'lastAgeMs'> & { lastAgeMs: number | null }>

function updateSemanticSearchCacheDiagnostics(patch: CacheDiagnosticsPatch): void {
    withStateMutation(() => {
        Object.assign(appState.searchState.semanticSearchCacheDiagnostics, patch)
    })
}

function markSemanticSearchCache(source: string, key: string, entry: CacheEntry | null = null): void {
    updateSemanticSearchCacheDiagnostics({
        lastSource: source,
        lastKey: key || null,
        lastAgeMs: entry ? Math.max(0, Math.round(Date.now() - entry.storedAt)) : null
    })
}

export function getCachedSemanticSearchPayload(query: string, offset: number = 0): SearchPayload | null {
    const key = getSemanticSearchCacheKey(query, offset)
    if (!key) return null

    const cache = appState.searchState.semanticSearchResultCache
    const entry = cache.get(key)
    if (!entry) {
        updateSemanticSearchCacheDiagnostics({ misses: appState.searchState.semanticSearchCacheDiagnostics.misses + 1 })
        markSemanticSearchCache('miss', key)
        return null
    }

    const now = Date.now()
    const ageMs = now - (entry as CacheEntry).storedAt
    if (ageMs > SEMANTIC_SEARCH_CACHE_TTL_MS) {
        cache.delete(key)
        idb.remove(key as string).catch((err: unknown) => debugWarn('[idb-service] eviction failed:', err))

        const diagnostics = appState.searchState.semanticSearchCacheDiagnostics
        updateSemanticSearchCacheDiagnostics({
            evictions: diagnostics.evictions + 1,
            misses: diagnostics.misses + 1
        })
        markSemanticSearchCache('expired', key, entry as CacheEntry)
        return null
    }

    // lastAccessedAt is an internal cache field; mutation here does not affect Svelte 5 reactivity.
    ;(entry as CacheEntry).lastAccessedAt = now
    idb.set(key as string, entry as CacheEntry).catch((err: unknown) =>
        debugWarn('[idb-service] access update failed:', err)
    )

    updateSemanticSearchCacheDiagnostics({
        hits: appState.searchState.semanticSearchCacheDiagnostics.hits + 1
    })
    markSemanticSearchCache('hit', key, entry as CacheEntry)

    const payload = cloneSemanticSearchPayload((entry as CacheEntry).payload)
    if (payload && typeof payload === 'object') {
        payload.client_cache_hit = true
        payload.client_cache_age_ms = Math.max(0, Math.round(ageMs))
    }
    return payload
}

export function storeSemanticSearchPayload(query: string, payload: SearchPayload, offset: number = 0): void {
    const key = getSemanticSearchCacheKey(query, offset)
    if (!key || !payload?.ok || !Array.isArray(payload?.results)) return
    if (!validatePayloadSchema(payload)) {
        debugWarn('[semantic-search-api-cache] Payload schema validation failed, treating as cache miss')
        return
    }

    const now = Date.now()
    const entry: CacheEntry = {
        storedAt: now,
        lastAccessedAt: now,
        payload: cloneSemanticSearchPayload(payload)
    }

    appState.searchState.semanticSearchResultCache.set(key, entry)
    idb.set(key, entry).catch((err: unknown) => debugWarn('[idb-service] store failed:', err))

    updateSemanticSearchCacheDiagnostics({
        stores: appState.searchState.semanticSearchCacheDiagnostics.stores + 1
    })
    markSemanticSearchCache('store', key)

    const cache = appState.searchState.semanticSearchResultCache
    while (cache.size > SEMANTIC_SEARCH_CACHE_MAX_ENTRIES) {
        for (const [k, e] of cache.entries()) {
            const ce = e as CacheEntry
            if (e && now - ce.storedAt > SEMANTIC_SEARCH_CACHE_TTL_MS) {
                cache.delete(k)
                idb.remove(k as string).catch((err: unknown) => debugWarn('[idb-service] eviction failed:', err))
                updateSemanticSearchCacheDiagnostics({
                    evictions: appState.searchState.semanticSearchCacheDiagnostics.evictions + 1
                })
            }
        }
        if (cache.size > SEMANTIC_SEARCH_CACHE_MAX_ENTRIES) {
            let oldestKey: string | null = null
            let oldestTime = Infinity
            for (const [k, e] of cache.entries()) {
                const ce = e as CacheEntry
                if (e && Number.isFinite(ce.lastAccessedAt) && ce.lastAccessedAt < oldestTime) {
                    oldestTime = ce.lastAccessedAt
                    oldestKey = k
                }
            }
            if (!oldestKey) break
            cache.delete(oldestKey)
            idb.remove(oldestKey as string).catch((err: unknown) => debugWarn('[idb-service] eviction failed:', err))
            updateSemanticSearchCacheDiagnostics({
                evictions: appState.searchState.semanticSearchCacheDiagnostics.evictions + 1
            })
        }
    }
}

export function getSemanticSearchCacheDiagnostics(): CacheDiagnosticsSnapshot {
    const cache = appState.searchState.semanticSearchResultCache
    return {
        ...appState.searchState.semanticSearchCacheDiagnostics,
        size: cache?.size || 0,
        keys: cache ? Array.from(cache.keys()) : [],
        ttlMs: SEMANTIC_SEARCH_CACHE_TTL_MS,
        maxEntries: SEMANTIC_SEARCH_CACHE_MAX_ENTRIES
    }
}

// ── Cache Key ────────────────────────────────────────────────────────────────

/** Composite cache key: query hash + pagination offset. */
export interface SearchCacheKey {
  /** Lowercase trimmed query string. */
  query: string;
  /** 0-based page index. */
  page: number;
  /** Result offset (e.g. 0 for first page, 18 for second page). */
  offset: number;
}

/** String form of the cache key for Map lookup. */
function cacheKeyToString(key: SearchCacheKey): string {
  return `${key.query}\0${key.page}\0${key.offset}`;
}

// ── Hash Helper ──────────────────────────────────────────────────────────────

/**
 * Simple DJB2 hash for generating lock-file-safe strings from query text.
 * Not cryptographic — just fast and collision-resistant enough for filenames.
 */
export function qHash(query: string): string {
  let hash = 5381;
  for (let i = 0; i < query.length; i++) {
    hash = ((hash << 5) + hash + query.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

// ── Cache Entry ──────────────────────────────────────────────────────────────

interface SearchCacheEntry {
  results: SearchResult[];
  timestamp: number;
}

// ── Cache State ──────────────────────────────────────────────────────────────

/** Default TTL: 5 minutes. */
const DEFAULT_TTL_MS = 5 * 60 * 1000;

/** Max entries before LRU eviction. */
const MAX_ENTRIES = 128;

/** In-memory cache store. */
const _cache = new Map<string, SearchCacheEntry>();

/** In-flight deduplication: prevents concurrent cold-start fetches for the same key. */
const _pending = new Map<string, Promise<SearchResult[]>>();

let _ttlMs = DEFAULT_TTL_MS;

// ── LRU Eviction ────────────────────────────────────────────────────────────

function evictIfNeeded(): void {
  if (_cache.size <= MAX_ENTRIES) return;
  // Evict oldest entries first
  const entries = Array.from(_cache.entries());
  entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
  const toEvict = entries.slice(0, entries.length - MAX_ENTRIES);
  for (const [key] of toEvict) {
    _cache.delete(key);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get cached search results for a given query + page + offset.
 * Returns null on miss or expiry.
 */
export function getCachedSearch(query: string, page: number, offset: number): SearchResult[] | null {
  const key = cacheKeyToString({ query, page, offset });
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > _ttlMs) {
    _cache.delete(key);
    return null;
  }
  return entry.results;
}

/**
 * Store search results in the cache.
 */
export function setCachedSearch(
  query: string,
  page: number,
  offset: number,
  results: SearchResult[]
): void {
  const key = cacheKeyToString({ query, page, offset });
  _cache.set(key, { results, timestamp: Date.now() });
  evictIfNeeded();
}

/**
 * Register an in-flight search promise for deduplication.
 * If a pending request already exists for this key, returns the existing
 * promise instead of creating a duplicate fetch.
 *
 * @returns The existing promise if already in-flight, or null if this caller
 *          should proceed with a fresh fetch.
 */
export function getPendingSearch(query: string, page: number, offset: number): Promise<SearchResult[]> | null {
  const key = cacheKeyToString({ query, page, offset });
  return _pending.get(key) ?? null;
}

/**
 * Store an in-flight search promise for deduplication.
 */
export function setPendingSearch(
  query: string,
  page: number,
  offset: number,
  promise: Promise<SearchResult[]>
): void {
  const key = cacheKeyToString({ query, page, offset });
  _pending.set(key, promise);
  // Auto-remove when settled. Use then(success, failure) instead of finally()
  // so a rejected search promise does not create an unhandled child promise.
  void promise.then(() => {
    _pending.delete(key);
  }, () => {
    _pending.delete(key);
  });
}

/**
 * Clear the pending entry for a key (e.g. on error).
 */
export function clearPendingSearch(query: string, page: number, offset: number): void {
  const key = cacheKeyToString({ query, page, offset });
  _pending.delete(key);
}

/**
 * Clear the entire cache.
 */
export function clearSearchCache(): void {
  _cache.clear();
  _pending.clear();
}

/**
 * Get cache diagnostics (for debug overlay).
 */
export function getSearchCacheDiagnostics(): {
  size: number;
  pending: number;
  ttlMs: number;
} {
  return {
    size: _cache.size,
    pending: _pending.size,
    ttlMs: _ttlMs,
  };
}

/**
 * Override the TTL (for testing).
 */
export function setSearchCacheTTL(ms: number): void {
  _ttlMs = ms;
}

// ── Advisory Lock (Node.js test environments) ────────────────────────────────

/**
 * Acquire an advisory filesystem lock for a search page.
 * Only functional in Node.js environments (not browser).
 * Uses mkdir-based lockfiles at `.cache/locks/<qHash>-<page>.lock`.
 *
 * @returns A release function, or a no-op release if lock unavailable.
 */
export async function acquireSearchLock(
  query: string,
  page: number,
  timeoutMs = 5000
): Promise<() => void> {
  // Browser environment: no filesystem access, return no-op release
  if (typeof window !== 'undefined' || typeof process === 'undefined') {
    return () => {};
  }

  try {
    const importNodeModule = new Function(
      'specifier',
      'return import(specifier)'
    ) as <T>(specifier: string) => Promise<T>;
    const fs = await importNodeModule<typeof import('node:fs/promises')>('node:fs/promises');
    const path = await importNodeModule<typeof import('node:path')>('node:path');
    const lockDir = path.join('.cache', 'locks');
    const lockFile = path.join(lockDir, `${qHash(query)}-${page}.lock`);

    await fs.mkdir(lockDir, { recursive: true });

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        // mkdir is atomic: only one caller succeeds
        await fs.mkdir(lockFile);
        return () => {
          fs.rm(lockFile, { recursive: true }).catch(() => {});
        };
      } catch {
        // eslint-disable-next-line no-restricted-syntax -- one-shot timer scoped to local promise / effect cleanup
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    // Timeout: yield gracefully, no error to caller
    return () => {};
  } catch {
    // FS not available: yield gracefully
    return () => {};
  }
}

