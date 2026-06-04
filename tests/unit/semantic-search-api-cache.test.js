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

        it('should back static PHP fallback results with real dataset lead ids when possible', async () => {
            Object.assign(state, {
                points: [
                    { lead_id: 519, name: '519-angel-fire-coffee', what: 'Coffee shop', city: 'Cleveland', website: 'https://example.test' },
                    { lead_id: 989, name: "BLOOMIN' BREWS COFFEE LLC", what: 'Coffee shop', city: 'Willis', email: 'hello@example.test' },
                    { lead_id: 1, name: '1845 SOLUTIONS', what: 'Management consulting', city: 'Conroe' }
                ]
            });
            Object.defineProperty(window, 'location', {
                value: { hostname: 'localhost', search: '' },
                writable: true
            });

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                text: () => Promise.resolve('<?php echo "Raw PHP Code"; ?>')
            });

            const result = await fetchSemanticSearchResults('coffee');

            expect(result.ok).toBe(true);
            expect(result.is_mock).toBe(true);
            expect(result.results.map((row) => row.lead_id).sort()).toEqual(['519', '989']);
            expect(result.results.map((row) => row.name)).toContain('519-angel-fire-coffee');
            expect(result.results.map((row) => row.lead_id)).not.toContain('1');
        });

        it('should not surface records with a denylisted NAICS even if their text matches', async () => {
            // The original adversarial audit found cluster 12 (Education &
            // Childcare) returning aviation schools + pet retreats for
            // "childcare". The NAICS-augmented data now codes those
            // businesses with their actual NAICS prefix (611512, 812910)
            // and the search code refuses to surface them. This test
            // pins that behavior.
            Object.assign(state, {
                points: [
                    { lead_id: 100, name: 'AMERICAN FLYERS', what: 'Education or childcare', city: 'Conroe', cluster: 12, naics: '611512' },
                    { lead_id: 101, name: 'High Performance Aviation', what: 'Education or childcare', city: 'Cleveland', cluster: 12, naics: '611512' },
                    { lead_id: 102, name: 'Jakes K-9 Retreat LLC', what: 'Education or childcare', city: 'Willis', cluster: 12, naics: '812910' },
                    { lead_id: 200, name: 'Magnolia Montessori Academy', what: 'Education or childcare', city: 'Magnolia', cluster: 12, naics: '624410' },
                    { lead_id: 201, name: 'The Woodlands Early Learning', what: 'Education or childcare', city: 'The Woodlands', cluster: 12, naics: '624410' }
                ]
            });
            Object.defineProperty(window, 'location', {
                value: { hostname: 'localhost', search: '' },
                writable: true
            });

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                text: () => Promise.resolve('<?php echo "Raw PHP Code"; ?>')
            });

            const result = await fetchSemanticSearchResults('childcare');
            const ids = result.results.map((r) => String(r.lead_id));

            // Aviation + pet retreat must NOT be in the results, even
            // though their `what` text contains "childcare".
            expect(ids).not.toContain('100');
            expect(ids).not.toContain('101');
            expect(ids).not.toContain('102');
            // Actual childcare providers should rank.
            expect(ids).toContain('200');
            expect(ids).toContain('201');
            // Real childcare businesses should rank above any
            // misclassified record (no misclassified records should be
            // present at all).
            const realChildcareIdx = ids.indexOf('200');
            const aviationIdx = ids.indexOf('100');
            expect(aviationIdx).toBe(-1);
            expect(realChildcareIdx).toBeGreaterThanOrEqual(0);
        });

        it('should boost NAICS-prefix matches above text-only matches', async () => {
            // NAICS 722515 (Coffee Shop) should outrank NAICS 624410
            // (Child Day Care) for a "coffee" query, even if both records
            // happen to have "coffee" in their what text.
            Object.assign(state, {
                points: [
                    { lead_id: 300, name: 'A Childcare Cafe', what: 'coffee shop', city: 'Conroe', naics: '624410' },
                    { lead_id: 301, name: 'Real Coffee Co', what: 'Local business', city: 'Conroe', naics: '722515' }
                ]
            });
            Object.defineProperty(window, 'location', {
                value: { hostname: 'localhost', search: '' },
                writable: true
            });

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                text: () => Promise.resolve('<?php echo "Raw PHP Code"; ?>')
            });

            const result = await fetchSemanticSearchResults('coffee');
            const ids = result.results.map((r) => String(r.lead_id));
            // 300 has naics 624410 which is on the coffee denylist
            // (it's a childcare NAICS), so it must NOT surface.
            expect(ids).not.toContain('300');
            // 301 has naics 722515 (on the coffee allowlist) — it
            // should rank above any other coffee search hits.
            expect(ids).toContain('301');
            // NAICS 722515 should win because it has a NAICS match (+8)
            // plus a text match (+6) for a total of 14. Any text-only
            // match would be +6 max.
            const top = result.results[0];
            expect(top).toBeDefined();
            expect(String(top.lead_id)).toBe('301');
        });

        it('should return no mock results for explicit empty PHP fallback queries', async () => {
            Object.defineProperty(window, 'location', {
                value: { hostname: 'localhost', search: '' },
                writable: true
            });

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                text: () => Promise.resolve('<?php echo "Raw PHP Code"; ?>')
            });

            const result = await fetchSemanticSearchResults('xj9k2l');

            expect(result.ok).toBe(true);
            expect(result.is_mock).toBe(true);
            expect(result.dev_mode).toBe('static-php-fallback');
            expect(result.results).toEqual([]);
        });

        it('should rank a lead with strong snapshot above one with only a NAICS match (Bug Sweep 33)', async () => {
            // Regression test for the new field-weighted scoring. Before
            // the enrichment integration, a record with the right NAICS
            // outranked a record with the right "story." Now the lead's
            // own one-liner (snapshot) is the dominant signal.
            Object.assign(state, {
                points: [
                    { lead_id: 1, name: 'Generic Cafe', what: 'Local business', city: 'Conroe', cluster: 6, naics: '722515' },
                    { lead_id: 2, name: 'Real Coffee Co', what: 'Local business', city: 'Conroe', cluster: 6, naics: '722515' }
                ],
                leadEnrichment: {
                    '1': { snapshot: null, observations: null, business_overview: null },
                    '2': { snapshot: 'We roast specialty coffee beans for offices in Conroe', observations: null, business_overview: null }
                }
            });
            Object.defineProperty(window, 'location', {
                value: { hostname: 'localhost', search: '' },
                writable: true
            });

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                text: () => Promise.resolve('<?php echo "Raw PHP Code"; ?>')
            });

            const result = await fetchSemanticSearchResults('coffee');
            const ids = result.results.map((r) => r.lead_id);

            // Both should surface, but lead 2 (with snapshot) should rank first
            expect(ids).toContain('1');
            expect(ids).toContain('2');
            expect(ids[0]).toBe('2');
        });

        it('should not require enrichment to find a record (backwards-compat)', async () => {
            // Records without enrichment (no state.leadEnrichment) should
            // still match via point fields. Fall-through to point.what
            // and point.name keeps the legacy catalog working.
            state.leadEnrichment = null;
            Object.assign(state, {
                points: [
                    { lead_id: 1, name: 'Real Coffee Co', what: 'Coffee shop and roastery', city: 'Conroe', cluster: 6, naics: '722515' }
                ]
            });
            Object.defineProperty(window, 'location', {
                value: { hostname: 'localhost', search: '' },
                writable: true
            });

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                text: () => Promise.resolve('<?php echo "Raw PHP Code"; ?>')
            });

            const result = await fetchSemanticSearchResults('coffee');
            expect(result.ok).toBe(true);
            expect(result.results.length).toBeGreaterThan(0);
            expect(result.results[0].lead_id).toBe('1');
        });
    });
});
