/**
 * search-rerank.test.ts — Unit tests for NIM rerank integration
 *
 * Covers:
 *  - Remapping correctness (reranked order, ID preservation, score normalization)
 *  - Graceful fallback on fetch failure (network, non-OK, timeout)
 *  - Empty results passthrough
 *  - NIM request schema correctness (query/passages as dicts)
 *  - Remaining results appended in original order
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rerankResults } from '../../src/lib/utils/rerank';
import type { SearchResult } from '../../src/lib/types/state';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeResult(id: string, name: string, snippet: string, score = 0.5): SearchResult {
  return { id, name, index: 0, score, category: 'Test', snippet };
}

function makeRankings(indices: number[], logits: number[]): { index: number; logit: number }[] {
  return indices.map((index, i) => ({ index, logit: logits[i] }));
}

// ── Mock global fetch ────────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;
const fetchSpy = vi.fn();

function mockFetchSuccess(rankings: { index: number; logit: number }[]): void {
  fetchSpy.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ rankings }),
  });
}

function mockFetchFailure(status: number, statusText = 'Error'): void {
  fetchSpy.mockResolvedValue({
    ok: false,
    status,
    statusText,
    json: async () => ({ error: statusText }),
  });
}

function mockFetchNetworkError(): void {
  fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
}

function mockFetchTimeout(): void {
  fetchSpy.mockImplementation(() => {
    return new Promise((_resolve, reject) => {
      setTimeout(() => {
        const err = new DOMException('The operation was aborted.', 'AbortError');
        reject(err);
      }, 50);
    });
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('rerankResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('VITE_NIM_API_KEY', 'test-api-key-12345');
    globalThis.fetch = fetchSpy;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('returns [] when results is empty', async () => {
    const result = await rerankResults('test', []);
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('remaps results correctly from NIM rankings', async () => {
    const results = [
      makeResult('a', 'Business A', 'Snippet A', 0.5),
      makeResult('b', 'Business B', 'Snippet B', 0.5),
      makeResult('c', 'Business C', 'Snippet C', 0.5),
    ];

    // NIM says: index 2 (c) is best (logit 3.998), index 0 (a) second (logit -7.73), index 1 (b) worst
    mockFetchSuccess(makeRankings([2, 0, 1], [3.998, -7.73, -14.9]));

    const reranked = await rerankResults('test query', results);

    expect(reranked).toHaveLength(3);
    expect(reranked[0].id).toBe('c');
    expect(reranked[1].id).toBe('a');
    expect(reranked[2].id).toBe('b');
  });

  it('normalizes scores to [0, 1] range', async () => {
    const results = [
      makeResult('a', 'A', 'A snippet'),
      makeResult('b', 'B', 'B snippet'),
    ];

    mockFetchSuccess(makeRankings([0, 1], [3.998, -7.73]));

    const reranked = await rerankResults('test', results);

    for (const r of reranked) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
    // logit 3.998 → (3.998 + 8) / 16 ≈ 0.75
    expect(reranked[0].score).toBeCloseTo(0.7499, 3);
    // logit -7.73 → (-7.73 + 8) / 16 ≈ 0.0169
    expect(reranked[1].score).toBeCloseTo(0.0169, 3);
  });

  it('preserves all SearchResult fields through remap', async () => {
    const results = [
      makeResult('id-42', 'Specific Business', 'Very specific snippet', 0.8),
      makeResult('id-99', 'Other Business', 'Other snippet', 0.2),
    ];

    // NIM says index 1 (id-99) is best with logit 4, index 0 (id-42) worst with logit -2
    mockFetchSuccess(makeRankings([1, 0], [4, -2]));

    const reranked = await rerankResults('test', results);

    expect(reranked[0].id).toBe('id-99');
    expect(reranked[0].name).toBe('Other Business');
    expect(reranked[0].snippet).toBe('Other snippet');
    expect(reranked[0].category).toBe('Test');

    expect(reranked[1].id).toBe('id-42');
    expect(reranked[1].name).toBe('Specific Business');
  });

  it('appends remaining results (beyond topN) in original order', async () => {
    const results = [
      makeResult('a', 'A', 'A', 0.5),
      makeResult('b', 'B', 'B', 0.5),
      makeResult('c', 'C', 'C', 0.5),
      makeResult('d', 'D', 'D', 0.5),
      makeResult('e', 'E', 'E', 0.5),
    ];

    // topN=3 → only a,b,c sent to NIM; d,e appended in original order
    mockFetchSuccess(makeRankings([2, 0, 1], [5, 3, 1]));

    const reranked = await rerankResults('test', results, { topN: 3 });

    expect(reranked).toHaveLength(5);
    expect(reranked[0].id).toBe('c');
    expect(reranked[1].id).toBe('a');
    expect(reranked[2].id).toBe('b');
    expect(reranked[3].id).toBe('d');
    expect(reranked[4].id).toBe('e');
  });

  it('defaults topN to min(results.length, 20)', async () => {
    const results = Array.from({ length: 5 }, (_, i) =>
      makeResult(`r${i}`, `Biz ${i}`, `Snippet ${i}`)
    );

    mockFetchSuccess(makeRankings([0, 1, 2, 3, 4], [1, 2, 3, 4, 5]));

    await rerankResults('test', results);

    const call = fetchSpy.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.passages).toHaveLength(5);
    expect(body.top_n).toBe(5);
  });

  it('falls back to original results on fetch network error', async () => {
    const results = [
      makeResult('a', 'A', 'A'),
      makeResult('b', 'B', 'B'),
    ];

    mockFetchNetworkError();

    const reranked = await rerankResults('test', results);

    expect(reranked).toHaveLength(2);
    expect(reranked[0].id).toBe('a');
    expect(reranked[1].id).toBe('b');
    expect(reranked[0].score).toBe(0.5);
    expect(reranked[1].score).toBe(0.5);
  });

  it('falls back to original results on non-OK response', async () => {
    const results = [
      makeResult('a', 'A', 'A'),
      makeResult('b', 'B', 'B'),
    ];

    mockFetchFailure(404, 'Not Found');

    const reranked = await rerankResults('test', results);

    expect(reranked).toHaveLength(2);
    expect(reranked[0].id).toBe('a');
    expect(reranked[1].id).toBe('b');
  });

  it('falls back to original results on timeout (AbortError)', async () => {
    const results = [
      makeResult('a', 'A', 'A'),
      makeResult('b', 'B', 'B'),
    ];

    mockFetchTimeout();

    const reranked = await rerankResults('test', results, { timeoutMs: 50 });

    expect(reranked).toHaveLength(2);
    expect(reranked[0].id).toBe('a');
    expect(reranked[1].id).toBe('b');
  });

  it('sends correct NIM request schema (query and passages as dicts)', async () => {
    const results = [
      makeResult('a', 'Business A', 'Snippet A'),
      makeResult('b', 'Business B', 'Snippet B'),
    ];

    mockFetchSuccess(makeRankings([0, 1], [1, 0]));

    await rerankResults('my test query', results);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const call = fetchSpy.mock.calls[0];

    expect(call[0]).toBe('https://ai.api.nvidia.com/v1/retrieval/nvidia/reranking');

    const headers = call[1].headers;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Accept']).toBe('application/json');
    expect(headers['Authorization']).toMatch(/^Bearer /);

    const body = JSON.parse(call[1].body);
    expect(body.model).toBe('nvidia/rerank-qa-mistral-4b');

    // CRITICAL: query must be a dict, not a string
    expect(body.query).toEqual({ text: 'my test query' });
    expect(typeof body.query).toBe('object');

    // CRITICAL: passages must be dicts, not strings
    expect(Array.isArray(body.passages)).toBe(true);
    expect(body.passages).toHaveLength(2);
    expect(body.passages[0]).toEqual({ text: 'Business A. Snippet A' });
    expect(body.passages[1]).toEqual({ text: 'Business B. Snippet B' });
    expect(typeof body.passages[0]).toBe('object');
    expect(typeof body.passages[1]).toBe('object');
  });

  it('handles NIM returning fewer rankings than passages', async () => {
    const results = [
      makeResult('a', 'A', 'A'),
      makeResult('b', 'B', 'B'),
      makeResult('c', 'C', 'C'),
    ];

    mockFetchSuccess(makeRankings([2, 0], [5, 3]));

    const reranked = await rerankResults('test', results);

    expect(reranked).toHaveLength(3);
    expect(reranked[0].id).toBe('c');
    expect(reranked[1].id).toBe('a');
    expect(reranked[2].id).toBe('b');
  });

  it('preserves snippet and category through remap', async () => {
    const results = [
      makeResult('x', 'Unique Name', 'Unique Snippet'),
    ];

    mockFetchSuccess(makeRankings([0], [2]));

    const reranked = await rerankResults('test', results);

    expect(reranked[0].name).toBe('Unique Name');
    expect(reranked[0].snippet).toBe('Unique Snippet');
    expect(reranked[0].category).toBe('Test');
  });

  it('uses custom topN when provided', async () => {
    const results = Array.from({ length: 10 }, (_, i) =>
      makeResult(`r${i}`, `Biz ${i}`, `Snippet ${i}`)
    );

    mockFetchSuccess(makeRankings([0, 1], [5, 3]));

    await rerankResults('test', results, { topN: 2 });

    const call = fetchSpy.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.passages).toHaveLength(2);
    expect(body.top_n).toBe(2);
  });
});
