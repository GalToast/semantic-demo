/**
 * semantic-search-cache.ts
 *
 * TypeScript shadow for semantic-search-cache.js
 * In-memory + IDB cache for semantic search payloads.
 */

import { state, withStateMutation, type SemanticSearchCacheDiagnostics } from '../state.ts';
import { debugWarn } from '@lib/utils/diagnostic-adapter';
import * as idb from './idb-service.ts';

export const SEMANTIC_SEARCH_CACHE_MAX_ENTRIES: number = 8;
export const SEMANTIC_SEARCH_CACHE_TTL_MS: number = 10 * 60 * 1000;

export interface CacheEntry {
    storedAt: number;
    lastAccessedAt: number;
    payload: SearchPayload;
}

export interface SearchPayload {
    ok: boolean;
    results: Array<Record<string, unknown>>;
    client_cache_hit?: boolean;
    client_cache_age_ms?: number;
    [key: string]: unknown;
}

export interface CacheDiagnosticsSnapshot extends SemanticSearchCacheDiagnostics {
    size: number;
    keys: string[];
    ttlMs: number;
    maxEntries: number;
}

if (!state.semanticSearchResultCache) state.semanticSearchResultCache = new Map<string, CacheEntry>();
if (!state.semanticSearchCacheDiagnostics) {
    withStateMutation(() => {
        state.semanticSearchCacheDiagnostics = {
            hits: 0,
            misses: 0,
            stores: 0,
            evictions: 0,
            lastKey: null,
            lastSource: null,
            lastAgeMs: null
        };
    });
}

export async function initSearchCache(): Promise<void> {
    try {
        const dbEntries = await idb.entries();
        const now = Date.now();
        for (const [key, entry] of dbEntries) {
            const cacheEntry = entry as CacheEntry;
            if (!entry || typeof cacheEntry.storedAt !== 'number') continue;
            const ageMs = now - cacheEntry.storedAt;
            if (ageMs > SEMANTIC_SEARCH_CACHE_TTL_MS) {
                idb.remove(key as string).catch((err: unknown) => debugWarn('[idb-service] cleanup failed:', err));
            } else {
                state.semanticSearchResultCache.set(key as string, cacheEntry);
            }
        }
    } catch (err) {
        debugWarn('[semantic-search-api-cache] Failed to initialize IDB cache:', err);
    }
}

function getSemanticSearchCacheKey(query: string, offset: number = 0): string {
    // NFC-normalize before lowercasing so composed vs decomposed Unicode
    // (e.g. "café" NFC vs "cafe\u0301" NFD) map to the same cache key.
    return String(query || "").trim().normalize("NFC").toLowerCase() + ":" + offset;
}

function cloneSemanticSearchPayload(payload: SearchPayload): SearchPayload {
    if (!payload || typeof payload !== 'object') return payload;
    return {
        ...payload,
        results: Array.isArray(payload.results) ? [...payload.results] : payload.results
    };
}

function validatePayloadSchema(payload: SearchPayload): boolean {
    if (!payload?.ok || !Array.isArray(payload?.results)) return false;
    for (const item of payload.results) {
        if (typeof item.lead_id === 'undefined' || typeof item.score === 'undefined') {
            return false;
        }
    }
    return true;
}

function markSemanticSearchCache(source: string, key: string, entry: CacheEntry | null = null): void {
    withStateMutation(() => {
        state.semanticSearchCacheDiagnostics.lastSource = source;
        state.semanticSearchCacheDiagnostics.lastKey = key || null;
        state.semanticSearchCacheDiagnostics.lastAgeMs = entry
            ? Math.max(0, Math.round(Date.now() - entry.storedAt))
            : null;
    });
}

