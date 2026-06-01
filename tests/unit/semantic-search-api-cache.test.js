import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { state } from '../../js/state.js'
import {
    getCachedSemanticSearchPayload,
    storeSemanticSearchPayload,
    getSemanticSearchCacheDiagnostics,
    fetchSemanticSearchResults
} from '../../js/modules/semantic-search-api-cache.js'

describe('semantic-search-api-cache', () => {
    beforeEach(() => {
        // Reset state for test isolation
        state.semanticSearchResultCache = new Map();
        state.semanticSearchCacheDiagnostics = {
            hits: 0,
            misses: 0,
            stores: 0,
            evictions: 0,
            lastKey: null,
            lastSource: null,
            lastAgeMs: null
        };
        vi.useFakeTimers();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Cache TTL and Eviction', () => {
        it('should evict expired items after TTL', () => {
            const query = 'test query';
            const payload = { ok: true, results: [{ lead_id: "1", score: 0.9 }] };

            storeSemanticSearchPayload(query, payload);

            let cached = getCachedSemanticSearchPayload(query);
            expect(cached).not.toBeNull();
            expect(cached.client_cache_hit).toBe(true);

            // Advance time past TTL (10 minutes + 1 ms)
            vi.advanceTimersByTime(10 * 60 * 1000 + 1);

            cached = getCachedSemanticSearchPayload(query);
            expect(cached).toBeNull();
            expect(getSemanticSearchCacheDiagnostics().evictions).toBe(1);
        });

        it('should enforce capacity constraint (LRU)', () => {
            const maxEntries = 8;
            for (let i = 1; i <= maxEntries + 2; i++) {
                vi.advanceTimersByTime(10);
                storeSemanticSearchPayload(`query${i}`, { ok: true, results: [{ lead_id: String(i), score: 0.9 }] });
            }

            const diagnostics = getSemanticSearchCacheDiagnostics();
            expect(diagnostics.size).toBe(maxEntries);
            expect(diagnostics.evictions).toBe(2);

            // The first two items should be evicted
            expect(getCachedSemanticSearchPayload('query1')).toBeNull();
            expect(getCachedSemanticSearchPayload('query2')).toBeNull();
            expect(getCachedSemanticSearchPayload(`query${maxEntries + 2}`)).not.toBeNull();
        });
    });

    describe('Fetch and Retries', () => {
        it('should retry on retryable errors', async () => {
            // Mock fetch to fail twice then succeed
            let fetchAttempts = 0;
            global.fetch = vi.fn().mockImplementation(() => {
                fetchAttempts++;
                if (fetchAttempts <= 2) {
                    return Promise.reject(new Error('NetworkError when attempting to fetch resource.'));
                }
                return Promise.resolve({
                    ok: true,
                    text: () => Promise.resolve(JSON.stringify({ ok: true, results: [{ lead_id: "99", score: 0.95 }] }))
                });
            });

            // Start fetch but don't await immediately since it uses setTimeout for retries
            const fetchPromise = fetchSemanticSearchResults('test retry', null, { retryDelaysMs: [10, 10] });

            // Advance timers to trigger the retries
            await vi.advanceTimersByTimeAsync(25);

            const result = await fetchPromise;

            expect(fetchAttempts).toBe(3);
            expect(result.ok).toBe(true);
            expect(result.results[0].lead_id).toBe("99");
        });

        it('should handle AbortController correctly', async () => {
            const controller = new AbortController();

            global.fetch = vi.fn().mockImplementation(() => {
                return Promise.reject(new DOMException('Aborted', 'AbortError'));
            });

            controller.abort();
            const fetchPromise = fetchSemanticSearchResults('abort test', controller.signal);

            await expect(fetchPromise).rejects.toThrow('Aborted');
        });

        it('should return mock response for PHP fallback', async () => {
            // Mock location to allow static dev fallback
            Object.defineProperty(window, 'location', {
                value: { hostname: 'localhost', search: '' },
                writable: true
            });

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                text: () => Promise.resolve('<?php echo "Raw PHP Code"; ?>')
            });

            const result = await fetchSemanticSearchResults('php test');

            expect(result.ok).toBe(true);
            expect(result.is_mock).toBe(true);
            expect(result.dev_mode).toBe('static-php-fallback');
        });
    });
});
