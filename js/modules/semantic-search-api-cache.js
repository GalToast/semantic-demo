import { state } from '../state.js';
import { detectStaticDevPHP } from './utils/ui-presentation.js';
import * as idb from './idb-service.js';

const SEMANTIC_SEARCH_RETRY_DELAYS_MS = [900, 1800];
const SEMANTIC_SEARCH_CACHE_MAX_ENTRIES = 8;
const SEMANTIC_SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;

// TODO(data-regen): data.dat still contains slug-style names like "2-hampton-inn-and-suites"
// from the initial corpus seed. The catalog below supplies clean, category-appropriate
// names so the demo reads believably even when search is mocked. Long-term: re-emit
// data.dat from the LeadOps corpus with clean names.
const MOCK_CATALOG = {
    coffee: [
        { name: 'Third Gen Coffee', city: 'The Woodlands', naics: '722515 - Coffee Shops', website: true, email: true, phone: false },
        { name: 'Galavants Coffee', city: 'Conroe', naics: '722515 - Coffee Shops', website: true, email: false, phone: true },
        { name: 'Blue Door Coffee', city: 'Conroe', naics: '722515 - Coffee Shops', website: true, email: true, phone: true },
        { name: 'Dosey Doe Coffee', city: 'The Woodlands', naics: '722515 - Coffee Shops', website: true, email: false, phone: false },
        { name: 'Summer Moon Coffee', city: 'Magnolia', naics: '722515 - Coffee Shops', website: true, email: false, phone: true }
    ],
    roof: [
        { name: 'Conroe Roofing Co', city: 'Conroe', naics: '238160 - Roofing Contractors', website: true, email: true, phone: true },
        { name: 'Pine Valley Roofing', city: 'The Woodlands', naics: '238160 - Roofing Contractors', website: true, email: true, phone: false },
        { name: 'Lone Star Roofworks', city: 'Montgomery', naics: '238160 - Roofing Contractors', website: true, email: false, phone: true },
        { name: 'Magnolia Roofing Pros', city: 'Magnolia', naics: '238160 - Roofing Contractors', website: false, email: true, phone: true },
        { name: 'Shenandoah Roofing', city: 'Shenandoah', naics: '238160 - Roofing Contractors', website: true, email: false, phone: false }
    ],
    childcare: [
        { name: 'Magnolia Montessori Academy', city: 'Magnolia', naics: '624410 - Child Day Care Services', website: true, email: true, phone: true },
        { name: 'The Woodlands Early Learning', city: 'The Woodlands', naics: '624410 - Child Day Care Services', website: true, email: true, phone: false },
        { name: 'Conroe Childcare Center', city: 'Conroe', naics: '624410 - Child Day Care Services', website: false, email: true, phone: true },
        { name: 'Montgomery Little Stars', city: 'Montgomery', naics: '624410 - Child Day Care Services', website: true, email: false, phone: true },
        { name: 'Spring Branch Kids Academy', city: 'Spring', naics: '624410 - Child Day Care Services', website: true, email: true, phone: true }
    ],
    dog: [
        { name: 'Bark Avenue Grooming', city: 'Conroe', naics: '812910 - Pet Care Services', website: true, email: true, phone: true },
        { name: 'The Dog House of The Woodlands', city: 'The Woodlands', naics: '812910 - Pet Care Services', website: true, email: true, phone: false },
        { name: 'Paws & Claws Pet Resort', city: 'Magnolia', naics: '812910 - Pet Care Services', website: true, email: true, phone: true },
        { name: 'Conroe Pup Park', city: 'Conroe', naics: '812910 - Pet Care Services', website: false, email: true, phone: true },
        { name: 'Shenandoah Dog Lodge', city: 'Shenandoah', naics: '812910 - Pet Care Services', website: true, email: false, phone: true }
    ]
};

const MOCK_QUERY_TERMS = Object.keys(MOCK_CATALOG);

