import { state } from '../state.js';
import { debugWarn } from './diagnostic-adapter.js';
import * as idb from './idb-service.js';

export const SEMANTIC_SEARCH_CACHE_MAX_ENTRIES = 8;
export const SEMANTIC_SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;

if (!state.semanticSearchResultCache) state.semanticSearchResultCache = new Map();
if (!state.semanticSearchCacheDiagnostics) {
    state.semanticSearchCacheDiagnostics = {
        hits: 0,
        misses: 0,
        stores: 0,
        evictions: 0,
        lastKey: null,
        lastSource: null,
        lastAgeMs: null
    };
}

export async function initSearchCache() {
    try {
        const dbEntries = await idb.entries();
        const now = Date.now();
        for (const [key, entry] of dbEntries) {
            if (!entry || typeof entry.storedAt !== 'number') continue;
            const ageMs = now - entry.storedAt;
            if (ageMs > SEMANTIC_SEARCH_CACHE_TTL_MS) {
                // Expired, remove from IDB
                idb.remove(key).catch(err => debugWarn('[idb-service] cleanup failed:', err));
            } else {
                // Valid, load into memory
                state.semanticSearchResultCache.set(key, entry);
            }
        }
    } catch (err) {
        debugWarn('[semantic-search-api-cache] Failed to initialize IDB cache:', err);
    }
}

function getSemanticSearchCacheKey(query) {
    return String(query || '').trim().toLowerCase();
}

function cloneSemanticSearchPayload(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    return {
        ...payload,
        results: Array.isArray(payload.results) ? [...payload.results] : payload.results
    };
}

function validatePayloadSchema(payload) {
    if (!payload?.ok || !Array.isArray(payload?.results)) return false;
    for (const item of payload.results) {
        if (typeof item.lead_id === 'undefined' || typeof item.score === 'undefined') {
            return false;
        }
    }
    return true;
}

function markSemanticSearchCache(source, key, entry = null) {
    state.semanticSearchCacheDiagnostics.lastSource = source;
    state.semanticSearchCacheDiagnostics.lastKey = key || null;
    state.semanticSearchCacheDiagnostics.lastAgeMs = entry
        ? Math.max(0, Math.round(Date.now() - entry.storedAt))
        : null;
}

export function getCachedSemanticSearchPayload(query) {
    const key = getSemanticSearchCacheKey(query);
    if (!key) return null;

    const entry = state.semanticSearchResultCache.get(key);
    if (!entry) {
        state.semanticSearchCacheDiagnostics.misses += 1;
        markSemanticSearchCache('miss', key);
        return null;
    }

    const now = Date.now();
    const ageMs = now - entry.storedAt;
    if (ageMs > SEMANTIC_SEARCH_CACHE_TTL_MS) {
        state.semanticSearchResultCache.delete(key);
        idb.remove(key).catch(err => debugWarn('[idb-service] eviction failed:', err));

        state.semanticSearchCacheDiagnostics.evictions += 1;
        state.semanticSearchCacheDiagnostics.misses += 1;
        markSemanticSearchCache('expired', key, entry);
        return null;
    }

    entry.lastAccessedAt = now;
    // Asynchronously update IDB lastAccessedAt
    idb.set(key, entry).catch(err => debugWarn('[idb-service] access update failed:', err));

    state.semanticSearchCacheDiagnostics.hits += 1;
    markSemanticSearchCache('hit', key, entry);

    const payload = cloneSemanticSearchPayload(entry.payload);
    if (payload && typeof payload === 'object') {
        payload.client_cache_hit = true;
        payload.client_cache_age_ms = Math.max(0, Math.round(ageMs));
    }
    return payload;
}

export function storeSemanticSearchPayload(query, payload) {
    const key = getSemanticSearchCacheKey(query);
    if (!key || !payload?.ok || !Array.isArray(payload?.results)) return;
    if (!validatePayloadSchema(payload)) {
        debugWarn('[semantic-search-api-cache] Payload schema validation failed, treating as cache miss');
        return; // treat as cache miss — will fetch fresh
    }

    const now = Date.now();
    const entry = {
        storedAt: now,
        lastAccessedAt: now,
        payload: cloneSemanticSearchPayload(payload)
    };

    state.semanticSearchResultCache.set(key, entry);
    // Asynchronously mirror to IDB
    idb.set(key, entry).catch(err => debugWarn('[idb-service] store failed:', err));

    state.semanticSearchCacheDiagnostics.stores += 1;
    markSemanticSearchCache('store', key);

    while (state.semanticSearchResultCache.size > SEMANTIC_SEARCH_CACHE_MAX_ENTRIES) {
        // First, proactively remove all expired entries
        for (const [k, e] of state.semanticSearchResultCache.entries()) {
            if (e && (now - e.storedAt > SEMANTIC_SEARCH_CACHE_TTL_MS)) {
                state.semanticSearchResultCache.delete(k);
                idb.remove(k).catch(err => debugWarn('[idb-service] eviction failed:', err));
                state.semanticSearchCacheDiagnostics.evictions += 1;
            }
        }
        // Then evict LRU entry if still over capacity
        if (state.semanticSearchResultCache.size > SEMANTIC_SEARCH_CACHE_MAX_ENTRIES) {
            let oldestKey = null;
            let oldestTime = Infinity;
            for (const [k, e] of state.semanticSearchResultCache.entries()) {
                if (e && Number.isFinite(e.lastAccessedAt) && e.lastAccessedAt < oldestTime) {
                    oldestTime = e.lastAccessedAt;
                    oldestKey = k;
                }
            }
            if (!oldestKey) break;
            state.semanticSearchResultCache.delete(oldestKey);
            idb.remove(oldestKey).catch(err => debugWarn('[idb-service] eviction failed:', err));
            state.semanticSearchCacheDiagnostics.evictions += 1;
        }
    }
}

export function getSemanticSearchCacheDiagnostics() {
    return {
        ...state.semanticSearchCacheDiagnostics,
        size: state.semanticSearchResultCache?.size || 0,
        keys: state.semanticSearchResultCache ? Array.from(state.semanticSearchResultCache.keys()) : [],
        ttlMs: SEMANTIC_SEARCH_CACHE_TTL_MS,
        maxEntries: SEMANTIC_SEARCH_CACHE_MAX_ENTRIES
    };
}
