/**
 * @lib/utils/rerank.ts — NIM rerank integration for search results
 *
 * Re-ranks the top-N results via NVIDIA NIM's reranking endpoint. The rerank
 * step is a nice-to-have post-processing pass: on any failure (network,
 * 4xx, 5xx, timeout) the original results are returned unchanged.
 *
 * NIM schema gotchas (per docs/nvidia-cool-shit-catalog.md):
 *  - `query` and `passages` MUST be dicts/objects (`{"text": "..."}`), not
 *    plain strings — plain strings trigger a 422.
 *  - The model name is `nvidia/rerank-qa-mistral-4b` (the MCP default
 *    `nvidia/llama-nemotron-rerank-1b-v2` returns 404).
 *  - The response field is `rankings` (not `rerank_results`).
 */
import type { SearchResult } from '@lib/types/state';
import { debugWarn } from '@lib/utils/diagnostic-adapter';

// ── Types ────────────────────────────────────────────────────────────────────

interface RerankOptions {
  /** Only send the top-N results to NIM (default: min(results.length, 20)). */
  topN?: number;
  /** Fetch timeout in ms (default: 3000). */
  timeoutMs?: number;
}

interface NIMRanking {
  index: number;
  logit: number;
}

interface NIMResponse {
  rankings?: NIMRanking[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const NIM_ENDPOINT = 'https://ai.api.nvidia.com/v1/retrieval/nvidia/reranking';
const NIM_MODEL = 'nvidia/rerank-qa-mistral-4b';
const DEFAULT_TOP_N = 20;
const DEFAULT_TIMEOUT_MS = 3000;

/**
 * Normalize a NIM logit to a 0-1 score.
 *
 * Per the proof doc, logits range roughly from -15 to +4. The mapping:
 *   logit -8 → 0, logit +8 → 1, clamped to [0, 1].
 */
function normalizeLogit(logit: number): number {
  return Math.min(1, Math.max(0, (logit + 8) / 16));
}

/**
 * Build the passage text from a SearchResult.
 * Combines name + snippet for the richest semantic signal.
 */
function passageText(r: SearchResult): string {
  return `${r.name}. ${r.snippet}`.trim();
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Re-rank search results via NVIDIA NIM reranking.
 *
 * Sends the top-N results to NIM for reranking, then remaps the ranked
 * indices back to the original SearchResult array. Results beyond topN
 * are appended in their original order.
 *
 * On any failure, returns the original results unchanged (graceful fallback).
 *
 * @param query    The original search query string.
 * @param results  The ranked results to re-rank.
 * @param options  Optional topN and timeoutMs overrides.
 * @returns The re-ranked results, or the original results on failure.
 */
export async function rerankResults(
  query: string,
  results: SearchResult[],
  options?: RerankOptions
): Promise<SearchResult[]> {
  if (results.length === 0) return results;

  const topN = Math.min(
    results.length,
    options?.topN ?? DEFAULT_TOP_N
  );
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Slice the top-N for NIM; the rest keep original order.
  const topResults = results.slice(0, topN);
  const remainingResults = results.slice(topN);

  // Build passages array — each entry is an object with `text` key.
  const passages = topResults.map((r) => ({ text: passageText(r) }));

  // Build request body — query and passages are dicts, NOT plain strings.
  const body = {
    model: NIM_MODEL,
    query: { text: query },
    passages,
    top_n: topN,
  };

  // Fetch with timeout via AbortController.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const apiKey = getNimApiKey();
    const response = await fetch(NIM_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const statusText = response.statusText || response.status;
      debugWarn(`[rerank] NIM returned ${statusText}, falling back to original order`);
      return results;
    }

    const data = (await response.json()) as NIMResponse;
    const rankings = data.rankings;

    if (!Array.isArray(rankings) || rankings.length === 0) {
      debugWarn('[rerank] NIM returned empty rankings, falling back to original order');
      return results;
    }

    // Build the reranked subset: sort by logit descending, normalize scores.
    const rerankedSubset = rankings
      .filter((r) => r.index >= 0 && r.index < topResults.length)
      .sort((a, b) => b.logit - a.logit)
      .map((r): SearchResult | null => {
        const result = topResults[r.index];
        if (!result) return null;
        return {
          ...result,
          score: normalizeLogit(r.logit),
        };
      })
      .filter((r): r is SearchResult => r !== null);

    // If NIM returned fewer rankings than topN, append the unranked ones
    // at the end of the reranked subset (in their original relative order).
    const rerankedIds = new Set(rerankedSubset.map((r) => r.id));
    const unrankedTopResults = topResults.filter((r) => !rerankedIds.has(r.id));
    const mergedTop = [...rerankedSubset, ...unrankedTopResults];

    // Final result: reranked top + remaining (beyond topN) in original order.
    return [...mergedTop, ...remainingResults];
  } catch (err) {
    // AbortError from timeout, network error, JSON parse error — all fall back.
    const msg = err instanceof Error ? err.message : String(err);
    debugWarn(`[rerank] NIM call failed (${msg}), falling back to original order`);
    return results;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Internal: API Key ────────────────────────────────────────────────────────

/**
 * Read the NIM API key from the Vite environment.
 * Returns empty string if not configured — the fetch will fail with 401
 * and the caller falls back gracefully.
 */
function getNimApiKey(): string {
  try {
    return (
      (import.meta as unknown as { env?: Record<string, string> })?.env
        ?.VITE_NIM_API_KEY ?? ''
    );
  } catch {
    return '';
  }
}
