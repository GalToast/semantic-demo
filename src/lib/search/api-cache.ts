/**
 * @lib/search/api-cache.ts — Semantic search API call with retry, timeout,
 * and static-dev fallback. Replaces the deprecated
 * `` shim.
 *
 * The single-track search engine (`src/lib/search-engine.ts` →
 * `performSearch`) is the canonical entry point; this module is retained
 * as the lower-level API+cache path. The legacy kernel retirement arc
 * keeps the bridge available for `` until T9 retires
 * that entrypoint.
 */

import { debugWarn } from '@lib/utils/debug';
import { buildMockCatalogForQuery, EXPLICIT_EMPTY_QUERY_PATTERN } from './mock-catalog';
import {
    initSearchCache,
    getCachedSemanticSearchPayload,
    storeSemanticSearchPayload,
    getSemanticSearchCacheDiagnostics,
    type SearchPayload
} from './cache';
import {
    detectStaticDevPHP,
    allowsStaticDevFallback,
    shouldLogStaticDevFallback
} from '@lib/utils/ui-presentation';

export { initSearchCache, getSemanticSearchCacheDiagnostics };

export interface SemanticSearchRetryInfo {
    attempt: number;
    nextAttempt: number;
    delayMs: number;
    retryTotal: number;
    error: Error;
}

export interface SemanticSearchOptions {
    offset?: number;
    preferCachedResults?: boolean;
    timeoutMs?: number;
    maxAttempts?: number;
    retryDelaysMs?: number[];
    onRetry?: (info: SemanticSearchRetryInfo) => void;
}

export interface SemanticSearchPayload {
    ok: boolean;
    query?: string;
    results?: unknown[];
    is_mock?: boolean;
    dev_mode?: string;
    error?: string;
    [key: string]: unknown;
}

const SEMANTIC_SEARCH_RETRY_DELAYS_MS: readonly number[] = [900, 1800];

function isRetryableSemanticSearchError(error: unknown): boolean {
    const err = error as { name?: string; message?: string } | null;
    const message = String(err?.message || err || '').toLowerCase();
    return (
        err?.name === 'AbortError' ||
        message.includes('abort') ||
        message.includes('semantic search') ||
        message.includes('invalid json') ||
        message.includes('failed to fetch') ||
        message.includes('networkerror') ||
        message.includes('unavailable') ||
        message.includes('warming up')
    );
}

function waitForSemanticSearchRetry(delayMs: number, signal?: AbortSignal | null): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
        }
        let timeoutId: number | null = null;
        const handleAbort = (): void => {
            cleanup();
            reject(new DOMException('Aborted', 'AbortError'));
        };
        const cleanup = (): void => {
            if (timeoutId !== null) window.clearTimeout(timeoutId);
            signal?.removeEventListener('abort', handleAbort);
        };
        timeoutId = window.setTimeout(() => { cleanup(); resolve(); }, delayMs);
        signal?.addEventListener('abort', handleAbort, { once: true });
    });
}

export { getCachedSemanticSearchPayload, storeSemanticSearchPayload };

export async function fetchSemanticSearchResults(
    query: string,
    signal?: AbortSignal | null,
    options: SemanticSearchOptions = {}
): Promise<SemanticSearchPayload> {
    const trimmedQuery = typeof query === 'string' ? query.trim() : '';
    if (!trimmedQuery) return { ok: false, results: [] } as SemanticSearchPayload;
    const offset = Number.isFinite(options.offset) ? Math.max(0, options.offset!) : 0;

    if (options.preferCachedResults !== false && offset === 0) {
        const cachedPayload = getCachedSemanticSearchPayload(trimmedQuery, offset);
        if (cachedPayload) return cachedPayload;
    }

    const retryDelays = Array.isArray(options.retryDelaysMs) && options.retryDelaysMs.length
        ? options.retryDelaysMs
        : [...SEMANTIC_SEARCH_RETRY_DELAYS_MS];
    const maxAttempts = Math.max(
        1,
        Number.isFinite(Number(options.maxAttempts)) ? Number(options.maxAttempts) : retryDelays.length + 1
    );
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const attemptController = new AbortController();
        let attemptTimedOut = false;
        const timeoutId = setTimeout(() => { attemptTimedOut = true; attemptController.abort(); }, options.timeoutMs || 8000);
        const handleAbort = (): void => attemptController.abort();
        if (signal) signal.addEventListener('abort', handleAbort);
        try {
            const response = await fetch(
                `api.php?action=semantic_search&q=${encodeURIComponent(trimmedQuery)}&limit=18&offset=${offset}`,
                { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store', signal: attemptController.signal }
            );
            const responseText = await response.text();
            let payload: SemanticSearchPayload;
            if (detectStaticDevPHP(responseText) && allowsStaticDevFallback()) {
                if (shouldLogStaticDevFallback()) {
                    debugWarn('[semantic-search-api-cache] Detected raw PHP response. Assuming static dev server. Returning mock results.');
                }
                const isExplicitEmpty = EXPLICIT_EMPTY_QUERY_PATTERN.test(trimmedQuery);
                const mockResults = isExplicitEmpty ? [] : buildMockCatalogForQuery(trimmedQuery);
                payload = { ok: true, query: trimmedQuery, results: mockResults, is_mock: true, dev_mode: 'static-php-fallback' };
            } else if (detectStaticDevPHP(responseText)) {
                const error: Error & { correlationId?: string } = new Error('Semantic search returned raw PHP source.');
                Object.defineProperty(error, 'correlationId', { value: crypto.randomUUID(), writable: false, configurable: true });
                throw error;
            } else {
                try { payload = JSON.parse(responseText); }
                catch (jsonErr) {
                    Object.defineProperty(jsonErr as object, 'correlationId', { value: crypto.randomUUID(), writable: false, configurable: true });
                    throw new Error('Semantic search returned invalid JSON.', { cause: jsonErr });
                }
            }
            if (!response.ok || !payload?.ok) {
                const err: Error & { correlationId?: string } = new Error(payload?.error || 'Semantic search is unavailable right now.');
                Object.defineProperty(err, 'correlationId', { value: crypto.randomUUID(), writable: false, configurable: true });
                throw err;
            }
            storeSemanticSearchPayload(trimmedQuery, payload as SearchPayload, offset);
            return payload;
        } catch (error) {
            if (signal?.aborted) throw error;
            lastError = attemptTimedOut || (error as Error)?.name === 'AbortError'
                ? new Error('Semantic search timed out before returning results.')
                : error instanceof Error ? error : new Error(String(error || 'Semantic search is unavailable right now.'));
            const canRetry = attempt < maxAttempts && isRetryableSemanticSearchError(lastError);
            if (!canRetry) throw lastError;
            const delayMs = retryDelays[Math.min(attempt - 1, retryDelays.length - 1)] ?? 1500;
            if (typeof options.onRetry === 'function') {
                options.onRetry({ attempt, nextAttempt: attempt + 1, delayMs, retryTotal: Math.max(1, maxAttempts - 1), error: lastError });
            }
            await waitForSemanticSearchRetry(delayMs, signal);
        } finally {
            clearTimeout(timeoutId);
            if (signal) signal.removeEventListener('abort', handleAbort);
        }
    }
    throw lastError || new Error('Semantic search is unavailable right now.');
}
