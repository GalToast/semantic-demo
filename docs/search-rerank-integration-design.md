# Search: add NIM rerank step to result ranking

## Status
Proposed — design only, no implementation yet. Companion to commit 19070d7 (catalog log) and artifact reports/nvidia-capabilities/rerank-semantic-vs-geographic.md.

## Why
Today the embedding recall over-weights geographic matches; rerank corrects this. The proof shows a semantic match ("semantic explorer" + mycelium) ranked +3.998 logit ahead of a geographically-correct match (Woodlands community at -7.73), a gap of 11.7 logit units. For SE search results, a rerank step at the top of the list would surface the actual visualizer/tool description above geographic matches that the embedding recall might over-weight.

## Where to insert
Modify `_executeSearch` in `src/lib/search-engine.ts`. The rerank happens at recall-time (per query) immediately after results are obtained from the API, local index, or mock fallback, but before caching and returning. The rerank call lives in a new `src/lib/utils/rerank.ts` that performs a direct fetch to the NIM endpoint (not via MCP) to avoid indirection and simplify auth management. The rerank result shape is `{ index: number, logit: number }[]`, which must be remapped back to the original result indices to reorder the `SearchResult[]` array.

## Flag / env gate
The rerank step must be off-by-default until A/B tested. Propose:
- Add `state.searchUseRerank: boolean` to `src/lib/stores/index.svelte.ts` (or search-specific store if preferred).
- Add `?rerank=1` URL param to force-enable for QA.
- Use `localStorage.semantic_explorer_rerank_v1` lifetime flag for power users who opt in.

## Minimal code sketch
```typescript
// src/lib/utils/rerank.ts
export async function rerankResults(
  query: string,
  results: SearchResult[]
): Promise<SearchResult[]> {
  if (results.length === 0) return results;

  const passages = results.map(r => ({
    // Combine name and snippet for richest semantic signal
    text: `${r.name}. ${r.snippet}`.trim()
  }));

  const response = await fetch('https://ai.api.nvidia.com/v1/retrieval/nvidia/reranking', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${import.meta.env.VITE_NIM_API_KEY}`
    },
    body: JSON.stringify({
      model: 'nvidia/rerank-qa-mistral-4b',
      query: { text: query },
      passages,
      top_n: passages.length // rerank all
    })
  });

  if (!response.ok) {
    throw new Error(`NIM rerank failed: ${response.status}`);
  }

  const { rerank_results } = await response.json() as {
    rerank_results: { index: number; logit: number }[];
  };

  // Remap: rerank_results.index corresponds to passages index
  const rerankedResults = [...results];
  rerank_results.forEach(({ index, logit }) => {
    if (index >= 0 && index < rerankedResults.length) {
      // Optionally update score with normalized logit, or just reorder
      // Here we'll update score for simplicity; alternative is to sort by logit
      rerankedResults[index] = {
        ...rerankedResults[index],
        score: Math.min(1, (logit + 8) / 16) // rough normalization to 0-1
      };
    }
  });

  // Sort by updated score descending (or by logit directly)
  return rerankedResults.sort((a, b) => b.score - a.score);
}
```

In `_executeSearch` after obtaining `results`:
```typescript
// After results are obtained from API/local/mock, before caching:
if (get(searchStore).searchUseRerank && results.length > 0) {
  try {
    results = await rerankResults(trimmed, results);
  } catch (err) {
    console.warn('[search] Rerank failed, falling back to original order', err);
    // Continue with original results
  }
}
```

## Test plan
- Unit test: a small `tests/search-rerank-contract.mjs` that mocks the fetch and asserts the remap is correct (sorted by logit, indexes map back to business IDs, top-N preserved).
- Integration test: a manual QA script that toggles the flag and confirms the result ordering changes for the proof query.
- Cost: 0 in dev (NIM free), small in prod (still free).

## Risks
- Latency: rerank adds ~200-500ms per query. Mitigation: only rerank top-N (e.g., top 20) from the recall set, not the full set.
- Schema drift: NIM may rename or remove `nvidia/rerank-qa-mistral-4b`. Mitigation: feature flag allows instant disable.
- MCP vs direct fetch: MCP adds a layer of indirection but inherits the wrapper's auth management. Direct fetch is simpler but requires the agent-runtime key plumbing. Recommend: direct fetch in a new `src/lib/utils/rerank.ts`.

## Effort estimate
- ~3-4 hours of focused work for one engineer
- ~1 PR, ~200 lines of code (incl. tests)
- 0 dependencies added (NIM is HTTP, no SDK)

## Open questions
- Should rerank be applied only to API results (semantic recall) or also to local index/mock results?
- How to handle the NIM API key securely in production (via agent-runtime key plumbing or build-time env)?