export function getCachedSemanticSearchPayload(query: string, offset: number = 0): SearchPayload | null {
    const key = getSemanticSearchCacheKey(query, offset);
    if (!key) return null;

    const cache = state.semanticSearchResultCache as unknown as Map<string, CacheEntry>;
    const entry = cache.get(key);
    if (!entry) {
        state.semanticSearchCacheDiagnostics.misses += 1;
        markSemanticSearchCache('miss', key);
        return null;
    }

    const now = Date.now();
    const ageMs = now - (entry as CacheEntry).storedAt;
    if (ageMs > SEMANTIC_SEARCH_CACHE_TTL_MS) {
        cache.delete(key);
        idb.remove(key as string).catch((err: unknown) => debugWarn('[idb-service] eviction failed:', err));

        state.semanticSearchCacheDiagnostics.evictions += 1;
        state.semanticSearchCacheDiagnostics.misses += 1;
        markSemanticSearchCache('expired', key, entry as CacheEntry);
        return null;
    }

    (entry as CacheEntry).lastAccessedAt = now;
    idb.set(key as string, entry as CacheEntry).catch((err: unknown) => debugWarn('[idb-service] access update failed:', err));

    state.semanticSearchCacheDiagnostics.hits += 1;
    markSemanticSearchCache('hit', key, entry as CacheEntry);

    const payload = cloneSemanticSearchPayload((entry as CacheEntry).payload);
    if (payload && typeof payload === 'object') {
        payload.client_cache_hit = true;
        payload.client_cache_age_ms = Math.max(0, Math.round(ageMs));
    }
    return payload;
}

export function storeSemanticSearchPayload(query: string, payload: SearchPayload, offset: number = 0): void {
    const key = getSemanticSearchCacheKey(query, offset);
    if (!key || !payload?.ok || !Array.isArray(payload?.results)) return;
    if (!validatePayloadSchema(payload)) {
        debugWarn('[semantic-search-api-cache] Payload schema validation failed, treating as cache miss');
        return;
    }

    const now = Date.now();
    const entry: CacheEntry = {
        storedAt: now,
        lastAccessedAt: now,
        payload: cloneSemanticSearchPayload(payload)
    };

    state.semanticSearchResultCache.set(key, entry);
    idb.set(key, entry).catch((err: unknown) => debugWarn('[idb-service] store failed:', err));

    state.semanticSearchCacheDiagnostics.stores += 1;
    markSemanticSearchCache('store', key);

    const cache = state.semanticSearchResultCache as unknown as Map<string, CacheEntry>;
    while (cache.size > SEMANTIC_SEARCH_CACHE_MAX_ENTRIES) {
        for (const [k, e] of cache.entries()) {
            const ce = e as CacheEntry;
            if (e && (now - ce.storedAt > SEMANTIC_SEARCH_CACHE_TTL_MS)) {
                cache.delete(k);
                idb.remove(k as string).catch((err: unknown) => debugWarn('[idb-service] eviction failed:', err));
                state.semanticSearchCacheDiagnostics.evictions += 1;
            }
        }
        if (cache.size > SEMANTIC_SEARCH_CACHE_MAX_ENTRIES) {
            let oldestKey: string | null = null;
            let oldestTime = Infinity;
            for (const [k, e] of cache.entries()) {
                const ce = e as CacheEntry;
                if (e && Number.isFinite(ce.lastAccessedAt) && ce.lastAccessedAt < oldestTime) {
                    oldestTime = ce.lastAccessedAt;
                    oldestKey = k;
                }
            }
            if (!oldestKey) break;
            cache.delete(oldestKey);
            idb.remove(oldestKey as string).catch((err: unknown) => debugWarn('[idb-service] eviction failed:', err));
            state.semanticSearchCacheDiagnostics.evictions += 1;
        }
    }
}

export function getSemanticSearchCacheDiagnostics(): CacheDiagnosticsSnapshot {
    const cache = state.semanticSearchResultCache as unknown as Map<string, CacheEntry>;
    return {
        ...state.semanticSearchCacheDiagnostics,
        size: cache?.size || 0,
        keys: cache ? Array.from(cache.keys()) : [],
        ttlMs: SEMANTIC_SEARCH_CACHE_TTL_MS,
        maxEntries: SEMANTIC_SEARCH_CACHE_MAX_ENTRIES
    };
}
