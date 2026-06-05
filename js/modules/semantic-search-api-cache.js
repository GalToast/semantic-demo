import { state } from '../state.js';
import { detectStaticDevPHP } from './utils/ui-presentation.js';
import { debugWarn } from './diagnostic-adapter.js';
import * as idb from './idb-service.js';

const SEMANTIC_SEARCH_RETRY_DELAYS_MS = [900, 1800];
const SEMANTIC_SEARCH_CACHE_MAX_ENTRIES = 8;
const SEMANTIC_SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;

// Names are now normalized at load time by data-mapper.normalizeSlugName,
// so slug-style names from the corpus seed never reach the UI.
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

const MOCK_QUERY_ALIASES = {
    coffee: ['coffee', 'cafe', 'espresso', 'latte', 'roaster', 'bakery', 'brew'],
    roof: ['roof', 'roofing', 'roofer', 'shingle'],
    // Dropped 'learning' and 'montessori' — too broad, pulled in flight
    // schools and unrelated academies. Stick to the unambiguous terms.
    childcare: ['childcare', 'child care', 'daycare', 'day care'],
    dog: ['dog', 'pet', 'groom', 'grooming', 'paws', 'kennel']
};

// NAICS prefix per known catalog term. When a point has a NAICS code in
// `point.naics`, this is the strongest signal that the point belongs to the
// category (e.g. NAICS 624410 = Child Day Care Services). A prefix match
// wins over the text match, so an aviation school classified as cluster 12
// (Education & Childcare) but coded NAICS 611512 will not outrank a
// Montessori academy coded 624410. Records without a NAICS field still
// fall through to text matching (backwards-compat with the existing
// catalog, where every entry already has a NAICS string).
//
// Format: `point.naics` may be either "624410" or
// "624410 - Child Day Care Services"; we match on `startsWith(prefix)`.
const MOCK_QUERY_NAICS_PREFIX = Object.freeze({
    coffee: '722515',
    roof: '238160',
    childcare: '624410',
    dog: '812910'
});

// NAICS prefix denylist per known catalog term. A record whose NAICS
// starts with any of these prefixes is *excluded* from that query's
// results, even if its name or what-text would otherwise match. This is
// the local-code defense against the upstream-data misclassification
// that produced the original "childcare returns aviation schools"
// problem: even if LeadOps tags a flight school as cluster 12 with
// NAICS 611512, the search code refuses to surface it for "childcare"
// because the NAICS prefix is on the denylist.
//
// Defense-in-depth: a record with NAICS 611512, 611710 (Educational
// Support Services), 812910 (Pet Care), etc. is not a Child Day Care
// provider, regardless of what its `what` text says.
const MOCK_QUERY_NAICS_DENY = Object.freeze({
    childcare: ['611512', '611710', '812910', '611110', '611610'],
    dog: ['624410', '611512', '722515'],
    coffee: ['238160', '624410'],
    roof: ['722515', '624410', '812910']
});

const EXPLICIT_EMPTY_QUERY_PATTERN = /^(?:__no_results__|none|empty|xj9k2l|nil|void|error)$/i;

function normalizeMockSearchText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/[^a-z0-9\s]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Field-weighted scoring. The lead's own one-liner (snapshot) is the
 * strongest category signal; the lead's analysis paragraph (observations)
 * is next; the auto-generated business_overview is on par with snapshot.
 * NAICS-prefix is a strong signal but not dominant — it can be wrong
 * upstream. Weights are tuned for "childcare" / "coffee" / etc. queries
 * where the lead's own words matter most.
 *
 * Bug Sweep 33: pulls fields from scripts/leadEnrichment.public.json
 * (state.leadEnrichment[leadId]) in addition to the data.dat point
 * fields. Records without enrichment fall through to point-only text
 * matching (backwards-compat).
 */
