import { state } from '../state.js';

const SEMANTIC_SEARCH_RETRY_DELAYS_MS = [900, 1800];
const SEMANTIC_SEARCH_CACHE_MAX_ENTRIES = 8;
const SEMANTIC_SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;

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

function isRetryableSemanticSearchError(error) {
    const message = String(error?.message || error || '').toLowerCase();
    return (
        error?.name === 'AbortError' ||
        message.includes('abort') ||
        message.includes('semantic search') ||
        message.includes('invalid json') ||
        message.includes('failed to fetch') ||
        message.includes('networkerror') ||
        message.includes('unavailable') ||
        message.includes('warming up')
    );
}

function waitForSemanticSearchRetry(delayMs, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
        }

        let timeoutId = null;
        const handleAbort = () => {
            cleanup();
            reject(new DOMException('Aborted', 'AbortError'));
        };
        const cleanup = () => {
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
            }
            signal?.removeEventListener('abort', handleAbort);
        };

        timeoutId = window.setTimeout(() => {
            cleanup();
            resolve();
        }, delayMs);

        signal?.addEventListener('abort', handleAbort, { once: true });
    });
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
        ? Math.max(0, Math.round(performance.now() - entry.storedAt))
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

    const ageMs = performance.now() - entry.storedAt;
    if (ageMs > SEMANTIC_SEARCH_CACHE_TTL_MS) {
        state.semanticSearchResultCache.delete(key);
        state.semanticSearchCacheDiagnostics.evictions += 1;
        state.semanticSearchCacheDiagnostics.misses += 1;
        markSemanticSearchCache('expired', key, entry);
        return null;
    }

    entry.lastAccessedAt = performance.now();
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
        console.warn('[semantic-search-api-cache] Payload schema validation failed, treating as cache miss');
        return; // treat as cache miss — will fetch fresh
    }

    state.semanticSearchResultCache.set(key, {
        storedAt: performance.now(),
        lastAccessedAt: performance.now(),
        payload: cloneSemanticSearchPayload(payload)
    });
    state.semanticSearchCacheDiagnostics.stores += 1;
    markSemanticSearchCache('store', key);

    while (state.semanticSearchResultCache.size > SEMANTIC_SEARCH_CACHE_MAX_ENTRIES) {
        // First, proactively remove all expired entries
        for (const key of state.semanticSearchResultCache.keys()) {
            const entry = state.semanticSearchResultCache.get(key);
            if (entry && (performance.now() - entry.storedAt > SEMANTIC_SEARCH_CACHE_TTL_MS)) {
                state.semanticSearchResultCache.delete(key);
                state.semanticSearchCacheDiagnostics.evictions += 1;
            }
        }
        // Then evict LRU entry if still over capacity
        if (state.semanticSearchResultCache.size > SEMANTIC_SEARCH_CACHE_MAX_ENTRIES) {
            let oldestKey = null;
            let oldestTime = Infinity;
            for (const key of state.semanticSearchResultCache.keys()) {
                const entry = state.semanticSearchResultCache.get(key);
                if (entry && Number.isFinite(entry.lastAccessedAt) && entry.lastAccessedAt < oldestTime) {
                    oldestTime = entry.lastAccessedAt;
                    oldestKey = key;
                }
            }
            if (!oldestKey) break;
            state.semanticSearchResultCache.delete(oldestKey);
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

export async function fetchSemanticSearchResults(query, signal, options = {}) {
    const trimmedQuery = typeof query === 'string' ? query.trim() : '';
    if (!trimmedQuery) return [];
    const offset = Number.isFinite(options.offset) ? Math.max(0, options.offset) : 0;

    if (options.preferCachedResults !== false && offset === 0) {
        const cachedPayload = getCachedSemanticSearchPayload(trimmedQuery);
        if (cachedPayload) return cachedPayload;
    }

    const retryDelays = Array.isArray(options.retryDelaysMs) && options.retryDelaysMs.length
        ? options.retryDelaysMs
        : SEMANTIC_SEARCH_RETRY_DELAYS_MS;
    const maxAttempts = Math.max(
        1,
        Number.isFinite(Number(options.maxAttempts)) ? Number(options.maxAttempts) : retryDelays.length + 1
    );
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

        const attemptController = new AbortController();
        let attemptTimedOut = false;
        const timeoutId = setTimeout(() => {
            attemptTimedOut = true;
            attemptController.abort();
        }, options.timeoutMs || 8000);
        
        const handleAbort = () => attemptController.abort();
        if (signal) signal.addEventListener('abort', handleAbort);

        try {
            const response = await fetch(
                `api.php?action=semantic_search&q=${encodeURIComponent(trimmedQuery)}&limit=18&offset=${offset}`,
                { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store', signal: attemptController.signal }
            );

            let payload;
            try {
                payload = await response.json();
            } catch (jsonErr) {
                Object.defineProperty(jsonErr, 'correlationId', { value: crypto.randomUUID(), writable: false, configurable: true });
                throw new Error('Semantic search returned invalid JSON.', { cause: jsonErr });
            }

            if (!response.ok || !payload?.ok) {
                const err = new Error(payload?.error || 'Semantic search is unavailable right now.');
                Object.defineProperty(err, 'correlationId', { value: crypto.randomUUID(), writable: false, configurable: true });
                throw err;
            }

            storeSemanticSearchPayload(trimmedQuery, payload);
            return payload;
        } catch (error) {
            if (signal?.aborted) throw error;
            lastError = attemptTimedOut || error?.name === 'AbortError'
                ? new Error('Semantic search timed out before returning results.')
                : error instanceof Error
                    ? error
                    : new Error(String(error || 'Semantic search is unavailable right now.'));
            const canRetry = attempt < maxAttempts && isRetryableSemanticSearchError(lastError);
            if (!canRetry) throw lastError;

            const delayMs = retryDelays[Math.min(attempt - 1, retryDelays.length - 1)] ?? 1500;
            if (typeof options.onRetry === 'function') {
                options.onRetry({
                    attempt,
                    nextAttempt: attempt + 1,
                    delayMs,
                    retryTotal: Math.max(1, maxAttempts - 1),
                    error: lastError
                });
            }
            await waitForSemanticSearchRetry(delayMs, signal);
        } finally {
            clearTimeout(timeoutId);
            if (signal) signal.removeEventListener('abort', handleAbort);
        }
    }

    throw lastError || new Error('Semantic search is unavailable right now.');
}
