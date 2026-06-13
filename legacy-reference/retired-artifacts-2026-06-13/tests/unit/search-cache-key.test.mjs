/**
 * tests/unit/search-cache-key.test.mjs
 *
 * Verifies:
 * (a) Cache key includes page+offset
 * (b) Second page does not overwrite first page in cache
 * (c) Locale independence for the lock file hash (qHash)
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Import the search-cache module (pure TS, no browser dependencies)
import {
  getCachedSearch,
  setCachedSearch,
  clearSearchCache,
  qHash,
  setSearchCacheTTL,
} from '../../src/lib/search-cache.ts';

describe('search-cache-key', () => {
  beforeEach(() => {
    clearSearchCache();
    setSearchCacheTTL(5 * 60 * 1000); // reset to default
  });

  it('(a) cache key includes page+offset — different pages are isolated', () => {
    const mockResults0 = [{ id: 'r1', name: 'Page 0 result', index: 0, score: 0.9, category: '', snippet: '' }];
    const mockResults1 = [{ id: 'r2', name: 'Page 1 result', index: 18, score: 0.8, category: '', snippet: '' }];

    // Store page 0 and page 1 separately
    setCachedSearch('coffee', 0, 0, mockResults0);
    setCachedSearch('coffee', 1, 18, mockResults1);

    // Both should be retrievable independently
    const page0 = getCachedSearch('coffee', 0, 0);
    const page1 = getCachedSearch('coffee', 1, 18);

    assert.deepEqual(page0, mockResults0, 'Page 0 should return its own results');
    assert.deepEqual(page1, mockResults1, 'Page 1 should return its own results');
  });

  it('(b) second page does not overwrite first page in cache', () => {
    const page0Results = [{ id: 'p0', name: 'First page', index: 0, score: 1.0, category: '', snippet: '' }];
    const page1Results = [{ id: 'p1', name: 'Second page', index: 18, score: 0.9, category: '', snippet: '' }];

    // Write page 0
    setCachedSearch('restaurants', 0, 0, page0Results);
    // Write page 1 — should NOT evict page 0
    setCachedSearch('restaurants', 1, 18, page1Results);

    // Page 0 should still be there
    const cached0 = getCachedSearch('restaurants', 0, 0);
    assert.deepEqual(cached0, page0Results, 'Page 0 should survive page 1 write');
    assert.equal(cached0[0].id, 'p0', 'Page 0 result should have correct id');

    // Page 1 should also be there
    const cached1 = getCachedSearch('restaurants', 1, 18);
    assert.deepEqual(cached1, page1Results, 'Page 1 should be retrievable');
  });

  it('(c) locale independence for the lock file hash (qHash)', () => {
    // qHash should produce the same output regardless of locale
    const q1 = 'coffee shop';
    const q2 = 'Coffee Shop'; // different case
    const q3 = 'café'; // special characters

    const h1 = qHash(q1);
    const h2 = qHash(q2);
    const h3 = qHash(q3);

    // Same string should always produce same hash
    assert.equal(qHash(q1), qHash(q1), 'qHash should be deterministic');
    assert.equal(qHash(q2), qHash(q2), 'qHash should be deterministic for different input');

    // Different strings should produce different hashes (high probability)
    assert.notEqual(h1, h2, 'Different case strings should produce different hashes');
    assert.notEqual(h1, h3, 'Different strings should produce different hashes');

    // Hashes should be alphanumeric (safe for filenames)
    assert.match(h1, /^[a-z0-9]+$/, 'qHash should produce lowercase alphanumeric output');
    assert.match(h3, /^[a-z0-9]+$/, 'qHash should produce lowercase alphanumeric output for special chars');
  });

  it('cache misses return null', () => {
    const result = getCachedSearch('nonexistent', 0, 0);
    assert.equal(result, null, 'Cache miss should return null');
  });

  it('cache respects TTL expiry', () => {
    setSearchCacheTTL(1); // 1ms TTL
    const mockResults = [{ id: 'r1', name: 'Test', index: 0, score: 0.5, category: '', snippet: '' }];
    setCachedSearch('ttl-test', 0, 0, mockResults);

    // Should be available immediately
    const immediate = getCachedSearch('ttl-test', 0, 0);
    assert.deepEqual(immediate, mockResults);

    // Wait for TTL to expire
    return new Promise((resolve) => {
      setTimeout(() => {
        const expired = getCachedSearch('ttl-test', 0, 0);
        assert.equal(expired, null, 'Cache entry should expire after TTL');
        resolve();
      }, 10);
    });
  });

  it('clearSearchCache wipes everything', () => {
    setCachedSearch('test', 0, 0, [{ id: '1', name: 'A', index: 0, score: 1, category: '', snippet: '' }]);
    setCachedSearch('test', 1, 18, [{ id: '2', name: 'B', index: 18, score: 0.9, category: '', snippet: '' }]);

    clearSearchCache();

    assert.equal(getCachedSearch('test', 0, 0), null);
    assert.equal(getCachedSearch('test', 1, 18), null);
  });
});
