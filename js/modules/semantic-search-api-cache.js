import { detectStaticDevPHP, allowsStaticDevFallback, shouldLogStaticDevFallback } from './utils/ui-presentation.js';
import { debugWarn } from './diagnostic-adapter.js';
import { buildMockCatalogForQuery, EXPLICIT_EMPTY_QUERY_PATTERN } from './semantic-search-mock-catalog.js';
import {
    initSearchCache,
    getCachedSemanticSearchPayload,
    storeSemanticSearchPayload,
    getSemanticSearchCacheDiagnostics
} from './semantic-search-cache.js';

export { initSearchCache, getSemanticSearchCacheDiagnostics };

const SEMANTIC_SEARCH_RETRY_DELAYS_MS = [900, 1800];

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

export { getCachedSemanticSearchPayload, storeSemanticSearchPayload };

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