const FIELD_WEIGHTS = Object.freeze({
    snapshot: 9,
    business_overview: 9,
    observations: 7,
    business_overview_extended: 7,
    audit_highlights: 5,
    contact_decision_makers: 5,
    what: 6,
    name: 4,
    naics_prefix: 6,
    city: 2,
    address: 2,
    evidence: 3,
    snapshot_alt: 9
});

/**
 * Build a per-field text map. Returns {fieldName: normalized_text}.
 * Used so that a hit in `snapshot` scores higher than a hit in `what`.
 */
function getMockPointSearchFields(point) {
    const enrichment = point?.lead_id !== null && point?.lead_id !== undefined
        ? state.leadEnrichment?.[String(point.lead_id)]
        : null;
    return {
        name: normalizeMockSearchText(point?.name),
        what: normalizeMockSearchText(point?.what),
        city: normalizeMockSearchText(point?.city),
        naics_prefix: point?.naics ? String(point.naics).match(/^(\d{6})/)?.[1] : null,
        address: normalizeMockSearchText(enrichment?.address || point?.address),
        snapshot: normalizeMockSearchText(enrichment?.snapshot),
        snapshot_alt: normalizeMockSearchText(enrichment?.business_overview),
        business_overview: normalizeMockSearchText(enrichment?.business_overview_extended),
        business_overview_extended: normalizeMockSearchText(enrichment?.business_overview_extended),
        observations: normalizeMockSearchText(enrichment?.observations),
        contact_decision_makers: normalizeMockSearchText(enrichment?.contact_decision_makers),
        audit_highlights: normalizeMockSearchText(enrichment?.audit_highlights),
        evidence: normalizeMockSearchText(enrichment?.evidence)
    };
}

function getMockDatasetTerms(query, matchedTerm) {
    const queryTokens = normalizeMockSearchText(query)
        .split(/\s+/)
        .filter((token) => token.length >= 3);
    const aliases = matchedTerm ? MOCK_QUERY_ALIASES[matchedTerm] || [matchedTerm] : [];
    return [...new Set([...aliases, ...queryTokens].map(normalizeMockSearchText).filter(Boolean))];
}