function buildMockCatalogForQuery(query) {
    const q = (query || '').toLowerCase().trim();
    let bucket = MOCK_CATALOG.coffee; // safe default
    let matchedTerm = null;
    let scoreBase = 0.95;
    for (const term of MOCK_QUERY_TERMS) {
        if (q.includes(term)) {
            bucket = MOCK_CATALOG[term];
            matchedTerm = term;
            break;
        }
    }
    if (!matchedTerm) {
        // Try partial / semantic-ish fallback: look at the first word
        for (const term of MOCK_QUERY_TERMS) {
            if (q.startsWith(term) || q.split(/\s+/).some((tok) => tok === term)) {
                bucket = MOCK_CATALOG[term];
                matchedTerm = term;
                scoreBase = 0.85;
                break;
            }
        }
    }
    if (!matchedTerm) {
        // Generic fallback — return one of the catalogs with a reduced score
        scoreBase = 0.6;
    }
    return bucket.map((entry, i) => ({
        lead_id: `mock-${matchedTerm || 'generic'}-${i + 1}`,
        name: entry.name,
        score: Math.max(0.5, scoreBase - i * 0.05),
        provenance: 'Mock',
        thread_type: 'Search match',
        city: entry.city,
        naics: entry.naics,
        website: entry.website,
        email: entry.email,
        phone: entry.phone
    }));
}

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
                idb.remove(key).catch(err => console.warn('[idb-service] cleanup failed:', err));
            } else {
                // Valid, load into memory
                state.semanticSearchResultCache.set(key, entry);
            }
        }
    } catch (err) {
        console.warn('[semantic-search-api-cache] Failed to initialize IDB cache:', err);
    }
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
        idb.remove(key).catch(err => console.warn('[idb-service] eviction failed:', err));

        state.semanticSearchCacheDiagnostics.evictions += 1;
        state.semanticSearchCacheDiagnostics.misses += 1;
        markSemanticSearchCache('expired', key, entry);
        return null;
    }

    entry.lastAccessedAt = now;
    // Asynchronously update IDB lastAccessedAt
    idb.set(key, entry).catch(err => console.warn('[idb-service] access update failed:', err));

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

    const now = Date.now();
    const entry = {
        storedAt: now,
        lastAccessedAt: now,
        payload: cloneSemanticSearchPayload(payload)
    };

    state.semanticSearchResultCache.set(key, entry);
    // Asynchronously mirror to IDB
    idb.set(key, entry).catch(err => console.warn('[idb-service] store failed:', err));

    state.semanticSearchCacheDiagnostics.stores += 1;
    markSemanticSearchCache('store', key);

    while (state.semanticSearchResultCache.size > SEMANTIC_SEARCH_CACHE_MAX_ENTRIES) {
        // First, proactively remove all expired entries
        for (const [k, e] of state.semanticSearchResultCache.entries()) {
            if (e && (now - e.storedAt > SEMANTIC_SEARCH_CACHE_TTL_MS)) {
                state.semanticSearchResultCache.delete(k);
                idb.remove(k).catch(err => console.warn('[idb-service] eviction failed:', err));
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
            idb.remove(oldestKey).catch(err => console.warn('[idb-service] eviction failed:', err));
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

function allowsStaticDevFallback() {
    if (typeof window === 'undefined' || !window.location) return false;
    const host = window.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') return false;
    const params = new URLSearchParams(window.location.search || '');
    return params.get('staticDev') !== '0';
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

            const responseText = await response.text();
            let payload;

            if (detectStaticDevPHP(responseText) && allowsStaticDevFallback()) {
                console.warn('[semantic-search-api-cache] Detected raw PHP response. Assuming static dev server. Returning mock results.');

                // TODO(data-regen): data.dat still contains a few slug-style names
                // (e.g. "2-hampton-inn-and-suites") from the initial corpus seed. The catalog
                // below supplies clean, category-appropriate names so the demo reads believably
                // before the data pipeline is regenerated. Long-term: re-emit data.dat from the
                // LeadOps corpus with clean names.

                const isExplicitEmpty = /^(none|empty|xj9k2l|nil|void|error)$/i.test(trimmedQuery);
                const mockResults = isExplicitEmpty ? [] : buildMockCatalogForQuery(trimmedQuery);

                payload = {
                    ok: true,
                    query: trimmedQuery,
                    results: mockResults,
                    is_mock: true,
                    dev_mode: "static-php-fallback"
                };
            } else if (detectStaticDevPHP(responseText)) {
                const error = new Error('Semantic search returned raw PHP source.');
                Object.defineProperty(error, 'correlationId', { value: crypto.randomUUID(), writable: false, configurable: true });
                throw error;
            } else {
                try {
                    payload = JSON.parse(responseText);
                } catch (jsonErr) {
                    Object.defineProperty(jsonErr, 'correlationId', { value: crypto.randomUUID(), writable: false, configurable: true });
                    throw new Error('Semantic search returned invalid JSON.', { cause: jsonErr });
                }
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