function buildDatasetBackedMockResults(query, matchedTerm, scoreBase) {
    if (!Array.isArray(state.points) || state.points.length === 0) return [];
    const terms = getMockDatasetTerms(query, matchedTerm);
    if (!terms.length) return [];

    // NAICS-based scoring for known terms. The local code owns this
    // contract, not upstream: even if a record is misclassified upstream,
    // the search refuses to surface it for the wrong category. Records
    // without a NAICS field fall through to text matching (backwards-compat
    // with the existing dataset, which has no NAICS column yet).
    const naicsPrefix = matchedTerm ? MOCK_QUERY_NAICS_PREFIX[matchedTerm] : null;
    const naicsDenyList = matchedTerm ? MOCK_QUERY_NAICS_DENY[matchedTerm] : null;
    const pointNaicsPrefix = (point) => {
        const n = point?.naics;
        if (!n) return null;
        const m = String(n).match(/^(\d{6})/);
        return m ? m[1] : null;
    };

    return state.points
        .map((point, index) => {
            if (!point || point.lead_id === null || point.lead_id === undefined || point.lead_id === '') return null;
            const fields = getMockPointSearchFields(point);
            let score = 0;
            // Defense in depth for known terms: if the record has a NAICS
            // code on the denylist for this query, exclude it entirely.
            // This handles the case where upstream has misclassified a
            // record (e.g. an aviation school tagged cluster 12 AND NAICS
            // 611512; the local code refuses to surface it for "childcare"
            // even if the name or what text would otherwise match).
            const pNaicsPrefix = pointNaicsPrefix(point);
            if (naicsDenyList && pNaicsPrefix && naicsDenyList.some((deny) => pNaicsPrefix.startsWith(deny))) {
                return null;
            }
            // NAICS-prefix match. Strong signal but not dominant — the
            // lead's own words (snapshot, observations, business_overview)
            // can override a misclassified NAICS.
            if (naicsPrefix && pNaicsPrefix && pNaicsPrefix.startsWith(naicsPrefix)) {
                score += FIELD_WEIGHTS.naics_prefix;
            }
            // Field-weighted text matching. The matchedTerm must hit at
            // least one field; the field that hits determines the weight.
            // Bug Sweep 33: scoring across multiple corpus fields instead
            // of just `what`. Records without enrichment fall through to
            // point-only fields and score lower.
            const strictMode = Boolean(matchedTerm);
            const matchedTermHit = matchedTerm && terms.some((term) =>
                term && Object.values(fields).some((val) => val && String(val).includes(term))
            );
            if (matchedTermHit) {
                // Find which fields hit and score each by weight
                for (const [fieldName, fieldText] of Object.entries(fields)) {
                    if (!fieldText) continue;
                    if (terms.some((term) => term && fieldText.includes(term))) {
                        const weight = FIELD_WEIGHTS[fieldName] || 0;
                        if (strictMode && matchedTerm && !fieldText.includes(matchedTerm)) {
                            // In strict mode, only the matchedTerm itself scores.
                            // Aliases are intentionally ignored to keep
                            // results within the requested category.
                            continue;
                        }
                        score += weight;
                    }
                }
            } else if (!strictMode) {
                // Generic (non-strict) mode: any alias can score, but only
                // in the strongest fields (snapshot, business_overview,
                // observations) so unrelated clusters don't bleed in.
                for (const [fieldName, fieldText] of Object.entries(fields)) {
                    if (!fieldText) continue;
                    const weight = FIELD_WEIGHTS[fieldName] || 0;
                    if (weight < 5) continue;
                    if (terms.some((term) => term && fieldText.includes(term))) {
                        score += weight * 0.5;
                    }
                }
            }
            if (point.website) score += 0.4;
            if (point.email) score += 0.3;
            if (point.phone) score += 0.2;
            if (score <= 0) return null;
            return { point, index, score };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, 5)
        .map(({ point, score }, i) => {
            const enrichment = point.lead_id !== null && point.lead_id !== undefined
                ? state.leadEnrichment?.[String(point.lead_id)]
                : null;
            return {
                lead_id: String(point.lead_id),
                name: point.name,
                score: Math.max(0.5, scoreBase - i * 0.05 + Math.min(score, 30) * 0.003),
                provenance: 'Static dev dataset fallback',
                thread_type: 'Search match',
                city: point.city,
                naics: point.naics || point.what,
                public_note: enrichment?.business_overview || point.what || '',
                website: point.website,
                email: point.email,
                phone: point.phone,
                isMock: true
            };
        });
}

function buildMockCatalogForQuery(query) {
    const q = (query || '').toLowerCase().trim();
    if (EXPLICIT_EMPTY_QUERY_PATTERN.test(q)) return [];
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
    const datasetResults = buildDatasetBackedMockResults(query, matchedTerm, scoreBase);
    if (datasetResults.length) return datasetResults;

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
        phone: entry.phone,
        isMock: true
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

function allowsStaticDevFallback() {
    if (typeof window === 'undefined' || !window.location) return false;
    const host = window.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') return false;
    const params = new URLSearchParams(window.location.search || '');
    return params.get('staticDev') !== '0';
}

function shouldLogStaticDevFallback() {
    if (typeof window === 'undefined' || !window.location) return false;
    const params = new URLSearchParams(window.location.search || '');
    return params.get('staticDevWarnings') === '1' || params.get('debugStaticDev') === '1';
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
                if (shouldLogStaticDevFallback()) {
                    debugWarn('[semantic-search-api-cache] Detected raw PHP response. Assuming static dev server. Returning mock results.');
                }

                // Slug-style names are normalized at load time by
                // data-mapper.normalizeSlugName — the corpus seed slugs
                // never reach the UI or search results.
                const isExplicitEmpty = EXPLICIT_EMPTY_QUERY_PATTERN.test(trimmedQuery);
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
